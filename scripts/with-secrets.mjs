// Loads secrets from the macOS Keychain into the environment, then execs the
// given command. The secret is read at launch and passed only to the child
// process env — it is NEVER written to a file or logged.
//
//   npm run dev   →   node scripts/with-secrets.mjs next dev -p 20020
//
// If a secret isn't in the Keychain, the app still runs (paid seats stay
// offline; Local Only / free mode works without any key).

import { execFileSync } from 'node:child_process'
import { spawn } from 'node:child_process'

// envVar ← Keychain generic-password service name
const SECRETS = [
  { env: 'ANTHROPIC_API_KEY', service: 'ANTHROPIC_API_KEY' },
  { env: 'XAI_API_KEY', service: 'XAI_API_KEY' },
  { env: 'SAKANA_API_KEY', service: 'SAKANA_API_KEY' },
]

for (const { env, service } of SECRETS) {
  if (process.env[env]) continue // already set — respect an explicit override
  try {
    const value = execFileSync('security', ['find-generic-password', '-s', service, '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (value) {
      process.env[env] = value
      console.log(`[secrets] loaded ${env} from Keychain (paid seat online)`)
    }
  } catch {
    console.log(`[secrets] ${env} not in Keychain — paid seats offline; free/local mode only`)
  }
}

const [cmd, ...rest] = process.argv.slice(2)
if (!cmd) {
  console.error('[secrets] usage: node with-secrets.mjs <command> [args…]')
  process.exit(1)
}

const child = spawn(cmd, rest, { stdio: 'inherit', env: process.env })
child.on('exit', (code) => process.exit(code ?? 0))
