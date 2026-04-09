import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, MapPin, Phone, Building, Navigation, User, X, School, Map, Crosshair } from 'lucide-react';
import Papa from 'papaparse';
import './index.css';

const BOYS_CSV_URL  = "/data/boys_centers.csv";
const GIRLS_CSV_URL = "/data/girls_centers.csv";
const DEFAULT_HOURS       = "Mon–Sat, 9:00 AM – 5:00 PM";
const GOOGLE_MAPS_API_KEY = "AIzaSyCQSfsKGe0YuCyRMp5qqNJeWypcyHYuhZc";

// ─── Geocode cache removed (Relying purely on Google Sheet Data) ───

/* ─── FIX 1: loadGoogleMaps at MODULE level (no hoisting issue, promise cached) ─── */
let _gmapsPromise = null;
const loadGoogleMaps = () => {
  if (window.google?.maps?.DirectionsService && window.google?.maps?.DistanceMatrixService) return Promise.resolve();
  if (_gmapsPromise) return _gmapsPromise;
  _gmapsPromise = new Promise((resolve, reject) => {
    window.__gmapsResolve = () => resolve();
    const s = document.createElement('script');
    s.id  = 'gmaps-script';
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&callback=__gmapsResolve&libraries=geocoding,directions`;
    s.onerror = (e) => { _gmapsPromise = null; reject(e); };
    document.head.appendChild(s);
  });
  return _gmapsPromise;
};

/* ─── Helpers ─── */
const haversine = (lat1, lon1, lat2, lon2) => {
  const R = 6371, dLat=(lat2-lat1)*Math.PI/180, dLon=(lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

const formatTime = (seconds) => {
  if (!seconds || seconds <= 0) return 'N/A';
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m} min${m !== 1 ? 's' : ''}`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
};

/* ─── Short address helper (avoids long strings in UI) ─── */
const shortAddr = (full, pin) => {
  if (!full) return `PIN ${pin}`;
  const parts = full.split(',').map(p => p.trim()).filter(Boolean);
  return parts.slice(0, 2).join(', ');
};

/* ══════════════════════════════════════════════════════════ */
function App() {
  const [genderFilter, setGenderFilter] = useState('boys');
  const [boysData,  setBoysData]  = useState([]);
  const [girlsData, setGirlsData] = useState([]);
  const [searchQuery,     setSearchQuery]     = useState('');
  const [showPinModal,    setShowPinModal]    = useState(false);
  const [pinInput,        setPinInput]        = useState('');
  const [searchPhase,     setSearchPhase]     = useState(null);
  const [pinError,        setPinError]        = useState('');
  const [userCoords,      setUserCoords]      = useState(null);
  const [originAddress,   setOriginAddress]   = useState('');
  const [centerCoords,    setCenterCoords]    = useState({});
  const [routeData,       setRouteData]       = useState({});
  const [haversineDists,  setHaversineDists]  = useState({});
  const [viaData,         setViaData]         = useState({}); // "Via Town1 · Town2"
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Cache state removed: strictly using google sheet CSV data

  const searchRef         = useRef(null);
  const findNearestBtnRef = useRef(null);
  const userCoordsRef     = useRef(null);
  useEffect(() => { userCoordsRef.current = userCoords; }, [userCoords]);

  /* ── CSV parser (New Clean Schema) ── */
  const parseCsvData = (csvText) => new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: true, skipEmptyLines: true,
      complete: (results) => {
        const formatted = results.data.map((row) => {
          const lat = parseFloat(row['latitude']);
          const lon = parseFloat(row['longitude']);
          return {
            id: (row['id'] || '').trim() || Math.random().toString(36).substr(2, 9),
            district: (row['district'] || '').trim(),
            centerName: (row['center_name'] || '').trim(),
            coordinator: (row['contact_person'] || 'Help Desk').trim(),
            phone: (row['phone_number'] || '').trim(),
            address: (row['address'] || '').trim(),
            lat: isNaN(lat) ? null : lat,
            lon: isNaN(lon) ? null : lon,
            status: (row['status'] || '').toUpperCase() === 'TRUE',
            mapLink: (row['map_link'] || '').trim()
          };
        }).filter(c => c.centerName !== '' && c.status !== false);
        resolve(formatted);
      },
      error: (err) => reject(err),
    });
  });

  /* ── Data fetch ── */
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const bust = `&t=${Date.now()}`;
        const [boysRes, girlsRes, coordsRes] = await Promise.all([
          fetch(BOYS_CSV_URL  + bust, { cache: 'no-store' }),
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
    })();
  }, []);

  /* ── Auto-geocode removed: Relying entirely on Google Sheet coordinates ── */

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

  useEffect(() => {
    const h = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setShowSuggestions(false); };
    document.addEventListener('mousedown', h);
    document.addEventListener('touchstart', h);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('touchstart', h); };
  }, []);

  /* ── Route calculation (stable reference via useCallback) ── */
  const runRouteCalculation = useCallback(async (targetCoords, data, coords) => {
    const coordMap = coords;
    const rCoords  = resolvedCoordsRef.current;

    // Step 1: haversine for every center using sheet coords
    const hvDists  = {};
    const allMapped = data.map(c => {
      const jsonC   = c.lat && c.lon ? { lat: c.lat, lon: c.lon } : null;
      if (!jsonC) return null;
      const hv = haversine(targetCoords.lat, targetCoords.lon, jsonC.lat, jsonC.lon);
      hvDists[c.id] = hv;
      return { ...c, hv, hasPreciseCoord: true };
    }).filter(Boolean);

    setHaversineDists(hvDists);
    if (!allMapped.length) return;

    // Step 2: instant estimate (haversine × 1.5) while Google calculates
    const estimated = {};
    allMapped.forEach(c => {
      const est = Math.round(c.hv * 1.5);
      estimated[c.id] = { distance: Math.max(1, est), time: Math.round(est/50*3600), isApprox: true };
    });
    setRouteData(estimated);

    // Step 3: top 25 by haversine
    const sorted = [...allMapped].sort((a,b) => a.hv - b.hv).slice(0, 25);

    // Step 4: Google Maps Distance Matrix (precise coords or address string)
    let googleWorked = false;
    if (GOOGLE_MAPS_API_KEY) {
      try {
        await loadGoogleMaps();
        const svc    = new window.google.maps.DistanceMatrixService();
        const origin = new window.google.maps.LatLng(targetCoords.lat, targetCoords.lon);

        // prefer sheet LatLng
        const makeDest = (c) => {
          if (c.lat && c.lon) return new window.google.maps.LatLng(c.lat, c.lon);
          return `${c.centerName.replace(/\s*\n\s*/g,', ')}, ${c.district}, India`;
        };

        const batches = [];
        for (let i = 0; i < sorted.length; i += 25) batches.push(sorted.slice(i, i+25));

        for (const batch of batches) {
          await new Promise(res => {
            svc.getDistanceMatrix({
              origins: [origin],
              destinations: batch.map(c => makeDest(c)),
              travelMode: window.google.maps.TravelMode.DRIVING,
              unitSystem: window.google.maps.UnitSystem.METRIC,
            }, (response, status) => {
              if (status === 'OK' && response.rows[0]) {
                const nd = {};
                response.rows[0].elements.forEach((el, idx) => {
                  if (el.status !== 'OK') return;
                  const c = batch[idx];
                  const hasGoodCoord = !!(c.lat && c.lon);
                  nd[c.id] = {
                    distance: Math.max(1, Math.round(el.distance.value / 1000)),
                    time: el.duration.value,
                    isApprox: !hasGoodCoord,
                  };
                });
                setRouteData(prev => ({ ...prev, ...nd }));
                googleWorked = true;
              }
              res();
            });
          });
        }

        // -- Via: all centers, 2-point reverse-geocode at 25% and 75% of route --
        if (googleWorked) {
          const geocoder = new window.google.maps.Geocoder();

          const getTown = (lat, lng) => new Promise(resolve => {
            geocoder.geocode({ location: { lat, lng } }, (results, gStatus) => {
              if (gStatus === 'OK' && results?.length) {
                const clean = (s) => s?.replace(/\s*(Taluk|Mandal|Block|District|Tehsil|City|Town)$/i, '').replace(/\[.*\]/g,'').trim() || null;
                let best = null;
                // 1. Prioritize locality (City/Town)
                for (const r of results) {
                  const loc = r.address_components.find(x => x.types.includes('locality'));
                  if (loc && !loc.long_name.toLowerCase().includes('district')) {
                    best = clean(loc.long_name); break;
                  }
                }
                // 2. Sublocality / neighborhood if no main locality
                if (!best) {
                  for (const r of results) {
                    const subloc = r.address_components.find(x => x.types.includes('sublocality') || x.types.includes('neighborhood'));
                    if (subloc) { best = clean(subloc.long_name); break; }
                  }
                }
                // 3. Fallback to administrative area level 3 (often Taluk/Mandal HQ)
                if (!best) {
                  for (const r of results) {
                    const l3 = r.address_components.find(x => x.types.includes('administrative_area_level_3'));
                    if (l3 && !l3.long_name.toLowerCase().includes('district')) {
                      best = clean(l3.long_name); break;
                    }
                  }
                }
                if (best) { resolve(best); return; }
              }
              resolve(null);
            });
          });

          // Geocode district name → approx coords (for centers with no preloaded coords)
          const districtGeoCache = {};
          const getDistrictCoords = (district) => {
            if (districtGeoCache[district]) return Promise.resolve(districtGeoCache[district]);
            return new Promise(resolve => {
              geocoder.geocode({ address: `${district}, India` }, (results, gStatus) => {
                if (gStatus === 'OK' && results[0]?.geometry) {
                  const loc = results[0].geometry.location;
                  const coords = { lat: loc.lat(), lon: loc.lng() };
                  districtGeoCache[district] = coords;
                  resolve(coords);
                } else resolve(null);
              });
            });
          };

            const jc    = c.lat && c.lon ? { lat: c.lat, lon: c.lon } : null;
            let destC   = jc?.lat ? jc : null;

            // Fallback: geocode district name if no preloaded coords
            if (!destC?.lat) {
              destC = await getDistrictCoords(c.district);
              await new Promise(r => setTimeout(r, 120));
            }
            if (!destC?.lat) continue;

            const oLat = targetCoords.lat, oLon = targetCoords.lon;
            const dLat = destC.lat,        dLon = destC.lon;

            let pts = [];
            // Try to get route-based waypoints from OSRM
            try {
              const osrmRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${oLon},${oLat};${dLon},${dLat}?overview=simplified&geometries=geojson`);
              if (osrmRes.ok) {
                const osrmData = await osrmRes.json();
                if (osrmData.code === 'Ok' && osrmData.routes?.[0]?.geometry?.coordinates?.length) {
                  const coords = osrmData.routes[0].geometry.coordinates; // [[lon, lat], ...]
                  const len = coords.length;
                  if (len > 5) {
                    pts = [
                      { lat: coords[Math.floor(len * 0.25)][1], lng: coords[Math.floor(len * 0.25)][0] },
                      { lat: coords[Math.floor(len * 0.50)][1], lng: coords[Math.floor(len * 0.50)][0] },
                      { lat: coords[Math.floor(len * 0.75)][1], lng: coords[Math.floor(len * 0.75)][0] }
                    ];
                  }
                }
              }
            } catch { console.warn('OSRM route fetch failed, using fallback.'); }

            // Fallback: Geolocation interpolation
            if (!pts.length) {
              pts = [
                { lat: oLat + (dLat - oLat) * 0.25, lng: oLon + (dLon - oLon) * 0.25 },
                { lat: oLat + (dLat - oLat) * 0.50, lng: oLon + (dLon - oLon) * 0.50 },
                { lat: oLat + (dLat - oLat) * 0.75, lng: oLon + (dLon - oLon) * 0.75 }
              ];
            }

            const towns = [];
            for (const pt of pts) {
              if (towns.length >= 3) break; // max 3 stops
              const town = await getTown(pt.lat, pt.lng);
              if (town) {
                const tLower = town.toLowerCase();
                const distLower = c.district.toLowerCase();
                const destNameLower = c.centerName.toLowerCase();
                
                // Avoid duplicates, district names, origin/dest names
                const isDupe = towns.some(t => t.toLowerCase() === tLower);
                if (!isDupe && tLower !== distLower && !destNameLower.includes(tLower)) {
                  towns.push(town);
                }
              }
              await new Promise(r => setTimeout(r, 120));
            }

            if (towns.length > 0) {
              setViaData(prev => ({ ...prev, [c.id]: `Via ${towns.join(' · ')}` }));
            }
          }
        }







      } catch (e) { console.error('Google Distance Matrix fail:', e); }
    }


    // Step 5: OSRM fallback
    if (!googleWorked) {
      const withCoords = sorted.map(c => {
        const cc = c.lat && c.lon ? { lat: c.lat, lon: c.lon } : null;
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
        nd[c.id] = { distance: Math.max(1, Math.round(d.routes[0].distance/1000)), time: Math.round(d.routes[0].duration), isApprox: true };
      });
      setRouteData(nd);
    }
  }, []); // stable ref — reads latest data via refs

  /* ── FIX 6: Re-run route calc when gender switches while in nearest mode ── */
  useEffect(() => {
    if (!userCoordsRef.current) return;
    setRouteData({});
    setHaversineDists({});
    setViaData({});
    runRouteCalculation(userCoordsRef.current, activeData, centerCoords);
  }, [genderFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Modal close ── */
  const closeModal = () => {
    setShowPinModal(false); setSearchPhase(null); setPinError(''); setPinInput('');
    setTimeout(() => findNearestBtnRef.current?.focus(), 100);
  };

  /* ── FIX 2: PIN submit — uses JS SDK Geocoder (not REST API) ── */
  const handlePinSubmit = async (e) => {
    e.preventDefault();
    const pin = pinInput.trim();
    if (pin.length < 6) return;
    setPinError(''); setSearchPhase('geocoding');
    try {
      let coords = null, addr = '';

      // Primary: Google Maps JS SDK Geocoder (browser-safe, passes Referer automatically)
      if (GOOGLE_MAPS_API_KEY) {
        try {
          await loadGoogleMaps();
          const geocoder = new window.google.maps.Geocoder();
          await new Promise(resolve => {
            geocoder.geocode({ address: pin, region: 'IN', componentRestrictions: { country: 'in' } }, (results, status) => {
              if (status === 'OK' && results[0]) {
                coords = { lat: results[0].geometry.location.lat(), lon: results[0].geometry.location.lng() };
                addr   = results[0].formatted_address;
              }
              resolve();
            });
          });
        } catch (err) { console.error('JS SDK Geocode fail', err); }
      }

      // Fallback: Zippopotam
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

      // Fallback: PostalPincode + Nominatim
      if (!coords) {
        const res2  = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
        const data2 = await res2.json();
        if (data2[0]?.Status === 'Success' && data2[0].PostOffice) {
          const district = data2[0].PostOffice[0].District;
          const state    = data2[0].PostOffice[0].State;
          addr = `${district}, ${state}`;
          const pre = centerCoords.DISTRICT_COORDS?.[district.toUpperCase()];
          if (pre) { coords = pre; } else {
            const res3  = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(district+','+state+',India')}&limit=1`, { headers: { 'User-Agent': 'SNEET-Locator/1.0' } });
            const data3 = await res3.json();
            if (data3?.[0]) coords = { lat: parseFloat(data3[0].lat), lon: parseFloat(data3[0].lon) };
          }
        }
      }

      if (!coords) throw new Error('Not found');
      setUserCoords(coords);
      setOriginAddress(shortAddr(addr, pin));
      setSearchQuery('');
      closeModal(); // close immediately after geocoding — routing runs in background
      runRouteCalculation(coords, activeData, centerCoords); // fire-and-forget
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
        setUserCoords(tc);
        setOriginAddress('Your Location');
        setSearchQuery('');
        closeModal(); // close immediately — routing runs in background
        runRouteCalculation(tc, activeData, centerCoords); // fire-and-forget
      },
      () => { setSearchPhase(null); setPinError('Could not access location. Allow location access or enter your PIN.'); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const clearNearest = () => {
    setUserCoords(null); setOriginAddress('');
    setRouteData({}); setHaversineDists({}); setViaData({});
  };

  /* ── Filtered / sorted centers ── */
  const filteredCenters = useMemo(() => {
    let data = activeData.map(c => {
      const r = routeData[c.id];
      if (userCoords && r) return { ...c, roadDistance: r.distance, travelTime: r.time, isApprox: r.isApprox };
      return { ...c, roadDistance: null, travelTime: null, isApprox: false };
    });
    if (userCoords) return [...data].sort((a, b) => {
      const hvA = haversineDists[a.id] ?? Infinity;
      const hvB = haversineDists[b.id] ?? Infinity;
      const dA  = a.roadDistance !== null ? a.roadDistance : hvA * 1.5;
      const dB  = b.roadDistance !== null ? b.roadDistance : hvB * 1.5;
      return dA - dB;
    });
    const q = searchQuery.toLowerCase().trim();
    if (!q) return data;
    return data.filter(c => c.centerName.toLowerCase().includes(q) || c.district.toLowerCase().includes(q));
  }, [searchQuery, activeData, userCoords, routeData, haversineDists]);

  const isSearching = searchPhase !== null;
  const phaseLabel = {
    geocoding: { icon: <MapPin size={15}/>, txt: 'Locating your PIN code…' },
  };

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

  /* ══════════════════════════════ RENDER ══════════════════════════════ */
  return (
    <div className="app-container">
      <div className="desktop-layout">

        {/* ── SIDEBAR ── */}
        <aside className="sidebar">
          <div className="sidebar-inner">

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

            <div className="segmented-control">
              <button className={`segment-btn ${genderFilter==='boys'?'active':''}`} onClick={() => setGenderFilter('boys')} aria-pressed={genderFilter==='boys'}>
                Boys Centers ({boysData.length || '-'})
              </button>
              <button className={`segment-btn ${genderFilter==='girls'?'active':''}`} onClick={() => setGenderFilter('girls')} aria-pressed={genderFilter==='girls'}>
                Girls Centers ({girlsData.length || '-'})
              </button>
            </div>

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

            <button ref={findNearestBtnRef} className="find-nearest-btn"
              onClick={() => { setShowPinModal(true); setPinError(''); }}
              aria-label="Find nearest exam center by PIN or GPS location">
              <Crosshair size={18} />
              <span>Find Nearest Center</span>
            </button>

            {userCoords && (
              <div className="origin-chip">
                <MapPin size={16} className="origin-chip-icon" />
                <span className="origin-chip-text" title={originAddress}>{originAddress}</span>
                <button className="origin-chip-clear" onClick={clearNearest} aria-label="Clear nearest search"><X size={16}/></button>
              </div>
            )}

          </div>
        </aside>

        {/* ── PIN MODAL ── */}
        {showPinModal && (
          <div className="pin-modal-overlay" onClick={closeModal}>
            <div className="pin-modal-content" onClick={e => e.stopPropagation()}>
              <button className="close-modal-minimal" onClick={closeModal} aria-label="Close modal">
                <X size={18}/>
              </button>

              <div className="pin-modal-inner">
                <div className="modal-header-compact">
                  <Crosshair className="modal-icon-inline" size={20} />
                  <h3 className="modal-title-modern">Find Nearest Center</h3>
                </div>

                {isSearching ? (
                  <div className="search-phase-indicator">
                    <div className="phase-spinner"></div>
                    <div className="phase-label">
                      <span className="phase-icon">{phaseLabel[searchPhase]?.icon}</span>
                      <span>{phaseLabel[searchPhase]?.txt}</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <form onSubmit={handlePinSubmit} className="modern-pin-form">
                      <div className="input-group-compact">
                        <input type="text" pattern="[0-9]*" inputMode="numeric" maxLength="6"
                          placeholder="Your PIN code" className="premium-pin-input" value={pinInput}
                          onChange={e => { setPinInput(e.target.value.replace(/\D/g,'')); setPinError(''); }}
                          autoFocus aria-label="Enter your 6-digit PIN code" />
                        <button type="submit" className="premium-search-btn" disabled={pinInput.length < 6}>
                          <Search size={18} />
                        </button>
                      </div>

                      <div className="modal-divider-compact"><span>OR</span></div>

                      <button className="gps-btn-full" onClick={handleGeoLocation} type="button">
                        <MapPin size={16} />
                        <span>Use My Current Location</span>
                      </button>

                      {pinError && (
                        <div className="pin-error-msg-modern" role="alert">{pinError}</div>
                      )}
                    </form>
                    
                    <p className="pin-modal-footer-note">
                      * For international locations, please search directly in the main search bar.
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


              {filteredCenters.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon"><Building size={28}/></div>
                  <h3>No centers found</h3><p>Try adjusting your search terms.</p>
                </div>
              ) : (
                <div className="centers-grid">
                  {filteredCenters.map((center, index) => {
                    const showHeading = index === 0 || center.district !== filteredCenters[index-1].district;

                    // ── Get Directions / Navigate URL ──
                    const cleanName   = center.centerName.replace(/\s*\n\s*/g, ', ').trim();
                    const destSearch  = encodeURIComponent(`${cleanName}, ${center.district}, India`);
                    const directionsUrl = center.mapLink || `https://www.google.com/maps/search/?api=1&query=${destSearch}`;


                    return (
                      <React.Fragment key={center.id}>
                        {showHeading && !userCoords && (
                          <h2 className="district-heading"><Map size={14} strokeWidth={2.5}/> {center.district}</h2>
                        )}
                          <div className="center-card" style={{ animationDelay: `${Math.min(index*0.025, 0.5)}s` }}>

                            <div className="card-top">
                              <h3 className="center-title">
                                {userCoords && index < 3 && center.roadDistance !== null && (
                                  <span className={`rank-badge rank-${index+1}`}>#{index+1}</span>
                                )}
                                {center.centerName}
                              </h3>
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

                          {userCoords && center.roadDistance !== null && viaData[center.id] && (
                            <div className="route-info-box">
                              <Navigation size={14} className="route-icon" strokeWidth={3}/>
                              <span className="route-text">
                                {viaData[center.id]}
                                {center.isApprox && <span className="approx-note"> · estimated</span>}
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
                            {center.phone && (
                              <div className="info-row">
                                <Phone className="info-icon" size={16}/>
                                <span className="info-text"><strong>Phone:</strong> {center.phone}</span>
                              </div>
                            )}
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
