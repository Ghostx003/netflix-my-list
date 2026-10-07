"""Hybrid Fast Query Parser.
Combines:
1. Exact and RapidFuzz Title/Entity Matching
2. Deterministic Constraint Tokenization (Count, Runtime, Decade/Year, IMDb, Media Type)
3. Explicit Negation/Exclusion Filtering
4. Residual Semantic Query Isolation
"""

import re
from typing import Dict, Any, List, Optional, Tuple
from rapidfuzz import process, fuzz


class HybridQueryParser:
    def __init__(self, known_titles: Optional[List[str]] = None, title_to_id: Optional[Dict[str, Any]] = None):
        """
        Args:
            known_titles: List of official titles and aliases in the catalogue.
            title_to_id: Mapping from title to database ID.
        """
        self.known_titles = known_titles or []
        self.title_to_id = title_to_id or {}
        # Pre-normalize title index for exact matching
        self.normalized_titles = {
            self._clean_title_key(t): t for t in self.known_titles
        }

    @staticmethod
    def _clean_title_key(text: str) -> str:
        text = text.lower()
        text = re.sub(r'[\':.,!?-]', '', text)
        return text.strip()

    def parse(self, raw_query: str) -> Dict[str, Any]:
        """
        Parse raw natural language query into structured constraints and residual semantic text.
        """
        text = raw_query.strip()
        result: Dict[str, Any] = {
            "raw_query": raw_query,
            "count": 10,  # Default
            "exact_count_requested": False,
            "reference_title": None,
            "reference_id": None,
            "max_runtime_minutes": None,
            "min_imdb_rating": None,
            "min_year": None,
            "max_year": None,
            "media_type": None,  # 'movie', 'tv_series', or None
            "country_or_lang": None,
            "mode": "standard",  # 'standard', 'hidden_gem', 'surprise_me'
            "hard_exclusions": [],
            "residual_semantic_query": "",
        }

        # 1. Mode Detection: "Hidden Gem" or "Surprise Me"
        if re.search(r'\b(underrated|hidden\s*gems?|overlooked|underappreciated)\b', text, re.IGNORECASE):
            result["mode"] = "hidden_gem"
        elif re.search(r'\b(surprise\s*me|unexpected|adventurous|wildcard)\b', text, re.IGNORECASE):
            result["mode"] = "surprise_me"

        # 2. Extract Requested Count (ensure not matching runtime "X hours/mins")
        count_match = re.search(
            r'\b(?:give me|find(?: me)?|top|exactly|recommend)\s+(\d+)\s*(?:movies?|shows?|films?|titles?|series|recommendations?|\b)',
            text,
            re.IGNORECASE,
        )
        if not count_match:
            # Fallback pattern for leading numbers: "7 dark psychological thrillers"
            count_match = re.search(
                r'^(?:give me\s+)?(\d+)\s+(?!hours?|hrs?|h\b|mins?|minutes?|m\b)',
                text,
                re.IGNORECASE,
            )

        if count_match:
            try:
                cnt = int(count_match.group(1))
                if 1 <= cnt <= 50:
                    result["count"] = cnt
                    result["exact_count_requested"] = bool(
                        re.search(r'\bexactly\b', text, re.IGNORECASE)
                    )
            except ValueError:
                pass

        # 3. Extract Runtime Constraints
        # Patterns like: "under 2 hours", "within 90 minutes", "1.5 hours", "under 120 mins"
        runtime_hour_match = re.search(
            r'\b(?:under|less than|max|within|around)\s*(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b',
            text,
            re.IGNORECASE,
        )
        if runtime_hour_match:
            hours = float(runtime_hour_match.group(1))
            result["max_runtime_minutes"] = int(hours * 60)
        else:
            runtime_min_match = re.search(
                r'\b(?:under|less than|max|within|I have)\s*(\d+)\s*(?:minutes?|mins?|m)\b',
                text,
                re.IGNORECASE,
            )
            if runtime_min_match:
                result["max_runtime_minutes"] = int(runtime_min_match.group(1))

        # 4. Extract Rating Constraints (e.g., "IMDb above 7.5", "rating over 8")
        rating_match = re.search(
            r'\b(?:imdb|rating|rated)?\s*(?:above|over|>|greater than|at least)\s*(\d+(?:\.\d+)?)\b',
            text,
            re.IGNORECASE,
        )
        if rating_match:
            try:
                r_val = float(rating_match.group(1))
                if 1.0 <= r_val <= 10.0:
                    result["min_imdb_rating"] = r_val
            except ValueError:
                pass

        # 5. Extract Media Type (movie vs show/series)
        if re.search(r'\b(shows?|tv\s*series|series|seasons?)\b', text, re.IGNORECASE):
            result["media_type"] = "tv_series"
        elif re.search(r'\b(movies?|films?)\b', text, re.IGNORECASE):
            result["media_type"] = "movie"

        # 6. Extract Decades & Years (e.g. "90s", "eighties", "after 2018", "released in 2021")
        decade_match = re.search(r'\b(\d{2})s\b', text, re.IGNORECASE)
        if decade_match:
            dec = int(decade_match.group(1))
            full_year = 1900 + dec if dec >= 30 else 2000 + dec
            result["min_year"] = full_year
            result["max_year"] = full_year + 9

        year_after_match = re.search(r'\b(?:after|post|since)\s*(\d{4})\b', text, re.IGNORECASE)
        if year_after_match:
            result["min_year"] = int(year_after_match.group(1))

        year_before_match = re.search(r'\b(?:before|pre)\s*(\d{4})\b', text, re.IGNORECASE)
        if year_before_match:
            result["max_year"] = int(year_before_match.group(1))

        # 7. Extract Language / Country (e.g. "Indian", "Hindi", "Korean", "Anime")
        if re.search(r'\b(indian|bollywood|hindi|tamil|telugu)\b', text, re.IGNORECASE):
            result["country_or_lang"] = "India"
        elif re.search(r'\b(korean|k-drama)\b', text, re.IGNORECASE):
            result["country_or_lang"] = "Korea"
        elif re.search(r'\b(anime|japanese)\b', text, re.IGNORECASE):
            result["country_or_lang"] = "Japan"

        # 8. Extract Hard Exclusions (e.g., "not horror", "without gore", "no comedy")
        exclusion_patterns = [
            r'\b(?:but\s+)?not\s+([a-zA-Z\s]+?)(?:$|\b(?:under|with|above|and|released)\b)',
            r'\bwithout\s+([a-zA-Z\s]+?)(?:$|\b(?:under|with|above|and|released)\b)',
            r'\bno\s+([a-zA-Z\s]+?)(?:$|\b(?:under|with|above|and|released)\b)',
        ]
        for pattern in exclusion_patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for m in matches:
                excl_term = m.group(1).strip()
                for sub_term in re.split(r'\s+(?:or|and)\s+|,', excl_term):
                    clean_term = sub_term.strip().lower()
                    if clean_term and clean_term not in ["a", "the", "any", "too"]:
                        result["hard_exclusions"].append(clean_term)

        # 9. Extract Reference Title ("movies like X", "similar to Y")
        ref_match = re.search(
            r'\b(?:like|similar to|in the style of|such as)\s+([a-zA-Z0-9\s\':.-]+?)(?:\s+(?:but|with|without|under|above|less|more|set in)\b|$)',
            text,
            re.IGNORECASE,
        )
        cleaned_text_for_residual = text
        if ref_match and self.known_titles:
            candidate_raw = ref_match.group(1).strip()
            matched_title, matched_id = self._find_best_title_match(candidate_raw)
            if matched_title:
                result["reference_title"] = matched_title
                result["reference_id"] = matched_id
                cleaned_text_for_residual = cleaned_text_for_residual.replace(ref_match.group(0), " ")

        # 10. Extract Clean Residual Semantic Query
        residual = self._clean_residual_query(cleaned_text_for_residual, result)
        result["residual_semantic_query"] = residual

        return result

    def _find_best_title_match(self, raw_candidate: str) -> Tuple[Optional[str], Optional[Any]]:
        norm_key = self._clean_title_key(raw_candidate)
        if norm_key in self.normalized_titles:
            official = self.normalized_titles[norm_key]
            return official, self.title_to_id.get(official)

        if self.known_titles:
            match = process.extractOne(
                raw_candidate,
                self.known_titles,
                scorer=fuzz.token_sort_ratio,
                score_cutoff=75.0,
            )
            if match:
                official = match[0]
                return official, self.title_to_id.get(official)

        return None, None

    @staticmethod
    def _clean_residual_query(text: str, current_parsed: Dict[str, Any]) -> str:
        # Strip extracted title
        if current_parsed.get("reference_title"):
            ref = current_parsed["reference_title"]
            text = re.sub(rf'\b{re.escape(ref)}\b', ' ', text, flags=re.IGNORECASE)

        # Strip explicit exclusion phrases
        for excl in current_parsed.get("hard_exclusions", []):
            text = re.sub(rf'\b(?:but\s+)?(?:not|without|no|except)\s+{re.escape(excl)}\b', ' ', text, flags=re.IGNORECASE)

        # Strip runtime phrases
        text = re.sub(r'\b(?:under|less than|max|within|I have)?\s*\d+(?:\.\d+)?\s*(?:hours?|hrs?|minutes?|mins?|m|h)\b', ' ', text, flags=re.IGNORECASE)
        # Strip rating phrases
        text = re.sub(r'\b(?:imdb|rating|rated)?\s*(?:above|over|>|at least)\s*\d+(?:\.\d+)?\b', ' ', text, flags=re.IGNORECASE)
        # Strip count phrases
        text = re.sub(r'\b(?:give me|find(?: me)?|top|exactly|recommend)\s+\d+\b', ' ', text, flags=re.IGNORECASE)
        text = re.sub(r'^\s*\d+\s+', ' ', text)
        # Strip generic stopwords and filler verbs
        text = re.sub(r'\b(?:movies?|shows?|films?|series|titles?|give me|find me|exactly)\b', ' ', text, flags=re.IGNORECASE)
        # Strip dangling conjunctions at ends
        text = re.sub(r'\b(but|and|with)\s*$', ' ', text, flags=re.IGNORECASE)

        text = re.sub(r'[,;:.]', ' ', text)
        text = re.sub(r'\s+', ' ', text).strip()
        return text
