import { app } from 'electron'
import { parseBundledMcpArgs, runBundledMcpCli } from './mcp-cli'
import { probeLinuxSandbox, shouldRelaunchWithoutSandbox } from './linux-sandbox'

// Kylin/UOS: without SUID chrome-sandbox or unprivileged user namespaces the
// renderer dies before any window opens. Relaunch once with --no-sandbox
// before pulling in the full GUI.
if (shouldRelaunchWithoutSandbox(probeLinuxSandbox(process.execPath), {
  packaged: app.isPackaged,
  hasNoSandboxFlag: process.argv.includes('--no-sandbox'),
  isRoot: process.geteuid?.() === 0,
})) {
  app.relaunch({ args: [...process.argv.slice(1), '--no-sandbox'] })
  app.exit(0)
}

// Already-running Gateways can retain MCP definitions from before Node mode
// was persisted. Route those invocations before loading any GUI or updater code.
const mcpArgs = app.isPackaged ? parseBundledMcpArgs(process.argv, process.resourcesPath) : null
if (mcpArgs) {
  app.dock?.hide()
  runBundledMcpCli(mcpArgs).then(code => app.exit(code)).catch(error => {
    console.error(error)
    app.exit(1)
  })
} else {
  require('./index')
}
