"""Master Orchestrator Pipeline for Automated Movie Knowledge Base Enrichment.
1. Extracts titles from discovery dataset (or provided title list).
2. Performs headless public web research (Wikipedia + TMDB).
3. Executes semantic profiling across 100 continuous parameters and narrative dimensions.
4. Checkpoints to SQLite after every item to survive reboots/crashes.
5. Exports to SQLite, JSON, and formatted Excel with all 100 parameters.
"""

import sys
import time
import json
import argparse
from typing import List, Dict, Any

# Ensure immediate unbuffered console stdout
sys.stdout.reconfigure(line_buffering=True)

from scripts.enrichment.research_agent import WebResearchAgent
from scripts.enrichment.extractor import SemanticProfileExtractor
from scripts.enrichment.storage import KnowledgeBaseStorage
from scripts.enrichment.taxonomy import ALL_100_PARAMETERS


def run_enrichment_pipeline(
    titles_input: List[Dict[str, Any]],
    batch_size: int = 25,
    delay_between_calls: float = 0.35,
):
    storage = KnowledgeBaseStorage()
    research_agent = WebResearchAgent(request_delay=delay_between_calls)
    extractor = SemanticProfileExtractor()

    total = len(titles_input)
    processed = 0
    skipped = 0

    print(f"\n========================================================")
    print(f"STARTING 100-PARAMETER MOVIE KNOWLEDGE BASE ENRICHMENT ({total} TITLES)")
    print(f"========================================================\n")

    for idx, item in enumerate(titles_input, 1):
        title = item.get("title") or item.get("originalTitle")
        title_id = str(item.get("id") or item.get("videoId") or f"title_{idx}")
        year = item.get("releaseYear") or item.get("year")
        media_type = item.get("mediaType", "movie")

        if not title:
            continue

        # Checkpoint check: skip already completed titles to save time & bandwidth
        if storage.is_title_processed(title_id):
            skipped += 1
            continue

        print(f"[{idx}/{total}] Researching & Profiling: '{title}' ({year or 'N/A'})...")

        try:
            # 1. Web Research
            evidence = research_agent.research_title(title, year, media_type)

            # Blend with existing metadata if present
            if item.get("synopsis"):
                evidence["combined_synopsis"] += " " + item["synopsis"]
            if item.get("genres"):
                evidence["genres"].extend(item["genres"])
                evidence["genres"] = list(set(evidence["genres"]))

            # 2. Semantic Analysis across all 100 parameters
            profile = extractor.extract_structured_profile(evidence)

            # 3. Save to SQLite with full atomic transaction
            storage.save_enriched_profile(title_id, profile, evidence.get("combined_synopsis", ""))
            processed += 1

            # Find top salient parameters among the 100
            params = profile.get("parameters_100", {})
            sorted_params = sorted(params.items(), key=lambda kv: kv[1], reverse=True)
            top_5_salient = ", ".join([f"{k.replace('_', ' ').title()}: {v}" for k, v in sorted_params[:5] if v > 0.4])
            if not top_5_salient:
                top_5_salient = ", ".join([f"{k.replace('_', ' ').title()}: {v}" for k, v in sorted_params[:3]])

            print(f"       -> Primary: {profile['primary_genre']} | Moods: {', '.join(profile.get('moods', []))}")
            print(f"       -> Top Dimensions: {top_5_salient}")
            print(f"       -> Evaluated: 100/100 parameters saved to SQLite.")

        except Exception as e:
            print(f"       -> [ERROR] Failed to enrich '{title}': {e}")

        # Periodic checkpoint reports & multi-format disk export
        if processed > 0 and processed % batch_size == 0:
            print(f"\n--- Checkpoint reached: {processed} titles enriched ({skipped} skipped) ---")
            storage.export_to_json()
            storage.export_to_excel()
            print("--- Disk backups updated ---\n")

    print(f"\n========================================================")
    print(f"ENRICHMENT COMPLETE: {processed} newly enriched, {skipped} previously cached.")
    print(f"========================================================\n")

    # Final Exports
    storage.export_to_json()
    storage.export_to_excel()


if __name__ == "__main__":
    import os

    parser = argparse.ArgumentParser(description="Automated 100-Parameter Knowledge Base Enrichment Pipeline")
    parser.add_argument("--input-json", type=str, default=None, help="Path to input titles JSON file (e.g. data/netflix_india_all_titles.json)")
    parser.add_argument("--limit", type=int, default=10, help="Number of titles to enrich")
    parser.add_argument("--all", action="store_true", help="Process all available titles in input")
    parser.add_argument("--delay", type=float, default=0.35, help="Request delay between web queries in seconds")
    args = parser.parse_args()

    titles_to_run = []
    if args.input_json and os.path.exists(args.input_json):
        with open(args.input_json, "r", encoding="utf-8") as f:
            titles_to_run = json.load(f)
        print(f"[INPUT] Loaded {len(titles_to_run)} titles from '{args.input_json}'")
    elif os.path.exists("data/netflix_india_all_titles.json"):
        with open("data/netflix_india_all_titles.json", "r", encoding="utf-8") as f:
            titles_to_run = json.load(f)
        print(f"[INPUT] Loaded {len(titles_to_run)} titles from 'data/netflix_india_all_titles.json'")
    elif os.path.exists("netflix-my-list.json"):
        with open("netflix-my-list.json", "r", encoding="utf-8") as f:
            titles_to_run = json.load(f)
        print(f"[INPUT] Loaded {len(titles_to_run)} titles from 'netflix-my-list.json'")
    else:
        from scripts.recommender.demo_verification import create_mock_catalogue
        titles_to_run = create_mock_catalogue()
        print(f"[INPUT] Loaded {len(titles_to_run)} titles from mock verification catalogue")

    limit = len(titles_to_run) if args.all else min(args.limit, len(titles_to_run))
    run_enrichment_pipeline(titles_to_run[:limit], delay_between_calls=args.delay)
