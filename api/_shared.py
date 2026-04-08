"""Shared utilities for Vercel serverless price functions."""

from __future__ import annotations

import json
import re
import time
from urllib.parse import quote_plus

import httpx
from bs4 import BeautifulSoup

# ── Cache (in-memory, per-instance, ~6h TTL) ────────────────────────────────
_cache: dict = {}
CACHE_TTL = 60 * 60 * 6

def cache_get(key: str):
    entry = _cache.get(key)
    if entry and time.time() < entry["expires"]:
        return entry["data"]
    return None

def cache_set(key: str, data):
    _cache[key] = {"data": data, "expires": time.time() + CACHE_TTL}


# ── HTTP fetch with Chrome-like headers ──────────────────────────────────────
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}

async def fetch_html(url: str) -> str:
    async with httpx.AsyncClient(timeout=20, follow_redirects=True, headers=HEADERS) as client:
        resp = await client.get(url)
    if resp.status_code != 200:
        raise Exception(f"PriceCharting returned {resp.status_code}: {resp.text[:200]}")
    # Check for CAPTCHA/block pages
    if "captcha" in resp.text.lower() or "challenge" in resp.text.lower()[:500]:
        raise Exception("PriceCharting returned a CAPTCHA page — scraping blocked from this IP")
    return resp.text


# ── Parsers ──────────────────────────────────────────────────────────────────
def parse_price(text: str) -> float | None:
    if not text:
        return None
    clean = text.replace(",", "").replace("$", "").strip()
    try:
        val = float(clean)
        return val if val > 0 else None
    except ValueError:
        return None


def parse_search_results(html: str) -> list[dict]:
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
        url = a.get("href", "")
        name_cell = cells[1].get_text(strip=True)
        name = re.split(r'Pokemon ', name_cell, maxsplit=1)[0].strip()
        set_name = ("Pokemon " + name_cell.split("Pokemon ", 1)[1]) if "Pokemon " in name_cell else ""
        ungraded = parse_price(cells[3].get_text(strip=True)) if len(cells) > 3 else None
        results.append({"name": name, "set": set_name, "url": url, "ungraded": ungraded})
    return results


def parse_product_grades(html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    fp = soup.select_one("#full-prices")
    if not fp:
        return _parse_grades_fallback(soup)

    text = fp.get_text(separator="|")
    prices: dict[str, float] = {}

    label_map = {
        "ungraded": "ungraded",
        "grade 1": "1", "grade 2": "2", "grade 3": "3",
        "grade 4": "4", "grade 5": "5", "grade 6": "6",
        "grade 7": "7", "grade 8": "8", "grade 9": "9",
        "grade 9.5": "9.5",
        "psa 10": "psa10", "psa10": "psa10",
        "bgs 10": "bgs10", "bgs 10 black": "bgs10b",
        "cgc 10": "cgc10", "sgc 10": "sgc10",
        "ace 10": "ace10", "tag 10": "tag10",
        "new": "new", "complete": "complete",
    }

    parts = [p.strip() for p in text.split("|") if p.strip()]
    i = 0
    while i < len(parts) - 1:
        label = parts[i].lower()
        price_str = parts[i + 1]
        key = label_map.get(label)
        if key and price_str.startswith("$"):
            val = parse_price(price_str)
            if val:
                prices[key] = val
            i += 2
        else:
            i += 1
    return prices


def _parse_grades_fallback(soup: BeautifulSoup) -> dict:
    prices: dict[str, float] = {}
    pid_map = {
        "used_price": "ungraded", "complete_price": "7", "new_price": "8",
        "graded_price": "9", "box_only_price": "9.5", "manual_only_price": "psa10",
    }
    for pid, key in pid_map.items():
        el = soup.select_one(f"#{pid} .js-price")
        if el:
            val = parse_price(el.get_text(strip=True))
            if val:
                prices[key] = val
    return prices


def grade_key(grade: str) -> str:
    g = grade.lower().strip()
    if g in ("10", "psa10", "psa 10", "gem mint"):
        return "psa10"
    if g in ("9.5", "bgs9.5"):
        return "9.5"
    if g in ("bgs10", "bgs 10"):
        return "bgs10"
    if g in ("cgc10", "cgc 10"):
        return "cgc10"
    if g in ("ungraded", "raw", "loose"):
        return "ungraded"
    if re.match(r"^\d(\.\d)?$", g):
        return g
    return "ungraded"


def json_response(data: dict, status: int = 200) -> dict:
    """Return a Vercel-compatible response."""
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        },
        "body": json.dumps(data),
    }
