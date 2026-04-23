const puppeteer = require('puppeteer');
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
    const browser = await puppeteer.launch({headless: 'new', args: ['--no-sandbox']});
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    const productName = "iphone 15";
    const searchQuery = encodeURIComponent(`"${productName}" reviews AND (complaint OR issue OR flaw OR reddit)`);
    await page.goto(`https://www.bing.com/search?q=${searchQuery}`, { waitUntil: 'domcontentloaded' });
    await delay(3000); // 3 seconds delay
    const reviews = await page.evaluate(() => {
      const snippets = Array.from(document.querySelectorAll('.b_algo p, .b_caption p'));
      return snippets.map(snippet => snippet.textContent.trim()).filter(text => text.length > 20);
    });
    console.log(reviews);
    await browser.close();
})();
