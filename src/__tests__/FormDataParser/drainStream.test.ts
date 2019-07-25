import { PassThrough } from 'stream'
import { drainStream } from '../..'

test('drainStream', done => {
  const stream = new PassThrough()
  stream.end('.'.repeat(1000000))
  stream.on('end', done)
  drainStream(stream)
})
