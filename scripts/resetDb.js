require('dotenv').config();
const mongoose = require('mongoose');
const Business = require('../models/Business');

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error("MONGO_URI is not defined in the .env file");
  process.exit(1);
}

mongoose.connect(mongoUri)
  .then(async () => {
    await Business.deleteMany({});
    console.log("Legacy database purged. Ready for fresh Dual-Mode scrapes.");
    process.exit(0);
  })
  .catch(err => {
    console.error("Connection error:", err);
    process.exit(1);
  });
