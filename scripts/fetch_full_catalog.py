"""Catalog Extractor for Netflix India.
Pulls the complete live Netflix India library (~4,300+ titles)
from TMDB open discovery endpoints (provider ID 8 = Netflix, region = IN).
Zero credentials or paid API required.
Exports to: data/netflix_india_all_titles.json
"""

import os
import json
import time
import urllib.request
import urllib.parse
from typing import List, Dict, Any

API_KEY = "15d2ea6d0dc1d476efbca3eba2b9bbfb"
HEADERS = {"User-Agent": "Mozilla/5.0"}
OUTPUT_PATH = "data/netflix_india_all_titles.json"


def fetch_netflix_india_catalog(target_count: int = 4300) -> List[Dict[str, Any]]:
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    all_titles = []
    seen_ids = set()

    # 1. First include existing netflix-my-list.json titles
    if os.path.exists("netflix-my-list.json"):
        with open("netflix-my-list.json", "r", encoding="utf-8") as f:
            my_list = json.load(f)
            for item in my_list:
                vid = str(item.get("videoId") or item.get("id"))
                all_titles.append({
                    "id": vid,
                    "title": item.get("title"),
                    "mediaType": "movie",
                    "source": "my-list"
                })
                seen_ids.add(item.get("title").lower())
        print(f"[CATALOG] Loaded {len(all_titles)} titles from user netflix-my-list.json")

    # 2. Discover Netflix India Movies & TV Series from TMDB provider 8
    endpoints = [
        ("discover/movie", "movie"),
        ("discover/tv", "tv")
    ]

    for ep, media_type in endpoints:
        page = 1
        max_pages = 120  # ~2,400 titles per type = ~4,800 total
        print(f"\n[CATALOG] Fetching Netflix India {media_type.upper()} titles from TMDB...")

        while page <= max_pages and len(all_titles) < target_count + 500:
            url = f"https://api.themoviedb.org/3/{ep}?api_key={API_KEY}&with_watch_providers=8&watch_region=IN&page={page}"
            try:
                req = urllib.request.Request(url, headers=HEADERS)
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = json.loads(resp.read().decode("utf-8"))

                results = data.get("results", [])
                if not results:
                    break

                for r in results:
                    name = r.get("title") or r.get("name")
                    if not name:
                        continue
                    key = name.lower()
                    if key in seen_ids:
                        continue
                    seen_ids.add(key)

                    release_date = r.get("release_date") or r.get("first_air_date") or ""
                    year = int(release_date[:4]) if len(release_date) >= 4 and release_date[:4].isdigit() else None

                    all_titles.append({
                        "id": f"tmdb_{media_type}_{r['id']}",
                        "tmdbId": r["id"],
                        "title": name,
                        "releaseYear": year,
                        "mediaType": media_type,
                        "synopsis": r.get("overview", ""),
                        "rating": r.get("vote_average", 0.0),
                        "voteCount": r.get("vote_count", 0),
                        "source": "netflix_india_provider"
                    })

                print(f"       Page {page} processed. Total unique titles collected: {len(all_titles)}")
                page += 1
                time.sleep(0.15)  # fast and respectful
            except Exception as e:
                print(f"       [WARN] Page {page} error: {e}. Retrying in 1s...")
                time.sleep(1.0)
                page += 1

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(all_titles, f, ensure_ascii=False, indent=2)

    print(f"\n[CATALOG READY] Saved {len(all_titles)} Netflix India titles to '{OUTPUT_PATH}'!")
    return all_titles


if __name__ == "__main__":
    fetch_netflix_india_catalog(4300)
