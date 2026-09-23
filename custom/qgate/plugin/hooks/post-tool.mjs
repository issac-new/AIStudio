#!/usr/bin/env node
// QGate PostToolUse hook（async，fire-and-forget）。项目级 opt-in。
// Phase 0 spike 形态：只记录变更事件到 .qgate/hooks.log。P3 起喂给 impact 分析。
import { existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";

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

const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd();
if (!existsSync(join(cwd, ".qgate"))) process.exit(0);

try {
  appendFileSync(
    join(cwd, ".qgate", "hooks.log"),
    JSON.stringify({
      hook: "PostToolUse",
      at: new Date().toISOString(),
      tool: input.tool_name ?? input.toolName,
      file: pickFilePath(input.tool_input ?? input.toolInput),
    }) + "\n",
  );
} catch {
  /* no-op */
}
process.exit(0);

function pickFilePath(toolInput) {
  if (!toolInput || typeof toolInput !== "object") return undefined;
  for (const key of ["file_path", "filePath", "path", "target_file", "notebook_path"]) {
    const v = toolInput[key];
    if (typeof v === "string") return v;
  }
  return undefined;
}
