/**
 * Netflix My List - Manual Capture Engine
 * 
 * STRICT FOCUS: Exclusively scrapes the "My List" row/section.
 * Completely ignores other rows like "Trailers you have watched", "Continue Watching",
 * "Watch it again", "Trending Now", etc.
 * 
 * Flow:
 * 1. User clicks "Start Capturing" in the extension.
 * 2. An on-screen floating HUD appears on Netflix showing live captured count.
 * 3. User manually scrolls, slides, or clicks chevrons through "My List".
 * 4. DOM observer captures newly discovered titles inside the My List container only.
 * 5. Titles are saved in chrome.storage.local for review.
 * 6. User opens extension to review results with individual "Add" buttons and an "Add All" button.
 */

let isCapturingActive = false;
let capturedTitlesMap = new Map(); // key -> item
let liveObserver = null;
let hudElement = null;

function cleanTitle(raw) {
  if (!raw) return '';
  let cleaned = raw.replace(/\s+/g, ' ').trim();

  // Strip Netflix notification icons, badges, and metadata tags
  cleaned = cleaned.replace(/[\u{1F300}-\u{1F9FF}]/gu, ''); // Remove emojis like 🔔
  cleaned = cleaned.replace(/\b(new arrival|recently added|top 10|trending now|watch now|new episode|emmy winner|golden globe winner|\d+\s+(?:days?|weeks?|months?|hours?)\s+ago)\b/gi, '');
  cleaned = cleaned.replace(/^(play|watch|more info)\b/gi, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Clean trailing or leading punctuation
  cleaned = cleaned.replace(/^[-:•|,\s]+|[-:•|,\s]+$/g, '').trim();

  return cleaned;
}

function extractVideoId(urlOrStr) {
  if (!urlOrStr) return undefined;
  const match = urlOrStr.match(/\/watch\/(\d+)|\/title\/(\d+)/i);
  return match ? (match[1] || match[2]) : undefined;
}

/**
 * Locate strictly the "My List" container on the current Netflix page.
 * Strictly avoids capturing "Continue Watching", "Watch It Again", "Trailers", etc.
 */
function findMyListContainer() {
  const isDedicatedPage = window.location.pathname.includes('/my-list');

  // 1. Direct row by Netflix data-list-context
  const queueRow = document.querySelector(
    '[data-list-context="queue"], [data-list-context="mylist"], [data-list-context="my-list"]'
  );
  if (queueRow) return queueRow;

  // 2. Locate header or text explicitly labeled "My List"
  const candidates = document.querySelectorAll(
    '.rowHeader, .rowTitle, .row-header-title, .headerText, h1, h2, h3, h4, span.row-header-title, a[href*="/my-list"]'
  );

  for (const el of candidates) {
    const text = el.textContent?.trim() || '';
    if (/^my\s*list$/i.test(text) || text.toLowerCase() === 'my list') {
      const row = el.closest('.lolomoRow, .rowContainer, [data-list-context], .row, .slider-hover-trigger-layer')
               || el.closest('div.slider')?.parentElement
               || el.parentElement?.parentElement;
      if (row) return row;
    }
  }

  // 3. Fallback header containing "My List" without other section keywords
  for (const el of candidates) {
    const text = el.textContent?.trim() || '';
    if (/\bmy\s*list\b/i.test(text) && !/(continue|trailer|top\s*10|trending|watch it again|popular|because you watched)/i.test(text)) {
      const row = el.closest('.lolomoRow, .rowContainer, [data-list-context], .row')
               || el.parentElement?.parentElement;
      if (row) return row;
    }
  }

  // 4. If dedicated /browse/my-list page, use the gallery grid
  if (isDedicatedPage) {
    const gallery = document.querySelector('.galleryLockups, .galleryContent, .gallery, .mainView, [role="main"]');
    if (gallery) return gallery;
  }

  return null;
}

/**
 * Scrape titles strictly from the My List container.
 * Returns count of newly added items in this cycle.
 */
function scrapeFromMyListContainer() {
  const container = findMyListContainer();
  if (!container) return 0;

  const cardSelectors = [
    '.slider-item',
    '.title-card-container',
    '[data-testid*="title-card"]',
    '.galleryItem',
    '.title_card',
    '.bob-container'
  ];

  const cards = container.querySelectorAll(cardSelectors.join(', '));
  let newlyDiscovered = 0;

  cards.forEach(card => {
    const linkEl = card.querySelector('a[href*="/title/"], a[href*="/watch/"]');
    const href = linkEl ? linkEl.getAttribute('href') : '';
    const videoId = extractVideoId(href);

    // Box art image alt attribute (Netflix's cleanest title source)
    let title = '';
    const imgEl = card.querySelector('img.boxart-image, img');
    if (imgEl && imgEl.getAttribute('alt')) {
      title = cleanTitle(imgEl.getAttribute('alt'));
    }

    if (!title) {
      const textTitleEl = card.querySelector('.fallback-text, .title-card-title, .video-title');
      if (textTitleEl) {
        title = cleanTitle(textTitleEl.textContent || '');
      }
    }

    if (!title && linkEl) {
      title = cleanTitle(linkEl.getAttribute('aria-label') || '');
    }

    if (!title) {
      const labelEl = card.querySelector('[aria-label]');
      if (labelEl) {
        title = cleanTitle(labelEl.getAttribute('aria-label') || '');
      }
    }

    title = cleanTitle(title);
    if (!title || title.length < 1) return;

    if (/^(play|more info|watch|episodes|next|previous|my list|audio & subtitles)$/i.test(title)) {
      return;
    }

    let posterPath = '';
    if (imgEl && imgEl.src && !imgEl.src.startsWith('data:')) {
      posterPath = imgEl.src;
    }

    let synopsis = '';
    const synopsisEl = card.querySelector('.synopsis, .bob-overview, .overview');
    if (synopsisEl) synopsis = synopsisEl.textContent?.trim() || '';

    let maturityRating = '';
    const matEl = card.querySelector('.maturity-rating, .rating');
    if (matEl) maturityRating = matEl.textContent?.trim() || '';

    let duration = '';
    const durEl = card.querySelector('.duration, .year');
    if (durEl) duration = durEl.textContent?.trim() || '';

    const key = (title + (videoId ? '_' + videoId : '')).toLowerCase();

    if (!capturedTitlesMap.has(key)) {
      capturedTitlesMap.set(key, {
        title,
        videoId,
        synopsis: synopsis || undefined,
        posterPath: posterPath || undefined,
        maturityRating: maturityRating || undefined,
        duration: duration || undefined,
        capturedAt: Date.now()
      });
      newlyDiscovered++;
    }
  });

  // Also scan title links inside this container
  const links = container.querySelectorAll('a[href*="/title/"], a[href*="/watch/"]');
  links.forEach(link => {
    const href = link.getAttribute('href') || '';
    const videoId = extractVideoId(href);
    const innerImg = link.querySelector('img');
    let title = innerImg ? innerImg.getAttribute('alt') : '';
    if (!title) {
      title = link.getAttribute('aria-label') || link.textContent || '';
    }
    title = cleanTitle(title);

    if (title && title.length > 1 && !/^(play|more info|watch|episodes|next|previous|my list)$/i.test(title)) {
      const key = (title + (videoId ? '_' + videoId : '')).toLowerCase();
      if (!capturedTitlesMap.has(key)) {
        capturedTitlesMap.set(key, {
          title,
          videoId,
          capturedAt: Date.now()
        });
        newlyDiscovered++;
      }
    }
  });

  if (newlyDiscovered > 0) {
    updateOnScreenHUD();
    syncToStorage();
  }

  return newlyDiscovered;
}

function syncToStorage() {
  const items = Array.from(capturedTitlesMap.values());
  chrome.storage.local.set({
    nmlCapturedItems: items,
    nmlIsCapturing: isCapturingActive
  });
}

/**
 * On-Screen Floating HUD when Capturing is Active
 */
function createOnScreenHUD() {
  if (document.getElementById('nml-capture-hud')) return;

  const hud = document.createElement('div');
  hud.id = 'nml-capture-hud';
  hud.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 9999999;
    background: rgba(18, 18, 18, 0.95);
    color: #ffffff;
    border: 1.5px solid #E50914;
    border-radius: 40px;
    padding: 8px 16px 8px 14px;
    box-shadow: 0 10px 35px rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    backdrop-filter: blur(10px);
    transition: all 0.2s ease;
    user-select: none;
  `;

  hud.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 10px #22c55e;"></span>
      <span style="font-weight: 500;">Capturing My List:</span>
      <span id="nml-hud-count" style="color: #ffffff; font-weight: 800; background: #E50914; padding: 1px 8px; border-radius: 12px; font-size: 13px;">${capturedTitlesMap.size}</span>
    </div>
    <div style="display: flex; align-items: center; gap: 6px;">
      <button id="nml-hud-stop" style="background: #27272a; color: #f4f4f5; border: 1px solid rgba(255,255,255,0.15); border-radius: 20px; padding: 4px 12px; font-size: 11.5px; font-weight: 600; cursor: pointer;">
        Stop &amp; Review
      </button>
    </div>
  `;

  document.body.appendChild(hud);
  hudElement = hud;

  const stopBtn = hud.querySelector('#nml-hud-stop');
  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      stopCapturing();
    });
  }
}

function updateOnScreenHUD() {
  const countEl = document.getElementById('nml-hud-count');
  if (countEl) {
    countEl.textContent = capturedTitlesMap.size.toString();
  }
}

function removeOnScreenHUD() {
  const el = document.getElementById('nml-capture-hud');
  if (el) el.remove();
  hudElement = null;
}

/**
 * Start Live Capturing:
 * User manually scrolls or clicks chevrons, observer captures any new title in My List.
 */
function startCapturing() {
  isCapturingActive = true;
  createOnScreenHUD();

  // Initial pass
  scrapeFromMyListContainer();

  if (!liveObserver) {
    liveObserver = new MutationObserver(() => {
      if (isCapturingActive) {
        scrapeFromMyListContainer();
      }
    });
    liveObserver.observe(document.body, { childList: true, subtree: true });
  }

  syncToStorage();
}

function stopCapturing() {
  isCapturingActive = false;
  // Final scrape of whatever is visible
  scrapeFromMyListContainer();
  removeOnScreenHUD();
  syncToStorage();
}

// User manual scroll and click listeners
window.addEventListener('click', () => {
  if (isCapturingActive) {
    setTimeout(scrapeFromMyListContainer, 300);
    setTimeout(scrapeFromMyListContainer, 800);
  }
}, true);

window.addEventListener('scroll', () => {
  if (isCapturingActive) {
    scrapeFromMyListContainer();
  }
}, { passive: true });

// Restore state from storage on load
chrome.storage.local.get(['nmlCapturedItems', 'nmlIsCapturing'], (res) => {
  if (res && Array.isArray(res.nmlCapturedItems)) {
    res.nmlCapturedItems.forEach(item => {
      const key = (item.title + (item.videoId ? '_' + item.videoId : '')).toLowerCase();
      capturedTitlesMap.set(key, item);
    });
  }
  if (res && res.nmlIsCapturing) {
    startCapturing();
  }
});

// Extension popup communication
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_STATUS') {
    const container = findMyListContainer();
    sendResponse({
      containerFound: !!container,
      isCapturing: isCapturingActive,
      count: capturedTitlesMap.size,
      items: Array.from(capturedTitlesMap.values())
    });
    return;
  }

  if (request.action === 'START_CAPTURING') {
    startCapturing();
    sendResponse({
      success: true,
      count: capturedTitlesMap.size,
      items: Array.from(capturedTitlesMap.values())
    });
    return;
  }

  if (request.action === 'STOP_CAPTURING') {
    stopCapturing();
    sendResponse({
      success: true,
      count: capturedTitlesMap.size,
      items: Array.from(capturedTitlesMap.values())
    });
    return;
  }

  if (request.action === 'CLEAR_CAPTURED') {
    capturedTitlesMap.clear();
    removeOnScreenHUD();
    syncToStorage();
    sendResponse({ success: true });
    return;
  }
});
