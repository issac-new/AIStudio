// overlay/custom/server/loop/engine/push-verify.ts
// 推演问题 dev-branch-missing 修复：编排器 git push 后必须核验远端 ref 才算交付。
// 根因：chen 本地 feat/DEV-PAYCORE 已 commit 但未 push，任务被误判完成；其他 agent 看不到。
// 约定：交付类推送后校验 ls-remote 远端 ref 与本地 HEAD 一致，不一致即不真实。
export type PushVerifyResult =
  | { ok: true; remoteRef: string; sha: string }
  | { ok: false; reason: 'not-pushed' | 'diverged' | 'offline'; detail: string }

/**
 * 校验远端分支 ref 是否与本地 HEAD 一致。
 * @param localHead  本地 HEAD sha（完整）
 * @param remoteRef  ls-remote 取到的远端 sha（可能为空字符串/未找到）
 * @param remoteOk   ls-remote 命令本身是否成功（false=网络/权限失败）
 */
export function verifyPushResult(
  localHead: string,
  remoteRef: string,
  remoteOk: boolean,
): PushVerifyResult {
  if (!remoteOk) {
    return { ok: false, reason: 'offline', detail: 'ls-remote failed (network/auth)' }
  }
  if (!remoteRef) {
    return { ok: false, reason: 'not-pushed', detail: 'remote ref not found (push did not land)' }
  }
  const remote = remoteRef.trim().split(/\s+/)[0] ?? ''
  if (remote !== localHead.trim()) {
    return { ok: false, reason: 'diverged', detail: `remote ${remote.slice(0, 12)} != local ${localHead.trim().slice(0, 12)}` }
  }
  return { ok: true, remoteRef: remote, sha: localHead.trim() }
}
