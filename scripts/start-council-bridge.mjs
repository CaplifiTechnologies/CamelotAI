// Spawn the Python council sidecar (shared Boardroom ledger + gate).
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const bridge = path.join(__dirname, 'council_bridge.py')
const PORT = process.env.CAMELOT_COUNCIL_PORT ?? '20022'

export function startCouncilBridge() {
  const child = spawn('python3', [bridge, PORT], {
    stdio: 'inherit',
    env: process.env,
    detached: true,
  })
  child.on('exit', (code) => {
    if (code) console.error(`[council-bridge] exited (${code})`)
  })
  return child
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startCouncilBridge()
}