import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, MapPin, Phone, Building, Navigation, User, X, School, Map, Crosshair, List, LayoutList, Calendar, Info } from 'lucide-react';
import Papa from 'papaparse';
import MapView from './MapView.jsx';
import CenterDetailsModal from './CenterDetailsModal';
import { loadGoogleMaps, GOOGLE_MAPS_API_KEY } from './utils';
import './index.css';

const BOYS_CSV_URL  = "/data/boys_centers.csv";
const GIRLS_CSV_URL = "/data/girls_centers.csv";
const DEFAULT_HOURS       = "Mon–Sat, 9:00 AM – 5:00 PM";

// (Removed GeoCache since new schema includes explicit latitude & longitude)

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

const shortAddr = (full, pin) => {
  if (!full) return pin ? `PIN ${pin}` : 'Location';
  const parts = full.split(',').map(p => p.trim()).filter(Boolean);
  return parts.slice(0, 2).join(', ');
};

/* ══════════════════════════════════════════════════════════ */
function App() {
  const [genderFilter, setGenderFilter] = useState('boys');
  const [boysData,  setBoysData]  = useState([]);
  const [girlsData, setGirlsData] = useState([]);
  const [selectedDistrict, setSelectedDistrict]     = useState('');
  const [showPinModal,    setShowPinModal]    = useState(false);
  const [modalSearch,     setModalSearch]     = useState('');
  const [searchPhase,     setSearchPhase]     = useState(null);
  const [pinError,        setPinError]        = useState('');
  const [viewMode,        setViewMode]        = useState('list');
  const [isCalcRoutes,    setIsCalcRoutes]    = useState(false);
  const [selectedCenterModal, setSelectedCenterModal] = useState(null);
  const [placeSuggestions,setPlaceSuggestions]= useState([]);
  const [showPlaceDrop,   setShowPlaceDrop]   = useState(false);
  const autocompleteTimer = useRef(null);
  const [userCoords,      setUserCoords]      = useState(null);
  const [originAddress,   setOriginAddress]   = useState('');
  const [centerCoords,    setCenterCoords]    = useState({});
  const [routeData,       setRouteData]       = useState({});
  const [haversineDists,  setHaversineDists]  = useState({});
  const [viaData,         setViaData]         = useState({});
  const [mapsLoaded,      setMapsLoaded]      = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [autoNavPopup, setAutoNavPopup] = useState(null);

  // Cache removed
  const searchRef         = useRef(null);
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
            lat: lat,
            lon: lon,
            hasPreciseCoord: !isNaN(lat) && !isNaN(lon),
            status: (row['status'] || '').toUpperCase() === 'TRUE',
            mapLink: (row['map_link'] || '').trim() 
          };
        }).filter(c => c.centerName !== '' && c.status !== false);
        resolve(formatted);
      },
      error: (err) => reject(err),
    });
  });

  /* ── Data fetch + pre-load Google Maps SDK on mount ── */
  useEffect(() => {
    loadGoogleMaps().then(() => setMapsLoaded(true)).catch(() => {});

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

  /* ── DISABLED: Auto-geocode loop (Prevents Google Geocoding Quota/Error overkill) ── */
  useEffect(() => {
    // Relying on data/center_coords.json and on-demand lookups now.
  }, []);

  const activeData = genderFilter === 'boys' ? boysData : girlsData;

  /* ── Districts Dropdown ── */
  const uniqueDistricts = useMemo(() => {
    return [...new Set(activeData.map(c => c.district))].sort();
  }, [activeData]);

  useEffect(() => {
    const h = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setShowPlaceDrop(false); };
    document.addEventListener('mousedown', h);
    document.addEventListener('touchstart', h);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('touchstart', h); };
  }, []);

  /* ── Route calculation (stable reference via useCallback) ── */
  const runRouteCalculation = useCallback(async (targetCoords, data) => {
    // Step 1: haversine for every center using explicit coords
    const hvDists  = {};
    const allMapped = data.map(c => {
      if (!c.hasPreciseCoord) return null;
      const hv = haversine(targetCoords.lat, targetCoords.lon, c.lat, c.lon);
      hvDists[c.id] = hv;
      return { ...c, hv };
    }).filter(Boolean);

    setHaversineDists(hvDists);
    if (!allMapped.length) return;

    setIsCalcRoutes(true);

    // Step 3: top 50 by haversine (was 15 — too few, dropped many reachable centers)
    const sorted = [...allMapped].sort((a,b) => a.hv - b.hv).slice(0, 50);

    // Step 4: Google Maps Distance Matrix DISABLED (avoiding 'API Not Enabled' errors)
    let googleWorked = false;
    let step4Results = {};
    if (false && GOOGLE_MAPS_API_KEY) {
      try {
        await loadGoogleMaps();
        const svc    = new window.google.maps.DistanceMatrixService();
        const origin = new window.google.maps.LatLng(targetCoords.lat, targetCoords.lon);

        // ── Helper to extract destination from User-provided Sheet Link ──
        const parseMapLink = (url) => {
          if (!url) return null;
          try {
            const u = new URL(url);
            // Case 1: Search or Dir URL with place_id
            const pid = u.searchParams.get('destination_place_id') || u.searchParams.get('query_place_id') || u.searchParams.get('place_id');
            if (pid) return { placeId: pid };

            // Case 2: Search or Dir URL with query
            const q = u.searchParams.get('query') || u.searchParams.get('destination') || u.searchParams.get('q');
            if (q) return q;

            // Case 3: Place URL /maps/place/Name/PlaceId
            const placeMatch = url.match(/\/maps\/place\/[^/]+\/([^/?]+)/);
            if (placeMatch && placeMatch[1].startsWith('ChIJ')) return { placeId: placeMatch[1] };

            // Case 4: Default to text search if we can't find ID
            return null; 
          } catch {
            return null;
          }
        };

        // Priority 1: User's Sheet Link (Accurate)
        // Priority 2: NOTHING (Previously auto-geocode "mess" removed)
        const makeDest = (c) => {
          const sheetDest = parseMapLink(c.mapLink);
          if (sheetDest) return sheetDest;

          // Fallback to auto-coords so we don't delay the user with OSRM loops
          const nameKey = c.centerName.toUpperCase().trim().replace(/\s*\n\s*/g,' ');
          const cc = rCoords[c.centerName]
                  || coordMap.INDIVIDUAL_CENTERS?.[nameKey]
                  || coordMap.DISTRICT_COORDS?.[c.district.toUpperCase().trim()];
          
          if (cc) return new window.google.maps.LatLng(cc.lat, cc.lon);
          return null;
        };

        const batches = [];
        for (let i = 0; i < sorted.length; i += 25) batches.push(sorted.slice(i, i+25));

        for (const batch of batches) {
          const validDestinations = batch
            .map((c, idx) => ({ dest: makeDest(c), center: c, originalIndex: idx }))
            .filter(item => item.dest !== null);

          if (validDestinations.length === 0) continue;

          await new Promise(res => {
            svc.getDistanceMatrix({
              origins: [origin],
              destinations: validDestinations.map(v => v.dest),
              travelMode: window.google.maps.TravelMode.DRIVING,
              unitSystem: window.google.maps.UnitSystem.METRIC,
            }, (response, status) => {
              if (status === 'OK' && response.rows[0]) {
                const nd = {};
                response.rows[0].elements.forEach((el, idx) => {
                  if (el.status !== 'OK') return;
                  const c = validDestinations[idx].center;
                  nd[c.id] = {
                    distance: Math.max(1, Math.round(el.distance.value / 1000)),
                    time: el.duration.value,
                    isApprox: false, // It's strictly based on user's manual link
                  };
                });
                setRouteData(prev => ({ ...prev, ...nd }));
                step4Results = { ...step4Results, ...nd };
                googleWorked = true;
              }
              res();
            });
          });
        }

        setIsCalcRoutes(false); // Done with distance matrix, reveal cards

        // -- Via: background reverse-geocode at 25/50/75% of route --
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

          for (const c of sorted) {
            let destC   = c.hasPreciseCoord ? { lat: c.lat, lon: c.lon } : null;

            // Fallback: geocode district name if no preloaded coords
            if (!destC?.lat) {
              destC = await getDistrictCoords(c.district);
              // No artificial delay — we are no longer blocking the UI
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
            }

            if (towns.length > 0) {
              setViaData(prev => ({ ...prev, [c.id]: `Via ${towns.join(' · ')}` }));
            }
          }
        }
      } catch (e) { console.error('Google Distance Matrix fail:', e); }
    }

    // Step 5a: Pre-fill with haversine estimates so cards appear instantly (~0ms)
    // These will be replaced by OSRM batch results in Step 5b
    const haversineEntries = {};
    for (const c of sorted) {
      if (!step4Results[c.id] && hvDists[c.id] != null) {
        haversineEntries[c.id] = {
          distance: Math.max(1, Math.round(hvDists[c.id] * 1.35)),
          time: Math.round((hvDists[c.id] * 1.35) / 40 * 3600), // ~40 km/h avg
          isApprox: true,
        };
      }
    }
    if (Object.keys(haversineEntries).length > 0) {
      setRouteData(prev => ({ ...prev, ...haversineEntries }));
    }
    setIsCalcRoutes(false); // Cards visible immediately with estimates

    // Step 5b: OSRM TABLE API — single batch call for all centers at once.
    // This replaces 50 sequential /route requests (which caused 50 re-renders / re-sorts)
    // with 1 /table call → 1 state update → 1 clean re-sort.
    const missingDist = sorted.filter(c => !step4Results[c.id]);
    if (missingDist.length > 0) {
      // Build a list of centers that have usable coordinates
      const validCenters = missingDist.map(c => {
        return c.hasPreciseCoord ? { center: c, cc: { lat: c.lat, lon: c.lon } } : null;
      }).filter(Boolean);

      if (validCenters.length > 0) {
        const targetLng = targetCoords.lng || targetCoords.lon;

        // OSRM /table: source = index 0 (user), destinations = index 1..N
        // Format: /table/v1/driving/lon,lat;lon,lat;...?sources=0&destinations=1;2;3;...
        const coords = [
          `${targetLng},${targetCoords.lat}`,
          ...validCenters.map(({ cc }) => `${cc.lon},${cc.lat}`),
        ].join(';');
        const destIndices = validCenters.map((_, i) => i + 1).join(';');

        try {
          const res = await fetch(
            `https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&destinations=${destIndices}&annotations=duration,distance`
          );
          const data = await res.json();

          if (data.code === 'Ok' && data.durations?.[0] && data.distances?.[0]) {
            const batchEntries = {};
            validCenters.forEach(({ center }, i) => {
              const rawSecs = data.durations[0][i];     // seconds from OSRM
              const rawMeters = data.distances[0][i];   // meters from OSRM
              if (rawSecs == null || rawSecs <= 0) return;

              // Kerala road correction:
              // OSRM /table uses straight-line time estimates (faster than /route).
              // Apply 1.5x for duration and 1.2x for distance to approximate real Kerala roads.
              batchEntries[center.id] = {
                distance: Math.max(1, Math.round((rawMeters / 1000) * 1.2)),
                time: Math.round(rawSecs * 1.5),
                isApprox: false,
              };
            });

            // Single atomic update — one re-render, one re-sort, no jumps
            if (Object.keys(batchEntries).length > 0) {
              setRouteData(prev => ({ ...prev, ...batchEntries }));
            }
          } else {
            // OSRM table failed — fall back to individual /route calls in parallel (Promise.all)
            await Promise.all(
              validCenters.map(async ({ center, cc }) => {
                try {
                  const r = await fetch(
                    `https://router.project-osrm.org/route/v1/driving/${targetLng},${targetCoords.lat};${cc.lon},${cc.lat}?overview=false`
                  );
                  const d = await r.json();
                  if (d.code === 'Ok' && d.routes?.[0]) {
                    return {
                      id: center.id,
                      distance: Math.max(1, Math.round(d.routes[0].distance / 1000)),
                      time: Math.round(d.routes[0].duration * 1.4),
                      isApprox: false,
                    };
                  }
                } catch { /* ignore */ }
                return null;
              })
            ).then(results => {
              const fallback = {};
              results.filter(Boolean).forEach(e => { fallback[e.id] = { distance: e.distance, time: e.time, isApprox: e.isApprox }; });
              if (Object.keys(fallback).length > 0) setRouteData(prev => ({ ...prev, ...fallback }));
            });
          }
        } catch {
          // Network error — leave haversine estimates in place
        }
      }
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
    setShowPinModal(false);
    setSearchPhase(null); setPinError('');
    setShowPlaceDrop(false);
  };

  /* ── Modal Input Logic via Google Places API ── */
  const handleModalInput = (val) => {
    setModalSearch(val);
    setPinError('');
    if (!val.trim() || val.length < 2) { 
        setShowPlaceDrop(false); 
        setPlaceSuggestions([]); 
        return; 
    }
    setShowPlaceDrop(true);
    
    // Remote places call
    clearTimeout(autocompleteTimer.current);
    autocompleteTimer.current = setTimeout(() => {
      try {
        if (!window.google?.maps?.places?.AutocompleteService) return;
        const svc = new window.google.maps.places.AutocompleteService();
        
        // Check if val is likely a PIN code
        const isPin = /^\d{3,6}$/.test(val.trim());
        
        const req = isPin ? { input: val, componentRestrictions: { country: 'in' }, types: ['postal_code'] } : {
            input: val,
            // Hard-restrict to Kerala bounding box so 'Yedapala' returns Edappal (Malappuram)
            // not Yedapala, Karnataka or Tamil Nadu
            locationRestriction: new window.google.maps.LatLngBounds(
              new window.google.maps.LatLng(8.0883, 74.8603), // SW: Kanyakumari–Kasaragod area
              new window.google.maps.LatLng(12.8458, 77.2000)  // NE: Kasaragod–Wayanad area
            ),
        };

        svc.getPlacePredictions(req, (predictions, status) => {
            if (status === 'OK' && predictions?.length) {
              const shaped = predictions.slice(0, 4).map(p => ({
                place_id: p.place_id,
                description: p.description,
                main_text: p.structured_formatting?.main_text || p.description.split(',')[0].trim(),
                secondary_text: p.structured_formatting?.secondary_text || '',
                lat: null, lon: null
              }));
              setPlaceSuggestions(shaped);
            } else {
              setPlaceSuggestions([]);
            }
          }
        );
      } catch { /* ignore */ }
    }, 150);
  };

  const handlePlaceSelect = async (prediction) => {
    setShowPlaceDrop(false);
    setModalSearch(prediction.description);
    setPinError(''); setSearchPhase('geocoding');
    try {
      await loadGoogleMaps();
      const geocoder = new window.google.maps.Geocoder();
      await new Promise(resolve => {
        geocoder.geocode({ placeId: prediction.place_id }, (results, status) => {
          if (status === 'OK' && results[0]) {
            const coords = {
              lat: results[0].geometry.location.lat(),
              lon: results[0].geometry.location.lng(),
            };
            setUserCoords(coords);
            setOriginAddress(prediction.main_text || prediction.description.split(',')[0].trim());
            closeModal();
            runRouteCalculation(coords, activeData, centerCoords);
          } else {
            setSearchPhase(null);
            setPinError('Could not locate this place. Try another.');
          }
          resolve();
        });
      });
    } catch {
      setSearchPhase(null);
      setPinError('Could not locate this place. Try another.');
    }
  };

  /* ── Find Location / PIN Submit ── */
  const handleModalSubmit = async (e) => {
    e.preventDefault();
    const val = modalSearch.trim();
    if (!val) return;
    
    // Check if it's a 6-digit PIN code exactly
    const isPin = /^\d{6}$/.test(val);

    setPinError(''); setSearchPhase('geocoding');
    try {
      let coords = null, addr = '';

      if (GOOGLE_MAPS_API_KEY) {
        try {
          await loadGoogleMaps();
          const geocoder = new window.google.maps.Geocoder();
          await new Promise(resolve => {
            geocoder.geocode({ address: val, region: 'IN', componentRestrictions: { country: 'in' } }, (results, status) => {
              if (status === 'OK' && results[0]) {
                coords = { lat: results[0].geometry.location.lat(), lon: results[0].geometry.location.lng() };
                addr   = results[0].formatted_address;
              }
              resolve();
            });
          });
        } catch { /* ignore */ }
      }

      // Fallback for PIN exclusively
      if (!coords && isPin) {
        try {
          const res = await fetch(`https://api.zippopotam.us/IN/${val}`);
          if (res.ok) {
            const data = await res.json();
            if (data.places?.[0]) {
              coords = { lat: parseFloat(data.places[0].latitude), lon: parseFloat(data.places[0].longitude) };
              addr   = `${data.places[0]['place name']}, ${data.places[0].state}`;
            }
          }
        } catch { /* ignore */ }
      }

      if (!coords) throw new Error('Not found');
      setUserCoords(coords);
      setOriginAddress(shortAddr(addr, isPin ? val : '')); 
      closeModal();
      runRouteCalculation(coords, activeData, centerCoords);
    } catch {
      setSearchPhase(null);
      setPinError('Location not found. Try a different PIN or place.');
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
        setModalSearch('');
        closeModal();
        runRouteCalculation(tc, activeData, centerCoords);
      },
      () => { setSearchPhase(null); setPinError('Could not access location. Please check browser permissions.'); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const clearNearest = () => {
    setUserCoords(null); setOriginAddress('');
    setRouteData({}); setHaversineDists({}); setViaData({});
    setSelectedDistrict('');
  };

  /* ── Filtered / sorted centers ── */
  const filteredCenters = useMemo(() => {
    let data = activeData.map(c => {
      const r = routeData[c.id];
      const hv = haversineDists[c.id];
      if (userCoords && r) return { ...c, roadDistance: r.distance, travelTime: r.time, isApprox: r.isApprox };
      // Show haversine estimate immediately while OSRM loads
      if (userCoords && hv != null) return { ...c, roadDistance: Math.max(1, Math.round(hv * 1.35)), travelTime: Math.round((hv * 1.35) / 40 * 3600), isApprox: true };
      return { ...c, roadDistance: null, travelTime: null, isApprox: false };
    });
    if (userCoords) {
      // When in nearest mode: only show centers that have coordinate data.
      // Centers with no coords at all (roadDistance null AND no haversine) are
      // excluded — they would just clutter the bottom with no useful info.
      const withCoords = data.filter(c => haversineDists[c.id] != null);
      return [...withCoords].sort((a, b) => {
        const hvA = haversineDists[a.id] ?? Infinity;
        const hvB = haversineDists[b.id] ?? Infinity;
        const dA  = a.roadDistance !== null ? a.roadDistance : hvA * 1.5;
        const dB  = b.roadDistance !== null ? b.roadDistance : hvB * 1.5;
        return dA - dB;
      });
    }
    if (selectedDistrict) {
      return data.filter(c => c.district === selectedDistrict);
    }
    return data;
  }, [selectedDistrict, activeData, userCoords, routeData, haversineDists]);

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
                <Search className="search-icon" size={18} />
                <input 
                  type="text" 
                  className="search-input"
                  placeholder="App Districts & Centers..."
                  value={selectedDistrict}
                  onChange={(e) => {
                    setSelectedDistrict(e.target.value);
                    setShowPlaceDrop(true);
                  }}
                  onFocus={() => setShowPlaceDrop(true)}
                  aria-label="Search centers or districts"
                />
                {selectedDistrict && (
                  <button className="clear-search" onClick={() => { setSelectedDistrict(''); setShowPlaceDrop(false); }} aria-label="Clear search">
                    <X size={14} />
                  </button>
                )}
              </div>

              {showPlaceDrop && (
                <div className="omni-dropdown">
                  <div className="omni-section">
                    <div className="omni-section-title">Districts</div>
                    <button 
                      className={`suggestion-item ${selectedDistrict === '' ? 'active' : ''}`}
                      onClick={() => { setSelectedDistrict(''); setShowPlaceDrop(false); }}
                    >
                      <MapPin size={16} className="suggest-ico" />
                      <div className="suggest-info">
                        <div className="suggest-name">All Districts & Centers</div>
                      </div>
                    </button>
                    {uniqueDistricts
                      .filter(d => d.toLowerCase().includes(selectedDistrict.toLowerCase()))
                      .map(d => (
                        <button 
                          key={d}
                          className={`suggestion-item ${selectedDistrict === d ? 'active' : ''}`}
                          onClick={() => { setSelectedDistrict(d); setShowPlaceDrop(false); }}
                        >
                          <MapPin size={16} className="suggest-ico" />
                          <div className="suggest-info">
                            <div className="suggest-name">{d}</div>
                          </div>
                        </button>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>

            <button className="find-nearest-btn"
              onClick={() => { setShowPinModal(true); setPinError(''); }}
              aria-label="Find nearest exam center">
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

        {/* ── FIND NEAREST MODAL ── */}
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
                    <form onSubmit={handleModalSubmit} className="modern-pin-form">
                      <div className="place-search-wrap" ref={searchRef}>
                        <div className="input-group-compact">
                          <MapPin size={16} style={{color:'var(--text-3)',flexShrink:0,marginLeft:'0.3rem'}}/>
                          <input
                            type="text"
                            placeholder="Enter PIN Code or Place Name…"
                            className="premium-pin-input"
                            style={{fontSize:'0.95rem',letterSpacing:0,fontWeight:500}}
                            value={modalSearch}
                            onChange={e => handleModalInput(e.target.value)}
                            onFocus={() => { if(modalSearch.length > 1) setShowPlaceDrop(true); }}
                            autoComplete="off"
                            autoFocus
                            aria-label="Search location"
                          />
                          {modalSearch && (
                            <button type="button" style={{background:'none',border:'none',cursor:'pointer',padding:'0 0.4rem',color:'var(--text-3)'}}
                              onClick={() => { setModalSearch(''); setPlaceSuggestions([]); setShowPlaceDrop(false); }}>
                              <X size={15}/>
                            </button>
                          )}
                          <button type="submit" className="premium-search-btn" disabled={!modalSearch.trim()}>
                            <Search size={18} />
                          </button>
                        </div>

                        {showPlaceDrop && placeSuggestions.length > 0 && (
                          <div className="place-suggestions-drop">
                            {placeSuggestions.map((p) => (
                              <button
                                key={p.place_id}
                                type="button"
                                className="place-suggestion-item"
                                onMouseDown={e => { e.preventDefault(); handlePlaceSelect(p); }}
                                onTouchEnd={e => { e.preventDefault(); handlePlaceSelect(p); }}
                              >
                                <MapPin size={14} style={{color:'var(--primary)',flexShrink:0}}/>
                                <span className="place-suggestion-text">
                                  <span className="place-main">{p.main_text}</span>
                                  <span className="place-sub">{p.secondary_text}</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
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
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── MAIN CONTENT ── */}
        <main className="main-content">

          {/* List / Map toggle */}
          {!loading && !errorMsg && (
            <div className="view-toggle-bar">
              <button
                className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                aria-label="List view"
              >
                <LayoutList size={16} /> List
              </button>
              <button
                className={`view-toggle-btn ${viewMode === 'map' ? 'active' : ''}`}
                onClick={() => setViewMode('map')}
                aria-label="Map view"
              >
                <Map size={16} /> Map
              </button>
            </div>
          )}

          {loading ? renderSkeletons() : errorMsg ? (
            <div className="empty-state">
              <div className="empty-state-icon"><X size={28}/></div>
              <h3>Oops!</h3><p>{errorMsg}</p>
            </div>
          ) : (
            <>
              {/* MAP VIEW */}
              {viewMode === 'map' && (
                <MapView
                  centers={filteredCenters}
                  userCoords={userCoords}
                  routeData={routeData}
                  resolvedCoords={resolvedCoords}
                  centerCoords={centerCoords}
                />
              )}

              {/* LIST VIEW */}
              {viewMode === 'list' && (
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

                    // ── Navigate URL logic ──
                    // Priority 1: verified sheet link → use as-is
                    // Priority 2: auto-geocoded coords → build Maps search URL (with popup warning)
                    // Priority 3: nothing → disabled
                    const sheetUrl = center.mapLink || '';
                    const autoCoords = resolvedCoords[center.centerName] || activeData.find(d => d.id === center.id)?.coords;
                    const autoNavUrl = !sheetUrl && autoCoords
                      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(center.centerName + ', ' + center.district + ', India')}`
                      : null;
                    const directionsUrl = sheetUrl;  // only the verified sheet link is used directly


                    return (
                      <React.Fragment key={center.id}>
                        {showHeading && !userCoords && (
                          <h2 className="district-heading"><Map size={14} strokeWidth={2.5}/> {center.district}</h2>
                        )}
                          <div className="center-card" style={{ animationDelay: `${Math.min(index*0.025, 0.5)}s` }}>

                            {/* Center Location Preview thumbnail */}
                            {autoCoords && (autoCoords.lat || autoCoords.lng) && index < 20 && GOOGLE_MAPS_API_KEY && (
                              <div className="card-map-thumbnail" onClick={() => setSelectedCenterModal({ center, centerCoords: autoCoords })} style={{cursor:'pointer'}}>
                                <img
                                  src={`https://maps.googleapis.com/maps/api/staticmap?center=${autoCoords.lat},${autoCoords.lng || autoCoords.lon}&zoom=14&size=400x120&markers=color:red%7C${autoCoords.lat},${autoCoords.lng || autoCoords.lon}&key=${GOOGLE_MAPS_API_KEY}`}
                                  alt="Map Preview"
                                  loading="lazy"
                                  className="card-map-img"
                                  onError={(e) => { e.target.parentElement.style.display='none'; }}
                                />
                              </div>
                            )}

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
                             {center.phone && (
                               <a href={`tel:${center.phone.replace(/[^0-9+]/g,'')}`} className="action-btn btn-outline" style={{padding: '0.6rem 1rem'}}>
                                 <Phone size={17}/> Call
                               </a>
                             )}
                             {directionsUrl
                               ? <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="action-btn btn-primary" style={{padding: '0.6rem 1rem', flex: 1}}>
                                   <Navigation size={17}/> Navigate
                                 </a>
                               : autoNavUrl
                                 ? <button
                                     className="action-btn btn-primary btn-auto-nav"
                                     title="Auto-detected location – tap to verify before navigating"
                                     onClick={() => setAutoNavPopup({ url: autoNavUrl, centerName: center.centerName, district: center.district })}
                                     style={{padding: '0.6rem 1rem', flex: 1}}
                                   >
                                     <Navigation size={17}/> Navigate *
                                   </button>
                                 : <span className="action-btn btn-primary btn-disabled" title="Map link not added yet" style={{padding: '0.6rem 1rem', flex: 1}}>
                                     <Navigation size={17}/> No Link Yet
                                   </span>
                             }
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>

      {selectedCenterModal && (
        <CenterDetailsModal 
          center={selectedCenterModal.center} 
          userCoords={userCoords} 
          centerCoords={selectedCenterModal.centerCoords} 
          onClose={() => setSelectedCenterModal(null)} 
        />
      )}

      {/* ── AUTO-NAV CONFIRMATION POPUP ── */}
      {autoNavPopup && (
        <div className="autonav-overlay" onClick={() => setAutoNavPopup(null)}>
          <div className="autonav-modal" onClick={e => e.stopPropagation()}>
            <div className="autonav-header">
              <span className="autonav-icon">📍</span>
              <h3 className="autonav-title">Verify Location</h3>
            </div>
            <p className="autonav-body" style={{marginBottom: '1.5rem'}}>
              Please double-check the map pin for <strong>{autoNavPopup.centerName}</strong> before starting your trip to ensure accuracy.
            </p>
            <div className="autonav-actions">
              <button className="autonav-cancel" onClick={() => setAutoNavPopup(null)}>Cancel</button>
              <a
                href={autoNavPopup.url}
                target="_blank"
                rel="noopener noreferrer"
                className="autonav-confirm"
                onClick={() => setAutoNavPopup(null)}
              >
                <Navigation size={15}/> Open in Maps
              </a>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
