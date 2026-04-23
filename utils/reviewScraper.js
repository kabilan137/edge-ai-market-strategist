const puppeteer = require('puppeteer');

async function scrapeReviews(businessName, location) {
  let browser;
  try {
    browser = await puppeteer.launch({ 
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    const page = await browser.newPage();
    
    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');

    const MINIMUM_REVIEWS = 15;
    const MAX_PAGES_TO_SCRAPE = 3;
    let finalCleanedData = [];
    let currentPage = 1;

    const cleanScrapedText = (text) => text.replace(/[^a-zA-Z0-9 .,!?'"-]/g, '').trim();

    while (finalCleanedData.length < MINIMUM_REVIEWS && currentPage <= MAX_PAGES_TO_SCRAPE) {
      // Simulate search on Bing to extract review snippets from public directories
      const searchQuery = encodeURIComponent(`${businessName} ${location} reviews complaints ${currentPage > 1 ? 'page ' + currentPage : ''}`);
      await page.goto(`https://www.bing.com/search?q=${searchQuery}`, { waitUntil: 'domcontentloaded', timeout: 10000 });

      // Extract snippets from search results
      const newReviews = await page.evaluate(() => {
        const snippets = Array.from(document.querySelectorAll('.b_algo p, .b_caption p'));
        return snippets.map(s => s.innerText).filter(text => text.length >= 15);
      });

      if (newReviews.length === 0) break;

      const cleaned = newReviews.map(cleanScrapedText).filter(text => text.length >= 15);
      finalCleanedData = [...finalCleanedData, ...cleaned];
      currentPage++;
    }

    // Return only real scraped reviews
    return finalCleanedData.slice(0, 25);
  } catch (error) {
    console.error(`Failed to scrape reviews for ${businessName}:`, error.message);
    // Gracefully skip by returning an empty array on failure
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = { scrapeReviews };
