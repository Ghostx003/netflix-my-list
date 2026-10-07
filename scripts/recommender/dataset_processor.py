"""Dataset preprocessor and document generator.
Constructs structured composite profile text documents per movie/show title,
optimizing keyword and mood priority over long synopses for BGE-small retrieval.
"""

from typing import Dict, Any, List


def format_composite_document(item: Dict[str, Any]) -> str:
    """
    Format a single movie/show record into a high-density, structured text document.
    Prioritizes Title, Genres, Mood tags, Themes, and Crew before the synopsis
    so semantic search matches abstract vibes, directors, and genres immediately.
    """
    title = item.get("title") or item.get("originalTitle") or "Unknown Title"
    media_type = "TV Series" if item.get("mediaType") == "tv" else "Movie"
    year = item.get("releaseYear") or item.get("year") or ""
    runtime = item.get("runtimeMinutes") or item.get("runtime")
    runtime_str = f"{runtime}m" if runtime else ""
    country = item.get("country") or (item.get("countries", [None])[0] if item.get("countries") else "")

    genres = item.get("genres") or []
    if isinstance(genres, list):
        genres_str = ", ".join(genres)
    else:
        genres_str = str(genres)

    subgenres = item.get("subgenres") or []
    subgenres_str = ", ".join(subgenres) if isinstance(subgenres, list) else str(subgenres)

    moods = item.get("moodTags") or item.get("mood_tags") or item.get("mood") or []
    moods_str = ", ".join(moods) if isinstance(moods, list) else str(moods)

    themes = item.get("themes") or item.get("tags") or []
    themes_str = ", ".join(themes) if isinstance(themes, list) else str(themes)

    director = item.get("director") or ""
    cast = item.get("cast") or item.get("cast_members") or []
    cast_str = ", ".join(cast[:4]) if isinstance(cast, list) else str(cast)

    synopsis = item.get("synopsis") or item.get("overview") or ""

    lines = [
        f"Title: {title}",
        f"Type: {media_type} | Year: {year} | Runtime: {runtime_str} | Country: {country}".strip(" |"),
    ]
    if genres_str:
        lines.append(f"Genres: {genres_str}")
    if subgenres_str:
        lines.append(f"Subgenres: {subgenres_str}")
    if moods_str:
        lines.append(f"Mood & Atmosphere: {moods_str}")
    if themes_str:
        lines.append(f"Core Themes: {themes_str}")
    if director or cast_str:
        crew_parts = []
        if director:
            crew_parts.append(f"Directed by {director}")
        if cast_str:
            crew_parts.append(f"Starring {cast_str}")
        lines.append(f"Cast & Crew: {'. '.join(crew_parts)}.")
    if synopsis:
        lines.append(f"Summary: {synopsis}")

    return "\n".join(lines)


def calculate_bayesian_quality(
    imdb_rating: float,
    vote_count: int,
    prior_votes: int = 500,
    catalogue_mean: float = 6.5,
) -> float:
    """
    Computes normalized Bayesian quality score in [0, 1] with vote-count shrinkage.
    Prevents obscure titles with 1 review from dominating high-rated titles with 500,000 reviews.
    """
    v = max(vote_count, 0)
    r = max(min(imdb_rating, 10.0), 1.0)
    # Bayesian formula: (v / (v + m)) * R + (m / (v + m)) * C
    bayesian_score = (v / (v + prior_votes)) * r + (prior_votes / (v + prior_votes)) * catalogue_mean
    # Normalize (1.0 - 10.0) -> [0.0, 1.0]
    return max(0.0, min(1.0, (bayesian_score - 1.0) / 9.0))
