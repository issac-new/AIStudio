// overlay/custom/server/runtime/platform-exec.ts
// 「模板命令字符串」执行的跨平台封装(loop 契约 verificationIntent.programmatic /
// gate 命令,多为 `npm test` 一类)。
//
// POSIX:保持既有语义——空白切分 + execFile,参数不经 shell。
// win32:npm/npx/pnpm/yarn 是 .cmd shim,CreateProcess 只补 .exe → execFile
// 必 ENOENT;且 Node 禁止无 shell 直跑 .cmd(CVE-2024-27980)→ 经
// cmd.exe /d /s /c 执行整串(2026-09-22 win-x64 排查)。
import { exec, execFile } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

export interface TemplateCommandOpts {
  cwd?: string
  timeout?: number
  maxBuffer?: number
}

/** POSIX 侧的模板命令切分(与历史行为逐字一致:按空白切、去空段) */
export function splitTemplateCommand(command: string): string[] {
  return command.split(/\s+/).filter(Boolean)
}

/** win32 侧的 cmd.exe 包装参数 */
export function buildWindowsCommandArgs(command: string): string[] {
  return ['/d', '/s', '/c', command]
}

export async function execTemplateCommand(
  command: string,
  opts: TemplateCommandOpts = {},
): Promise<{ stdout: string; stderr: string }> {
  if (process.platform === 'win32') {
    return execAsync(command, { ...opts, windowsHide: true })
  }
  const parts = splitTemplateCommand(command)
  return execFileAsync(parts[0], parts.slice(1), { ...opts, windowsHide: true })
}
