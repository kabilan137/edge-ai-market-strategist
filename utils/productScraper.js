const puppeteer = require('puppeteer');

// ─── productScraper ────────────────────────────────────────────────────────────
//
// ARCHITECTURAL MANDATE (mirrors analysisController.js):
//   `location` is injected into every DuckDuckGo query so the scraper pulls
//   LOCALIZED market signals (e.g. "Madurai ceiling fan customer reviews")
//   instead of global / predominantly American data.
//
//   The multi-angle query rotation below increases the probability of surfacing
//   regional brand names and market-specific complaints across 3 pagination passes.
//
// @param {string} productName  - The product being researched (e.g. "ceiling fan").
// @param {string} location     - Target city / region (e.g. "Madurai"). Injected
//                                at the front of every search query.
// @returns {Promise<string[]>} - Array of cleaned review/snippet strings (max 25).
// ─────────────────────────────────────────────────────────────────────────────

async function scrapeProductReviews(productName, location = '') {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    );

    const MINIMUM_REVIEWS    = 15;
    const MAX_PAGES_TO_SCRAPE = 3;
    let finalCleanedData = [];
    let currentPage = 1;

    // Location prefix anchors every query to the target market.
    // e.g. "Madurai " → "Madurai ceiling fan customer reviews complaints"
    const locationPrefix = location ? `${location.trim()} ` : '';

    // Multi-angle query rotation:
    //   Pass 1 → customer reviews & complaints (primary sentiment signal)
    //   Pass 2 → brand problems & quality issues (surfaces specific hardware flaws)
    //   Pass 3 → best buy / where to buy (pulls distributor & brand mentions)
    // Each angle increases the probability of returning regional brand names.
    const queryAngles = [
      `${locationPrefix}${productName} customer reviews complaints`,
      `${locationPrefix}${productName} brand problems quality issues`,
      `${locationPrefix}${productName} best buy where to buy`,
    ];

    const cleanScrapedText = (text) =>
      text.replace(/[^a-zA-Z0-9 .,!?'"-]/g, '').trim();

    while (finalCleanedData.length < MINIMUM_REVIEWS && currentPage <= MAX_PAGES_TO_SCRAPE) {
      // Pick the query angle for this pass (cycles through the three angles above)
      const rawQuery   = queryAngles[currentPage - 1] || queryAngles[0];
      const searchQuery = encodeURIComponent(rawQuery);

      console.log(`[ProductScraper] Pass ${currentPage} — query: "${rawQuery}"`);

      await page.goto(
        `https://html.duckduckgo.com/html/?q=${searchQuery}`,
        { waitUntil: 'domcontentloaded', timeout: 12000 }
      );

      const newReviews = await page.evaluate(() => {
        const snippets = Array.from(document.querySelectorAll('.result__snippet'));
        return snippets
          .map(el => el.textContent.trim())
          .filter(text => text.length >= 20); // slightly stricter than before — filters noise
      });

      if (newReviews.length === 0) break;

      const cleaned = newReviews
        .map(cleanScrapedText)
        .filter(text => text.length >= 20);

      finalCleanedData = [...finalCleanedData, ...cleaned];
      currentPage++;
    }

    console.log(
      `[ProductScraper] Done — ${finalCleanedData.length} snippets collected ` +
      `for "${productName}" in "${location || 'global'}".`
    );

    return finalCleanedData.slice(0, 25);

  } catch (error) {
    console.error(
      `[ProductScraper] Error for "${productName}" in "${location || 'global'}":`,
      error.message
    );
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = { scrapeProductReviews };
