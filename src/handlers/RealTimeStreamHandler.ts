import { Readable } from 'stream'
import { BusboyLimits } from '..'
import { FieldnameSizeExceeded, FileSizeExceeded, InvalidFormDataOrder } from '../errors'
import { ReadableWithTruncatedFlag } from '../typings'
import { Logger } from '../utils/Logger'
import { Handler } from './Handler'

interface RealTimeStreamHandlerConstructorArgs {
  realTimePart?: string
  busboyLimits: BusboyLimits
}

export default class RealTimeStreamHandler {
  private baseHandler: Handler<Readable>
  private busboyLimits: BusboyLimits
  private realTimePartName: string

  constructor({ busboyLimits, realTimePart }: RealTimeStreamHandlerConstructorArgs) {
    this.busboyLimits = busboyLimits
    this.realTimePartName = realTimePart

    const onAbort = async () => {
      if (this.baseHandler.tasksArr.length > 0 && this.baseHandler.tasksArr[0].isDone()) {
        try {
          const stream = await this.baseHandler.tasksArr[0].finish()
          stream.unpipe()
          stream.resume()
        } catch (err) {
          Logger.error(this.addName(`Failed to unpipe and resume stream on abort`), err)
        }
      }
    }

    this.baseHandler = new Handler({
      onAbort,
      pendingParts: realTimePart != null ? [realTimePart] : [],
      allowFields: false,
      parseFile: this._parse,
    })
  }

  get realTimePartFieldname() {
    return this.realTimePartName
  }

  get donePromise() {
    return this.baseHandler.donePromise
  }

  get acceptTasks() {
    return this.baseHandler.acceptTasks
  }

  public wantField = (fieldname: string) => {
    return this.baseHandler.wantField(fieldname)
  }

  public wantFile = (fieldname: string) => {
    return this.baseHandler.wantFile(fieldname)
  }

  public startFileTask = (fieldname: string, fileStream: ReadableWithTruncatedFlag) => {
    return this.baseHandler.startFileTask(fieldname, fileStream)
  }

  public finish = () => {
    return this.baseHandler.finish()
  }

  public abort = (err: Error) => {
    Logger.info(this.addName('External Abort\n'), err)
    return this.baseHandler.abort(err)
  }

  public _parse = async (fieldname: string, fileStream: ReadableWithTruncatedFlag) => {
    Logger.info(this.addName(``), {
      fieldname,
    })

    const { fieldNameSize: maxFieldNameSize, fileSize: maxFileSize } = this.busboyLimits
    if (fileStream && fileStream.truncated) throw new FileSizeExceeded(maxFileSize)
    if (fieldname.length > maxFieldNameSize) throw new FieldnameSizeExceeded(maxFieldNameSize)
    const ret = fileStream
    Logger.info(this.addName(`RealTimePart parsed`))
    return ret
  }

  private checkError = (fieldname: string) => {
    new InvalidFormDataOrder(null, fieldname)
  }

  private addName = (msg: string) => {
    return `[RealTimeStreamHandler] ${msg}`
  }
}
