// overlay[eval] 特征哈希 bigram 向量（JoyAI 挂账清偿批 B2，2026-10-26）。
//
// 范式来源：数据飞轮 few-shot 记忆库的相似度召回——上批口径是字符 ROUGE-L
// （词面序列），对「同义词组不同顺序」盲。本模块补向量口径：特征哈希
// （hashing trick）把文本字符 bigram 映射进定长向量算余弦——零模型、零依赖、
// 确定性（同文本同向量），是无 embedding 基建下可测的真向量基线。
// 不引外部 embedding：模型下载离线不可用，违反仓零依赖确定性基线（spec D2）。
import { stripStopwords, DEFAULT_STOPWORDS } from './similarity'

/** 向量维度：512 维 bigram 桶——冲突率与算力平衡点（确定性，勿随意改=口径漂移）。 */
export const HASH_DIM = 512

/** FNV-1a 32 位哈希（确定性，跨平台稳定——不用 Node crypto 大对象，纯整数运算）。 */
function fnv1a(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** 文本 → 定长 bigram 计数向量（停用词清洁后字符 bigram 入桶；<2 字符文本零向量）。 */
export function bigramVector(text: string, stopwords: ReadonlySet<string> = DEFAULT_STOPWORDS): Float32Array {
  const v = new Float32Array(HASH_DIM)
  const clean = stripStopwords(text ?? '', stopwords)
  for (let i = 0; i + 1 < clean.length; i++) {
    v[fnv1a(clean.slice(i, i + 2)) % HASH_DIM] += 1
  }
  return v
}

/** 余弦相似度：0~1；任一侧零向量 → 0（无 bigram 可比，不猜数）。 */
export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < HASH_DIM; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/** 便捷入口：两文本的 bigram 余弦。 */
export function bigramSimilarity(a: string, b: string): number {
  return cosine(bigramVector(a), bigramVector(b))
}
