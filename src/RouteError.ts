interface ObjectWithKeys {
  [key: string]: any
}

export interface RouteErrorConstructorArgs {
  errorName: string
  message: string
  statusCode: number
  detail?: ObjectWithKeys
}

export interface RouteErrorSetArgs {
  errorName?: string
  message?: string
  statusCode?: number
  detail?: ObjectWithKeys
}

export class RouteError extends Error {
  private msg: string
  private errorName: string
  private statusCode: number
  public detail: any

  constructor({ errorName, message, statusCode, detail }: RouteErrorConstructorArgs) {
    super(message)
    this.msg = message
    this.statusCode = statusCode
    this.errorName = errorName
    if (detail != null) this.detail = detail
  }

  getResponseObject() {
    return {
      error: this.errorName,
      message: this.msg,
      ...(this.detail != null ? { detail: this.detail } : {}),
    }
  }

  getStatusCode() {
    return this.statusCode
  }
}

export class InternalServerError extends RouteError {
  constructor() {
    super({
      errorName: 'InternalServerError',
      message: 'Something broke in the server',
      statusCode: 500,
    })
  }
}

export class InvalidRequestArguments extends RouteError {
  constructor(message?: string) {
    super({
      errorName: 'InvalidArguments',
      message: message || 'Some arguments for the request were invalid or missing',
      statusCode: 400,
    })
  }
}
