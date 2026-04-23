const mongoose = require('mongoose');

const marketAnalysisSchema = new mongoose.Schema({
  searchMode: { type: String, enum: ['shop', 'product'], default: 'shop' },
  searchLocation: { type: String, required: true },
  categorySearched: { type: String, required: true },
  specificProduct: { type: String },
  opportunityScore: { type: Number, min: 1, max: 100 },
  confidenceScore: { type: String, enum: ['High', 'Medium', 'Low'] },
  aiRecommendation: { type: String },
  strategyPlaybook: [{ type: String }],
  competitorMetrics: [{
    name: String,
    sentimentScore: Number,
    mainWeakness: String
  }]
}, { timestamps: true });

module.exports = mongoose.model('MarketAnalysis', marketAnalysisSchema);
