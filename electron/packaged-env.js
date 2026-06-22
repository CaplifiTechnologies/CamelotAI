// Packaged-app environment: writable SQLite + schema bootstrap.

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

function setupPackagedEnv(app, appRoot) {
  const userData = app.getPath('userData')
  fs.mkdirSync(userData, { recursive: true })

  const dbPath = path.join(userData, 'camelot.db')
  process.env.DATABASE_URL = `file:${dbPath}`
  console.log(`[camelot] DATABASE_URL → ${process.env.DATABASE_URL}`)

  if (!fs.existsSync(dbPath)) {
    console.log('[camelot] initializing SQLite schema (first launch)…')
    const prismaBin = path.join(appRoot, 'node_modules', 'prisma', 'build', 'index.js')
    const r = spawnSync(process.execPath, [prismaBin, 'db', 'push', '--skip-generate'], {
      cwd: appRoot,
      env: { ...process.env },
      stdio: 'pipe',
      encoding: 'utf8',
    })
    if (r.status !== 0) {
      const err = (r.stderr || r.stdout || '').slice(-500)
      console.error(`[camelot] prisma db push failed: ${err}`)
      throw new Error('database init failed')
    }
  }
}

module.exports = { setupPackagedEnv }