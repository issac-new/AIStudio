// overlay/custom/client/ide/api/storage.ts
// 资源管理器 REST 客户端（/api/ide/storage/*，server 见
// custom/server/controllers/system/storage.ts；M2 对标 zcode resourceManager）。
import { request } from '@/api/client'

export interface StorageCategory {
  key: string
  path: string
  cleanable: boolean
  hint: string
  exists: boolean
  bytes: number
  files: number
}

export interface StorageSnapshot {
  categories: StorageCategory[]
  totalBytes: number
}

export const ideStorageApi = {
  snapshot(): Promise<StorageSnapshot> {
    return request<StorageSnapshot>('/api/ide/storage/snapshot')
  },
  clean(category: string): Promise<{ ok: boolean; freedBytes: number }> {
    return request('/api/ide/storage/clean', { method: 'POST', body: JSON.stringify({ category }) })
  },
  reveal(category: string): Promise<{ ok: boolean }> {
    return request('/api/ide/storage/reveal', { method: 'POST', body: JSON.stringify({ category }) })
  },
}
