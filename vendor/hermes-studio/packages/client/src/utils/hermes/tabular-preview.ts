export const MAX_TABLE_ROWS = 1_000
export const MAX_TABLE_COLUMNS = 100
export const MAX_TABLE_CELLS = 20_000
export const MAX_CELL_CHARACTERS = 10_000

export interface TabularPreviewResult {
  rows: string[][]
  truncated: boolean
}

function detectDelimiter(content: string): string {
  const sample = content.slice(0, 8_000)
  const counts = new Map<string, number>([[',', 0], ['\t', 0], [';', 0]])
  let quoted = false
  for (let index = 0; index < sample.length; index += 1) {
    const char = sample[index]
    if (char === '"') {
      if (quoted && sample[index + 1] === '"') index += 1
      else quoted = !quoted
      continue
    }
    if (!quoted && (char === '\n' || char === '\r')) break
    if (!quoted && counts.has(char)) counts.set(char, (counts.get(char) || 0) + 1)
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || ','
}

export function limitTabularRows(input: unknown[][]): TabularPreviewResult {
  const rows: string[][] = []
  let cellCount = 0
  let truncated = input.length > MAX_TABLE_ROWS
  for (const inputRow of input.slice(0, MAX_TABLE_ROWS)) {
    if (cellCount >= MAX_TABLE_CELLS) {
      truncated = true
      break
    }
    if (inputRow.length > MAX_TABLE_COLUMNS) truncated = true
    const row = inputRow.slice(0, Math.min(MAX_TABLE_COLUMNS, MAX_TABLE_CELLS - cellCount)).map(value => {
      const text = value instanceof Date
        ? value.toISOString()
        : value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
      if (text.length > MAX_CELL_CHARACTERS) {
        truncated = true
        return `${text.slice(0, MAX_CELL_CHARACTERS)}…`
      }
      return text
    })
    cellCount += row.length
    rows.push(row)
  }
  return { rows, truncated }
}

export function parseCsvPreview(content: string): TabularPreviewResult {
  const delimiter = detectDelimiter(content)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let truncated = false
  let cellCount = 0

  const pushField = () => {
    if (row.length >= MAX_TABLE_COLUMNS || cellCount >= MAX_TABLE_CELLS) {
      truncated = true
    } else {
      row.push(field.length > MAX_CELL_CHARACTERS ? `${field.slice(0, MAX_CELL_CHARACTERS)}…` : field)
      if (field.length > MAX_CELL_CHARACTERS) truncated = true
      cellCount += 1
    }
    field = ''
  }
  const pushRow = () => {
    pushField()
    if (rows.length < MAX_TABLE_ROWS) rows.push(row)
    else truncated = true
    row = []
  }

  for (let index = 0; index < content.length; index += 1) {
    if (rows.length >= MAX_TABLE_ROWS || cellCount >= MAX_TABLE_CELLS) {
      truncated = true
      break
    }
    const char = content[index]
    if (char === '"') {
      if (quoted && content[index + 1] === '"') {
        if (field.length < MAX_CELL_CHARACTERS) field += '"'
        else truncated = true
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (!quoted && char === delimiter) {
      pushField()
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && content[index + 1] === '\n') index += 1
      pushRow()
    } else if (field.length < MAX_CELL_CHARACTERS) {
      field += char
    } else {
      truncated = true
    }
  }
  if (field || row.length) pushRow()
  return { rows, truncated }
}
