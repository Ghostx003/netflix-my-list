"""Persistent SQLite and Multi-Format Storage for Movie Knowledge Base.
Supports:
1. SQLite database with schema for 100 continuous parameters + categorical attributes.
2. Checkpoint tracking to resume progress, retry failed titles, and cache research results.
3. Export to JSON, SQLite, and formatted multi-column Excel files via openpyxl.
"""

import sqlite3
import json
import os
from typing import Dict, Any, List, Optional
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

from scripts.enrichment.taxonomy import ALL_100_PARAMETERS, PARAM_GROUPS


class KnowledgeBaseStorage:
    def __init__(self, db_path: str = "scripts/enrichment/netflix_knowledge_base.sqlite"):
        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self._init_database()

    def _init_database(self):
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            # Enriched Movies table base
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
                
                -- Evidence & Provenance
                sources TEXT,
                confidence_score REAL DEFAULT 0.0,
                synopsis TEXT,
                raw_profile_json TEXT,
                
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'completed'
            );
            """)

            # Ensure all columns exist in SQLite table
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

            # Fast query indices
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_enriched_title ON enriched_titles (title);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_enriched_primary_genre ON enriched_titles (primary_genre);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_enriched_action ON enriched_titles (param_action);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_enriched_thriller ON enriched_titles (param_thriller);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_enriched_darkness ON enriched_titles (param_darkness_bleakness);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_enriched_heartwarming ON enriched_titles (param_heartwarming);")
            conn.commit()

    def is_title_processed(self, title_id: str) -> bool:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1 FROM enriched_titles WHERE id = ? AND status = 'completed'", (title_id,))
            return cursor.fetchone() is not None

    def save_enriched_profile(self, title_id: str, profile: Dict[str, Any], synopsis: str = ""):
        # Extract 100 parameters from profile
        params_100 = profile.get("parameters_100", {})
        if not params_100 and "scores" in profile:
            # Fallback/compatibility mapping
            params_100 = dict(profile.get("scores", {}))
            params_100.update(profile.get("thematic_dimensions", {}))

        col_names = [f"param_{p}" for p in ALL_100_PARAMETERS]
        col_placeholders = ", ".join(["?"] * len(ALL_100_PARAMETERS))
        param_values = [float(params_100.get(p, 0.0)) for p in ALL_100_PARAMETERS]

        base_cols = [
            "id", "title", "release_year", "media_type", "primary_genre", "secondary_genres", "minor_genres",
            "moods", "themes", "narrative_archetypes", "story_pace", "ending_type", "time_period",
            "setting_environment", "audience_vibe", "sources", "confidence_score", "synopsis",
            "raw_profile_json", "status"
        ]
        all_cols_str = ", ".join(base_cols + col_names)
        all_placeholders_str = ", ".join(["?"] * (len(base_cols) + len(col_names)))

        base_values = [
            title_id,
            profile.get("title", ""),
            profile.get("year"),
            profile.get("media_type", "movie"),
            profile.get("primary_genre", ""),
            json.dumps(profile.get("secondary_genres", [])),
            json.dumps(profile.get("minor_incidental_genres", [])),
            json.dumps(profile.get("moods", [])),
            json.dumps(profile.get("themes", [])),
            json.dumps(profile.get("narrative_archetypes", [])),
            profile.get("story_pace", "moderate"),
            profile.get("ending_type", "bittersweet"),
            profile.get("time_period", "modern"),
            profile.get("setting_environment", "various"),
            profile.get("audience_vibe", ""),
            json.dumps(profile.get("sources", [])),
            profile.get("confidence_score", 0.95),
            synopsis,
            json.dumps(profile),
            "completed"
        ]

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            query = f"INSERT OR REPLACE INTO enriched_titles ({all_cols_str}) VALUES ({all_placeholders_str})"
            cursor.execute(query, base_values + param_values)
            conn.commit()

    def get_all_enriched(self) -> List[Dict[str, Any]]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM enriched_titles WHERE status = 'completed'")
            rows = cursor.fetchall()
            return [dict(r) for r in rows]

    def export_to_json(self, output_path: str = "scripts/enrichment/netflix_enriched_kb.json"):
        records = self.get_all_enriched()
        for r in records:
            if r.get("raw_profile_json"):
                try:
                    r["raw_profile"] = json.loads(r["raw_profile_json"])
                except Exception:
                    pass

        # Write to primary enrichment path
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(records, f, ensure_ascii=False, indent=2)
        print(f"[EXPORT] JSON Knowledge Base written to {output_path} ({len(records)} titles)")

        # Also write directly to web app public directory for deployment
        public_path = os.path.join("public", "netflix_enriched_kb.json")
        try:
            os.makedirs("public", exist_ok=True)
            with open(public_path, "w", encoding="utf-8") as f:
                json.dump(records, f, ensure_ascii=False, indent=2)
            print(f"[EXPORT] Web Deployment JSON synced to {public_path}")
        except Exception as e:
            print(f"[EXPORT Warning] Could not sync to public/: {e}")

    def export_to_excel(self, output_path: str = "scripts/enrichment/netflix_knowledge_base.xlsx"):
        records = self.get_all_enriched()
        wb = openpyxl.Workbook()

        # -------------------------------------------------------------
        # SHEET 1: Clean 100-Parameter Knowledge Base with Full Context
        # -------------------------------------------------------------
        ws1 = wb.active
        ws1.title = "100-Param Enriched Catalog"

        base_headers = [
            "ID", "Title", "Year", "Type", "Primary Genre", "Secondary Genres",
            "Minor Genres", "Moods", "Themes", "Narrative Archetypes", "Time Period",
            "Setting", "Story Pace", "Ending Type", "Audience Vibe", "Confidence",
            "Plot Synopsis", "Sources"
        ]
        param_headers = [p.replace("_", " ").title() for p in ALL_100_PARAMETERS]
        headers1 = base_headers + param_headers

        header_fill = PatternFill(start_color="111827", end_color="111827", fill_type="solid")
        header_font = Font(name="Segoe UI", size=10, bold=True, color="F9FAFB")

        ws1.append(headers1)
        for col_idx in range(1, len(headers1) + 1):
            cell = ws1.cell(row=1, column=col_idx)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

        for r in records:
            base_row = [
                r.get("id"),
                r.get("title"),
                r.get("release_year"),
                r.get("media_type"),
                r.get("primary_genre"),
                ", ".join(json.loads(r.get("secondary_genres") or "[]")),
                ", ".join(json.loads(r.get("minor_genres") or "[]")),
                ", ".join(json.loads(r.get("moods") or "[]")),
                ", ".join(json.loads(r.get("themes") or "[]")),
                ", ".join(json.loads(r.get("narrative_archetypes") or "[]")),
                r.get("time_period"),
                r.get("setting_environment"),
                r.get("story_pace"),
                r.get("ending_type"),
                r.get("audience_vibe"),
                r.get("confidence_score"),
                r.get("synopsis", ""),
                ", ".join(json.loads(r.get("sources") or "[]")),
            ]
            param_row = [round(float(r.get(f"param_{p}") or 0.0), 2) for p in ALL_100_PARAMETERS]
            ws1.append(base_row + param_row)

        for col in ws1.columns:
            col_letter = openpyxl.utils.get_column_letter(col[0].column)
            if col[0].column <= len(base_headers):
                max_len = max(len(str(cell.value or "")) for cell in col)
                ws1.column_dimensions[col_letter].width = max(10, min(max_len + 3, 35))
            else:
                ws1.column_dimensions[col_letter].width = 13

        # -------------------------------------------------------------
        # SHEET 2: Exact 1:1 SQLite Database Mirror (All SQLite Columns)
        # -------------------------------------------------------------
        ws2 = wb.create_sheet(title="SQLite Database Mirror")
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("PRAGMA table_info(enriched_titles);")
            sqlite_columns = [col_info[1] for col_info in cursor.fetchall()]

            cursor.execute("SELECT * FROM enriched_titles;")
            sqlite_rows = cursor.fetchall()

        sqlite_header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
        ws2.append(sqlite_columns)
        for col_idx in range(1, len(sqlite_columns) + 1):
            cell = ws2.cell(row=1, column=col_idx)
            cell.fill = sqlite_header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")

        for row in sqlite_rows:
            ws2.append(list(row))

        for col in ws2.columns:
            col_letter = openpyxl.utils.get_column_letter(col[0].column)
            max_len = max(len(str(cell.value or "")) for cell in col)
            ws2.column_dimensions[col_letter].width = max(10, min(max_len + 3, 35))

        wb.save(output_path)
        print(f"[EXPORT] Excel generated at {output_path} with {len(records)} rows across 2 sheets (100-Param Catalog + SQLite Mirror)")
