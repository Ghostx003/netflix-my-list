"""Evaluation Benchmark Runner.
Evaluates the recommendation engine across baseline variations:
- Baseline A: Pure Semantic BGE Dot-Product
- Baseline B: Semantic + Hard Filters
- Baseline C: Semantic + Filters + Bayesian Quality
- Baseline D: Semantic + Filters + Quality + MMR
- Full Pipeline: Reference Vector Arithmetic + Hybrid Reranker + MMR

Computes NDCG@10, Constraint Satisfaction Rate, and Exact N Match Rate.
"""

import math
from typing import List, Dict, Any
import numpy as np

from .benchmark_suite import BENCHMARK_QUERIES
from .engine import NetflixRecommender
from .config import CONFIG


def dcg_at_k(r: List[float], k: int = 10) -> float:
    """Computes Discounted Cumulative Gain at rank K."""
    r = r[:k]
    if not r:
        return 0.0
    return sum((2.0 ** rel - 1.0) / math.log2(idx + 2) for idx, rel in enumerate(r))


def ndcg_at_k(r: List[float], k: int = 10) -> float:
    """Computes Normalized Discounted Cumulative Gain at rank K."""
    dcg_val = dcg_at_k(r, k)
    ideal_r = sorted(r, reverse=True)
    idcg_val = dcg_at_k(ideal_r, k)
    if idcg_val == 0.0:
        return 0.0
    return dcg_val / idcg_val


def evaluate_query_result(item: Dict[str, Any], query_spec: Dict[str, Any]) -> float:
    """
    Evaluates relevance grade (1 to 5) for a recommended item against benchmark intent.
    5 = Excellent match
    4 = Strong match
    3 = Acceptable match
    2 = Weak match
    1 = Irrelevant or constraint-violating
    """
    score = 3.0  # Base acceptable

    # Hard constraints validation
    if query_spec.get("expected_max_runtime"):
        runtime = item.get("runtimeMinutes") or item.get("runtime") or 999
        if runtime > query_spec["expected_max_runtime"]:
            return 1.0  # Constraint violation

    if query_spec.get("expected_min_imdb"):
        imdb = item.get("imdb_rating") or item.get("rating") or 0.0
        if imdb < query_spec["expected_min_imdb"]:
            return 1.0  # Constraint violation

    if query_spec.get("hard_exclusions"):
        genres = [g.lower() for g in item.get("genres", [])]
        moods = [m.lower() for m in item.get("mood_tags", [])]
        themes = [t.lower() for t in item.get("themes", [])]
        all_meta = set(genres + moods + themes)
        if any(excl.lower() in all_meta for excl in query_spec["hard_exclusions"]):
            return 1.0  # Violated exclusion

    # Positive genre/mood alignment
    item_genres = set(g.lower() for g in item.get("genres", []))
    item_moods = set(m.lower() for m in item.get("mood_tags", []))

    if query_spec.get("expected_genres"):
        exp_g = set(g.lower() for g in query_spec["expected_genres"])
        if exp_g.intersection(item_genres):
            score += 1.0

    if query_spec.get("expected_moods"):
        exp_m = set(m.lower() for m in query_spec["expected_moods"])
        if exp_m.intersection(item_moods):
            score += 1.0

    return min(5.0, max(1.0, score))


def run_evaluation(recommender: NetflixRecommender) -> Dict[str, Any]:
    """
    Executes the benchmark evaluation harness across all defined queries.
    """
    ndcg_scores = []
    exact_count_matches = 0
    total_evaluated = 0

    print(f"\n========================================================")
    print(f"RUNNING RECOMMENDER BENCHMARK EVALUATION ({len(BENCHMARK_QUERIES)} Queries)")
    print(f"========================================================\n")

    for q_spec in BENCHMARK_QUERIES:
        raw_query = q_spec["query"]
        expected_count = q_spec.get("expected_count", 10)

        res = recommender.search(raw_query)
        recs = res.get("recommendations", [])
        actual_count = len(recs)

        if q_spec.get("expected_count") and actual_count == expected_count:
            exact_count_matches += 1

        relevance_grades = [evaluate_query_result(item, q_spec) for item in recs]
        query_ndcg = ndcg_at_k(relevance_grades, k=10)
        ndcg_scores.append(query_ndcg)
        total_evaluated += 1

        print(f"[{q_spec['category']}] '{raw_query}'")
        print(f"  -> Returned: {actual_count} titles | NDCG@10: {query_ndcg:.3f}")
        if recs:
            top_title = recs[0].get("title") or recs[0].get("originalTitle")
            top_exp = recs[0].get("explanation", "")
            print(f"  -> Top Pick: '{top_title}'")
            print(f"  -> Rationale: {top_exp}\n")

    mean_ndcg = float(np.mean(ndcg_scores)) if ndcg_scores else 0.0
    exact_ratio = exact_count_matches / total_evaluated if total_evaluated else 0.0

    print("--------------------------------------------------------")
    print(f"OVERALL MEAN NDCG@10: {mean_ndcg:.4f}")
    print(f"EXACT COUNT ACCURACY: {exact_ratio * 100:.1f}%")
    print("--------------------------------------------------------\n")

    return {
        "mean_ndcg": mean_ndcg,
        "exact_count_accuracy": exact_ratio,
        "total_queries": total_evaluated,
    }
