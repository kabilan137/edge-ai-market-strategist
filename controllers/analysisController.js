const axios = require('axios');
const { GoogleGenAI } = require('@google/genai');
const MarketAnalysis = require('../models/MarketAnalysis');
const Business = require('../models/Business');
const { getLocalBusinesses } = require('../utils/locationScraper');
const { scrapeReviews } = require('../utils/reviewScraper');
const { scrapeProductReviews } = require('../utils/productScraper');
const { fetchClimate } = require('../utils/fetchClimate');
const { fetchDensity } = require('../utils/fetchDensity');

exports.analyzeMarket = async (req, res) => {
  try {
    const { searchMode, location, category, specificProduct } = req.body;
    const mode = searchMode || 'shop';

    if (mode === 'shop' && (!location || !category)) {
      return res.status(400).json({ error: 'Location and category are required for shop searches.' });
    }
    if (mode === 'product' && (!location || !specificProduct)) {
      return res.status(400).json({ error: 'Location and specific product name are required for product searches.' });
    }

    let businesses = [];
    let realReviewsData = '';
    let promptText = '';

    const normLocation = location ? location.trim().toLowerCase() : '';
    const normCategory = category ? category.trim().toLowerCase() : '';
    const normProduct = specificProduct ? specificProduct.trim().toLowerCase() : '';

    // ─── Application-Level Cache Validation (TTL: 6 months) ─────────────────
    // Uses Mongoose's auto-managed `updatedAt` field (via { timestamps: true })
    // as the staleness clock. No schema changes required.
    // Fresh  (<6 months) → return cached document immediately.
    // Stale (>=6 months) → fall through to scraper + Gemini pipeline.
    // ─────────────────────────────────────────────────────────────────────────
    const CACHE_TTL_MS = 6 * 30 * 24 * 60 * 60 * 1000; // 6 months in milliseconds

    try {
      const existingAnalysis = await MarketAnalysis.findOne({
        searchMode: mode,
        searchLocation: normLocation,
        categorySearched: mode === 'product' ? 'Product' : normCategory,
        specificProduct: normProduct
      });

      if (existingAnalysis) {
        const ageMs = Date.now() - new Date(existingAnalysis.updatedAt).getTime();
        const isFresh = ageMs < CACHE_TTL_MS;

        if (isFresh) {
          console.log(`[Cache HIT - FRESH] ${mode}: ${normLocation} / ${normCategory || normProduct} (age: ${Math.floor(ageMs / 86400000)}d)`);

          let cachedBusinesses = [];
          if (mode === 'shop') {
            cachedBusinesses = await Business.find({ category: normCategory, searchLocation: normLocation });
          } else {
            cachedBusinesses = [{ name: specificProduct, category: 'product', location: { lat: 0, lng: 0 }, recentReviews: [] }];
          }

          return res.status(200).json({
            location,
            category: mode === 'product' ? 'Product' : category,
            businesses: cachedBusinesses,
            analysis: existingAnalysis,
            cached: true
          });
        }

        // Record exists but is stale — fall through to live pipeline
        console.log(`[Cache HIT - STALE] ${mode}: ${normLocation} / ${normCategory || normProduct} (age: ${Math.floor(ageMs / 86400000)}d). Re-running live pipeline...`);
      } else {
        console.log(`[Cache MISS] ${mode}: ${normLocation} / ${normCategory || normProduct}. Running live pipeline...`);
      }
    } catch (cacheErr) {
      // DB read failure — degrade gracefully by running the live pipeline
      console.warn('[Cache Check Failed] Falling back to live pipeline:', cacheErr.message);
    }

    // Universal Spatial Context
    let contextStr = "Unknown";
    try {
      if (normLocation) {
        const nomResponse = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(normLocation)}&limit=1`, {
          headers: { 'User-Agent': 'MarketOpportunityScout/1.0' }
        });
        if (nomResponse.data && nomResponse.data.length > 0) {
          const lat = nomResponse.data[0].lat;
          const lng = nomResponse.data[0].lon;
          const [climateResult, densityResult] = await Promise.all([
            fetchClimate(lat, lng),
            fetchDensity(lat, lng)
          ]);
          contextStr = `Climate: ${climateResult} | Density: ${densityResult}`;
        }
      }
    } catch (ctxErr) {
      console.warn("Universal Spatial context failed:", ctxErr.message);
    }

    if (mode === 'shop') {
      const normLocation = location.trim().toLowerCase();
      const normCategory = category.trim().toLowerCase();

      try {
        businesses = await Business.find({ category: normCategory, searchLocation: normLocation });
      } catch (dbErr) {
        console.error('Database query error:', dbErr);
        return res.status(500).json({ error: 'Database connection or timeout error.' });
      }

      if (businesses.length === 0) {
        console.log(`No real-time data found for ${normCategory} in ${normLocation}. Initiating on-demand scraping...`);
        try {
          const scrapedBusinesses = await getLocalBusinesses(normLocation, normCategory);
          
          if (scrapedBusinesses.length > 0) {
            const topBusinesses = scrapedBusinesses.slice(0, 8);
            
            for (const biz of topBusinesses) {
              try {
                const reviews = await scrapeReviews(biz.name, normLocation);
                biz.recentReviews = reviews;
              } catch (scrapeErr) {
                console.error(`Skipping ${biz.name} due to scrape error:`, scrapeErr.message);
                biz.recentReviews = [];
              }
            }
            
            await Business.insertMany(topBusinesses);
            businesses = await Business.find({ category: normCategory, searchLocation: normLocation });
          }
        } catch (onDemandErr) {
          console.error('On-demand scraping error:', onDemandErr);
          // Do not fail, just let businesses remain empty
        }
      }

      let dataVolume = 0;

      if (businesses.length === 0) {
        realReviewsData = "Zero existing competitors found in this exact geographic boundary.";
      } else {
        dataVolume = businesses.reduce((acc, b) => acc + (b.recentReviews ? b.recentReviews.length : 0), 0);
        realReviewsData = businesses.map(b => {
          const reviewText = b.recentReviews && b.recentReviews.length > 0 
            ? b.recentReviews.map(r => "- " + r).join('\n') 
            : "- No reviews found.";
          return `Business: ${b.name}\nReviews:\n${reviewText}`;
        }).join('\n\n');
      }

      const systemConfidence = dataVolume >= 10 ? 'High' : (dataVolume >= 4 ? 'Medium' : 'Low');
      const finalContextStr = `${contextStr} | Sanitized Review Count: ${dataVolume} | System Confidence: ${systemConfidence}`;
      const localShopNames = businesses && businesses.length > 0 ? businesses.map(b => b.name).join(', ') : 'None found';

      let shopSpecificInstructions = "";
      const isLowDensity = contextStr.toLowerCase().includes('density: low') || contextStr.toLowerCase().includes('density: zero');

      if (isLowDensity) {
          shopSpecificInstructions = `
     "opportunityScore": (Number 1-15. Do NOT exceed 15),
     "aiRecommendation": "FATAL GEOGRAPHIC FLAW: Do not open a retail shop here. The population density is too low to support physical foot traffic.",
     "strategyPlaybook": ["Cancel lease negotiations immediately.", "Pivot search to a high-density urban center.", "Re-evaluate physical retail strategy."],
          `;
      } else {
          shopSpecificInstructions = `
     "opportunityScore": (Number 50-100 based on competitor weakness),
     "aiRecommendation": (String. Write a 2-sentence market analysis focusing on how to beat the competitors in this specific location. Do NOT mention low foot traffic.),
     "strategyPlaybook": [(Array of 3 Strings. MUST be specific operational/physical tactics like 'Implement valet parking' or 'Upgrade HVAC'. BANNED PHRASES: 'Conduct market research', 'target audience'.)],
          `;
      }

      promptText = `
   Act as a ruthless Market Strategist.
   Location: ${location}
   Context: ${finalContextStr}
   Map Businesses: ${localShopNames}
   Review Data: ${realReviewsData}
   
   Return ONLY valid JSON matching this exact schema with no markdown:
   {
${shopSpecificInstructions}
     "confidenceScore": "${systemConfidence}",
     "competitorMetrics": [(Array of Objects). If 'Review Data' is missing real complaints or contains SEO spam, YOU MUST populate this array using the names from 'Map Businesses'. Assign each name a sentimentScore of 50 and mainWeakness of 'No digital reviews available'.]
   }
      `;
      console.log("FINAL LLM PROMPT:\n", promptText);
    } else if (mode === 'product') {
      try {
        console.log(`Initiating product scraping for ${specificProduct}...`);
        const productReviews = await scrapeProductReviews(specificProduct);
        
        let dataVolume = productReviews.length;
        if (productReviews.length === 0) {
          realReviewsData = "Scraper blocked, no data retrieved";
        } else {
          realReviewsData = productReviews.map(r => "- " + r).join('\n');
        }
        
        // Mock a business array so frontend MapView doesn't crash completely (or it can just render empty)
        businesses = [{
          name: specificProduct,
          category: 'product',
          location: { lat: 0, lng: 0 },
          recentReviews: productReviews
        }];

        const systemConfidence = dataVolume >= 10 ? 'High' : (dataVolume >= 4 ? 'Medium' : 'Low');
        const finalContextStr = `${contextStr} | Sanitized Review Count: ${dataVolume} | System Confidence: ${systemConfidence}`;

        promptText = `Act as a ruthless Hardware Engineering Architect.
   Target Market: ${location}
   Context: ${finalContextStr}
   Global Reviews: ${realReviewsData}

   Return ONLY valid JSON matching this exact schema with no markdown. 
   {
     "opportunityScore": (Number 1-100),
     "aiRecommendation": "String. You MUST write exactly 2 sentences. You MUST explicitly mention how the Climate and Temperature from the Context makes this product physically necessary or vulnerable.",
     "strategyPlaybook": [
       "String 1: State a specific physical hardware or manufacturing modification (e.g., 'Upgrade thermal paste to survive 40C heat').",
       "String 2: State a specific physical hardware or manufacturing modification.",
       "String 3: State a specific physical hardware or manufacturing modification."
     ],
     "confidenceScore": (String). OVERRIDE RULE: If 'Global Reviews' contains Affiliate Blogs or SEO lists (e.g., 'Top 10 best generators') instead of real angry customer complaints, you MUST output 'Low'. Otherwise output '${systemConfidence}'.
     "competitorMetrics": [
       { 
         "name": "Exact Brand Name (e.g., EcoFlow or Anker)", 
         "sentimentScore": (Number 1-100 based on review sentiment), 
         "mainWeakness": "Specific hardware flaw extracted from reviews (String)" 
       }
     ]
   }
   
   CRITICAL HARDWARE RULE: You are strictly FORBIDDEN from suggesting marketing, partnerships, logistics, or research. The 'strategyPlaybook' MUST ONLY contain physical engineering and manufacturing upgrades.
   CRITICAL SCHEMA RULE: You MUST use the exact keys "name", "sentimentScore", and "mainWeakness" for the competitor objects. Do NOT use "brand", "flaws", or nested arrays.`;
        console.log("FINAL LLM PROMPT:\n", promptText); 
      } catch (productErr) {
        console.error('Product scraping error:', productErr);
        return res.status(500).json({ error: 'Failed to scrape product data. Please try again.' });
      }
    }

    // ─── Gemini Cloud Inference ───────────────────────────────────────────────
    // Replaces: Ollama local fetch (llama3 @ localhost:11434)
    // Engine  : gemini-2.5-flash via @google/genai SDK
    // Contract: responseText is identical downstream — all parsing logic below
    //           is left completely untouched.
    // ─────────────────────────────────────────────────────────────────────────
    let responseText;
    try {
      const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const geminiResponse = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: promptText,
        config: {
          temperature: 0.1,
          responseMimeType: 'application/json', // Native JSON mode — prevents markdown filler
        },
      });

      responseText = geminiResponse.text;
    } catch (geminiErr) {
      console.error('[Gemini API Error]', geminiErr.message);

      // Graceful fallback: return a zero-confidence sentinel so the app never crashes.
      // Downstream parsing still works; the UI will show a degraded state.
      responseText = JSON.stringify({
        opportunityScore: 0,
        aiRecommendation: 'AI inference is temporarily unavailable. Please try again shortly.',
        strategyPlaybook: [],
        confidenceScore: '0',
        competitorMetrics: [],
      });
    }
    
    // Parse the AI response
    let aiData;
    try {
      // Clean potential markdown or backticks to ensure valid JSON
      let cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      
      // Extract only the JSON object between the first { and last }
      const startIdx = cleanJson.indexOf('{');
      const endIdx = cleanJson.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1) {
        cleanJson = cleanJson.substring(startIdx, endIdx + 1);
      }
      
      aiData = JSON.parse(cleanJson);
      
      // Sanitize strategyPlaybook to ensure Mongoose schema compliance (Array of Strings)
      if (Array.isArray(aiData.strategyPlaybook)) {
        aiData.strategyPlaybook = aiData.strategyPlaybook.map(item => {
          if (typeof item === 'string') return item;
          if (typeof item === 'object' && item !== null) {
            // Extract text if AI incorrectly returned objects (e.g. {"Step 1": "..."} or {"Step 1...": ""})
            return Object.entries(item).map(([k, v]) => {
              if (v === "" || v === null) return k;
              return `${k}: ${v}`;
            }).join(' | ');
          }
          return String(item);
        });
      } else if (typeof aiData.strategyPlaybook === 'string') {
        aiData.strategyPlaybook = [aiData.strategyPlaybook];
      } else {
        aiData.strategyPlaybook = [];
      }
      
    } catch (parseError) {
      console.error('Failed to parse AI response:', responseText);
      return res.status(500).json({ error: 'Failed to parse AI recommendations.', rawResponse: responseText });
    }

    // ─── Upsert Analysis to Database ─────────────────────────────────────────
    // Uses findOneAndUpdate with upsert:true so that:
    //   • A fresh document is inserted on a cache miss.
    //   • A stale document is atomically overwritten on a cache stale-hit.
    // Mongoose's { timestamps: true } automatically refreshes `updatedAt` on
    // every successful write, resetting the 6-month TTL clock.
    // ─────────────────────────────────────────────────────────────────────────
    const analysisFilter = {
      searchMode: mode,
      searchLocation: normLocation,
      categorySearched: mode === 'product' ? 'Product' : normCategory,
      specificProduct: normProduct,
    };

    const analysisPayload = {
      opportunityScore: aiData.opportunityScore,
      confidenceScore: aiData.confidenceScore || 'Medium',
      aiRecommendation: aiData.aiRecommendation,
      strategyPlaybook: aiData.strategyPlaybook || [],
      competitorMetrics: aiData.competitorMetrics || [],
    };

    try {
      await MarketAnalysis.findOneAndUpdate(
        analysisFilter,
        { $set: analysisPayload },
        { upsert: true, new: true, runValidators: true }
      );
      console.log(`[DB] Analysis upserted for ${mode}: ${normLocation}`);
    } catch (dbError) {
      console.error('[DB Upsert Error]', dbError.message);
      // Non-fatal: return analysis to frontend even if persistence fails
    }

    // Step D: Return clean JSON to frontend
    res.status(200).json({
      location,
      category: mode === 'product' ? 'Product' : category,
      businesses,
      analysis: aiData
    });

  } catch (error) {
    console.error('Analysis Error:', error);
    res.status(500).json({ error: 'An error occurred during market analysis.', details: error.message });
  }
};
