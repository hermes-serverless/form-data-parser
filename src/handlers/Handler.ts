import { Waiter } from '@hermes-serverless/custom-promises'
import { HandlerErrors, MissingRequestedFormEntries } from '../errors'
import { ReadableWithTruncatedFlag } from '../typings'
import { Logger } from '../utils/Logger'

type FileParseFn<T> = (fieldname: string, fileStream: ReadableWithTruncatedFlag) => Promise<T> | T
type FieldParseFn<T> = (fieldname: string, val: string, nameTruncated: boolean, valTruncated: boolean) => Promise<T> | T

interface HandlerConstructorArgs<T> {
  pendingParts?: string[]
  allowFields?: boolean
  allowFiles?: boolean
  parseFile?: FileParseFn<T>
  parseField?: FieldParseFn<T>
  onAbort?: () => void
  onFinish?: () => void
}

export class Handler<T> {
  private tasks: Waiter<T>[]
  private acceptNewTasks: boolean
  private done: Waiter<T[]>

  private allowFiles: boolean
  private allowFields: boolean
  private pendingParts: string[]

  private parseFile: FileParseFn<T>
  private parseField: FieldParseFn<T>
  private onAbort: () => void
  private onFinish: () => void

  constructor(args?: HandlerConstructorArgs<T>) {
    const {
      allowFields,
      allowFiles,
      pendingParts,
      parseField,
      parseFile,
      onAbort,
      onFinish,
    }: HandlerConstructorArgs<T> = args || {}
    this.tasks = []
    this.done = new Waiter()
    this.acceptNewTasks = true

    this.parseField = parseField || (() => Promise.reject(new Error('HANDLER_CANT_PARSE_FIELD')))
    this.parseFile = parseFile || (() => Promise.reject(new Error('HANDLER_CANT_PARSE_FILE')))
    this.onAbort = onAbort || (() => {})
    this.onFinish = onFinish || (() => {})

    this.allowFields = allowFields != null ? allowFields : true
    this.allowFiles = allowFiles != null ? allowFiles : true
    this.pendingParts = pendingParts || []
    if (this.pendingParts.length === 0) this.finish()
  }

  get donePromise() {
    return this.done.finish()
  }

  get acceptTasks() {
    return this.acceptNewTasks
  }

  get tasksArr() {
    return this.tasks
  }

  public wantField(fieldname: string) {
    if (!this.acceptTasks || !this.allowFields) return false
    if (!this.pendingParts.includes(fieldname)) return false
    return true
  }

  public wantFile(fieldname: string) {
    if (!this.acceptTasks || !this.allowFiles) return false
    if (!this.pendingParts.includes(fieldname)) return false
    return true
  }

  public async startFileTask(fieldname: string, fileStream: ReadableWithTruncatedFlag) {
    if (!this.wantFile(fieldname)) throw Error('UNWANTED_FILE_TASK')
    const taskWaiter = this._startTask()
    try {
      const res = await this.parseFile(fieldname, fileStream)
      this._finishTask(fieldname, taskWaiter, res)
    } catch (err) {
      this._finishTask(fieldname, taskWaiter, null, err)
    }
  }

  public async startFieldTask(fieldname: string, val: string, nameTruncated: boolean, valTruncated: boolean) {
    if (!this.wantField(fieldname)) throw Error('UNWANTED_FIELD_TASK')
    const taskWaiter = this._startTask()
    try {
      const res = await this.parseField(fieldname, val, nameTruncated, valTruncated)
      this._finishTask(fieldname, taskWaiter, res)
    } catch (err) {
      this._finishTask(fieldname, taskWaiter, null, err)
    }
  }

  public stopEvents() {
    this.acceptNewTasks = false
  }

  public async _waitTasks(): Promise<T[]> {
    const errors: Error[] = []
    const res = await Promise.all(
      this.tasks.map(task => {
        return task.finish().catch(err => {
          errors.push(err)
        })
      })
    )
    if (errors.length > 0) throw new HandlerErrors(errors)
    return res as T[]
  }

  public async finish() {
    try {
      this.stopEvents()
      if (this.done.isDone()) return
      await this.onFinish()
      const res = await this._waitTasks()
      if (this.pendingParts.length > 0) {
        throw new MissingRequestedFormEntries(this.pendingParts)
      }

      this.done.resolve(res)
    } catch (err) {
      Logger.error(this.addName('Finish error'), err)
      return this.abort(err)
    }
  }

  // TODO: make possible abort without error
  public async abort(err: Error) {
    try {
      this.stopEvents()
      if (this.done.isDone()) return
      this.done.reject(err)

      try {
        await this.onAbort()
      } catch (onAbortErr) {
        Logger.error(this.addName('OnAbort error\n'), onAbortErr)
      }

      await this._waitTasks()
    } catch (err) {
      Logger.error(this.addName('Errors waiting Tasks on abort\n'), err)
    }
  }

  public _startTask() {
    const waiter: Waiter<T> = new Waiter()
    this.tasks.push(waiter)
    return waiter
  }

  public _finishTask(fieldname: string, taskWaiter: Waiter<T>, res: T, err?: Error) {
    if (err) {
      taskWaiter.reject(err)
      return this.abort(err)
    }

    taskWaiter.resolve(res)
    this.pendingParts = this.pendingParts.filter(el => el !== fieldname)
    if (this.pendingParts.length === 0) this.finish()
  }

  private addName = (msg: string) => {
    return `[BaseHandler] ${msg}`
  }
}
