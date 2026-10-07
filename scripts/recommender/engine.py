"""Complete End-to-End Netflix Recommendation & Discovery Engine.
Integrates:
1. Hybrid Parser (RapidFuzz entity extraction + constraint tokenization)
2. Deterministic Catalogue Pre-Filtering
3. Reference Vector Composition & Dot-Product Scan (Top 100)
4. Multi-Objective Reranking
5. Maximal Marginal Relevance (MMR) Diversification
6. Hidden Gem & Guarded Surprise Me Modes
7. Zero-LLM Deterministic Explanations
"""

from typing import List, Dict, Any, Optional
import numpy as np

from .config import CONFIG
from .hybrid_parser import HybridQueryParser
from .vector_engine import VectorEngine
from .reranker import MultiObjectiveReranker
from .dataset_processor import calculate_bayesian_quality


class NetflixRecommender:
    def __init__(
        self,
        catalogue: List[Dict[str, Any]],
        embeddings: np.ndarray,
        embed_fn: Any,  # Callable[[str], np.ndarray] or ONNX embedder
    ):
        """
        Args:
            catalogue: List of movie dictionaries.
            embeddings: (N, 384) unit-normalized float32 NumPy array.
            embed_fn: Function to encode a text string into a 384-d unit vector.
        """
        self.catalogue = catalogue
        self.embed_fn = embed_fn

        # Build index lookups
        self.id_to_index: Dict[Any, int] = {}
        self.index_to_id: Dict[int, Any] = {}
        self.titles_list: List[str] = []
        self.title_to_id: Dict[str, Any] = {}

        for idx, item in enumerate(self.catalogue):
            item_id = item.get("id", idx)
            item["id"] = item_id
            self.id_to_index[item_id] = idx
            self.index_to_id[idx] = item_id

            # Precalculate Bayesian Quality Score if not already present
            if "bayesian_quality_score" not in item:
                imdb = float(item.get("imdb_rating") or item.get("rating") or 6.5)
                votes = int(item.get("imdb_votes") or item.get("voteCount") or 500)
                item["bayesian_quality_score"] = calculate_bayesian_quality(imdb, votes)

            t = item.get("title") or item.get("originalTitle")
            if t:
                self.titles_list.append(t)
                self.title_to_id[t] = item_id

        # Initialize sub-modules
        self.parser = HybridQueryParser(self.titles_list, self.title_to_id)
        self.vector_engine = VectorEngine(embeddings, self.id_to_index, self.index_to_id)
        self.reranker = MultiObjectiveReranker()

    def filter_catalogue_indices(self, parsed: Dict[str, Any]) -> List[int]:
        """
        Executes strict deterministic filtering.
        Returns a list of candidate indices that pass all hard constraints.
        """
        valid_indices: List[int] = []

        max_runtime = parsed.get("max_runtime_minutes")
        min_imdb = parsed.get("min_imdb_rating")
        min_year = parsed.get("min_year")
        max_year = parsed.get("max_year")
        media_type = parsed.get("media_type")
        country_or_lang = (parsed.get("country_or_lang") or "").lower()
        hard_exclusions = [e.lower() for e in parsed.get("hard_exclusions", [])]

        for idx, item in enumerate(self.catalogue):
            # 1. Netflix availability (always true for current catalogue)
            if item.get("netflix_available") is False:
                continue

            # 2. Media Type (movie vs tv)
            if media_type:
                item_type = "tv_series" if item.get("mediaType") == "tv" else "movie"
                if item_type != media_type:
                    continue

            # 3. Runtime Constraint
            if max_runtime is not None:
                item_runtime = item.get("runtimeMinutes") or item.get("runtime")
                if item_runtime and item_runtime > max_runtime:
                    continue

            # 4. IMDb Rating
            if min_imdb is not None:
                item_imdb = item.get("imdb_rating") or item.get("rating") or 0.0
                if item_imdb < min_imdb:
                    continue

            # 5. Year / Decade
            item_year = item.get("releaseYear") or item.get("year")
            if item_year:
                if min_year and item_year < min_year:
                    continue
                if max_year and item_year > max_year:
                    continue

            # 6. Country / Language
            if country_or_lang:
                c = (item.get("country") or "").lower()
                langs = [l.lower() for l in (item.get("languages") or [])]
                if country_or_lang not in c and not any(country_or_lang in l for l in langs):
                    continue

            # 7. Explicit Exclusions (Genres, Tags, Moods)
            if hard_exclusions:
                item_genres = [g.lower() for g in (item.get("genres") or [])]
                item_moods = [m.lower() for m in (item.get("mood_tags") or item.get("moodTags") or [])]
                item_themes = [t.lower() for t in (item.get("themes") or item.get("tags") or [])]
                all_tokens = set(item_genres + item_moods + item_themes)
                if any(excl in all_tokens for excl in hard_exclusions):
                    continue

            valid_indices.append(idx)

        return valid_indices

    def search(
        self,
        raw_query: str,
        user_preference_vector: Optional[np.ndarray] = None,
        override_count: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Executes full recommendation pipeline and returns exact N recommendations.
        """
        # Step 1: Parse Query
        parsed = self.parser.parse(raw_query)
        target_n = override_count or parsed.get("count", 10)

        # Step 2: Apply Hard Filters
        valid_indices = self.filter_catalogue_indices(parsed)
        # Exclude the reference movie itself from recommendations
        if parsed.get("reference_id") is not None and parsed["reference_id"] in self.id_to_index:
            ref_idx = self.id_to_index[parsed["reference_id"]]
            valid_indices = [idx for idx in valid_indices if idx != ref_idx]

        if not valid_indices:
            return {
                "query": raw_query,
                "parsed": parsed,
                "total_matches": 0,
                "recommendations": [],
                "message": "No titles matched your strict hard filters.",
            }

        # Step 3: Vector Composition (Reference + Residual)
        residual_text = parsed.get("residual_semantic_query") or raw_query
        residual_vector = self.embed_fn(residual_text) if self.embed_fn else None

        if parsed.get("reference_title") and parsed.get("reference_id"):
            query_vector = self.vector_engine.compose_reference_query_vector(
                ref_id=parsed["reference_id"],
                residual_vector=residual_vector,
            )
        else:
            query_vector = residual_vector

        # Optional User Preference Vector Blend
        if query_vector is not None and user_preference_vector is not None:
            w_user = CONFIG["personalization"]["query_blend_weight"]
            query_vector = self.vector_engine.normalize_vector(
                (1.0 - w_user) * query_vector + w_user * user_preference_vector
            )

        if query_vector is None:
            # Fallback if no embedding is available
            query_vector = np.zeros(CONFIG["model"]["dimensions"], dtype=np.float32)

        # Step 4: Scan Top 100 Candidates via Fast Dot Product
        top_k = min(CONFIG["diversity"]["top_k_candidates"], len(valid_indices))
        top_candidates = self.vector_engine.scan_top_k(
            query_vector=query_vector,
            candidate_indices=valid_indices,
            k=top_k,
        )

        # Step 5: Multi-Objective Scoring
        scored_pool: List[Dict[str, Any]] = []
        for idx, sem_score in top_candidates:
            item = dict(self.catalogue[idx])  # Shallow copy
            item["semantic_score"] = sem_score

            user_sim = 0.0
            if user_preference_vector is not None:
                user_sim = float(np.dot(self.vector_engine.embeddings[idx], user_preference_vector))

            final_s = self.reranker.score_candidate(
                item=item,
                semantic_score=sem_score,
                query_parsed=parsed,
                user_vector_sim=user_sim,
            )
            item["final_score"] = final_s
            item["gem_score"] = self.reranker.compute_hidden_gem_score(item, sem_score)
            item["_catalogue_idx"] = idx
            scored_pool.append(item)

        # Step 6: Mode Routing & Diversification
        mode = parsed.get("mode", "standard")
        if mode == "hidden_gem":
            # Sort directly by GemScore
            scored_pool.sort(key=lambda x: x["gem_score"], reverse=True)
            candidate_indices = [c["_catalogue_idx"] for c in scored_pool]
            final_indices = self.vector_engine.maximal_marginal_relevance(
                query_vector=query_vector,
                candidate_indices=candidate_indices,
                top_n=target_n,
            )
            final_items = [dict(self.catalogue[i]) for i in final_indices]

        elif mode == "surprise_me":
            surprise_pool = self.reranker.apply_surprise_me(scored_pool, target_n)
            candidate_indices = [c["_catalogue_idx"] for c in surprise_pool]
            final_indices = self.vector_engine.maximal_marginal_relevance(
                query_vector=query_vector,
                candidate_indices=candidate_indices,
                top_n=target_n,
            )
            final_items = [dict(self.catalogue[i]) for i in final_indices]

        else:
            # Standard Mode: Sort by FinalScore -> Apply MMR
            scored_pool.sort(key=lambda x: x["final_score"], reverse=True)
            candidate_indices = [c["_catalogue_idx"] for c in scored_pool]
            final_indices = self.vector_engine.maximal_marginal_relevance(
                query_vector=query_vector,
                candidate_indices=candidate_indices,
                top_n=target_n,
            )
            final_items = [dict(self.catalogue[i]) for i in final_indices]

        # Step 7: Format Output & Attach Explanations
        output_results = []
        for it in final_items[:target_n]:
            it["explanation"] = self.reranker.generate_explanation(it, parsed)
            output_results.append(it)

        return {
            "query": raw_query,
            "parsed": parsed,
            "total_matches": len(valid_indices),
            "returned_count": len(output_results),
            "recommendations": output_results,
        }
