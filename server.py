#!/usr/bin/env python3
"""About Time: serves the web UI and stores data in one JSON file."""
import datetime
import http.server
import json
import os
import shutil
import sys

PORT = int(os.environ.get("ABOUTTIME_PORT", "47890"))
ROOT = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(ROOT, "web")
DATA_DIR = os.environ.get(
    "ABOUTTIME_DATA_DIR",
    os.path.expanduser("~/Library/Application Support/AboutTime"),
)
DATA = os.path.join(DATA_DIR, "data.json")
BACKUPS = os.path.join(DATA_DIR, "backups")
ALLOWED_HOSTS = {f"127.0.0.1:{PORT}", f"localhost:{PORT}"}
EMPTY = {"clients": [], "entries": []}


def load():
    if not os.path.exists(DATA):
        return EMPTY
    with open(DATA, encoding="utf-8") as f:
        return json.load(f)


def save(doc):
    os.makedirs(BACKUPS, exist_ok=True)
    # One backup per day, taken before the first write of that day.
    daily = os.path.join(BACKUPS, datetime.date.today().isoformat() + ".json")
    if os.path.exists(DATA) and not os.path.exists(daily):
        shutil.copy2(DATA, daily)
    tmp = DATA + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=1, ensure_ascii=False)
    os.replace(tmp, DATA)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=WEB, **kw)

    def log_message(self, *a):
        pass

    def _host_ok(self):
        # Blocks DNS-rebinding pages from reaching the API.
        if self.headers.get("Host") in ALLOWED_HOSTS:
            return True
        self.send_error(403)
        return False

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if not self._host_ok():
            return
        if self.path == "/api/data":
            return self._json(200, load())
        if self.path == "/api/ping":
            return self._json(200, {"app": "about-time"})
        super().do_GET()

    def do_PUT(self):
        # PUT with a JSON body always needs a CORS preflight, which this server never grants.
        if not self._host_ok():
            return
        if self.path != "/api/data" or not self.headers.get("Content-Type", "").startswith("application/json"):
            return self.send_error(400)
        try:
            doc = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            if not isinstance(doc.get("clients"), list) or not isinstance(doc.get("entries"), list):
                raise ValueError("bad shape")
        except (ValueError, AttributeError):
            return self.send_error(400)
        save(doc)
        self._json(200, {"ok": True})


if __name__ == "__main__":
    http.server.SimpleHTTPRequestHandler.extensions_map[".js"] = "text/javascript"
    os.makedirs(DATA_DIR, exist_ok=True)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"About Time on http://localhost:{PORT}", file=sys.stderr)
    srv.serve_forever()
