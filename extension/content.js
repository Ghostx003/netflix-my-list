/**
 * Netflix My List Scraper Content Script
 * Extracts:
 * - title
 * - videoId (numeric Netflix ID)
 * - synopsis (overview/plot if present in card)
 * - maturityRating
 * - duration / episodes
 * - matchScore / rating
 * - poster / boxart image
 * - tags / genres
 */

function cleanTitle(raw) {
  if (!raw) return '';
  return raw.replace(/\s+/g, ' ').trim();
}

function extractVideoId(urlOrStr) {
  if (!urlOrStr) return undefined;
  const match = urlOrStr.match(/\/watch\/(\d+)|\/title\/(\d+)/i);
  return match ? (match[1] || match[2]) : undefined;
}

function scrapeVisibleTitles() {
  const titlesMap = new Map();

  // 1. Check title cards on netflix.com/browse/my-list or grid cards
  const cardSelectors = [
    '.slider-item',
    '.title-card-container',
    '[data-testid*="title-card"]',
    '.galleryItem',
    '.title_card',
    '.jawBoneContainer',
    '.bob-container'
  ];

  const cards = document.querySelectorAll(cardSelectors.join(', '));

  cards.forEach(card => {
    // Try to get title link / anchor
    const linkEl = card.querySelector('a[href*="/title/"], a[href*="/watch/"]');
    const href = linkEl ? linkEl.getAttribute('href') : '';
    const videoId = extractVideoId(href);

    // Title from aria-label, img alt, or inner text
    let title = '';
    const labelEl = card.querySelector('[aria-label]');
    if (labelEl) title = labelEl.getAttribute('aria-label') || '';
    
    if (!title && linkEl) {
      title = linkEl.getAttribute('aria-label') || '';
    }

    const imgEl = card.querySelector('img.boxart-image, img');
    if (!title && imgEl) {
      title = imgEl.getAttribute('alt') || '';
    }

    if (!title) {
      const textTitleEl = card.querySelector('.fallback-text, .title-card-title, h4, p');
      if (textTitleEl) title = textTitleEl.textContent || '';
    }

    title = cleanTitle(title);
    if (!title || title.length < 1) return;

    // Try extracting synopsis if mini-modal/jawbone is open or embedded
    let synopsis = '';
    const synopsisEl = card.querySelector('.synopsis, .bob-overview, .overview');
    if (synopsisEl) synopsis = synopsisEl.textContent?.trim() || '';

    // Try extracting box art / poster
    let posterPath = '';
    if (imgEl && imgEl.src && !imgEl.src.startsWith('data:')) {
      posterPath = imgEl.src;
    }

    // Try metadata badges
    let maturityRating = '';
    const matEl = card.querySelector('.maturity-rating, .rating');
    if (matEl) maturityRating = matEl.textContent?.trim() || '';

    let duration = '';
    const durEl = card.querySelector('.duration, .year');
    if (durEl) duration = durEl.textContent?.trim() || '';

    const key = (title + (videoId ? '_' + videoId : '')).toLowerCase();
    if (!titlesMap.has(key)) {
      titlesMap.set(key, {
        title,
        videoId,
        synopsis: synopsis || undefined,
        posterPath: posterPath || undefined,
        maturityRating: maturityRating || undefined,
        duration: duration || undefined,
      });
    }
  });

  // 2. Also check if Netflix has preloaded JSON in window state (react data or jawBone)
  try {
    const allLinks = document.querySelectorAll('a[href*="/watch/"], a[href*="/title/"]');
    allLinks.forEach(link => {
      const href = link.getAttribute('href') || '';
      const videoId = extractVideoId(href);
      let title = link.getAttribute('aria-label') || link.textContent || '';
      title = cleanTitle(title);
      if (title && title.length > 1 && !/^(play|more info|watch|episodes|next|previous)$/i.test(title)) {
        const key = (title + (videoId ? '_' + videoId : '')).toLowerCase();
        if (!titlesMap.has(key)) {
          titlesMap.set(key, {
            title,
            videoId,
          });
        }
      }
    });
  } catch (err) {
    console.warn('Netflix link scan note:', err);
  }

  return Array.from(titlesMap.values());
}

// Listen for messages from extension popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'SCRAPE_MY_LIST') {
    const scraped = scrapeVisibleTitles();
    sendResponse({ success: true, count: scraped.length, items: scraped });
  } else if (request.action === 'AUTO_SCROLL_AND_SCRAPE') {
    // Auto-scroll the page down to trigger lazy-loaded titles in My List grid
    let totalScrolls = 0;
    const maxScrolls = request.maxScrolls || 12;
    const interval = setInterval(() => {
      window.scrollTo(0, document.body.scrollHeight);
      totalScrolls++;

      if (totalScrolls >= maxScrolls) {
        clearInterval(interval);
        setTimeout(() => {
          const scraped = scrapeVisibleTitles();
          sendResponse({ success: true, count: scraped.length, items: scraped });
        }, 800);
      }
    }, 600);

    return true; // Keep response channel open for async execution
  }
});
