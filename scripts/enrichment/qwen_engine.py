"""Headless Local Qwen Engine for In-Depth Movie Narrative Reasoning.
Uses NVIDIA GeForce GTX 1650 GPU Acceleration via llama-server (Vulkan/CUDA).
Analyzes verified plot synopses, story beats, and character trajectories
to discern dominant vs secondary vs incidental narrative dimensions.
"""

import json
import re
import time
import os
import subprocess
from typing import Dict, Any, Optional

try:
    import requests
except ImportError:
    requests = None

try:
    from llama_cpp import Llama
except ImportError:
    Llama = None


QWEN_SYSTEM_PROMPT = """You are an expert film analyst and narrative intelligence engine.
Analyze the provided plot synopsis, keywords, genres, and facts about a movie or series.
Carefully understand what the story is ACTUALLY about: determine what elements drive the experience (dominant vs secondary vs incidental).

Return ONLY a valid, raw JSON object matching the exact schema below. Do NOT output markdown code fences, greetings, or explanations.

JSON Schema:
{
  "primary_genre": "string (e.g. Action, Crime, Thriller, Sci-Fi, Horror, Romance, Comedy, Drama, Documentary)",
  "secondary_genres": ["string", "string"],
  "minor_incidental_genres": ["string"],
  "moods": ["string", "string"],
  "themes": ["string", "string"],
  "narrative_archetypes": ["string", "string"],
  "story_pace": "slow-burn | moderate | fast-paced | relentless",
  "ending_type": "happy | bittersweet | tragic | ambiguous | twist/shocking | open",
  "time_period": "string (e.g. Modern, 1980s, Victorian, Dystopian Future)",
  "setting_environment": "string (e.g. Mumbai Underworld, Deep Space, Small Town, High School)",
  "audience_vibe": "string",
  "scores": {
    "action": 0.0 to 1.0,
    "crime": 0.0 to 1.0,
    "comedy": 0.0 to 1.0,
    "romance": 0.0 to 1.0,
    "horror": 0.0 to 1.0,
    "thriller": 0.0 to 1.0,
    "mystery": 0.0 to 1.0,
    "darkness_bleakness": 0.0 to 1.0,
    "heartwarming": 0.0 to 1.0,
    "sadness_grief": 0.0 to 1.0,
    "hopefulness": 0.0 to 1.0,
    "violence_gore": 0.0 to 1.0,
    "family_friendliness": 0.0 to 1.0,
    "revenge": 0.0 to 1.0,
    "survival": 0.0 to 1.0,
    "heist_con": 0.0 to 1.0,
    "detective_investigation": 0.0 to 1.0,
    "coming_of_age": 0.0 to 1.0,
    "friendship_camaraderie": 0.0 to 1.0,
    "family_dynamics": 0.0 to 1.0,
    "redemption_arc": 0.0 to 1.0
  }
}

CRITICAL RULES:
- Continuous scores must be numbers between 0.0 and 1.0.
- A dark crime film with a slight love subplot must have romance <= 0.20 and high darkness/crime.
- A feel-good family film must have heartwarming >= 0.75 and low darkness/violence.
- Do NOT hallucinate plot points not evidenced in the synopsis.
"""


class LocalQwenEngine:
    def __init__(
        self,
        model_path: str = "models/qwen2.5-3b-instruct-q4_k_m.gguf",
        server_port: int = 8080,
        n_ctx: int = 2048,
        n_gpu_layers: int = 35
    ):
        self.model_path = model_path
        self.server_port = server_port
        self.server_url = f"http://127.0.0.1:{server_port}"
        self.n_ctx = n_ctx
        self.n_gpu_layers = n_gpu_layers
        self.server_proc = None
        self.llm_cpu_fallback = None

        self._init_gpu_engine()

    def _init_gpu_engine(self):
        """Ensures GPU llama-server is healthy and running on NVIDIA GTX 1650."""
        if self._is_server_alive():
            print(f"[Qwen Engine: NVIDIA GTX 1650 GPU Active] Connected to running server at {self.server_url}.")
            return

        server_bin = os.path.join("runtime", "llama_bin", "llama-server.exe")
        if os.path.exists(server_bin) and os.path.exists(self.model_path):
            print(f"[Qwen Engine] Launching llama-server on NVIDIA GTX 1650 (layers={self.n_gpu_layers})...")
            cmd = [
                server_bin,
                "-m", self.model_path,
                "-ngl", str(self.n_gpu_layers),
                "--port", str(self.server_port),
                "--host", "127.0.0.1",
                "-c", str(self.n_ctx)
            ]
            self.server_proc = subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
            )

            # Wait for server to come up
            for _ in range(20):
                time.sleep(0.5)
                if self._is_server_alive():
                    print(f"[Qwen Engine: NVIDIA GTX 1650 GPU Active] Server ready at {self.server_url}!")
                    return

            print("[Qwen Engine Warning] GPU server launch timed out. Falling back to CPU.")

        # Fallback to local CPU if server not available
        self._init_cpu_fallback()

    def _is_server_alive(self) -> bool:
        if not requests:
            return False
        try:
            r = requests.get(f"{self.server_url}/health", timeout=1.5)
            return r.status_code == 200
        except Exception:
            return False

    def _init_cpu_fallback(self):
        if Llama is not None and os.path.exists(self.model_path):
            print("[Qwen Engine] Initializing CPU AVX2 fallback...")
            try:
                self.llm_cpu_fallback = Llama(
                    model_path=self.model_path,
                    n_ctx=self.n_ctx,
                    n_threads=4,
                    verbose=False
                )
            except Exception as e:
                print(f"[Qwen Engine] CPU fallback error: {e}")

    def analyze_title(self, title: str, year: Optional[int], media_type: str, evidence: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        synopsis = evidence.get("combined_synopsis", "").strip()
        keywords = evidence.get("keywords", [])[:15]
        genres = evidence.get("genres", [])
        directors = evidence.get("crew", {}).get("directors", [])
        cast = evidence.get("crew", {}).get("cast", [])[:5]

        user_content = f"""Title: {title} ({year or 'N/A'})
Media Type: {media_type}
Director: {', '.join(directors) if directors else 'Unknown'}
Cast: {', '.join(cast) if cast else 'Unknown'}
Known Genre Tags: {', '.join(genres) if genres else 'Unknown'}
Plot Keywords: {', '.join(keywords) if keywords else 'None'}
Factual Synopsis / Plot Evidence:
{synopsis[:1400] if synopsis else 'No synopsis available. Infer strictly from title and genre tags.'}
"""

        # 1. Try Fast GPU Inference First
        if self._is_server_alive():
            try:
                t0 = time.time()
                resp = requests.post(
                    f"{self.server_url}/v1/chat/completions",
                    json={
                        "messages": [
                            {"role": "system", "content": QWEN_SYSTEM_PROMPT},
                            {"role": "user", "content": user_content}
                        ],
                        "temperature": 0.1,
                        "max_tokens": 350
                    },
                    timeout=20
                )
                if resp.status_code == 200:
                    raw_text = resp.json()["choices"][0]["message"]["content"]
                    cleaned = self._clean_json_text(raw_text)
                    data = json.loads(cleaned)
                    if "primary_genre" in data and "scores" in data:
                        data["title"] = title
                        data["year"] = year
                        data["media_type"] = media_type
                        data["sources"] = evidence.get("sources", [])
                        data["confidence_score"] = 0.96
                        dt = time.time() - t0
                        print(f"       [GPU: GTX 1650 ({dt:.2f}s)] Analyzed '{title}' successfully.")
                        return data
            except Exception as e:
                pass

        # 2. Try CPU Fallback if GPU call failed
        if self.llm_cpu_fallback:
            try:
                prompt = f"<|im_start|>system\n{QWEN_SYSTEM_PROMPT}<|im_end|>\n<|im_start|>user\n{user_content}<|im_end|>\n<|im_start|>assistant\n"
                response = self.llm_cpu_fallback(
                    prompt,
                    max_tokens=320,
                    temperature=0.1,
                    top_p=0.9,
                    stop=["<|im_end|>", "```"]
                )
                raw_text = response["choices"][0]["text"].strip()
                cleaned = self._clean_json_text(raw_text)
                data = json.loads(cleaned)
                if "primary_genre" in data and "scores" in data:
                    data["title"] = title
                    data["year"] = year
                    data["media_type"] = media_type
                    data["sources"] = evidence.get("sources", [])
                    data["confidence_score"] = 0.95
                    print(f"       [CPU Fallback] Analyzed '{title}' successfully.")
                    return data
            except Exception:
                pass

        return None

    def _clean_json_text(self, text: str) -> str:
        text = re.sub(r"^```(?:json)?", "", text.strip(), flags=re.MULTILINE)
        text = re.sub(r"```$", "", text.strip(), flags=re.MULTILINE)
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1:
            return text[start:end+1]
        return text.strip()
