import { createFsReadStream } from '@hermes-serverless/fs-utils'
import execa from 'execa'
import { Request } from 'express'
import fs from 'fs'
import os from 'os'
import path from 'path'
import FormDataParser from '../..'
import { FieldnameSizeExceeded, FileSizeLimit, ParsingErrors, TruncatedField } from '../../errors'
import { FileInfo } from '../../handlers/PersistHandler'
import { Logger } from '../../utils/Logger'
import { fixture, getFormData, MB } from './util'

Logger.enabled = false
const tmpPath = path.join(os.tmpdir(), 'input-parser-partstopersist-tests')

beforeEach(() => {
  if (!fs.existsSync(tmpPath)) fs.mkdirSync(tmpPath, { recursive: true })
})

afterEach(() => {
  execa.sync('rm', ['-rf', tmpPath])
})

const checkUploadedFile = (fileInfo: FileInfo, expectedName: string, expectedContent: string) => {
  expect(fileInfo.name).toBe(expectedName)
  expect(fileInfo.size).toBe(expectedContent.length)
  expect(fileInfo.filePath.startsWith(tmpPath)).toBe(true)
  expect(fs.readFileSync(fileInfo.filePath, { encoding: 'utf-8' })).toBe(expectedContent)
}

describe('PartsToPersist work as expected', () => {
  test('Nothing to persist work', async () => {
    const fd = getFormData()
    fd.append('field1', '.'.repeat(1000000))
    const p = new FormDataParser((fd as unknown) as Request, tmpPath)

    p.start()
    const [fieldPairs, uploadedFiles, realTimeStream] = await Promise.all([
      p.fieldsPromise,
      p.filesPromise,
      p.realTimeStreamPromise,
    ])

    await expect(p.donePromise).resolves.toBe(undefined)
    expect(realTimeStream).toEqual([])
    expect(fieldPairs).toEqual([])
    expect(uploadedFiles).toEqual([])
    expect(fs.readdirSync(tmpPath).length).toBe(0)
  })

  test('Fieldname with empty string work', async () => {
    const fd = getFormData()
    fd.append('', '.'.repeat(1024))
    const p = new FormDataParser((fd as unknown) as Request, tmpPath, {
      partsToPersist: [''],
    })

    p.start()
    const [fieldPairs, uploadedFiles, realTimeStream] = await Promise.all([
      p.fieldsPromise,
      p.filesPromise,
      p.realTimeStreamPromise,
    ])

    await expect(p.donePromise).resolves.toBe(undefined)
    expect(realTimeStream).toEqual([])
    expect(fieldPairs).toEqual([])
    expect(uploadedFiles.length).toBe(1)

    checkUploadedFile(uploadedFiles[0], '', '.'.repeat(1024))
    expect(fs.readdirSync(tmpPath).length).toBe(1)
  })

  test('Fields are persisted', async () => {
    const fd = getFormData()
    fd.append('field1', '.'.repeat(1024))
    fd.append('field2', '+'.repeat(2 * MB))
    fd.append('file1', await createFsReadStream(fixture('1000')))
    const p = new FormDataParser((fd as unknown) as Request, tmpPath, {
      partsToPersist: ['field1'],
    })

    p.start()
    const [fieldPairs, uploadedFiles, realTimeStream] = await Promise.all([
      p.fieldsPromise,
      p.filesPromise,
      p.realTimeStreamPromise,
    ])
    await expect(p.donePromise).resolves.toBe(undefined)

    expect(realTimeStream).toEqual([])
    expect(fieldPairs).toEqual([])
    expect(uploadedFiles.length).toBe(1)
    checkUploadedFile(uploadedFiles[0], 'field1', '.'.repeat(1024))
    expect(fs.readdirSync(tmpPath).length).toBe(1)
  })

  test('Files are persisted', async () => {
    const fd = getFormData()
    fd.append('file1', await createFsReadStream(fixture('1000')))
    fd.append('file2', await createFsReadStream(fixture('2000')))
    fd.append('field1', '+'.repeat(2 * MB))
    const p = new FormDataParser((fd as unknown) as Request, tmpPath, {
      partsToPersist: ['file1'],
    })

    p.start()
    const [fieldPairs, uploadedFiles, realTimeStream] = await Promise.all([
      p.fieldsPromise,
      p.filesPromise,
      p.realTimeStreamPromise,
    ])
    await expect(p.donePromise).resolves.toBe(undefined)

    expect(realTimeStream).toEqual([])
    expect(fieldPairs).toEqual([])
    expect(uploadedFiles.length).toBe(1)

    checkUploadedFile(uploadedFiles[0], 'file1', '.'.repeat(1000))
    expect(fs.readdirSync(tmpPath).length).toBe(1)
  })

  test('Files and fields are persisted', async () => {
    const fd = getFormData()
    fd.append('file2', await createFsReadStream(fixture('2000')))
    fd.append('file1', await createFsReadStream(fixture('1000')))
    fd.append('field1', '.'.repeat(1024))
    fd.append('field2', '+'.repeat(2 * MB))

    const p = new FormDataParser((fd as unknown) as Request, tmpPath, {
      partsToPersist: ['file1', 'field1'],
    })

    p.start()
    const [fieldPairs, uploadedFiles, realTimeStream] = await Promise.all([
      p.fieldsPromise,
      p.filesPromise,
      p.realTimeStreamPromise,
    ])
    await expect(p.donePromise).resolves.toBe(undefined)

    expect(realTimeStream).toEqual([])
    expect(fieldPairs).toEqual([])
    expect(uploadedFiles.length).toBe(2)

    checkUploadedFile(uploadedFiles.find(el => el.name === 'file1'), 'file1', '.'.repeat(1000))
    checkUploadedFile(uploadedFiles.find(el => el.name === 'field1'), 'field1', '.'.repeat(1024))
    expect(fs.readdirSync(tmpPath).length).toBe(2)
  })
})

describe('PartsToPersist and FieldsToReturn work together as expected', () => {
  test('One of each independent', async () => {
    const fd = getFormData()
    fd.append('field1', '.'.repeat(1000))
    fd.append('file1', await createFsReadStream(fixture('1000')))
    const p = new FormDataParser((fd as unknown) as Request, tmpPath, {
      fieldsToReturn: ['field1'],
      partsToPersist: ['file1'],
    })

    p.start()
    const [fieldPairs, uploadedFiles, realTimeStream] = await Promise.all([
      p.fieldsPromise,
      p.filesPromise,
      p.realTimeStreamPromise,
    ])
    await expect(p.donePromise).resolves.toBe(undefined)

    expect(realTimeStream).toEqual([])
    expect(fieldPairs).toEqual([{ field1: '.'.repeat(1000) }])
    expect(uploadedFiles.length).toBe(1)

    checkUploadedFile(uploadedFiles[0], 'file1', '.'.repeat(1000))
    expect(fs.readdirSync(tmpPath).length).toBe(1)
  })

  test('One that should be persisted and returned', async () => {
    const fd = getFormData()
    fd.append('field1', '.'.repeat(1000))
    const p = new FormDataParser((fd as unknown) as Request, tmpPath, {
      fieldsToReturn: ['field1'],
      partsToPersist: ['field1'],
    })

    p.start()
    const [fieldPairs, uploadedFiles, realTimeStream] = await Promise.all([
      p.fieldsPromise,
      p.filesPromise,
      p.realTimeStreamPromise,
    ])
    await expect(p.donePromise).resolves.toBe(undefined)

    expect(realTimeStream).toEqual([])
    expect(fieldPairs).toEqual([{ field1: '.'.repeat(1000) }])
    expect(uploadedFiles.length).toBe(1)

    checkUploadedFile(uploadedFiles[0], 'field1', '.'.repeat(1000))
    expect(fs.readdirSync(tmpPath).length).toBe(1)
  })

  test('One that should be persisted and returned and One of each independent', async () => {
    const fd = getFormData()
    fd.append('field1', '.'.repeat(1000))
    fd.append('field2', '+'.repeat(1000))
    fd.append('file2', await createFsReadStream(fixture('2000')))
    fd.append('file1', await createFsReadStream(fixture('3000')))
    const p = new FormDataParser((fd as unknown) as Request, tmpPath, {
      fieldsToReturn: ['field1', 'field2'],
      partsToPersist: ['field1', 'file1'],
    })

    p.start()
    const [fieldPairs, uploadedFiles, realTimeStream] = await Promise.all([
      p.fieldsPromise,
      p.filesPromise,
      p.realTimeStreamPromise,
    ])
    await expect(p.donePromise).resolves.toBe(undefined)

    expect(realTimeStream).toEqual([])
    expect(fieldPairs).toEqual([{ field1: '.'.repeat(1000) }, { field2: '+'.repeat(1000) }])
    expect(uploadedFiles.length).toBe(2)

    checkUploadedFile(uploadedFiles.find(el => el.name === 'file1'), 'file1', '-'.repeat(3000))
    checkUploadedFile(uploadedFiles.find(el => el.name === 'field1'), 'field1', '.'.repeat(1000))
    expect(fs.readdirSync(tmpPath).length).toBe(2)
  })
})

describe('Errors', () => {
  test('File that will persist size limit should throw', async done => {
    const fd = getFormData()
    fd.append('field1', '.'.repeat(1000))
    fd.append('field2', '.'.repeat(1000))
    fd.append('1000', await createFsReadStream(fixture('1000')))
    fd.append('file1', await createFsReadStream(fixture('1000')))
    const p = new FormDataParser((fd as unknown) as Request, tmpPath, {
      limits: { fileSize: 999 },
      partsToPersist: ['1000', 'file1'],
    })

    p.start()
    try {
      await p.donePromise
    } catch (err) {
      expect(err).toBeInstanceOf(ParsingErrors)
      expect(err._persistError).toBeInstanceOf(FileSizeLimit)
      expect(err.errors.length).toBeGreaterThanOrEqual(1)
      err.errors.forEach((el: Error) => expect(el).toBe(err._persistError))
      done()
    }
  })

  test('Field size limit that will persist should throw', async done => {
    const fd = getFormData()
    fd.append('field1', '.'.repeat(1025))
    fd.append('field2', '.'.repeat(1000))
    fd.append('1000', await createFsReadStream(fixture('1000')))
    fd.append('file1', await createFsReadStream(fixture('1000')))
    const p = new FormDataParser((fd as unknown) as Request, tmpPath, {
      limits: { fieldSize: 1024 },
      partsToPersist: ['field1', 'field2'],
    })
    p.start()
    try {
      await p.donePromise
    } catch (err) {
      expect(err).toBeInstanceOf(ParsingErrors)
      expect(err._persistError).toBeInstanceOf(TruncatedField)
      expect(err._persistError.message).toEqual(expect.stringContaining('field1'))
      expect(err.errors.length).toBeGreaterThanOrEqual(1)
      err.errors.forEach((el: Error) => expect(el).toBe(err._persistError))
      done()
    }
  })

  test('File Fieldname limit that will persist should throw', async done => {
    const fd = getFormData()
    fd.append('field1', '.'.repeat(1025))
    fd.append('field2', '.'.repeat(1000))
    fd.append('.'.repeat(11), await createFsReadStream(fixture('1000')))
    fd.append('file1', await createFsReadStream(fixture('1000')))
    const p = new FormDataParser((fd as unknown) as Request, tmpPath, {
      limits: { fieldNameSize: 10 },
      partsToPersist: ['file1', '.'.repeat(11)],
    })
    p.start()
    try {
      await p.donePromise
    } catch (err) {
      expect(err).toBeInstanceOf(ParsingErrors)
      expect(err._persistError).toBeInstanceOf(FieldnameSizeExceeded)
      expect(err._persistError.message).toEqual(expect.stringContaining('10'))
      expect(err.errors.length).toBeGreaterThanOrEqual(1)
      err.errors.forEach((el: Error) => expect(el).toBe(err._persistError))
      done()
    }
  })

  test('Field Fieldname limit that will persist should throw', async done => {
    const fd = getFormData()
    fd.append('.'.repeat(11), '.'.repeat(1000))
    fd.append('field2', '.'.repeat(1000))
    fd.append('1000', await createFsReadStream(fixture('1000')))
    fd.append('file1', await createFsReadStream(fixture('1000')))
    const p = new FormDataParser((fd as unknown) as Request, tmpPath, {
      limits: { fieldNameSize: 10 },
      partsToPersist: ['file1', '.'.repeat(11)],
    })

    p.start()
    try {
      await p.donePromise
    } catch (err) {
      expect(err).toBeInstanceOf(ParsingErrors)
      expect(err._persistError).toBeInstanceOf(FieldnameSizeExceeded)
      expect(err._persistError.message).toEqual(expect.stringContaining('10'))
      expect(err.errors.length).toBeGreaterThanOrEqual(1)
      err.errors.forEach((el: Error) => expect(el).toBe(err._persistError))
      done()
    }
  })
})
