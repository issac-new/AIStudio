export type SandboxBackend = 'darwin-sandbox-exec' | 'linux-bwrap' | 'none';
export interface SandboxSupport {
    backend: SandboxBackend;
    available: boolean;
    detail: string;
}
export interface SandboxRunResult {
    status: 'ok' | 'unavailable' | 'error' | 'timeout';
    exitCode?: number | null;
    stdout: string;
    stderr: string;
    detail?: string;
}
export interface SandboxRunOptions {
    argv: string[];
    cwd: string;
    /** 允许写入的目录白名单（不声明则全只读）。 */
    writableRoots?: string[];
    timeoutMs?: number;
    /** 额外透传的环境变量名（基础白名单 PATH/LANG 之外）。 */
    envAllowlist?: string[];
}
export interface SandboxDeps {
    /** 可注入探测函数（测试用）；缺省 which 真探测。 */
    probe?: (bin: string) => boolean;
}
/** 探测本机沙箱能力（每次真探测，不缓存——能力可被系统策略收回，缓存会造假）。
 * HERMES_EXEC_SANDBOX=off：运维/策略显式禁用（unavailable，fail-closed）。 */
export declare function detectSandboxSupport(deps?: SandboxDeps): SandboxSupport;
/** 在 OS 沙箱内执行固定 argv（无 shell 拼接）。不可用 → unavailable，绝不裸跑。 */
export declare function runSandboxed(opts: SandboxRunOptions, deps?: SandboxDeps): Promise<SandboxRunResult>;
