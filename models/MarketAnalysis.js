const mongoose = require('mongoose');

const marketAnalysisSchema = new mongoose.Schema({
  searchMode:       { type: String, enum: ['shop', 'product'], default: 'shop' },
  searchLocation:   { type: String, required: true },
  categorySearched: { type: String, required: true },
  specificProduct:  { type: String },
  // ── Deterministic state derived from Overpass node count (never from LLM) ──
  marketState:      { type: String, enum: ['greenfield', 'competitive'], default: 'competitive' },
  opportunityScore: { type: Number, min: 0, max: 100 },
  // confidenceScore is now a Number (0.0–1.0) stored as String for display compat
  confidenceScore:  { type: String },
  aiRecommendation: { type: String },
  strategyPlaybook: [{ type: String }],
  // competitorMetrics sourced ONLY from Overpass nodes — never LLM-generated
  competitorMetrics: [{
    name:           String,
    sentimentScore: Number,
    mainWeakness:   String,
  }],
}, { timestamps: true });

module.exports = mongoose.model('MarketAnalysis', marketAnalysisSchema);
