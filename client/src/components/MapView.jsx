import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import L from 'leaflet';

// ─── Custom SVG pin icon ────────────────────────────────────────────────────
// Single icon style: every pin on this map represents a real Overpass OSM node
// with a verified lat/lng coordinate.  AI-generated or geocoded pins are
// explicitly prohibited by the architectural mandate.

function makeSvgIcon(color) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="32" height="42">
      <ellipse cx="16" cy="40" rx="6" ry="2" fill="rgba(0,0,0,0.18)"/>
      <path d="M16 2C9.37 2 4 7.37 4 14c0 9 12 26 12 26S28 23 28 14C28 7.37 22.63 2 16 2z"
            fill="${color}" stroke="white" stroke-width="1.5"/>
      <circle cx="16" cy="14" r="5" fill="white" fill-opacity="0.35"/>
    </svg>`;
  return L.divIcon({
    html: `<div style="width:32px;height:42px;">${svg}</div>`,
    className: '',
    iconSize:   [32, 42],
    iconAnchor: [16, 42],
    popupAnchor:[0, -44],
  });
}

// One icon — Overpass-sourced competitors only.
const COMPETITOR_ICON = makeSvgIcon('#1D4ED8');

// ─── MapUpdater: fly the viewport to the searched location ─────────────────
// Uses the same Nominatim call already made by the backend, purely for viewport
// centering.  This geocode drives NO pin placement.
function MapUpdater({ businesses, searchedLocation }) {
  const map = useMap();

  useEffect(() => {
    let isMounted = true;

    if (searchedLocation) {
      fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchedLocation)}&limit=1`
      )
        .then(r => r.json())
        .then(data => {
          if (!isMounted) return;
          if (data && data.length > 0) {
            map.flyTo([parseFloat(data[0].lat), parseFloat(data[0].lon)], 14, { duration: 1.5 });
          } else if (businesses.length > 0 && businesses[0].location?.lat) {
            map.setView([businesses[0].location.lat, businesses[0].location.lng], 14);
          }
        })
        .catch(() => {
          if (isMounted && businesses.length > 0 && businesses[0].location?.lat) {
            map.setView([businesses[0].location.lat, businesses[0].location.lng], 14);
          }
        });
    } else if (businesses.length > 0 && businesses[0].location?.lat) {
      map.setView([businesses[0].location.lat, businesses[0].location.lng], 14);
    }

    return () => { isMounted = false; };
  }, [businesses, searchedLocation, map]);

  return null;
}

// ─── Main MapView ───────────────────────────────────────────────────────────
// DATA CONTRACT:
//   businesses  → Array of Overpass OSM nodes written to MongoDB by the backend.
//                 Each element MUST have { location: { lat: Number, lng: Number } }.
//                 This is the ONLY source of pin coordinates — no geocoding,
//                 no AI-generated points, no fallback estimation.
//   searchedLocation → String used solely for viewport panning via Nominatim.

export default function MapView({ businesses = [], searchedLocation, isLoading, error }) {
  const defaultCenter = [9.9285, 78.1448]; // Madurai default

  // Circle opportunity zone anchored to first real Overpass node.
  // If no nodes exist the circle is suppressed entirely (no fake coordinates).
  const firstPin = businesses.find(b => b.location?.lat && b.location?.lng);
  const circleCenter = firstPin
    ? [firstPin.location.lat, firstPin.location.lng]
    : null;

  const handlePinClick = (business) => {
    const query = encodeURIComponent(`${business.name} ${searchedLocation || ''}`);
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${query}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  if (isLoading) {
    return (
      <div className="w-full h-full bg-slate-100 flex flex-col items-center justify-center p-6 text-center">
        <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
        <span className="text-slate-700 font-semibold text-lg">
          {typeof isLoading === 'string' ? isLoading : 'Loading...'}
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full bg-slate-100 flex items-center justify-center">
        <div className="bg-red-50 text-red-600 p-4 rounded-md border border-red-200">{error}</div>
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

        {/* ── Overpass OSM business pins ──────────────────────────────────
            Rendered directly and exclusively from the businesses[] array
            that was populated by the Overpass API query on the backend.
            Coordinates are raw lat/lng from OSM — zero transformation. */}
        {businesses.map((business, index) => {
          const lat = business.location?.lat;
          const lng = business.location?.lng;
          // Guard: skip any node that arrived without valid coordinates
          if (!lat || !lng || lat === 0 || lng === 0) return null;

          return (
            <Marker
              key={business._id || `osm-${index}`}
              position={[lat, lng]}
              icon={COMPETITOR_ICON}
              eventHandlers={{ click: () => handlePinClick(business) }}
            >
              <Popup>
                <strong style={{ fontSize: '13px' }}>{business.name}</strong>
                <br />
                <span style={{ fontSize: '11px', color: '#475569' }}>
                  Category: {business.category}
                </span>
                {business.rating && (
                  <>
                    <br />
                    <span style={{ fontSize: '11px' }}>Rating: {business.rating}⭐</span>
                  </>
                )}
                <br />
                <span style={{ fontSize: '10px', color: '#2563EB', marginTop: '4px', display: 'block', cursor: 'pointer' }}>
                  Click pin → open in Google Maps
                </span>
              </Popup>
            </Marker>
          );
        })}

        {/* ── Opportunity zone circle ─────────────────────────────────────
            Only rendered when at least one Overpass node exists.
            Suppressed on Greenfield (zero nodes) — no fake coordinates. */}
        {circleCenter && (
          <Circle
            center={circleCenter}
            pathOptions={{ fillColor: '#1D4ED8', color: '#1D4ED8', fillOpacity: 0.12 }}
            radius={700}
          >
            <Popup>High Opportunity Zone</Popup>
          </Circle>
        )}
      </MapContainer>

      {/* ── Map Legend ── */}
      <div className="absolute top-4 right-4 z-[400] pointer-events-none">
        <div className="bg-white/95 backdrop-blur-sm border border-slate-200 shadow-md p-4 pointer-events-auto rounded-sm">
          <h4 className="text-xs font-bold text-slate-900 mb-3 uppercase tracking-wider">Map Legend</h4>
          <div className="flex items-center gap-3 text-sm text-slate-700 mb-2">
            <div className="w-3 h-3 bg-blue-600 rounded-full shadow-sm"></div>
            <span>Live OSM Competitor</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-700">
            <div className="w-3 h-3 bg-blue-600 rounded-full opacity-40"></div>
            <span>Opportunity Zone</span>
          </div>
        </div>

        
      </div>
    </div>
  );
}
