# ⚔️ Camelot

**ALMI council boardroom** — a desktop round table for multi-agent work.

Built on [ALMI](https://caplifi.com/), Camelot seats your agents at one shared transcript with local-first orchestration, cost guardrails, votes, side threads, and PASS semantics when a seat has nothing to add.

**Product site:** [camelot.caplifi.com](https://camelot.caplifi.com) · **Repo:** [CaplifiTechnologies/CamelotAI](https://github.com/CaplifiTechnologies/CamelotAI)

---

## Default council

| Seat | Role | Routing |
|------|------|---------|
| **Odysseus** | Primary · local ALMI helm | Default in Local Only mode — agent loop, tools, memory, filesystem |
| **Claude Code** | Frontier · architecture | Opt-in paid seat — reasoning, writing, orchestration |
| **Grok Build** | Frontier · implementation | Opt-in paid seat — retrieval, code, planning |
| **Sakana Fugu** | Guest · hard calls | Summon only (`@fugu`, `@fugu-ultra`) — multi-agent orchestration for review, research, and multi-step reasoning |

Hidden fallback: **Qwen** (local Ollama). Mechanical jobs: **Local Tally** (always free).

---

## Highlights (v0.3)

- **Smart routing** — role-based orchestration, `@mention`, PASS, automatic fallback when a seat fails or hits billing limits
- **Cost Guard** — warn ~10k tokens, block ~50k on paid seats; usage chips + expensive-request confirmation
- **Local Only** (⌘L) — Odysseus + local Ollama only; paid seats dark, zero API spend
- **Agent tools** — scoped read/write/list via Electron fs-bridge; Odysseus runs the full local loop
- **Odysseus instructions** — editable standing orders injected at session start
- **Sakana Fugu missions** — optional Responses API path for Fugu Ultra (streaming, web search — feature-flagged)
- **Votes + tasks** — confidence-weighted ballots; tally narration on free local inference
- **Side threads** — branch, isolate, merge back; markdown export includes full branches
- **Setup wizard** — local model → optional Keychain API keys → guided Q&A

---

## Quick start

```bash
git clone https://github.com/CaplifiTechnologies/CamelotAI.git
cd CamelotAI
npm install
npm run prisma:generate
npm run prisma:push
npm run ollama:check
npm run desktop
```

| Command | What |
|---------|------|
| `npm run desktop` | Dev: Next on :20020 + Electron |
| `npm run dev` | Browser-only UI → http://localhost:20020 |
| `npm run smoke` | Boot test (dev) |
| `npm run package` | Build macOS .dmg |

### API keys (optional)

Stored in **macOS Keychain** by default (never in chat or files):

| Seat | Key / auth |
|------|------------|
| Claude Code | `ANTHROPIC_API_KEY` |
| Grok Build | `XAI_API_KEY` or Grok CLI login |
| Sakana Fugu | `SAKANA_API_KEY` from [console.sakana.ai](https://console.sakana.ai/api-keys) |

---

## Stack

Electron 30 · Next.js 14 · Tailwind · Zustand · Prisma SQLite · Ollama · MIT License

---

## Version history

| Version | Codename | Highlights |
|---------|----------|------------|
| **v0.3.0** | ALMI Council | Odysseus primary, Claude Code + Grok Build, Sakana Fugu guest, fallback chains, agent tools |
| v0.2.2 | Local-First | Setup wizard, cost visibility, seat toggles, offline model vault |
| v0.2.1 | Packaged | macOS .dmg, embedded Next server, userData SQLite |
| v0.2.0 | Round Table | Side-thread merge, PASS norm, exchange limit, fs-bridge |

Details on the [product site version stack](https://camelot.caplifi.com/#stack). Release notes: [`RELEASE-NOTES-v0.2.0.md`](RELEASE-NOTES-v0.2.0.md), [`RELEASE-NOTES-v0.2.1.md`](RELEASE-NOTES-v0.2.1.md).

---

## Docs site

Static product page lives in [`docs/`](docs/). GitHub Pages serves it at [camelot.caplifi.com](https://camelot.caplifi.com).

```bash
python3 -m http.server 8765 --directory docs
# → http://localhost:8765
```

---

## License

MIT — see [`LICENSE`](LICENSE).