# 🍿 Netflix Watchlist Analytics

> **Your Personal Netflix Command Center**  
> An ultra-responsive, cinematic web application built with **React 19**, **TypeScript**, **Vite**, and **Tailwind CSS**. Import your Netflix "My List" export, automatically identify titles with a cascading live multi-API pipeline, track granular watch progress, and calculate exactly how long it takes to clear your backlog at accelerated playback speeds.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)
![React 19](https://img.shields.io/badge/React-19-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)
![Vite](https://img.shields.io/badge/Vite-8.3-646CFF.svg)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC.svg)
![IndexedDB](https://img.shields.io/badge/Storage-IndexedDB-orange.svg)
![Vercel Ready](https://img.shields.io/badge/Deploy-Vercel-black.svg)

---

## ✨ Key Features

### 1. 📥 Effortless JSON Import & Deduplication
- Paste raw JSON or drop exported Netflix list files (e.g. `[{"title": "Dark", "videoId": "80100172"}]`).
- Smart title normalization strips foreign characters, punctuation, casing, and Netflix-specific subtitles.
- In-flight duplicate detection prevents clutter across multiple imports while preserving existing watch progress.

### 2. ⚡ Real-Time Multi-API Metadata & Poster Pipeline
- **Zero hardcoding** — metadata is dynamically queried from external endpoints:
  - **TMDB (The Movie Database)**: High-resolution backdrop & posters, plot overviews, release years, and trailer videos.
  - **OMDb API**: Rotten Tomatoes percentages, IMDb ratings, and precise movie/episode runtimes.
  - **TVMaze Public API** (No API Key Required): Automatic fallback for missing series posters and season counts.
  - **Wikipedia REST API** (No API Key Required): Fallback for high-resolution theatrical posters and plot extracts.

### 3. 🎬 Enhanced Trailer Discovery
- Multi-language query matching (`en, hi, es, de, null`) discovers trailers for international Netflix originals (*Dark*, *Money Heist*, *Narcos*).
- Automatic **Season 1 video discovery** finds official season trailers for TV shows that lack series-level videos (e.g., *Breaking Bad*).
- One-click **"Search Trailer on YouTube"** integration for any un-embedded titles.

### 4. 📺 Still Watching Queue
- Track active viewing with interactive progress sliders.
- **TV Series**: Episode-level stepper and slider (e.g. `Season 2 • Episode 5 / 13`).
- **Movies**: Minute-level progress tracker (e.g. `73 / 108 min`).
- Dynamic remaining runtime calculations and celebration confetti when marking completed.

### 5. 🗄️ Dropped Archive
- Log dropped titles with predefined reasons (*Too boring*, *Too slow*, *Lost interest*, *Didn't like the story*, etc.) plus personal notes.
- Filter by reason or restore any title back to the library or active queue in one click.

### 6. 🎲 Surprise Me Roulette
- Can't decide what to watch next? Spin the streaming roulette with configurable candidate pools (*All*, *Movies*, *TV*, *Unwatched*, *Still Watching*).
- Filter candidate pool by genre and automatically exclude dropped titles.

### 7. 🔍 Multi-Select Categories & Filters
- Dynamic genre picker supporting match condition toggles: **ANY** (OR) vs. **ALL** (AND).
- Country multi-select filter populated dynamically from production origins.
- Year range slider and minimum score filters.
- Real-time sorting: *Rotten Tomatoes (High to Low)*, *IMDb Rating*, *Duration (Longest to Shortest)*, *Release Year*, and *Recently Added*.

### 8. ⏱️ Playback Speed & Daily Viewing Analytics
- Interactive calculation of total library duration.
- Configurable **Playback Speed Multiplier** (e.g., `1.0×`, `1.25×`, `1.5×`, `1.75×`, `2.0×`).
- Custom daily watching hours, daily gym sessions, and meal hour offsets.
- Calculates your exact **Finish Date** and days required.

### 9. 💾 Persistent Local Storage & Full Backup
- All library records and metadata are persisted in browser **IndexedDB** (`NetflixWatchlistDB`).
- Export full JSON backups anytime (`netflix-watchlist-backup-*.json`).
- Restore with **Merge** (add new without overwriting progress) or **Replace Everything** modes.

---

## 📱 Mobile Responsiveness

The application is built mobile-first with extensive media queries and responsive styling:
- **Sticky Netflix Header**: Collapses seamlessly into a bottom navigation tab bar on mobile and tablet devices (`<1280px`).
- **Responsive Media Grids**: Dynamically scales from 2 columns on mobile screens up to 6 columns on wide monitors.
- **Touch-Friendly Controls**: Large sliders, modal tap targets, and full touch support for progress tracking.
- **Safe Area Support**: Uses `viewport-fit=cover` and mobile viewport optimizations for iOS Safari and Android Chrome.

---

## 🚀 Getting Started Locally

### Prerequisites
- Node.js (v18 or higher)
- npm or pnpm

### Installation

```bash
# 1. Clone repository
git clone https://github.com/Ghostx003/netflix-my-list.git
cd netflix-my-list

# 2. Install dependencies
npm install

# 3. Start local development server
npm run dev
```

Visit `http://localhost:5173` in your browser.

---

## 🌐 Deploy to Vercel

This repository includes a production-ready `vercel.json` with Single-Page Application (SPA) rewrites and static asset caching.

### Option A: One-Click Deploy
Click the button below to fork and deploy directly:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Ghostx003/netflix-my-list)

### Option B: Vercel CLI
```bash
npm i -g vercel
vercel
```

---

## 🏷️ Technologies & Tags

`#React19` `#TypeScript` `#Vite` `#TailwindCSS` `#IndexedDB` `#Vercel` `#MobileResponsive` `#TMDB` `#OMDb` `#TVMaze` `#NetflixWatchlist`

---

## 📄 License

MIT License © 2026 Ghostx003. Made with ❤️ for binge-watchers.
