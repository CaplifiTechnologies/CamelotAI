# CamelotAI v0.2.0 — "Round Table"

**Released:** 2026-06-20  
**Archived prior build:** v0.1.0 (see git tags / releases)

## Fixes (from v0.1 review + bug tracker)

| ID | Fix |
|----|-----|
| P0-1 | Production packaging — embedded Next server in Electron (`electron/next-server.js`); `npm run desktop:prod` / `smoke:prod` |
| P0-2 | Side-thread merge posts as **Side Thread** seat, not Local Tally |
| P0-3 | Export includes full **Side threads** section via `/api/export` |
| P0-4 | PASS normalization — leading `PASS`, punctuation stripped |
| P0-6 | Exchange limit enforced in UI (3 seat replies since user's last message) |
| P1-1 | Electron fs bridge — read/write/list under allowed roots |
| P1-2 | Dev chat logging (`CAMELOT_DEV_LOG=1` or development mode) |
| P1-5 | Grok JWT expiry detection + clearer 401 / re-login message |
| P1-6 | Claude default → `claude-sonnet-4-6` |

## Run

```bash
npm run desktop          # dev (Next dev + Electron)
npm run desktop:prod     # production server test
npm run smoke            # dev smoke
npm run smoke:prod       # production smoke
```

## Filesystem bridge (Electron only)

`window.camelot.readFile` / `writeFile` / `listDir` — scoped to allowed project roots (Electron).