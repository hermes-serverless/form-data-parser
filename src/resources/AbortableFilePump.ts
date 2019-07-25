import { Waiter } from '@hermes-serverless/custom-promises'
import { createFsWriteStream } from '@hermes-serverless/fs-utils'
import fs from 'fs'
import stream, { Readable, Writable } from 'stream'
import { AbortedPump, FileSizeLimit } from '../errors'
import { ReadableWithTruncatedFlag } from '../typings.d'

export default class AbortableFilePump {
  private src: ReadableWithTruncatedFlag
  private dest: Writable
  private filePath: string
  private aborted: boolean
  private done: Waiter<void>

  private clearSrc: any
  private clearListeners: any

  constructor(input: Readable, filePath: string) {
    this.src = input
    this.filePath = filePath
    this.aborted = false
    this.done = new Waiter()
  }

  public start = async () => {
    this.dest = await createFsWriteStream(this.filePath, { flags: 'wx' })
    if (this.aborted) await this.done.finish()
    if (this.src.truncated) throw new FileSizeLimit()

    const onLimit = () => {
      this.src.unpipe(this.dest)
      this.dest.emit('error', new FileSizeLimit())
    }

    this.src.once('limit', onLimit)
    this.clearSrc = () => this.src.removeListener('limit', onLimit)

    this.src.pipe(this.dest)
    this.clearListeners = stream.finished(this.dest, err => {
      this.clearListeners()
      this.clearSrc()
      if (err) return this.done.reject(err)
      this.done.resolve()
    })

    await this.done.finish()
    return fs.statSync(this.filePath).size
  }

  public unpipe = () => {
    if (this.dest) this.src.unpipe(this.dest)
    if (this.clearSrc) this.clearSrc()
    if (this.clearListeners) this.clearListeners()
  }

  public abort = () => {
    this.aborted = true
    this.unpipe()
    this.done.reject(new AbortedPump())
  }
}
