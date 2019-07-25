import { StringStream } from '@hermes-serverless/stream-utils'
import { FieldnameSizeExceeded, FileSizeExceeded, TruncatedField } from '../errors'
import FileUploader from '../resources/FileUploader'
import { BusboyLimits, FileInfo, ReadableWithTruncatedFlag } from '../typings'
import { Logger } from '../utils/Logger'
import { Handler } from './Handler'

interface PersistHandlerConstructorArgs {
  busboyLimits: BusboyLimits
  partsToPersist?: string[]
  uploadPath: string
}

interface InputToParse {
  fieldname: string
  fileStream?: ReadableWithTruncatedFlag
  val?: string
  valTruncated?: boolean
  nameTruncated?: boolean
}

export default class PersistHandler {
  private baseHandler: Handler<FileInfo>
  private busboyLimits: BusboyLimits
  private fileUploader: FileUploader

  constructor(args: PersistHandlerConstructorArgs) {
    this.fileUploader = new FileUploader(args.uploadPath)
    this.busboyLimits = args.busboyLimits

    const onAbort = async () => {
      try {
        this.fileUploader.abortUploadings()
        await this.fileUploader.donePromise
        Logger.error(this.addName(`Didn't abort uploadings`))
      } catch (err) {
        Logger.info(this.addName(`Aborted uploadings successfuly`))
      }
    }

    const onFinish = () => {
      return this.fileUploader.finishUploadings()
    }

    this.baseHandler = new Handler<FileInfo>({
      onAbort,
      onFinish,
      pendingParts: args.partsToPersist,
      parseFile: this._parseFile,
      parseField: this._parseField,
    })
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

  public startFieldTask = (fieldname: string, val: string, nameTruncated: boolean, valTruncated: boolean) => {
    return this.baseHandler.startFieldTask(fieldname, val, nameTruncated, valTruncated)
  }

  public finish = () => {
    return this.baseHandler.finish()
  }

  public abort = (err: Error) => {
    Logger.info(this.addName('External Abort\n'), err)
    return this.baseHandler.abort(err)
  }

  public _parseFile = (fieldname: string, fileStream: ReadableWithTruncatedFlag) => {
    return this._parse({ fieldname, fileStream })
  }

  public _parseField = (fieldname: string, val: string, nameTruncated: boolean, valTruncated: boolean) => {
    return this._parse({ fieldname, val, nameTruncated, valTruncated })
  }

  public _parse = async ({ fieldname, fileStream, val, nameTruncated, valTruncated }: InputToParse) => {
    Logger.info(this.addName(``), {
      fieldname,
      ...(valTruncated != null ? { valTruncated } : {}),
      ...(nameTruncated != null ? { nameTruncated } : {}),
    })

    const { fieldNameSize: maxFieldNameSize, fileSize: maxFileSize } = this.busboyLimits
    if (fileStream && fileStream.truncated) throw new FileSizeExceeded(maxFileSize)
    if (nameTruncated) throw new TruncatedField()
    if (valTruncated) throw new TruncatedField(fieldname)
    if (fieldname.length > maxFieldNameSize) throw new FieldnameSizeExceeded(maxFieldNameSize)

    const stream = fileStream || new StringStream(val)
    const fileInfo = await this.fileUploader.uploadFile(fieldname, stream)
    Logger.info(this.addName(`${fieldname} File Uploaded`), fileInfo)
    return fileInfo
  }

  public addName = (msg: string) => {
    return `[PersistHandler] ${msg}`
  }
}
