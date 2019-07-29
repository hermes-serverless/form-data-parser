import { Waiter } from '@hermes-serverless/custom-promises'
import { drainStream } from '@hermes-serverless/stream-utils'
import Busboy from 'busboy'
import { Request } from 'express'
import { Readable } from 'stream'
import {
  FieldsLimitExceeded,
  InvalidFormDataOrder,
  InvalidRealTimeOptions,
  ParsingErrors,
  UnsupportedContentType,
} from './errors'
import FieldHandler from './handlers/FieldHandler'
import PersistHandler from './handlers/PersistHandler'
import RealTimeStreamHandler from './handlers/RealTimeStreamHandler'
import { Logger } from './utils/Logger'

export interface BusboyLimits {
  fieldNameSize?: number
  fieldSize?: number
  fields?: number
  fileSize?: number
  files?: number
  parts?: number
  headerPairs?: number
}

interface FormDataParserOptions {
  partsToPersist?: string[]
  fieldsToReturn?: string[]
  realTimePart?: string
  limits?: BusboyLimits
}

export default class FormDataParser {
  private busboyLimits: BusboyLimits
  private busboy: busboy.Busboy
  private req: Request

  private fieldHandler: FieldHandler
  private persistHandler: PersistHandler
  private realTimeStreamHandler: RealTimeStreamHandler

  private acceptNewEvents: boolean
  private errors: Error[]

  private finished: boolean
  private aborted: boolean
  private parseWaiter: Waiter<void>

  constructor(req: Request, uploadPath: string, options?: FormDataParserOptions) {
    const { partsToPersist, fieldsToReturn, realTimePart, limits }: FormDataParserOptions = options || {}
    this.req = req
    this.errors = []

    this.busboyLimits = {
      fieldNameSize: 100,
      fieldSize: 1024,
      ...limits,
    }

    const persistOrReturnAndRealTime = (partsToPersist || []).concat(fieldsToReturn || []).filter(el => {
      return el === realTimePart
    })

    if (persistOrReturnAndRealTime.length > 0) {
      throw new ParsingErrors([new InvalidRealTimeOptions(persistOrReturnAndRealTime[0])])
    }

    this.fieldHandler = new FieldHandler({ fieldsToReturn, busboyLimits: this.busboyLimits })
    this.persistHandler = new PersistHandler({ partsToPersist, uploadPath, busboyLimits: this.busboyLimits })
    this.realTimeStreamHandler = new RealTimeStreamHandler({ realTimePart, busboyLimits: this.busboyLimits })
    this._setupOnError()

    this.finished = false
    this.aborted = false
    this.acceptNewEvents = true
    this.parseWaiter = new Waiter()

    try {
      this.busboy = new Busboy({
        headers: this.req.headers,
        limits: this.busboyLimits,
      })

      const fieldException = (type: string, cnt: number) => () => this._abort(new FieldsLimitExceeded(type, cnt))
      this.busboy.on('fieldsLimit', fieldException('field(s)', this.busboyLimits.fields))
      this.busboy.on('filesLimit', fieldException('file(s)', this.busboyLimits.files))
      this.busboy.on('partsLimit', fieldException('part(s)', this.busboyLimits.parts))
      this.busboy.on('error', (err: any) => this._abort(err))

      this.busboy.on('finish', () => {
        Logger.info(this.addName('Busboy finish'))
        this._finishEvents()
      })

      this.busboy.on('file', this._onFile)
      this.busboy.on('field', this._onField)
    } catch (err) {
      Logger.error(this.addName(`Busboy constructor error`), err)
      throw new ParsingErrors([new UnsupportedContentType()])
    }
  }

  get fieldsPromise() {
    return this.fieldHandler.donePromise
  }

  get filesPromise() {
    return this.persistHandler.donePromise
  }

  get realTimeStreamPromise() {
    return this.realTimeStreamHandler.donePromise
  }

  get donePromise() {
    return this.parseWaiter.finish()
  }

  public start = () => {
    this.req.pipe(this.busboy)
  }

  public _destroyBusboy = () => {
    if (this.busboy) this.busboy.removeAllListeners()
    if (this.busboy) this.req.unpipe(this.busboy)
    drainStream(this.req)
  }

  public _finishEvents = async () => {
    if (this.finished) return
    Logger.info(this.addName('_finishEvents'))
    this.finished = true

    this._destroyBusboy()
    this._finishHandlers()
    try {
      await this.fieldHandler.donePromise
      await this.persistHandler.donePromise
      await this.realTimeStreamHandler.donePromise
      this.parseWaiter.resolve()
    } catch (err) {
      // .catch for each one should already abort
    }
  }

  public _abort = async (err: Error) => {
    Logger.error(this.addName(`Register error\n`), err)
    this.errors.push(err)
    if (this.aborted) return
    this.aborted = true

    Logger.error(this.addName(`Aborting\n`), err)

    this._destroyBusboy()
    this._abortHandlers(err)

    const getError = async (promise: Promise<any>) => {
      try {
        await promise
      } catch (err) {
        return err
      }
    }

    const fieldError = await getError(this.fieldHandler.donePromise)
    const persistError = await getError(this.persistHandler.donePromise)
    const realTimeStreamError = await getError(this.realTimeStreamHandler.donePromise)
    this.parseWaiter.reject(new ParsingErrors(this.errors, fieldError, persistError, realTimeStreamError))
  }

  public _setupOnError = () => {
    const register = (name: string, handler: any) => {
      handler.donePromise.then(
        () => Logger.info(this.addName(`[${name}] success`)),
        (err: Error) => {
          Logger.error(this.addName(`[${name}] error`), err)
          this._abort(err)
        }
      )
    }
    register('fieldHandler', this.fieldHandler)
    register('persistHandler', this.persistHandler)
    register('realTimeStreamHandler', this.realTimeStreamHandler)
  }

  public _finishHandlers = () => {
    this.acceptNewEvents = false
    this.fieldHandler.finish()
    this.persistHandler.finish()
    this.realTimeStreamHandler.finish()
  }

  public _abortHandlers = (err: Error) => {
    this.acceptNewEvents = false
    this.fieldHandler.abort(err)
    this.persistHandler.abort(err)
    this.realTimeStreamHandler.abort(err)
  }

  public _onFile = (fieldname: string, fileStream: Readable) => {
    Logger.info(this.addName(`New file [${fieldname}]`))
    if (!this.acceptNewEvents) {
      fileStream.resume()
      return this._abort(new InvalidFormDataOrder(this.realTimeStreamHandler.realTimePartFieldname, fieldname))
    }

    if (this.persistHandler.wantFile(fieldname)) return this.persistHandler.startFileTask(fieldname, fileStream)
    if (this.realTimeStreamHandler.wantFile(fieldname)) {
      this.realTimeStreamHandler.startFileTask(fieldname, fileStream)
      return this._finishHandlers()
    }
    return fileStream.resume()
  }

  public _onField = (fieldname: string, val: string, valTruncated: boolean, nameTruncated: boolean) => {
    Logger.info(this.addName(`New field [${fieldname}]`))
    if (!this.acceptNewEvents) {
      return this._abort(new InvalidFormDataOrder(this.realTimeStreamHandler.realTimePartFieldname, fieldname))
    }

    if (this.persistHandler.wantField(fieldname)) {
      this.persistHandler.startFieldTask(fieldname, val, valTruncated, nameTruncated)
    }

    if (this.fieldHandler.wantField(fieldname)) {
      this.fieldHandler.startFieldTask(fieldname, val, valTruncated, nameTruncated)
    }
  }

  private addName = (msg: string) => {
    return `[FormDataParser] ${msg}`
  }
}
