import { RouteError } from './RouteError'

export class NoNewUploadsAllowed extends Error {
  constructor() {
    super('FILE_UPLOADER_NO_NEW_UPLOADS_ALLOWED')
  }
}

export class AbortedUploading extends Error {
  constructor() {
    super('FILE_UPLOADER_ABORTED_UPLOADING')
  }
}

export class DeleteErrors extends Error {
  constructor(errors: Error[]) {
    const msg = errors.reduce((acum: string, el: Error) => {
      if (acum) return `${acum}\n${el.name}: ${el.message}`
      return `${el.name}: ${el.message}`
    }, '')

    super(msg)
  }
}

export class HandlerErrors extends Error {
  constructor(errors: Error[]) {
    const msg = errors.reduce((acum: string, el: Error) => {
      if (acum) return `${acum}\n${el.name}: ${el.message}`
      return `${el.name}: ${el.message}`
    }, '')

    super(msg)
  }
}

export class FileSizeLimit extends Error {
  constructor() {
    super('ABORTABLE_FILE_PUMP_FILE_SIZE_LIMIT')
  }
}

export class AbortedPump extends Error {
  constructor() {
    super('ABORTABLE_FILE_PUMP_ABORTED')
  }
}

export class InvalidFormDataOrder extends Error {
  constructor(realTimeStream: string, fieldname: string) {
    super(`Real time stream should be last. Received [${fieldname}] after [${realTimeStream}]`)
  }
}

export class InvalidFileOptions extends Error {
  constructor(fieldname: string) {
    super(`File ${fieldname} can only be persisted. Can't be returned`)
  }
}

export class InvalidRealTimeOptions extends Error {
  constructor(fieldname: string) {
    super(`RealTimeStream ${fieldname} can can't be persisted or returnd`)
  }
}

export class MissingRequestedFormEntries extends Error {
  public partsMissing: string[]
  constructor(partsMissing: string[]) {
    super(`Missing entries: ${partsMissing}`)
    this.partsMissing = partsMissing
  }
}

export class FieldsLimitExceeded extends Error {
  constructor(fieldType: string, fieldNumber: number) {
    super(`The body is allowed to have ${fieldNumber} ${fieldType}`)
  }
}

export class TruncatedField extends Error {
  constructor(fieldname?: string) {
    if (fieldname) super(`Data for field ${fieldname} is truncated`)
    else super(`A fieldname is truncated`)
  }
}

export class FieldnameSizeExceeded extends Error {
  constructor(limit: number) {
    super(`Fieldname size exceeded. Size limit is ${limit}`)
  }
}

export class FileSizeExceeded extends Error {
  constructor(limit: number) {
    super(`File size exceeded. Size limit is ${limit}`)
  }
}

export class UnsupportedContentType extends Error {
  constructor() {
    super(`Missing content type or unsupported content type.`)
  }
}

export class ParsingErrors extends RouteError {
  public errors: Error[]
  public _fieldError: Error
  public _persistError: Error
  public _realTimeStreamError: Error

  constructor(errors: Error[], fieldError?: Error, persistError?: Error, realTimeStreamError?: Error) {
    const errorMsg = (el: Error) => (el != null ? `${el.constructor.name}: ${el.message}` : '')

    super({
      errorName: 'ParsingErrors',
      statusCode: 400,
      message: 'Errors occured when parsing the body given',
      detail: {
        errors: errors.map(errorMsg),
        fieldError: errorMsg(fieldError),
        persistError: errorMsg(persistError),
        realTimeStreamError: errorMsg(realTimeStreamError),
      },
    })

    this.errors = errors
    this._fieldError = fieldError
    this._persistError = persistError
    this._realTimeStreamError = realTimeStreamError
  }
}
