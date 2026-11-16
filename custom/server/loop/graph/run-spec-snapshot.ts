import { createHash } from 'node:crypto'
import { canonicalize } from '../../eval/fingerprint'
import type { GraphSpec } from './graph-spec'

export type GraphRuntimeKind = 'editor' | 'director'
export type GraphExecutionMode = 'production' | 'shadow'

export interface GraphSpecSnapshotMeta {
  specId: string
  revision: null
  draftVersion: number
  runtimeKind: GraphRuntimeKind
  executionMode: GraphExecutionMode
  contentHash: string
  createdAt: string
  createdBy?: string
}

export type StoredGraphRunSpec = GraphSpecSnapshotMeta & {
  runId: string
  spec: GraphSpec
}

export type GraphRunSpecStamp = Pick<GraphSpecSnapshotMeta, 'createdAt' | 'createdBy'>

/** GraphSpec 使用独立 SHA-256 域；复用 Eval 的规范化序列化但不改变其 SHA-1 指纹。 */
export function graphSpecContentHash(spec: GraphSpec): string {
  return createHash('sha256').update(canonicalize(spec), 'utf8').digest('hex')
}
