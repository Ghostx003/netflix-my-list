"""Central configuration registry for the Netflix Discovery & Recommendation Engine.
All scoring weights, hyper-parameters, and thresholds are stored here to keep
the retrieval code cleanly decoupled and experimentally tuneable.
"""

from typing import Dict, Any

CONFIG: Dict[str, Any] = {
    # 1. Embedding Model Specification
    "model": {
        "name": "BAAI/bge-small-en-v1.5",
        "dimensions": 384,
        "query_prefix": "Represent this sentence for searching relevant passages: ",
        "quantized": True,
        "max_seq_length": 512,
    },

    # 2. Reference Movie Vector Arithmetic Weights
    # query_vector = normalize(alpha * v_ref + beta * v_residual - gamma * v_negative)
    "blend_weights": {
        "reference_alpha": 0.70,   # Tested experimentally against [0.5, 0.6, 0.7, 0.8]
        "residual_beta": 0.30,     # Residual semantic query weight
        "negative_gamma": 0.15,    # Soft steering away from negative semantic tokens
    },

    # 3. Multi-Objective Scoring Weights (Normalized to [0, 1])
    "scoring_weights": {
        "semantic": 0.55,          # Vector dot product / cosine similarity
        "metadata_match": 0.15,    # Jaccard overlap on genres, mood tags, themes, crew
        "quality": 0.12,           # Bayesian-damped quality score with vote confidence
        "personalization": 0.10,   # Cosine similarity to user preference centroid vector
        "discovery": 0.08,         # Bonus for non-mainstream titles
    },

    # 4. Bayesian Quality Score Parameters
    "quality_params": {
        "vote_prior": 500,         # m: Minimum vote threshold for Bayesian shrinkage
        "catalogue_mean_rating": 6.5, # C: Prior mean across IMDb
        "rt_weight": 0.4,          # Weight for Rotten Tomatoes when present
        "imdb_weight": 0.6,        # Weight for IMDb rating
    },

    # 5. Diversity via Maximal Marginal Relevance (MMR)
    "diversity": {
        "mmr_lambda": 0.65,        # Balances query relevance (0.65) vs. diversity (0.35)
        "top_k_candidates": 100,   # Size of initial candidate pool before reranking
    },

    # 6. Gated Hidden Gem Algorithm
    "hidden_gem": {
        "min_imdb": 6.8,           # Hard qualification gate for IMDb
        "min_votes": 1000,         # Minimum vote threshold to avoid 1-vote noise
        "max_popularity_votes": 75000, # Beyond this, a title is too mainstream to be a hidden gem
        "popularity_dampener_constant": 2.718, # e
    },

    # 7. Guarded Surprise Me Engine (Strictly preserves hard constraints)
    "surprise_me": {
        "relevance_ratio": 0.70,   # 70% Strong semantic matches
        "exploration_ratio": 0.20, # 20% High-quality unexpected tangents
        "hidden_gem_ratio": 0.10,  # 10% Certified hidden gems
    },

    # 8. User Preference Vector Personalization
    "personalization": {
        "query_blend_weight": 0.15,# Blend user vector into query: 0.85 * q + 0.15 * u
        "click_weight": 0.3,
        "like_weight": 1.0,
        "dislike_weight": -1.2,
        "decay_factor": 0.95,
    },

    # 9. Fuzzy Title Match Threshold
    "fuzzy_matching": {
        "title_score_cutoff": 82.0 # Minimum RapidFuzz ratio to accept title extraction
    }
}
