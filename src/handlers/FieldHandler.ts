import { FieldnameSizeExceeded, TruncatedField } from '../errors'
import { BusboyLimits, Field } from '../typings'
import { Logger } from '../utils/Logger'
import { Handler } from './Handler'

interface FieldHandlerConstructorArgs {
  fieldsToReturn?: string[]
  busboyLimits: BusboyLimits
}

export default class FieldHandler {
  private baseHandler: Handler<Field>
  private busboyLimits: BusboyLimits

  constructor({ fieldsToReturn, busboyLimits }: FieldHandlerConstructorArgs) {
    this.busboyLimits = busboyLimits
    this.baseHandler = new Handler({
      pendingParts: fieldsToReturn,
      allowFiles: false,
      parseField: this._parse,
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

  public _parse = (fieldname: string, val: string, nameTruncated: boolean, valTruncated: boolean) => {
    Logger.info(this.addName(``), {
      fieldname,
      ...(valTruncated != null ? { valTruncated } : {}),
      ...(nameTruncated != null ? { nameTruncated } : {}),
    })

    const { fieldNameSize: maxFieldNameSize } = this.busboyLimits
    if (nameTruncated) throw new TruncatedField()
    if (valTruncated) throw new TruncatedField(fieldname)
    if (fieldname.length > maxFieldNameSize) throw new FieldnameSizeExceeded(maxFieldNameSize)
    const ret = { [fieldname]: val }
    Logger.info(this.addName(`Field added`), ret)
    return ret
  }

  private addName = (msg: string) => {
    return `[FieldHandler] ${msg}`
  }
}
