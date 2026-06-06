const axios = require('axios');
const { GoogleGenAI } = require('@google/genai');
const MarketAnalysis = require('../models/MarketAnalysis');
const Business = require('../models/Business');
const { getLocalBusinesses } = require('../utils/locationScraper');
const { scrapeReviews } = require('../utils/reviewScraper');
const { scrapeProductReviews } = require('../utils/productScraper');
const { fetchClimate } = require('../utils/fetchClimate');
const { fetchDensity } = require('../utils/fetchDensity');

// ─── ARCHITECTURAL MANDATE ────────────────────────────────────────────────────
// Gemini is a DATA ANALYZER — never a DATA GENERATOR.
//
// Overpass OSM nodes are the single source of truth for competitor existence.
// If Overpass returns 0 nodes:
//   → The pipeline short-circuits BEFORE calling Gemini.
//   → A deterministic Greenfield sentinel (confidence_score: 0.1) is returned.
//   → No LLM call is made; no data is invented.
//
// If Overpass returns ≥1 node:
//   → Gemini receives ONLY the real node names and review snippets.
//   → Gemini is FORBIDDEN from adding competitor names not in the input list.
//   → competitorMetrics keys MUST match the provided node names exactly.
// ─────────────────────────────────────────────────────────────────────────────

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
    const normProduct  = specificProduct ? specificProduct.trim().toLowerCase() : '';

    // ─── Application-Level Cache Validation (TTL: 6 months) ──────────────────
    const CACHE_TTL_MS = 6 * 30 * 24 * 60 * 60 * 1000;

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

        console.log(`[Cache HIT - STALE] ${mode}: ${normLocation} / ${normCategory || normProduct} (age: ${Math.floor(ageMs / 86400000)}d). Re-running live pipeline...`);
      } else {
        console.log(`[Cache MISS] ${mode}: ${normLocation} / ${normCategory || normProduct}. Running live pipeline...`);
      }
    } catch (cacheErr) {
      console.warn('[Cache Check Failed] Falling back to live pipeline:', cacheErr.message);
    }

    // ─── Universal Spatial Context ────────────────────────────────────────────
    let contextStr = 'Unknown';
    try {
      if (normLocation) {
        const nomResponse = await axios.get(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(normLocation)}&limit=1`,
          { headers: { 'User-Agent': 'MarketOpportunityScout/1.0' } }
        );
        if (nomResponse.data && nomResponse.data.length > 0) {
          const { lat, lon: lng } = nomResponse.data[0];
          const [climateResult, densityResult] = await Promise.all([
            fetchClimate(lat, lng),
            fetchDensity(lat, lng)
          ]);
          contextStr = `Climate: ${climateResult} | Density: ${densityResult}`;
        }
      }
    } catch (ctxErr) {
      console.warn('Universal Spatial context failed:', ctxErr.message);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // SHOP MODE
    // ═════════════════════════════════════════════════════════════════════════
    if (mode === 'shop') {
      // 1. Read from DB cache first
      try {
        businesses = await Business.find({ category: normCategory, searchLocation: normLocation });
      } catch (dbErr) {
        console.error('Database query error:', dbErr);
        return res.status(500).json({ error: 'Database connection or timeout error.' });
      }

      // 2. On-demand Overpass scrape if DB has nothing
      if (businesses.length === 0) {
        console.log(`No cached data for ${normCategory} in ${normLocation}. Querying Overpass API...`);
        try {
          const scrapedBusinesses = await getLocalBusinesses(normLocation, normCategory);

          if (scrapedBusinesses.length > 0) {
            const topBusinesses = scrapedBusinesses.slice(0, 8);

            for (const biz of topBusinesses) {
              try {
                const reviews = await scrapeReviews(biz.name, normLocation);
                biz.recentReviews = reviews;
              } catch (scrapeErr) {
                console.error(`Skipping review scrape for ${biz.name}:`, scrapeErr.message);
                biz.recentReviews = [];
              }
            }

            await Business.insertMany(topBusinesses);
            businesses = await Business.find({ category: normCategory, searchLocation: normLocation });
          }
        } catch (onDemandErr) {
          console.error('On-demand Overpass scraping error:', onDemandErr);
        }
      }

      // ─── DETERMINISTIC GREENFIELD BRANCH ───────────────────────────────────
      // Overpass returned zero nodes → market is Greenfield by definition.
      // Skip Gemini entirely. Return a structured Low-Confidence sentinel.
      // This is NOT an LLM decision — it is a hard data-integrity check.
      // ───────────────────────────────────────────────────────────────────────
      if (businesses.length === 0) {
        console.log(`[Greenfield] Zero Overpass nodes for ${normCategory} in ${normLocation}. Returning deterministic Greenfield response.`);

        const greenfieldPayload = {
          marketState:      'greenfield',
          opportunityScore: 92,          // high — no incumbents means clear runway
          confidenceScore:  'Low',
          aiRecommendation: `No live ${normCategory} assets were detected in the Overpass OSM registry for ${location}. This market has zero verified incumbent nodes, signalling a first-mover opportunity — but the Low Confidence score reflects the absence of raw data to corroborate this signal. Conduct a physical site survey before committing capital.`,
          strategyPlaybook: [
            `Perform a physical site survey of ${location} before signing any lease — OSM coverage may be incomplete.`,
            `Register your business on Google Maps and OpenStreetMap immediately to claim first-mover digital presence.`,
            `Install high-visibility signage and invest in exterior lighting to capitalise on zero incumbent foot-traffic competition.`
          ],
          competitorMetrics: [],   // authoritative empty array — Overpass found nothing
          competitor_count:  0,
        };

        // Persist the Greenfield sentinel to DB so future cache hits return it
        const analysisFilter = {
          searchMode:       mode,
          searchLocation:   normLocation,
          categorySearched: normCategory,
          specificProduct:  normProduct,
        };
        try {
          await MarketAnalysis.findOneAndUpdate(
            analysisFilter,
            { $set: greenfieldPayload },
            { upsert: true, returnDocument: 'after', runValidators: true }
          );
          console.log(`[DB] Greenfield sentinel upserted for ${normLocation}/${normCategory}`);
        } catch (dbError) {
          console.error('[DB Upsert Error - Greenfield]', dbError.message);
        }

        return res.status(200).json({
          location,
          category,
          businesses: [],
          analysis:   greenfieldPayload
        });
      }

      // ─── COMPETITIVE BRANCH: ≥1 Overpass node exists ──────────────────────
      // Build review context from real scraped data only.
      const dataVolume = businesses.reduce((acc, b) => acc + (b.recentReviews?.length || 0), 0);
      realReviewsData = businesses.map(b => {
        const reviewText = b.recentReviews && b.recentReviews.length > 0
          ? b.recentReviews.map(r => `- ${r}`).join('\n')
          : '- No reviews found.';
        return `Business: ${b.name}\nReviews:\n${reviewText}`;
      }).join('\n\n');

      const systemConfidence = dataVolume >= 10 ? 'High' : dataVolume >= 4 ? 'Medium' : 'Low';
      const finalContextStr  = `${contextStr} | Overpass Node Count: ${businesses.length} | Scraped Review Count: ${dataVolume} | System Confidence: ${systemConfidence}`;

      // The ONLY competitor names Gemini is allowed to use
      const verifiedNodeNames = businesses.map(b => b.name).join(', ');

      const isLowDensity = contextStr.toLowerCase().includes('density: low') ||
                           contextStr.toLowerCase().includes('density: zero');

      let shopInstructions = '';
      if (isLowDensity) {
        shopInstructions = `
     "opportunityScore": (Number 1-15. Do NOT exceed 15),
     "aiRecommendation": "FATAL GEOGRAPHIC FLAW: Population density is too low to support physical retail foot traffic at this location.",
     "strategyPlaybook": ["Cancel lease negotiations immediately.", "Pivot to a high-density urban centre.", "Re-evaluate physical retail strategy."],`;
      } else {
        shopInstructions = `
     "opportunityScore": (Number 50-100 based on the weakness signals found in the review data),
     "aiRecommendation": (String. Write a 2-sentence market analysis on how to outcompete the listed businesses based ONLY on the review evidence provided. Do NOT invent claims not supported by the review data.),
     "strategyPlaybook": [(Array of 3 Strings. MUST be specific operational tactics like 'Install valet parking' or 'Upgrade HVAC'. BANNED: 'Conduct market research', 'target audience'.)],`;
      }

      promptText = `
You are a Market Strategist. Your role is to ANALYZE the provided data — never to generate or invent data.

Location: ${location}
Context: ${finalContextStr}

VERIFIED COMPETITOR LIST (from Overpass OSM — these are the ONLY businesses that exist in this market):
${verifiedNodeNames}

SCRAPED REVIEW DATA (raw text from public sources):
${realReviewsData}

STRICT ANALYSIS RULES:
1. You MUST populate "competitorMetrics" using ONLY the business names listed in the VERIFIED COMPETITOR LIST above.
2. You are STRICTLY FORBIDDEN from adding any competitor name that does not appear in the VERIFIED COMPETITOR LIST.
3. If a business has no review data, set sentimentScore to 50 (neutral — no data) and mainWeakness to "No public reviews detected".
4. You MUST NOT guess, hallucinate, or infer competitor names from your training knowledge.

Return ONLY valid JSON with no markdown:
{
${shopInstructions}
  "confidenceScore": "${systemConfidence}",
  "marketState": "competitive",
  "competitorMetrics": [
    {
      "name": "(String — MUST be one of: ${verifiedNodeNames})",
      "sentimentScore": (Number 1-100. Derived from the review text above. Use 50 if no reviews.),
      "mainWeakness": "(String. Extracted from the review text above. Use 'No public reviews detected' if none.)"
    }
  ]
  CRITICAL SCHEMA RULE: Keys MUST be exactly "name", "sentimentScore", "mainWeakness". sentimentScore MUST be a Number, never a String.
}
      `;
      console.log('FINAL LLM PROMPT:\n', promptText);

    // ═══════════════════════════════════════════════════════════════════════
    // PRODUCT MODE
    // ═══════════════════════════════════════════════════════════════════════
    } else if (mode === 'product') {
      try {
        console.log(`Initiating localized product review scrape for "${specificProduct}" in "${location}"...`);
        const productReviews = await scrapeProductReviews(specificProduct, location);

        const dataVolume = productReviews.length;
        if (dataVolume === 0) {
          realReviewsData = 'Scraper blocked or no reviews retrieved — data volume is zero.';
        } else {
          realReviewsData = productReviews.map(r => `- ${r}`).join('\n');
        }

        // product mode has no Overpass nodes — a single synthetic entry tracks the search target
        businesses = [{
          name: specificProduct,
          category: 'product',
          location: { lat: 0, lng: 0 },
          recentReviews: productReviews
        }];

        const systemConfidence = dataVolume >= 10 ? 'High' : dataVolume >= 4 ? 'Medium' : 'Low';
        const finalContextStr  = `${contextStr} | Scraped Review Count: ${dataVolume} | System Confidence: ${systemConfidence}`;

        // For product mode: Gemini may name brands ONLY if they appear in the scraped review text.
        // If the scraper returned nothing, competitorMetrics MUST be an empty array.
        const brandExtractionRule = dataVolume === 0
          ? 'The scraper returned zero reviews. You MUST return competitorMetrics as an empty array [].'
          : 'Extract brand names ONLY from the text inside <localized_scraped_reviews>. Do NOT add brands from your training knowledge.';

        promptText = `
<system_role>
You are a Hardware Engineering Architect at Antigravity — a location-intelligence firm.
Your SOLE mandate is to ANALYZE the structured data provided below and return a precise,
engineering-grade market assessment. You MUST NOT invent, hallucinate, or supplement
the provided data with information from your training knowledge.
</system_role>

<context>
  <target_location>${location}</target_location>
  <product_category>${specificProduct}</product_category>
  <pipeline_context>${finalContextStr}</pipeline_context>
  <localized_scraped_reviews source="DuckDuckGo — localized query for '${location} ${specificProduct}'">
${realReviewsData}
  </localized_scraped_reviews>
</context>

<rules>
  <rule id="LOCAL_COMPETITOR_ISOLATION" priority="CRITICAL">
    You are operating on LOCALIZED review data scraped specifically for the "${location}" market.
    You MUST extract competitor/brand names ONLY from the text inside <localized_scraped_reviews>.
    You are STRICTLY FORBIDDEN from injecting brand names from your training knowledge — even
    well-known global brands (e.g. Bosch, Philips, LG) MUST NOT appear unless their name is
    explicitly present in the scraped text above.
    ${brandExtractionRule}
  </rule>
  <rule id="CLIMATE_CONDITIONALITY" priority="CRITICAL">
    Evaluate whether climate, temperature, or weather MATERIALLY impacts the physical hardware
    of "${specificProduct}" (e.g. corrosion from humidity, thermal expansion, UV degradation,
    outdoor waterproofing requirements, condensation on electronics).
    — IF climate materially impacts this hardware: include one focused sentence on the specific
      environmental engineering implication for the "${location}" climate in aiRecommendation.
    — IF climate is irrelevant to this hardware category: OMIT all weather/temperature/climate
      references entirely from aiRecommendation. Do not force-fit an environmental angle.
  </rule>
  <rule id="HARDWARE_ONLY_STRATEGY" priority="CRITICAL">
    strategyPlaybook MUST contain ONLY physical engineering or manufacturing modifications.
    FORBIDDEN entries: marketing campaigns, partnerships, market research, audience targeting,
    pricing strategies, distribution channels, or any non-physical recommendation.
  </rule>
  <rule id="SCHEMA_INTEGRITY" priority="CRITICAL">
    JSON keys must be EXACTLY as specified. sentimentScore MUST be a Number, never a String.
  </rule>
</rules>

<output_schema>
Return ONLY valid JSON. No markdown fences. No commentary before or after the JSON block.
{
  "opportunityScore": (Number 1-100, reflecting the engineering gap opportunity in ${location} based on review pain points),
  "aiRecommendation": "String. Exactly 2 sentences. Follow the CLIMATE_CONDITIONALITY rule above.",
  "strategyPlaybook": [
    "String 1: A specific physical hardware or manufacturing modification for the ${location} market.",
    "String 2: A specific physical hardware or manufacturing modification for the ${location} market.",
    "String 3: A specific physical hardware or manufacturing modification for the ${location} market."
  ],
  "confidenceScore": "${systemConfidence}",
  "marketState": "competitive",
  "competitorMetrics": [
    {
      "name": "(Brand name extracted EXCLUSIVELY from <localized_scraped_reviews> text — never from training knowledge)",
      "sentimentScore": (Number 1-100 derived from review sentiment for this brand. Use 50 if no review data.),
      "mainWeakness": "(Specific hardware flaw extracted from review text for this brand. Use 'No public reviews detected' if none.)"
    }
  ]
}
</output_schema>
        `;
        console.log('FINAL LLM PROMPT:\n', promptText);
      } catch (productErr) {
        console.error('Product scraping error:', productErr);
        return res.status(500).json({ error: 'Failed to scrape product data. Please try again.' });
      }
    }

    // ─── Gemini Cloud Inference ───────────────────────────────────────────────
    // Gemini is called ONLY when Overpass returned ≥1 node (shop) or the product
    // scraper ran. It receives real data and is forbidden from inventing any.
    // ─────────────────────────────────────────────────────────────────────────
    let responseText;
    try {
      const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const geminiResponse = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: promptText,
        config: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      });

      responseText = geminiResponse.text;
    } catch (geminiErr) {
      console.error('[Gemini API Error]', geminiErr.message);
      responseText = JSON.stringify({
        opportunityScore:  0,
        aiRecommendation:  'AI inference is temporarily unavailable. Please try again shortly.',
        strategyPlaybook:  [],
        confidenceScore:   'Low',
        marketState:       'competitive',
        competitorMetrics: [],
      });
    }

    // ─── Parse & Sanitize Gemini Response ────────────────────────────────────
    let aiData;
    try {
      let cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const startIdx = cleanJson.indexOf('{');
      const endIdx   = cleanJson.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1) {
        cleanJson = cleanJson.substring(startIdx, endIdx + 1);
      }
      aiData = JSON.parse(cleanJson);

      // ── Sanitize competitorMetrics ──────────────────────────────────────────
      // Additional integrity check: in shop mode, strip any competitor that is NOT
      // in the verified Overpass node list (guards against Gemini ignoring the rule).
      const verifiedSet = new Set(
        mode === 'shop' ? businesses.map(b => b.name.toLowerCase()) : []
      );

      if (Array.isArray(aiData.competitorMetrics)) {
        aiData.competitorMetrics = aiData.competitorMetrics
          .map(item => {
            if (!item || typeof item !== 'object') return null;

            const name =
              item.name ?? item.business ?? item.brand ?? item.competitor ?? null;

            // INTEGRITY GATE: In shop mode, reject any name not in the Overpass list.
            if (mode === 'shop' && name && !verifiedSet.has(String(name).toLowerCase())) {
              console.warn(`[Integrity] Gemini injected unknown competitor "${name}" — stripped.`);
              return null;
            }

            const rawScore = item.sentimentScore ?? item.sentiment_score ?? item.score ?? item.rating ?? 50;
            const sentimentScore = Math.min(100, Math.max(1, Number(rawScore) || 50));

            const mainWeakness =
              item.mainWeakness ?? item.main_weakness ?? item.weakness ?? item.flaw ?? 'No public reviews detected';

            return {
              name:         String(name || 'Unknown'),
              sentimentScore,
              mainWeakness: String(mainWeakness),
            };
          })
          .filter(Boolean);
      } else {
        aiData.competitorMetrics = [];
      }

      // ── Sanitize strategyPlaybook ───────────────────────────────────────────
      if (Array.isArray(aiData.strategyPlaybook)) {
        aiData.strategyPlaybook = aiData.strategyPlaybook.map(item => {
          if (typeof item === 'string') return item;
          if (typeof item === 'object' && item !== null) {
            return Object.entries(item).map(([k, v]) => (v === '' || v === null ? k : `${k}: ${v}`)).join(' | ');
          }
          return String(item);
        });
      } else if (typeof aiData.strategyPlaybook === 'string') {
        aiData.strategyPlaybook = [aiData.strategyPlaybook];
      } else {
        aiData.strategyPlaybook = [];
      }

      // Ensure marketState is set
      aiData.marketState = aiData.marketState || 'competitive';

    } catch (parseError) {
      console.error('Failed to parse Gemini response:', responseText);
      return res.status(500).json({ error: 'Failed to parse AI recommendations.', rawResponse: responseText });
    }

    // ─── Upsert to Database ───────────────────────────────────────────────────
    const analysisFilter = {
      searchMode:       mode,
      searchLocation:   normLocation,
      categorySearched: mode === 'product' ? 'Product' : normCategory,
      specificProduct:  normProduct,
    };

    const analysisPayload = {
      marketState:       aiData.marketState,
      opportunityScore:  aiData.opportunityScore,
      confidenceScore:   aiData.confidenceScore || 'Low',
      aiRecommendation:  aiData.aiRecommendation,
      strategyPlaybook:  aiData.strategyPlaybook || [],
      competitorMetrics: aiData.competitorMetrics || [],
    };

    try {
      await MarketAnalysis.findOneAndUpdate(
        analysisFilter,
        { $set: analysisPayload },
        { upsert: true, returnDocument: 'after', runValidators: true }
      );
      console.log(`[DB] Analysis upserted for ${mode}: ${normLocation}`);
    } catch (dbError) {
      console.error('[DB Upsert Error]', dbError.message);
    }

    res.status(200).json({
      location,
      category:   mode === 'product' ? 'Product' : category,
      businesses,
      analysis:   aiData
    });

  } catch (error) {
    console.error('Analysis Error:', error);
    res.status(500).json({ error: 'An error occurred during market analysis.', details: error.message });
  }
};
