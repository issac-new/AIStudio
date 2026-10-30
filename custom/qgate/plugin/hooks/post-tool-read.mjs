#!/usr/bin/env node
// QGate PostToolUse(Read) hook —— 四层上下文读取计量（2026-10-30 HelixHarness 吸收轮）。
//
// 动机：复用其 telemetry 的 context_reads 指标——回答「一次任务里 knowledge/harness/
// specs/hooks 四层各被读了多少次」。AIStudio 已有 trace 观测，但 trace 层不区分上下文
// 来源；本钩子在工具边界上做纯本地计数，零网络、零模型调用。
//
// 口径与边界：
//   - 只记录「读文件」类工具（Read）。路径按仓库相对化后分类，仓外路径归 other。
//   - 账本 <cwd>/.qgate/reads.jsonl（运行态，.qgate/.gitignore 已排除，不入库）。
//   - 分层表单一事实源 .qgate/context-layers.json；读不到时退回内置默认（同 TS 侧）。
//   - async fire-and-forget（hooks.json 配置）：事件可能滞后，计数用于趋势不用于结算。
//   - appendFileSync 无锁：单行很小，并发子代理下极端情况可能行交错——聚合适配器跳过坏行。
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
/** 内置默认（仅当 .qgate/context-layers.json 缺席时使用；与 TS 侧 DEFAULT_LAYERS 同构）。 */
const DEFAULT_LAYERS = {
  knowledge: ["custom/server/knowledge/", ".swarm-yuan/project-knowledge.md", ".swarm-yuan/notes/", "skills/swarm-yuan/references/", ".claude/skills/", "docs/reports/"],
  harness: ["AGENTS.md", "vendor/VENDOR.md", "config/", "registries/", "scripts/", "patches/", "zcode-patches/", "runtime/", "skills/swarm-yuan/assets/", "package.json", "custom/"],
  specs: ["docs/superpowers/specs/"],
  hooks: [".swarm-yuan/hooks/", ".qgate/", "custom/qgate/", ".github/workflows/"],
};

let input = {};
try {
  const raw = await new Promise((resolve, reject) => {
    let data = "";
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
  input = raw ? JSON.parse(raw) : {};
} catch {
  process.exit(0);
}

const tool = input.tool_name ?? input.toolName;
// 只关心读；Write/Edit 由 post-tool.mjs 记变更事件，职责不重叠。
if (tool !== "Read") process.exit(0);

const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd();
if (!existsSync(join(cwd, ".qgate"))) process.exit(0);

const file = pickFilePath(input.tool_input ?? input.toolInput);
if (!file) process.exit(0);

const rel = normalize(cwd, file);
const layer = classify(rel, loadLayers(cwd));

try {
  appendFileSync(
    join(cwd, ".qgate", "reads.jsonl"),
    JSON.stringify({ ts: new Date().toISOString(), tool: "Read", path: rel, layer }) + "\n",
  );
} catch {
  /* no-op：观测缺失不阻断业务（fail-soft 不造假） */
}
process.exit(0);

function pickFilePath(toolInput) {
  if (!toolInput || typeof toolInput !== "object") return undefined;
  for (const key of ["file_path", "filePath", "path", "target_file", "notebook_path"]) {
    const v = toolInput[key];
    if (typeof v === "string" && v) return v;
  }
  return undefined;
}

/** 仓库相对化：绝对路径取 cwd 相对；`..` 开头（仓外）原样保留并归 other。 */
function normalize(base, p) {
  const abs = isAbsolute(p) ? p : join(base, p);
  const r = relative(base, abs).split("\\").join("/");
  return r === "" ? "." : r;
}

function loadLayers(base) {
  const cfg = join(base, ".qgate", "context-layers.json");
  if (!existsSync(cfg)) return DEFAULT_LAYERS;
  try {
    const parsed = JSON.parse(readFileSync(cfg, "utf8"));
    const layers = parsed && typeof parsed === "object" ? parsed.layers : null;
    if (!layers || typeof layers !== "object") return DEFAULT_LAYERS;
    const out = {};
    for (const key of ["knowledge", "harness", "specs", "hooks"]) {
      const arr = layers[key];
      if (Array.isArray(arr) && arr.every((x) => typeof x === "string")) out[key] = arr;
    }
    return Object.keys(out).length > 0 ? out : DEFAULT_LAYERS;
  } catch {
    return DEFAULT_LAYERS;
  }
}

/** 最长前缀胜出（宽前缀 custom/ 不得吃掉 custom/server/knowledge/ 这类窄前缀）。 */
function classify(rel, layers) {
  if (rel.startsWith("../") || isAbsolute(rel)) return "other";
  let bestLayer = "other";
  let bestLen = -1;
  for (const [layer, prefixes] of Object.entries(layers)) {
    for (const prefix of prefixes) {
      const p = prefix.split("\\").join("/");
      const hit = p.endsWith("/") ? rel.startsWith(p) : rel === p || rel.startsWith(p + "/");
      if (hit && p.length > bestLen) {
        bestLen = p.length;
        bestLayer = layer;
      }
    }
  }
  return bestLayer;
}
