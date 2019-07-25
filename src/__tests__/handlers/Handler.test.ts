import { PassThrough } from 'stream'
import { MissingRequestedFormEntries } from '../../errors'
import { Handler } from '../../handlers/Handler'
import { Logger } from '../../utils/Logger'
import { setHandlerSpies as setSpies } from './testUtils'

Logger.enabled = false

describe('wantFile and wantField tests', () => {
  test('Test all lifecycle when allowFile', async () => {
    const h = new Handler({ pendingParts: ['file1'] })
    const spies = setSpies(h)
    expect(h.wantFile('file1')).toBe(true)
    expect(h.wantFile('file2')).toBe(false)
    expect(h.wantFile('file1')).toBe(true)
    await h.finish()
    expect(spies.abort).toBeCalledTimes(1)
    expect(spies.stopEvents).toBeCalledTimes(2)
    await expect(h.donePromise).rejects.toThrow(new MissingRequestedFormEntries(['file1']))
    expect(h.wantFile('file1')).toBe(false)
    expect(h.wantFile('file2')).toBe(false)
  })

  test('allowFile is false', async () => {
    const h = new Handler({ pendingParts: ['file1'], allowFiles: false })
    const spies = setSpies(h)
    expect(h.wantFile('file1')).toBe(false)
    expect(h.wantFile('file2')).toBe(false)
    expect(h.wantFile('file1')).toBe(false)
    await h.finish()
    expect(spies.abort).toBeCalledTimes(1)
    expect(spies.stopEvents).toBeCalledTimes(2)
    await expect(h.donePromise).rejects.toThrow(new MissingRequestedFormEntries(['file1']))
    expect(h.wantFile('file1')).toBe(false)
    expect(h.wantFile('file2')).toBe(false)
  })

  test('allowField is false', async () => {
    const h = new Handler({ pendingParts: ['field1'], allowFields: false })
    const spies = setSpies(h)
    expect(h.wantField('field2')).toBe(false)
    expect(h.wantField('field1')).toBe(false)
    expect(h.wantField('field1')).toBe(false)
    await h.finish()
    expect(spies.abort).toBeCalledTimes(1)
    expect(spies.stopEvents).toBeCalledTimes(2)
    await expect(h.donePromise).rejects.toThrow(new MissingRequestedFormEntries(['field1']))
    expect(h.wantField('field2')).toBe(false)
    expect(h.wantField('field1')).toBe(false)
  })

  test('Test all lifecycle when allowField', async () => {
    const h = new Handler({ pendingParts: ['field1'] })
    const spies = setSpies(h)
    expect(h.wantField('field1')).toBe(true)
    expect(h.wantField('field2')).toBe(false)
    expect(h.wantField('field1')).toBe(true)
    await h.finish()
    expect(spies.abort).toBeCalledTimes(1)
    expect(spies.stopEvents).toBeCalledTimes(2)
    await expect(h.donePromise).rejects.toThrow(new MissingRequestedFormEntries(['field1']))
    expect(h.wantField('field2')).toBe(false)
    expect(h.wantField('field1')).toBe(false)
  })
})

describe('startFieldTask tests', () => {
  test('startFieldTask throw error if unwanted', async () => {
    const h = new Handler({ pendingParts: ['file1'] })
    await expect(h.startFieldTask('field1', '', false, false)).rejects.toThrow('UNWANTED_FIELD_TASK')
  })

  test('Calls _finishTask on success', async () => {
    const parseField = jest.fn().mockResolvedValue(10)
    const h = new Handler({ parseField, pendingParts: ['field1'] })
    const spies = setSpies(h)
    await h.startFieldTask('field1', '', false, false)
    expect(spies._finishTask).toBeCalledTimes(1)
    expect(spies._finishTask.mock.calls[0][0]).toEqual('field1')
    expect(spies._finishTask.mock.calls[0][2]).toEqual(10)
    expect(parseField).toBeCalledTimes(1)
  })

  test('Calls _finishTask on error', async () => {
    const err = new Error('TEST_ERROR')
    const parseField = jest.fn().mockRejectedValue(err)
    const h = new Handler({ parseField, pendingParts: ['field1'] })
    const spies = setSpies(h)
    await h.startFieldTask('field1', '', false, false)
    expect(spies._finishTask).toBeCalledTimes(1)
    expect(spies._finishTask.mock.calls[0][0]).toEqual('field1')
    expect(spies._finishTask.mock.calls[0][3]).toEqual(err)
    expect(parseField).toBeCalledTimes(1)
  })
})

describe('startFileTask tests', () => {
  test('startFileTask throw error if unwanted', async () => {
    const h = new Handler({ pendingParts: ['file1'] })
    await expect(h.startFileTask('file2', new PassThrough())).rejects.toThrow('UNWANTED_FILE_TASK')
  })

  test('Calls _finishTask on success', async () => {
    const parseFile = jest.fn().mockResolvedValue(10)
    const h = new Handler({ parseFile, pendingParts: ['file1'] })
    const spies = setSpies(h)
    await h.startFileTask('file1', new PassThrough())
    expect(spies._finishTask).toBeCalledTimes(1)
    expect(spies._finishTask.mock.calls[0][0]).toEqual('file1')
    expect(spies._finishTask.mock.calls[0][2]).toEqual(10)
    expect(parseFile).toBeCalledTimes(1)
  })

  test('Calls _finishTask on error', async () => {
    const err = new Error('TEST_ERROR')
    const parseFile = jest.fn().mockRejectedValue(err)
    const h = new Handler({ parseFile, pendingParts: ['file1'] })
    const spies = setSpies(h)
    await h.startFileTask('file1', new PassThrough())
    expect(spies._finishTask).toBeCalledTimes(1)
    expect(spies._finishTask.mock.calls[0][0]).toEqual('file1')
    expect(spies._finishTask.mock.calls[0][3]).toEqual(err)
    expect(parseFile).toBeCalledTimes(1)
  })
})

describe('_startTask tests', () => {
  test('Appends new waiter to tasks', async () => {
    const h = new Handler()
    const waiter = h._startTask()
    // @ts-ignore
    expect(h.tasks).toEqual([waiter])
  })
})

describe('_finishTask tests', () => {
  test('On error aborts and doesnt take out pendingPart', async () => {
    const h = new Handler({ pendingParts: ['file1'] })
    const spies = setSpies(h)
    const taskWaiter = { resolve: jest.fn(), reject: jest.fn() }
    const err = new Error('TEST_ERROR')
    // @ts-ignore
    h._finishTask('file1', taskWaiter, null, err)
    expect(taskWaiter.resolve).toBeCalledTimes(0)
    expect(taskWaiter.reject).toBeCalledTimes(1)
    expect(taskWaiter.reject).toBeCalledWith(err)
    expect(spies.finish).toBeCalledTimes(0)
    expect(spies.abort).toBeCalledTimes(1)
    expect(spies.abort).toBeCalledWith(err)
    // @ts-ignore
    expect(h.pendingParts).toEqual(['file1'])
  })

  test('On success removes pendingPart', async () => {
    const h = new Handler({ pendingParts: ['file1', 'file2'] })
    const spies = setSpies(h)
    const taskWaiter = { resolve: jest.fn(), reject: jest.fn() }
    // @ts-ignore
    h._finishTask('file1', taskWaiter, 10)
    expect(taskWaiter.reject).toBeCalledTimes(0)
    expect(taskWaiter.resolve).toBeCalledTimes(1)
    expect(taskWaiter.resolve).toBeCalledWith(10)
    expect(spies.finish).toBeCalledTimes(0)
    expect(spies.abort).toBeCalledTimes(0)
    // @ts-ignore
    expect(h.pendingParts).toEqual(['file2'])
  })

  test('On last task success call finish', async () => {
    const h = new Handler({ pendingParts: ['file1'] })
    const spies = setSpies(h)
    const taskWaiter = { resolve: jest.fn(), reject: jest.fn() }
    // @ts-ignore
    h._finishTask('file1', taskWaiter, 10)
    expect(taskWaiter.reject).toBeCalledTimes(0)
    expect(taskWaiter.resolve).toBeCalledTimes(1)
    expect(taskWaiter.resolve).toBeCalledWith(10)
    expect(spies.finish).toBeCalledTimes(1)
    expect(spies.abort).toBeCalledTimes(0)
    // @ts-ignore
    expect(h.pendingParts).toEqual([])
  })
})

describe('Finish tests', () => {
  test('When pendingParts is empty finished is called', async () => {
    const h = new Handler({ pendingParts: [] })
    await expect(h.donePromise).resolves.toEqual([])
  })

  test('Finish calls stopEvents', async () => {
    const h = new Handler({ pendingParts: [] })
    const spies = setSpies(h)
    await expect(h.finish()).resolves.toBe(undefined)
    expect(spies.stopEvents).toBeCalledTimes(1)
    expect(spies.abort).toBeCalledTimes(0)
    await expect(h.donePromise).resolves.toEqual([])
  })

  test('Finish calls abort on pendingParts missing', async () => {
    const h = new Handler({ pendingParts: ['file1'] })
    const spies = setSpies(h)
    await expect(h.finish()).resolves.toBe(undefined)
    await expect(h.donePromise).rejects.toThrow(new MissingRequestedFormEntries(['file1']))
    expect(spies.stopEvents).toBeCalledTimes(2)
    expect(spies.abort).toBeCalledTimes(1)
    expect(spies.abort).toBeCalledWith(new MissingRequestedFormEntries(['file1']))
  })

  test('Finish calls abort on _waitTasks error', async () => {
    const h = new Handler({ pendingParts: ['part1'] })
    const err = new Error('MOCK_ERROR')
    const _waitTasks = jest.fn().mockRejectedValue(err)
    h._waitTasks = _waitTasks
    const spies = setSpies(h)
    await expect(h.finish()).resolves.toBe(undefined)
    await expect(h.donePromise).rejects.toThrow(err)
    expect(_waitTasks).toBeCalledTimes(2)
    expect(spies.stopEvents).toBeCalledTimes(2)
    expect(spies.abort).toBeCalledTimes(1)
    expect(spies.abort).toBeCalledWith(err)
  })

  test('If done is rejected doesnt do nothing', async () => {
    const h = new Handler({ pendingParts: ['file1'] })
    const spies = setSpies(h)
    const err = new Error('MOCK_ERROR')
    // @ts-ignore
    h.done.reject(err)
    await expect(h.finish()).resolves.toBe(undefined)
    await expect(h.donePromise).rejects.toThrow(err)
    expect(spies.stopEvents).toBeCalledTimes(1)
    expect(spies.abort).not.toBeCalled()
    expect(spies._waitTasks).not.toBeCalled()
  })

  test('If done is resolved doesnt do nothing', async () => {
    const h = new Handler({ pendingParts: ['file1'] })
    const spies = setSpies(h)
    // @ts-ignore
    h.done.resolve([10])
    await expect(h.finish()).resolves.toBe(undefined)
    await expect(h.donePromise).resolves.toEqual([10])
    expect(spies.stopEvents).toBeCalledTimes(1)
    expect(spies.abort).not.toBeCalled()
    expect(spies._waitTasks).not.toBeCalled()
  })

  test('Resolves done with _waitTasks result', async () => {
    const h = new Handler({ pendingParts: ['part1'] })
    const _waitTasks = jest.fn().mockResolvedValue([10, 20])
    h._waitTasks = _waitTasks
    // @ts-ignore
    h.pendingParts = []
    const spies = setSpies(h)
    await expect(h.finish()).resolves.toBe(undefined)
    await expect(h.donePromise).resolves.toEqual([10, 20])
    expect(_waitTasks).toBeCalledTimes(1)
    expect(spies.stopEvents).toBeCalledTimes(1)
    expect(spies.abort).toBeCalledTimes(0)
  })
})

describe('Abort tests', () => {
  test('Abort calls stopEvents', async () => {
    const h = new Handler({ pendingParts: ['part1'] })
    const spies = setSpies(h)
    const err = new Error('TEST_ERROR')
    await expect(h.abort(err)).resolves.toBe(undefined)
    await expect(h.donePromise).rejects.toThrow(err)
    expect(spies.stopEvents).toBeCalledTimes(1)
  })

  test('OnAbort is called', async () => {
    const onAbort = jest.fn()
    const h = new Handler({ onAbort, pendingParts: ['part1'] })
    const spies = setSpies(h)
    const err = new Error('TEST_ERROR')
    await expect(h.abort(err)).resolves.toBe(undefined)
    await expect(h.donePromise).rejects.toThrow(err)
    expect(spies.stopEvents).toBeCalledTimes(1)
    expect(onAbort).toBeCalledTimes(1)
    expect(spies._waitTasks).toBeCalledTimes(1)
  })

  test('Abort waits tasks to end', async () => {
    const h = new Handler({ pendingParts: ['part1'] })
    const spies = setSpies(h)
    const err = new Error('TEST_ERROR')
    await expect(h.abort(err)).resolves.toBe(undefined)
    await expect(h.donePromise).rejects.toThrow(err)
    expect(spies.stopEvents).toBeCalledTimes(1)
    expect(spies._waitTasks).toBeCalledTimes(1)
  })

  test('Abort waits tasks to end if onAbort throws', async () => {
    const err2 = new Error('ABORT_ERROR')
    const onAbort = jest.fn().mockRejectedValue(err2)
    const h = new Handler({ onAbort, pendingParts: ['file1'] })
    const spies = setSpies(h)
    const err = new Error('TEST_ERROR')
    await expect(h.abort(err)).resolves.toBe(undefined)
    await expect(h.donePromise).rejects.toThrow(err)
    expect(spies.stopEvents).toBeCalledTimes(1)
    expect(onAbort).toBeCalledTimes(1)
    expect(spies._waitTasks).toBeCalledTimes(1)
  })

  test('If done is resolved doesnt do nothing', async () => {
    const onAbort = jest.fn()
    const h = new Handler({ onAbort, pendingParts: ['part1'] })
    const spies = setSpies(h)
    // @ts-ignore
    h.done.resolve([10])

    const err = new Error('TEST_ERROR')
    await expect(h.abort(err)).resolves.toBe(undefined)
    await expect(h.donePromise).resolves.toEqual([10])
    expect(spies.stopEvents).toBeCalledTimes(1)
    expect(onAbort).not.toBeCalled()
    expect(spies._waitTasks).not.toBeCalled()
  })

  test('If done is rejected doesnt do nothing', async () => {
    const onAbort = jest.fn()
    const h = new Handler({ onAbort, pendingParts: ['part1'] })
    const spies = setSpies(h)
    const err2 = new Error('DONE_ERROR')
    // @ts-ignore
    h.done.reject(err2)

    const err = new Error('TEST_ERROR')
    await expect(h.abort(err)).resolves.toBe(undefined)
    await expect(h.donePromise).rejects.toThrow(err2)
    expect(spies.stopEvents).toBeCalledTimes(1)
    expect(onAbort).not.toBeCalled()
    expect(spies._waitTasks).not.toBeCalled()
  })
})

test('StopEvents work', () => {
  const h = new Handler({ pendingParts: ['part1'] })
  expect(h.acceptTasks).toBe(true)
  h.stopEvents()
  expect(h.acceptTasks).toBe(false)
})

describe('Functionality tests', () => {
  test('Successfully parse files', async () => {
    const parseFile = jest
      .fn()
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(20)
    const h = new Handler({ parseFile, pendingParts: ['file1', 'file2'] })
    const spies = setSpies(h)
    if (h.wantFile('file1')) h.startFileTask('file1', new PassThrough())
    if (h.wantFile('file2')) h.startFileTask('file2', new PassThrough())
    await expect(h.donePromise).resolves.toEqual(expect.arrayContaining([10, 20]))
    expect(spies._finishTask).toBeCalledTimes(2)
    expect(spies.finish).toBeCalledTimes(1)
  })

  test('Successfully parse fields', async () => {
    const parseField = jest
      .fn()
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(20)
    const h = new Handler({ parseField, pendingParts: ['field1', 'field2'] })
    const spies = setSpies(h)
    if (h.wantField('field1')) h.startFieldTask('field1', '', false, false)
    if (h.wantField('field2')) h.startFieldTask('field2', '', false, false)
    await expect(h.donePromise).resolves.toEqual(expect.arrayContaining([10, 20]))
    expect(spies._finishTask).toBeCalledTimes(2)
    expect(spies.finish).toBeCalledTimes(1)
  })

  test('Successfully aborts on one error', async done => {
    const err = new Error('PARSE_ERROR')
    const parseField = jest
      .fn()
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(20)
    const parseFile = jest
      .fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce(30)
    const h = new Handler({
      parseField,
      parseFile,
      pendingParts: ['field1', 'field2', 'file1', 'file2'],
    })
    const spies = setSpies(h)
    if (h.wantField('field1')) h.startFieldTask('field1', '', false, false)
    if (h.wantField('field2')) h.startFieldTask('field2', '', false, false)
    if (h.wantFile('file1')) h.startFileTask('file1', new PassThrough())
    setTimeout(async () => {
      expect(spies.stopEvents).toBeCalledTimes(1)
      expect(h.wantFile('file2')).toBe(false)
      await expect(h.donePromise).rejects.toThrow(err)
      expect(spies._finishTask).toBeCalledTimes(3)
      expect(spies.abort).toBeCalledTimes(1)
      done()
    }, 1000)
  })
})
