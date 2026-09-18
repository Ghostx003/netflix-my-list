/**
 * Netflix My List Scraper Content Script
 * 
 * STRICT FOCUS: Exclusively scrapes the "My List" row/section.
 * Completely ignores other rows like "Trailers you have watched", "Continue Watching",
 * "Watch it again", "Trending Now", etc.
 * 
 * Features:
 * - Automatically finds the "My List" horizontal row or gallery anywhere on the page
 * - Slides through the horizontal carousel up to user-defined page limit
 * - Human Intervention Support: Live observer tracks manual scrolling/clicking and captures new titles
 * - Strips badges (Top 10, Recently Added, New Episode, Watch Now, Emmy Winner, etc.)
 */

// In-memory accumulator for titles captured from the "My List" container
if (!window.__netflixMyListAccumulator) {
  window.__netflixMyListAccumulator = new Map();
}

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
 * Locate ONLY the "My List" section/container on the current Netflix page.
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
      // Find the row container wrapping this header
      const row = el.closest('.lolomoRow, .rowContainer, [data-list-context], .row, .slider-hover-trigger-layer')
               || el.closest('div.slider')?.parentElement
               || el.parentElement?.parentElement;
      if (row) return row;
    }
  }

  // 3. Fallback header matching "My List" without forbidden row terms
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
 * Scrape titles strictly from a specific container (The My List container).
 */
function scrapeFromContainer(container) {
  if (!container) return [];

  const cardSelectors = [
    '.slider-item',
    '.title-card-container',
    '[data-testid*="title-card"]',
    '.galleryItem',
    '.title_card',
    '.bob-container'
  ];

  const cards = container.querySelectorAll(cardSelectors.join(', '));
  const newlyScraped = [];

  cards.forEach(card => {
    // Try to get title link / anchor
    const linkEl = card.querySelector('a[href*="/title/"], a[href*="/watch/"]');
    const href = linkEl ? linkEl.getAttribute('href') : '';
    const videoId = extractVideoId(href);

    // 1. Box art image alt attribute (Netflix's cleanest title source)
    let title = '';
    const imgEl = card.querySelector('img.boxart-image, img');
    if (imgEl && imgEl.getAttribute('alt')) {
      title = cleanTitle(imgEl.getAttribute('alt'));
    }

    // 2. Specific text labels
    if (!title) {
      const textTitleEl = card.querySelector('.fallback-text, .title-card-title, .video-title');
      if (textTitleEl) {
        title = cleanTitle(textTitleEl.textContent || '');
      }
    }

    // 3. Aria-labels
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

    // Poster image
    let posterPath = '';
    if (imgEl && imgEl.src && !imgEl.src.startsWith('data:')) {
      posterPath = imgEl.src;
    }

    // Synopsis / details if visible
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

    const itemObj = {
      title,
      videoId,
      synopsis: synopsis || undefined,
      posterPath: posterPath || undefined,
      maturityRating: maturityRating || undefined,
      duration: duration || undefined,
    };

    if (!window.__netflixMyListAccumulator.has(key)) {
      window.__netflixMyListAccumulator.set(key, itemObj);
      newlyScraped.push(itemObj);
    }
  });

  // Also check direct links ONLY inside this container
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
      if (!window.__netflixMyListAccumulator.has(key)) {
        const itemObj = { title, videoId };
        window.__netflixMyListAccumulator.set(key, itemObj);
        newlyScraped.push(itemObj);
      }
    }
  });

  return Array.from(window.__netflixMyListAccumulator.values());
}

/**
 * Setup live observer for Human Intervention:
 * If the user manually clicks horizontal slider arrows or scrolls, capture uncaptured titles immediately!
 */
function setupLiveObserver() {
  const container = findMyListContainer();
  if (container) {
    scrapeFromContainer(container);
  }

  // Observe DOM changes in document so when user slides or scrolls, new cards are captured
  const observer = new MutationObserver(() => {
    const c = findMyListContainer();
    if (c) {
      scrapeFromContainer(c);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Listen for user interaction events (clicking next chevron or scrolling)
  window.addEventListener('click', (e) => {
    const c = findMyListContainer();
    if (c && (c.contains(e.target) || e.target.closest?.('.handleNext, .sliderButtonNext'))) {
      setTimeout(() => scrapeFromContainer(c), 500);
      setTimeout(() => scrapeFromContainer(c), 1200);
    }
  }, true);

  window.addEventListener('scroll', () => {
    const c = findMyListContainer();
    if (c) {
      scrapeFromContainer(c);
    }
  }, { passive: true });
}

setupLiveObserver();

/**
 * Find the next button inside the My List row.
 */
function getNextSlideButton(container) {
  if (!container) return null;
  return container.querySelector(
    '.handleNext, .sliderButtonNext, span.handle.handleNext, .slider-button-right, [aria-label*="See more"], [aria-label*="Next"]'
  );
}

/**
 * Auto-slide through My List horizontal row up to maxPages.
 */
async function autoSlideMyList(maxPages = 10, sendFeedback = () => {}) {
  const container = findMyListContainer();
  if (!container) {
    throw new Error('Could not find "My List" row on this page. Please scroll until "My List" is in view or navigate to netflix.com/browse/my-list.');
  }

  // Initial capture
  scrapeFromContainer(container);
  sendFeedback(`Initial scan: ${window.__netflixMyListAccumulator.size} titles found.`);

  // Scroll container smoothly into view so Netflix triggers card renders
  try {
    container.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch {}

  let consecutiveNoNewTitles = 0;
  let pagesSlid = 0;

  for (let p = 1; p <= maxPages; p++) {
    const beforeCount = window.__netflixMyListAccumulator.size;
    const nextBtn = getNextSlideButton(container);

    if (nextBtn) {
      // Simulate authentic user click on next slide handle
      nextBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      nextBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      nextBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      nextBtn.click();
    } else {
      // Fallback: horizontal scroll
      const slider = container.querySelector('.slider, .sliderMask, .sliderContent') || container;
      if (slider && slider.scrollWidth > slider.clientWidth) {
        slider.scrollBy({ left: slider.clientWidth * 0.85, behavior: 'smooth' });
      }
    }

    pagesSlid++;
    sendFeedback(`Sliding page ${p}/${maxPages}... (${window.__netflixMyListAccumulator.size} titles captured)`);

    // Allow Netflix slide transition and lazy card loading to settle
    await new Promise(r => setTimeout(r, 900));

    // Scrape cards on current page view
    scrapeFromContainer(container);

    const afterCount = window.__netflixMyListAccumulator.size;
    if (afterCount === beforeCount) {
      consecutiveNoNewTitles++;
    } else {
      consecutiveNoNewTitles = 0;
    }

    // If 2 consecutive slides show no new titles, or next button disappeared, we've covered the full row
    if (consecutiveNoNewTitles >= 2 && p >= 3) {
      sendFeedback(`Reached end of My List after ${p} slides.`);
      break;
    }
  }

  return Array.from(window.__netflixMyListAccumulator.values());
}

// Extension message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'CHECK_MY_LIST_CONTAINER') {
    const container = findMyListContainer();
    const isDedicated = window.location.pathname.includes('/my-list');
    sendResponse({
      found: !!container,
      isDedicated,
      capturedCount: window.__netflixMyListAccumulator.size
    });
    return;
  }

  if (request.action === 'SCRAPE_MY_LIST') {
    const container = findMyListContainer();
    if (!container) {
      sendResponse({
        success: false,
        error: 'Could not find "My List" row on this page. Please make sure "My List" is loaded or open netflix.com/browse/my-list.'
      });
      return;
    }

    const items = scrapeFromContainer(container);
    sendResponse({ success: true, count: items.length, items });
    return;
  }

  if (request.action === 'AUTO_SLIDE_MY_LIST') {
    const maxPages = request.maxPages || 10;
    autoSlideMyList(maxPages, (statusMsg) => {
      chrome.runtime.sendMessage({ action: 'SCRAPE_PROGRESS', message: statusMsg }).catch(() => {});
    })
      .then((items) => {
        sendResponse({ success: true, count: items.length, items });
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message });
      });

    return true; // Keep async channel open
  }

  if (request.action === 'CLEAR_ACCUMULATOR') {
    window.__netflixMyListAccumulator.clear();
    sendResponse({ success: true });
    return;
  }
});
