const axios = require('axios');

async function getLocalBusinesses(location, category) {
  try {
    // 1. Get bounding box via Nominatim
    const nomResponse = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`, {
        headers: { 'User-Agent': 'MarketOpportunityScout/1.0' }
    });
    
    if (!nomResponse.data || nomResponse.data.length === 0) {
      console.log('Location not found in Nominatim.');
      return [];
    }
    
    const lat = nomResponse.data[0].lat;
    const lon = nomResponse.data[0].lon;
    const searchArea = `around:5000,${lat},${lon}`;
    
    let osmTag = 'amenity=cafe';
    const lowerCategory = category.toLowerCase();
    if (lowerCategory.includes('pharmacy')) osmTag = 'amenity=pharmacy';
    else if (lowerCategory.includes('repair')) osmTag = 'shop=car_repair';
    else if (lowerCategory.includes('gym') || lowerCategory.includes('fitness')) osmTag = 'leisure=fitness_centre';
    else if (lowerCategory.includes('restaurant')) osmTag = 'amenity=restaurant';
    else osmTag = `amenity=${lowerCategory}`;

    const [k, v] = osmTag.split('=');

    // Overpass QL with radius limit 20
    const overpassUrl = 'http://overpass-api.de/api/interpreter';
    const query = `
      [out:json][timeout:25];
      (
        node["${k}"="${v}"](${searchArea});
        way["${k}"="${v}"](${searchArea});
        relation["${k}"="${v}"](${searchArea});
      );
      out center 20;
    `;
    
    const response = await axios.post(overpassUrl, `data=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'MarketOpportunityScout/1.0',
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    const elements = response.data.elements || [];
    
    const businesses = elements.map(el => {
      let lat = el.lat || (el.center && el.center.lat);
      let lon = el.lon || (el.center && el.center.lon);
      return {
        name: el.tags && el.tags.name ? el.tags.name : `Unnamed ${category}`,
        category: category,
        searchLocation: location.toLowerCase(),
        location: { lat, lng: lon }
      };
    }).filter(b => b.location.lat && b.name !== `Unnamed ${category}`);
    
    return businesses;
  } catch (error) {
    console.error('Error fetching businesses from Overpass:', error.message);
    return [];
  }
}

module.exports = { getLocalBusinesses };
