// 路径围栏：子路径必须落在根内（防 executor cwd 逃逸，设计 §5.5）。
import { resolve, relative } from 'node:path'

export function isInside(root: string, child: string): boolean {
  const rel = relative(resolve(root), resolve(child))
  return rel === '' || (!rel.startsWith('..') && !resolve(rel).startsWith('/'))
}
