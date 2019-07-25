import { EventEmitter } from 'events'

export default class Counter {
  private emitter: EventEmitter
  private cnt: number
  constructor() {
    this.emitter = new EventEmitter()
    this.cnt = 0
  }

  increment() {
    this.cnt += 1
  }

  decrement() {
    this.cnt -= 1
    if (this.cnt === 0) this.emitter.emit('zero')
  }

  isZero() {
    return this.cnt === 0
  }

  getCount() {
    return this.cnt
  }

  onceZero(fn: (...args: any[]) => void) {
    if (this.cnt === 0) fn()
    else this.emitter.once('zero', fn)
  }

  onceZeroPriority(fn: (...args: any[]) => void) {
    if (this.cnt === 0) fn()
    else this.emitter.prependOnceListener('zero', fn)
  }
}
