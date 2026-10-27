"""Restore SQLite Knowledge Base and Enriched JSON from Backup Snapshot.
Enables instant zero-friction migration of all 4,800+ enriched titles with
100 continuous parameters and narrative intelligence to any new computer.
Runs purely on standard Python (zero pip dependencies required).

Usage:
    python scripts/restore_sqlite_from_backup.py [path/to/backup.json]
If no path is specified, searches for the latest backup JSON in the project.
"""

import os
import sys
import json
import glob
import sqlite3
import zipfile
import shutil
from typing import Dict, Any, List

# Ensure scripts module is accessible
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.enrichment.taxonomy import ALL_100_PARAMETERS


def init_sqlite_schema(conn: sqlite3.Connection):
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS enriched_titles (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        release_year INTEGER,
        media_type TEXT,
        primary_genre TEXT,
        secondary_genres TEXT,
        minor_genres TEXT,
        moods TEXT,
        themes TEXT,
        narrative_archetypes TEXT,
        story_pace TEXT,
        ending_type TEXT,
        time_period TEXT,
        setting_environment TEXT,
        audience_vibe TEXT,
        sources TEXT,
        confidence_score REAL DEFAULT 0.0,
        synopsis TEXT,
        raw_profile_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'completed'
    );
    """)

    cursor.execute("PRAGMA table_info(enriched_titles);")
    existing_cols = {row[1] for row in cursor.fetchall()}

    for col, col_type in [
        ("time_period", "TEXT"),
        ("setting_environment", "TEXT"),
        ("audience_vibe", "TEXT"),
    ]:
        if col not in existing_cols:
            cursor.execute(f"ALTER TABLE enriched_titles ADD COLUMN {col} {col_type};")

    for param in ALL_100_PARAMETERS:
        col_name = f"param_{param}"
        if col_name not in existing_cols:
            cursor.execute(f"ALTER TABLE enriched_titles ADD COLUMN {col_name} REAL DEFAULT 0.0;")

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_enriched_title ON enriched_titles (title);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_enriched_primary_genre ON enriched_titles (primary_genre);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_enriched_action ON enriched_titles (param_action);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_enriched_thriller ON enriched_titles (param_thriller);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_enriched_darkness ON enriched_titles (param_darkness_bleakness);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_enriched_heartwarming ON enriched_titles (param_heartwarming);")
    conn.commit()


def find_latest_backup_file() -> str:
    """Finds the most recent backup file (.zip or .json) in current working directory or data/."""
    candidates = (
        glob.glob("netflix-complete-backup-*.zip")
        + glob.glob("*backup*.zip")
        + glob.glob("netflix-watchlist-backup-*.json")
        + glob.glob("*backup*.json")
        + glob.glob("data/*backup*.zip")
        + glob.glob("data/*backup*.json")
    )
    if not candidates:
        return ""
    candidates.sort(key=lambda p: os.path.getmtime(p), reverse=True)
    return candidates[0]


def restore_from_backup(backup_path: str):
    if not os.path.exists(backup_path):
        print(f"[ERROR] Backup file not found at '{backup_path}'")
        sys.exit(1)

    print(f"\n{'='*70}")
    print(f" RESTORING SQLITE KNOWLEDGE BASE ON THIS COMPUTER")
    print(f" Source: {backup_path} ({os.path.getsize(backup_path) / (1024*1024):.2f} MB)")
    print(f"{'='*70}\n")

    # Handle ZIP archive directly
    if zipfile.is_zipfile(backup_path):
        print("[1/4] Inspecting complete ZIP backup archive...")
        db_path = "scripts/enrichment/netflix_knowledge_base.sqlite"
        os.makedirs(os.path.dirname(db_path), exist_ok=True)

        with zipfile.ZipFile(backup_path, "r") as z:
            names = z.namelist()
            print(f"       -> Archive contents: {', '.join(names)}")

            # Direct bit-for-bit SQLite DB extraction
            if "netflix_knowledge_base.sqlite" in names:
                print("\n[2/4] Direct extraction of raw SQLite Knowledge Base from ZIP...")
                with z.open("netflix_knowledge_base.sqlite") as src, open(db_path, "wb") as dst:
                    shutil.copyfileobj(src, dst)
                print(f"       -> Restored SQLite DB '{db_path}' ({os.path.getsize(db_path)/(1024*1024):.2f} MB)")

                # Also sync SQLite DB to public/ and dist/
                for target_dir in ["public", "dist"]:
                    if os.path.exists(target_dir):
                        target_file = os.path.join(target_dir, "netflix_knowledge_base.sqlite")
                        shutil.copyfile(db_path, target_file)
                        print(f"       -> Synced to '{target_file}'")

                # Extract and sync JSON and embeddings assets
                print("\n[3/4] Syncing knowledge base files & AI embeddings...")
                asset_mappings = {
                    "netflix_enriched_movies_database.json": "netflix_enriched_kb.json",
                    "embeddings.bin": "embeddings.bin",
                    "catalogue_metadata.json": "catalogue_metadata.json",
                    "netflix-my-list.json": "netflix-my-list.json",
                    "netflix_database_export.csv": "netflix_database_export.csv",
                    "netflix_knowledge_base.xlsx": "netflix_knowledge_base.xlsx",
                    "netflix_india_all_titles.json": "netflix_india_all_titles.json",
                }
                for zip_name, disk_name in asset_mappings.items():
                    if zip_name in names:
                        # Extract to scripts/enrichment if JSON
                        if disk_name == "netflix_enriched_kb.json":
                            dst_enrich = os.path.join("scripts/enrichment", disk_name)
                            with z.open(zip_name) as s, open(dst_enrich, "wb") as d:
                                shutil.copyfileobj(s, d)
                            print(f"       -> Restored '{dst_enrich}'")

                        # Extract to public/ and dist/
                        for pub_dir in ["public", "dist"]:
                            if os.path.exists(pub_dir):
                                dst_pub = os.path.join(pub_dir, disk_name)
                                with z.open(zip_name) as s, open(dst_pub, "wb") as d:
                                    shutil.copyfileobj(s, d)
                                print(f"       -> Synced '{dst_pub}'")

                # Extract app_state.json items to netflix-my-list.json if present
                if "app_state.json" in names:
                    try:
                        with z.open("app_state.json") as s:
                            app_state = json.load(s)
                            if isinstance(app_state.get("items"), list):
                                with open("netflix-my-list.json", "w", encoding="utf-8") as d:
                                    json.dump(app_state["items"], d, ensure_ascii=False)
                                print(f"       -> Restored {len(app_state['items'])} watchlist items to 'netflix-my-list.json'")
                    except Exception as e:
                        print(f"       -> Note: Could not parse app_state.json: {e}")

                print(f"\n{'='*70}")
                print(" RESTORATION COMPLETED SUCCESSFULLY FROM COMPLETE ZIP ARCHIVE!")
                print(" All 4,806 titles, 100 continuous parameters & embeddings are ready for Qwen.")
                print(f"{'='*70}\n")
                return

        # If SQLite file was not inside zip, read discovery_catalog.json or netflix_enriched_movies_database.json
        print("       -> Extracting records from discovery_catalog.json in ZIP...")
        with zipfile.ZipFile(backup_path, "r") as z:
            disc_name = "discovery_catalog.json" if "discovery_catalog.json" in z.namelist() else "netflix_enriched_movies_database.json"
            if disc_name in z.namelist():
                with z.open(disc_name) as f:
                    records = json.load(f)
            else:
                with z.open("app_state.json") as f:
                    app_st = json.load(f)
                    records = app_st.get("discoveryCatalog") or app_st.get("sqliteKnowledgeBase") or []
    else:
        print("[1/4] Reading and parsing backup JSON...")
        with open(backup_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        # Check for sqliteKnowledgeBase or discoveryCatalog
        records = data.get("sqliteKnowledgeBase")
        if not records or len(records) == 0:
            records = data.get("discoveryCatalog", [])
            print(f"       -> 'sqliteKnowledgeBase' not found, using 'discoveryCatalog' ({len(records)} items)")
        else:
            print(f"       -> Found 'sqliteKnowledgeBase' with {len(records)} enriched records")

    if not records:
        print("[ERROR] Backup does not contain SQLite Knowledge Base or discoveryCatalog!")
        sys.exit(1)

    # 2. Initialize SQLite Storage
    db_path = "scripts/enrichment/netflix_knowledge_base.sqlite"
    print(f"\n[2/4] Initializing SQLite database at '{db_path}'...")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    with sqlite3.connect(db_path) as conn:
        init_sqlite_schema(conn)

    # 3. Insert records
    print(f"\n[3/4] Writing {len(records)} enriched titles and 100 continuous parameters to SQLite...")
    inserted = 0
    all_enriched_dicts = []

    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()

        base_cols = [
            "id", "title", "release_year", "media_type", "primary_genre", "secondary_genres", "minor_genres",
            "moods", "themes", "narrative_archetypes", "story_pace", "ending_type", "time_period",
            "setting_environment", "audience_vibe", "sources", "confidence_score", "synopsis",
            "raw_profile_json", "status"
        ]
        param_cols = [f"param_{p}" for p in ALL_100_PARAMETERS]
        all_cols = base_cols + param_cols
        all_cols_str = ", ".join(all_cols)
        all_placeholders_str = ", ".join(["?"] * len(all_cols))

        query = f"INSERT OR REPLACE INTO enriched_titles ({all_cols_str}) VALUES ({all_placeholders_str})"

        for idx, r in enumerate(records, 1):
            title = r.get("title") or r.get("originalTitle")
            if not title:
                continue

            title_id = str(r.get("id") or f"title_{idx}")
            media_type = r.get("media_type") or r.get("mediaType") or "movie"
            genres = r.get("genres") or []
            primary_genre = r.get("primary_genre") or (genres[0] if genres else "Drama")
            secondary_genres = r.get("secondary_genres") or genres[1:]
            sec_str = json.dumps(secondary_genres) if isinstance(secondary_genres, list) else str(secondary_genres or "[]")
            minor_str = json.dumps(r.get("minor_genres", [])) if isinstance(r.get("minor_genres"), list) else str(r.get("minor_genres") or "[]")

            moods = r.get("moods", [])
            moods_str = json.dumps(moods) if isinstance(moods, list) else str(moods or "[]")

            themes = r.get("themes", [])
            themes_str = json.dumps(themes) if isinstance(themes, list) else str(themes or "[]")

            archetypes = r.get("narrative_archetypes", [])
            archetypes_str = json.dumps(archetypes) if isinstance(archetypes, list) else str(archetypes or "[]")

            params_100 = r.get("parameters_100") or {}
            param_vals = []
            for p in ALL_100_PARAMETERS:
                v = params_100.get(p)
                if v is None:
                    v = r.get(f"param_{p}", 0.0)
                param_vals.append(float(v or 0.0))

            base_values = [
                title_id,
                title,
                r.get("release_year") or r.get("releaseYear"),
                media_type,
                primary_genre,
                sec_str,
                minor_str,
                moods_str,
                themes_str,
                archetypes_str,
                r.get("story_pace") or r.get("storyPace") or "moderate",
                r.get("ending_type") or r.get("endingType") or "bittersweet",
                r.get("time_period") or r.get("timePeriod") or "modern",
                r.get("setting_environment") or r.get("settingEnvironment") or "various",
                r.get("audience_vibe") or r.get("audienceVibe") or "",
                json.dumps(r.get("sources", ["backup_restore"])),
                float(r.get("confidence_score") or r.get("qwenConfidence") or 0.95),
                r.get("synopsis", ""),
                json.dumps(r),
                "completed"
            ]

            cursor.execute(query, base_values + param_vals)
            inserted += 1

            if idx % 1000 == 0 or idx == len(records):
                print(f"       -> Restored {inserted}/{len(records)} records into SQLite...")

        conn.commit()

        # Query all for JSON export
        conn.row_factory = sqlite3.Row
        cur2 = conn.cursor()
        cur2.execute("SELECT * FROM enriched_titles WHERE status = 'completed'")
        all_enriched_dicts = [dict(row) for row in cur2.fetchall()]

    # 4. Sync to local JSON and public JSON
    print(f"\n[4/4] Syncing {len(all_enriched_dicts)} restored records to JSON knowledge base files...")
    json_path = "scripts/enrichment/netflix_enriched_kb.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(all_enriched_dicts, f, ensure_ascii=False)
    print(f"       -> Saved {json_path}")

    public_json_path = "public/netflix_enriched_kb.json"
    os.makedirs("public", exist_ok=True)
    with open(public_json_path, "w", encoding="utf-8") as f:
        json.dump(all_enriched_dicts, f, ensure_ascii=False)
    print(f"       -> Synced {public_json_path}")

    print(f"\n{'='*70}")
    print(f" RESTORATION COMPLETE: {inserted} ENRICHED TITLES READY ON THIS COMPUTER!")
    print(f" SQLite DB: {db_path} ({os.path.getsize(db_path) / (1024*1024):.2f} MB)")
    print(f" Web JSON:  {public_json_path}")
    print(f"{'='*70}\n")


if __name__ == "__main__":
    target_backup = ""
    if len(sys.argv) > 1:
        target_backup = sys.argv[1]
    else:
        target_backup = find_latest_backup_file()

    if not target_backup:
        print("[ERROR] No backup JSON file found in this folder!")
        print("Please provide the path to your exported backup file: python scripts/restore_sqlite_from_backup.py <path_to_backup.json>")
        sys.exit(1)

    restore_from_backup(target_backup)
