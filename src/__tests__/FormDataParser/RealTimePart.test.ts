import { createFsReadStream } from '@hermes-serverless/fs-utils'
import execa from 'execa'
import { Request } from 'express'
import fs from 'fs'
import getStream from 'get-stream'
import os from 'os'
import path from 'path'
import { PassThrough } from 'stream'
import FormDataParser from '../../'
import { FieldnameSizeExceeded, InvalidRealTimeOptions, ParsingErrors } from '../../errors'
import { FileInfo } from '../../typings'
import { Logger } from '../../utils/Logger'
import { fixture, getFormData } from './util'

Logger.enabled = false

const tmpPath = path.join(os.tmpdir(), 'input-parser-realTimePart-tests')

const checkUploadedFile = (fileInfo: FileInfo, expectedName: string, expectedContent: string) => {
  expect(fileInfo.name).toBe(expectedName)
  expect(fileInfo.size).toBe(expectedContent.length)
  expect(fileInfo.filePath.startsWith(tmpPath)).toBe(true)
  expect(fs.readFileSync(fileInfo.filePath, { encoding: 'utf-8' })).toBe(expectedContent)
}

beforeEach(() => {
  if (!fs.existsSync(tmpPath)) fs.mkdirSync(tmpPath, { recursive: true })
})

afterEach(() => {
  execa.sync('rm', ['-rf', tmpPath])
})

describe('RealTimePart works', () => {
  test('RealTimePart with empty name works', async done => {
    const s = new PassThrough()
    s.write('stabilish-connection')

    const fd = getFormData()
    fd.append('field1', '.'.repeat(1024))
    fd.append('file1', await createFsReadStream(fixture('1000')))
    fd.append('', s)
    const p = new FormDataParser((fd as unknown) as Request, tmpPath, {
      realTimePart: '',
    })

    p.start()
    const [fieldPairs, uploadedFiles, realTimeStream] = await Promise.all([
      p.fieldsPromise,
      p.filesPromise,
      p.realTimeStreamPromise,
    ])

    expect.assertions(5)
    setTimeout(() => s.end('+'.repeat(2000)), 600)
    setTimeout(async () => {
      expect(await getStream(realTimeStream[0])).toEqual('stabilish-connection' + '+'.repeat(2000))
      await expect(p.donePromise).resolves.toBe(undefined)
      done()
    }, 1000)

    expect(realTimeStream.length).toBe(1)
    expect(uploadedFiles).toEqual([])
    expect(fieldPairs).toEqual([])
  })

  test('RealTimePart works', async done => {
    const s = new PassThrough()
    s.write('stabilish-connection')

    const fd = getFormData()
    const s1 = new PassThrough()
    s1.end('.'.repeat(100 * 1000000))
    fd.append('field1', '.'.repeat(1024))
    fd.append('file1', s1)
    fd.append('realTime', s)
    const p = new FormDataParser((fd as unknown) as Request, tmpPath, {
      realTimePart: 'realTime',
    })

    p.start()
    const [fieldPairs, uploadedFiles, realTimeStream] = await Promise.all([
      p.fieldsPromise,
      p.filesPromise,
      p.realTimeStreamPromise,
    ])

    expect.assertions(5)
    setTimeout(() => s.write('.'.repeat(1000)), 500)
    setTimeout(() => s.end('+'.repeat(2000)), 600)
    setTimeout(async () => {
      expect(await getStream(realTimeStream[0])).toEqual('stabilish-connection' + '.'.repeat(1000) + '+'.repeat(2000))
      await expect(p.donePromise).resolves.toBe(undefined)
      done()
    }, 1000)

    expect(realTimeStream.length).toBe(1)
    expect(uploadedFiles).toEqual([])
    expect(fieldPairs).toEqual([])
  })
})

describe('RealTimePart and FieldsToReturn work together', () => {})

describe('RealTimePart and PartsToPersist work together', () => {
  test('One file', async done => {
    const s = new PassThrough()
    s.write('stabilish-connection')
    const fd = getFormData()
    fd.append('field1', '.'.repeat(1024))
    fd.append('file1', await createFsReadStream(fixture('1000')))
    fd.append('realTime', s)
    const p = new FormDataParser((fd as unknown) as Request, tmpPath, {
      realTimePart: 'realTime',
      partsToPersist: ['file1'],
    })

    p.start()
    const [fieldPairs, uploadedFiles, realTimeStream] = await Promise.all([
      p.fieldsPromise,
      p.filesPromise,
      p.realTimeStreamPromise,
    ])

    expect.assertions(9)
    setTimeout(() => s.end('+'.repeat(2000)), 500)
    setTimeout(async () => {
      expect(await getStream(realTimeStream[0])).toEqual('stabilish-connection' + '+'.repeat(2000))
      await expect(p.donePromise).resolves.toBe(undefined)
      done()
    }, 1000)

    expect(realTimeStream.length).toBe(1)
    expect(uploadedFiles.length).toBe(1)
    expect(fieldPairs).toEqual([])
    checkUploadedFile(uploadedFiles[0], 'file1', '.'.repeat(1000))
  })

  test('One field', async done => {
    const s = new PassThrough()
    s.write('stabilish-connection')
    const fd = getFormData()
    fd.append('field1', '.'.repeat(1024))
    fd.append('realTime', s)
    const p = new FormDataParser((fd as unknown) as Request, tmpPath, {
      realTimePart: 'realTime',
      partsToPersist: ['field1'],
    })

    p.start()
    const [fieldPairs, uploadedFiles, realTimeStream] = await Promise.all([
      p.fieldsPromise,
      p.filesPromise,
      p.realTimeStreamPromise,
    ])

    expect.assertions(9)
    setTimeout(() => s.end('+'.repeat(2000)), 500)
    setTimeout(async () => {
      expect(await getStream(realTimeStream[0])).toEqual('stabilish-connection' + '+'.repeat(2000))
      await expect(p.donePromise).resolves.toBe(undefined)
      done()
    }, 1000)

    expect(realTimeStream.length).toBe(1)
    expect(uploadedFiles.length).toBe(1)
    expect(fieldPairs).toEqual([])
    checkUploadedFile(uploadedFiles[0], 'field1', '.'.repeat(1024))
  })

  test('One file and One field', async done => {
    const s = new PassThrough()
    s.write('stabilish-connection')
    const fd = getFormData()
    fd.append('field1', '.'.repeat(1024))
    fd.append('file1', await createFsReadStream(fixture('1000')))
    fd.append('realTime', s)
    const p = new FormDataParser((fd as unknown) as Request, tmpPath, {
      realTimePart: 'realTime',
      partsToPersist: ['file1', 'field1'],
    })

    p.start()
    const [fieldPairs, uploadedFiles, realTimeStream] = await Promise.all([
      p.fieldsPromise,
      p.filesPromise,
      p.realTimeStreamPromise,
    ])

    expect.assertions(13)
    setTimeout(() => s.end('+'.repeat(2000)), 500)
    setTimeout(async () => {
      expect(await getStream(realTimeStream[0])).toEqual('stabilish-connection' + '+'.repeat(2000))
      await expect(p.donePromise).resolves.toBe(undefined)
      done()
    }, 1000)

    expect(realTimeStream.length).toBe(1)
    expect(uploadedFiles.length).toBe(2)
    expect(fieldPairs).toEqual([])
    checkUploadedFile(uploadedFiles.find(el => el.name === 'file1'), 'file1', '.'.repeat(1000))
    checkUploadedFile(uploadedFiles.find(el => el.name === 'field1'), 'field1', '.'.repeat(1024))
  })
})

describe('RealTimePart, PartsToPersist and FieldsToReturn work together', () => {
  test('One file', async done => {
    const s = new PassThrough()
    s.write('stabilish-connection')
    const fd = getFormData()
    fd.append('field1', '.'.repeat(1024))
    fd.append('file1', await createFsReadStream(fixture('1000')))
    fd.append('realTime', s)
    const p = new FormDataParser((fd as unknown) as Request, tmpPath, {
      realTimePart: 'realTime',
      partsToPersist: ['file1'],
      fieldsToReturn: ['field1'],
    })

    p.start()
    const [fieldPairs, uploadedFiles, realTimeStream] = await Promise.all([
      p.fieldsPromise,
      p.filesPromise,
      p.realTimeStreamPromise,
    ])

    expect.assertions(9)
    setTimeout(() => s.end('+'.repeat(2000)), 500)
    setTimeout(async () => {
      expect(await getStream(realTimeStream[0])).toEqual('stabilish-connection' + '+'.repeat(2000))
      await expect(p.donePromise).resolves.toBe(undefined)
      done()
    }, 1000)

    expect(realTimeStream.length).toBe(1)
    expect(uploadedFiles.length).toBe(1)
    expect(fieldPairs).toEqual([{ field1: '.'.repeat(1024) }])
    checkUploadedFile(uploadedFiles[0], 'file1', '.'.repeat(1000))
  })

  test('One field', async done => {
    const s = new PassThrough()
    s.write('stabilish-connection')
    const fd = getFormData()
    fd.append('field1', '.'.repeat(1024))
    fd.append('realTime', s)
    const p = new FormDataParser((fd as unknown) as Request, tmpPath, {
      realTimePart: 'realTime',
      partsToPersist: ['field1'],
      fieldsToReturn: ['field1'],
    })

    p.start()
    const [fieldPairs, uploadedFiles, realTimeStream] = await Promise.all([
      p.fieldsPromise,
      p.filesPromise,
      p.realTimeStreamPromise,
    ])

    expect.assertions(9)
    setTimeout(() => s.end('+'.repeat(2000)), 500)
    setTimeout(async () => {
      expect(await getStream(realTimeStream[0])).toEqual('stabilish-connection' + '+'.repeat(2000))
      await expect(p.donePromise).resolves.toBe(undefined)
      done()
    }, 1000)

    expect(realTimeStream.length).toBe(1)
    expect(uploadedFiles.length).toBe(1)
    expect(fieldPairs).toEqual([{ field1: '.'.repeat(1024) }])
    checkUploadedFile(uploadedFiles[0], 'field1', '.'.repeat(1024))
  })

  test('One file and One field', async done => {
    const s = new PassThrough()
    s.write('stabilish-connection')
    const fd = getFormData()
    fd.append('field1', '.'.repeat(1024))
    fd.append('file1', await createFsReadStream(fixture('1000')))
    fd.append('realTime', s)
    const p = new FormDataParser((fd as unknown) as Request, tmpPath, {
      realTimePart: 'realTime',
      partsToPersist: ['file1', 'field1'],
      fieldsToReturn: ['field1'],
    })

    p.start()
    const [fieldPairs, uploadedFiles, realTimeStream] = await Promise.all([
      p.fieldsPromise,
      p.filesPromise,
      p.realTimeStreamPromise,
    ])

    expect.assertions(13)
    setTimeout(() => s.end('+'.repeat(2000)), 500)
    setTimeout(async () => {
      expect(await getStream(realTimeStream[0])).toEqual('stabilish-connection' + '+'.repeat(2000))
      await expect(p.donePromise).resolves.toBe(undefined)
      done()
    }, 1000)

    expect(realTimeStream.length).toBe(1)
    expect(uploadedFiles.length).toBe(2)
    expect(fieldPairs).toEqual([{ field1: '.'.repeat(1024) }])
    checkUploadedFile(uploadedFiles.find(el => el.name === 'file1'), 'file1', '.'.repeat(1000))
    checkUploadedFile(uploadedFiles.find(el => el.name === 'field1'), 'field1', '.'.repeat(1024))
  })
})

describe('Errors', () => {
  test('PartsToPersist and RealTimePart throw', async () => {
    const s = new PassThrough()
    const fd = getFormData()
    fd.append('field1', '.'.repeat(1024))
    fd.append('file1', await createFsReadStream(fixture('1000')))
    fd.append('realTime', s)
    expect.assertions(3)
    try {
      const p = new FormDataParser((fd as unknown) as Request, tmpPath, {
        realTimePart: 'realTime',
        partsToPersist: ['file1', 'realTime'],
      })
    } catch (err) {
      expect(err).toBeInstanceOf(ParsingErrors)
      expect(err.errors.length).toBe(1)
      expect(err.errors[0]).toBeInstanceOf(InvalidRealTimeOptions)
    }
  })

  test('FieldsToReturn and RealTimePart throw', async () => {
    const s = new PassThrough()
    const fd = getFormData()
    fd.append('field1', '.'.repeat(1024))
    fd.append('file1', await createFsReadStream(fixture('1000')))
    fd.append('realTime', s)
    expect.assertions(3)
    try {
      const p = new FormDataParser((fd as unknown) as Request, tmpPath, {
        realTimePart: 'realTime',
        fieldsToReturn: ['field1', 'realTime'],
      })
    } catch (err) {
      expect(err).toBeInstanceOf(ParsingErrors)
      expect(err.errors.length).toBe(1)
      expect(err.errors[0]).toBeInstanceOf(InvalidRealTimeOptions)
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
      realTimePart: '.'.repeat(11),
    })
    p.start()
    try {
      await p.donePromise
    } catch (err) {
      expect(err).toBeInstanceOf(ParsingErrors)
      expect(err._realTimeStreamError).toBeInstanceOf(FieldnameSizeExceeded)
      expect(err._realTimeStreamError.message).toEqual(expect.stringContaining('10'))
      expect(err.errors.length).toBeGreaterThanOrEqual(1)
      err.errors.forEach((el: Error) => expect(el).toBe(err._realTimeStreamError))
      done()
    }
  })
})
