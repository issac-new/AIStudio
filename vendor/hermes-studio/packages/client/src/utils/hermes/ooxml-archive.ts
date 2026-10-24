export interface ZipPreviewLimits {
  maxEntries: number
  maxEntryUncompressedBytes: number
  maxTotalUncompressedBytes: number
}

export const DEFAULT_OOXML_ZIP_LIMITS: ZipPreviewLimits = {
  maxEntries: 10_000,
  maxEntryUncompressedBytes: 64 * 1024 * 1024,
  maxTotalUncompressedBytes: 128 * 1024 * 1024,
}

const END_OF_CENTRAL_DIRECTORY = 0x06054b50
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50
const MIN_END_RECORD_SIZE = 22
const MAX_ZIP_COMMENT_SIZE = 0xffff

function invalidArchive(message: string): Error {
  return new Error(`Office archive is not safe to preview: ${message}`)
}

function findEndRecord(view: DataView): number {
  const firstCandidate = view.byteLength - MIN_END_RECORD_SIZE
  const lowerBound = Math.max(0, firstCandidate - MAX_ZIP_COMMENT_SIZE)
  for (let offset = firstCandidate; offset >= lowerBound; offset -= 1) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY) return offset
  }
  throw invalidArchive('ZIP directory is missing')
}

export function assertBoundedOoxmlArchive(
  data: ArrayBuffer,
  limits: ZipPreviewLimits = DEFAULT_OOXML_ZIP_LIMITS,
): void {
  if (data.byteLength < MIN_END_RECORD_SIZE) throw invalidArchive('file is truncated')
  const view = new DataView(data)
  const endOffset = findEndRecord(view)
  const diskNumber = view.getUint16(endOffset + 4, true)
  const directoryDisk = view.getUint16(endOffset + 6, true)
  const entriesOnDisk = view.getUint16(endOffset + 8, true)
  const entryCount = view.getUint16(endOffset + 10, true)
  const directorySize = view.getUint32(endOffset + 12, true)
  const directoryOffset = view.getUint32(endOffset + 16, true)
  const commentSize = view.getUint16(endOffset + 20, true)

  if (endOffset + MIN_END_RECORD_SIZE + commentSize > view.byteLength) {
    throw invalidArchive('ZIP comment is truncated')
  }
  if (diskNumber !== 0 || directoryDisk !== 0 || entriesOnDisk !== entryCount) {
    throw invalidArchive('multi-disk ZIP files are unsupported')
  }
  if (entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    throw invalidArchive('ZIP64 files are unsupported')
  }
  if (entryCount > limits.maxEntries) throw invalidArchive('too many archive entries')
  if (directoryOffset + directorySize > endOffset) throw invalidArchive('ZIP directory is invalid')

  let cursor = directoryOffset
  let totalUncompressedBytes = 0
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > endOffset || view.getUint32(cursor, true) !== CENTRAL_DIRECTORY_ENTRY) {
      throw invalidArchive('ZIP entry metadata is invalid')
    }
    const uncompressedBytes = view.getUint32(cursor + 24, true)
    if (uncompressedBytes === 0xffffffff) throw invalidArchive('ZIP64 entries are unsupported')
    if (uncompressedBytes > limits.maxEntryUncompressedBytes) {
      throw invalidArchive('an archive entry is too large')
    }
    totalUncompressedBytes += uncompressedBytes
    if (totalUncompressedBytes > limits.maxTotalUncompressedBytes) {
      throw invalidArchive('expanded archive is too large')
    }
    const fileNameSize = view.getUint16(cursor + 28, true)
    const extraSize = view.getUint16(cursor + 30, true)
    const entryCommentSize = view.getUint16(cursor + 32, true)
    cursor += 46 + fileNameSize + extraSize + entryCommentSize
  }
  if (cursor > directoryOffset + directorySize) throw invalidArchive('ZIP directory size is invalid')
}
