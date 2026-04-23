const axios = require('axios');

async function fetchDensity(lat, lng) {
  try {
    const searchArea = `around:5000,${lat},${lng}`;
    
    // Overpass QL to count all buildings (proxy for population density)
    const overpassUrl = 'http://overpass-api.de/api/interpreter';
    const query = `
      [out:json][timeout:25];
      (
        node["building"](around:2000,${lat},${lng});
        way["building"](around:2000,${lat},${lng});
        relation["building"](around:2000,${lat},${lng});
      );
      out count;
    `;

    const response = await axios.post(overpassUrl, `data=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'MarketOpportunityScout/1.0',
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const elements = response.data.elements || [];
    let count = 0;
    
    if (elements.length > 0 && elements[0].tags) {
       count = (parseInt(elements[0].tags.nodes) || 0) + 
               (parseInt(elements[0].tags.ways) || 0) + 
               (parseInt(elements[0].tags.relations) || 0);
    }

    if (count > 500) return 'High (Urban/Dense)';
    if (count > 100) return 'Medium (Suburban/Average)';
    return 'Low (Rural/Bypass)';

  } catch (error) {
    console.error('Error fetching population density from Overpass:', error.message);
    return 'Unknown';
  }
}

module.exports = { fetchDensity };
