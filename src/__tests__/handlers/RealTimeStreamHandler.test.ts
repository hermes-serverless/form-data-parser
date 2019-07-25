import getStream from 'get-stream'
import { PassThrough, Readable } from 'stream'
import { MissingRequestedFormEntries } from '../../errors'
import RealTimeStreamHandler from '../../handlers/RealTimeStreamHandler'
import { Logger } from '../../utils/Logger'
import { setRealTimeStreamHandlerSpies as setSpies } from './testUtils'

Logger.enabled = false

const commonRtsArgs = {
  busboyLimits: { fieldNameSize: 10 },
}

describe('Test functionality', () => {
  const checkStream = async (stream: Readable, expectedContent: string) => {
    expect(await getStream(stream)).toBe(expectedContent)
  }

  test('Doesnt accept fields', async () => {
    const rts = new RealTimeStreamHandler({ ...commonRtsArgs, realTimePart: 'file1' })
    expect(rts.wantField('file1')).toBe(false)
    expect(rts.wantFile('file1')).toBe(true)
    expect(rts.wantField('file2')).toBe(false)
    expect(rts.wantField('file1')).toBe(false)
  })

  test('No parts work', async () => {
    const rts = new RealTimeStreamHandler({ ...commonRtsArgs })
    const streams = await rts.donePromise
    await expect(rts.finish()).resolves.toBe(undefined)
    await expect(rts.donePromise).resolves.toEqual([])
    expect(streams.length).toBe(0)
  })

  test('One file work', async () => {
    const rts = new RealTimeStreamHandler({ ...commonRtsArgs, realTimePart: 'file1' })
    const s = new PassThrough()
    rts.startFileTask('file1', s)
    const streams = await rts.donePromise
    await expect(rts.finish()).resolves.toBe(undefined)
    expect(streams.length).toBe(1)

    s.end('y'.repeat(3000))
    await checkStream(streams[0], 'y'.repeat(3000))
  })

  test('Finishing with missing realTimePart abort', async () => {
    const rts = new RealTimeStreamHandler({ ...commonRtsArgs, realTimePart: 'file3' })
    const spies = setSpies(rts)

    setTimeout(async () => {
      await expect(rts.finish()).resolves.toBe(undefined)
    }, 1000)

    await expect(rts.donePromise).rejects.toThrow(MissingRequestedFormEntries)
    expect(spies.baseHandler._finishTask).toBeCalledTimes(0)
    expect(spies.baseHandler.abort).toBeCalledTimes(1)
    expect(spies.baseHandler.abort.mock.calls[0][0]).toBeInstanceOf(MissingRequestedFormEntries)
  })

  test('Finish right after starting tasks doesnt throw', async () => {
    const rts = new RealTimeStreamHandler({ ...commonRtsArgs, realTimePart: 'file1' })
    const s = new PassThrough()
    s.write('.'.repeat(10 * 1000000))
    rts.startFileTask('file1', s)
    await expect(rts.finish()).resolves.toBe(undefined)

    const streams = await rts.donePromise
    expect(streams.length).toBe(1)
    s.end('.'.repeat(1 * 1000000))
    await checkStream(streams[0], '.'.repeat(11 * 1000000))
  })

  test('Abort after realTimePart promise is done doesnt throw realTimePart promise', async () => {
    const rts = new RealTimeStreamHandler({ ...commonRtsArgs, realTimePart: 'file1' })
    const spies = setSpies(rts)
    const s = new PassThrough()
    rts.startFileTask('file1', s)
    await rts.donePromise
    const err = new Error('TEST_ERROR')
    await rts.abort(err)
    const streams = await rts.donePromise
    expect(spies.baseHandler.abort).toBeCalledTimes(1)
    expect(spies.abort.mock.calls[0][0]).toBe(err)
    s.end('oi')
    await checkStream(streams[0], 'oi')
  })

  test('Abort before realTimePart promise is done makes realTimePart promise throw', async () => {
    const rts = new RealTimeStreamHandler({ ...commonRtsArgs, realTimePart: 'file2' })
    const spies = setSpies(rts)
    const err = new Error('TEST_ERROR')
    setTimeout(async () => {
      await rts.abort(err)
    }, 1000)
    await expect(rts.donePromise).rejects.toThrow(err)
    expect(spies.abort).toBeCalledTimes(1)
    expect(spies.abort.mock.calls[0][0]).toBe(err)
  })

  test('Can abort after finish and nothing happens', async () => {
    const rts = new RealTimeStreamHandler({ ...commonRtsArgs, realTimePart: 'file2' })
    const s = new PassThrough()
    rts.startFileTask('file2', s)
    await rts.donePromise
    await expect(rts.finish()).resolves.toBe(undefined)
    const err = new Error('TEST_ERROR')
    await rts.abort(err)
    const streams = await rts.donePromise
    expect(streams.length).toBe(1)
    s.end('.'.repeat(1000))
    await checkStream(streams[0], '.'.repeat(1000))
  })

  test('Can finish after abort and nothing happens', async done => {
    const rts = new RealTimeStreamHandler({ ...commonRtsArgs, realTimePart: 'file2' })
    const err = new Error('TEST_ERROR')

    setTimeout(async () => {
      await rts.abort(err)
    }, 1000)

    setTimeout(async () => {
      await expect(rts.finish()).resolves.toBe(undefined)
    }, 2000)

    setTimeout(async () => {
      await expect(rts.donePromise).rejects.toThrow(err)
      done()
    }, 3000)
  })

  test('Can finish after finish and nothing happens', async done => {
    const rts = new RealTimeStreamHandler({ ...commonRtsArgs, realTimePart: 'file1' })
    const s = new PassThrough()
    s.end('asdf')
    rts.startFileTask('file1', s)

    setTimeout(async () => {
      await expect(rts.finish()).resolves.toBe(undefined)
    }, 1000)

    setTimeout(async () => {
      await expect(rts.finish()).resolves.toBe(undefined)
    }, 2000)

    setTimeout(async () => {
      const streams = await rts.donePromise
      expect(streams.length).toBe(1)
      await checkStream(streams[0], 'asdf')
      done()
    }, 3000)
  })

  test('Can abort after abort and nothing happens', async done => {
    const rts = new RealTimeStreamHandler({ ...commonRtsArgs, realTimePart: 'file2' })
    const err = new Error('TEST_ERROR')

    setTimeout(async () => {
      await expect(rts.abort(err)).resolves.toBe(undefined)
    }, 1000)

    setTimeout(async () => {
      await expect(rts.abort(err)).resolves.toBe(undefined)
    }, 2000)

    setTimeout(async () => {
      await expect(rts.donePromise).rejects.toThrow(err)
      done()
    }, 3000)
  })
})
