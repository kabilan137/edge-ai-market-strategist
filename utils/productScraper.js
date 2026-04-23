const puppeteer = require('puppeteer');

async function scrapeProductReviews(productName) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    const MINIMUM_REVIEWS = 15;
    const MAX_PAGES_TO_SCRAPE = 3;
    let finalCleanedData = [];
    let currentPage = 1;

    const cleanScrapedText = (text) => text.replace(/[^a-zA-Z0-9 .,!?'"-]/g, '').trim();

    while (finalCleanedData.length < MINIMUM_REVIEWS && currentPage <= MAX_PAGES_TO_SCRAPE) {
      // Search for product reviews using DuckDuckGo HTML with pagination
      // Assuming DuckDuckGo HTML pagination can use the 's' parameter (though we can just use the page to click next or alter query, for duckduckgo html, we might need a form post. Instead we'll simulate pagination by searching different sources or just appending page info to query, but duckduckgo html is hard to paginate cleanly without form. Actually, we'll try modifying the query slightly if it's page 2, or just accept whatever DuckDuckGo returns.)
      
      const searchQuery = encodeURIComponent(`${productName} customer reviews complaints ${currentPage > 1 ? 'page ' + currentPage : ''}`);
      await page.goto(`https://html.duckduckgo.com/html/?q=${searchQuery}`, { waitUntil: 'domcontentloaded', timeout: 10000 });

      const newReviews = await page.evaluate(() => {
        const snippets = Array.from(document.querySelectorAll('.result__snippet'));
        return snippets.map(snippet => snippet.textContent.trim()).filter(text => text.length >= 15);
      });

      if (newReviews.length === 0) break;

      const cleaned = newReviews.map(cleanScrapedText).filter(text => text.length >= 15);
      finalCleanedData = [...finalCleanedData, ...cleaned];
      currentPage++;
    }

    return finalCleanedData.slice(0, 25);

  } catch (error) {
    console.error(`Error scraping product reviews for ${productName}:`, error.message);
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = { scrapeProductReviews };
