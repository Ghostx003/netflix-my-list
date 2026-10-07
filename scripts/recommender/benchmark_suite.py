"""Benchmark query suite for evaluating recommendation and search quality.
Covers 6 essential categories:
1. Reference title with positive/negative modulation
2. Mood and atmospheric concepts
3. Hard numeric constraints (runtime, count N, year, rating)
4. Genre and mood contrast paradoxes
5. Explicit negations and exclusions
6. Vague, abstract intent
"""

BENCHMARK_QUERIES = [
    # Category 1: Reference Title with Semantic Modulation
    {
        "id": "ref_01",
        "category": "reference_modulation",
        "query": "movies like Interstellar but less depressing",
        "reference_title": "Interstellar",
        "expected_residual": "less depressing",
        "expected_themes": ["space", "hope", "sci-fi", "science", "humanity"],
        "unexpected_themes": ["bleak", "depressing", "horror"],
    },
    {
        "id": "ref_02",
        "category": "reference_modulation",
        "query": "give me 5 movies like Gone Girl but faster pace and more action",
        "reference_title": "Gone Girl",
        "expected_count": 5,
        "expected_residual": "faster pace and more action",
        "expected_genres": ["Thriller", "Action", "Mystery"],
    },
    {
        "id": "ref_03",
        "category": "reference_modulation",
        "query": "something like Nightcrawler but set in corporate business",
        "reference_title": "Nightcrawler",
        "expected_residual": "set in corporate business",
        "expected_themes": ["ambition", "corporate", "greed", "dark", "crime"],
    },
    {
        "id": "ref_04",
        "category": "reference_modulation",
        "query": "shows like Stranger Things with adult humor",
        "reference_title": "Stranger Things",
        "expected_type": "tv_series",
        "expected_residual": "with adult humor",
    },

    # Category 2: Mood & Atmospheric Concepts
    {
        "id": "mood_01",
        "category": "mood_atmosphere",
        "query": "dark psychological thrillers about obsession and ambition",
        "expected_genres": ["Thriller", "Drama"],
        "expected_moods": ["dark", "tense", "psychological", "disturbing"],
    },
    {
        "id": "mood_02",
        "category": "mood_atmosphere",
        "query": "cozy feel-good movies for a rainy night",
        "expected_genres": ["Comedy", "Romance", "Drama"],
        "expected_moods": ["feel-good", "cozy", "warm", "heartwarming"],
    },
    {
        "id": "mood_03",
        "category": "mood_atmosphere",
        "query": "mind-bending intelligent sci-fi with philosophical questions",
        "expected_genres": ["Sci-Fi", "Mystery"],
        "expected_themes": ["philosophical", "mind-bending", "time", "reality"],
    },
    {
        "id": "mood_04",
        "category": "mood_atmosphere",
        "query": "unsettling slow-burn mystery in a small isolated town",
        "expected_genres": ["Mystery", "Thriller"],
        "expected_moods": ["slow-burn", "unsettling", "atmospheric", "isolated"],
    },

    # Category 3: Hard Numeric & Deterministic Constraints
    {
        "id": "hard_01",
        "category": "hard_constraints",
        "query": "give me exactly 7 thrillers under 2 hours",
        "expected_count": 7,
        "expected_max_runtime": 120,
        "expected_genres": ["Thriller"],
    },
    {
        "id": "hard_02",
        "category": "hard_constraints",
        "query": "I have 90 minutes. Find me something great with IMDb above 7.5",
        "expected_max_runtime": 90,
        "expected_min_imdb": 7.5,
        "expected_count": 10,
    },
    {
        "id": "hard_03",
        "category": "hard_constraints",
        "query": "top 5 Indian crime thrillers released after 2018",
        "expected_count": 5,
        "expected_country_or_lang": "India",
        "expected_genres": ["Crime", "Thriller"],
        "expected_min_year": 2018,
    },
    {
        "id": "hard_04",
        "category": "hard_constraints",
        "query": "find 8 90s action comedy movies",
        "expected_count": 8,
        "expected_min_year": 1990,
        "expected_max_year": 1999,
        "expected_genres": ["Action", "Comedy"],
    },

    # Category 4: Soft Contrast & Stylistic Paradoxes
    {
        "id": "contrast_01",
        "category": "contrast_paradox",
        "query": "funny action movie with a serious storyline",
        "expected_genres": ["Action", "Comedy"],
        "expected_themes": ["serious", "high stakes", "humor"],
    },
    {
        "id": "contrast_02",
        "category": "contrast_paradox",
        "query": "find me something romantic but not cheesy",
        "expected_genres": ["Romance", "Drama"],
        "expected_moods": ["realistic", "grounded", "mature"],
    },
    {
        "id": "contrast_03",
        "category": "contrast_paradox",
        "query": "creepy and tense movie with no gore",
        "expected_moods": ["creepy", "tense", "suspense"],
        "hard_exclusions": ["gore", "slasher"],
    },

    # Category 5: Explicit Negations & Exclusions
    {
        "id": "neg_01",
        "category": "explicit_negation",
        "query": "mind-bending, disturbing and intelligent, but NOT horror",
        "expected_moods": ["mind-bending", "disturbing", "intelligent"],
        "hard_exclusions": ["Horror"],
    },
    {
        "id": "neg_02",
        "category": "explicit_negation",
        "query": "gripping space sci-fi without aliens or monsters",
        "expected_genres": ["Sci-Fi", "Drama"],
        "hard_exclusions": ["aliens", "monsters"],
    },

    # Category 6: Vague / Abstract Intent
    {
        "id": "vague_01",
        "category": "vague_intent",
        "query": "give me 10 underrated movies for a rainy night",
        "expected_count": 10,
        "mode_flag": "hidden_gem",
    },
    {
        "id": "vague_02",
        "category": "vague_intent",
        "query": "surprise me with an unexpected high quality masterpiece",
        "mode_flag": "surprise_me",
    }
]
