import FormData from 'form-data'
import path from 'path'

export const KB = 1000
export const MB = 1000 * KB

export const fixture = (file: string) => {
  return path.join(__dirname, '..', 'fixtures', file)
}

export const getFormData = () => {
  const fd = new FormData()
  // @ts-ignore
  fd.headers = fd.getHeaders()
  // @ts-ignore
  fd.unpipe = () => {}
  // @ts-ignore
  fd.read = () => {}
  return fd
}
