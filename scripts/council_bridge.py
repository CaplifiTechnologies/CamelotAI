#!/usr/bin/env python3
"""Camelot council sidecar — reuses The Boardroom council/ modules (shared ledger).

Listens on :20022 by default. Started by Electron or dev-desktop.mjs.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

HOME = Path.home()
BOARDROOM = HOME / "ui-hub" / "apps" / "the-boardroom"
ALMI_DIR = HOME / "ALMI"
UI_HUB_LIB = HOME / "ui-hub" / "lib"

sys.path.insert(0, str(BOARDROOM))
sys.path.insert(0, str(ALMI_DIR))
sys.path.insert(0, str(UI_HUB_LIB))

from council import gate as council_gate  # noqa: E402
from council import invite as council_invite  # noqa: E402
from council import ledger as council_ledger  # noqa: E402
from council import odin as council_odin  # noqa: E402

HOST = os.environ.get("CAMELOT_COUNCIL_HOST", "127.0.0.1")
PORT = int(os.environ.get("CAMELOT_COUNCIL_PORT", "20022"))
CAMELOT_WEB_PORT = os.environ.get("CAMELOT_WEB_PORT", "20020")

COUNSEL_ROLES_FILE = BOARDROOM / "counsel-roles.json"
NOTIFICATIONS_DB = str(ALMI_DIR / "almi_state.db")

SUBCATEGORY_PROJECT = {
    "cre": "cre-yield",
    "storefront": "almi-storefront",
    "almi": "almi",
    "goal": "goal-bot",
    "deploy": "cre-yield",
    "wallet": "cre-yield",
    "tor": "almi",
    "keys": "almi",
}

WORKSPACE_HINTS = (
    ("headgate-hydro", "headgate-hydro"),
    ("headgate_hydro", "headgate-hydro"),
    ("cre-high-risk-yield-chaser", "cre-yield"),
    ("yield-chaser", "cre-yield"),
    ("almi-storefront", "almi-storefront"),
    ("almi.caplifi", "almi-storefront"),
    ("ui-hub", "matt-hub"),
    ("odysseus", "odysseus-helm"),
    ("almi-smart-home", "almi-smart-home"),
    ("goal-bot", "goal-bot"),
    ("polythink", "polythink"),
    ("slophaus-instagram", "slophaus-ig"),
    ("slophaus", "slophaus-ig"),
    ("instagram", "slophaus-ig"),
)

PROJECT_ROOTS: dict[str, Path] = {
    "slophaus-ig": HOME / "slophaus-instagram",
    "headgate-hydro": HOME / "websites" / "headgate-hydro-site",
    "cre-yield": HOME / "cre-high-risk-yield-chaser",
    "almi-storefront": HOME / "websites" / "almi.caplifi.com",
    "almi-smart-home": HOME / "almi-smart-home",
    "matt-hub": HOME / "ui-hub",
    "postcard-trials": HOME / "postcard-trials",
}

_KNOWN_URL_PACKS: dict[str, str] = {
    "meta": (
        "Meta Developer Console: https://developers.facebook.com/apps/\n"
        "App settings (ID + secret): https://developers.facebook.com/apps/APP_ID/settings/basic/\n"
        "Graph API Explorer: https://developers.facebook.com/tools/explorer/\n"
        "Link IG to Facebook Page: https://www.facebook.com/settings/?tab=linked_instagram"
    ),
    "cloudflare": (
        "Cloudflare dashboard: https://dash.cloudflare.com/\n"
        "API tokens: https://dash.cloudflare.com/profile/api-tokens"
    ),
    "godaddy": "GoDaddy API keys: https://developer.godaddy.com/keys",
    "github": "GitHub device login: https://github.com/login/device",
}


def _read_snippet(path: Path, limit: int = 3500) -> str:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""
    return text[:limit].strip()


def _practical_playbook(notif: dict, project: str) -> str:
    body = f"{notif.get('summary') or ''} {notif.get('body') or ''}".lower()
    chunks: list[str] = []
    root = PROJECT_ROOTS.get(project)
    if not root or not root.is_dir():
        for m in re.finditer(r"(~/[\w./-]+)", notif.get("body") or ""):
            cand = Path(m.group(1)).expanduser()
            if cand.is_dir():
                root = cand
                break
    if root and root.is_dir():
        for rel in ("SETUP.txt", "README.md", "scripts/oauth_setup.py", "scripts/deploy-cloudflare.sh"):
            p = root / rel
            if p.is_file():
                chunks.append(f"--- {root.name}/{rel} ---\n{_read_snippet(p, 2000)}")
    for key, pack in _KNOWN_URL_PACKS.items():
        if key in body or (key == "meta" and ("instagram" in body or "meta_app" in body)):
            chunks.append(f"--- URLs ({key}) ---\n{pack}")
    if not chunks:
        return ""
    return "\n\n".join(chunks)


def _load_counsel_roles() -> list[dict]:
    try:
        data = json.loads(COUNSEL_ROLES_FILE.read_text())
        return list(data.get("roles") or [])
    except (OSError, json.JSONDecodeError):
        return []


def _resolve_project(notif: dict) -> str:
    ctx = notif.get("context") or {}
    if isinstance(ctx, str):
        try:
            ctx = json.loads(ctx)
        except json.JSONDecodeError:
            ctx = {}
    if isinstance(ctx.get("project"), str) and ctx["project"].strip():
        return ctx["project"].strip()
    cwd = str(ctx.get("cwd") or "")
    body = f"{notif.get('summary') or ''} {notif.get('body') or ''} {cwd}".lower()
    for needle, pid in WORKSPACE_HINTS:
        if needle in body or needle in cwd.lower():
            return pid
    sub = (notif.get("subcategory") or "").lower()
    if sub in SUBCATEGORY_PROJECT:
        return SUBCATEGORY_PROJECT[sub]
    cat = (notif.get("category") or "question").lower()
    return f"{cat}-{sub or 'general'}"


def _counsel_bootstrap(inbox_id: int) -> dict:
    try:
        import notifications as almi_notifications  # type: ignore
    except ImportError:
        return {"ok": False, "error": "notifications module unavailable"}
    row = almi_notifications.get_notification(inbox_id, path=NOTIFICATIONS_DB)
    if not row:
        return {"ok": False, "error": f"inbox #{inbox_id} not found"}
    project = _resolve_project(row)
    channel = project.replace("-", " ").title()
    seed = (
        f"**Inbox #{row['id']}** — {row.get('summary') or 'Hanging question'}\n\n"
        f"Category: {row.get('category')} / {row.get('subcategory')}\n"
        f"Route: {row.get('route')} · Source: {row.get('source')}\n\n"
        f"{row.get('body') or ''}"
    ).strip()
    playbook = _practical_playbook(row, project)
    try:
        from odysseus_ecosystem import context_bundle  # type: ignore

        eco = context_bundle(limit=10)
        if eco:
            playbook = (playbook + "\n\n--- Odysseus ecosystem context ---\n" + eco).strip()
    except Exception:
        pass
    return {
        "ok": True,
        "mode": "counsel",
        "inboxId": row["id"],
        "project": project,
        "channel": channel,
        "roomName": f"Council · {channel}",
        "seed": seed,
        "playbook": playbook,
        "notification": {
            "id": row["id"],
            "summary": row.get("summary"),
            "category": row.get("category"),
            "subcategory": row.get("subcategory"),
            "route": row.get("route"),
            "source": row.get("source"),
        },
        "roles": _load_counsel_roles(),
        "boardroomUrl": f"http://{HOST}:{CAMELOT_WEB_PORT}/?mode=counsel&inbox={row['id']}",
    }


def _camelot_join_url(token: str) -> str:
    return f"http://{HOST}:{CAMELOT_WEB_PORT}/?mode=counsel&token={token}"


def _read_json_body(handler: BaseHTTPRequestHandler) -> dict:
    n = int(handler.headers.get("Content-Length", 0) or 0)
    if n <= 0:
        return {}
    try:
        return json.loads(handler.rfile.read(n))
    except json.JSONDecodeError:
        return {}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "content-type")

    def _json(self, obj: dict, code: int = 200) -> None:
        payload = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path in ("/api/health", "/health"):
            chain = council_ledger.verify_chain()
            return self._json({"ok": True, "service": "camelot-council-bridge", "port": PORT, "ledger": chain})
        if path in ("/api/counsel/roles", "/counsel/roles"):
            return self._json({"ok": True, "roles": _load_counsel_roles()})
        if path in ("/api/counsel/bootstrap", "/counsel/bootstrap"):
            qs = parse_qs(parsed.query)
            raw = (qs.get("inbox") or qs.get("id") or [None])[0]
            try:
                inbox_id = int(raw)
            except (TypeError, ValueError):
                return self._json({"ok": False, "error": "inbox id required"}, 400)
            payload = _counsel_bootstrap(inbox_id)
            code = 200 if payload.get("ok") else 404
            return self._json(payload, code)
        if path in ("/api/council/odin", "/council/odin"):
            qs = parse_qs(parsed.query)
            project = (qs.get("project") or [None])[0]
            return self._json(council_odin.pull_state(project=project))
        if path in ("/api/council/ledger", "/council/ledger"):
            qs = parse_qs(parsed.query)
            room_id = (qs.get("room") or [None])[0]
            limit = int((qs.get("limit") or ["80"])[0])
            return self._json({
                "ok": True,
                "entries": council_ledger.list_entries(room_id, limit=limit),
                "chain": council_ledger.verify_chain(),
            })
        if path in ("/api/council/proposals", "/council/proposals"):
            qs = parse_qs(parsed.query)
            room_id = (qs.get("room") or [None])[0]
            if not room_id:
                return self._json({"ok": False, "error": "room required"}, 400)
            status = (qs.get("status") or ["pending"])[0]
            return self._json({
                "ok": True,
                "items": council_gate.list_proposals(room_id, status=status or None),
            })
        if path in ("/api/council/room", "/council/room"):
            qs = parse_qs(parsed.query)
            room_id = (qs.get("id") or qs.get("room") or [None])[0]
            if not room_id:
                return self._json({"ok": False, "error": "room id required"}, 400)
            row = council_invite.get_room(room_id)
            return self._json({"ok": bool(row), "room": row})
        return self._json({"ok": False, "error": "not found"}, 404)

    def do_POST(self):
        path = urlparse(self.path).path
        body = _read_json_body(self)
        if path in ("/api/odysseus/ingest", "/odysseus/ingest"):
            try:
                from odysseus_ecosystem import ingest_transcript  # type: ignore

                turns = body.get("turns") or []
                result = ingest_transcript(
                    turns,
                    source=body.get("source") or "camelot",
                    project=body.get("project"),
                    summary=body.get("summary"),
                )
                return self._json(result, 200 if result.get("ok") else 400)
            except Exception as e:
                return self._json({"ok": False, "error": str(e)}, 500)
        if path in ("/api/council/room", "/council/room"):
            room_id = body.get("room_id") or body.get("roomId")
            if not room_id:
                return self._json({"ok": False, "error": "room_id required"}, 400)
            return self._json(council_invite.upsert_room(
                str(room_id),
                project=body.get("project"),
                inbox_id=body.get("inbox_id") or body.get("inboxId"),
            ))
        if path in ("/api/council/odin/pull", "/council/odin/pull"):
            project = body.get("project")
            state = council_odin.pull_state(project=project)
            room_id = body.get("room_id")
            if room_id:
                council_ledger.append(
                    str(room_id),
                    "odin_pull",
                    {"summary": f"ODIN pull · {len(state.get('signals', []))} signals",
                     "signals": state.get("signals", [])[:12]},
                    actor="odin",
                )
            return self._json(state)
        if path in ("/api/council/propose", "/council/propose"):
            room_id = body.get("room_id")
            if not room_id:
                return self._json({"ok": False, "error": "room_id required"}, 400)
            try:
                return self._json(council_gate.queue_proposal(
                    str(room_id),
                    seat=body.get("seat") or "agent",
                    proposal_type=body.get("type") or body.get("proposal_type"),
                    summary=body.get("summary") or "",
                    body=body.get("body") or "",
                ))
            except ValueError as e:
                return self._json({"ok": False, "error": str(e)}, 400)
        if path in ("/api/council/approve", "/council/approve"):
            pid = body.get("proposal_id") or body.get("id")
            if not pid:
                return self._json({"ok": False, "error": "proposal_id required"}, 400)
            return self._json(council_gate.resolve_proposal(
                int(pid),
                approve=True,
                resolved_by=body.get("by") or "matt",
                human_token=body.get("human_token"),
            ))
        if path in ("/api/council/deny", "/council/deny"):
            pid = body.get("proposal_id") or body.get("id")
            if not pid:
                return self._json({"ok": False, "error": "proposal_id required"}, 400)
            return self._json(council_gate.resolve_proposal(
                int(pid),
                approve=False,
                resolved_by=body.get("by") or "matt",
            ))
        if path in ("/api/council/invite", "/council/invite"):
            room_id = body.get("room_id")
            email = body.get("email")
            if not room_id or not email:
                return self._json({"ok": False, "error": "room_id and email required"}, 400)
            try:
                result = council_invite.create_invite(str(room_id), email, role=body.get("role") or "peer")
                if result.get("ok") and result.get("join_url"):
                    token = result["join_url"].split("t=")[-1]
                    result["join_url"] = _camelot_join_url(token)
                return self._json(result)
            except ValueError as e:
                return self._json({"ok": False, "error": str(e)}, 400)
        if path in ("/api/council/invite/redeem", "/council/invite/redeem"):
            token = body.get("token")
            if not token:
                return self._json({"ok": False, "error": "token required"}, 400)
            result = council_invite.redeem_token(str(token))
            if result.get("ok"):
                result["council_url"] = f"http://{HOST}:{CAMELOT_WEB_PORT}/?mode=counsel&room={result['room_id']}"
            return self._json(result)
        if path in ("/api/council/peer/mode", "/council/peer/mode"):
            room_id = body.get("room_id")
            mode = body.get("mode")
            if not room_id or not mode:
                return self._json({"ok": False, "error": "room_id and mode required"}, 400)
            try:
                return self._json(council_invite.set_peer_mode(str(room_id), str(mode)))
            except ValueError as e:
                return self._json({"ok": False, "error": str(e)}, 400)
        return self._json({"ok": False, "error": "not found"}, 404)


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    httpd = ThreadingHTTPServer((HOST, port), Handler)
    print(f"Camelot council bridge → http://{HOST}:{port}  (ledger: {BOARDROOM}/council-data/)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()