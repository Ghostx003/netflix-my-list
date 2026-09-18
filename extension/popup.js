// State
let lastScrapedItems = [];
let missingItems = [];
let localLibraryTitles = new Set();

const pageStatusEl = document.getElementById('pageStatus');
const statusTextEl = document.getElementById('statusText');
const btnAutoSlideEl = document.getElementById('btnAutoSlide');
const btnScrapeVisibleEl = document.getElementById('btnScrapeVisible');
const btnNavigateNetflixEl = document.getElementById('btnNavigateNetflix');
const numSlidePagesEl = document.getElementById('numSlidePages');

const diffSectionEl = document.getElementById('diffSection');
const diffCountBadgeEl = document.getElementById('diffCountBadge');
const scrapedTotalEl = document.getElementById('scrapedTotal');
const missingCountEl = document.getElementById('missingCount');

const tabMissingEl = document.getElementById('tabMissing');
const tabAllEl = document.getElementById('tabAll');
const tabMissingCountEl = document.getElementById('tabMissingCount');
const tabAllCountEl = document.getElementById('tabAllCount');
const titlesListEl = document.getElementById('titlesList');
const listHintTextEl = document.getElementById('listHintText');

const chkAutoExportEl = document.getElementById('chkAutoExport');
const btnDownloadJsonEl = document.getElementById('btnDownloadJson');
const btnCopyJsonEl = document.getElementById('btnCopyJson');
const btnSendToAppEl = document.getElementById('btnSendToApp');

let activeTab = 'missing'; // 'missing' | 'all'

function normalizeKey(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// 1. Check current tab URL and whether "My List" container is present
async function checkActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      updateStatus(false, 'Unable to inspect current tab.');
      return;
    }

    if (tab.url.includes('netflix.com')) {
      btnNavigateNetflixEl.style.display = 'none';

      // Ask content script if "My List" row is currently detected
      try {
        chrome.tabs.sendMessage(tab.id, { action: 'CHECK_MY_LIST_CONTAINER' }, (response) => {
          if (chrome.runtime.lastError || !response) {
            updateStatus(true, 'Ready on Netflix. Make sure "My List" row is loaded on page.');
            return;
          }

          if (response.found) {
            const countText = response.capturedCount > 0 ? ` (${response.capturedCount} captured so far)` : '';
            updateStatus(true, `✓ "My List" row detected & active!${countText}`);
            // If items already accumulated in content script, show them
            if (response.capturedCount > 0) {
              chrome.tabs.sendMessage(tab.id, { action: 'SCRAPE_MY_LIST' }, (scrapeRes) => {
                if (scrapeRes && scrapeRes.success && scrapeRes.items) {
                  processComparison(scrapeRes.items);
                }
              });
            }
          } else {
            updateStatus(false, 'Looking for "My List" row on page... Please scroll until "My List" appears or click button below.');
            btnNavigateNetflixEl.style.display = 'block';
            btnNavigateNetflixEl.onclick = () => {
              chrome.tabs.create({ url: 'https://www.netflix.com/browse/my-list' });
            };
          }
        });
      } catch {
        updateStatus(true, 'Ready on Netflix.');
      }
    } else {
      updateStatus(false, 'Not on Netflix website');
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

// 2. Fetch existing titles from the web app
async function getExistingLibraryKeys() {
  const keys = new Set();

  try {
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) {
      if (t.url && (t.url.includes('localhost') || t.url.includes('netflix') || t.url.includes('127.0.0.1') || t.url.includes('vercel.app'))) {
        try {
          const res = await chrome.scripting.executeScript({
            target: { tabId: t.id },
            func: () => {
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
      ? '✓ All My List titles are already in your Library!'
      : 'No titles scraped yet. Click Auto-Slide or Capture button.';
    titlesListEl.appendChild(emptyMsg);
    return;
  }

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

  // Automatically export if enabled
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
      updateStatus(true, `Synced ${itemsToSend.length} titles directly to Web App!`);
    } catch (e) {
      navigator.clipboard.writeText(JSON.stringify(itemsToSend, null, 2));
      if (btnTextEl) btnTextEl.textContent = `Copied ${itemsToSend.length} titles to Clipboard!`;
    }
  } else {
    navigator.clipboard.writeText(JSON.stringify(itemsToSend, null, 2));
    if (btnTextEl) btnTextEl.textContent = `Copied! Opening Web App...`;
    chrome.tabs.create({ url: 'http://localhost:5173/?tab=import' });
  }

  setTimeout(() => {
    if (btnTextEl) btnTextEl.textContent = originalText;
  }, 3000);
}

// 4. Listen for progress updates from content script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'SCRAPE_PROGRESS' && msg.message) {
    updateStatus(true, msg.message);
  }
});

// 5. Trigger Auto-Slide & Scrape
if (btnAutoSlideEl) {
  btnAutoSlideEl.addEventListener('click', async () => {
    btnAutoSlideEl.disabled = true;
    const maxPages = parseInt(numSlidePagesEl?.value) || 10;
    btnAutoSlideEl.querySelector('span').textContent = `Sliding My List (max ${maxPages} pages)...`;
    updateStatus(true, `Initiating horizontal slider scan across My List...`);

    // Save page limit preference
    try {
      chrome.storage.local.set({ slidePageLimit: maxPages });
    } catch {}

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      chrome.tabs.sendMessage(tab.id, { action: 'AUTO_SLIDE_MY_LIST', maxPages }, async (response) => {
        btnAutoSlideEl.disabled = false;
        btnAutoSlideEl.querySelector('span').textContent = 'Auto-Slide & Deep Scrape';

        if (chrome.runtime.lastError || !response || !response.success) {
          const err = response?.error || 'Could not auto-slide. Make sure you are on Netflix and the "My List" row is visible.';
          updateStatus(false, err);
          return;
        }

        updateStatus(true, `Extraction complete: ${response.count} My List titles extracted!`);
        await processComparison(response.items);
      });
    } catch (err) {
      btnAutoSlideEl.disabled = false;
      btnAutoSlideEl.querySelector('span').textContent = 'Auto-Slide & Deep Scrape';
      updateStatus(false, err.message);
    }
  });
}

// 6. Trigger Scrape Visible Titles
if (btnScrapeVisibleEl) {
  btnScrapeVisibleEl.addEventListener('click', async () => {
    btnScrapeVisibleEl.disabled = true;
    btnScrapeVisibleEl.querySelector('span').textContent = 'Capturing titles...';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      chrome.tabs.sendMessage(tab.id, { action: 'SCRAPE_MY_LIST' }, async (response) => {
        btnScrapeVisibleEl.disabled = false;
        btnScrapeVisibleEl.querySelector('span').textContent = 'Capture Visible Titles Now';

        if (chrome.runtime.lastError || !response || !response.success) {
          const err = response?.error || 'Could not find "My List" row. Make sure "My List" is in view and refresh.';
          updateStatus(false, err);
          return;
        }

        updateStatus(true, `Captured ${response.count} My List titles!`);
        await processComparison(response.items);
      });
    } catch (err) {
      btnScrapeVisibleEl.disabled = false;
      btnScrapeVisibleEl.querySelector('span').textContent = 'Capture Visible Titles Now';
      updateStatus(false, err.message);
    }
  });
}

// Load saved preferences
try {
  chrome.storage.local.get(['slidePageLimit'], (res) => {
    if (res && res.slidePageLimit && numSlidePagesEl) {
      numSlidePagesEl.value = res.slidePageLimit;
    }
  });
} catch {}

// 7. Download JSON
btnDownloadJsonEl?.addEventListener('click', () => {
  const data = missingItems.length > 0 ? missingItems : lastScrapedItems;
  const jsonBlob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(jsonBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `netflix-my-list-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// 8. Copy JSON
btnCopyJsonEl?.addEventListener('click', () => {
  const data = missingItems.length > 0 ? missingItems : lastScrapedItems;
  navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  const orig = btnCopyJsonEl.querySelector('span').textContent;
  btnCopyJsonEl.querySelector('span').textContent = 'Copied!';
  setTimeout(() => {
    btnCopyJsonEl.querySelector('span').textContent = orig;
  }, 1800);
});

// 9. Direct sync to open web app tab button
btnSendToAppEl?.addEventListener('click', async () => {
  const itemsToSend = missingItems.length > 0 ? missingItems : lastScrapedItems;
  await exportDirectlyToApp(itemsToSend, false);
});

// Initialize
checkActiveTab();
