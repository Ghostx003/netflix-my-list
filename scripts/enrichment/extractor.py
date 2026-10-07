"""High-Precision 100-Parameter Semantic Extraction & Reasoning Engine.
Translates gathered factual evidence into 100 continuous intensity scores [0.0 to 1.0]
and rich categorical narrative attributes.
Combines local GGUF Qwen reasoning with deep semantic rules and cross-attribute calibration.
"""

import json
import re
from typing import Dict, Any, List, Optional
from scripts.enrichment.taxonomy import ALL_100_PARAMETERS, PARAM_GROUPS


class SemanticProfileExtractor:
    def __init__(self, llm_runner: Any = None):
        """
        Args:
            llm_runner: Optional local GGUF Qwen runner. If None, instantiates LocalQwenEngine.
        """
        self.llm_runner = llm_runner
        if self.llm_runner is None:
            try:
                from scripts.enrichment.qwen_engine import LocalQwenEngine
                self.llm_runner = LocalQwenEngine()
            except Exception as e:
                print(f"[Extractor] Could not initialize LocalQwenEngine: {e}")
                self.llm_runner = None

        # Build token lookup dictionary for the 100 parameters
        self._init_token_lexicons()

    def _init_token_lexicons(self):
        """Precomputes domain keywords for the 100 parameters."""
        self.lexicon: Dict[str, List[str]] = {
            # 20 Genres
            "action": ["action", "combat", "fight", "chase", "gunfight", "explosion", "battle", "martial arts", "shootout"],
            "adventure": ["adventure", "journey", "quest", "exploration", "expedition", "treasure", "wilderness", "travel"],
            "animation": ["animation", "animated", "anime", "cartoon", "cgi"],
            "comedy": ["comedy", "funny", "humor", "hilarious", "laugh", "satire", "parody", "slapstick", "wit", "joke"],
            "crime": ["crime", "criminal", "gangster", "mafia", "cartel", "drug", "heist", "murder", "robbery", "corruption"],
            "documentary": ["documentary", "real life", "investigative", "historical account", "archive", "true story", "biographical"],
            "drama": ["drama", "dramatic", "emotional", "conflict", "tragedy", "struggle", "relationship", "hardship"],
            "family": ["family", "children", "kid", "all ages", "parenting", "wholesome", "gentle"],
            "fantasy": ["fantasy", "magic", "sorcery", "mythical", "kingdom", "dragon", "enchanted", "spell", "wizards"],
            "history": ["history", "historical", "period", "century", "war era", "ancient", "dynasty", "biopic"],
            "horror": ["horror", "scary", "terror", "ghost", "demon", "slasher", "haunted", "monster", "macabre", "chilling"],
            "music_musical": ["music", "musical", "singing", "song", "band", "concert", "musician", "composer", "dance"],
            "mystery": ["mystery", "unravel", "clue", "whodunit", "secret", "puzzling", "disappearance", "riddle"],
            "romance": ["romance", "romantic", "love", "passion", "couple", "dating", "lover", "heartbreak", "soulmate"],
            "sci_fi": ["sci-fi", "science fiction", "futuristic", "alien", "space", "technology", "artificial intelligence", "cyborg"],
            "thriller": ["thriller", "suspense", "tension", "danger", "psychological", "conspiracy", "edge-of-seat", "twist"],
            "war": ["war", "battlefield", "soldiers", "military", "combat zone", "world war", "army", "conflict", "frontline"],
            "western": ["western", "cowboy", "outlaw", "sheriff", "frontier", "gunslinger", "saloon", "ranch"],
            "biography": ["biography", "biopic", "life story", "real person", "historical figure", "memoir"],
            "sport": ["sport", "athlete", "championship", "tournament", "football", "cricket", "boxing", "coach", "training"],

            # 25 Emotional & Atmospheric
            "darkness_bleakness": ["dark", "bleak", "grim", "nihilistic", "disturbing", "cynical", "sinister", "macabre", "dismal"],
            "heartwarming": ["heartwarming", "wholesome", "kindness", "gentle", "uplifting", "warmth", "feel-good", "sweet", "affection"],
            "sadness_grief": ["sad", "grief", "loss", "mourning", "pain", "crying", "depressing", "bereavement", "sorrow"],
            "hopefulness": ["hope", "inspiring", "triumph", "optimistic", "victory", "persevere", "renewal", "bright future"],
            "joy_humor": ["joy", "funny", "laugh", "cheerful", "playful", "lighthearted", "jubilant", "delight"],
            "cynicism_nihilism": ["cynical", "nihilistic", "corrupt", "meaningless", "disillusioned", "amoral", "jaded"],
            "existential_dread": ["existential", "dread", "cosmic horror", "inevitable doom", "insignificance", "despair"],
            "paranoia": ["paranoia", "suspicious", "conspiracy", "trust nobody", "hallucination", "delusion", "surveillance"],
            "tension_suspense": ["tension", "suspense", "nail-biting", "high stakes", "ticking clock", "breathless", "anticipation"],
            "melancholy": ["melancholy", "wistful", "lonely", "pensive", "somber", "subdued", "haunting", "poignant"],
            "bittersweetness": ["bittersweet", "mixed emotions", "pyrrhic victory", "fond goodbye", "loss and love"],
            "wholesomeness": ["wholesome", "pure", "innocent", "kind", "clean", "moral", "endearing"],
            "intellectual_complexity": ["complex", "puzzle", "philosophical", "mind-bending", "cerebral", "non-linear", "intricate"],
            "satire_parody": ["satire", "parody", "spoof", "lampoon", "mockery", "caricature", "ironic"],
            "absurdity_surrealism": ["absurd", "surreal", "bizarre", "dreamlike", "weird", "hallucinatory", "eccentric"],
            "nostalgia": ["nostalgia", "retro", "vintage", "childhood", "memories", "bygone era", "classic era"],
            "emotional_intensity": ["intense emotion", "gut-wrenching", "passionate", "heavy", "overwhelming", "deeply moving"],
            "eeriness_creepy": ["eerie", "creepy", "unsettling", "spooky", "uncanny", "chilling", "sinister presence"],
            "tearjerker": ["tearjerker", "tragic ending", "crying", "weep", "heartbreaking death", "sorrowful farewell"],
            "feel_good": ["feel-good", "upbeat", "smile", "fun", "celebration", "comforting", "refreshing"],
            "romantic_tension": ["chemistry", "romantic tension", "longing", "unspoken desire", "spark", "attraction"],
            "whimsicality": ["whimsical", "playful", "fairytale", "quirky", "fanciful", "magical charm"],
            "atmospheric_immersion": ["atmospheric", "immersive", "moody", "evocative", "rich backdrop", "scenic"],
            "adrenaline_rush": ["adrenaline", "high octane", "relentless action", "explosive", "thrilling ride", "fast-paced"],
            "poignancy": ["poignant", "touching", "profound", "tender", "biting emotional truth"],

            # 35 Narrative & Thematic
            "revenge": ["revenge", "vengeance", "avenge", "vendetta", "retribution", "payback"],
            "survival": ["survival", "survive", "stranded", "life or death", "wilderness", "shipwreck", "hostile environment"],
            "heist_con": ["heist", "robbery", "con artist", "bank robbery", "steal", "safecracker", "scheme"],
            "detective_investigation": ["detective", "investigation", "inspector", "solve the murder", "sleuth", "forensics"],
            "police_procedural": ["police", "cops", "precinct", "law enforcement", "patrol", "detective squad"],
            "courtroom_legal": ["courtroom", "lawyer", "trial", "attorney", "judge", "jury", "verdict", "defense"],
            "political_conspiracy": ["conspiracy", "government cover-up", "politician", "white house", "scandal", "state secrets"],
            "espionage_spy": ["spy", "espionage", "secret agent", "mi6", "cia", "undercover operative", "intelligence"],
            "coming_of_age": ["coming of age", "adolescence", "growing up", "youth", "teenager", "high school", "identity"],
            "friendship_camaraderie": ["friendship", "best friends", "buddies", "camaraderie", "brotherhood", "sisterhood"],
            "family_dynamics": ["family", "father", "mother", "daughter", "son", "parents", "relatives", "household"],
            "sibling_rivalry": ["brother", "sister", "sibling rivalry", "estranged siblings", "twin"],
            "parental_sacrifice": ["sacrifice", "protecting child", "parent's love", "devoted mother", "father's struggle"],
            "redemption_arc": ["redemption", "atonement", "second chance", "forgiveness", "making amends"],
            "road_trip_journey": ["road trip", "highway", "cross country", "journey", "traveling together"],
            "time_travel_multiverse": ["time travel", "multiverse", "timeline", "temporal", "alternate reality", "time loop"],
            "deep_space_cosmic": ["space", "galaxy", "astronaut", "spaceship", "interstellar", "orbit", "planet", "nasa"],
            "dystopia_cyberpunk": ["dystopia", "cyberpunk", "hacker", "megacity", "future totalitarian", "neon", "ai takeover"],
            "post_apocalyptic": ["post-apocalyptic", "apocalypse", "nuclear wasteland", "fall of civilization", "ruins"],
            "underdog_triumph": ["underdog", "against all odds", "unlikely hero", "defeat the giant", "triumph over adversity"],
            "reluctant_hero": ["reluctant hero", "unwilling participant", "forced into fight", "dragged back into action"],
            "antihero": ["antihero", "morally gray", "ruthless protagonist", "criminal lead", "vigilante"],
            "tragic_hero": ["tragic hero", "fatal flaw", "doomed protagonist", "downfall", "hubris"],
            "fall_from_grace": ["fall from grace", "disgraced", "ruined reputation", "corruption of virtue", "collapse"],
            "fish_out_of_water": ["fish out of water", "new culture", "stranger in town", "unfamiliar world", "clueless newcomer"],
            "unreliable_narrator": ["unreliable narrator", "hallucination", "memory loss", "illusion vs reality", "twist"],
            "claustrophobic_bottleneck": ["claustrophobic", "trapped in one room", "bunker", "isolated cabin", "single location"],
            "forbidden_love": ["forbidden love", "star-crossed", "taboo romance", "opposed by family", "secret relationship"],
            "love_triangle": ["love triangle", "two suitors", "torn between two lovers", "jealousy"],
            "identity_crisis": ["identity crisis", "amnesia", "who am i", "double life", "secret identity"],
            "mentor_protege": ["mentor", "student", "teacher", "training", "master and apprentice", "sensei"],
            "class_warfare_inequality": ["class struggle", "rich vs poor", "inequality", "poverty", "wealth gap", "aristocracy"],
            "grief_and_healing": ["healing from grief", "coping with death", "trauma", "moving forward", "recovery"],
            "supernatural_powers": ["superpowers", "magic powers", "telepathy", "mutant", "superhuman", "curse"],
            "mythology_folklore": ["mythology", "folklore", "ancient legend", "gods", "folktale", "demon lore"],

            # 20 Content & Execution
            "violence_gore": ["violence", "gore", "blood", "brutal", "gruesome", "dismemberment", "visceral killing"],
            "jump_scares": ["jump scare", "shock", "sudden fright", "startle", "creepy sudden"],
            "psychological_horror": ["psychological horror", "mind games", "sanity", "madness", "hallucinations"],
            "body_horror": ["body horror", "mutation", "grotesque transformation", "parasite", "flesh"],
            "sexual_content": ["sexual", "erotic", "intimacy", "seduction", "sensual", "sex scene"],
            "nudity": ["nudity", "unclothed", "provocative", "explicit visuals"],
            "profanity": ["profanity", "foul language", "swearing", "vulgarity", "crude"],
            "substance_use": ["drugs", "cocaine", "alcoholism", "smoking", "substance abuse", "addiction", "heroin"],
            "family_friendliness": ["family-friendly", "clean", "innocent", "kids", "all ages", "g-rated"],
            "pacing_speed": ["fast-paced", "relentless", "breakneck", "non-stop", "kinetic", "high-velocity"],
            "plot_twist_surprise": ["plot twist", "shocking reveal", "unexpected turn", "reversal", "twist ending"],
            "dialogue_density": ["dialogue-driven", "witty banter", "fast-talking", "monologue", "conversational"],
            "action_spectacle": ["spectacle", "visual effects", "blockbuster", "epic scale", "huge set pieces", "stunts"],
            "character_study_focus": ["character study", "intimate portrait", "psychological depth", "internal conflict"],
            "moral_ambiguity": ["morally ambiguous", "gray morality", "no clear heroes", "ethical dilemma", "compromise"],
            "philosophical_depth": ["philosophical", "existential questions", "meaning of life", "morality", "meditative"],
            "period_authenticity": ["period accuracy", "costumes", "authentic setting", "historical recreation"],
            "visual_stylization": ["stylized", "unique visuals", "cinematography", "neon-lit", "noir aesthetic", "visual flair"],
            "realism_grittiness": ["gritty realism", "grounded", "raw", "hyper-realistic", "documentary-style", "naturalistic"],
            "escapism": ["escapism", "fantasy world", "fun adventure", "pure entertainment", "fun spectacle"],
        }

    def extract_structured_profile(self, evidence: Dict[str, Any]) -> Dict[str, Any]:
        """Produces a rich profile containing all 100 continuous parameters and narrative attributes."""
        title = evidence.get("title", "")
        year = evidence.get("year")
        media_type = evidence.get("media_type", "movie")

        # 1. Run local Qwen AI reasoning if available
        ai_profile = None
        if self.llm_runner:
            try:
                ai_profile = self.llm_runner.analyze_title(title, year, media_type, evidence)
            except Exception as e:
                print(f"       [AI Warning] Qwen inference exception for '{title}': {e}")

        # 2. Extract baseline context from evidence
        genres = [g.lower() for g in evidence.get("genres", [])]
        keywords = [k.lower() for k in evidence.get("keywords", [])]
        synopsis = (evidence.get("combined_synopsis", "")).lower()
        full_text = f"{title.lower()} {' '.join(genres)} {' '.join(keywords)} {synopsis}"

        # 3. Categorical Attributes (blend AI with evidence)
        primary_genre = (ai_profile.get("primary_genre") if ai_profile else None) or self._determine_primary_genre(genres, full_text)
        secondary_genres = (ai_profile.get("secondary_genres") if ai_profile else None) or [g.capitalize() for g in genres if g.capitalize() != primary_genre][:3]
        minor_genres = (ai_profile.get("minor_incidental_genres") if ai_profile else None) or self._determine_minor_genres(full_text, primary_genre, secondary_genres)
        moods = (ai_profile.get("moods") if ai_profile else None) or self._determine_moods(full_text)
        themes = (ai_profile.get("themes") if ai_profile else None) or self._determine_themes(full_text)
        archetypes = (ai_profile.get("narrative_archetypes") if ai_profile else None) or self._determine_archetypes(full_text)
        story_pace = (ai_profile.get("story_pace") if ai_profile else None) or ("fast-paced" if "action" in genres else ("slow-burn" if "mystery" in genres else "moderate"))
        ending_type = (ai_profile.get("ending_type") if ai_profile else None) or ("tragic" if "tragedy" in full_text else "bittersweet")
        audience_vibe = (ai_profile.get("audience_vibe") if ai_profile else None) or f"{primary_genre} experience"

        # 4. Compute ALL 100 PARAMETERS with continuous [0.0 to 1.0] scoring
        parameters_100: Dict[str, float] = {}

        # Merge any direct scores output by Qwen
        ai_scores = {}
        if ai_profile:
            ai_scores.update(ai_profile.get("scores", {}))
            ai_scores.update(ai_profile.get("thematic_dimensions", {}))
            ai_scores.update(ai_profile.get("parameters_100", {}))

        for param in ALL_100_PARAMETERS:
            # Check if Qwen directly provided this parameter or alias
            if param in ai_scores:
                parameters_100[param] = float(ai_scores[param])
                continue

            # Compute from tokens, genres, and context
            baseline = 0.0
            if param in genres:
                baseline = 0.85
            elif param == "action" and "action" in genres:
                baseline = 0.85
            elif param == "sci_fi" and ("sci-fi" in genres or "science fiction" in genres):
                baseline = 0.85
            elif param == "music_musical" and ("music" in genres or "musical" in genres):
                baseline = 0.85

            tokens = self.lexicon.get(param, [param.replace("_", " ")])
            score = self._compute_continuous_score(full_text, tokens, baseline=baseline)
            parameters_100[param] = score

        # 5. Apply Deep Cross-Attribute Calibration Rules
        # Rule A: Dominant Genre Consistency
        if primary_genre.lower() in parameters_100:
            parameters_100[primary_genre.lower()] = max(parameters_100[primary_genre.lower()], 0.85)

        # Rule B: Heartwarming Suppression for Dark / Gory films
        darkness = parameters_100.get("darkness_bleakness", 0.0)
        violence = parameters_100.get("violence_gore", 0.0)
        horror = parameters_100.get("horror", 0.0)
        if darkness > 0.70 or horror > 0.65 or violence > 0.75:
            parameters_100["heartwarming"] = min(parameters_100.get("heartwarming", 0.0) * 0.25, 0.20)
            parameters_100["wholesomeness"] = min(parameters_100.get("wholesomeness", 0.0) * 0.25, 0.20)
            parameters_100["feel_good"] = min(parameters_100.get("feel_good", 0.0) * 0.20, 0.15)

        # Rule C: Family-Friendliness Calculation
        unfriendly_max = max(violence, horror, darkness * 0.8, parameters_100.get("sexual_content", 0.0))
        if "family" in genres or "animation" in genres:
            parameters_100["family_friendliness"] = max(round(1.0 - (unfriendly_max * 0.5), 2), 0.75)
        else:
            parameters_100["family_friendliness"] = max(0.0, round(1.0 - unfriendly_max, 2))

        # Rule D: Round all 100 parameters to 2 decimal places in [0.0, 1.0]
        for p in ALL_100_PARAMETERS:
            parameters_100[p] = round(max(0.0, min(1.0, float(parameters_100.get(p, 0.0)))), 2)

        # Compatibility slices for legacy callers
        legacy_scores = {
            "action_intensity": parameters_100["action"],
            "crime_intensity": parameters_100["crime"],
            "comedy_intensity": parameters_100["comedy"],
            "romance_intensity": parameters_100["romance"],
            "horror_intensity": parameters_100["horror"],
            "thriller_intensity": parameters_100["thriller"],
            "mystery_level": parameters_100["mystery"],
            "darkness_bleakness": parameters_100["darkness_bleakness"],
            "heartwarming_level": parameters_100["heartwarming"],
            "sadness_level": parameters_100["sadness_grief"],
            "hopefulness": parameters_100["hopefulness"],
            "violence_gore": parameters_100["violence_gore"],
            "family_friendliness": parameters_100["family_friendliness"],
        }
        legacy_thematic = {
            "revenge": parameters_100["revenge"],
            "survival": parameters_100["survival"],
            "heist_con": parameters_100["heist_con"],
            "detective_investigation": parameters_100["detective_investigation"],
            "coming_of_age": parameters_100["coming_of_age"],
            "friendship": parameters_100["friendship_camaraderie"],
            "family_dynamics": parameters_100["family_dynamics"],
            "redemption": parameters_100["redemption_arc"],
        }

        return {
            "title": title,
            "year": year,
            "media_type": media_type,
            "primary_genre": primary_genre,
            "secondary_genres": secondary_genres,
            "minor_incidental_genres": minor_genres,
            "moods": moods,
            "themes": themes,
            "narrative_archetypes": archetypes,
            "story_pace": story_pace,
            "ending_type": ending_type,
            "time_period": ai_profile.get("time_period", "Modern") if ai_profile else "Modern",
            "setting_environment": ai_profile.get("setting_environment", "Various") if ai_profile else "Various",
            "audience_vibe": audience_vibe,
            "parameters_100": parameters_100,
            "scores": legacy_scores,
            "thematic_dimensions": legacy_thematic,
            "sources": evidence.get("sources", []),
            "confidence_score": 0.95 if ai_profile else (0.90 if len(evidence.get("sources", [])) >= 2 else 0.82),
        }

    def _determine_primary_genre(self, genres: List[str], full_text: str) -> str:
        priority = ["horror", "sci-fi", "science fiction", "animation", "documentary", "comedy", "romance", "action", "crime", "thriller", "drama"]
        for g in priority:
            if g in genres:
                return "Sci-Fi" if g in ["sci-fi", "science fiction"] else g.capitalize()
        return genres[0].capitalize() if genres else "Drama"

    def _determine_minor_genres(self, full_text: str, primary: str, secondaries: List[str]) -> List[str]:
        candidates = ["Comedy", "Romance", "Action", "Mystery", "Drama", "Fantasy", "Music"]
        existing = {primary.lower()} | {s.lower() for s in secondaries}
        minor = []
        for c in candidates:
            if c.lower() not in existing and c.lower() in full_text:
                minor.append(c)
        return minor[:2]

    def _determine_moods(self, text: str) -> List[str]:
        mood_map = {
            "Dark & Gritty": ["dark", "gritty", "grim", "bleak", "violent"],
            "Tense & Suspenseful": ["tense", "suspense", "danger", "paranoia"],
            "Heartwarming & Uplifting": ["heartwarming", "wholesome", "sweet", "uplifting"],
            "Witty & Humorous": ["comedy", "funny", "witty", "hilarious"],
            "Atmospheric & Melancholic": ["melancholy", "somber", "atmospheric", "haunting"],
            "Action-Packed & Kinetic": ["action", "explosive", "fast-paced", "adrenaline"],
        }
        res = []
        for mood_name, words in mood_map.items():
            if any(w in text for w in words):
                res.append(mood_name)
        return res[:3] if res else ["Dramatic"]

    def _determine_themes(self, text: str) -> List[str]:
        theme_map = {
            "Revenge & Retribution": ["revenge", "vengeance", "avenge"],
            "Survival & Resilience": ["survival", "survive", "stranded"],
            "Coming of Age & Identity": ["coming of age", "growing up", "youth"],
            "Family & Generational Dynamics": ["family", "father", "mother", "daughter", "son"],
            "Redemption & Atonement": ["redemption", "atonement", "second chance"],
            "Justice & Institutional Corruption": ["corruption", "police", "conspiracy", "law"],
            "Cosmic & Technological Exploration": ["space", "alien", "technology", "artificial intelligence"],
        }
        res = []
        for t_name, words in theme_map.items():
            if any(w in text for w in words):
                res.append(t_name)
        return res[:4] if res else ["Human Struggle"]

    def _determine_archetypes(self, text: str) -> List[str]:
        archetypes_map = {
            "The Reluctant Hero": ["reluctant", "unwilling hero"],
            "The Underdog": ["underdog", "unlikely hero", "against all odds"],
            "The Antihero": ["antihero", "morally gray", "ruthless protagonist"],
            "The Solitary Survivor": ["stranded", "alone", "isolated survivor"],
            "The Mastermind": ["mastermind", "schemer", "genius planner"],
            "The Infiltrator": ["undercover", "mole", "infiltrator", "spy"],
        }
        res = []
        for arch, words in archetypes_map.items():
            if any(w in text for w in words):
                res.append(arch)
        return res[:2] if res else ["The Protagonist"]

    def _compute_continuous_score(self, text: str, tokens: List[str], baseline: float = 0.0) -> float:
        score = baseline
        matches = 0
        for t in tokens:
            if t in text:
                matches += 1
        if matches > 0:
            score = max(score, min(1.0, 0.40 + (matches * 0.15)))
        return min(1.0, score)
