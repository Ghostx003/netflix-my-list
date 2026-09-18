# Netflix My List Exporter & Sync Chrome Extension

A Chrome Manifest V3 extension tailored specifically for **Netflix Watchlist Command Center**. It searches and scrapes your complete Netflix "My List" collection directly from Netflix, extracts rich metadata, compares it against your existing local catalog, and imports any missing titles directly into the web app with a single click.

---

## 🌟 Key Features

1. **One-Click My List Scraping**:
   - Scrapes title, official numeric `videoId`, synopsis/overview, poster art, maturity rating, and duration from `https://www.netflix.com/browse/my-list`.
2. **Deep Auto-Scroll Engine**:
   - Netflix lazy-loads cards as you scroll down. The "Auto-Scroll & Deep Scrape" button automatically triggers progressive scroll cycles to uncover your full backlog.
3. **Smart Duplicate & Difference Checker**:
   - Automatically checks and compares scraped titles against your currently open Web App tab / IndexedDB library.
   - Highlights only the **New / Missing** items ready to be added so you never import duplicates.
4. **Direct Web App Sync**:
   - Click **"Sync Directly into Web App"** to broadcast the missing titles into the running web app tab without needing manual file uploads.
   - Also provides **"Download JSON"** and **"Copy JSON"** buttons for offline backups.

---

## 🚀 How to Install in Chrome / Edge / Brave

1. Open your Chromium browser (Chrome, Edge, Brave, Opera, Arc).
2. Go to **`chrome://extensions/`** in your URL bar.
3. In the top-right corner, turn on **Developer mode**.
4. Click **Load unpacked** in the top-left.
5. Select the **`extension`** folder inside this project directory (`e:\projects\netflix my list\extension`).
6. The **Netflix My List Sync** extension icon will now appear in your browser toolbar!

---

## 🎬 How to Use

1. Open [netflix.com/browse/my-list](https://www.netflix.com/browse/my-list) in your browser and sign in.
2. Click the **Netflix My List Sync** extension icon.
3. Click **"Auto-Scroll & Deep Scrape"** to let the extension load all rows and extract your titles.
4. Review the comparison badge showing **New / Missing** titles.
5. Click **"Sync Directly into Web App"** (or download the `.json` and drop it into the web app's Library tab).
