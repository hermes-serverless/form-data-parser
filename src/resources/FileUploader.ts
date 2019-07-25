import { Waiter } from '@hermes-serverless/custom-promises'
import { randomBytes } from 'crypto'
import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { AbortedUploading, DeleteErrors, NoNewUploadsAllowed } from '../errors'
import { FileInfo } from '../typings.d'
import { Logger } from '../utils/Logger'
import AbortableFilePump from './AbortableFilePump'
import Counter from './Counter'

export default class FileUploader {
  private basePath: string
  private pendingCounter: Counter
  private uploaded: string[]
  private uploadedInfo: FileInfo[]
  private pumpObjs: AbortableFilePump[]

  private acceptNewUploads: boolean
  private done: Waiter<any>

  constructor(basePath: string) {
    this.basePath = basePath
    this.pendingCounter = new Counter()
    this.uploaded = []
    this.pumpObjs = []
    this.uploadedInfo = []
    this.acceptNewUploads = true
    this.done = new Waiter()
  }

  get uploadedFiles(): FileInfo[] {
    return this.uploadedInfo
  }

  get donePromise() {
    return this.done.finish()
  }

  get isDoneUploading() {
    return this.done.isDone()
  }

  public stopAcceptingUploads = () => {
    this.acceptNewUploads = false
  }

  public abortUploadings = () => {
    this.stopAcceptingUploads()
    if (this.done.isDone()) return
    this.pendingCounter.onceZeroPriority(() => this.done.reject(new AbortedUploading()))
    this.pumpObjs.forEach(el => el.abort())
  }

  public finishUploadings = () => {
    this.stopAcceptingUploads()
    if (this.done.isDone()) return
    this.pendingCounter.onceZero(this.done.resolve)
  }

  public uploadFile = async (name: string, input: Readable): Promise<FileInfo> => {
    if (!this.acceptNewUploads) throw new NoNewUploadsAllowed()
    const filePath = path.join(this.basePath, randomBytes(8).toString('hex'))
    this.pendingCounter.increment()
    this.uploaded.push(filePath)

    try {
      const pump = new AbortableFilePump(input, filePath)
      this.pumpObjs.push(pump)
      Logger.info(this.addName(`Start ${name} upload`))
      input.on('end', () => Logger.info(`${name} stream ended`))
      const size = await pump.start()
      Logger.info(this.addName(`Ended ${name} upload`))
      this.pendingCounter.decrement()

      const fileInfo = {
        name,
        filePath,
        size,
      }

      this.uploadedInfo.push(fileInfo)
      return fileInfo
    } catch (err) {
      this.pendingCounter.decrement()
      Logger.info(this.addName(`Error ${name} upload`))
      throw err
    }
  }

  public removeUploadedFiles = async (): Promise<string[]> => {
    Logger.info(this.addName('Try to delete uploaded files'), this.uploadedFiles)
    try {
      await this.finishUploadings()
    } catch (err) {
      Logger.info(this.addName('Error thrown, maybe expected\n'), err)
    }

    const errors: Error[] = []
    const catchHandler = (err: Error) => errors.push(err)
    await Promise.all(this.uploaded.map(file => fs.promises.unlink(file).catch(catchHandler)))

    if (errors.length > 0) throw new DeleteErrors(errors)
    Logger.info(this.addName(''), { deletedFiles: this.uploadedFiles })
    return this.uploaded
  }

  private addName = (msg: string) => {
    return `[FileUploader] ${msg}`
  }
}
