// 路径围栏：子路径必须落在根内（防 executor cwd 逃逸，设计 §5.5）。
import { isAbsolute, resolve, relative } from 'node:path'

export function isInside(root: string, child: string): boolean {
  const rel = relative(resolve(root), resolve(child))
  // 逃逸判据：relative 结果以 .. 开头（越出根）或为绝对路径（Windows 跨盘符）。
  // 回归注：曾误写 !resolve(rel).startsWith('/')——resolve 恒返绝对路径，
  // 该条件恒 false，导致一切真子目录被误判"不在根内"而静默回落根目录。
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}
