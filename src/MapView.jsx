import React, { useEffect, useRef, useState } from 'react';
import { Map } from 'lucide-react';
import { loadGoogleMaps } from './utils';

const RANK_COLORS  = ['#FFD700', '#C0C0C0', '#CD7F32']; // gold, silver, bronze for top 3
const DEFAULT_COLOR = '#E53E35'; // brand red for all others

const formatTime = (seconds) => {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
};

export default function MapView({ centers, userCoords, routeData, resolvedCoords, centerCoords }) {
  const mapRef        = useRef(null);
  const mapInstance   = useRef(null);
  const markersRef    = useRef([]);
  const infoWindowRef = useRef(null);
  const userMarkerRef = useRef(null);
  const [mapType, setMapType] = useState('roadmap'); // roadmap or satellite

  // Get best available coordinates for a center
  const getCoords = (center) => {
    const cached  = resolvedCoords?.[center.centerName];
    if (cached?.lat) return { lat: cached.lat, lng: cached.lon };
    const nameKey = center.centerName.toUpperCase().trim().replace(/\s*\n\s*/g, ' ');
    const jsonC   = centerCoords?.INDIVIDUAL_CENTERS?.[nameKey];
    if (jsonC?.lat) return { lat: jsonC.lat, lng: jsonC.lon };
    const distC   = centerCoords?.DISTRICT_COORDS?.[center.district?.toUpperCase()?.trim()];
    if (distC?.lat) return { lat: distC.lat, lng: distC.lon };
    return null;
  };

  useEffect(() => {
    if (!mapRef.current) return;

    let cleanupCalled = false;
    let localMarkers = [];
    let localUserMarker = null;
    let localMap = null;
    let localInfoWindow = null;

    // Ensure Google Maps SDK is loaded before initializing
    loadGoogleMaps().then(initMap).catch(err => console.error('Google Maps load error:', err));

    function initMap() {
      if (cleanupCalled || !window.google?.maps || !mapRef.current) return;

      // ── Init map ──
      localMap = new window.google.maps.Map(mapRef.current, {
        center: userCoords
          ? { lat: userCoords.lat, lng: userCoords.lon }
          : { lat: 10.8505, lng: 76.2711 }, // Kerala center
        zoom: userCoords ? 9 : 7,
        mapTypeId: mapType,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControl: true,
        gestureHandling: 'cooperative',
        clickableIcons: false,
        styles: [
          { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
          { featureType: 'transit', stylers: [{ visibility: 'off' }] },
        ],
      });
      mapInstance.current = localMap;
      localInfoWindow = new window.google.maps.InfoWindow({ maxWidth: 300 });
      infoWindowRef.current = localInfoWindow;

      // ── User location marker ──
      if (userCoords) {
        localUserMarker = new window.google.maps.Marker({
          position: { lat: userCoords.lat, lng: userCoords.lon },
          map: localMap,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 12,
            fillColor: '#2563EB',
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 3,
          },
          title: 'Your Location',
          zIndex: 9999,
        });
        userMarkerRef.current = localUserMarker;
      }

      // ── Center markers ──
      const bounds = new window.google.maps.LatLngBounds();
      if (userCoords) bounds.extend({ lat: userCoords.lat, lng: userCoords.lon });

      centers.forEach((center, idx) => {
        const pos = getCoords(center);
        if (!pos) return;
        bounds.extend(pos);

        const rd        = routeData?.[center.id];
        const isTop3    = userCoords && rd && idx < 3;
        const markerColor = isTop3 ? RANK_COLORS[idx] : DEFAULT_COLOR;

        // ── Use native Google Maps Symbol (works on ALL platforms incl. iOS Safari) ──
        // SVG data-URL icons are unreliable on mobile browsers
        const marker = new window.google.maps.Marker({
          position: pos,
          map: localMap,
          title: center.centerName,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: isTop3 ? 16 : 11,
            fillColor: markerColor,
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: isTop3 ? 3 : 2,
          },
          label: isTop3
            ? { text: `${idx + 1}`, color: '#ffffff', fontSize: '11px', fontWeight: 'bold' }
            : undefined,
          zIndex: isTop3 ? (3 - idx) * 100 : 1,
        });

        marker.addListener('click', () => {
          const distBadge = rd
            ? `<div style="display:inline-flex;align-items:center;gap:5px;background:#FEF2F2;color:#DC2626;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;margin:5px 0;border:1px solid #FECACA">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                ${rd.distance} km &nbsp;·&nbsp; ${formatTime(rd.time)}
              </div>`
            : '';

          const navBtn = center.mapLink
            ? `<a href="${center.mapLink}" target="_blank" rel="noopener noreferrer"
                style="display:inline-flex;align-items:center;justify-content:center;gap:7px;margin-top:8px;background:#DC2626;color:white;padding:8px 16px;border-radius:10px;text-decoration:none;font-size:13px;font-weight:700;width:100%;box-sizing:border-box">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
                Navigate
              </a>`
            : '';

          const iconPin  = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
          const iconUser = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
          const iconPhone= `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 2 3.18 2 2 0 0 1 4 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;

          const content = `
            <div class="map-info-window" style="font-family:inherit;padding:4px;min-width:210px;max-width:280px">
              ${isTop3 ? `<div style="color:${markerColor};font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px"># ${idx + 1} Nearest</div>` : ''}
              <div style="font-weight:800;font-size:15px;color:#0F172A;line-height:1.4;margin-bottom:8px">${center.centerName}</div>
              <div style="display:flex;align-items:center;gap:6px;color:#475569;font-size:13px;margin-bottom:5px">${iconPin} ${center.district}</div>
              ${center.coordinator ? `<div style="display:flex;align-items:center;gap:6px;color:#475569;font-size:13px;margin-bottom:5px">${iconUser} ${center.coordinator}</div>` : ''}
              ${center.phone ? `<div style="display:flex;align-items:center;gap:6px;color:#475569;font-size:13px;margin-bottom:5px">${iconPhone} <a href="tel:${center.phone.replace(/[^0-9+]/g,'')}" style="color:#2563EB;text-decoration:none;font-weight:700">${center.phone}</a></div>` : ''}
              <div style="margin-top:10px;padding-top:10px;border-top:1.5px solid #F1F5F9">
                ${distBadge}
                ${navBtn}
              </div>
            </div>`;

          localInfoWindow.setContent(content);
          localInfoWindow.open(localMap, marker);
        });

        localMarkers.push(marker);
      });

      markersRef.current = localMarkers;

      // Fit map to show all markers
      if (!bounds.isEmpty()) {
        localMap.fitBounds(bounds, { top: 60, bottom: 40, left: 40, right: 40 });
      }

      // Trigger a resize to fix grey/white tile gaps after tab switch
      setTimeout(() => {
        if (localMap && !cleanupCalled) {
          window.google.maps.event.trigger(localMap, 'resize');
          if (!bounds.isEmpty()) localMap.fitBounds(bounds, { top: 60, bottom: 40, left: 40, right: 40 });
        }
      }, 300);
    }

    // ── Cleanup — properly returned from useEffect ──
    return () => {
      cleanupCalled = true;
      localMarkers.forEach(m => m.setMap(null));
      localMarkers = [];
      markersRef.current = [];
      if (localUserMarker) { localUserMarker.setMap(null); userMarkerRef.current = null; }
      if (localInfoWindow) localInfoWindow.close();
      mapInstance.current = null;
    };
  }, [centers, userCoords, routeData, resolvedCoords, centerCoords, mapType]);

  return (
    <div className="map-view-wrapper">
      <div ref={mapRef} className="map-view-container" style={{ width: '100%', height: '100%', minHeight: '500px' }} />
      
      {/* Floating Map Controls */}
      <div className="map-custom-controls">
        <button 
          className={`map-type-toggle ${mapType === 'satellite' ? 'active' : ''}`}
          onClick={() => setMapType(mapType === 'roadmap' ? 'satellite' : 'roadmap')}
          title="Toggle Satellite View"
        >
          {mapType === 'roadmap' ? <Map size={18} /> : <div className="sat-icon-preview" />}
          <span>{mapType === 'roadmap' ? 'Satellite' : 'Map'}</span>
        </button>
      </div>
    </div>
  );
}
