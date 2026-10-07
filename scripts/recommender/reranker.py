"""Multi-Objective Reranker, Hidden Gem, Surprise Me, and Deterministic Explanations.
Implements:
1. Multi-Objective Scoring:
   FinalScore = 0.55*Sem + 0.15*Meta + 0.12*Quality + 0.10*Personal + 0.08*Discovery
2. Gated Hidden Gem Formula
3. Guarded 70/20/10 Surprise Me Engine
4. Zero-LLM Deterministic Explanation Generator
"""

import math
from typing import Dict, Any, List, Optional
import numpy as np
from .config import CONFIG


class MultiObjectiveReranker:
    def __init__(self, config: Dict[str, Any] = CONFIG):
        self.cfg = config
        self.weights = config["scoring_weights"]
        self.hg_cfg = config["hidden_gem"]
        self.sm_cfg = config["surprise_me"]

    def compute_metadata_overlap(self, query_parsed: Dict[str, Any], item: Dict[str, Any]) -> float:
        """
        Computes Jaccard/overlap score between parsed query intent and item metadata.
        Normalized to [0.0, 1.0].
        """
        score = 0.0
        checks = 0

        # Check genre overlap
        item_genres = [g.lower() for g in (item.get("genres") or [])]
        residual_words = set(query_parsed.get("residual_semantic_query", "").lower().split())

        matched_genres = [g for g in item_genres if g in residual_words]
        if matched_genres:
            score += 0.4
        checks += 1

        # Check mood/theme tags
        item_moods = [m.lower() for m in (item.get("mood_tags") or item.get("moodTags") or [])]
        matched_moods = [m for m in item_moods if m in residual_words]
        if matched_moods:
            score += 0.4
        checks += 1

        # Check country/language
        if query_parsed.get("country_or_lang"):
            target = query_parsed["country_or_lang"].lower()
            item_c = (item.get("country") or "").lower()
            item_langs = [l.lower() for l in (item.get("languages") or [])]
            if target in item_c or any(target in l for l in item_langs):
                score += 0.2
            checks += 1

        return min(1.0, score)

    def compute_hidden_gem_score(self, item: Dict[str, Any], semantic_score: float) -> float:
        """
        Gated Hidden Gem Formula:
        Qualifies if IMDb >= 6.8 and votes >= 1,000.
        GemScore = Qualifies * (Quality^1.5 * Underrated * Semantic)
        """
        imdb = item.get("imdb_rating") or item.get("rating") or 0.0
        votes = item.get("imdb_votes") or item.get("voteCount") or 0

        if imdb < self.hg_cfg["min_imdb"] or votes < self.hg_cfg["min_votes"]:
            return 0.0

        # If it has more than max_popularity_votes (e.g. 75k), it is mainstream, not a hidden gem
        if votes > self.hg_cfg["max_popularity_votes"]:
            return 0.0

        # Normalized quality [0, 1]
        quality = max(0.0, min(1.0, (imdb - 6.0) / 4.0))

        # Underrated dampener: 1 / ln(e + votes/1000)
        underrated = 1.0 / math.log(self.hg_cfg["popularity_dampener_constant"] + (votes / 1000.0))

        # Gated composite score
        gem_score = (quality ** 1.5) * underrated * max(0.0, semantic_score)
        return float(gem_score)

    def score_candidate(
        self,
        item: Dict[str, Any],
        semantic_score: float,
        query_parsed: Dict[str, Any],
        user_vector_sim: float = 0.0,
    ) -> float:
        """
        Scores a candidate title across the 5 configured dimensions.
        """
        # 1. Semantic score normalized from [-1, 1] to [0, 1]
        s_sem = max(0.0, min(1.0, (semantic_score + 1.0) / 2.0))

        # 2. Metadata score [0, 1]
        s_meta = self.compute_metadata_overlap(query_parsed, item)

        # 3. Bayesian Quality score [0, 1]
        s_qual = item.get("bayesian_quality_score", 0.5)

        # 4. Personalization score [0, 1]
        s_pers = max(0.0, min(1.0, (user_vector_sim + 1.0) / 2.0))

        # 5. Discovery score [0, 1] (inversely proportional to mainstream popularity)
        votes = item.get("imdb_votes") or item.get("voteCount") or 1000
        s_disc = max(0.0, min(1.0, 1.0 / math.log10(max(votes, 10))))

        final_score = (
            self.weights["semantic"] * s_sem +
            self.weights["metadata_match"] * s_meta +
            self.weights["quality"] * s_qual +
            self.weights["personalization"] * s_pers +
            self.weights["discovery"] * s_disc
        )
        return float(final_score)

    def apply_surprise_me(
        self,
        scored_candidates: List[Dict[str, Any]],
        n_results: int,
    ) -> List[Dict[str, Any]]:
        """
        Guarded 70/20/10 Surprise Me Split:
        - 70% Strong matches (Highest FinalScore)
        - 20% Creative Exploration (Positions 15-50 with high quality and lower overlap)
        - 10% Hidden Gems (Highest GemScore)
        """
        if len(scored_candidates) <= n_results:
            return scored_candidates

        n_rel = max(1, int(round(n_results * self.sm_cfg["relevance_ratio"])))
        n_exp = max(1, int(round(n_results * self.sm_cfg["exploration_ratio"])))
        n_gem = max(1, n_results - n_rel - n_exp)

        selected: List[Dict[str, Any]] = []
        used_ids = set()

        # 1. Top relevance matches
        sorted_by_final = sorted(scored_candidates, key=lambda x: x["final_score"], reverse=True)
        for item in sorted_by_final:
            if len(selected) >= n_rel:
                break
            selected.append(item)
            used_ids.add(item["id"])

        # 2. Creative exploration (from ranking slice [15:60] sorted by exploration score)
        exp_pool = [c for c in sorted_by_final[15:60] if c["id"] not in used_ids]
        # Exploration score: High quality + decent semantic relevance
        exp_sorted = sorted(
            exp_pool,
            key=lambda x: x.get("bayesian_quality_score", 0.5) * x.get("semantic_score", 0.5),
            reverse=True,
        )
        for item in exp_sorted:
            if len(selected) >= (n_rel + n_exp):
                break
            selected.append(item)
            used_ids.add(item["id"])

        # 3. Certified Hidden Gems
        gem_sorted = sorted(
            [c for c in scored_candidates if c["id"] not in used_ids],
            key=lambda x: x.get("gem_score", 0.0),
            reverse=True,
        )
        for item in gem_sorted:
            if len(selected) >= n_results:
                break
            selected.append(item)
            used_ids.add(item["id"])

        # Fallback if any slots remain
        for item in sorted_by_final:
            if len(selected) >= n_results:
                break
            if item["id"] not in used_ids:
                selected.append(item)
                used_ids.add(item["id"])

        return selected

    @staticmethod
    def generate_explanation(item: Dict[str, Any], query_parsed: Dict[str, Any]) -> str:
        """
        Zero-LLM deterministic explanation generator.
        Assembles natural-sounding rationales from verified metadata tags.
        """
        reasons = []

        # Reference movie reason
        if query_parsed.get("reference_title"):
            ref = query_parsed["reference_title"]
            genres = ", ".join(item.get("genres", [])[:2])
            reasons.append(f"Shares thematic and stylistic DNA with {ref} in {genres or 'its genre'}")

        # Mood & theme match
        moods = item.get("mood_tags") or item.get("moodTags") or []
        if moods:
            reasons.append(f"Evokes a distinct {moods[0]} and {moods[1] if len(moods) > 1 else 'engaging'} atmosphere")

        # Hidden Gem badge
        if item.get("gem_score", 0.0) > 0.08:
            imdb = item.get("imdb_rating") or item.get("rating")
            votes = item.get("imdb_votes") or item.get("voteCount")
            reasons.append(f"💎 Hidden Gem: Holds a {imdb} rating with only {votes:,} ratings")

        # Runtime constraint confirmation
        runtime = item.get("runtimeMinutes") or item.get("runtime")
        if query_parsed.get("max_runtime_minutes") and runtime:
            reasons.append(f"{runtime} min — fits inside your {query_parsed['max_runtime_minutes']} min limit")

        if not reasons:
            reasons.append("Strong overall match to your natural-language intent and preferences")

        return " • ".join(reasons)
