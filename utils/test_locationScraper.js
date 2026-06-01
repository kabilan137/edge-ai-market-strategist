/**
 * test_locationScraper.js
 *
 * Diagnostic test for getLocalBusinesses() in locationScraper.js
 * Run with:  node utils/test_locationScraper.js
 */

const axios = require('axios');

// ── helpers ────────────────────────────────────────────────────────────────────

const PASS = '\x1b[32m✔ PASS\x1b[0m';
const FAIL = '\x1b[31m✘ FAIL\x1b[0m';
const INFO = '\x1b[36mℹ INFO\x1b[0m';

function assert(condition, msg) {
  console.log(`  ${condition ? PASS : FAIL}  ${msg}`);
  return condition;
}

// ── Step 1: Unit-test sanitizeInput & resolveOsmTag ────────────────────────────

function testSanitizeInput() {
  // replicate the function locally since it's not exported
  function sanitizeInput(raw) {
    return raw
      .trim()
      .replace(/['"\\\[\]{}()|<>]/g, '')
      .replace(/\s+/g, ' ')
      .substring(0, 80);
  }

  console.log('\n=== Unit tests: sanitizeInput ===');
  assert(sanitizeInput('  cafe  ') === 'cafe',           'trims whitespace');
  assert(sanitizeInput("café'\"\\") === 'café',          'strips special chars');
  assert(sanitizeInput('fast   food') === 'fast food',   'collapses spaces');
  assert(sanitizeInput('a'.repeat(100)).length === 80,   'caps at 80 chars');
}

// ── Step 2: Nominatim geocoding ────────────────────────────────────────────────

async function testNominatim(location) {
  console.log(`\n=== Step 2: Nominatim geocoding for "${location}" ===`);
  try {
    const res = await axios.get(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`,
      { headers: { 'User-Agent': 'MarketOpportunityScout/1.0' }, timeout: 10000 }
    );

    const ok = res.data && res.data.length > 0;
    assert(ok, `Nominatim returned a result for "${location}"`);

    if (ok) {
      const { lat, lon, display_name } = res.data[0];
      console.log(`  ${INFO}  Resolved → lat=${lat}, lon=${lon}`);
      console.log(`  ${INFO}  Display name: ${display_name}`);
      return { lat, lon };
    }
  } catch (e) {
    assert(false, `Nominatim request failed: ${e.message}`);
  }
  return null;
}

// ── Step 3: Overpass raw query (no filter) ─────────────────────────────────────

async function testOverpassRaw(lat, lon, osmKey, osmValue) {
  console.log(`\n=== Step 3: Raw Overpass query [${osmKey}=${osmValue}] near (${lat},${lon}) ===`);

  const searchArea = `around:5000,${lat},${lon}`;
  const query = `
    [out:json][timeout:25];
    (
      node["${osmKey}"="${osmValue}"](${searchArea});
      way["${osmKey}"="${osmValue}"](${searchArea});
      relation["${osmKey}"="${osmValue}"](${searchArea});
    );
    out center 20;
  `;

  try {
    const res = await axios.post(
      'https://overpass-api.de/api/interpreter',
      `data=${encodeURIComponent(query)}`,
      {
        headers: {
          'User-Agent': 'MarketOpportunityScout/1.0',
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 30000,
      }
    );

    const elements = res.data.elements || [];
    assert(elements.length > 0, `Overpass returned ${elements.length} raw elements (before filter)`);

    if (elements.length > 0) {
      const withName    = elements.filter(e => e.tags && e.tags.name);
      const withoutName = elements.filter(e => !e.tags || !e.tags.name);
      const withCoords  = elements.filter(e => {
        const lat2 = e.lat || (e.center && e.center.lat);
        return lat2 && lat2 !== 0;
      });

      console.log(`  ${INFO}  Elements WITH a name tag:    ${withName.length}`);
      console.log(`  ${INFO}  Elements WITHOUT a name tag: ${withoutName.length}`);
      console.log(`  ${INFO}  Elements WITH valid coords:  ${withCoords.length}`);

      // ── THIS IS THE BUG DIAGNOSTIC ──────────────────────────────────────────
      const afterCurrentFilter = elements
        .map(el => {
          const elLat = el.lat || (el.center && el.center.lat);
          const elLon = el.lon || (el.center && el.center.lon);
          return {
            name: el.tags && el.tags.name ? el.tags.name : `Unnamed cafe`,
            location: { lat: elLat, lng: elLon },
          };
        })
        .filter(b => b.location.lat && b.name !== 'Unnamed cafe');

      console.log(`\n  ⚠️  After current filter logic → ${afterCurrentFilter.length} results`);
      if (afterCurrentFilter.length === 0 && elements.length > 0) {
        console.log(`  \x1b[33m🐛 BUG CONFIRMED\x1b[0m: The filter on line 225 drops everything!`);
        console.log(`     Reason: ${withoutName.length} elements have no name tag and get filtered out.`);
        console.log(`     Fix: Remove the \`b.name !== \`Unnamed \${category}\`\` part of the filter.`);
      }

      console.log('\n  Sample elements (first 3):');
      elements.slice(0, 3).forEach((el, i) => {
        const elLat = el.lat || (el.center && el.center.lat);
        const elLon = el.lon || (el.center && el.center.lon);
        console.log(`    [${i + 1}] type=${el.type} lat=${elLat} lon=${elLon} name=${el.tags?.name || '(none)'}`);
      });
    }

    return elements;
  } catch (e) {
    assert(false, `Overpass request failed: ${e.message}`);
    return [];
  }
}

// ── Step 4: Full end-to-end call through the actual module ────────────────────

async function testFullModule(location, category) {
  console.log(`\n=== Step 4: Full getLocalBusinesses("${location}", "${category}") ===`);

  // Clear require cache so we always load fresh
  const modPath = require.resolve('./locationScraper');
  delete require.cache[modPath];

  const { getLocalBusinesses } = require('./locationScraper');

  try {
    const results = await getLocalBusinesses(location, category);
    assert(Array.isArray(results),    'Returns an array');
    assert(results.length > 0,        `Returns at least 1 result (got ${results.length})`);

    if (results.length > 0) {
      const sample = results[0];
      assert(typeof sample.name === 'string',           'Result has a name field');
      assert(typeof sample.location === 'object',       'Result has a location object');
      assert(typeof sample.location.lat === 'number',   'location.lat is a number');
      assert(typeof sample.location.lng === 'number',   'location.lng is a number');
      console.log(`\n  Sample result:\n${JSON.stringify(results[0], null, 4)}`);
    }

    return results;
  } catch (e) {
    assert(false, `getLocalBusinesses threw: ${e.message}`);
    return [];
  }
}

// ── Main runner ────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║         locationScraper Diagnostic Test Suite               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // Config — change these to wherever you're searching
  const TEST_LOCATION = 'Chennai, India';
  const TEST_CATEGORY = 'cafe';
  const OSM_KEY       = 'amenity';
  const OSM_VALUE     = 'cafe';

  // 1. Local unit tests (no network)
  testSanitizeInput();

  // 2. Network tests
  const coords = await testNominatim(TEST_LOCATION);

  if (coords) {
    await testOverpassRaw(coords.lat, coords.lon, OSM_KEY, OSM_VALUE);
  }

  // 4. Full module test (exposes the real filtered output)
  await testFullModule(TEST_LOCATION, TEST_CATEGORY);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Test run complete.');
  console.log('═══════════════════════════════════════════════════════════════\n');
})();
