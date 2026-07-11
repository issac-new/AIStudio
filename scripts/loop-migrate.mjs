#!/usr/bin/env node
// overlay/scripts/loop-migrate.mjs
// Migrates loop state from LocalStore (.loop/) to MatrixStore (Matrix room)
// Usage: node scripts/loop-migrate.mjs --homeserver URL --token TOKEN --user @bot:matrix.org --room !room:matrix.org

import { existsSync } from 'fs'
import { resolve } from 'path'

const args = process.argv.slice(2)
const opts = {}
for (let i = 0; i < args.length; i += 2) {
  opts[args[i].replace(/^--/, '')] = args[i + 1]
}

const required = ['homeserver', 'token', 'user', 'room']
for (const k of required) {
  if (!opts[k]) {
    console.error(`Missing required --${k}`)
    process.exit(1)
  }
}

const LOOP_DIR = opts.dir || '.loop'

async function migrate() {
  // Dynamic import the store modules (ESM). Use absolute paths so the script
  // works regardless of the caller's cwd.
  const overlayRoot = resolve(new URL('..', import.meta.url).pathname)
  const { LocalStore } = await import(resolve(overlayRoot, 'custom/server/loop/store/local-store.js'))
  const { MatrixStore } = await import(resolve(overlayRoot, 'custom/server/loop/store/matrix-store.js'))

  const localStore = new LocalStore(LOOP_DIR)
  const matrixStore = new MatrixStore({
    homeserverUrl: opts.homeserver,
    accessToken: opts.token,
    userId: opts.user,
    roomId: opts.room,
  })

  // Wait for Matrix client to sync
  await new Promise(r => setTimeout(r, 3000))

  // Migrate loops
  const loops = await localStore.listLoops()
  console.log(`Migrating ${loops.length} loops...`)
  for (const loop of loops) {
    try {
      await matrixStore.createLoop(loop)
      console.log(`  ✓ ${loop.id}`)

      // Migrate contracts
      const contracts = await localStore.queryContracts(loop.id)
      for (const c of contracts) {
        await matrixStore.appendContract(c)
      }

      // Migrate events
      const events = await localStore.queryEvents(loop.id)
      for (const e of events) {
        await matrixStore.appendEvent(e)
      }
      console.log(`    ${contracts.length} contracts, ${events.length} events`)
    } catch (err) {
      console.error(`  ✗ ${loop.id}: ${err.message}`)
    }
  }

  console.log('Migration complete.')
  process.exit(0)
}

migrate().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})

// Exported for tests that want to assert the script exists without executing it.
export const __scriptExists = true
