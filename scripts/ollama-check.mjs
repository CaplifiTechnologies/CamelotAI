// Verifies bunker hot models (or tally model fallback). Run: npm run ollama:check
import fs from 'node:fs'

const BASE = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'
const WANT = process.env.CAMELOT_TALLY_MODEL ?? 'qwen2.5:7b'
const MANIFEST =
  process.env.BUNKER_MANIFEST_PATH ?? '/Volumes/4TSSD/AI-Stack/bunker/MANIFEST.yaml'

function readHotDefaults() {
  try {
    if (!fs.existsSync(MANIFEST)) return null
    const text = fs.readFileSync(MANIFEST, 'utf8')
    const block = text.match(/hot_defaults:\s*\n((?:\s+-\s+.+\n)+)/)
    if (!block) return null
    const models = [...block[1].matchAll(/^\s+-\s+(.+)$/gm)].map((m) => m[1].trim())
    return models.length ? models : null
  } catch {
    return null
  }
}

const CHECK = readHotDefaults() ?? [WANT]

try {
  const tags = await fetch(`${BASE}/api/tags`).then((r) => r.json())
  const models = (tags.models ?? []).map((m) => m.name)
  console.log(`Ollama @ ${BASE}: reachable (${models.length} models)`)
  if (readHotDefaults()) console.log(`Bunker mounted — checking hot_defaults: ${CHECK.join(', ')}`)

  const missing = CHECK.filter(
    (id) => !models.some((n) => n === id || n.startsWith(`${id.split(':')[0]}:`)),
  )
  if (missing.length) {
    console.error(`✗ missing: ${missing.join(', ')}`)
    for (const id of missing) console.error(`  pull: ollama pull ${id}`)
    process.exit(1)
  }

  const chat = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: WANT,
      stream: false,
      messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
    }),
  }).then((r) => r.json())

  console.log(`✓ ${WANT} responded: "${(chat.message?.content ?? '').trim().slice(0, 40)}"`)
  for (const id of CHECK) console.log(`✓ ${id} installed`)
  console.log('Local seats are GO (free).')
} catch (err) {
  console.error(`✗ Ollama not reachable at ${BASE}. Is it running? (\`ollama serve\`)`)
  console.error(String(err))
  process.exit(1)
}