import FieldHandler from '../../handlers/FieldHandler'
import { Handler } from '../../handlers/Handler'
import PersistHandler from '../../handlers/PersistHandler'
import RealTimeStreamHandler from '../../handlers/RealTimeStreamHandler'

export const setHandlerSpies = (obj: Handler<any>) => {
  return {
    wantField: jest.spyOn(obj, 'wantField'),
    wantFile: jest.spyOn(obj, 'wantFile'),
    startFileTask: jest.spyOn(obj, 'startFileTask'),
    startFieldTask: jest.spyOn(obj, 'startFieldTask'),
    stopEvents: jest.spyOn(obj, 'stopEvents'),
    _waitTasks: jest.spyOn(obj, '_waitTasks'),
    finish: jest.spyOn(obj, 'finish'),
    abort: jest.spyOn(obj, 'abort'),
    _startTask: jest.spyOn(obj, '_startTask'),
    _finishTask: jest.spyOn(obj, '_finishTask'),
  }
}

export const setPersistHandlerSpies = (phObj: PersistHandler) => {
  return {
    // @ts-ignore
    baseHandler: setHandlerSpies(phObj.baseHandler),
    wantField: jest.spyOn(phObj, 'wantField'),
    wantFile: jest.spyOn(phObj, 'wantFile'),
    startFileTask: jest.spyOn(phObj, 'startFileTask'),
    startFieldTask: jest.spyOn(phObj, 'startFieldTask'),
    finish: jest.spyOn(phObj, 'finish'),
    abort: jest.spyOn(phObj, 'abort'),
    _parseFile: jest.spyOn(phObj, '_parseFile'),
    _parseField: jest.spyOn(phObj, '_parseField'),
    _parse: jest.spyOn(phObj, '_parse'),
  }
}

export const setFieldHandlerSpies = (fhObj: FieldHandler) => {
  return {
    // @ts-ignore
    baseHandler: setHandlerSpies(fhObj.baseHandler),
    wantField: jest.spyOn(fhObj, 'wantField'),
    wantFile: jest.spyOn(fhObj, 'wantFile'),
    startFieldTask: jest.spyOn(fhObj, 'startFieldTask'),
    finish: jest.spyOn(fhObj, 'finish'),
    abort: jest.spyOn(fhObj, 'abort'),
    _parse: jest.spyOn(fhObj, '_parse'),
  }
}

export const setRealTimeStreamHandlerSpies = (rtsObj: RealTimeStreamHandler) => {
  return {
    // @ts-ignore
    baseHandler: setHandlerSpies(rtsObj.baseHandler),
    wantField: jest.spyOn(rtsObj, 'wantField'),
    wantFile: jest.spyOn(rtsObj, 'wantFile'),
    startFileTask: jest.spyOn(rtsObj, 'startFileTask'),
    finish: jest.spyOn(rtsObj, 'finish'),
    abort: jest.spyOn(rtsObj, 'abort'),
    _parse: jest.spyOn(rtsObj, '_parse'),
  }
}
