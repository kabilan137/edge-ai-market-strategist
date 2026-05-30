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
  'hotel':          'hotel',
  'laundry':        'laundry',
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
    // ── Exact-match query (Tier 1 / 2 / leisure) ─────────────────────────
    const { key, value } = tag;
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
  // Uses Overpass regex syntax (~"pattern",i) to search both shop and amenity
  // keys case-insensitively, so no user input ever causes a silent miss or
  // a malformed query.
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
    );
    out center 20;
  `;
}

// ─────────────────────────────────────────────────────────────────────────────

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

    // 4. Execute the Overpass query
    const overpassUrl = 'http://overpass-api.de/api/interpreter';
    const response = await axios.post(
      overpassUrl,
      `data=${encodeURIComponent(query)}`,
      {
        headers: {
          'User-Agent': 'MarketOpportunityScout/1.0',
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const elements = response.data.elements || [];
    console.log(`[Overpass] ${elements.length} raw elements returned.`);

    // 5. Map OSM elements to the Business schema shape
    const businesses = elements
      .map((el) => {
        const elLat = el.lat || (el.center && el.center.lat);
        const elLon = el.lon || (el.center && el.center.lon);
        return {
          name: el.tags && el.tags.name ? el.tags.name : `Unnamed ${category}`,
          category: category,
          searchLocation: location.toLowerCase(),
          location: { lat: elLat, lng: elLon },
        };
      })
      .filter((b) => b.location.lat && b.name !== `Unnamed ${category}`);

    return businesses;
  } catch (error) {
    console.error('[Overpass] Error fetching businesses:', error.message);
    return [];
  }
}

module.exports = { getLocalBusinesses };
