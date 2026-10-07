import json
from scripts.enrichment.storage import KnowledgeBaseStorage

storage = KnowledgeBaseStorage()
records = storage.get_all_enriched()
print(f"Total Enriched Titles in SQLite Knowledge Base: {len(records)}\n")

for r in records:
    print(f"[TITLE] {r.get('title')} ({r.get('release_year') or 'N/A'}) - {r.get('primary_genre')}")
    print(f"   Scores: Action={r.get('action_intensity')}, Dark={r.get('darkness_bleakness')}, Heartwarming={r.get('heartwarming_level')}, Romance={r.get('romance_intensity')}, Thriller={r.get('thriller_intensity')}")
    print(f"   Moods: {r.get('moods')}")
    print(f"   Themes: {r.get('themes')}")
    print(f"   Sources: {r.get('sources')}\n")
