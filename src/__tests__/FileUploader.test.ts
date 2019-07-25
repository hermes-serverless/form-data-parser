import { createFsReadStream, fileExists } from '@hermes-serverless/fs-utils'
import execa from 'execa'
import fs from 'fs'
import getStream from 'get-stream'
import os from 'os'
import path from 'path'
import { PassThrough } from 'stream'
import { DeleteErrors, FileSizeLimit, NoNewUploadsAllowed } from '../errors'
import FileUploader from '../resources/FileUploader'
import { Logger } from '../utils/Logger'
import { instantDone, noFinishUntilAbort } from './mocks/AbortableFilePump'

Logger.enabled = false
const tmpPath = path.join(os.tmpdir(), 'file-uploader-tests')

beforeEach(() => {
  jest.resetModules()
  if (!fs.existsSync(tmpPath)) fs.mkdirSync(tmpPath, { recursive: true })
})

afterEach(() => {
  execa.sync('rm', ['-rf', tmpPath])
})

describe('Abort works as expected', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  afterEach(() => {
    jest.resetModules()
  })

  test('Abort works when file doesnt end', async () => {
    const mock: any[] = []
    jest.doMock('../resources/AbortableFilePump', noFinishUntilAbort(mock))
    const { default: FileUploaderWithMock } = require('../resources/FileUploader')
    const up = new FileUploaderWithMock(tmpPath)
    const p1 = expect(up.uploadFile('testfile', new PassThrough())).rejects.toThrow('ABORTABLE_FILE_PUMP_ABORTED')
    const p2 = expect(up.donePromise).rejects.toThrow('FILE_UPLOADER_ABORTED_UPLOADING')
    up.abortUploadings()
    await p1
    await p2
    expect(mock.length).toBe(1)
    expect(mock[0].start).toBeCalledTimes(1)
    expect(mock[0].abort).toBeCalledTimes(1)
    jest.unmock('../resources/AbortableFilePump')
  })

  test('Abort with no uploads work', async () => {
    const up = new FileUploader(tmpPath)
    up.abortUploadings()
    await expect(up.donePromise).rejects.toThrow('FILE_UPLOADER_ABORTED_UPLOADING')
  })

  test('Abort works when streams doesnt end', async () => {
    const up = new FileUploader(tmpPath)
    const p1 = expect(up.uploadFile('test1', new PassThrough())).rejects.toThrow('ABORTABLE_FILE_PUMP_ABORTED')
    const p2 = expect(up.uploadFile('test2', new PassThrough())).rejects.toThrow('ABORTABLE_FILE_PUMP_ABORTED')
    up.abortUploadings()
    await expect(up.donePromise).rejects.toThrow('FILE_UPLOADER_ABORTED_UPLOADING')
    await p1
    await p2
  })

  test('Abort works when all files are done', async () => {
    const mock: any[] = []
    jest.doMock('../resources/AbortableFilePump', instantDone(mock))
    const { default: FileUploaderWithMock } = require('../resources/FileUploader')
    const up = new FileUploaderWithMock(tmpPath)
    await up.uploadFile('test1', new PassThrough())
    await up.uploadFile('test2', new PassThrough())
    up.abortUploadings()
    await expect(up.donePromise).rejects.toThrow('FILE_UPLOADER_ABORTED_UPLOADING')
    expect(mock.length).toBe(2)
    expect(mock[0].start).toBeCalledTimes(1)
    expect(mock[0].abort).toBeCalledTimes(1)
    expect(mock[1].start).toBeCalledTimes(1)
    expect(mock[1].abort).toBeCalledTimes(1)
    jest.unmock('../resources/AbortableFilePump')
  })

  test('Abort works when finished is called before but files arent ready yet', async () => {
    const mock: any[] = []
    jest.doMock('../resources/AbortableFilePump', noFinishUntilAbort(mock))
    const { default: FileUploaderWithMock } = require('../resources/FileUploader')
    const up = new FileUploaderWithMock(tmpPath)
    const p1 = expect(up.uploadFile('testfile', new PassThrough())).rejects.toThrow('ABORTABLE_FILE_PUMP_ABORTED')
    const p2 = expect(up.donePromise).rejects.toThrow('FILE_UPLOADER_ABORTED_UPLOADING')
    up.finishUploadings()
    up.abortUploadings()
    await p1
    await p2
    expect(mock.length).toBe(1)
    expect(mock[0].start).toBeCalledTimes(1)
    expect(mock[0].abort).toBeCalledTimes(1)
    jest.unmock('../resources/AbortableFilePump')
  })
})

describe('Upload finishes', () => {
  test('Uploadings finish when an upload throws', async () => {
    const up = new FileUploader(tmpPath)
    const s = new PassThrough()
    s.write('.'.repeat(1000000))
    setTimeout(() => {
      // @ts-ignore
      s.truncated = true
      s.emit('limit')
      s.end('.'.repeat(1000000))
    }, 1000)

    expect.assertions(3)
    const filePromise = up.uploadFile('testfile', s)
    up.finishUploadings()
    await expect(filePromise).rejects.toThrow(FileSizeLimit)
    await expect(up.donePromise).resolves.toBe(undefined)
    expect(up.isDoneUploading).toBe(true)
  })

  test('Finish first thing. Doesnt allow new uploads', async () => {
    const up = new FileUploader(tmpPath)
    const s = new PassThrough()
    const fsize = 1000000
    s.end('.'.repeat(fsize))
    const finishPromise = up.finishUploadings()

    expect.assertions(2)
    try {
      await up.uploadFile('testfile', s)
    } catch (err) {
      expect(err).toBeInstanceOf(NoNewUploadsAllowed)
    }
    await finishPromise
    expect(up.isDoneUploading).toBe(true)
  })

  test('Upload one file and finish. Doesnt allow new uploads', async () => {
    const up = new FileUploader(tmpPath)
    const s1 = new PassThrough()
    const s2 = new PassThrough()
    const fsize = 1000000
    s1.end('.'.repeat(fsize))
    s2.end('+'.repeat(fsize))
    const fileInfoPromise = up.uploadFile('testfile1', s1)
    up.finishUploadings()

    expect.assertions(6)
    try {
      await up.uploadFile('testfile2', s2)
    } catch (err) {
      expect(err).toBeInstanceOf(NoNewUploadsAllowed)
    }

    await up.donePromise
    expect(up.isDoneUploading).toBe(true)

    const { size, name, filePath } = await fileInfoPromise
    expect(name).toBe('testfile1')
    expect(size).toBe(fsize)
    expect(filePath.startsWith(tmpPath)).toBe(true)
    const content = await getStream(await createFsReadStream(filePath))
    expect(content).toBe('.'.repeat(fsize))
  })
})

describe('Uploading files works as expected', () => {
  test('Sucessfully uploads', async () => {
    const fsize = 1000000
    const p = execa('node', ['-e', `console.log(".".repeat(${fsize} - 1))`])
    const up = new FileUploader(tmpPath)
    const { size, name, filePath } = await up.uploadFile('testfile', p.stdout)
    expect(name).toBe('testfile')
    expect(size).toBe(1000000)
    expect(filePath.startsWith(tmpPath)).toBe(true)
    const content = await getStream(await createFsReadStream(filePath))
    expect(content).toBe('.'.repeat(fsize - 1) + '\n')
  })

  test('Upload throws on limit', async () => {
    const up = new FileUploader(tmpPath)
    const s = new PassThrough()
    s.write('.'.repeat(1000000))
    setTimeout(() => {
      // @ts-ignore
      s.truncated = true
      s.emit('limit')
      s.end('.'.repeat(1000000))
    }, 1000)
    await expect(up.uploadFile('testfile', s)).rejects.toBeInstanceOf(FileSizeLimit)
  })
})

describe('Removing uploaded files works as expected', () => {
  test('Sucessfully remove files when no upload occurred', async () => {
    const up = new FileUploader(tmpPath)
    await expect(up.removeUploadedFiles()).resolves.toStrictEqual([])
  })

  test('Sucessfully remove files when upload occurred', async () => {
    const up = new FileUploader(tmpPath)
    const fsize = 1000000
    const p = execa('node', ['-e', `console.log(".".repeat(${fsize} - 1))`])
    const { filePath } = await up.uploadFile('testfile', p.stdout)
    await expect(up.removeUploadedFiles()).resolves.toStrictEqual([filePath])
    await expect(fileExists(filePath)).resolves.toBe(false)
  })

  test('Sucessfully remove files when upload has error occurred but file exists', async () => {
    const up = new FileUploader(tmpPath)
    const s = new PassThrough()
    s.write('.'.repeat(1000000))
    setTimeout(() => {
      // @ts-ignore
      s.truncated = true
      s.emit('limit')
      s.end('.'.repeat(1000000))
    }, 1000)

    await expect(up.uploadFile('testfile', s)).rejects.toBeInstanceOf(FileSizeLimit)
    const deleted = await up.removeUploadedFiles()
    expect(deleted.length).toBe(1)
    expect(deleted[0].startsWith(tmpPath)).toBe(true)
    await expect(fileExists(deleted[0])).resolves.toBe(false)
  })

  test('removeUploadedFiles throws successfully', async () => {
    const up = new FileUploader(tmpPath)
    const fsize = 1000000
    const p = execa('node', ['-e', `console.log(".".repeat(${fsize} - 1))`])
    const { filePath } = await up.uploadFile('testfile', p.stdout)
    await fs.promises.unlink(filePath)
    await expect(up.removeUploadedFiles()).rejects.toBeInstanceOf(DeleteErrors)
    await expect(fileExists(filePath)).resolves.toBe(false)
  })

  test('removeUploadedFiles throws successfully and delete all files, even the successful', async () => {
    const up = new FileUploader(tmpPath)
    const fsize = 1000000
    const p1 = execa('node', ['-e', `console.log(".".repeat(${fsize} - 1))`])
    const { filePath: f1 } = await up.uploadFile('testfile1', p1.stdout)
    await fs.promises.unlink(f1)

    const p2 = execa('node', ['-e', `console.log(".".repeat(${fsize} - 1))`])
    const { filePath: f2 } = await up.uploadFile('testfile2', p2.stdout)

    await expect(up.removeUploadedFiles()).rejects.toBeInstanceOf(DeleteErrors)
    await expect(fileExists(f1)).resolves.toBe(false)
    await expect(fileExists(f2)).resolves.toBe(false)
  })

  test.todo('removeUploadedFiles works when FileUploader is aborted')

  test('DeleteErrors has expected format on one error', async () => {
    const up = new FileUploader(tmpPath)
    const fsize = 1000000
    const p = execa('node', ['-e', `console.log(".".repeat(${fsize} - 1))`])
    const { filePath } = await up.uploadFile('testfile', p.stdout)
    await fs.promises.unlink(filePath)

    expect.assertions(2)
    try {
      await up.removeUploadedFiles()
    } catch (err) {
      expect(err).toBeInstanceOf(DeleteErrors)
      expect(/^.*ENOENT.*$/g.test(err.message)).toBe(true)
    }
  })

  test('DeleteErrors has expected format on two errors', async () => {
    const up = new FileUploader(tmpPath)
    const fsize = 1000000
    const p1 = execa('node', ['-e', `console.log(".".repeat(${fsize} - 1))`])
    const { filePath: f1 } = await up.uploadFile('testfile1', p1.stdout)

    const p2 = execa('node', ['-e', `console.log(".".repeat(${fsize} - 1))`])
    await up.uploadFile('testfile2', p2.stdout)

    const p3 = execa('node', ['-e', `console.log(".".repeat(${fsize} - 1))`])
    const { filePath: f3 } = await up.uploadFile('testfile3', p3.stdout)

    await fs.promises.unlink(f1)
    await fs.promises.unlink(f3)

    expect.assertions(2)
    try {
      await up.removeUploadedFiles()
    } catch (err) {
      expect(err).toBeInstanceOf(DeleteErrors)
      expect(/^.*ENOENT.*\n.*ENOENT.*$/g.test(err.message)).toBe(true)
    }
  })
})
