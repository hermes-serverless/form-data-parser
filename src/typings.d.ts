import { Readable } from 'stream'

export interface ReadableWithTruncatedFlag extends Readable {
  truncated?: boolean
}
