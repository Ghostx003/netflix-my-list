"""Direct Python Exporter for SQLite Knowledge Base Backup.
Exports the complete SQLite database and 100 continuous parameters
into a full backup snapshot compatible with the web app and new computer setup.

Usage:
    python scripts/export_sqlite_backup.py [output_path.json]
"""

import os
import sys
import json
import sqlite3
from datetime import datetime

# Ensure scripts module is accessible
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.enrichment.taxonomy import ALL_100_PARAMETERS


def export_sqlite_to_backup(output_path: str = None) -> str:
    db_path = "scripts/enrichment/netflix_knowledge_base.sqlite"
    if not os.path.exists(db_path):
        print(f"[ERROR] SQLite database not found at '{db_path}'")
        sys.exit(1)

    today = datetime.now().strftime("%Y-%m-%d")
    if not output_path:
        output_path = f"netflix-watchlist-backup-{today}.json"

    print(f"\n{'='*70}")
    print(f" EXPORTING SQLITE KNOWLEDGE BASE TO BACKUP SNAPSHOT")
    print(f" Source SQLite: {db_path} ({os.path.getsize(db_path)/(1024*1024):.2f} MB)")
    print(f" Destination:   {output_path}")
    print(f"{'='*70}\n")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM enriched_titles WHERE status = 'completed'")
    rows = cursor.fetchall()
    print(f"[1/3] Loaded {len(rows)} enriched rows from SQLite...")

    sqlite_records = []
    discovery_catalog = []

    for r in rows:
        r_dict = dict(r)

        # Extract 100 continuous parameters
        params100 = {}
        for p in ALL_100_PARAMETERS:
            v = r_dict.get(f"param_{p}", 0.0)
            if v and float(v) > 0.0:
                params100[p] = round(float(v), 3)

        # Clean JSON arrays
        def parse_json_list(val):
            if isinstance(val, list):
                return val
            if isinstance(val, str) and val.strip().startswith("["):
                try:
                    return json.loads(val)
                except Exception:
                    pass
            return []

        sec_genres = parse_json_list(r_dict.get("secondary_genres"))
        all_genres = [r_dict.get("primary_genre")] if r_dict.get("primary_genre") else []
        all_genres.extend(sec_genres)
        all_genres = list(set([g for g in all_genres if g]))

        moods = parse_json_list(r_dict.get("moods"))
        themes = parse_json_list(r_dict.get("themes"))
        archetypes = parse_json_list(r_dict.get("narrative_archetypes"))

        item_clean = {
            "id": r_dict.get("id"),
            "title": r_dict.get("title"),
            "release_year": r_dict.get("release_year"),
            "media_type": r_dict.get("media_type") or "movie",
            "primary_genre": r_dict.get("primary_genre") or "Drama",
            "secondary_genres": sec_genres,
            "minor_genres": parse_json_list(r_dict.get("minor_genres")),
            "moods": moods,
            "themes": themes,
            "narrative_archetypes": archetypes,
            "story_pace": r_dict.get("story_pace"),
            "ending_type": r_dict.get("ending_type"),
            "time_period": r_dict.get("time_period"),
            "setting_environment": r_dict.get("setting_environment"),
            "audience_vibe": r_dict.get("audience_vibe"),
            "confidence_score": float(r_dict.get("confidence_score") or 0.95),
            "synopsis": r_dict.get("synopsis", ""),
            "parameters_100": params100,
        }
        sqlite_records.append(item_clean)

        # Discovery Title model representation
        discovery_catalog.append({
            "id": r_dict.get("id"),
            "title": r_dict.get("title"),
            "originalTitle": r_dict.get("title"),
            "mediaType": r_dict.get("media_type") or "movie",
            "releaseYear": r_dict.get("release_year"),
            "genres": all_genres if all_genres else ["Drama"],
            "themes": themes,
            "moods": moods,
            "synopsis": r_dict.get("synopsis", ""),
            "rating": 7.5,
            "imdbRating": 7.5,
            "isNetflixIndiaVerified": True,
            "countries": ["India"],
            "parameters_100": params100,
            "storyPace": r_dict.get("story_pace"),
            "endingType": r_dict.get("ending_type"),
            "timePeriod": r_dict.get("time_period"),
            "settingEnvironment": r_dict.get("setting_environment"),
            "audienceVibe": r_dict.get("audience_vibe"),
            "narrativeArchetypes": archetypes,
            "qwenConfidence": float(r_dict.get("confidence_score") or 0.95),
        })

    conn.close()

    # Load existing library items & settings if present
    existing_items = []
    settings = {
        "tmdbApiKey": "",
        "maxEpisodesPerSeries": 50,
        "playbackSpeed": 1.0,
        "dailyViewingHours": 2,
        "gymSessionsPerDay": 1,
        "gymHoursPerSession": 1,
        "mealDailyHours": 1,
        "enableGymMode": False,
    }

    if os.path.exists("netflix-my-list.json"):
        try:
            with open("netflix-my-list.json", "r", encoding="utf-8") as f:
                existing_items = json.load(f)
                print(f"[2/3] Included {len(existing_items)} personal watchlist items from 'netflix-my-list.json'")
        except Exception:
            pass

    backup_payload = {
        "version": 2,
        "exportedAt": datetime.now().isoformat(),
        "items": existing_items,
        "settings": settings,
        "discoveryCatalog": discovery_catalog,
        "sqliteKnowledgeBase": sqlite_records,
    }

    print(f"[3/3] Writing backup JSON package to '{output_path}'...")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(backup_payload, f, ensure_ascii=False)

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"\n{'='*70}")
    print(f" EXPORT SUCCESSFUL: {len(sqlite_records)} TITLES BACKED UP!")
    print(f" Output File: {output_path} ({size_mb:.2f} MB)")
    print(f" You can transfer this single file to any computer and restore with:")
    print(f"   python scripts/restore_sqlite_from_backup.py {output_path}")
    print(f" Or drag-and-drop into the web app's 'Restore from Backup' modal.")
    print(f"{'='*70}\n")
    return output_path


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else None
    export_sqlite_to_backup(out)
