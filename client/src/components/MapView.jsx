import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';

function MapUpdater({ businesses, searchedLocation }) {
  const map = useMap();
  useEffect(() => {
    let isMounted = true;
    
    if (searchedLocation) {
      fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchedLocation)}`)
        .then(res => res.json())
        .then(data => {
          if (isMounted && data && data.length > 0) {
            const lat = parseFloat(data[0].lat);
            const lon = parseFloat(data[0].lon);
            map.flyTo([lat, lon], 15, { duration: 1.5 });
          } else if (isMounted && businesses && businesses.length > 0 && businesses[0].location) {
            map.setView([businesses[0].location.lat, businesses[0].location.lng], 15);
          }
        })
        .catch(err => {
          console.error("Geocoding failed", err);
          if (isMounted && businesses && businesses.length > 0 && businesses[0].location) {
            map.setView([businesses[0].location.lat, businesses[0].location.lng], 15);
          }
        });
    } else if (businesses && businesses.length > 0 && businesses[0].location) {
      map.setView([businesses[0].location.lat, businesses[0].location.lng], 15);
    }

    return () => { isMounted = false; };
  }, [businesses, searchedLocation, map]);
  return null;
}

export default function MapView({ businesses = [], searchedLocation, isLoading, error }) {
  const defaultCenter = [9.9285, 78.1448]; // Anna Nagar, Madurai from mock data
  
  const circleCenter = businesses && businesses.length > 0 && businesses[0].location
    ? [businesses[0].location.lat, businesses[0].location.lng]
    : [9.9300, 78.1400];

  const handlePinClick = (business) => {
    // If the scraped data has a website, go there. Otherwise, search Google Maps.
    const locationString = typeof business.location === 'object' ? `${business.location.lat},${business.location.lng}` : business.location;
    const targetUrl = business.website 
      ? business.website 
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.name + ' ' + (searchedLocation || locationString))}`;
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };

  if (isLoading) {
    return (
      <div className="w-full h-full bg-slate-100 flex flex-col items-center justify-center p-6 text-center">
        <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
        <span className="text-slate-700 font-semibold text-lg">{typeof isLoading === 'string' ? isLoading : "Loading..."}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full bg-slate-100 flex items-center justify-center">
        <div className="bg-red-50 text-red-600 p-4 rounded-md border border-red-200">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-slate-100 relative">
      <MapContainer center={defaultCenter} zoom={13} scrollWheelZoom={true} className="w-full h-full z-0">
        <MapUpdater businesses={businesses} searchedLocation={searchedLocation} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        
        {/* Render dynamic business markers */}
        {businesses.map((business, index) => (
          <Marker 
            key={business._id || index} 
            position={[business.location.lat, business.location.lng]}
            eventHandlers={{ click: () => handlePinClick(business) }}
          >
            <Popup>
              <strong>{business.name}</strong><br/>
              Category: {business.category}<br/>
              Rating: {business.rating}⭐<br/>
              <span className="text-blue-600 text-xs mt-1 block cursor-pointer underline">Click map pin to view website/map</span>
            </Popup>
          </Marker>
        ))}

        {/* Heatmap/Opportunity zone */}
        <Circle center={circleCenter} pathOptions={{ fillColor: '#1D4ED8', color: '#1D4ED8', fillOpacity: 0.2 }} radius={600}>
          <Popup>High Opportunity Zone</Popup>
        </Circle>
      </MapContainer>
      
      {/* Map Overlay Controls */}
      <div className="absolute top-4 right-4 z-[400] flex flex-col gap-2 pointer-events-none">
        <div className="bg-white/90 backdrop-blur-sm border border-slate-200 shadow-sm p-4 pointer-events-auto">
          <h4 className="text-xs font-semibold text-slate-900 mb-3 uppercase tracking-wider">Map Legend</h4>
          <div className="flex items-center gap-3 text-sm text-slate-700 mb-2">
            <div className="w-3 h-3 bg-blue-600 rounded-full opacity-60"></div>
            <span>High Opportunity</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-700">
            <div className="w-3 h-3 border-2 border-blue-600 rounded-full flex items-center justify-center">
                <div className="w-1 h-1 bg-blue-600 rounded-full"></div>
            </div>
            <span>Existing Competitor</span>
          </div>
        </div>
      </div>
    </div>
  );
}
