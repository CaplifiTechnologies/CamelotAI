// Start the Next.js production server inside Electron (packaged builds).

const fs = require('fs')
const http = require('http')
const path = require('path')

let server = null

async function startNextProduction(appRoot, port) {
  if (server) return `http://127.0.0.1:${port}`

  // Never chdir into app.asar — with asar:false appRoot is a real directory.
  const root = path.resolve(appRoot)
  if (!fs.existsSync(root)) {
    throw new Error(`app root missing: ${root}`)
  }
  try {
    if (fs.statSync(root).isDirectory()) {
      process.chdir(root)
    }
  } catch (err) {
    console.warn('[camelot] chdir skipped:', err.message)
  }

  process.env.NODE_ENV = 'production'

  const next = require(path.join(root, 'node_modules', 'next'))
  const app = next({ dev: false, dir: root, hostname: '127.0.0.1', port })
  await app.prepare()
  const handle = app.getRequestHandler()

  await new Promise((resolve, reject) => {
    server = http.createServer((req, res) => handle(req, res))
    server.on('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })

  console.log(`[camelot] Next production server on http://127.0.0.1:${port}`)
  return `http://127.0.0.1:${port}`
}

function stopNextProduction() {
  if (!server) return
  try {
    server.close()
  } catch {}
  server = null
}

module.exports = { startNextProduction, stopNextProduction }