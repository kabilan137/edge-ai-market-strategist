const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch({headless: 'new', args: ['--no-sandbox']});
    const page = await browser.newPage();
    const productName = "iphone 15";
    const searchQuery = encodeURIComponent(`"${productName}" reviews AND (complaint OR issue OR flaw OR reddit)`);
    await page.goto(`https://lite.duckduckgo.com/lite/?q=${searchQuery}`, { waitUntil: 'domcontentloaded' });
    const reviews = await page.evaluate(() => {
      const snippets = Array.from(document.querySelectorAll('.result-snippet'));
      return snippets.map(snippet => snippet.textContent.trim()).filter(text => text.length > 20);
    });
    console.log(reviews);
    await browser.close();
})();
