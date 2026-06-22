# CamelotAI v0.2.1 — "Packaged"

**2026-06-20** — Claude review handoff #1 packaging fixes (Grok Build)

## Fixes

| Issue | Fix |
|-------|-----|
| `chdir(app.asar)` crash | `electron-builder.json` → `"asar": false` |
| Relative `DATABASE_URL` in `/Applications` | `electron/packaged-env.js` → `userData/camelot.db` + `prisma db push` on first launch |
| Smoke missed embedded server | `npm run smoke:embedded` — `CAMELOT_FORCE_PACKAGED=1`, no external Next |
| fs-bridge symlink escape | `realpathSync` prefix check |

## Verify

```bash
npm run smoke:embedded   # embedded Next path (ships in .dmg)
npm run smoke:prod         # external next start (dev workflow)
npm run verify
npm run package            # optional: full .dmg
```