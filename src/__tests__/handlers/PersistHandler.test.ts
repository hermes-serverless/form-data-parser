import { createFsReadStream } from '@hermes-serverless/fs-utils'
import execa from 'execa'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { PassThrough } from 'stream'
import { AbortedUploading, MissingRequestedFormEntries } from '../../errors'
import PersistHandler from '../../handlers/PersistHandler'
import { FileInfo } from '../../typings'
import { Logger } from '../../utils/Logger'
import { setPersistHandlerSpies as setSpies } from './testUtils'

Logger.enabled = false

const tmpPath = path.join(os.tmpdir(), 'persist-handler-tests')

const getFixture = (fixture: string) => {
  return path.join(__dirname, '..', 'fixtures', fixture)
}

let commonPhArgs: any

beforeEach(() => {
  commonPhArgs = {
    busboyLimits: { fieldNameSize: 10 },
    uploadPath: tmpPath,
  }

  execa.sync('rm', ['-rf', tmpPath])
  jest.clearAllMocks()
  if (!fs.existsSync(tmpPath)) fs.mkdirSync(tmpPath, { recursive: true })
})

describe('Test relation with fileUploader', () => {
  const uploadFile = jest.fn()
  const finishUploadings = jest.fn()
  const abortUploadings = jest.fn().mockImplementation(() => {
    throw new AbortedUploading()
  })
  let PersistHandlerMock: typeof PersistHandler

  beforeAll(() => {
    jest.resetModules()
    jest.doMock('../../resources/FileUploader', () => {
      return {
        __esModule: true,
        default: jest.fn().mockImplementation(() => {
          return {
            uploadFile,
            finishUploadings,
            abortUploadings,
          }
        }),
      }
    })

    PersistHandlerMock = require('../../handlers/PersistHandler').default
  })

  afterAll(() => {
    jest.unmock('../../resources/FileUploader')
  })

  test('_parse aborts if fileUploader throws on upload', async () => {
    const err = new Error('MOCK_ERROR')
    uploadFile.mockRejectedValue(err)
    const ph = new PersistHandlerMock({ ...commonPhArgs, partsToPersist: ['file1'] })
    const spies = setSpies(ph)
    await expect(ph._parse({ fieldname: 'file1', fileStream: new PassThrough() })).rejects.toThrow(err)
    expect(uploadFile).toBeCalledTimes(1)
    uploadFile.mockReset()
  })

  test('PersistHandler aborts if fileUploader throws on upload', async () => {
    const err = new Error('MOCK_ERROR')
    uploadFile.mockRejectedValue(err)
    const ph = new PersistHandlerMock({ ...commonPhArgs, partsToPersist: ['file1'] })
    const spies = setSpies(ph)
    const promise = ph.startFileTask('file1', new PassThrough())
    await expect(ph.donePromise).rejects.toThrow(err)
    await expect(promise).resolves.toBe(undefined)
    expect(spies.baseHandler.abort).toBeCalledTimes(1)
    expect(uploadFile).toBeCalledTimes(1)
    uploadFile.mockReset()
  })

  test('PersistHandler aborts if fileUploader throws on finish', async () => {
    const err = new Error('MOCK_ERROR')
    finishUploadings.mockRejectedValue(err)
    const ph = new PersistHandlerMock({ ...commonPhArgs, partsToPersist: ['file1'] })
    const spies = setSpies(ph)
    ph.finish()
    await expect(ph.donePromise).rejects.toThrow(err)
    expect(spies.baseHandler.finish).toBeCalledTimes(1)
    expect(spies.baseHandler.abort).toBeCalledTimes(1)
    finishUploadings.mockReset()
  })
})

describe('Test functionality', () => {
  const checkUploadedFile = (fileInfo: FileInfo, expectedName: string, expectedContent: string) => {
    expect(fileInfo.name).toBe(expectedName)
    expect(fileInfo.size).toBe(expectedContent.length)
    expect(fileInfo.filePath.startsWith(tmpPath)).toBe(true)
    expect(fs.readFileSync(fileInfo.filePath, { encoding: 'utf-8' })).toBe(expectedContent)
  }

  test('No parts work', async () => {
    const ph = new PersistHandler({ ...commonPhArgs, partsToPersist: [] })
    const uploadedFiles = await ph.donePromise
    await expect(ph.finish()).resolves.toBe(undefined)
    await expect(ph.donePromise).resolves.toEqual([])
    expect(uploadedFiles.length).toBe(0)
    expect(fs.readdirSync(tmpPath).length).toBe(0)
  })

  test('One file work', async () => {
    const ph = new PersistHandler({ ...commonPhArgs, partsToPersist: ['file1'] })
    ph.startFileTask('file1', await createFsReadStream(getFixture('1000')))
    const uploadedFiles = await ph.donePromise
    await expect(ph.finish()).resolves.toBe(undefined)
    expect(uploadedFiles.length).toBe(1)
    await checkUploadedFile(uploadedFiles[0], 'file1', '.'.repeat(1000))
    expect(fs.readdirSync(tmpPath).length).toBe(1)
  })

  test('One field work', async () => {
    const ph = new PersistHandler({ ...commonPhArgs, partsToPersist: ['field1'] })
    ph.startFieldTask('field1', 'y'.repeat(3000), false, false)
    const uploadedFiles = await ph.donePromise
    await expect(ph.finish()).resolves.toBe(undefined)
    expect(uploadedFiles.length).toBe(1)
    await checkUploadedFile(uploadedFiles[0], 'field1', 'y'.repeat(3000))
    expect(fs.readdirSync(tmpPath).length).toBe(1)
  })

  test('Two of each work', async () => {
    const ph = new PersistHandler({
      ...commonPhArgs,
      partsToPersist: ['field1', 'field3', 'file1', 'file3'],
    })
    ph.startFileTask('file1', await createFsReadStream(getFixture('1000')))
    ph.startFieldTask('field1', '1'.repeat(3000000), false, false)
    ph.startFileTask('file3', await createFsReadStream(getFixture('2000')))
    ph.startFieldTask('field3', '3'.repeat(3000000), false, false)

    const uploadedFiles = await ph.donePromise
    await expect(ph.finish()).resolves.toBe(undefined)

    expect(uploadedFiles.length).toBe(4)
    const file1 = uploadedFiles.find(el => el.name === 'file1')
    const file3 = uploadedFiles.find(el => el.name === 'file3')
    const field1 = uploadedFiles.find(el => el.name === 'field1')
    const field3 = uploadedFiles.find(el => el.name === 'field3')

    await checkUploadedFile(file1, 'file1', '.'.repeat(1000))
    await checkUploadedFile(file3, 'file3', '+'.repeat(2000))
    await checkUploadedFile(field1, 'field1', '1'.repeat(3000000))
    await checkUploadedFile(field3, 'field3', '3'.repeat(3000000))
    expect(fs.readdirSync(tmpPath).length).toBe(4)
  })

  test('Finishing with missing partsToPersist abort', async () => {
    const ph = new PersistHandler({ ...commonPhArgs, partsToPersist: ['file3', 'field2'] })
    const spies = setSpies(ph)
    const s = new PassThrough()
    s.write('.'.repeat(10000))
    ph.startFileTask('file3', s)

    setTimeout(async () => {
      await expect(ph.finish()).resolves.toBe(undefined)
    }, 1000)

    setTimeout(() => {
      s.end('.'.repeat(1000))
    }, 2000)

    await expect(ph.donePromise).rejects.toThrow(MissingRequestedFormEntries)
    expect(spies.baseHandler._finishTask).toBeCalledTimes(1)
    expect(spies.baseHandler._finishTask.mock.calls[0][0]).toBe('file3')
    expect(spies.baseHandler._finishTask.mock.calls[0].length).toEqual(3)
    expect(spies.baseHandler.abort).toBeCalledTimes(1)
    expect(spies.baseHandler.abort.mock.calls[0][0]).toBeInstanceOf(MissingRequestedFormEntries)
  })

  test('Finish before parts are done uploading doesnt throw', async () => {
    const ph = new PersistHandler({ ...commonPhArgs, partsToPersist: ['field1', 'file1'] })
    const s = new PassThrough()
    s.write('.'.repeat(1000))
    ph.startFileTask('file1', s)
    ph.startFieldTask('field1', 'y'.repeat(1000), false, false)

    setTimeout(async () => {
      await expect(ph.finish()).resolves.toBe(undefined)
    }, 1000)

    setTimeout(() => {
      s.end('.'.repeat(1000))
    }, 2000)

    const uploadedFiles = await ph.donePromise
    expect(uploadedFiles.length).toBe(2)
    const file1 = uploadedFiles.find(el => el.name === 'file1')
    const field1 = uploadedFiles.find(el => el.name === 'field1')
    await checkUploadedFile(file1, 'file1', '.'.repeat(2000))
    await checkUploadedFile(field1, 'field1', 'y'.repeat(1000))
    expect(fs.readdirSync(tmpPath).length).toBe(2)
  })

  test('Abort after partsToPersist promise is done doesnt throw partstoPersist promise', async () => {
    const ph = new PersistHandler({ ...commonPhArgs, partsToPersist: ['field1'] })
    const spies = setSpies(ph)
    ph.startFieldTask('field1', 'y'.repeat(1000), false, false)
    await ph.donePromise
    const err = new Error('TEST_ERROR')
    await ph.abort(err)
    const uploadedFiles = await ph.donePromise
    expect(spies.baseHandler.abort).toBeCalledTimes(1)
    expect(spies.abort.mock.calls[0][0]).toBe(err)
    await checkUploadedFile(uploadedFiles[0], 'field1', 'y'.repeat(1000))
  })

  test('Abort before partsToPersist promise is done makes partstoPersist promise throw', async () => {
    const ph = new PersistHandler({ ...commonPhArgs, partsToPersist: ['field1', 'field2'] })
    const spies = setSpies(ph)
    ph.startFieldTask('field1', 'y'.repeat(1000), false, false)
    const err = new Error('TEST_ERROR')
    setTimeout(async () => {
      await ph.abort(err)
    }, 1000)
    await expect(ph.donePromise).rejects.toThrow(err)
    expect(spies.abort).toBeCalledTimes(1)
    expect(spies.abort.mock.calls[0][0]).toBe(err)
  })

  test('Can abort after finish and nothing happens', async () => {
    const ph = new PersistHandler({ ...commonPhArgs, partsToPersist: ['field1'] })
    ph.startFieldTask('field1', 'y'.repeat(3000), false, false)
    await ph.donePromise
    await expect(ph.finish()).resolves.toBe(undefined)
    const err = new Error('TEST_ERROR')
    await ph.abort(err)
    const uploadedFiles = await ph.donePromise
    expect(uploadedFiles.length).toBe(1)
    await checkUploadedFile(uploadedFiles[0], 'field1', 'y'.repeat(3000))
    expect(fs.readdirSync(tmpPath).length).toBe(1)
  })

  test('Can finish after abort and nothing happens', async done => {
    const ph = new PersistHandler({ ...commonPhArgs, partsToPersist: ['field1', 'field2'] })
    ph.startFieldTask('field1', 'y'.repeat(1000), false, false)
    const err = new Error('TEST_ERROR')

    setTimeout(async () => {
      await ph.abort(err)
    }, 1000)

    setTimeout(async () => {
      await expect(ph.finish()).resolves.toBe(undefined)
    }, 2000)

    setTimeout(async () => {
      await expect(ph.donePromise).rejects.toThrow(err)
      done()
    }, 3000)
  })

  test('Can finish after finish and nothing happens', async done => {
    const ph = new PersistHandler({ ...commonPhArgs, partsToPersist: ['file1'] })
    ph.startFileTask('file1', await createFsReadStream(getFixture('1000')))

    setTimeout(async () => {
      await expect(ph.finish()).resolves.toBe(undefined)
    }, 1000)

    setTimeout(async () => {
      await expect(ph.finish()).resolves.toBe(undefined)
    }, 2000)

    setTimeout(async () => {
      const uploadedFiles = await ph.donePromise
      expect(uploadedFiles.length).toBe(1)
      await checkUploadedFile(uploadedFiles[0], 'file1', '.'.repeat(1000))
      expect(fs.readdirSync(tmpPath).length).toBe(1)
      done()
    }, 3000)
  })

  test('Can abort after abort and nothing happens', async done => {
    const ph = new PersistHandler({ ...commonPhArgs, partsToPersist: ['file1'] })
    ph.startFileTask('file1', await createFsReadStream(getFixture('1000')))

    const err = new Error('TEST_ERROR')
    setTimeout(async () => {
      await ph.abort(err)
    }, 1000)

    setTimeout(async () => {
      await ph.abort(err)
    }, 2000)

    setTimeout(async () => {
      const uploadedFiles = await ph.donePromise
      expect(uploadedFiles.length).toBe(1)
      await checkUploadedFile(uploadedFiles[0], 'file1', '.'.repeat(1000))
      expect(fs.readdirSync(tmpPath).length).toBe(1)
      done()
    }, 3000)
  })
})
