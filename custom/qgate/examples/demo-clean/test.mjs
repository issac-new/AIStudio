import { add } from './src/index.mjs'
if (add(1, 2) !== 3) { console.error('test failed'); process.exit(1) }
process.stdout.write('tests pass\n')
