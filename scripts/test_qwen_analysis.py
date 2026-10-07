import time
import json
from scripts.enrichment.qwen_engine import LocalQwenEngine
from scripts.enrichment.research_agent import WebResearchAgent

print("Testing LocalQwenEngine on 'Interstellar'...")
agent = WebResearchAgent()
evidence = agent.research_title("Interstellar", 2014, "movie")

qwen = LocalQwenEngine()
t0 = time.time()
profile = qwen.analyze_title("Interstellar", 2014, "movie", evidence)
elapsed = time.time() - t0

print(f"Analysis completed in {elapsed:.2f} seconds:")
print(json.dumps(profile, indent=2))
