// Netflix My List Sync - Popup Controller
let capturedItems = [];
let localLibraryKeys = new Set();
let sessionAddedKeys = new Set();
let isCapturingActive = false;

// UI Elements
const pageStatusEl = document.getElementById('pageStatus');
const statusTextEl = document.getElementById('statusText');
const btnToggleCaptureEl = document.getElementById('btnToggleCapture');
const captureBtnTextEl = document.getElementById('captureBtnText');
const btnRefreshListEl = document.getElementById('btnRefreshList');
const btnClearListEl = document.getElementById('btnClearList');
const btnNavigateNetflixEl = document.getElementById('btnNavigateNetflix');

const capturedBadgeEl = document.getElementById('capturedBadge');
const newCountHintEl = document.getElementById('newCountHint');
const titlesListEl = document.getElementById('titlesList');
const bottomActionsEl = document.getElementById('bottomActions');
const btnAddAllEl = document.getElementById('btnAddAll');
const btnAddAllTextEl = document.getElementById('btnAddAllText');
const btnDownloadJsonEl = document.getElementById('btnDownloadJson');
const btnCopyJsonEl = document.getElementById('btnCopyJson');

function normalizeKey(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function updateStatus(isOk, text) {
  pageStatusEl.className = 'page-status ' + (isOk ? 'success' : 'warning');
  statusTextEl.textContent = text;
}

// Check current tab and restore live status
async function initTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      updateStatus(false, 'Unable to inspect current tab.');
      return;
    }

    if (!tab.url.includes('netflix.com')) {
      updateStatus(false, 'Please navigate to Netflix');
      btnNavigateNetflixEl.style.display = 'block';
      btnNavigateNetflixEl.onclick = () => {
        chrome.tabs.create({ url: 'https://www.netflix.com/browse/my-list' });
      };
      return;
    }

    btnNavigateNetflixEl.style.display = 'none';

    // Fetch existing keys from web app first
    await fetchExistingLibraryKeys();

    // Query content script
    chrome.tabs.sendMessage(tab.id, { action: 'GET_STATUS' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        // Fallback to storage
        loadFromStorage();
        updateStatus(true, 'Ready on Netflix. Make sure "My List" row is loaded.');
        return;
      }

      isCapturingActive = response.isCapturing;
      updateCaptureButtonUI();

      if (response.containerFound) {
        updateStatus(true, isCapturingActive
          ? '🟢 Capturing My List: Scroll or slide through your My List row!'
          : '✓ "My List" section detected & ready');
      } else {
        updateStatus(false, 'Looking for "My List" row... Please scroll down on Netflix until My List appears.');
      }

      if (Array.isArray(response.items)) {
        capturedItems = response.items;
        renderResults();
      }
    });
  } catch (err) {
    updateStatus(false, 'Connection note: ' + err.message);
  }
}

function loadFromStorage() {
  chrome.storage.local.get(['nmlCapturedItems', 'nmlIsCapturing'], (res) => {
    if (res && Array.isArray(res.nmlCapturedItems)) {
      capturedItems = res.nmlCapturedItems;
    }
    if (res && res.nmlIsCapturing) {
      isCapturingActive = true;
    }
    updateCaptureButtonUI();
    renderResults();
  });
}

function updateCaptureButtonUI() {
  if (isCapturingActive) {
    btnToggleCaptureEl.className = 'btn btn-capture stop';
    captureBtnTextEl.textContent = 'Stop Capturing';
  } else {
    btnToggleCaptureEl.className = 'btn btn-capture start';
    captureBtnTextEl.textContent = 'Start Capturing';
  }
}

// Fetch existing keys from active web app tabs
async function fetchExistingLibraryKeys() {
  localLibraryKeys.clear();
  try {
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) {
      if (t.url && (t.url.includes('localhost') || t.url.includes('netflix') || t.url.includes('127.0.0.1') || t.url.includes('vercel.app'))) {
        try {
          const res = await chrome.scripting.executeScript({
            target: { tabId: t.id },
            func: () => window.__NETFLIX_LIBRARY_ITEMS || null
          });
          if (res && res[0] && res[0].result && Array.isArray(res[0].result)) {
            res[0].result.forEach(item => {
              if (item.originalTitle) localLibraryKeys.add(normalizeKey(item.originalTitle));
              if (item.externalTitle) localLibraryKeys.add(normalizeKey(item.externalTitle));
            });
          }
        } catch {}
      }
    }
  } catch {}
}

// Render Results List with individual "Add" buttons
function renderResults() {
  capturedBadgeEl.textContent = capturedItems.length.toString();

  if (capturedItems.length === 0) {
    titlesListEl.innerHTML = `
      <div class="empty-placeholder">
        Click <strong>Start Capturing</strong>, then slide or scroll your "My List" row on Netflix. New items will appear here!
      </div>
    `;
    newCountHintEl.textContent = '0 new to add';
    bottomActionsEl.style.display = 'none';
    return;
  }

  titlesListEl.innerHTML = '';
  let newTitlesCount = 0;

  capturedItems.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'title-row';

    const k = normalizeKey(item.title);
    const inLibrary = localLibraryKeys.has(k);
    const alreadyAdded = sessionAddedKeys.has(k);

    const infoDiv = document.createElement('div');
    infoDiv.className = 'title-info';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'title-name';
    nameSpan.title = item.title;
    nameSpan.textContent = `${index + 1}. ${item.title}`;

    const detailsSpan = document.createElement('span');
    detailsSpan.className = 'title-details';
    const parts = [];
    if (item.duration) parts.push(item.duration);
    if (item.maturityRating) parts.push(item.maturityRating);
    if (item.videoId) parts.push(`ID: ${item.videoId}`);
    if (item.synopsis) {
      parts.push(item.synopsis.length > 40 ? item.synopsis.substring(0, 40) + '...' : item.synopsis);
    }
    detailsSpan.textContent = parts.length > 0 ? parts.join(' • ') : 'From My List';

    infoDiv.appendChild(nameSpan);
    infoDiv.appendChild(detailsSpan);
    row.appendChild(infoDiv);

    // Right Action: Add button or In Library badge
    if (inLibrary && !alreadyAdded) {
      const tag = document.createElement('span');
      tag.className = 'meta-tag existing';
      tag.textContent = 'IN LIBRARY';
      row.appendChild(tag);
    } else if (alreadyAdded) {
      const btn = document.createElement('button');
      btn.className = 'btn-add-item added';
      btn.disabled = true;
      btn.textContent = 'Added ✓';
      row.appendChild(btn);
    } else {
      newTitlesCount++;
      const btn = document.createElement('button');
      btn.className = 'btn-add-item';
      btn.textContent = '+ Add';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Adding...';
        await exportItemsToApp([item]);
        sessionAddedKeys.add(k);
        btn.className = 'btn-add-item added';
        btn.textContent = 'Added ✓';
        renderResults();
      });
      row.appendChild(btn);
    }

    titlesListEl.appendChild(row);
  });

  newCountHintEl.textContent = `${newTitlesCount} new to add`;

  if (capturedItems.length > 0) {
    bottomActionsEl.style.display = 'flex';
    if (newTitlesCount > 0) {
      btnAddAllEl.disabled = false;
      btnAddAllTextEl.textContent = `Add All (${newTitlesCount}) New Titles to Web App`;
    } else {
      btnAddAllEl.disabled = true;
      btnAddAllTextEl.textContent = 'All Titles Already in Library ✓';
    }
  } else {
    bottomActionsEl.style.display = 'none';
  }
}

// Export items to web app tab
async function exportItemsToApp(itemsToSend) {
  if (!itemsToSend || itemsToSend.length === 0) return;

  const tabs = await chrome.tabs.query({});
  const appTab = tabs.find(t => t.url && (
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
      updateStatus(true, `Successfully added ${itemsToSend.length} title(s) to Web App!`);
    } catch {
      navigator.clipboard.writeText(JSON.stringify(itemsToSend, null, 2));
      updateStatus(true, `Copied ${itemsToSend.length} item(s) to clipboard!`);
    }
  } else {
    navigator.clipboard.writeText(JSON.stringify(itemsToSend, null, 2));
    updateStatus(true, `Copied to clipboard! Opening Web App...`);
    chrome.tabs.create({ url: 'http://localhost:5173/?tab=import' });
  }
}

// Toggle Capture Button
btnToggleCaptureEl.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  const action = isCapturingActive ? 'STOP_CAPTURING' : 'START_CAPTURING';

  chrome.tabs.sendMessage(tab.id, { action }, (response) => {
    if (chrome.runtime.lastError || !response) {
      updateStatus(false, 'Make sure Netflix is open and refresh the tab.');
      return;
    }

    isCapturingActive = !isCapturingActive;
    updateCaptureButtonUI();

    if (isCapturingActive) {
      updateStatus(true, '🟢 Capturing My List: Now manually slide or scroll the My List row on Netflix!');
    } else {
      updateStatus(true, `Capture stopped. ${response.count || 0} My List titles captured!`);
    }

    if (Array.isArray(response.items)) {
      capturedItems = response.items;
      renderResults();
    }
  });
});

// Refresh button
btnRefreshListEl.addEventListener('click', async () => {
  btnRefreshListEl.disabled = true;
  await fetchExistingLibraryKeys();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'GET_STATUS' }, (res) => {
      btnRefreshListEl.disabled = false;
      if (res && Array.isArray(res.items)) {
        capturedItems = res.items;
        isCapturingActive = res.isCapturing;
        updateCaptureButtonUI();
        renderResults();
        updateStatus(true, `Refreshed: ${capturedItems.length} My List titles loaded.`);
      }
    });
  } else {
    loadFromStorage();
    btnRefreshListEl.disabled = false;
  }
});

// Clear list button
btnClearListEl.addEventListener('click', async () => {
  if (capturedItems.length === 0) return;
  if (!confirm('Clear all captured titles and start fresh?')) return;

  sessionAddedKeys.clear();
  capturedItems = [];

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'CLEAR_CAPTURED' });
  }
  chrome.storage.local.remove(['nmlCapturedItems']);

  renderResults();
  updateStatus(true, 'Captured titles cleared.');
});

// Add All button
btnAddAllEl.addEventListener('click', async () => {
  const itemsToAdd = capturedItems.filter(item => {
    const k = normalizeKey(item.title);
    return !localLibraryKeys.has(k) && !sessionAddedKeys.has(k);
  });

  if (itemsToAdd.length === 0) return;

  btnAddAllEl.disabled = true;
  btnAddAllTextEl.textContent = 'Adding all titles...';

  await exportItemsToApp(itemsToAdd);

  itemsToAdd.forEach(item => {
    sessionAddedKeys.add(normalizeKey(item.title));
  });

  btnAddAllTextEl.textContent = 'All Titles Added ✓';
  renderResults();
});

// Download JSON
btnDownloadJsonEl.addEventListener('click', () => {
  if (capturedItems.length === 0) return;
  const jsonBlob = new Blob([JSON.stringify(capturedItems, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(jsonBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `netflix-my-list-captured-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// Copy JSON
btnCopyJsonEl.addEventListener('click', () => {
  if (capturedItems.length === 0) return;
  navigator.clipboard.writeText(JSON.stringify(capturedItems, null, 2));
  const orig = btnCopyJsonEl.querySelector('span').textContent;
  btnCopyJsonEl.querySelector('span').textContent = 'Copied!';
  setTimeout(() => {
    btnCopyJsonEl.querySelector('span').textContent = orig;
  }, 1800);
});

// Initialize on popup open
initTab();
