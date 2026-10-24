/// <reference lib="webworker" />
import readXlsxFile, { readSheetNames } from 'read-excel-file/web-worker'
import { limitTabularRows } from '@/utils/hermes/tabular-preview'
import { assertBoundedOoxmlArchive } from '@/utils/hermes/ooxml-archive'

let workbookBlob: Blob | null = null
let workbookSheetNames: string[] = []

self.onmessage = async (event: MessageEvent<{ type: 'open' | 'sheet'; data?: ArrayBuffer; sheet?: string }>) => {
  try {
    if (event.data.type === 'open') {
      if (!event.data.data) throw new Error('Workbook data is missing')
      assertBoundedOoxmlArchive(event.data.data)
      workbookBlob = new Blob([event.data.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      workbookSheetNames = await readSheetNames(workbookBlob)
      const visibleSheetNames = workbookSheetNames.slice(0, 50)
      if (!visibleSheetNames.length) throw new Error('Workbook does not contain worksheets')
      const rows = await readXlsxFile(workbookBlob, { sheet: visibleSheetNames[0] })
      self.postMessage({ type: 'loaded', sheetNames: visibleSheetNames, activeSheet: visibleSheetNames[0], ...limitTabularRows(rows) })
      return
    }
    if (!workbookBlob || !event.data.sheet || !workbookSheetNames.includes(event.data.sheet)) {
      throw new Error('Workbook is not loaded')
    }
    const rows = await readXlsxFile(workbookBlob, { sheet: event.data.sheet })
    self.postMessage({ type: 'sheet', activeSheet: event.data.sheet, ...limitTabularRows(rows) })
  } catch (error) {
    self.postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error) })
  }
}

export {}
