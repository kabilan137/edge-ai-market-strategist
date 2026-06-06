const axios = require('axios');

// ─── Tier 1: Known amenity values ─────────────────────────────────────────────
// OSM amenity=* tag covers civic and food/drink establishments.
const AMENITY_MAP = {
  'cafe':           'cafe',
  'coffee':         'cafe',
  'restaurant':     'restaurant',
  'pharmacy':       'pharmacy',
  'hospital':       'hospital',
  'clinic':         'clinic',
  'bank':           'bank',
  'atm':            'atm',
  'fuel':           'fuel',
  'bar':            'bar',
  'pub':            'pub',
  'fast food':      'fast_food',
  'fast_food':      'fast_food',
  'school':         'school',
  'college':        'college',
  'university':     'university',
  'laundry':        'laundry',
};

// ─── Tier 2b: Tourism values ──────────────────────────────────────────────────
// OSM tourism=* tag covers accommodation and attractions.
const TOURISM_MAP = {
  'hotel':           'hotel',
  'hostel':          'hostel',
  'motel':           'motel',
  'guest house':     'guest_house',
  'guesthouse':      'guest_house',
  'bed and breakfast':'bed_and_breakfast',
  'b&b':             'bed_and_breakfast',
  'resort':          'resort',
  'museum':          'museum',
  'zoo':             'zoo',
};

// ─── Tier 2: Known shop values ────────────────────────────────────────────────
// OSM shop=* tag covers retail establishments.
const SHOP_MAP = {
  'bakery':          'bakery',
  'boutique':        'clothes',
  'clothing':        'clothes',
  'clothing store':  'clothes',
  'grocery':         'convenience',
  'grocery store':   'supermarket',
  'supermarket':     'supermarket',
  'salon':           'hairdresser',
  'hair salon':      'hairdresser',
  'electronics':     'electronics',
  'electronics shop':'electronics',
  'auto repair':     'car_repair',
  'car repair':      'car_repair',
  'repair':          'car_repair',
  'hardware':        'hardware',
  'hardware store':  'hardware',
  'bookshop':        'books',
  'bookstore':       'books',
  'jewellery shop':  'jewelry',
  'jewelry':         'jewelry',
  'pet shop':        'pet',
  'florist':         'florist',
  'optician':        'optician',
};

// ─── Tier 3 handled inline via regex ──────────────────────────────────────────

// ─── Cuisine map (food-type searches → amenity=restaurant + cuisine filter) ───
// OSM uses amenity=restaurant with a cuisine=* sub-tag, NOT a separate amenity.
const CUISINE_MAP = {
  'pizza':           'pizza',
  'pizza place':     'pizza',
  'sushi':           'sushi',
  'sushi restaurant':'sushi',
  'burger':          'burger',
  'burger joint':    'burger',
  'chinese':         'chinese',
  'chinese restaurant':'chinese',
  'indian':          'indian',
  'indian restaurant':'indian',
  'italian':         'italian',
  'italian restaurant':'italian',
  'mexican':         'mexican',
  'thai':            'thai',
  'japanese':        'japanese',
  'korean':          'korean',
  'vegan':           'vegan',
  'vegetarian':      'vegetarian',
  'seafood':         'seafood',
  'steak':           'steak_house',
  'steakhouse':      'steak_house',
  'bbq':             'bbq',
  'barbecue':        'bbq',
  'sandwich':        'sandwich',
  'noodle':          'noodles',
  'noodles':         'noodles',
};

// ─── Leisure map (small set, handled separately) ──────────────────────────────
const LEISURE_MAP = {
  'fitness centre': 'fitness_centre',
  'fitness center': 'fitness_centre',
  'gym':            'fitness_centre',
  'sports centre':  'sports_centre',
  'sports center':  'sports_centre',
  'swimming pool':  'swimming_pool',
};

/**
 * sanitizeInput
 *
 * Trims whitespace and removes characters that have special meaning in
 * Overpass QL strings to prevent query-injection errors.
 * Allowed: letters, digits, spaces, hyphens, underscores, dots.
 *
 * @param {string} raw - The raw user-supplied string.
 * @returns {string}   - A safe string ready to embed in an Overpass query.
 */
function sanitizeInput(raw) {
  return raw
    .trim()
    .replace(/['"\\[\]{}()|<>]/g, '') // strip Overpass-meaningful chars
    .replace(/\s+/g, ' ')             // collapse multiple spaces
    .substring(0, 80);                // reasonable max length
}

/**
 * resolveOsmTag
 *
 * 3-tier tag resolution:
 *  Tier 1 → amenity=*  for food/civic establishments
 *  Tier 2 → shop=*     for retail
 *  Tier 3 → null       signals "use regex fallback" for unknown inputs
 *
 * Returns { key, value } for exact-match tiers, or null for regex fallback.
 *
 * @param {string} category - Sanitized, lowercased user input.
 * @returns {{ key: string, value: string } | null}
 */
function resolveOsmTag(category) {
  const lower = category.toLowerCase();

  if (AMENITY_MAP[lower])  return { key: 'amenity',  value: AMENITY_MAP[lower] };
  if (SHOP_MAP[lower])     return { key: 'shop',     value: SHOP_MAP[lower] };
  if (LEISURE_MAP[lower])  return { key: 'leisure',  value: LEISURE_MAP[lower] };
  if (TOURISM_MAP[lower])  return { key: 'tourism',  value: TOURISM_MAP[lower] };
  // Cuisine lookups return a special shape — amenity=restaurant filtered by cuisine
  if (CUISINE_MAP[lower])  return { key: 'amenity',  value: 'restaurant', cuisine: CUISINE_MAP[lower] };

  // Partial-match pass (handles "auto repair shop" → car_repair, etc.)
  for (const [term, val] of Object.entries(AMENITY_MAP)) {
    if (lower.includes(term)) return { key: 'amenity', value: val };
  }
  for (const [term, val] of Object.entries(SHOP_MAP)) {
    if (lower.includes(term)) return { key: 'shop', value: val };
  }
  for (const [term, val] of Object.entries(LEISURE_MAP)) {
    if (lower.includes(term)) return { key: 'leisure', value: val };
  }
  for (const [term, val] of Object.entries(TOURISM_MAP)) {
    if (lower.includes(term)) return { key: 'tourism', value: val };
  }
  for (const [term, val] of Object.entries(CUISINE_MAP)) {
    if (lower.includes(term)) return { key: 'amenity', value: 'restaurant', cuisine: val };
  }

  return null; // Tier 3: unknown — use regex fallback
}

/**
 * buildOverpassQuery
 *
 * Constructs a safe Overpass QL query string for the given sanitized category
 * and a pre-computed `around:radius,lat,lon` search area string.
 *
 * - Known categories → exact-match tag (highest quality results)
 * - Unknown categories → case-insensitive regex union across shop AND amenity
 *
 * @param {string} sanitizedCategory - Output of sanitizeInput().
 * @param {string} searchArea        - e.g. "around:5000,11.12,78.34"
 * @returns {string} Overpass QL query ready to POST.
 */
function buildOverpassQuery(sanitizedCategory, searchArea) {
  const tag = resolveOsmTag(sanitizedCategory);

  if (tag) {
    const { key, value, cuisine } = tag;

    if (cuisine) {
      // ── Cuisine-filtered query (e.g. pizza → amenity=restaurant + cuisine~pizza) ─
      return `
        [out:json][timeout:25];
        (
          node["${key}"="${value}"]["cuisine"~"${cuisine}",i](${searchArea});
          way["${key}"="${value}"]["cuisine"~"${cuisine}",i](${searchArea});
          relation["${key}"="${value}"]["cuisine"~"${cuisine}",i](${searchArea});
        );
        out center 20;
      `;
    }

    // ── Exact-match query (Tier 1 / 2 / leisure / tourism) ────────────────────
    return `
      [out:json][timeout:25];
      (
        node["${key}"="${value}"](${searchArea});
        way["${key}"="${value}"](${searchArea});
        relation["${key}"="${value}"](${searchArea});
      );
      out center 20;
    `;
  }

  // ── Regex fallback query (Tier 3 — custom / unrecognised input) ───────────
  // Uses Overpass regex syntax (~"pattern",i) to search shop, amenity, leisure
  // and tourism keys case-insensitively, so no user input ever causes a silent
  // miss or a malformed query.
  const pattern = sanitizedCategory.replace(/\s+/g, '_'); // e.g. "wine shop" → "wine_shop"
  return `
    [out:json][timeout:25];
    (
      node["shop"~"${pattern}",i](${searchArea});
      way["shop"~"${pattern}",i](${searchArea});
      relation["shop"~"${pattern}",i](${searchArea});
      node["amenity"~"${pattern}",i](${searchArea});
      way["amenity"~"${pattern}",i](${searchArea});
      relation["amenity"~"${pattern}",i](${searchArea});
      node["leisure"~"${pattern}",i](${searchArea});
      way["leisure"~"${pattern}",i](${searchArea});
      node["tourism"~"${pattern}",i](${searchArea});
      way["tourism"~"${pattern}",i](${searchArea});
    );
    out center 20;
  `;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * retryPost
 *
 * Wraps an axios.post call with simple exponential-backoff retry logic.
 * Retries only on network errors or 5xx responses (transient server failures).
 *
 * @param {string} url        - Target URL.
 * @param {string} data       - POST body.
 * @param {object} config     - Axios request config.
 * @param {number} maxRetries - How many times to retry (default 3).
 * @returns {Promise<object>} Axios response.
 */
async function retryPost(url, data, config, maxRetries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await axios.post(url, data, config);
    } catch (err) {
      lastError = err;
      const status = err.response?.status;
      // Only retry on transient server errors (5xx) or network timeouts
      const isRetryable = !status || (status >= 500 && status <= 599);
      if (!isRetryable || attempt === maxRetries) throw err;
      const delay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s …
      console.warn(`[Overpass] Attempt ${attempt} failed (${status ?? 'network error'}). Retrying in ${delay / 1000}s…`);
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  throw lastError;
}

async function getLocalBusinesses(location, category) {
  try {
    // 1. Geocode location via Nominatim
    const nomResponse = await axios.get(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`,
      { headers: { 'User-Agent': 'MarketOpportunityScout/1.0' } }
    );

    if (!nomResponse.data || nomResponse.data.length === 0) {
      console.log('[Nominatim] Location not found:', location);
      return [];
    }

    const { lat, lon } = nomResponse.data[0];
    const searchArea = `around:5000,${lat},${lon}`;

    // 2. Sanitize the user-supplied category string
    const safeCategory = sanitizeInput(category);
    if (!safeCategory) {
      console.warn('[Overpass] Category was empty after sanitization.');
      return [];
    }

    // 3. Build the appropriate Overpass query
    const query = buildOverpassQuery(safeCategory, searchArea);
    console.log(`[Overpass] Querying for "${safeCategory}" near ${location}...`);

    // 4. Execute the Overpass query (with retry on 5xx / timeout)
    const overpassUrl = 'https://overpass-api.de/api/interpreter';
    const response = await retryPost(
      overpassUrl,
      `data=${encodeURIComponent(query)}`,
      {
        headers: {
          'User-Agent': 'MarketOpportunityScout/1.0',
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 30000, // 30 s hard cap — prevents hanging indefinitely
      }
    );

    const elements = response.data.elements || [];
    console.log(`[Overpass] ${elements.length} raw elements returned.`);

    // 5. Map OSM elements to the Business schema shape
    //    Keep ALL elements that have valid coordinates — even unnamed ones.
    //    (The previous filter discarded every node without a `name` tag, which
    //     silently eliminated the majority of OSM results in many regions.)
    const businesses = elements
      .map((el) => {
        const elLat = el.lat    ?? (el.center && el.center.lat);
        const elLon = el.lon    ?? (el.center && el.center.lon);
        // Build a human-readable fallback name from available OSM tags
        const fallbackName =
          (el.tags && (el.tags['brand'] || el.tags['operator'] || el.tags['ref']))
            ? (el.tags['brand'] || el.tags['operator'] || el.tags['ref'])
            : `Unnamed ${category}`;
        return {
          name:           el.tags && el.tags.name ? el.tags.name : fallbackName,
          category:       category,
          searchLocation: location.toLowerCase(),
          location:       { lat: elLat, lng: elLon },
        };
      })
      // Only discard elements that have NO usable coordinates
      .filter((b) => b.location.lat != null && b.location.lng != null);

    console.log(`[Overpass] ${businesses.length} businesses after coordinate filter.`);
    return businesses;
  } catch (error) {
    console.error('[Overpass] Error fetching businesses:', error.message);
    return [];
  }
}

module.exports = { getLocalBusinesses };
