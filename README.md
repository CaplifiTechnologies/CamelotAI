# ⚔️ Camelot

A multi-model AI boardroom as a standalone desktop app. Seat Claude, Grok, and
free local Ollama models at one table; route mechanical work (vote tallies,
aggregation, side-thread summaries) to a free local model and reserve paid seats
for real reasoning.

**Product site:** [`website/index.html`](website/index.html) — version stack and feature overview.

## Features (v0.2)

- **Boardroom chat** — you send; a seat replies. Everything persists to SQLite.
- **Seats** — Claude, Grok, local Ollama, and optional agent seats. `/api/health` shows reachable providers.
- **Routing** — role-based by default, `@mention` to force a seat, `INTERJECT:` for urgent flags, **PASS** when a seat has nothing to add.
- **Local Only mode** (⌘L) — routes everything to free local models.
- **Cost Guard** — paid requests warn at ~10k tokens and hard-block at ~50k.
- **Votes** — confidence ballots; tally narration uses a **free local model only**.
- **Tasks** — create, assign, claim, complete.
- **Side threads** — branch, explore in isolation, merge back as summaries.
- **Export** — transcript to Markdown.

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

Browser-only dev UI: `npm run dev` → http://localhost:20020

## Setup wizard

On first launch: welcome → local Ollama model → optional API keys (macOS Keychain) → guided Q&A.

## Stack

Electron 30 · Next.js 14 · Tailwind · Zustand · Prisma SQLite · MIT License

## Status

**v0.2.2** — local-first routing, setup wizard, cost visibility.  
See [`RELEASE-NOTES-v0.2.0.md`](RELEASE-NOTES-v0.2.0.md) and [`RELEASE-NOTES-v0.2.1.md`](RELEASE-NOTES-v0.2.1.md).

## License

MIT — see [`LICENSE`](LICENSE).