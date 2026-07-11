declare module 'proper-lockfile' {
  export interface LockOptions {
    stale?: number
    retries?: number | { retries: number; minTimeout: number; maxTimeout: number }
    update?: number
    fs?: unknown
  }
  export function lock(path: string, options?: LockOptions): Promise<() => Promise<void>>
  export function unlock(path: string): Promise<void>
  export function check(path: string, options?: LockOptions): Promise<boolean>
  export default {
    lock,
    unlock,
    check,
  }
}
