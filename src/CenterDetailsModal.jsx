import React, { useEffect, useState, useRef } from 'react';
import { X, Map as MapIcon, Phone, Clock, Globe, Navigation, HeartPulse, BusFront, Train, Image as ImageIcon, Star, MapPin, Building2 } from 'lucide-react';
import { GOOGLE_MAPS_API_KEY } from './utils';

let _gmapsPromise = null;
const loadGoogleMaps = () => {
  if (window.google?.maps?.DirectionsService && window.google?.maps?.places) return Promise.resolve();
  if (_gmapsPromise) return _gmapsPromise;
  _gmapsPromise = new Promise((resolve, reject) => {
    window.__gmapsResolve = () => resolve();
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&callback=__gmapsResolve`;
    s.async = true; s.defer = true; s.onerror = reject;
    document.head.appendChild(s);
  });
  return _gmapsPromise;
};

// Helper to extract place_id from mapLink
const extractPlaceId = (url) => {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.searchParams.get('destination_place_id') || 
           u.searchParams.get('query_place_id') || 
           u.searchParams.get('place_id') || 
           (url.match(/\/maps\/place\/[^/]+\/(ChIJ[^/?]+)/)?.[1]) || null;
  } catch { return null; }
};

export default function CenterDetailsModal({ center, userCoords, centerCoords, onClose }) {
  const mapRef = useRef(null);
  const panoRef = useRef(null);
  const [activeTab, setActiveTab] = useState('route'); // 'route' | 'streetview'

  const [details, setDetails] = useState({ loading: true, data: null, error: null });
  const [nearby, setNearby] = useState({ loading: true, data: [] });
  const [routeStats, setRouteStats] = useState(null);

  useEffect(() => {
    async function init() {
      try {
        await loadGoogleMaps();
        const google = window.google;
        
        let targetLoc = centerCoords;
        const pSvc = new google.maps.places.PlacesService(document.createElement('div'));
        const placeId = extractPlaceId(center.mapLink);

        // -- FETCH DETAILS --
        const fetchDetails = (reqPlaceId) => {
          pSvc.getDetails({ 
            placeId: reqPlaceId, 
            fields: ['name', 'formatted_phone_number', 'website', 'opening_hours', 'photos', 'rating', 'user_ratings_total', 'geometry'] 
          }, (place, status) => {
            if (status === 'OK' && place) {
              setDetails({ loading: false, data: place, error: null });
              if (place.geometry?.location && !targetLoc) {
                targetLoc = { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() };
              }
              initMap(targetLoc);
            } else {
              setDetails({ loading: false, data: null, error: 'Details not found' });
              initMap(targetLoc);
            }
          });
        };

        if (placeId) {
          fetchDetails(placeId);
        } else if (targetLoc) {
          pSvc.textSearch({
            location: targetLoc,
            radius: 500,
            query: center.centerName
          }, (results, status) => {
            if (status === 'OK' && results?.[0]) {
              fetchDetails(results[0].place_id);
            } else {
              setDetails({ loading: false, data: null, error: 'Not found on Google Places' });
              initMap(targetLoc);
            }
          });
        } else {
          setDetails({ loading: false, data: null, error: 'No location data' });
          initMap(targetLoc);
        }

        // -- INIT MAP & ROUTES & NEARBY --
        function initMap(loc) {
          if (!loc || !mapRef.current) return;

          const map = new google.maps.Map(mapRef.current, {
            center: loc,
            zoom: 15,
            disableDefaultUI: true,
            zoomControl: true,
            gestureHandling: 'greedy'
          });

          // Route Preview
          if (userCoords) {
            const dirSvc = new google.maps.DirectionsService();
            const dirRdy = new google.maps.DirectionsRenderer({
              map,
              suppressMarkers: false,
              polylineOptions: { strokeColor: '#2563EB', strokeWeight: 5 }
            });
            
            dirSvc.route({
              origin: userCoords,
              destination: loc,
              travelMode: 'DRIVING'
            }, (res, status) => {
              if (status === 'OK') {
                dirRdy.setDirections(res);
                const leg = res.routes[0].legs[0];
                setRouteStats({ dist: leg.distance.text, time: leg.duration.text });
              }
            });
          } else {
            // Just drop a marker if no route
            new google.maps.Marker({
              position: loc,
              map,
              title: center.centerName,
              animation: google.maps.Animation.DROP
            });
          }

          // Street View Window
          if (panoRef.current) {
            const svSvc = new google.maps.StreetViewService();
            svSvc.getPanorama({ location: loc, radius: 50 }, (data, status) => {
              if (status === 'OK') {
                new google.maps.StreetViewPanorama(panoRef.current, {
                  position: data.location.latLng,
                  pov: { heading: 34, pitch: 10 },
                  disableDefaultUI: true,
                  zoomControl: true,
                  panControl: true
                });
                // map.setStreetView(panorama); (Don't override map, render in separate div)
              } else {
                if(panoRef.current) panoRef.current.innerHTML = '<div class="sv-error">Street View not available for this location</div>';
              }
            });
          }

          // Nearby Places (Bus/Train/Hospital)
          pSvc.nearbySearch({
            location: loc,
            rankBy: google.maps.places.RankBy.DISTANCE,
            type: ['transit_station', 'hospital', 'bus_station', 'train_station']
          }, (results, status) => {
            if (status === 'OK' && results) {
              const interesting = results.filter(r => 
                r.types.includes('hospital') || r.types.includes('bus_station') || r.types.includes('train_station') || r.types.includes('transit_station') || r.types.includes('health')
              ).slice(0, 4);
              setNearby({ loading: false, data: interesting });
            } else {
              setNearby({ loading: false, data: [] });
            }
          });
        }

      } catch (err) {
        console.error('Modal Map Error', err);
      }
    }
    init();
  }, [center, userCoords, centerCoords]);

  const getIconForType = (types) => {
    if (types.includes('hospital') || types.includes('health')) return <HeartPulse size={16} className="nearby-icon text-red"/>;
    if (types.includes('train_station')) return <Train size={16} className="nearby-icon text-blue"/>;
    if (types.includes('bus_station') || types.includes('transit_station')) return <BusFront size={16} className="nearby-icon text-blue"/>;
    return <MapPin size={16} className="nearby-icon text-gray"/>;
  };

  const pData = details?.data;

  return (
    <div className="cdm-overlay" onClick={onClose}>
      <div className="cdm-content" onClick={e => e.stopPropagation()}>
        <button className="cdm-close" onClick={onClose}><X size={20}/></button>
        
        {/* Header */}
        <div className="cdm-header">
          <h2 className="cdm-title">{center.centerName}</h2>
          <div className="cdm-sub">
            <span className="cdm-district"><MapPin size={14}/> {center.district}</span>
            {pData?.rating && (
              <span className="cdm-rating">
                <Star size={14} className="star-icon"/> {pData.rating} ({pData.user_ratings_total} reviews)
              </span>
            )}
          </div>
        </div>

        {/* Media Toggle: Map / StreetView */}
        <div className="cdm-media-section">
          <div className="cdm-media-toggle">
            <button className={`cdm-tab ${activeTab==='route'?'active':''}`} onClick={()=>setActiveTab('route')}>
              <MapIcon size={15}/> Live Route
            </button>
            <button className={`cdm-tab ${activeTab==='streetview'?'active':''}`} onClick={()=>setActiveTab('streetview')}>
              <ImageIcon size={15}/> Street View
            </button>
          </div>
          
          <div className="cdm-media-container">
            <div ref={mapRef} className="cdm-map" style={{ display: activeTab === 'route' ? 'block' : 'none' }}></div>
            <div ref={panoRef} className="cdm-streetview" style={{ display: activeTab === 'streetview' ? 'block' : 'none' }}></div>
          </div>
          
          {userCoords && routeStats && activeTab === 'route' && (
            <div className="cdm-route-banner">
              <span className="cdm-route-time">{routeStats.time}</span>
              <span className="cdm-route-dist">({routeStats.dist}) from your location</span>
            </div>
          )}
        </div>

        {/* Details Grids */}
        <div className="cdm-body">
          <div className="cdm-grid">
            
            {/* Auto-filled Google Details */}
            <div className="cdm-card">
              <h4 className="cdm-card-title"><Building2 size={16}/> Center Details</h4>
              {details.loading ? <div className="c-loading">Fetching online details...</div> : (
                <div className="cdm-info-list">
                  {center.phone || pData?.formatted_phone_number ? (
                    <div className="cdm-info-item">
                      <Phone size={15} className="info-ico"/>
                      <span>{center.phone || pData?.formatted_phone_number}</span>
                    </div>
                  ) : null}
                  {pData?.website && (
                    <div className="cdm-info-item">
                      <Globe size={15} className="info-ico"/>
                      <a href={pData.website} target="_blank" rel="noreferrer" className="website-link">Official Website</a>
                    </div>
                  )}
                  {pData?.opening_hours && (
                    <div className="cdm-info-item">
                      <Clock size={15} className="info-ico"/>
                      <span className={pData.opening_hours.isOpen() ? 'text-green' : 'text-red'}>
                        {pData.opening_hours.isOpen() ? 'Currently Open' : 'Currently Closed'}
                      </span>
                    </div>
                  )}
                  <div className="cdm-info-item">
                     <span className="badge-sheet">Verified by SNEC</span>
                     {pData && <span className="badge-google">Google Data</span>}
                  </div>
                </div>
              )}
            </div>

            {/* Nearby Places */}
            <div className="cdm-card">
              <h4 className="cdm-card-title"><Navigation size={16}/> Essential Nearby</h4>
              {nearby.loading ? <div className="c-loading">Scanning area...</div> : (
                nearby.data.length > 0 ? (
                  <div className="cdm-nearby-list">
                    {nearby.data.map((r, i) => (
                      <div key={i} className="cdm-nearby-item">
                        {getIconForType(r.types)}
                        <div className="nearby-text">
                          <span className="nearby-name">{r.name}</span>
                          <span className="nearby-dist">{(r.rating ? `${r.rating} ★ · ` : '')}Nearby</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <div className="text-gray" style={{fontSize:'0.85rem',marginTop:'0.5rem'}}>No major hospitals or transit hubs found within 1.5km.</div>
              )}
            </div>

          </div>

          {/* Action Row */}
          <div className="cdm-actions">
             {center.mapLink ? (
               <a href={center.mapLink} target="_blank" rel="noreferrer" className="cdm-action-btn primary">
                 <Navigation size={18}/> Start Navigation
               </a>
             ) : (
                <button className="cdm-action-btn disabled" disabled>
                  No Map Link Added
                </button>
             )}
          </div>
        </div>

      </div>
    </div>
  );
}
