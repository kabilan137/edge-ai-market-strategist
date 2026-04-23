const axios = require('axios');

async function fetchClimate(lat, lng) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,precipitation_sum&timezone=auto`;
    const response = await axios.get(url);
    const data = response.data.daily;

    if (!data || !data.temperature_2m_max || data.temperature_2m_max.length === 0) {
      return "Unknown";
    }

    // Calculate basic averages
    const avgTemp = (data.temperature_2m_max.reduce((a, b) => a + b, 0) / data.temperature_2m_max.length).toFixed(1);
    const totalPrecip = data.precipitation_sum.reduce((a, b) => a + b, 0).toFixed(1);

    return `Avg Max Temp: ${avgTemp}°C, Total 7-Day Precipitation: ${totalPrecip}mm`;
  } catch (error) {
    console.error('Error fetching climate data:', error.message);
    return "Unknown";
  }
}

module.exports = { fetchClimate };
