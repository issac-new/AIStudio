"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectSandboxSupport = detectSandboxSupport;
exports.runSandboxed = runSandboxed;
// overlay/sandbox OS 级执行沙箱决策面（2026-10-21 挂账清偿批次 C）。
// 动机：Cloudflare 安全审计 Skill 的硬要求——执行目标控制的构建/测试/fuzz 必须
// OS 级沙箱（禁外网、净化 env、只写指定目录、限资源）。本模块是该能力的单一决策面：
//   - darwin：sandbox-exec（seatbelt profile）
//   - linux：bwrap（bubblewrap）
//   - 其余/探测失败：unavailable——调用方必须 fail-closed（拒绝执行），绝不降级裸跑。
// 消费方：qgate command executor（sandbox: true 档）等；红队沙箱攻防后续轮接线。
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
/** 探测本机沙箱能力（每次真探测，不缓存——能力可被系统策略收回，缓存会造假）。
 * HERMES_EXEC_SANDBOX=off：运维/策略显式禁用（unavailable，fail-closed）。 */
function detectSandboxSupport(deps = {}) {
    if (process.env.HERMES_EXEC_SANDBOX === 'off') {
        return { backend: 'none', available: false, detail: 'sandbox disabled by HERMES_EXEC_SANDBOX=off' };
    }
    const probe = deps.probe ?? ((bin) => {
        try {
            const r = (0, node_child_process_1.spawnSync)('/usr/bin/which', [bin], { stdio: 'ignore', timeout: 5000 });
            return r.status === 0;
        }
        catch {
            return false;
        }
    });
    if (process.platform === 'darwin') {
        return probe('sandbox-exec')
            ? { backend: 'darwin-sandbox-exec', available: true, detail: 'sandbox-exec (seatbelt) available' }
            : { backend: 'none', available: false, detail: 'sandbox-exec not found on darwin' };
    }
    if (process.platform === 'linux') {
        return probe('bwrap')
            ? { backend: 'linux-bwrap', available: true, detail: 'bwrap (bubblewrap) available' }
            : { backend: 'none', available: false, detail: 'bwrap not found on linux' };
    }
    return { backend: 'none', available: false, detail: `no OS sandbox backend for platform ${process.platform}` };
}
/** darwin seatbelt profile：禁网、禁写（白名单目录放行）、其余默认拒绝以外的执行/读放行。
 * 白名单根先 realpath 归一（/tmp 等符号链接下 subpath 按真实路径 /private/... 匹配）。 */
function seatbeltProfile(writableRoots) {
    const normalized = [...new Set(writableRoots.flatMap((root) => {
            try {
                return [root, (0, node_fs_1.realpathSync)(root)];
            }
            catch {
                return [root];
            }
        }))];
    const allowWrites = normalized.map((root) => `(allow file-write* (subpath "${root}"))`).join('\n');
    return `(version 1)
(deny default)
(allow process-exec)
(allow process-fork)
(allow file-read*)
(allow sysctl*)
(deny file-write*)
${allowWrites}
(deny network*)`;
}
/** linux bwrap 参数：只挂根只读 + 白名单目录可写、清 env、断网。 */
function bwrapArgv(opts, env) {
    const argv = ['--unshare-net', '--die-with-parent', '--ro-bind', '/', '/', '--clearenv'];
    for (const [key, value] of Object.entries(env))
        argv.push('--setenv', key, value);
    for (const root of opts.writableRoots ?? [])
        argv.push('--bind', root, root);
    argv.push('--chdir', opts.cwd, '--', ...opts.argv);
    return argv;
}
function sanitizedEnv(allowlist) {
    const env = { PATH: '/usr/bin:/bin:/usr/local/bin' };
    if (process.env.LANG)
        env.LANG = process.env.LANG;
    for (const key of allowlist) {
        const value = process.env[key];
        if (value !== undefined)
            env[key] = value;
    }
    return env;
}
/** 在 OS 沙箱内执行固定 argv（无 shell 拼接）。不可用 → unavailable，绝不裸跑。 */
async function runSandboxed(opts, deps = {}) {
    const support = detectSandboxSupport(deps);
    if (!support.available) {
        return { status: 'unavailable', stdout: '', stderr: '', detail: support.detail };
    }
    const env = sanitizedEnv(opts.envAllowlist ?? []);
    let argv;
    if (support.backend === 'darwin-sandbox-exec') {
        argv = ['/usr/bin/sandbox-exec', '-p', seatbeltProfile(opts.writableRoots ?? []), ...opts.argv];
    }
    else {
        argv = ['bwrap', ...bwrapArgv(opts, env)];
    }
    return await new Promise((resolve) => {
        let child;
        try {
            child = (0, node_child_process_1.spawn)(argv[0], argv.slice(1), { cwd: opts.cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
        }
        catch (e) {
            resolve({ status: 'error', stdout: '', stderr: '', detail: `spawn failed: ${e.message}` });
            return;
        }
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
        }, opts.timeoutMs ?? 120_000);
        child.stdout?.on('data', (c) => { if (stdout.length < 64_000)
            stdout += String(c); });
        child.stderr?.on('data', (c) => { if (stderr.length < 64_000)
            stderr += String(c); });
        child.on('error', (e) => { clearTimeout(timer); resolve({ status: 'error', stdout, stderr, detail: e.message }); });
        child.on('close', (code) => {
            clearTimeout(timer);
            if (timedOut)
                resolve({ status: 'timeout', stdout, stderr, detail: `timed out after ${opts.timeoutMs ?? 120_000}ms` });
            else
                resolve({ status: 'ok', exitCode: code, stdout, stderr });
        });
    });
}
