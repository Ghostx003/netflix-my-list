"""Taxonomy definition and 100-parameter semantic catalog for Netflix Knowledge Base.
Defines every generated semantic attribute, its allowed values, scoring ranges,
and operational definition for recommendation queries.
"""

from typing import Dict, Any, List

CATEGORICAL_ATTRIBUTES: Dict[str, Dict[str, Any]] = {
    "primary_genre": {
        "type": "string",
        "description": "Dominant cinematic genre defining the core narrative structure."
    },
    "secondary_genres": {
        "type": "list[string]",
        "description": "Major supporting genres with strong narrative weight."
    },
    "minor_incidental_genres": {
        "type": "list[string]",
        "description": "Subtle stylistic or occasional comedic/action elements that do not dominate."
    },
    "moods": {
        "type": "list[string]",
        "description": "Dominant atmospheric feelings (e.g., dark, cozy, gritty, melancholic, tense)."
    },
    "themes": {
        "type": "list[string]",
        "description": "Core thematic subject matters (e.g., Revenge, Redemption, Alienation, Survival)."
    },
    "narrative_archetypes": {
        "type": "list[string]",
        "description": "Story formulas (e.g., The Underdog, The Fugitive, The Fall from Grace, Fish out of Water)."
    },
    "story_pace": {
        "type": "string",
        "enum": ["slow-burn", "moderate", "fast-paced", "relentless"],
        "description": "Pacing and velocity of plot exposition."
    },
    "time_period": {
        "type": "string",
        "description": "Historical era or chronological setting (e.g., 1980s, Victorian, Modern, Dystopian Future)."
    },
    "setting_environment": {
        "type": "string",
        "description": "Primary geographical/physical setting (e.g., Small Town America, Cyberpunk Megacity, Mumbai Underworld, Deep Space)."
    },
    "ending_type": {
        "type": "string",
        "enum": ["happy", "bittersweet", "tragic", "ambiguous", "twist/shocking", "open"],
        "description": "Resolution nature of the film/series."
    },
    "audience_vibe": {
        "type": "string",
        "description": "Primary intended audience experience (e.g., late-night thinking, weekend popcorn thrills, cozy comfort)."
    },
}

# EXACT 100 CONTINUOUS PARAMETERS [0.0 to 1.0]
PARAM_GROUPS: Dict[str, List[str]] = {
    "genres_20": [
        "action", "adventure", "animation", "comedy", "crime", "documentary",
        "drama", "family", "fantasy", "history", "horror", "music_musical",
        "mystery", "romance", "sci_fi", "thriller", "war", "western",
        "biography", "sport"
    ],
    "emotional_atmospheric_25": [
        "darkness_bleakness", "heartwarming", "sadness_grief", "hopefulness", "joy_humor",
        "cynicism_nihilism", "existential_dread", "paranoia", "tension_suspense", "melancholy",
        "bittersweetness", "wholesomeness", "intellectual_complexity", "satire_parody", "absurdity_surrealism",
        "nostalgia", "emotional_intensity", "eeriness_creepy", "tearjerker", "feel_good",
        "romantic_tension", "whimsicality", "atmospheric_immersion", "adrenaline_rush", "poignancy"
    ],
    "narrative_thematic_35": [
        "revenge", "survival", "heist_con", "detective_investigation", "police_procedural",
        "courtroom_legal", "political_conspiracy", "espionage_spy", "coming_of_age", "friendship_camaraderie",
        "family_dynamics", "sibling_rivalry", "parental_sacrifice", "redemption_arc", "road_trip_journey",
        "time_travel_multiverse", "deep_space_cosmic", "dystopia_cyberpunk", "post_apocalyptic", "underdog_triumph",
        "reluctant_hero", "antihero", "tragic_hero", "fall_from_grace", "fish_out_of_water",
        "unreliable_narrator", "claustrophobic_bottleneck", "forbidden_love", "love_triangle", "identity_crisis",
        "mentor_protege", "class_warfare_inequality", "grief_and_healing", "supernatural_powers", "mythology_folklore"
    ],
    "content_execution_20": [
        "violence_gore", "jump_scares", "psychological_horror", "body_horror", "sexual_content",
        "nudity", "profanity", "substance_use", "family_friendliness", "pacing_speed",
        "plot_twist_surprise", "dialogue_density", "action_spectacle", "character_study_focus", "moral_ambiguity",
        "philosophical_depth", "period_authenticity", "visual_stylization", "realism_grittiness", "escapism"
    ]
}

# Complete flat list of all 100 parameter keys
ALL_100_PARAMETERS: List[str] = (
    PARAM_GROUPS["genres_20"] +
    PARAM_GROUPS["emotional_atmospheric_25"] +
    PARAM_GROUPS["narrative_thematic_35"] +
    PARAM_GROUPS["content_execution_20"]
)

assert len(ALL_100_PARAMETERS) == 100, f"Expected exactly 100 parameters, got {len(ALL_100_PARAMETERS)}"
