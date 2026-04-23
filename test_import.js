const { scrapeProductReviews } = require('./utils/productScraper');
scrapeProductReviews('iphone 15').then(res => { console.log(res); process.exit(0); });
