#!/usr/bin/env python3
"""
Holodex Price Server
Scrapes PriceCharting.com (public pages, no API key) for Pokemon card,
graded slab, and sealed product prices.

Usage:
    pip install -r requirements.txt
    python main.py

Runs on http://localhost:7890

Rate limiting: max 1 concurrent PriceCharting request, 1.5s between requests.
Cache: 6 hours in-memory.
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from bs4 import BeautifulSoup
import re
import time
import asyncio
from urllib.parse import quote_plus
from typing import Optional

try:
    import curl_cffi.requests as cffi_req
    USE_CFFI = True
except ImportError:
    import httpx
    USE_CFFI = False

app = FastAPI(title="Holodex Price Server", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Cache ────────────────────────────────────────────────────────────────────
_cache: dict = {}
CACHE_TTL = 60 * 60 * 6  # 6 hours

def _get(key: str):
    entry = _cache.get(key)
    if entry and time.time() < entry["expires"]:
        return entry["data"]
    return None

def _set(key: str, data):
    _cache[key] = {"data": data, "expires": time.time() + CACHE_TTL}

# ── Rate limiting ─────────────────────────────────────────────────────────────
_pc_semaphore = asyncio.Semaphore(1)  # only 1 concurrent PC request
_last_request_time: float = 0
MIN_REQUEST_GAP = 1.5  # seconds between requests

async def _fetch(url: str) -> str:
    """Fetch a URL with PriceCharting-friendly headers and rate limiting."""
    global _last_request_time

    async with _pc_semaphore:
        # Enforce minimum gap between requests
        elapsed = time.time() - _last_request_time
        if elapsed < MIN_REQUEST_GAP:
            await asyncio.sleep(MIN_REQUEST_GAP - elapsed)

        try:
            if USE_CFFI:
                async with cffi_req.AsyncSession(impersonate="chrome124") as s:
                    resp = await s.get(url, timeout=20)
                text = resp.text
                status = resp.status_code
            else:
                async with httpx.AsyncClient(timeout=20, follow_redirects=True) as s:
                    resp = await s.get(url, headers={
                        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
                        "Accept-Language": "en-US,en;q=0.9",
                    })
                text = resp.text
                status = resp.status_code
        finally:
            _last_request_time = time.time()

    if status != 200:
        raise HTTPException(502, f"PriceCharting returned {status}")
    return text

# ── Parsers ───────────────────────────────────────────────────────────────────

def _parse_price(text: str) -> float | None:
    """Parse '$1,234.56' → 1234.56"""
    if not text:
        return None
    clean = text.replace(",", "").replace("$", "").strip()
    try:
        val = float(clean)
        return val if val > 0 else None
    except ValueError:
        return None

def _parse_search_results(html: str) -> list[dict]:
    """Parse PriceCharting search results page into product list."""
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
        # name_cell looks like "Gengar VMAX #157Pokemon Fusion Strike"
        # Split on the set name pattern
        name = re.split(r'Pokemon ', name_cell, maxsplit=1)[0].strip()
        set_name = ("Pokemon " + name_cell.split("Pokemon ", 1)[1]) if "Pokemon " in name_cell else ""
        ungraded = _parse_price(cells[3].get_text(strip=True)) if len(cells) > 3 else None
        results.append({
            "name": name,
            "set": set_name,
            "url": url,
            "ungraded": ungraded,
        })
    return results

def _parse_product_grades(html: str) -> dict:
    """
    Parse a PriceCharting product page into a grade→price dict.
    Returns keys: ungraded, 1–9, 9.5, psa10, bgs10, cgc10, sgc10, ace10, tag10, bgs10b
    """
    soup = BeautifulSoup(html, "html.parser")
    fp = soup.select_one("#full-prices")
    if not fp:
        # Fallback: try the price_data info box
        return _parse_product_grades_fallback(soup)

    text = fp.get_text(separator="|")
    prices: dict[str, float] = {}

    # Label map — PriceCharting label → our key
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
        # sealed aliases
        "new": "new", "complete": "complete",
    }

    parts = [p.strip() for p in text.split("|") if p.strip()]
    i = 0
    while i < len(parts) - 1:
        label = parts[i].lower()
        price_str = parts[i + 1]
        key = label_map.get(label)
        if key and price_str.startswith("$"):
            val = _parse_price(price_str)
            if val:
                prices[key] = val
            i += 2
        else:
            i += 1

    return prices

def _parse_product_grades_fallback(soup: BeautifulSoup) -> dict:
    """Fallback: extract prices from the main price_data box."""
    prices: dict[str, float] = {}
    pid_map = {
        "used_price": "ungraded",
        "complete_price": "7",
        "new_price": "8",
        "graded_price": "9",
        "box_only_price": "9.5",
        "manual_only_price": "psa10",
    }
    for pid, key in pid_map.items():
        el = soup.select_one(f"#{pid} .js-price")
        if el:
            val = _parse_price(el.get_text(strip=True))
            if val:
                prices[key] = val
    return prices

def _grade_key(grade: str) -> str:
    """Normalize grade input to our internal key."""
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
    # numeric grades 1-9
    if re.match(r"^\d(\.\d)?$", g):
        return g
    return "ungraded"

# ── API endpoints ─────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0", "backend": "pricecharting_html"}


@app.get("/search")
async def search(q: str = Query(...), limit: int = Query(8, ge=1, le=20)):
    """
    Search PriceCharting for products matching a query.
    Returns list of {name, set, url, ungraded}.
    """
    q = q.strip()
    if not q:
        raise HTTPException(400, "Query cannot be empty")

    cache_key = f"search:{q.lower()}"
    cached = _get(cache_key)
    if cached:
        return {"results": cached[:limit], "cached": True}

    url = f"https://www.pricecharting.com/search-products?q={quote_plus(q)}&type=prices"
    html = await _fetch(url)
    results = _parse_search_results(html)
    # Filter to Pokemon products only
    pokemon = [r for r in results if "pokemon" in r.get("set", "").lower()]
    if not pokemon:
        pokemon = results  # fallback: return all if no Pokemon-specific results

    _set(cache_key, pokemon)
    return {"results": pokemon[:limit], "cached": False}


@app.get("/price")
async def get_price(
    q: str = Query(..., description="Search query"),
    grade: str = Query("ungraded", description="Grade: ungraded, 7, 8, 9, 9.5, 10, psa10, bgs10, etc."),
):
    """
    Get price for the best matching product at the requested grade.
    For graded slabs: grade=10 or grade=psa10
    For sealed products: grade=ungraded (uses new/sealed price if available)
    """
    q = q.strip()
    if not q:
        raise HTTPException(400, "Query cannot be empty")

    gkey = _grade_key(grade)
    cache_key = f"price:{q.lower()}:{gkey}"
    cached = _get(cache_key)
    if cached:
        return {**cached, "cached": True}

    # Step 1: search for matching products
    search_url = f"https://www.pricecharting.com/search-products?q={quote_plus(q)}&type=prices"
    search_html = await _fetch(search_url)
    results = _parse_search_results(search_html)

    pokemon = [r for r in results if "pokemon" in r.get("set", "").lower()]
    if not pokemon:
        pokemon = results
    if not pokemon:
        raise HTTPException(404, "No products found for that query")

    # Take first result
    product = pokemon[0]

    # Step 2: fetch product page for grade-specific price
    product_html = await _fetch(product["url"])
    grades = _parse_product_grades(product_html)

    # Try requested grade, then fallbacks
    fallback_order = [gkey, "psa10", "9", "9.5", "8", "ungraded"]
    price = None
    used_grade = None
    for k in fallback_order:
        if grades.get(k):
            price = grades[k]
            used_grade = k
            break

    if not price:
        raise HTTPException(404, f"No price found for grade '{grade}' — grades available: {list(grades.keys())}")

    result = {
        "query": q,
        "grade": used_grade,
        "price": price,
        "product_name": product["name"],
        "product_set": product["set"],
        "product_url": product["url"],
        "all_grades": grades,
        "cached": False,
    }
    _set(cache_key, result)
    return result


@app.get("/sealed")
async def search_sealed(q: str = Query(...), limit: int = Query(12, ge=1, le=30)):
    """
    Search PriceCharting for sealed Pokemon products matching a query.
    Appends 'sealed' to the query to filter results.
    Returns list of {name, set, url, price, slug}.
    """
    q = q.strip()
    if not q:
        raise HTTPException(400, "Query cannot be empty")

    cache_key = f"sealed:{q.lower()}"
    cached = _get(cache_key)
    if cached:
        return {"results": cached[:limit], "cached": True}

    search_q = f"{q} sealed"
    url = f"https://www.pricecharting.com/search-products?q={quote_plus(search_q)}&type=prices"
    html = await _fetch(url)

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
        # raw looks like "Booster BoxPokemon Fusion Strike"
        # or "Elite Trainer Box [Pokemon Center]Pokemon Fusion Strike"
        # split on the LAST occurrence of "Pokemon " to get the set name
        idx = raw.rfind("Pokemon ")
        if idx > 0:
            name = raw[:idx].strip()
            set_name = raw[idx:].strip()
        else:
            name = raw.strip()
            set_name = ""
        price = _parse_price(cells[3].get_text(strip=True))

        # Skip accessories, portfolios, sleeves
        skip = ["sleeve", "portfolio", "mini portfolio", "binder", "dice", "coin", "mini tin accessory"]
        if any(s in name.lower() for s in skip):
            continue

        results.append({
            "name": name,
            "set": set_name,
            "url": href,
            "slug": slug,
            "price": price,
        })

    _set(cache_key, results)
    return {"results": results[:limit], "cached": False}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=7890, log_level="info")
