"""GET /api/sealed?q=...&limit=12 — search PriceCharting for sealed products."""

from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
import re
import asyncio
from api._shared import fetch_html, parse_price, cache_get, cache_set, quote_plus
from bs4 import BeautifulSoup


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        params = parse_qs(urlparse(self.path).query)
        q = (params.get("q", [""])[0]).strip()
        limit = int(params.get("limit", ["12"])[0])

        if not q:
            self._json({"error": "Query cannot be empty"}, 400)
            return

        cache_key = f"sealed:{q.lower()}"
        cached = cache_get(cache_key)
        if cached:
            self._json({"results": cached[:limit], "cached": True})
            return

        try:
            search_q = f"{q} sealed"
            url = f"https://www.pricecharting.com/search-products?q={quote_plus(search_q)}&type=prices"
            html = asyncio.run(fetch_html(url))

            soup = BeautifulSoup(html, "html.parser")
            rows = soup.select("table#games_table tbody tr")

            results = []
            for row in rows:
                cells = row.select("td")
                if len(cells) < 4:
                    continue
                a = row.select_one("td a")
                if not a:
                    continue
                href = a.get("href", "")
                slug = href.split("/")[-1]
                raw = cells[1].get_text(strip=True)

                idx = raw.rfind("Pokemon ")
                if idx > 0:
                    name = raw[:idx].strip()
                    set_name = raw[idx:].strip()
                else:
                    name = raw.strip()
                    set_name = ""

                price = parse_price(cells[3].get_text(strip=True))

                skip = ["sleeve", "portfolio", "mini portfolio", "binder", "dice", "coin", "mini tin accessory"]
                if any(s in name.lower() for s in skip):
                    continue

                results.append({
                    "name": name, "set": set_name, "url": href,
                    "slug": slug, "price": price,
                })

            cache_set(cache_key, results)
            self._json({"results": results[:limit], "cached": False})
        except Exception as e:
            self._json({"error": str(e)}, 502)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
