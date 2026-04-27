#!/usr/bin/env python3
"""One-time helper: exchange a Google OAuth Desktop-app client for a refresh token
with the youtube scope.

Run this once on your laptop, log in as the account that owns the target
YouTube channel (Brand Account selectable at consent), and paste the printed
refresh_token into MintMCP as the YOUTUBE_REFRESH_TOKEN global secret.

Usage:
    export YOUTUBE_CLIENT_ID="..."
    export YOUTUBE_CLIENT_SECRET="..."
    python3 get_refresh_token.py
"""
from __future__ import annotations

import http.server
import os
import secrets
import socket
import sys
import threading
import urllib.parse
import urllib.request
import webbrowser
import json

SCOPE = "https://www.googleapis.com/auth/youtube"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"


def pick_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main() -> None:
    client_id = os.environ.get("YOUTUBE_CLIENT_ID", "").strip()
    client_secret = os.environ.get("YOUTUBE_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        sys.exit("Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET env vars.")

    port = pick_port()
    redirect_uri = f"http://localhost:{port}/callback"
    state = secrets.token_urlsafe(16)

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",
        "prompt": "consent",  # force refresh_token to be issued
        "state": state,
    }
    auth_url = f"{AUTH_URL}?{urllib.parse.urlencode(params)}"

    captured: dict[str, str] = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            q = urllib.parse.urlparse(self.path).query
            parsed = urllib.parse.parse_qs(q)
            code = parsed.get("code", [""])[0]
            got_state = parsed.get("state", [""])[0]
            if got_state != state:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b"State mismatch. Check the terminal.")
                return
            captured["code"] = code
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(
                b"<h2>Got it. You can close this tab and return to the terminal.</h2>"
            )

        def log_message(self, *_):  # silence
            pass

    httpd = http.server.HTTPServer(("127.0.0.1", port), Handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()

    print(f"\nOpening browser for consent at: {auth_url}\n")
    print("Sign in as the Google account that owns the target YouTube channel.")
    print("If a 'Choose channel' screen appears, pick the correct Brand Account.\n")
    webbrowser.open(auth_url)

    # Wait for the callback
    while "code" not in captured:
        pass
    httpd.shutdown()

    # Exchange code for tokens
    body = urllib.parse.urlencode({
        "code": captured["code"],
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }).encode()
    req = urllib.request.Request(
        TOKEN_URL,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            tokens = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"Token exchange failed: {e.code} {e.read().decode(errors='replace')[:400]}")

    refresh = tokens.get("refresh_token")
    if not refresh:
        sys.exit(
            "No refresh_token in response. Re-run; if the account has consented before,"
            " revoke access at https://myaccount.google.com/permissions and retry."
        )

    print("\nSUCCESS\n")
    print(f"refresh_token: {refresh}\n")
    print("Paste that as YOUTUBE_REFRESH_TOKEN in MintMCP (global secret).")


if __name__ == "__main__":
    main()
