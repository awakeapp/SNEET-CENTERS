import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, MapPin, Phone, Building, Navigation, User, X, School, Map, Crosshair, Clock } from 'lucide-react';
import Papa from 'papaparse';
import './index.css';

const BOYS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vReXaCcSjfY47O5-qzYTNZdQKS7DLgj8iZMGW5g40mkKvRBKlj1FZ3B20KOE9rgpbxMp8Sma4Lsl9BT/pub?gid=0&single=true&output=csv";
const GIRLS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vReXaCcSjfY47O5-qzYTNZdQKS7DLgj8iZMGW5g40mkKvRBKlj1FZ3B20KOE9rgpbxMp8Sma4Lsl9BT/pub?gid=1887904745&single=true&output=csv";
const DEFAULT_HOURS = "Mon–Sat, 9:00 AM – 5:00 PM";
const GOOGLE_MAPS_API_KEY = "AIzaSyCQSfsKGe0YuCyRMp5qqNJeWypcyHYuhZc";

function App() {
  const [genderFilter, setGenderFilter] = useState('boys');
  const [boysData, setBoysData]     = useState([]);
  const [girlsData, setGirlsData]   = useState([]);
  const [searchQuery, setSearchQuery]     = useState('');
  const [showPinModal, setShowPinModal]   = useState(false);
  const [pinInput, setPinInput]           = useState('');
  const [searchPhase, setSearchPhase]     = useState(null); // null | 'geocoding' | 'routing'
  const [pinError, setPinError]           = useState('');
  const [userCoords, setUserCoords]       = useState(null);
  const [originAddress, setOriginAddress] = useState('');
  const [centerCoords, setCenterCoords]   = useState({});
  const [routeData, setRouteData]         = useState({});
  const [haversineDists, setHaversineDists] = useState({}); // fallback sort for all centers
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading]   = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const searchRef        = useRef(null);
  const findNearestBtnRef = useRef(null);

  /* ── CSV parser ── */
  const parseCsvData = (csvText) => new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: true, skipEmptyLines: true,
      complete: (results) => {
        let currentDistrict = 'Unknown';
        const formatted = results.data.map((row, index) => {
          const rowDist = (row['DISTRICT'] || '').trim();
          if (rowDist) currentDistrict = rowDist;
          const centerName = (row['NAME OF THE EXAM CENTRE'] || '').trim();
          const coordText  = (row['CENTRE COORDINATOR NUMBER'] || '').trim();
          const mapLink    = (row['MAP'] || '').trim();
          const phoneMatch = coordText.match(/[\d+\-\s]{10,15}/);
          const extractedPhone = phoneMatch ? phoneMatch[0].trim() : '';
          let coordNameOnly = coordText;
          if (extractedPhone) {
            coordNameOnly = coordText.replace(extractedPhone, '').replace(/[,\-():]+/g, ' ').replace(/\s\s+/g, ' ').trim();
          }
          return { id: index, district: currentDistrict, centerName, coordinator: coordNameOnly || 'Help Desk', phone: extractedPhone, mapLink };
        }).filter(c => c.centerName !== '');
        resolve(formatted);
      },
      error: (err) => reject(err),
    });
  });

  /* ── Data fetch ── */
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const bust = `&t=${Date.now()}`;
        const [boysRes, girlsRes, coordsRes] = await Promise.all([
          fetch(BOYS_CSV_URL + bust, { cache: 'no-store' }),
          fetch(GIRLS_CSV_URL + bust, { cache: 'no-store' }),
          fetch('/data/center_coords.json').then(r => r.json()).catch(() => ({})),
        ]);
        const [boysJson, girlsJson] = await Promise.all([
          parseCsvData(await boysRes.text()),
          parseCsvData(await girlsRes.text()),
        ]);
        setBoysData(boysJson);
        setGirlsData(girlsJson);
        setCenterCoords(coordsRes);
      } catch (err) {
        console.error('Error loading data:', err);
        setErrorMsg('Failed to load data. Please check your connection.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const activeData = genderFilter === 'boys' ? boysData : girlsData;

  /* ── Search suggestions ── */
  const suggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    const districtMatches = [...new Set(activeData.map(c => c.district))]
      .filter(d => d.toLowerCase().includes(q)).map(d => ({ type: 'district', label: d }));
    const centerMatches = activeData
      .filter(c => c.centerName.toLowerCase().includes(q)).slice(0, 6)
      .map(c => ({ type: 'center', label: c.centerName, district: c.district }));
    return [...districtMatches.slice(0, 3), ...centerMatches].slice(0, 8);
  }, [searchQuery, activeData]);

  /* ── Click-outside to close suggestions ── */
  useEffect(() => {
    const h = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setShowSuggestions(false); };
    document.addEventListener('mousedown', h);
    document.addEventListener('touchstart', h);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('touchstart', h); };
  }, []);

  /* ── Helpers ── */
  const formatTime = (seconds) => {
    if (!seconds || seconds <= 0) return 'N/A';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h === 0) return `${m} min${m !== 1 ? 's' : ''}`;
    if (m === 0) return `${h} hr`;
    return `${h} hr ${m} min`;
  };

  const haversine = (lat1, lon1, lat2, lon2) => {
    const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  // Dynamically load Google Maps JS SDK (browser-safe, passes Referer header automatically)
  const loadGoogleMaps = () => new Promise((resolve, reject) => {
    if (window.google?.maps?.DistanceMatrixService) { resolve(); return; }
    if (document.getElementById('gmaps-script')) {
      const wait = setInterval(() => { if (window.google?.maps) { clearInterval(wait); resolve(); } }, 150);
      return;
    }
    window.__gmapsResolve = resolve;
    const s = document.createElement('script');
    s.id = 'gmaps-script';
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&callback=__gmapsResolve`;
    s.onerror = reject;
    document.head.appendChild(s);
  });

  /* ── Route calculation ── */
  const runRouteCalculation = async (targetCoords, data, coords) => {
    const coordMap = coords;

    // Step 1: haversine for EVERY center → used only for pre-sort/filtering
    const hvDists = {};
    const allMapped = data.map(c => {
      const nameKey = c.centerName.toUpperCase().trim().replace(/\s*\n\s*/g, ' ');
      let cCoords = coordMap.INDIVIDUAL_CENTERS?.[nameKey]
                 || coordMap.DISTRICT_COORDS?.[c.district.toUpperCase().trim()];
      if (!cCoords) return null;
      const hv = haversine(targetCoords.lat, targetCoords.lon, cCoords.lat, cCoords.lon);
      hvDists[c.id] = hv;
      return { ...c, hv };
    }).filter(Boolean);

    setHaversineDists(hvDists);
    if (!allMapped.length) return;

    // Step 2: Show haversine×1.5 estimate instantly while Google loads
    const estimated = {};
    allMapped.forEach(c => {
      const est = Math.round(c.hv * 1.5);
      estimated[c.id] = { distance: Math.max(1, est), time: Math.round(est / 50 * 3600), isApprox: true };
    });
    setRouteData(estimated);

    // Step 3: top 25 by haversine (covers all centers we have)
    const sorted = [...allMapped].sort((a, b) => a.hv - b.hv).slice(0, 25);

    // Step 4: Google Maps Distance Matrix — destinations as ADDRESS STRINGS
    // Google resolves each center name exactly — no wrong coordinates involved
    let googleWorked = false;
    if (GOOGLE_MAPS_API_KEY) {
      try {
        await loadGoogleMaps();
        const svc    = new window.google.maps.DistanceMatrixService();
        const origin = new window.google.maps.LatLng(targetCoords.lat, targetCoords.lon);

        // Build address string for each center — clean multi-line names first
        const makeAddress = (c) => {
          const name = c.centerName.replace(/\s*\n\s*/g, ', ').trim();
          return `${name}, ${c.district}, India`;
        };

        // Google Distance Matrix allows max 25 destinations per request
        const batches = [];
        for (let i = 0; i < sorted.length; i += 25) batches.push(sorted.slice(i, i + 25));

        for (const batch of batches) {
          await new Promise((res) => {
            svc.getDistanceMatrix({
              origins: [origin],
              destinations: batch.map(c => makeAddress(c)), // ← address strings, not lat/lon
              travelMode: window.google.maps.TravelMode.DRIVING,
              unitSystem: window.google.maps.UnitSystem.METRIC,
            }, (response, status) => {
              if (status === 'OK' && response.rows[0]) {
                const nd = { ...(googleWorked ? {} : estimated) };
                response.rows[0].elements.forEach((el, idx) => {
                  if (el.status !== 'OK') return;
                  const c = batch[idx];
                  nd[c.id] = {
                    distance: Math.max(1, Math.round(el.distance.value / 1000)),
                    time: el.duration.value,
                    isApprox: false,
                  };
                });
                // Merge with existing estimated (keep estimates for centers Google couldn't resolve)
                setRouteData(prev => ({ ...prev, ...nd }));
                googleWorked = true;
              }
              res();
            });
          });
        }
      } catch (e) { console.error('Google Distance Matrix fail:', e); }
    }

    // Step 5: OSRM fallback if Google didn't work
    if (!googleWorked) {
      const coordMap2 = coords;
      const withCoords = sorted.map(c => {
        const nameKey = c.centerName.toUpperCase().trim().replace(/\s*\n\s*/g, ' ');
        const cc = coordMap2.INDIVIDUAL_CENTERS?.[nameKey] || coordMap2.DISTRICT_COORDS?.[c.district.toUpperCase().trim()];
        return cc ? { ...c, coords: cc } : null;
      }).filter(Boolean).slice(0, 10);

      const results = await Promise.allSettled(
        withCoords.map(c =>
          fetch(`https://router.project-osrm.org/route/v1/driving/${targetCoords.lon},${targetCoords.lat};${c.coords.lon},${c.coords.lat}?overview=false`)
            .then(r => r.json()).then(d => ({ c, d }))
        )
      );
      const nd = { ...estimated };
      results.forEach(r => {
        if (r.status !== 'fulfilled') return;
        const { c, d } = r.value;
        if (d.code !== 'Ok' || !d.routes?.[0]) return;
        nd[c.id] = { distance: Math.max(1, Math.round(d.routes[0].distance / 1000)), time: Math.round(d.routes[0].duration), isApprox: true };
      });
      setRouteData(nd);
    }
  };


  /* ── Modal close (returns focus) ── */
  const closeModal = () => {
    setShowPinModal(false); setSearchPhase(null); setPinError(''); setPinInput('');
    setTimeout(() => findNearestBtnRef.current?.focus(), 100);
  };

  /* ── PIN submit ── */
  const handlePinSubmit = async (e) => {
    e.preventDefault();
    const pin = pinInput.trim();
    if (pin.length < 6) return;
    setPinError(''); setSearchPhase('geocoding');
    try {
      let coords = null, addr = '';

      // Google Geocoding API (browser-safe — supports CORS)
      if (GOOGLE_MAPS_API_KEY) {
        try {
          const res  = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${pin}&region=IN&key=${GOOGLE_MAPS_API_KEY}`);
          const data = await res.json();
          if (data.status === 'OK' && data.results[0]) {
            const loc = data.results[0].geometry.location;
            coords = { lat: loc.lat, lon: loc.lng };
            addr   = data.results[0].formatted_address;
          }
        } catch (err) { console.error('Google Geocode fail', err); }
      }

      // Zippopotam fallback
      if (!coords) {
        try {
          const res = await fetch(`https://api.zippopotam.us/IN/${pin}`);
          if (res.ok) {
            const data = await res.json();
            if (data.places?.[0]) {
              coords = { lat: parseFloat(data.places[0].latitude), lon: parseFloat(data.places[0].longitude) };
              addr   = `${data.places[0]['place name']}, ${data.places[0].state}`;
            }
          }
        } catch (err) { console.error('Zippopotam fail', err); }
      }

      // PostalPincode + Nominatim fallback
      if (!coords) {
        const res2  = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
        const data2 = await res2.json();
        if (data2[0]?.Status === 'Success' && data2[0].PostOffice) {
          const district = data2[0].PostOffice[0].District;
          const state    = data2[0].PostOffice[0].State;
          addr = `${district}, ${state}`;
          const pre = centerCoords.DISTRICT_COORDS?.[district.toUpperCase()];
          if (pre) { coords = pre; }
          else {
            const res3  = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(district+','+state+',India')}&limit=1`, { headers: { 'User-Agent': 'SNEET-Locator/1.0' } });
            const data3 = await res3.json();
            if (data3?.[0]) coords = { lat: parseFloat(data3[0].lat), lon: parseFloat(data3[0].lon) };
          }
        }
      }

      if (!coords) throw new Error('Not found');
      setUserCoords(coords); setOriginAddress(addr || `PIN ${pin}`);
      setSearchPhase('routing');
      await runRouteCalculation(coords, activeData, centerCoords);
      setSearchQuery(''); closeModal();
    } catch {
      setSearchPhase(null);
      setPinError('PIN code not found. Try a different PIN or search by center/district name.');
    }
  };

  /* ── GPS geolocation ── */
  const handleGeoLocation = () => {
    if (!navigator.geolocation) { setPinError('Geolocation is not supported by your browser.'); return; }
    setPinError(''); setSearchPhase('geocoding');
    navigator.geolocation.getCurrentPosition(
      async ({ coords: c }) => {
        const tc = { lat: c.latitude, lon: c.longitude };
        setUserCoords(tc); setOriginAddress('Your Current Location');
        setSearchPhase('routing');
        await runRouteCalculation(tc, activeData, centerCoords);
        setSearchQuery(''); closeModal();
      },
      () => { setSearchPhase(null); setPinError('Could not access your location. Allow location access or enter your PIN below.'); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const clearNearest = () => { setUserCoords(null); setOriginAddress(''); setRouteData({}); setHaversineDists({}); };

  /* ── Filtered / sorted centers ── */
  const filteredCenters = useMemo(() => {
    let data = activeData.map(c => {
      const r = routeData[c.id];
      if (userCoords && r) return { ...c, roadDistance: r.distance, travelTime: r.time, isApprox: r.isApprox };
      return { ...c, roadDistance: null, travelTime: null, isApprox: false };
    });
    if (userCoords) return [...data].sort((a, b) => {
      // Use road distance when available; fall back to haversine × 1.3 road-factor estimate
      // This ensures ALL centers are meaningfully sorted — not just the OSRM top-25
      const hvA = haversineDists[a.id] ?? Infinity;
      const hvB = haversineDists[b.id] ?? Infinity;
      const distA = a.roadDistance !== null ? a.roadDistance : hvA * 1.3;
      const distB = b.roadDistance !== null ? b.roadDistance : hvB * 1.3;
      return distA - distB;
    });
    const q = searchQuery.toLowerCase().trim();
    if (!q) return data;
    return data.filter(c => c.centerName.toLowerCase().includes(q) || c.district.toLowerCase().includes(q));
  }, [searchQuery, activeData, userCoords, routeData, haversineDists]);

  const centersWithDist = userCoords ? filteredCenters.filter(c => c.roadDistance !== null).length : 0;
  const isSearching = searchPhase !== null;

  const phaseLabel = { geocoding: { em: '📍', txt: 'Locating your PIN code…' }, routing: { em: '🗺️', txt: 'Calculating road distances…' } };

  /* ── Skeletons ── */
  const renderSkeletons = () => (
    <div className="centers-grid">
      {[1,2,3,4,5,6].map(i => (
        <div key={i} className="skeleton-card">
          <div className="sk-tag skeleton"></div><div className="sk-title skeleton"></div>
          <div className="sk-text skeleton"></div><div className="sk-text short skeleton"></div>
          <div className="sk-btns"><div className="sk-btn skeleton"></div><div className="sk-btn skeleton"></div></div>
        </div>
      ))}
    </div>
  );

  /* ════════════════════════════════════ RENDER ══════════════════════════════════ */
  return (
    <div className="app-container">
      <div className="desktop-layout">

        {/* ── SIDEBAR ── */}
        <aside className="sidebar">
          <div className="sidebar-inner">

            {/* Header */}
            <header className="header">
              <div className="header-card">
                <img src="/HEADER.jpg" alt="SNEET Centers" className="header-image"
                  onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }} />
                <div className="header-fallback" style={{display:'none'}}>
                  <h1 className="fallback-title">SNEET CENTERS</h1>
                  <p className="fallback-subtitle">Save your image as <strong>HEADER.jpg</strong> in the <code>public</code> folder</p>
                </div>
              </div>
            </header>

            {/* Gender Toggle */}
            <div className="segmented-control">
              <button className={`segment-btn ${genderFilter==='boys'?'active':''}`} onClick={() => setGenderFilter('boys')} aria-pressed={genderFilter==='boys'}>
                Boys Centers ({boysData.length || '-'})
              </button>
              <button className={`segment-btn ${genderFilter==='girls'?'active':''}`} onClick={() => setGenderFilter('girls')} aria-pressed={genderFilter==='girls'}>
                Girls Centers ({girlsData.length || '-'})
              </button>
            </div>

            {/* Search */}
            <div className="search-wrapper" ref={searchRef}>
              <div className="search-input-container">
                <Search className="search-icon" size={20} />
                <input type="text" className="search-input" placeholder="Search center or district…"
                  value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)} autoComplete="off" aria-label="Search exam centers" />
                <button className="clear-search" onClick={() => { setSearchQuery(''); setShowSuggestions(false); }} aria-label="Clear search"><X size={14} /></button>
              </div>
              {showSuggestions && suggestions.length > 0 && (
                <div className="suggestions-dropdown" role="listbox" aria-label="Search suggestions">
                  {suggestions.map((s, i) => (
                    <button key={i} className="suggestion-item" role="option"
                      onMouseDown={e => { e.preventDefault(); setSearchQuery(s.label); setShowSuggestions(false); }}
                      onTouchEnd={e => { e.preventDefault(); setSearchQuery(s.label); setShowSuggestions(false); }}>
                      <span className="suggestion-icon">
                        {s.type==='district' ? <MapPin size={16} strokeWidth={2.5}/> : <School size={16} strokeWidth={2.5}/>}
                      </span>
                      <span className="suggestion-text">
                        <span className="suggestion-label">{s.label}</span>
                        {s.district && <span className="suggestion-sub">{s.district}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Find Nearest Button */}
            <button ref={findNearestBtnRef} className="find-nearest-btn"
              onClick={() => { setShowPinModal(true); setPinError(''); }}
              aria-label="Find nearest exam center by PIN or GPS location">
              <Crosshair size={18} />
              <span>Find Nearest Center</span>
            </button>

            {/* Active nearest-mode indicator */}
            {userCoords && (
              <div className="origin-chip">
                <MapPin size={13} className="origin-chip-icon" />
                <span className="origin-chip-text" title={originAddress}>{originAddress}</span>
                <button className="origin-chip-clear" onClick={clearNearest} aria-label="Clear nearest search"><X size={12}/></button>
              </div>
            )}

          </div>
        </aside>

        {/* ── PIN MODAL ── */}
        {showPinModal && (
          <div className="pin-modal-overlay" onClick={closeModal}>
            <div className="pin-modal-content" onClick={e => e.stopPropagation()}>
              <button className="close-modal-minimal" onClick={closeModal} aria-label="Close modal">
                <X size={20}/>
              </button>

              <div className="pin-modal-inner">
                <div className="pin-modal-icon-wrapper">
                  <Crosshair className="modal-icon-main" size={32} />
                </div>
                
                <h3 className="modal-title-modern">Find Nearest Center</h3>
                
                {isSearching ? (
                  <div className="search-phase-indicator">
                    <div className="phase-spinner"></div>
                    <div className="phase-label">
                      <span className="phase-emoji">{phaseLabel[searchPhase]?.em}</span>
                      <span>{phaseLabel[searchPhase]?.txt}</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="modal-text-minimal">Locate the nearest centers by road distance using GPS or your PIN code.</p>

                    <button className="location-btn-modern" onClick={handleGeoLocation} type="button">
                      <MapPin size={18} />
                      <span>Use My Current Location</span>
                    </button>

                    <div className="modal-divider-modern"><span>or enter PIN code</span></div>

                    <form onSubmit={handlePinSubmit} className="modern-pin-form">
                      <div className="pin-input-modern-wrapper">
                        <input type="text" pattern="[0-9]*" inputMode="numeric" maxLength="6"
                          placeholder="000 000" className="premium-pin-input" value={pinInput}
                          onChange={e => { setPinInput(e.target.value.replace(/\D/g,'')); setPinError(''); }}
                          autoFocus aria-label="Enter your 6-digit PIN code" />
                      </div>

                      {pinError && (
                        <div className="pin-error-msg-modern">{pinError}</div>
                      )}

                      <button type="submit" className="premium-search-btn" disabled={pinInput.length < 6}>
                        <span>Find Nearest Center</span>
                      </button>
                    </form>

                    <p className="pin-modal-footer-note">
                      For international locations, please use the main search bar.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── MAIN CONTENT ── */}
        <main className="main-content">
          {loading ? renderSkeletons() : errorMsg ? (
            <div className="empty-state">
              <div className="empty-state-icon"><X size={28}/></div>
              <h3>Oops!</h3><p>{errorMsg}</p>
            </div>
          ) : (
            <>
              <div className="meta-info">
                <span className="result-count">
                  {userCoords
                    ? `${centersWithDist} of ${filteredCenters.length} centers with distances`
                    : `${filteredCenters.length} ${filteredCenters.length===1?'Center':'Centers'} Found`}
                </span>
                {userCoords && (
                  <button className="clear-nearest" onClick={clearNearest} aria-label="Clear nearest search results">
                    <X size={14}/> Clear Nearest
                  </button>
                )}
              </div>

              {filteredCenters.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon"><Building size={28}/></div>
                  <h3>No centers found</h3><p>Try adjusting your search terms.</p>
                </div>
              ) : (
                <div className="centers-grid">
                  {filteredCenters.map((center, index) => {
                    const showHeading = index === 0 || center.district !== filteredCenters[index-1].district;
                    // "Get Directions" in nearest mode:
                    //   origin  = exact user lat,lon (reliable, no string parsing issues)
                    //   destination = center.mapLink from CSV = the real verified Google Maps location
                    //                 fallback to name+district search if no mapLink
                    const origin = userCoords ? `${userCoords.lat},${userCoords.lon}` : '';
                    const destination = center.mapLink && !center.mapLink.includes('/maps/search')
                      ? encodeURIComponent(center.mapLink)           // real short/full Maps URL from CSV
                      : encodeURIComponent(center.centerName + ', ' + center.district + ', India');
                    const directionsUrl = userCoords
                      ? `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`
                      : (center.mapLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(center.centerName + ' ' + center.district)}`);


                    return (
                      <React.Fragment key={center.id}>
                        {showHeading && !userCoords && (
                          <h2 className="district-heading"><Map size={14} strokeWidth={2.5}/> {center.district}</h2>
                        )}
                        <div className="center-card" style={{ animationDelay: `${Math.min(index*0.025, 0.5)}s` }}>

                          {/* Top rank badge for top-3 nearest */}
                          {userCoords && index < 3 && center.roadDistance !== null && (
                            <div className={`rank-badge rank-${index+1}`}>#{index+1}</div>
                          )}

                          <div className="card-top">
                            <h3 className="center-title">{center.centerName}</h3>
                            <div className="card-top-right">
                              {center.roadDistance !== null ? (
                                <>
                                  <div className="distance-badge">
                                    {center.isApprox ? '~' : ''}{center.roadDistance < 1 ? '< 1' : center.roadDistance} km
                                  </div>
                                  <div className="time-badge">{formatTime(center.travelTime)}</div>
                                </>
                              ) : userCoords ? (
                                <div className="no-route-badge">No route</div>
                              ) : null}
                            </div>
                          </div>

                          {/* Route info box */}
                          {userCoords && center.roadDistance !== null && (
                            <div className="route-info-box">
                              <Navigation size={14} className="route-icon" strokeWidth={3}/>
                              <span className="route-text">
                                From <strong>{originAddress}</strong>
                                {center.isApprox && <span className="approx-note"> · approx via district</span>}
                              </span>
                            </div>
                          )}

                          <div className="card-body">
                            <div className="info-row">
                              <MapPin className="info-icon" size={16}/>
                              <span className="info-text"><strong>District:</strong> {center.district}</span>
                            </div>
                            <div className="info-row">
                              <User className="info-icon" size={16}/>
                              <span className="info-text"><strong>Coordinator:</strong> {center.coordinator}</span>
                            </div>
                            <div className="info-row">
                              <Clock className="info-icon" size={16}/>
                              <span className="info-text hours-text"><strong>Hours:</strong> {DEFAULT_HOURS}</span>
                            </div>
                          </div>

                          <div className="card-footer">
                            {center.phone
                              ? <a href={`tel:${center.phone.replace(/[^0-9+]/g,'')}`} className="action-btn btn-outline"><Phone size={17}/> Call Desk</a>
                              : <div></div>}
                            <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="action-btn btn-primary">
                              <Navigation size={17}/> {userCoords ? 'Get Directions' : 'Navigate'}
                            </a>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </main>

      </div>
    </div>
  );
}

export default App;
