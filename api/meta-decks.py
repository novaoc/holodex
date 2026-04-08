"""GET /api/meta-decks — live meta decks from Limitless TCG."""

from http.server import BaseHTTPRequestHandler
import json
import re
import time

import httpx
from bs4 import BeautifulSoup

# ── Cache (in-memory, per-instance, 24h TTL) ─────────────────────────────────
_cache: dict = {}
CACHE_TTL = 60 * 60 * 24

def cache_get(key: str):
    entry = _cache.get(key)
    if entry and time.time() < entry["expires"]:
        return entry["data"]
    return None

def cache_set(key: str, data):
    _cache[key] = {"data": data, "expires": time.time() + CACHE_TTL}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

def fetch(url: str) -> str:
    with httpx.Client(timeout=15, follow_redirects=True, headers=HEADERS) as client:
        resp = client.get(url)
    resp.raise_for_status()
    return resp.text


def parse_meta_table(html: str) -> list[dict]:
    """Parse the /decks page table into ranked deck list."""
    soup = BeautifulSoup(html, "html.parser")
    table = soup.select_one("table.data-table")
    if not table:
        return []

    decks = []
    rows = table.select("tr")
    for row in rows:
        cells = row.select("td")
        if len(cells) < 4:
            continue

        link = cells[2].select_one("a")
        if not link:
            continue

        href = link.get("href", "")
        deck_id = href.replace("/decks/", "").strip()

        # Extract name: get full text, then separate annotation
        full_text = link.get_text(separator=" ", strip=True)
        # annotation is inside <span class="annotation">
        ann_span = link.select_one("span.annotation")
        annotation = ann_span.get_text(strip=True) if ann_span else ""
        name_text = full_text.replace(annotation, "").strip() if annotation else full_text

        points = cells[3].get_text(strip=True).replace(",", "")
        share = cells[-1].get_text(strip=True) if len(cells) > 4 else ""
        rank = cells[0].get_text(strip=True)

        try:
            decks.append({
                "rank": int(rank),
                "id": deck_id,
                "name": full_text,
                "archetype": name_text.replace(" ", ""),
                "points": int(points),
                "share": share,
            })
        except (ValueError, IndexError):
            continue

    return decks


def parse_deck_cards(html: str) -> list[dict]:
    """Parse a deck page for its core cards using data attributes."""
    soup = BeautifulSoup(html, "html.parser")

    cards = []
    for card_el in soup.select(".core-card"):
        img = card_el.select_one("img[data-card]")
        if not img:
            continue

        set_code = img.get("data-set", "")
        number = img.get("data-number", "")
        alt = img.get("alt", "")

        # Parse quantity from share text: "2 in 100%" → quantity=2
        share_span = card_el.select_one(".share")
        share_text = share_span.get_text(strip=True) if share_span else ""
        qty_match = re.match(r"(\d+)\s+in\s+", share_text)
        quantity = int(qty_match.group(1)) if qty_match else 1

        if set_code and number:
            cards.append({
                "setCode": set_code,
                "number": number,
                "name": alt,
                "quantity": quantity,
            })

    return cards


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        cached = cache_get("meta-decks")
        if cached:
            self._json({"decks": cached, "cached": True})
            return

        try:
            # Fetch the meta decks page
            html = fetch("https://limitlesstcg.com/decks?format=standard")
            deck_list = parse_meta_table(html)

            if not deck_list:
                self._json({"error": "No decks found", "decks": []}, 502)
                return

            # Fetch card lists for top 8 decks
            resolved = []
            for deck_meta in deck_list[:8]:
                try:
                    deck_html = fetch(f"https://limitlesstcg.com/decks/{deck_meta['id']}")
                    cards = parse_deck_cards(deck_html)

                    if cards:
                        resolved.append({
                            "name": deck_meta["name"],
                            "archetype": deck_meta["archetype"],
                            "description": f"{deck_meta['share']} meta share · {deck_meta['points']:,} CP",
                            "meta": {
                                "rank": deck_meta["rank"],
                                "share": deck_meta["share"],
                                "points": deck_meta["points"],
                            },
                            "cards": cards,
                        })
                except Exception:
                    continue

            if resolved:
                cache_set("meta-decks", resolved)

            self._json({"decks": resolved, "cached": False})

        except Exception as e:
            self._json({"error": str(e), "decks": []}, 502)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def _json(self, data: dict, status: int = 200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
