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

// Tab state
let activeTab = 'missing'; // 'missing' | 'all'

const tabMissingEl = document.getElementById('tabMissing');
const tabAllEl = document.getElementById('tabAll');
const tabMissingCountEl = document.getElementById('tabMissingCount');
const tabAllCountEl = document.getElementById('tabAllCount');
const titlesListEl = document.getElementById('titlesList');
const listHintTextEl = document.getElementById('listHintText');

const chkAutoExportEl = document.getElementById('chkAutoExport');

function renderTitlesList() {
  if (!titlesListEl) return;
  titlesListEl.innerHTML = '';

  const isMissingTab = activeTab === 'missing';
  const listToRender = isMissingTab ? missingItems : lastScrapedItems;

  if (listToRender.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.style.padding = '12px 8px';
    emptyMsg.style.textAlign = 'center';
    emptyMsg.style.color = isMissingTab ? '#34d399' : '#888';
    emptyMsg.textContent = isMissingTab 
      ? '✓ All titles are already in your Library!'
      : 'No titles scraped yet. Click Scrape button above.';
    titlesListEl.appendChild(emptyMsg);
    return;
  }

  // Create list rows with full extracted metadata details
  listToRender.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'title-row';

    const isMissing = missingItems.some(m => normalizeKey(m.title) === normalizeKey(item.title));

    const infoDiv = document.createElement('div');
    infoDiv.className = 'title-info';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'title-name';
    nameSpan.title = item.title;
    nameSpan.textContent = `${index + 1}. ${item.title}`;

    const detailsSpan = document.createElement('span');
    detailsSpan.className = 'title-details';
    
    // Assemble extracted details (duration, maturity rating, video ID, synopsis)
    const detailParts = [];
    if (item.duration) detailParts.push(item.duration);
    if (item.maturityRating) detailParts.push(item.maturityRating);
    if (item.videoId) detailParts.push(`ID: ${item.videoId}`);
    if (item.synopsis) {
      detailParts.push(item.synopsis.length > 50 ? item.synopsis.substring(0, 50) + '...' : item.synopsis);
    }
    detailsSpan.textContent = detailParts.length > 0 ? detailParts.join(' • ') : 'Ready to export';

    infoDiv.appendChild(nameSpan);
    infoDiv.appendChild(detailsSpan);

    const badge = document.createElement('span');
    badge.className = `meta-tag ${isMissing ? 'new' : 'existing'}`;
    badge.textContent = isMissing ? 'NEW' : 'IN LIBRARY';

    row.appendChild(infoDiv);
    row.appendChild(badge);
    titlesListEl.appendChild(row);
  });
}

// Tab click listeners
if (tabMissingEl) {
  tabMissingEl.addEventListener('click', () => {
    activeTab = 'missing';
    tabMissingEl.classList.add('active');
    tabAllEl?.classList.remove('active');
    if (listHintTextEl) {
      listHintTextEl.textContent = `${missingItems.length} new to import`;
    }
    renderTitlesList();
  });
}

if (tabAllEl) {
  tabAllEl.addEventListener('click', () => {
    activeTab = 'all';
    tabAllEl.classList.add('active');
    tabMissingEl?.classList.remove('active');
    if (listHintTextEl) {
      listHintTextEl.textContent = `${lastScrapedItems.length} total captured`;
    }
    renderTitlesList();
  });
}

// 3. Compare scraped items with existing library
async function processComparison(scrapedItems) {
  lastScrapedItems = scrapedItems;
  if (scrapedTotalEl) scrapedTotalEl.textContent = scrapedItems.length.toString();

  const existingKeys = await getExistingLibraryKeys();

  // Safely check storage if available
  try {
    if (chrome && chrome.storage && chrome.storage.local) {
      const stored = await chrome.storage.local.get(['knownLibraryTitles']);
      if (stored && Array.isArray(stored.knownLibraryTitles)) {
        stored.knownLibraryTitles.forEach(t => existingKeys.add(normalizeKey(t)));
      }
    }
  } catch (err) {
    console.warn('Storage read fallback:', err);
  }

  missingItems = [];
  scrapedItems.forEach(item => {
    const k = normalizeKey(item.title);
    if (!existingKeys.has(k)) {
      missingItems.push(item);
    }
  });

  if (missingCountEl) missingCountEl.textContent = missingItems.length.toString();
  if (diffCountBadgeEl) diffCountBadgeEl.textContent = `${missingItems.length} New`;
  if (tabMissingCountEl) tabMissingCountEl.textContent = missingItems.length.toString();
  if (tabAllCountEl) tabAllCountEl.textContent = scrapedItems.length.toString();

  // Default tab: if new items exist, show 'missing', otherwise show 'all'
  if (missingItems.length > 0) {
    activeTab = 'missing';
    tabMissingEl?.classList.add('active');
    tabAllEl?.classList.remove('active');
    if (listHintTextEl) listHintTextEl.textContent = `${missingItems.length} new to import`;
  } else {
    activeTab = 'all';
    tabAllEl?.classList.add('active');
    tabMissingEl?.classList.remove('active');
    if (listHintTextEl) listHintTextEl.textContent = 'All synced';
  }

  renderTitlesList();

  if (diffSectionEl) diffSectionEl.style.display = 'flex';

  // Automatically export to web app if option is enabled
  if (chkAutoExportEl && chkAutoExportEl.checked) {
    const itemsToAutoExport = missingItems.length > 0 ? missingItems : scrapedItems;
    if (itemsToAutoExport.length > 0) {
      exportDirectlyToApp(itemsToAutoExport, true);
    }
  }
}

// Core export helper
async function exportDirectlyToApp(itemsToSend, isAuto = false) {
  if (!itemsToSend || itemsToSend.length === 0) return;

  const btnTextEl = document.getElementById('btnSendToAppText') || btnSendToAppEl.querySelector('span');
  const originalText = btnTextEl ? btnTextEl.textContent : 'Export Directly to Web App';

  const tabs = await chrome.tabs.query({});
  // Match localhost, 5173, vercel app, or custom domain
  let appTab = tabs.find(t => t.url && (
    t.url.includes('localhost') || 
    t.url.includes('5173') || 
    t.url.includes('127.0.0.1') ||
    t.url.includes('vercel.app') || 
    t.url.includes('netflix-my-list')
  ));

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

      const message = isAuto 
        ? `Auto-Exported ${itemsToSend.length} titles to Web App!` 
        : `Exported ${itemsToSend.length} titles to Web App!`;

      if (btnTextEl) btnTextEl.textContent = message;
      updateStatus(true, `Synced ${itemsToSend.length} titles directly to Web App tab!`);
    } catch (e) {
      // Fallback: Copy to clipboard
      navigator.clipboard.writeText(JSON.stringify(itemsToSend, null, 2));
      if (btnTextEl) btnTextEl.textContent = `Copied ${itemsToSend.length} titles to Clipboard!`;
    }
  } else {
    // If app tab not found, copy JSON and open app
    navigator.clipboard.writeText(JSON.stringify(itemsToSend, null, 2));
    if (btnTextEl) btnTextEl.textContent = `Copied! Opening Web App...`;
    chrome.tabs.create({ url: 'http://localhost:5173/?tab=import' });
  }

  setTimeout(() => {
    if (btnTextEl) btnTextEl.textContent = originalText;
  }, 3000);
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

      updateStatus(true, `Extracted ${response.count} titles with details!`);
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

      updateStatus(true, `Deep extraction completed: ${response.count} titles extracted!`);
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

// 8. Direct sync to open web app tab button
btnSendToAppEl.addEventListener('click', async () => {
  const itemsToSend = missingItems.length > 0 ? missingItems : lastScrapedItems;
  await exportDirectlyToApp(itemsToSend, false);
});

// Initialize
checkActiveTab();
