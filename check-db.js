const mongoose = require('mongoose');
const Business = require('./models/Business');
const MarketAnalysis = require('./models/MarketAnalysis');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Businesses count:', await Business.countDocuments());
  console.log('Analyses count:', await MarketAnalysis.countDocuments());
  await mongoose.connection.close();
}
run();
