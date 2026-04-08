"""GET /api/meta-decks — live meta decks from Limitless TCG."""

from http.server import BaseHTTPRequestHandler
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

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

# Shared HTTP client for connection pooling
_client = None

def get_client():
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.Client(timeout=10, follow_redirects=True, headers=HEADERS)
    return _client

def fetch(url: str) -> str:
    resp = get_client().get(url)
    resp.raise_for_status()
    return resp.text

def fetch_json(url: str) -> dict:
    resp = get_client().get(url)
    resp.raise_for_status()
    return resp.json()

# Map Limitless set codes to pokemontcg.io set IDs
SET_CODE_MAP = {
    "SVI": "sv1", "PAL": "sv2", "OBF": "sv3", "PAF": "sv4pt5", "PAR": "sv4",
    "TEF": "sv5", "TWM": "sv6", "SFA": "sv6pt5", "SCR": "sv7", "SSP": "sv8",
    "PRE": "sv8pt5", "JTG": "sv9", "DRI": "sv10",
    "MEG": "me1", "ASC": "me2pt5",
    "BRS": "swsh9", "FST": "swsh8", "EVS": "swsh7", "CRE": "swsh6", "BST": "swsh5",
    "DAA": "swsh3", "RCL": "swsh2", "SSH": "swsh1", "CEL": "cel25", "CRZ": "swsh12pt5",
}

PRIORITY_ORDER = {
    "Common": 0, "Uncommon": 1, "Rare": 2, "Rare Holo": 3,
    "Double Rare": 4, "Ultra Rare": 5, "Illustration Rare": 6,
    "Special Illustration Rare": 7, "Hyper Rare": 8, "Secret Rare": 9,
}

def resolve_card(args):
    """Look up a card on pokemontcg.io by set code + number."""
    set_code, number, quantity = args
    api_set = SET_CODE_MAP.get(set_code, set_code.lower())
    url = f"https://api.pokemontcg.io/v2/cards?q=set.id:{api_set}+number:{number}&pageSize=5"
    try:
        data = fetch_json(url)
        cards = data.get("data", [])
        if not cards:
            return None

        cards.sort(key=lambda c: PRIORITY_ORDER.get(c.get("rarity", ""), 5))
        card = cards[0]

        price = None
        prices = card.get("tcgplayer", {}).get("prices", {})
        for key in ["holofoil", "normal", "reverseHolofoil"]:
            if key in prices and prices[key].get("market"):
                price = prices[key]["market"]
                break
        if price is None:
            for v in prices.values():
                if v.get("market"):
                    price = v["market"]
                    break

        return {
            "cardId": card["id"],
            "name": card["name"],
            "setName": card.get("set", {}).get("name", ""),
            "setCode": card.get("set", {}).get("id", api_set),
            "number": card.get("number", number),
            "quantity": quantity,
            "price": price,
            "image": card.get("images", {}).get("small", ""),
        }
    except Exception:
        return None


def resolve_cards_parallel(card_list):
    """Resolve multiple cards in parallel using threads."""
    tasks = [(c["setCode"], c["number"], c["quantity"]) for c in card_list]
    results = []
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(resolve_card, t): i for i, t in enumerate(tasks)}
        ordered = [None] * len(tasks)
        for future in as_completed(futures):
            idx = futures[future]
            try:
                result = future.result()
                if result:
                    ordered[idx] = result
            except Exception:
                pass
        results = [r for r in ordered if r]
    return results


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

        # Extract name
        full_text = link.get_text(separator=" ", strip=True)
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
            # 1. Scrape Limitless meta table
            html = fetch("https://limitlesstcg.com/decks?format=standard")
            deck_list = parse_meta_table(html)

            if not deck_list:
                self._json({"error": "No decks found", "decks": []}, 502)
                return

            # 2. For top 8 decks, scrape core cards
            raw_decks = []
            for deck_meta in deck_list[:8]:
                try:
                    deck_html = fetch(f"https://limitlesstcg.com/decks/{deck_meta['id']}")
                    cards = parse_deck_cards(deck_html)
                    if cards:
                        raw_decks.append({**deck_meta, "cards": cards})
                except Exception:
                    continue

            # 3. Resolve ALL cards in parallel across all decks
            all_cards = []
            card_deck_map = []  # track which card belongs to which deck
            for di, deck in enumerate(raw_decks):
                for card in deck["cards"]:
                    all_cards.append(card)
                    card_deck_map.append(di)

            resolved_all = resolve_cards_parallel(all_cards)

            # 4. Group resolved cards back into decks
            deck_cards = [[] for _ in raw_decks]
            for ci, resolved in enumerate(resolved_all):
                deck_idx = card_deck_map[ci]
                deck_cards[deck_idx].append(resolved)

            resolved_decks = []
            for di, deck in enumerate(raw_decks):
                if deck_cards[di]:
                    resolved_decks.append({
                        "name": deck["name"],
                        "archetype": deck["archetype"],
                        "description": f"{deck['share']} meta share · {deck['points']:,} CP",
                        "meta": {
                            "rank": deck["rank"],
                            "share": deck["share"],
                            "points": deck["points"],
                        },
                        "cards": deck_cards[di],
                    })

            if resolved_decks:
                cache_set("meta-decks", resolved_decks)

            self._json({"decks": resolved_decks, "cached": False})

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
