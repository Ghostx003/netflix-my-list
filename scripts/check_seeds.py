with open("src/services/discoveryService.ts", "r", encoding="utf-8") as f:
    lines = f.readlines()

seed_lines = lines[10:1639]
seed_text = "".join(seed_lines)

import re
titles = re.findall(r"title:\s*['\"]([^'\"]+)['\"]", seed_text)
print(f"Titles in SEED_NETFLIX_INDIA_TITLES: {len(titles)}")
for t in titles[:10]:
    print(" -", t)
