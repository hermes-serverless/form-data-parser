import { MissingRequestedFormEntries } from '../../errors'
import FieldHandler from '../../handlers/FieldHandler'
import { Logger } from '../../utils/Logger'
import { setFieldHandlerSpies as setSpies } from './testUtils'

Logger.enabled = false

const commonFhArgs = {
  busboyLimits: { fieldNameSize: 10 },
}

describe('Test functionality', () => {
  const checkField = async (fieldObj: { [field: string]: string }, expectedName: string, expectedContent: string) => {
    expect(fieldObj[expectedName]).toBe(expectedContent)
  }

  test('Doesnt accept files', async () => {
    const fh = new FieldHandler({ ...commonFhArgs, fieldsToReturn: ['field1', 'field2'] })
    expect(fh.wantFile('field1')).toBe(false)
    expect(fh.wantField('field1')).toBe(true)
    expect(fh.wantFile('field2')).toBe(false)
    expect(fh.wantFile('file1')).toBe(false)
  })

  test('No parts work', async () => {
    const fh = new FieldHandler({ ...commonFhArgs, fieldsToReturn: [] })
    const fields = await fh.donePromise
    await expect(fh.finish()).resolves.toBe(undefined)
    await expect(fh.donePromise).resolves.toEqual([])
    expect(fields.length).toBe(0)
  })

  test('One field work', async () => {
    const fh = new FieldHandler({ ...commonFhArgs, fieldsToReturn: ['field1'] })
    fh.startFieldTask('field1', 'y'.repeat(3000), false, false)
    const fields = await fh.donePromise
    await expect(fh.finish()).resolves.toBe(undefined)
    expect(fields.length).toBe(1)
    await checkField(fields[0], 'field1', 'y'.repeat(3000))
  })

  test('Two fields work', async () => {
    const fh = new FieldHandler({
      ...commonFhArgs,
      fieldsToReturn: ['field1', 'field3'],
    })
    fh.startFieldTask('field1', '1'.repeat(3000000), false, false)
    fh.startFieldTask('field3', '3'.repeat(3000000), false, false)

    const fields = await fh.donePromise
    await expect(fh.finish()).resolves.toBe(undefined)

    expect(fields.length).toBe(2)
    const field1 = fields.find(el => el['field1'] != null)
    const field3 = fields.find(el => el['field3'] != null)

    await checkField(field1, 'field1', '1'.repeat(3000000))
    await checkField(field3, 'field3', '3'.repeat(3000000))
  })

  test('Finishing with missing fieldsToReturn abort', async () => {
    const fh = new FieldHandler({ ...commonFhArgs, fieldsToReturn: ['field3', 'field2'] })
    const spies = setSpies(fh)
    fh.startFieldTask('field3', '3'.repeat(3000), false, false)

    setTimeout(async () => {
      await expect(fh.finish()).resolves.toBe(undefined)
    }, 1000)

    await expect(fh.donePromise).rejects.toThrow(MissingRequestedFormEntries)
    expect(spies.baseHandler._finishTask).toBeCalledTimes(1)
    expect(spies.baseHandler._finishTask.mock.calls[0][0]).toBe('field3')
    expect(spies.baseHandler._finishTask.mock.calls[0].length).toEqual(3)
    expect(spies.baseHandler.abort).toBeCalledTimes(1)
    expect(spies.baseHandler.abort.mock.calls[0][0]).toBeInstanceOf(MissingRequestedFormEntries)
  })

  test('Finish right after starting tasks doesnt throw', async () => {
    const fh = new FieldHandler({ ...commonFhArgs, fieldsToReturn: ['field1', 'field2'] })
    fh.startFieldTask('field2', 't'.repeat(1000), false, false)
    fh.startFieldTask('field1', 'y'.repeat(1000), false, false)
    await expect(fh.finish()).resolves.toBe(undefined)

    const fields = await fh.donePromise
    expect(fields.length).toBe(2)
    const field1 = fields.find(el => el['field1'] != null)
    const field2 = fields.find(el => el['field2'] != null)
    await checkField(field1, 'field1', 'y'.repeat(1000))
    await checkField(field2, 'field2', 't'.repeat(1000))
  })

  test('Abort after fieldsToReturn promise is done doesnt throw fieldsToReturn promise', async () => {
    const fh = new FieldHandler({ ...commonFhArgs, fieldsToReturn: ['field1'] })
    const spies = setSpies(fh)
    fh.startFieldTask('field1', 'y'.repeat(1000), false, false)
    await fh.donePromise
    const err = new Error('TEST_ERROR')
    await fh.abort(err)
    const fields = await fh.donePromise
    expect(spies.baseHandler.abort).toBeCalledTimes(1)
    expect(spies.abort.mock.calls[0][0]).toBe(err)
    await checkField(fields[0], 'field1', 'y'.repeat(1000))
  })

  test('Abort before fieldsToReturn promise is done makes fieldsToReturn promise throw', async () => {
    const fh = new FieldHandler({ ...commonFhArgs, fieldsToReturn: ['field1', 'field2'] })
    const spies = setSpies(fh)
    fh.startFieldTask('field1', 'y'.repeat(1000), false, false)
    const err = new Error('TEST_ERROR')
    setTimeout(async () => {
      await fh.abort(err)
    }, 1000)
    await expect(fh.donePromise).rejects.toThrow(err)
    expect(spies.abort).toBeCalledTimes(1)
    expect(spies.abort.mock.calls[0][0]).toBe(err)
  })

  test('Can abort after finish and nothing happens', async () => {
    const fh = new FieldHandler({ ...commonFhArgs, fieldsToReturn: ['field1'] })
    fh.startFieldTask('field1', 'y'.repeat(3000), false, false)
    await fh.donePromise
    await expect(fh.finish()).resolves.toBe(undefined)
    const err = new Error('TEST_ERROR')
    await fh.abort(err)
    const fields = await fh.donePromise
    expect(fields.length).toBe(1)
    await checkField(fields[0], 'field1', 'y'.repeat(3000))
  })

  test('Can finish after abort and nothing happens', async done => {
    const fh = new FieldHandler({ ...commonFhArgs, fieldsToReturn: ['field1', 'field2'] })
    fh.startFieldTask('field1', 'y'.repeat(1000), false, false)
    const err = new Error('TEST_ERROR')

    setTimeout(async () => {
      await fh.abort(err)
    }, 1000)

    setTimeout(async () => {
      await expect(fh.finish()).resolves.toBe(undefined)
    }, 2000)

    setTimeout(async () => {
      await expect(fh.donePromise).rejects.toThrow(err)
      done()
    }, 3000)
  })

  test('Can finish after finish and nothing happens', async done => {
    const fh = new FieldHandler({ ...commonFhArgs, fieldsToReturn: ['field1'] })
    fh.startFieldTask('field1', '.'.repeat(1000), false, false)

    setTimeout(async () => {
      await expect(fh.finish()).resolves.toBe(undefined)
    }, 1000)

    setTimeout(async () => {
      await expect(fh.finish()).resolves.toBe(undefined)
    }, 2000)

    setTimeout(async () => {
      const fields = await fh.donePromise
      expect(fields.length).toBe(1)
      await checkField(fields[0], 'field1', '.'.repeat(1000))
      done()
    }, 3000)
  })

  test('Can abort after abort and nothing happens', async done => {
    const fh = new FieldHandler({ ...commonFhArgs, fieldsToReturn: ['field1'] })
    fh.startFieldTask('field1', '.'.repeat(1000), false, false)

    const err = new Error('TEST_ERROR')
    setTimeout(async () => {
      await fh.abort(err)
    }, 1000)

    setTimeout(async () => {
      await fh.abort(err)
    }, 2000)

    setTimeout(async () => {
      const fields = await fh.donePromise
      expect(fields.length).toBe(1)
      await checkField(fields[0], 'field1', '.'.repeat(1000))
      done()
    }, 3000)
  })
})
