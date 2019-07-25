import { createFsReadStream } from '@hermes-serverless/fs-utils'
import execa from 'execa'
import { Request } from 'express'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { PassThrough } from 'stream'
import FormDataParser from '../..'
import { FieldsLimitExceeded, ParsingErrors, UnsupportedContentType } from '../../errors'
import { Logger } from '../../utils/Logger'
import { fixture, getFormData } from './util'

Logger.enabled = false
const tmpPath = path.join(os.tmpdir(), 'input-parser-error-tests')

beforeEach(() => {
  if (!fs.existsSync(tmpPath)) fs.mkdirSync(tmpPath, { recursive: true })
})

afterEach(() => {
  execa.sync('rm', ['-rf', tmpPath])
})

describe('Error handling work as expected', () => {
  test('Invalid headers should throw', async () => {
    const s = new PassThrough()
    s.end('.'.repeat(1000))
    try {
      new FormDataParser((s as unknown) as Request, tmpPath)
    } catch (err) {
      expect(err).toBeInstanceOf(ParsingErrors)
      expect(err.errors.length).toBe(1)
      expect(err.errors[0]).toBeInstanceOf(UnsupportedContentType)
    }
  })

  test('Invalid multipart shoult throw', async () => {
    const s = new PassThrough()
    // @ts-ignore
    s.headers = { 'content-type': 'multipart/form-data; boundary=asdasdasdasd' }
    s.end(
      [
        '--asdasdasdasd\r\n',
        'Content-Type: text/plain\r\n',
        'Content-Disposition: form-data; name="foo"\r\n',
        '\r\n',
        'asd\r\n',
        '--asdasdasdasd--',
      ].join(':)')
    )
    const p = new FormDataParser((s as unknown) as Request, tmpPath)
    expect.assertions(3)
    p.start()
    try {
      await p.donePromise
    } catch (err) {
      expect(err).toBeInstanceOf(ParsingErrors)
      expect(err.errors.length).toBe(1)
      expect(err.errors[0].message).toBe('Unexpected end of multipart data')
    }
  })

  test('Files limit should throw', async done => {
    const fd = getFormData()
    fd.append('field1', '.'.repeat(100))
    fd.append('field2', '.'.repeat(100))
    fd.append('file2', await createFsReadStream(fixture('2000')))
    fd.append('file1', await createFsReadStream(fixture('1000')))
    const p = new FormDataParser((fd as unknown) as Request, tmpPath, { limits: { files: 1 } })
    p.start()
    try {
      await p.donePromise
    } catch (err) {
      expect(err).toBeInstanceOf(ParsingErrors)
      expect(err.errors.length).toBeGreaterThanOrEqual(1)
      err.errors.forEach((el: Error) => expect(el).toBeInstanceOf(FieldsLimitExceeded))
      err.errors.forEach((el: Error) => expect(el.message.includes('file(s)')).toBe(true))
      done()
    }
  })

  test('Fields limit should throw', async done => {
    const fd = getFormData()
    fd.append('field1', '.'.repeat(100))
    fd.append('field2', '.'.repeat(100))
    fd.append('file2', await createFsReadStream(fixture('2000')))
    fd.append('file1', await createFsReadStream(fixture('1000')))
    const p = new FormDataParser((fd as unknown) as Request, tmpPath, { limits: { fields: 1 } })
    p.start()
    try {
      await p.donePromise
    } catch (err) {
      expect(err).toBeInstanceOf(ParsingErrors)
      expect(err.errors.length).toBeGreaterThanOrEqual(1)
      err.errors.forEach((el: Error) => expect(el).toBeInstanceOf(FieldsLimitExceeded))
      err.errors.forEach((el: Error) => expect(el.message.includes('field(s)')).toBe(true))
      done()
    }
  })

  test('Parts limit should throw', async done => {
    const fd = getFormData()
    fd.append('field1', '.'.repeat(100))
    fd.append('field2', '.'.repeat(100))
    fd.append('file2', await createFsReadStream(fixture('2000')))
    fd.append('file1', await createFsReadStream(fixture('1000')))
    const p = new FormDataParser((fd as unknown) as Request, tmpPath, { limits: { parts: 1 } })
    p.start()
    try {
      await p.donePromise
    } catch (err) {
      expect(err).toBeInstanceOf(ParsingErrors)
      expect(err.errors.length).toBeGreaterThanOrEqual(1)
      err.errors.forEach((el: Error) => expect(el).toBeInstanceOf(FieldsLimitExceeded))
      err.errors.forEach((el: Error) => expect(el.message.includes('part(s)')).toBe(true))
      done()
    }
  })
})
