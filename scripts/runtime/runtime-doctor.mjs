// overlay/scripts/runtime/runtime-doctor.mjs
// 基础运行时健康门禁。硬检查(仓库一致性,免网络免 HOME,可进 CI):
//   1. runtime/semantica/manifest.yaml 存在且 schema 合法(版本/stdio/INSTALL_DIR/
//      git 安装块/ref 已 pin 不浮动)。
//   2. runtime/pua/PIN.yaml 存在且 schema 合格(commit 40 位、skills 与数量一致)。
//   3. runtime/pua/skills/ 实际目录与 PIN 清单逐一对账(无缺失/无多余/各有 SKILL.md)。
//   4. patch 375 存在、已登记 series、其内嵌 manifest 与单一事实源逐字节一致,
//      且对当前 hermes-agent 树 git apply --check 可应用(或已应用)。
// 软检查(仅 --hermes-home <path> 时):pua 注册状态/semantica MCP 配置与安装落点。
//
// 退出码:硬检查全过=0;任一失败=1(软检查只报告不影响退出码)。
import { execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';
import YAML from 'yaml';
import { applyPuaRegistration } from './register-runtime.mjs';

const overlayRoot = resolve(import.meta.dirname, '..', '..');
const runtimeRoot = resolve(overlayRoot, 'runtime');
const semanticaManifestPath = resolve(runtimeRoot, 'semantica', 'manifest.yaml');
const puaRoot = resolve(runtimeRoot, 'pua');
const pinPath = resolve(puaRoot, 'PIN.yaml');
const patchPath = resolve(overlayRoot, 'patches', '375-runtime-semantica-mcp-catalog.patch');
const seriesPath = resolve(overlayRoot, 'patches', 'series');
const hermesAgentRoot = resolve(overlayRoot, '..', 'upstream', 'hermes-agent');

const failures = [];
const oks = [];
const check = (name, ok, detail = '') => {
  (ok ? oks : failures).push(name);
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/** 从新文件 patch 文本中还原文件内容(+ 行去前缀;剥 +++ 头)。 */
export function extractNewFileContent(patchText) {
  const lines = patchText.split('\n');
  const out = [];
  for (const l of lines) {
    if (l.startsWith('+++')) continue;
    if (l.startsWith('+')) out.push(l.slice(1));
  }
  // split 丢掉的末尾换行:重建为以 \n 连接并补末行换行(patch 中最后一行 + 后隐含 \n,
  // 与源文件 writeFileSync 的尾换行一致;若源无尾换行,patch 会在 \ No newline at end 标记,
  // 此处遇到该标记时去除末尾换行)。
  if (patchText.includes('\\ No newline at end of file')) return out.join('\n');
  return out.join('\n') + '\n';
}

/** semantica manifest schema 校验(纯函数,返回 [ok, problems[]])。 */
export function validateSemanticaManifest(manifestText) {
  const problems = [];
  let m;
  try {
    m = YAML.parse(manifestText);
  } catch (e) {
    return [false, [`YAML 解析失败: ${e.message}`]];
  }
  if (m?.manifest_version !== 1) problems.push('manifest_version 必须为 1');
  if (m?.name !== 'semantica') problems.push('name 必须为 semantica');
  if (m?.transport?.type !== 'stdio') problems.push('transport.type 必须为 stdio');
  const cmd = m?.transport?.command ?? '';
  if (!cmd.includes('.venv/bin/semantica-mcp')) problems.push('transport.command 应指向安装 venv 内的 semantica-mcp');
  if (!cmd.includes('${INSTALL_DIR}')) problems.push('transport.command 未引用 ${INSTALL_DIR}(git 安装型条目必须)');
  if (m?.install?.type !== 'git') problems.push('install.type 必须为 git');
  const ref = m?.install?.ref ?? '';
  if (['main', 'master', 'HEAD', ''].includes(ref)) problems.push(`install.ref 必须是固定 tag/SHA,不得浮动(当前: ${ref || '空'})`);
  if (!Array.isArray(m?.install?.bootstrap) || m.install.bootstrap.length === 0) problems.push('install.bootstrap 不得为空(需构建 venv)');
  if (m?.install?.url !== 'https://github.com/semantica-agi/semantica') problems.push('install.url 与上游仓库不符');
  return [problems.length === 0, problems];
}

/** PIN.yaml schema 校验(纯函数,返回 [ok, problems[], pin])。 */
export function validatePin(pinText) {
  const problems = [];
  let pin = null;
  try {
    pin = YAML.parse(pinText);
  } catch (e) {
    return [false, [`YAML 解析失败: ${e.message}`], null];
  }
  if (pin?.runtime !== 'pua') problems.push('runtime 必须为 pua');
  if (!/^[0-9a-f]{40}$/.test(pin?.commit ?? '')) problems.push('commit 必须为 40 位 SHA');
  if (!pin?.ref) problems.push('ref 不得为空');
  if (!Array.isArray(pin?.skills) || pin.skills.length === 0) problems.push('skills 清单不得为空');
  if (pin?.skill_count !== pin?.skills?.length) problems.push(`skill_count(${pin?.skill_count}) 与 skills 长度(${pin?.skills?.length}) 不一致`);
  return [problems.length === 0, problems, pin];
}

/** series(非注释行)中是否登记了指定 patch 文件名。 */
export function seriesListsPatch(seriesText, patchFile) {
  return seriesText
    .split('\n')
    .map((l) => l.trim())
    .some((l) => l === patchFile);
}

function main() {
  console.log('== 基础运行时 doctor(硬检查)==');

  // 1. semantica manifest
  if (!existsSync(semanticaManifestPath)) {
    check('semantica manifest 存在', false, semanticaManifestPath);
  } else {
    const [ok, problems] = validateSemanticaManifest(readFileSync(semanticaManifestPath, 'utf8'));
    check('semantica manifest schema', ok, problems.join('; '));
  }

  // 2. PIN schema
  if (!existsSync(pinPath)) {
    check('pua PIN 存在', false, pinPath);
  } else {
    const [ok, problems, pin] = validatePin(readFileSync(pinPath, 'utf8'));
    check('pua PIN schema', ok, problems.join('; '));

    // 3. skills 目录对账
    const skillsDir = resolve(puaRoot, 'skills');
    if (pin && existsSync(skillsDir)) {
      const actual = readdirSync(skillsDir).filter((e) => statSync(resolve(skillsDir, e)).isDirectory()).sort();
      const expected = [...(pin.skills ?? [])].sort();
      const missing = expected.filter((s) => !actual.includes(s));
      const extra = actual.filter((s) => !expected.includes(s));
      const noSkillMd = actual.filter((s) => !existsSync(resolve(skillsDir, s, 'SKILL.md')));
      check('pua skills 目录与 PIN 对账', missing.length === 0 && extra.length === 0 && noSkillMd.length === 0,
        [
          missing.length ? `缺失: ${missing.join(',')}` : '',
          extra.length ? `多余: ${extra.join(',')}` : '',
          noSkillMd.length ? `无 SKILL.md: ${noSkillMd.join(',')}` : '',
        ].filter(Boolean).join('; ') || `${actual.length} 个技能一一对应`);
    } else if (pin) {
      check('pua skills 目录与 PIN 对账', false, `目录不存在: ${skillsDir}`);
    }
  }

  // 4. patch 375 与单一事实源一致性 + 可应用性
  if (!existsSync(patchPath)) {
    check('patch 375 存在', false, patchPath);
  } else {
    const patchText = readFileSync(patchPath, 'utf8');
    const embedded = extractNewFileContent(patchText);
    const source = existsSync(semanticaManifestPath) ? readFileSync(semanticaManifestPath, 'utf8') : '';
    check('patch 375 内嵌 manifest 与单一事实源一致', embedded === source,
      embedded === source ? '逐字节一致' : '不一致 —— 改 runtime/semantica 后须重生成 patch');
    check('patch 375 已登记 series', seriesListsPatch(readFileSync(seriesPath, 'utf8'), '375-runtime-semantica-mcp-catalog.patch'));
    if (existsSync(hermesAgentRoot)) {
      let state = '不可应用';
      let ok = false;
      try {
        execSync(`git apply --check --reverse --whitespace=nowarn "${patchPath}"`, { cwd: hermesAgentRoot, stdio: 'ignore' });
        state = '已应用(当前注入态)'; ok = true;
      } catch {
        try {
          execSync(`git apply --check --whitespace=nowarn "${patchPath}"`, { cwd: hermesAgentRoot, stdio: 'ignore' });
          state = '可应用(干净树)'; ok = true;
        } catch { ok = false; }
      }
      check('patch 375 对 hermes-agent 可应用', ok, state);
    }
  }

  // 软检查
  const argv = process.argv.slice(2);
  const homeIdx = argv.indexOf('--hermes-home');
  if (homeIdx >= 0) {
    const home = resolve(argv[homeIdx + 1]);
    console.log(`== 软检查(--hermes-home ${home})==`);
    const configPath = resolve(home, 'config.yaml');
    if (!existsSync(configPath)) {
      console.log(`• config.yaml 不存在: ${configPath}(未注册;跑 register-runtime.mjs)`);
    } else {
      // 复用注册纯函数的幂等判定(不写回)看当前注册态。
      const reg = applyPuaRegistration(readFileSync(configPath, 'utf8'), resolve(runtimeRoot, 'pua', 'skills'));
      console.log(reg.changed ? '• pua: 未注册(跑 register-runtime.mjs)' : '• pua: 已注册(skills.external_dirs)');
    }
    const installDir = resolve(home, 'mcp-installs', 'semantica');
    console.log(existsSync(installDir)
      ? `• semantica 安装目录存在: ${installDir}`
      : '• semantica 未安装(hermes mcp install semantica)');
  }

  console.log(`\n硬检查: ${oks.length} 过 / ${failures.length} 败`);
  if (failures.length > 0) {
    console.log('失败项:', failures.join('; '));
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
