import colors from 'colors/safe'
import { TransformableInfo } from 'logform'
import { forEachObjIndexed } from 'ramda'
import { createLogger, format, transports } from 'winston'

colors.enable()
const myFormat = format.combine(
  format.timestamp({
    format: 'DD/MM HH:mm:ss',
  }),
  format.printf((info: TransformableInfo) => {
    const { timestamp, message, level, ...remains } = info
    const levelColor: { [key: string]: string } = {
      info: 'green',
      error: 'red',
    }

    // @ts-ignore
    const baseStr = colors.blue(`${timestamp} `) + colors[levelColor[level]](`[${level}] `)
    const rawBaseStr = `${timestamp} ` + `[${level}] `

    let remainsStr = ''
    forEachObjIndexed((val, key) => {
      remainsStr += '\n' + ' '.repeat(rawBaseStr.length) + colors.bold(`${key}: `) + `${val}`
    }, remains)

    return baseStr + colors.bold(message) + remainsStr
  })
)

export class Logger {
  public static enabled: boolean = true

  static logger = createLogger({
    format: myFormat,
    transports: [new transports.Console()],
  })

  static info(...args: any) {
    if (!Logger.enabled) return
    // @ts-ignore
    Logger.logger.info(...args)
  }

  static error(...args: any) {
    if (!Logger.enabled) return
    // @ts-ignore
    Logger.logger.error(...args)
  }
}
