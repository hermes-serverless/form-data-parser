import { Waiter } from '@hermes-serverless/custom-promises'
import { AbortedPump } from '../../errors'

export const noFinishUntilAbort = (mockArr: any[]) => () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => {
      const done = new Waiter()
      const ret = {
        start: jest.fn(() => done.finish()),
        abort: jest.fn(() => done.reject(new AbortedPump())),
      }
      mockArr.push(ret)
      return ret
    }),
  }
}

export const instantDone = (mockArr: any[]) => () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => {
      const ret = {
        start: jest.fn(() => Promise.resolve(123)),
        abort: jest.fn(),
      }
      mockArr.push(ret)
      return ret
    }),
  }
}
