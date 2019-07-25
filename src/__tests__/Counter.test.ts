import { Waiter } from '@hermes-serverless/custom-promises'
import Counter from '../resources/Counter'

test('Simple Counting', () => {
  const c = new Counter()
  expect(c.isZero()).toBe(true)
  expect(c.getCount()).toBe(0)
  const fn = jest.fn()
  c.onceZero(fn)
  expect(fn).toBeCalledTimes(1)

  const fn2 = jest.fn()

  c.increment()
  expect(c.getCount()).toBe(1)
  c.increment()
  expect(c.getCount()).toBe(2)
  c.decrement()

  expect(c.getCount()).toBe(1)
  expect(c.isZero()).toBe(false)

  c.onceZero(fn2)
  c.decrement()

  expect(c.getCount()).toBe(0)
  expect(c.isZero()).toBe(true)
  expect(fn).toBeCalledTimes(1)
  expect(fn2).toBeCalledTimes(1)

  c.increment()
  expect(c.getCount()).toBe(1)
  c.decrement()
  expect(c.getCount()).toBe(0)

  expect(fn).toBeCalledTimes(1)
  expect(fn2).toBeCalledTimes(1)
})

test('OnceZeroPriority', async () => {
  const c = new Counter()
  const wait = new Waiter()
  expect.assertions(4)
  const fn1 = jest.fn(() => {
    expect(fn2).toBeCalledTimes(1)
    wait.resolve()
  })
  const fn2 = jest.fn(() => {
    expect(fn1).toBeCalledTimes(0)
  })

  c.increment()
  c.onceZero(fn1)
  c.onceZeroPriority(fn2)
  c.decrement()
  await wait.finish()
  expect(fn1).toBeCalledTimes(1)
  expect(fn2).toBeCalledTimes(1)
})
