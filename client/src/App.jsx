import { useState, useEffect, useRef } from 'react';
import TopNav from './components/TopNav';
import MapView from './components/MapView';
import InsightsPanel from './components/InsightsPanel';
import { getBusinesses, analyzeMarket } from './services/api';

function App() {
  const [businesses, setBusinesses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [searchedLocation, setSearchedLocation] = useState(null);

  const intervalRef = useRef(null);

  const loadingMessages = [
    "Initializing Compute Engine...",
    "Querying Overpass API for live OSM data...",
    "Sanitizing Data & Removing Bot Noise...",
    "Evaluating Spatial Context (Weather & Density)...",
    "Gemini 2.5 Flash Compiling Strategic Playbook..."
  ];

  useEffect(() => {
    const fetchBusinesses = async () => {
      try {
        setIsLoading("Waking up local database...");
        const response = await getBusinesses();
        setBusinesses(response.data);
        setError(null);
      } catch (err) {
        console.error("Failed to fetch businesses", err);
        setError("Could not connect to the server. Please ensure the backend is running.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchBusinesses();
  }, []);

  const handleAnalyze = async (searchMode, location, category, specificProduct) => {
    try {
      setIsLoading(loadingMessages[0]);
      let stepIndex = 0;
      intervalRef.current = setInterval(() => {
        stepIndex++;
        if (stepIndex < loadingMessages.length) {
          setIsLoading(loadingMessages[stepIndex]);
        } else {
          setIsLoading(loadingMessages[loadingMessages.length - 1]);
        }
      }, 3000);

      setError(null);
      setSearchedLocation(location || 'Global');
      const response = await analyzeMarket({ searchMode, location, category, specificProduct });
      // businesses array contains Overpass nodes with verified lat/lng — passed
      // directly to MapView for pin rendering, never touched by the LLM pipeline.
      setBusinesses(response.data.businesses || []);
      setAnalysis(response.data.analysis);
    } catch (err) {
      console.error("Failed to analyze market", err);
      setError(err.response?.data?.error || "Failed to analyze market. Please try again.");
    } finally {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 font-sans overflow-hidden">
      <TopNav onSearch={handleAnalyze} isLoading={!!isLoading} />
      <main className="flex-1 flex w-full overflow-hidden">
        <div className="w-[60%] h-full relative z-0">
          {/* MapView receives ONLY Overpass-sourced businesses (verified coordinates).
              The analysis object is intentionally NOT passed here — the map must
              never render AI-generated or geocoded pins. */}
          <MapView
            businesses={businesses}
            searchedLocation={searchedLocation}
            isLoading={isLoading}
            error={error}
          />
        </div>
        <div className="w-[40%] h-full z-10 shadow-[-4px_0_15px_rgba(0,0,0,0.03)]">
          <InsightsPanel analysis={analysis} businesses={businesses} />
        </div>
      </main>
    </div>
  );
}

export default App;
