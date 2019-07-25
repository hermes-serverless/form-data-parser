import { createFsReadStream } from '@hermes-serverless/fs-utils'
import execa from 'execa'
import { Request } from 'express'
import fs from 'fs'
import os from 'os'
import path from 'path'
import FormDataParser from '../..'
import { FieldnameSizeExceeded, MissingRequestedFormEntries, ParsingErrors, TruncatedField } from '../../errors'
import { Logger } from '../../utils/Logger'
import { fixture, getFormData, MB } from './util'

Logger.enabled = false

const tmpPath = path.join(os.tmpdir(), 'form-data-parser-fieldstoreturn-tests')

beforeEach(() => {
  if (!fs.existsSync(tmpPath)) fs.mkdirSync(tmpPath, { recursive: true })
})

afterEach(() => {
  execa.sync('rm', ['-rf', tmpPath])
})

describe('FieldsToReturn work as expected', () => {
  test('Field with empty name works', async () => {
    const fd = getFormData()
    fd.append('', '.'.repeat(1024))
    const p = new FormDataParser((fd as unknown) as Request, tmpPath, {
      fieldsToReturn: [''],
    })

    p.start()
    const [fieldPairs, uploadedFiles, realTimeStream] = await Promise.all([
      p.fieldsPromise,
      p.filesPromise,
      p.realTimeStreamPromise,
    ])

    await expect(p.donePromise).resolves.toBe(undefined)
    expect(fieldPairs).toEqual([{ ['']: '.'.repeat(1024) }])
    expect(uploadedFiles.length).toBe(0)
    expect(realTimeStream.length).toBe(0)
    expect(fs.readdirSync(tmpPath).length).toBe(0)
  })

  test('One field work', async () => {
    const fd = getFormData()
    fd.append('field1', '.'.repeat(1024))
    fd.append('file1', await createFsReadStream(fixture('1000')))
    const p = new FormDataParser((fd as unknown) as Request, tmpPath, {
      fieldsToReturn: ['field1'],
    })

    p.start()
    const [fieldPairs, uploadedFiles, realTimeStream] = await Promise.all([
      p.fieldsPromise,
      p.filesPromise,
      p.realTimeStreamPromise,
    ])
    await expect(p.donePromise).resolves.toBe(undefined)

    expect(realTimeStream.length).toBe(0)
    expect(uploadedFiles.length).toBe(0)
    expect(fieldPairs).toStrictEqual([{ ['field1']: '.'.repeat(1024) }])
    expect(fs.readdirSync(tmpPath).length).toBe(0)
  })

  test('Two fields work', async () => {
    const fd = getFormData()
    fd.append('field1', '.'.repeat(1000))
    fd.append('field2', '-'.repeat(2 * MB))
    fd.append('field3', '+'.repeat(500))
    fd.append('file1', await createFsReadStream(fixture('1000')))
    const p = new FormDataParser((fd as unknown) as Request, tmpPath, {
      fieldsToReturn: ['field1', 'field3'],
    })

    p.start()
    const [fieldPairs, uploadedFiles, realTimeStream] = await Promise.all([
      p.fieldsPromise,
      p.filesPromise,
      p.realTimeStreamPromise,
    ])
    await expect(p.donePromise).resolves.toBe(undefined)

    expect(realTimeStream.length).toBe(0)
    expect(uploadedFiles.length).toBe(0)
    expect(fieldPairs).toEqual(expect.arrayContaining([{ field1: '.'.repeat(1000) }, { field3: '+'.repeat(500) }]))
    expect(fs.readdirSync(tmpPath).length).toBe(0)
  })
})

describe('Errors', () => {
  test('File that should be returned should throw', async () => {
    const fd = getFormData()
    fd.append('file1', await createFsReadStream(fixture('1000')))
    const p = new FormDataParser((fd as unknown) as Request, tmpPath, {
      fieldsToReturn: ['file1'],
    })

    p.start()
    expect.assertions(3)
    try {
      await p.donePromise
    } catch (err) {
      expect(err).toBeInstanceOf(ParsingErrors)
      expect(err.errors.length).toBe(1)
      expect(err._fieldError).toBeInstanceOf(MissingRequestedFormEntries)
    }
  })

  test('Field size limit that will return should throw', async done => {
    const fd = getFormData()
    fd.append('field1', '.'.repeat(1025))
    fd.append('field2', '.'.repeat(1000))
    fd.append('1000', await createFsReadStream(fixture('1000')))
    fd.append('file1', await createFsReadStream(fixture('1000')))
    const p = new FormDataParser((fd as unknown) as Request, tmpPath, {
      limits: { fieldSize: 1024 },
      fieldsToReturn: ['field1', 'field2'],
    })

    p.start()
    try {
      await p.donePromise
    } catch (err) {
      expect(err).toBeInstanceOf(ParsingErrors)
      expect(err._fieldError).toBeInstanceOf(TruncatedField)
      expect(err._fieldError.message).toEqual(expect.stringContaining('field1'))
      expect(err.errors.length).toBeGreaterThanOrEqual(1)
      err.errors.forEach((el: Error) => expect(el).toBe(err._fieldError))
      done()
    }
  })

  test('Field Fieldname limit that will return should throw', async done => {
    const fd = getFormData()
    fd.append('.'.repeat(11), '.'.repeat(1000))
    fd.append('field2', '.'.repeat(1000))
    fd.append('1000', await createFsReadStream(fixture('1000')))
    fd.append('file1', await createFsReadStream(fixture('1000')))
    const p = new FormDataParser((fd as unknown) as Request, tmpPath, {
      limits: { fieldNameSize: 10 },
      fieldsToReturn: ['.'.repeat(11)],
    })

    p.start()
    try {
      await p.donePromise
    } catch (err) {
      expect(err).toBeInstanceOf(ParsingErrors)
      expect(err._fieldError).toBeInstanceOf(FieldnameSizeExceeded)
      expect(err.errors.length).toBeGreaterThanOrEqual(1)
      err.errors.forEach((el: Error) => expect(el).toBe(err._fieldError))
      done()
    }
  })
})
