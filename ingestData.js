require('dotenv').config();
const mongoose = require('mongoose');
const { getLocalBusinesses } = require('./utils/locationScraper');
const { scrapeReviews } = require('./utils/reviewScraper');
const Business = require('./models/Business');

const seedData = async () => {
  const location = process.argv[2] || 'Seattle';
  const category = process.argv[3] || 'cafe';

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`Connected to DB. Starting ingest pipeline for ${category} in ${location}...`);

    // The "Nuke" Function: Wipe all old mock data before ingesting new real data
    await Business.deleteMany({});
    console.log("Database wiped clean of mock data.");

    console.log('Phase 1: Discovering businesses via Overpass API...');
    const businesses = await getLocalBusinesses(location, category);
    
    if (businesses.length === 0) {
      console.log('No businesses found in this location.');
      process.exit(0);
    }
    
    console.log(`Found ${businesses.length} businesses. Moving to Phase 2: Deep Review Scraping...`);
    
    for (const biz of businesses) {
      console.log(`Scraping reviews for: ${biz.name}`);
      try {
        const reviews = await scrapeReviews(biz.name, location);
        biz.recentReviews = reviews;
        // Not adding random mock rating anymore. Keep real data only.
      } catch (scrapeErr) {
        console.error(`Skipping ${biz.name} due to unhandled scrape error:`, scrapeErr.message);
        biz.recentReviews = [];
      }
    }

    console.log('Phase 3: Saving to MongoDB...');
    // Data is already wiped clean above, so no need for partial clear
    await Business.insertMany(businesses);
    console.log(`Successfully inserted ${businesses.length} real businesses with real reviews into MongoDB.`);
    
    process.exit(0);
  } catch (err) {
    console.error('Ingestion failed:', err);
    process.exit(1);
  }
};

seedData();
