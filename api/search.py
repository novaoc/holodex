"""GET /api/search?q=...&limit=8 — search PriceCharting for Pokemon products."""

from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
import asyncio
from api._shared import fetch_html, parse_search_results, cache_get, cache_set, quote_plus


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        params = parse_qs(urlparse(self.path).query)
        q = (params.get("q", [""])[0]).strip()
        limit = int(params.get("limit", ["8"])[0])

        if not q:
            self._json({"error": "Query cannot be empty"}, 400)
            return

        cache_key = f"search:{q.lower()}"
        cached = cache_get(cache_key)
        if cached:
            self._json({"results": cached[:limit], "cached": True})
            return

        try:
            url = f"https://www.pricecharting.com/search-products?q={quote_plus(q)}&type=prices"
            html = asyncio.run(fetch_html(url))
            results = parse_search_results(html)
            pokemon = [r for r in results if "pokemon" in r.get("set", "").lower()]
            if not pokemon:
                pokemon = results
            cache_set(cache_key, pokemon)
            self._json({"results": pokemon[:limit], "cached": False})
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
