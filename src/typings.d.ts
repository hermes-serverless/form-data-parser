import { Readable } from 'stream'

export interface ReadableWithTruncatedFlag extends Readable {
  truncated?: boolean
}

export interface BusboyLimits {
  fieldNameSize?: number
  fieldSize?: number
  fields?: number
  fileSize?: number
  files?: number
  parts?: number
  headerPairs?: number
}

export interface FileInfo {
  name: string
  size: number
  filePath: string
}

export interface Field {
  [field: string]: string
}
