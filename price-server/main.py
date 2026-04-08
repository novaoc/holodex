#!/usr/bin/env python3
"""
Holodex Price Server
Scrapes eBay completed/sold listings to get market prices for sealed products
and graded slabs. No API keys required.

Usage:
    pip install -r requirements.txt
    python main.py

Runs on http://localhost:7890
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import httpx
from bs4 import BeautifulSoup
import statistics
import re
import time
from urllib.parse import quote_plus
from typing import Optional

app = FastAPI(title="Holodex Price Server", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory cache: key → { data, expires }
_cache: dict = {}
CACHE_TTL = 60 * 30  # 30 minutes


def _get(key: str):
    entry = _cache.get(key)
    if entry and time.time() < entry["expires"]:
        return entry["data"]
    return None


def _set(key: str, data):
    _cache[key] = {"data": data, "expires": time.time() + CACHE_TTL}


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


def parse_price(text: str) -> float | None:
    """Extract a USD price from a string. Handles ranges by taking the lower bound."""
    text = text.replace(",", "").strip()
    text = text.split(" to ")[0]  # "$5.00 to $10.00" → "$5.00"
    m = re.search(r"\$?([\d]+\.?\d*)", text)
    if m:
        try:
            val = float(m.group(1))
            return val if val > 0.5 else None
        except ValueError:
            pass
    return None


async def scrape_ebay_sold(query: str, limit: int = 15) -> list[float]:
    """
    Fetch eBay completed+sold listings and return list of sold prices (USD).
    Uses _sop=13 (newly listed first) so we get recent sales.
    """
    url = (
        "https://www.ebay.com/sch/i.html"
        f"?_nkw={quote_plus(query)}"
        "&LH_Sold=1&LH_Complete=1&_sop=13&_ipg=25"
    )

    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url, headers=HEADERS)
    except httpx.TimeoutException:
        raise HTTPException(504, "eBay request timed out")
    except httpx.RequestError as e:
        raise HTTPException(502, f"Network error: {e}")

    if resp.status_code != 200:
        raise HTTPException(502, f"eBay returned {resp.status_code}")

    soup = BeautifulSoup(resp.text, "html.parser")
    prices = []

    for item in soup.select(".s-item"):
        # Skip eBay's injected "Shop on eBay" ghost row
        title_el = item.select_one(".s-item__title")
        if not title_el or "shop on ebay" in title_el.get_text().lower():
            continue

        price_el = item.select_one(".s-item__price")
        if not price_el:
            continue

        price = parse_price(price_el.get_text())
        if price and price < 50_000:
            prices.append(price)

        if len(prices) >= limit:
            break

    return prices


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0"}


@app.get("/price")
async def get_price(
    q: str = Query(..., description="Search query"),
    limit: int = Query(12, ge=3, le=30),
):
    """
    Get market price estimate from recent eBay sold listings.
    Returns median, mean, min/max, and the raw price list.
    Results are cached for 30 minutes.
    """
    q = q.strip()
    if not q:
        raise HTTPException(400, "Query cannot be empty")

    cache_key = f"{q.lower()}:{limit}"
    cached = _get(cache_key)
    if cached:
        return {**cached, "cached": True}

    prices = await scrape_ebay_sold(q, limit)

    if not prices:
        raise HTTPException(404, "No sold listings found — try a more specific query")

    result = {
        "query": q,
        "median": round(statistics.median(prices), 2),
        "mean": round(statistics.mean(prices), 2),
        "min": round(min(prices), 2),
        "max": round(max(prices), 2),
        "count": len(prices),
        "prices": [round(p, 2) for p in prices],
        "source": "ebay_sold",
        "cached": False,
    }
    _set(cache_key, result)
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=7890, log_level="info")
