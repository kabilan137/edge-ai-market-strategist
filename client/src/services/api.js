import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
});

export const getBusinesses = () => api.get('/businesses');
export const analyzeMarket = (data) => api.post('/analyze', data, { timeout: 300000 });
