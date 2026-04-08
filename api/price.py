"""GET /api/price?q=...&grade=ungraded — get price for a product at a grade."""

from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
import asyncio
from api._shared import (
    fetch_html, parse_search_results, parse_product_grades,
    grade_key, cache_get, cache_set, quote_plus,
)


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        params = parse_qs(urlparse(self.path).query)
        q = (params.get("q", [""])[0]).strip()
        grade = params.get("grade", ["ungraded"])[0]

        if not q:
            self._json({"error": "Query cannot be empty"}, 400)
            return

        gkey = grade_key(grade)
        cache_key = f"price:{q.lower()}:{gkey}"
        cached = cache_get(cache_key)
        if cached:
            self._json({**cached, "cached": True})
            return

        try:
            pass  # use asyncio.run()

            # Search
            search_url = f"https://www.pricecharting.com/search-products?q={quote_plus(q)}&type=prices"
            search_html = asyncio.run(fetch_html(search_url))
            results = parse_search_results(search_html)

            pokemon = [r for r in results if "pokemon" in r.get("set", "").lower()]
            if not pokemon:
                pokemon = results
            if not pokemon:
                self._json({"error": "No products found"}, 404)
                return

            product = pokemon[0]

            # Fetch product page
            product_html = asyncio.run(fetch_html(product["url"]))
            grades = parse_product_grades(product_html)

            fallback_order = [gkey, "psa10", "9", "9.5", "8", "ungraded"]
            price = None
            used_grade = None
            for k in fallback_order:
                if grades.get(k):
                    price = grades[k]
                    used_grade = k
                    break

            if not price:
                self._json({"error": f"No price for grade '{grade}'", "available": list(grades.keys())}, 404)
                return

            result = {
                "query": q, "grade": used_grade, "price": price,
                "product_name": product["name"], "product_set": product["set"],
                "product_url": product["url"], "all_grades": grades, "cached": False,
            }
            cache_set(cache_key, result)
            self._json(result)
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
