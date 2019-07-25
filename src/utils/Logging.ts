import { NextFunction, Request, Response } from 'express'

const logHandler = (logger: any) => ({ handler, handlerName }: { handler: Function; handlerName: string }) => async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const start = Date.now()

  try {
    await handler(logger, req, res, next)
    logger.info('Incoming request', {
      handlerName,
      method: req.method,
      originalUrl: req.originalUrl,
      totalTime: `${Date.now() - start} ms`,
    })
  } catch (e) {
    logger.error('Incoming request', {
      handlerName,
      method: req.method,
      originalUrl: req.originalUrl,
      totalTime: `${Date.now() - start} ms`,
      error: e,
    })
  }
}

export { logHandler }
