#!/usr/bin/env node
// overlay/scripts/loop-migrate-saas.mjs
// Migrates loop state from MatrixStore to SaaSStore (PostgreSQL)
// Usage: node scripts/loop-migrate-saas.mjs --pg-url URL --tenant ID --homeserver URL --token TOKEN --user @bot:matrix.org --room !room:matrix.org

import { existsSync } from 'fs'

const args = process.argv.slice(2)
const opts = {}
for (let i = 0; i < args.length; i += 2) {
  opts[args[i].replace(/^--/, '')] = args[i + 1]
}

const required = ['pg-url', 'tenant', 'homeserver', 'token', 'user', 'room']
for (const k of required) {
  if (!opts[k]) {
    console.error(`Missing required --${k}`)
    process.exit(1)
  }
}

async function migrate() {
  const { MatrixStore } = await import('../custom/server/loop/store/matrix-store.js')
  const { SaaSStore } = await import('../custom/server/loop/store/saas-store.js')

  const matrixStore = new MatrixStore({
    homeserverUrl: opts.homeserver,
    accessToken: opts.token,
    userId: opts.user,
    roomId: opts.room,
  })

  const saasStore = new SaaSStore({
    connectionString: opts['pg-url'],
    tenantId: opts.tenant,
  })
  await saasStore.init()

  // Wait for Matrix sync
  await new Promise(r => setTimeout(r, 3000))

  const loops = await matrixStore.listLoops()
  console.log(`Migrating ${loops.length} loops from Matrix to SaaS (tenant: ${opts.tenant})...`)

  for (const loop of loops) {
    try {
      loop.stateAdapter = 'saas'
      await saasStore.createLoop(loop)
      console.log(`  ✓ ${loop.id}`)

      const contracts = await matrixStore.queryContracts(loop.id)
      for (const c of contracts) {
        await saasStore.appendContract(c)
      }

      const events = await matrixStore.queryEvents(loop.id)
      for (const e of events) {
        await saasStore.appendEvent(e)
      }
      console.log(`    ${contracts.length} contracts, ${events.length} events`)
    } catch (err) {
      console.error(`  ✗ ${loop.id}: ${err.message}`)
    }
  }

  await saasStore.close()
  console.log('Migration complete.')
  process.exit(0)
}

migrate().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
