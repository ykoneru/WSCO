#!/usr/bin/env python3
"""Optional shared leaderboard API.

GitHub Pages cannot run this. On your computer:

    python3 server/leaderboard.py

Then set window.WSO_LEADERBOARD_API = "http://localhost:8787" in events-data.js
and refresh the site. Deploy this file to Render, Fly.io, or a campus VM
when you want a public campus-wide board.
"""

import json
import os
import re
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(ROOT, "leaderboard.db")
PORT = int(os.environ.get("PORT", "8787"))
NAME_RE = re.compile(r"^[\w \-'.]{2,16}$")
MAX_SCORE = 100000


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            score INTEGER NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    return conn


def top_scores(conn):
    rows = conn.execute(
        "SELECT name, score FROM scores ORDER BY score DESC, created_at ASC LIMIT 10"
    ).fetchall()
    return [{"name": name, "score": score} for name, score in rows]


ALLOWED_ORIGINS = {
    "https://sfspack.org",
    "https://www.sfspack.org",
}

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print("[%s] %s" % (self.log_date_time_string(), format % args))

    def cors(self):
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS or origin.startswith("http://localhost") or origin.startswith("http://127.0.0.1"):
            self.send_header("Access-Control-Allow-Origin", origin or "https://sfspack.org")
        else:
            self.send_header("Access-Control-Allow-Origin", "https://sfspack.org")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def send_json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_GET(self):
        if self.path.rstrip("/") != "/leaderboard":
            self.send_json(404, {"error": "not found"})
            return
        conn = connect()
        try:
            self.send_json(200, top_scores(conn))
        finally:
            conn.close()

    def do_POST(self):
        if self.path.rstrip("/") != "/leaderboard":
            self.send_json(404, {"error": "not found"})
            return
        length = int(self.headers.get("Content-Length", "0"))
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self.send_json(400, {"error": "invalid json"})
            return

        name = re.sub(r"\s+", " ", str(data.get("name", "")).strip())
        try:
            score = int(data.get("score"))
        except (TypeError, ValueError):
            self.send_json(400, {"error": "invalid score"})
            return

        if not NAME_RE.match(name) or score < 1 or score > MAX_SCORE:
            self.send_json(400, {"error": "invalid score submission"})
            return

        conn = connect()
        try:
            conn.execute("INSERT INTO scores (name, score) VALUES (?, ?)", (name, score))
            conn.commit()
            self.send_json(200, top_scores(conn))
        finally:
            conn.close()


if __name__ == "__main__":
    connect().close()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print("Leaderboard SQL API on http://localhost:%s/leaderboard" % PORT)
    server.serve_forever()
