// overlay/scripts/runtime/register-runtime.mjs
// 把基础运行时注册进目标 hermes profile(HERMES_HOME)。
//
// 用法:
//   node scripts/runtime/register-runtime.mjs [--hermes-home <path>]
//     --hermes-home 默认 ~/.hermes(须为 profile 根,即含 config.yaml 的目录;
//     命名约定见项目记忆:HERMES_HOME 路径以 /.hermes 结尾)。
//
// 注册内容:
//   1. pua 技能集 → config.yaml `skills.external_dirs` 追加
//      overlay/runtime/pua/skills 的绝对路径(幂等;hermes 语义:外部目录只读、
//      与本地技能重名时本地优先 —— 更新一律在 overlay 侧做,注册一次即可)。
//   2. semantica → 不自动安装(安装=git clone+venv+pip,分钟级,留给
//      `hermes mcp install semantica` 或 studio MCP 浏览器触发)。本脚本只
//      报告 mcp_servers.semantica 是否已配置。
//
// 设计约束:
//   - YAML 往返走 `yaml` 包 Document API(保留注释与既有键序),不字符串拼接。
//   - 纯函数(计算目标 config 变更)与 IO 分离,守门测试免 HOME 驱动纯函数。
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';
import YAML, { YAMLMap, YAMLSeq, Scalar, isMap, isSeq } from 'yaml';

const overlayRoot = resolve(import.meta.dirname, '..', '..');
export const PUA_SKILLS_DIR = resolve(overlayRoot, 'runtime', 'pua', 'skills');

/** 计算 config.yaml 文本应发生的注册变更(纯函数)。
 *  返回 { changed, nextText, alreadyRegistered, registeredPath }。
 *  configText 为 null 时按"无既有配置"处理(生成最小合法配置)。 */
export function applyPuaRegistration(configText, skillsDirAbsPath) {
  const doc = configText === null ? new YAML.Document() : YAML.parseDocument(configText);
  if (configText !== null && doc.errors.length > 0) {
    throw new Error(`config.yaml 解析失败: ${doc.errors[0].message}`);
  }
  let skills = doc.get('skills');
  if (skills === undefined || skills === null) {
    skills = new YAMLMap();
    doc.set('skills', skills);
  } else if (!isMap(skills)) {
    throw new Error("config.yaml 的 `skills` 不是映射,拒绝改写(请人工检查)");
  }
  let dirs = skills.get('external_dirs');
  if (dirs === undefined || dirs === null) {
    dirs = new YAMLSeq();
    skills.set('external_dirs', dirs);
  } else if (!isSeq(dirs)) {
    throw new Error("config.yaml 的 `skills.external_dirs` 不是列表,拒绝改写(请人工检查)");
  }
  const existing = dirs.items.map((it) => String(it.value ?? ''));
  if (existing.includes(skillsDirAbsPath)) {
    return { changed: false, nextText: null, alreadyRegistered: true, registeredPath: skillsDirAbsPath };
  }
  dirs.items.push(new Scalar(skillsDirAbsPath));
  return {
    changed: true,
    nextText: String(doc),
    alreadyRegistered: false,
    registeredPath: skillsDirAbsPath,
  };
}

/** 读取 config 中 semantica MCP 的注册状态(纯函数)。 */
export function semanticaMcpStatus(configText) {
  if (configText === null || configText === undefined) return { configured: false };
  const doc = YAML.parseDocument(configText);
  if (doc.errors.length > 0) return { configured: false, parseError: true };
  const servers = doc.get('mcp_servers');
  if (!isMap(servers)) return { configured: false };
  const entry = servers.get('semantica');
  return { configured: entry !== undefined && entry !== null, enabled: entry && typeof entry === 'object' ? String((entry.get?.('enabled') ?? 'true')) : undefined };
}

function main() {
  const argv = process.argv.slice(2);
  const homeIdx = argv.indexOf('--hermes-home');
  const home = homeIdx >= 0 ? resolve(argv[homeIdx + 1]) : resolve(process.env.HOME || '.', '.hermes');
  const configPath = resolve(home, 'config.yaml');

  if (!existsSync(PUA_SKILLS_DIR)) {
    console.error(`[register-runtime] pua 技能目录不存在: ${PUA_SKILLS_DIR}(先跑 vendor-pua.mjs)`);
    process.exit(1);
  }

  const configText = existsSync(configPath) ? readFileSync(configPath, 'utf8') : null;
  const reg = applyPuaRegistration(configText, PUA_SKILLS_DIR);
  if (reg.changed) {
    writeFileSync(configPath, reg.nextText, 'utf8');
    console.log(`[register-runtime] 已把 pua 技能目录写入 ${configPath} → skills.external_dirs`);
  } else {
    console.log(`[register-runtime] pua 技能目录已注册(幂等跳过): ${configPath}`);
  }

  const sem = semanticaMcpStatus(configText);
  const installDir = resolve(home, 'mcp-installs', 'semantica');
  if (sem.configured) {
    console.log(`[register-runtime] semantica MCP: 已配置于 mcp_servers.semantica(enabled=${sem.enabled})`);
  } else {
    console.log('[register-runtime] semantica MCP: 未配置 —— 运行 `hermes mcp install semantica` 安装');
    console.log(`[register-runtime]   (安装落点 ${installDir};studio MCP 浏览器同样可触发)`);
  }
  if (existsSync(installDir)) {
    console.log(`[register-runtime] semantica 安装目录存在: ${installDir}`);
  }
  console.log('[register-runtime] 完成。新会话生效(技能索引/MCP 工具在会话启动时装载)。');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
