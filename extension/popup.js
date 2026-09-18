// State
let lastScrapedItems = [];
let missingItems = [];
let localLibraryTitles = new Set();

const pageStatusEl = document.getElementById('pageStatus');
const statusTextEl = document.getElementById('statusText');
const btnScrapeEl = document.getElementById('btnScrape');
const btnAutoScrollEl = document.getElementById('btnAutoScroll');
const btnNavigateNetflixEl = document.getElementById('btnNavigateNetflix');

const diffSectionEl = document.getElementById('diffSection');
const diffCountBadgeEl = document.getElementById('diffCountBadge');
const scrapedTotalEl = document.getElementById('scrapedTotal');
const missingCountEl = document.getElementById('missingCount');
const missingListEl = document.getElementById('missingList');

const btnDownloadJsonEl = document.getElementById('btnDownloadJson');
const btnCopyJsonEl = document.getElementById('btnCopyJson');
const btnSendToAppEl = document.getElementById('btnSendToApp');

function normalizeKey(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// 1. Check current tab URL
async function checkActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      updateStatus(false, 'Unable to inspect current tab.');
      return;
    }

    if (tab.url.includes('netflix.com/browse/my-list') || tab.url.includes('netflix.com')) {
      updateStatus(true, 'Ready on Netflix (' + (tab.url.includes('my-list') ? 'My List Page' : 'Netflix') + ')');
      btnNavigateNetflixEl.style.display = 'none';
    } else {
      updateStatus(false, 'Not on Netflix My List page');
      btnNavigateNetflixEl.style.display = 'block';
      btnNavigateNetflixEl.onclick = () => {
        chrome.tabs.create({ url: 'https://www.netflix.com/browse/my-list' });
      };
    }
  } catch (err) {
    updateStatus(false, 'Extension permissions checking...');
  }
}

function updateStatus(isOk, text) {
  pageStatusEl.className = 'page-status ' + (isOk ? 'success' : 'warning');
  statusTextEl.textContent = text;
}

// 2. Fetch known titles from the web app (either from active localhost/prod tab or prompt)
async function getExistingLibraryKeys() {
  const keys = new Set();

  try {
    // Check if user has the web app open in any tab
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) {
      if (t.url && (t.url.includes('localhost') || t.url.includes('netflix') || t.url.includes('127.0.0.1'))) {
        try {
          const res = await chrome.scripting.executeScript({
            target: { tabId: t.id },
            func: () => {
              // Try to read IndexedDB or localStorage
              const raw = localStorage.getItem('netflix_catalog_filters');
              return window.__NETFLIX_LIBRARY_ITEMS || null;
            }
          });
          if (res && res[0] && res[0].result && Array.isArray(res[0].result)) {
            res[0].result.forEach(item => {
              if (item.originalTitle) keys.add(normalizeKey(item.originalTitle));
              if (item.externalTitle) keys.add(normalizeKey(item.externalTitle));
            });
          }
        } catch {}
      }
    }
  } catch {}

  return keys;
}

// 3. Compare scraped items with existing library
async function processComparison(scrapedItems) {
  lastScrapedItems = scrapedItems;
  scrapedTotalEl.textContent = scrapedItems.length.toString();

  const existingKeys = await getExistingLibraryKeys();

  // Also check stored items in chrome storage if available
  const stored = await chrome.storage.local.get(['knownLibraryTitles']);
  if (stored && Array.isArray(stored.knownLibraryTitles)) {
    stored.knownLibraryTitles.forEach(t => existingKeys.add(normalizeKey(t)));
  }

  missingItems = [];
  scrapedItems.forEach(item => {
    const k = normalizeKey(item.title);
    if (!existingKeys.has(k)) {
      missingItems.push(item);
    }
  });

  missingCountEl.textContent = missingItems.length.toString();
  diffCountBadgeEl.textContent = `${missingItems.length} New`;

  // Render missing preview
  missingListEl.innerHTML = '';
  if (missingItems.length === 0) {
    missingListEl.innerHTML = '<div style="color: #34d399; padding: 4px;">All titles are already present in your Library!</div>';
  } else {
    missingItems.slice(0, 30).forEach(item => {
      const div = document.createElement('div');
      div.className = 'missing-item';
      div.innerHTML = `<span>${item.title}</span><span class="item-id">${item.videoId || ''}</span>`;
      missingListEl.appendChild(div);
    });
    if (missingItems.length > 30) {
      const more = document.createElement('div');
      more.style.padding = '4px';
      more.style.color = '#888';
      more.textContent = `...and ${missingItems.length - 30} more`;
      missingListEl.appendChild(more);
    }
  }

  diffSectionEl.style.display = 'flex';
}

// 4. Trigger scrape on active tab
btnScrapeEl.addEventListener('click', async () => {
  btnScrapeEl.disabled = true;
  btnScrapeEl.querySelector('span').textContent = 'Scraping titles...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: 'SCRAPE_MY_LIST' }, async (response) => {
      btnScrapeEl.disabled = false;
      btnScrapeEl.querySelector('span').textContent = 'Scrape My List Page';

      if (chrome.runtime.lastError || !response || !response.success) {
        updateStatus(false, 'Could not connect to Netflix page. Make sure you are on netflix.com/browse/my-list and refresh.');
        return;
      }

      updateStatus(true, `Successfully extracted ${response.count} titles!`);
      await processComparison(response.items);
    });
  } catch (err) {
    btnScrapeEl.disabled = false;
    btnScrapeEl.querySelector('span').textContent = 'Scrape My List Page';
    updateStatus(false, err.message);
  }
});

// 5. Trigger auto-scroll & deep scrape
btnAutoScrollEl.addEventListener('click', async () => {
  btnAutoScrollEl.disabled = true;
  btnAutoScrollEl.querySelector('span').textContent = 'Scrolling & loading all rows...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: 'AUTO_SCROLL_AND_SCRAPE', maxScrolls: 15 }, async (response) => {
      btnAutoScrollEl.disabled = false;
      btnAutoScrollEl.querySelector('span').textContent = 'Auto-Scroll & Deep Scrape';

      if (chrome.runtime.lastError || !response || !response.success) {
        updateStatus(false, 'Could not scroll Netflix page. Make sure the tab is open.');
        return;
      }

      updateStatus(true, `Deep extraction completed: ${response.count} titles found!`);
      await processComparison(response.items);
    });
  } catch (err) {
    btnAutoScrollEl.disabled = false;
    btnAutoScrollEl.querySelector('span').textContent = 'Auto-Scroll & Deep Scrape';
    updateStatus(false, err.message);
  }
});

// 6. Download JSON
btnDownloadJsonEl.addEventListener('click', () => {
  const data = missingItems.length > 0 ? missingItems : lastScrapedItems;
  const jsonBlob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(jsonBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `netflix-my-list-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// 7. Copy JSON
btnCopyJsonEl.addEventListener('click', () => {
  const data = missingItems.length > 0 ? missingItems : lastScrapedItems;
  navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  const orig = btnCopyJsonEl.querySelector('span').textContent;
  btnCopyJsonEl.querySelector('span').textContent = 'Copied to Clipboard!';
  setTimeout(() => {
    btnCopyJsonEl.querySelector('span').textContent = orig;
  }, 1800);
});

// 8. Direct sync to open web app tab
btnSendToAppEl.addEventListener('click', async () => {
  const itemsToSend = missingItems.length > 0 ? missingItems : lastScrapedItems;
  if (itemsToSend.length === 0) return;

  const tabs = await chrome.tabs.query({});
  let appTab = tabs.find(t => t.url && (t.url.includes('localhost') || t.url.includes('5173') || t.url.includes('netflix-my-list')));

  if (appTab) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: appTab.id },
        args: [itemsToSend],
        func: (items) => {
          window.postMessage({
            type: 'NETFLIX_EXTENSION_SYNC',
            items: items
          }, '*');
        }
      });
      btnSendToAppEl.querySelector('span').textContent = 'Synced Directly!';
      await chrome.tabs.update(appTab.id, { active: true });
    } catch (e) {
      // Fallback: Copy to clipboard and focus
      navigator.clipboard.writeText(JSON.stringify(itemsToSend, null, 2));
      btnSendToAppEl.querySelector('span').textContent = 'Copied! Paste in Import Tab';
      await chrome.tabs.update(appTab.id, { active: true });
    }
  } else {
    // If app tab not found, copy JSON and open localhost:5173
    navigator.clipboard.writeText(JSON.stringify(itemsToSend, null, 2));
    chrome.tabs.create({ url: 'http://localhost:5173/?tab=import' });
  }
});

// Initialize
checkActiveTab();
