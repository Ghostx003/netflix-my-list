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
  let cleaned = raw.replace(/\s+/g, ' ').trim();

  // Strip Netflix notification icons and strings (e.g. 🔔, "New arrival", "Watch now", "3 weeks ago")
  cleaned = cleaned.replace(/[\u{1F300}-\u{1F9FF}]/gu, ''); // Remove emojis like 🔔
  cleaned = cleaned.replace(/\b(new arrival|recently added|top 10|trending now|watch now|\d+\s+(?:days?|weeks?|months?|hours?)\s+ago)\b/gi, '');
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

    // Prioritize clean title sources:
    // 1. Image alt attribute (Netflix boxart alt is usually the purest movie/show title e.g. "Plastic Beauty")
    let title = '';
    const imgEl = card.querySelector('img.boxart-image, img');
    if (imgEl && imgEl.getAttribute('alt')) {
      title = cleanTitle(imgEl.getAttribute('alt'));
    }

    // 2. Specific title-card-title or fallback-text
    if (!title) {
      const textTitleEl = card.querySelector('.fallback-text, .title-card-title, .video-title');
      if (textTitleEl) {
        title = cleanTitle(textTitleEl.textContent || '');
      }
    }

    // 3. Link aria-label or card aria-label
    if (!title && linkEl) {
      title = cleanTitle(linkEl.getAttribute('aria-label') || '');
    }

    if (!title) {
      const labelEl = card.querySelector('[aria-label]');
      if (labelEl) {
        title = cleanTitle(labelEl.getAttribute('aria-label') || '');
      }
    }

    // 4. Fallback text content inside card, but filter out notification wrappers
    if (!title) {
      const h4OrP = card.querySelector('h4, p');
      if (h4OrP && !h4OrP.closest('.notification-item, .notification-message')) {
        title = cleanTitle(h4OrP.textContent || '');
      }
    }

    title = cleanTitle(title);
    if (!title || title.length < 1) return;

    // Filter out UI control strings that aren't movie/show titles
    if (/^(play|more info|watch|episodes|next|previous|my list|audio & subtitles)$/i.test(title)) {
      return;
    }

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

  // 2. Also check if Netflix has title links on page (filtering out notifications bell dropdown)
  try {
    const allLinks = document.querySelectorAll('a[href*="/watch/"], a[href*="/title/"]');
    allLinks.forEach(link => {
      // Ignore links inside the Netflix notification bell menu / header popups
      if (link.closest('.notifications-menu, .nav-element, .account-menu-item')) {
        return;
      }

      const href = link.getAttribute('href') || '';
      const videoId = extractVideoId(href);

      // Try image alt inside link first
      const innerImg = link.querySelector('img');
      let title = innerImg ? innerImg.getAttribute('alt') : '';

      if (!title) {
        title = link.getAttribute('aria-label') || link.textContent || '';
      }

      title = cleanTitle(title);
      if (title && title.length > 1 && !/^(play|more info|watch|episodes|next|previous|my list)$/i.test(title)) {
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
