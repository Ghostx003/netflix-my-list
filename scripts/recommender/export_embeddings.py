"""Batch Embedding Generator for BAAI/bge-small-en-v1.5.
Processes the Netflix catalogue offline on local hardware (GTX 1650 or i5 CPU).
Exports:
1. `public/embeddings.bin`: Raw contiguous Float32 binary file (N x 384 x 4 bytes).
2. `public/catalogue_metadata.json`: Compact JSON metadata for Vercel/Web client lookup.
"""

import os
import json
import numpy as np
from typing import List, Dict, Any

from scripts.recommender.config import CONFIG
from scripts.recommender.dataset_processor import format_composite_document, calculate_bayesian_quality


def export_binary_embeddings(
    catalogue: List[Dict[str, Any]],
    embeddings: np.ndarray,
    output_bin_path: str = "public/embeddings.bin",
    output_json_path: str = "public/catalogue_metadata.json",
):
    """
    Saves unit-normalized Float32 embeddings into an ultra-compact binary file,
    and exports pruned JSON metadata for fast client or serverless indexing.
    """
    os.makedirs(os.path.dirname(output_bin_path), exist_ok=True)
    os.makedirs(os.path.dirname(output_json_path), exist_ok=True)

    # 1. Ensure float32 and unit-normalized
    norm_embeddings = embeddings.astype(np.float32)
    norms = np.linalg.norm(norm_embeddings, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    norm_embeddings = norm_embeddings / norms

    # 2. Save contiguous binary file
    norm_embeddings.tofile(output_bin_path)
    file_size_mb = os.path.getsize(output_bin_path) / (1024 * 1024)
    print(f"[EXPORT] Saved {len(catalogue)} vectors to '{output_bin_path}' ({file_size_mb:.2f} MB)")

    # 3. Export pruned metadata
    pruned_catalogue = []
    for idx, item in enumerate(catalogue):
        imdb = float(item.get("imdb_rating") or item.get("rating") or 6.5)
        votes = int(item.get("imdb_votes") or item.get("voteCount") or 500)
        pruned_catalogue.append({
            "id": item.get("id", idx),
            "title": item.get("title") or item.get("originalTitle"),
            "year": item.get("releaseYear") or item.get("year"),
            "runtime": item.get("runtimeMinutes") or item.get("runtime"),
            "type": item.get("mediaType", "movie"),
            "genres": item.get("genres", []),
            "mood_tags": item.get("mood_tags") or item.get("moodTags", []),
            "themes": item.get("themes") or item.get("tags", []),
            "story_pace": item.get("story_pace"),
            "ending_type": item.get("ending_type"),
            "setting": item.get("setting_environment"),
            "time_period": item.get("time_period"),
            "audience_vibe": item.get("audience_vibe"),
            "imdb_rating": imdb,
            "imdb_votes": votes,
            "bayesian_quality_score": round(calculate_bayesian_quality(imdb, votes), 3),
            "vector_index": idx,
        })

    with open(output_json_path, "w", encoding="utf-8") as f:
        json.dump(pruned_catalogue, f, ensure_ascii=False, indent=2)

    json_size_mb = os.path.getsize(output_json_path) / (1024 * 1024)
    print(f"[EXPORT] Saved pruned metadata to '{output_json_path}' ({json_size_mb:.2f} MB)")


def load_catalogue_from_sqlite(db_path: str = "scripts/enrichment/netflix_knowledge_base.sqlite") -> List[Dict[str, Any]]:
    """Loads enriched titles directly from the persistent SQLite knowledge base."""
    if not os.path.exists(db_path):
        return []
    import sqlite3
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, title, release_year, media_type, primary_genre, secondary_genres,
               moods, themes, synopsis, story_pace, ending_type, time_period,
               setting_environment, audience_vibe, param_action, param_comedy,
               param_romance, param_horror, param_thriller, param_darkness_bleakness,
               param_heartwarming
        FROM enriched_titles
    """)
    rows = cursor.fetchall()
    catalogue = []
    for r in rows:
        genres = [r[4]] if r[4] else []
        try:
            sec = json.loads(r[5]) if r[5] else []
            genres.extend(sec)
        except Exception:
            pass
        moods = []
        try:
            moods = json.loads(r[6]) if r[6] else []
        except Exception:
            pass
        themes = []
        try:
            themes = json.loads(r[7]) if r[7] else []
        except Exception:
            pass

        catalogue.append({
            "id": r[0],
            "title": r[1],
            "year": r[2],
            "releaseYear": r[2],
            "mediaType": r[3] or "movie",
            "type": r[3] or "movie",
            "genres": list(set(genres)),
            "mood_tags": moods,
            "themes": themes,
            "synopsis": r[8] or "",
            "story_pace": r[9],
            "ending_type": r[10],
            "time_period": r[11],
            "setting_environment": r[12],
            "audience_vibe": r[13],
            "imdb_rating": 7.5,
            "imdb_votes": 50000,
            "action_intensity": r[14],
            "comedy_intensity": r[15],
            "romance_intensity": r[16],
            "horror_intensity": r[17],
            "thriller_intensity": r[18],
            "darkness_bleakness": r[19],
            "heartwarming_level": r[20],
        })
    return catalogue


if __name__ == "__main__":
    from scripts.recommender.demo_verification import create_mock_catalogue, generate_deterministic_vectors

    sqlite_cat = load_catalogue_from_sqlite()
    if sqlite_cat and len(sqlite_cat) >= 5:
        print(f"[EXPORT] Found {len(sqlite_cat)} enriched records in SQLite knowledge base. Using enriched catalogue.")
        cat = sqlite_cat
    else:
        print(f"[EXPORT] Using mock verification catalogue.")
        cat = create_mock_catalogue()

    vectors = generate_deterministic_vectors(cat)
    export_binary_embeddings(cat, vectors)

