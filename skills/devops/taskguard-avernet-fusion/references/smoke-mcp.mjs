// MCP stdio smoke test — verify 13 workflow tools discoverable
// Run from ~/.hermes/services/taskguard (uses cwd for SKILL_ROOT default)
import { spawn } from "node:child_process";

const child = spawn("node", ["dist/esm/platform/mcp-entry.js"], {
  env: { ...process.env, SKILL_ROOT: process.cwd() },
  stdio: ["pipe", "pipe", "pipe"],
});
let buf = "";
child.stdout.on("data", (d) => { buf += d.toString(); });

function send(obj) {
  return new Promise((res) => {
    const before = buf.length;
    child.stdin.write(JSON.stringify(obj) + "\n");
    const t = setInterval(() => {
      if (buf.length > before) { clearInterval(t); res(); }
    }, 100);
    setTimeout(() => { clearInterval(t); res(); }, 3000);
  });
}

await send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "0" } } });
await send({ jsonrpc: "2.0", method: "notifications/initialized" });
await send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
await new Promise(r => setTimeout(r, 1500));

for (const line of buf.split("\n").filter(l => l.trim())) {
  try {
    const msg = JSON.parse(line);
    if (msg.id === 2 && msg.result?.tools) {
      console.log("TOOLS DISCOVERED:", msg.result.tools.length);
      for (const t of msg.result.tools) console.log(" -", t.name);
    }
  } catch {}
}
child.kill();
process.exit(0);
