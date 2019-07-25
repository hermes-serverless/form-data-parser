import { createFsReadStream, fileExists } from '@hermes-serverless/fs-utils'
import { randomBytes } from 'crypto'
import execa from 'execa'
import fs from 'fs'
import getStream from 'get-stream'
import os from 'os'
import path from 'path'
import { PassThrough } from 'stream'
import { AbortedPump, FileSizeLimit } from '../errors'
import AbortableFilePump from '../resources/AbortableFilePump'

const tmpPath = path.join(os.tmpdir(), 'abortable-file-pump-tests')

const getFile = () => {
  return path.join(tmpPath, randomBytes(8).toString('hex'))
}

beforeEach(() => {
  if (!fs.existsSync(tmpPath)) fs.mkdirSync(tmpPath, { recursive: true })
})

afterEach(() => {
  execa.sync('rm', ['-rf', tmpPath])
})

test('Work when limit not emited and truncated is false', async () => {
  const s = new PassThrough()
  s.write('.'.repeat(1000000))
  setTimeout(() => {
    s.end('.'.repeat(1000000))
  }, 500)

  const filePath = getFile()
  const p = new AbortableFilePump(s, filePath)
  const sz = await p.start()
  await expect(fileExists(filePath)).resolves.toBe(true)
  expect(sz).toBe(2 * 1000000)
})

test('Created file has valid content', async () => {
  const fsize = 1000000
  const p = execa('node', ['-e', `console.log(".".repeat(${fsize} - 1))`])
  const filePath = getFile()
  const pump = new AbortableFilePump(p.stdout, filePath)
  const size = await pump.start()
  expect(size).toBe(1000000)
  const content = await getStream(await createFsReadStream(filePath))
  expect(content).toBe('.'.repeat(fsize - 1) + '\n')
})

test('Throw when limit is emited', async () => {
  const s = new PassThrough()

  s.write('.'.repeat(1000000))
  setTimeout(() => {
    // @ts-ignore
    s.truncated = true
    s.emit('limit')
    s.end('.'.repeat(1000000))
  }, 1000)

  expect.assertions(1)
  try {
    const p = new AbortableFilePump(s, getFile())
    await p.start()
  } catch (err) {
    expect(err).toBeInstanceOf(FileSizeLimit)
  }
})

test('Throw when trucated is true', async () => {
  const s = new PassThrough()

  expect.assertions(1)
  s.write('.'.repeat(1000000))
  // @ts-ignore
  s.truncated = true

  try {
    const p = new AbortableFilePump(s, getFile())
    await p.start()
  } catch (err) {
    expect(err).toBeInstanceOf(FileSizeLimit)
  }
})

test('Abort work when limit not emited and truncated is false', async () => {
  const s = new PassThrough()
  s.write('.'.repeat(1000000))
  setTimeout(() => {
    s.end('.'.repeat(1000000))
  }, 500)

  const filePath = getFile()
  const p = new AbortableFilePump(s, filePath)
  const promise = p.start()
  setTimeout(p.abort, 250)

  expect.assertions(1)
  try {
    await promise
  } catch (err) {
    expect(err).toBeInstanceOf(AbortedPump)
  }
})

test('Abort work before ending stream', async () => {
  const s = new PassThrough()
  s.write('.'.repeat(1000000))

  const filePath = getFile()
  const p = new AbortableFilePump(s, filePath)
  const promise = p.start()
  setTimeout(p.abort, 250)

  expect.assertions(1)
  try {
    await promise
  } catch (err) {
    expect(err).toBeInstanceOf(AbortedPump)
  }
})

test('Can abort after is done and nothing happens', async () => {
  const s = new PassThrough()
  s.end('.'.repeat(1000000))
  const filePath = getFile()
  const p = new AbortableFilePump(s, filePath)
  await p.start()
  p.abort()
})

test('Can abort before start and throw error', async () => {
  const s = new PassThrough()
  s.end('.'.repeat(1000000))
  const filePath = getFile()
  const p = new AbortableFilePump(s, filePath)
  p.abort()
  await expect(p.start()).rejects.toBeInstanceOf(AbortedPump)
})

test('Can abort before emitting limit', async () => {
  const s = new PassThrough()

  s.write('.'.repeat(1000000))
  setTimeout(() => {
    // @ts-ignore
    s.truncated = true
    s.emit('limit')
    s.end('.'.repeat(1000000))
  }, 1000)
  const p = new AbortableFilePump(s, getFile())
  setTimeout(p.abort, 500)

  expect.assertions(1)
  try {
    await p.start()
  } catch (err) {
    expect(err).toBeInstanceOf(AbortedPump)
  }
})
