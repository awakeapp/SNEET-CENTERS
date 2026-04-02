import React, { useState, useEffect, useMemo } from 'react';
import { Search, MapPin, Phone, Building, Navigation, User, X, School, Map, Crosshair } from 'lucide-react';
import Papa from 'papaparse';
import './index.css';

const BOYS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vReXaCcSjfY47O5-qzYTNZdQKS7DLgj8iZMGW5g40mkKvRBKlj1FZ3B20KOE9rgpbxMp8Sma4Lsl9BT/pub?gid=0&single=true&output=csv";
const GIRLS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vReXaCcSjfY47O5-qzYTNZdQKS7DLgj8iZMGW5g40mkKvRBKlj1FZ3B20KOE9rgpbxMp8Sma4Lsl9BT/pub?gid=1887904745&single=true&output=csv";

function App() {
  const [genderFilter, setGenderFilter] = useState('boys');
  const [boysData, setBoysData] = useState([]);
  const [girlsData, setGirlsData] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [isPinSearching, setIsPinSearching] = useState(false);
  const [userCoords, setUserCoords] = useState(null);
  const [centerCoords, setCenterCoords] = useState({});
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const searchRef = React.useRef(null);

  const parseCsvData = (csvText) => {
    return new Promise((resolve, reject) => {
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          let currentDistrict = 'Unknown';
          const formatted = results.data.map((row, index) => {
            const rowDist = (row['DISTRICT'] || '').trim();
            if (rowDist !== '') currentDistrict = rowDist;

            const centerName = (row['NAME OF THE EXAM CENTRE'] || '').trim();
            const coordText = (row['CENTRE COORDINATOR NUMBER'] || '').trim();
            const mapLink = (row['MAP'] || '').trim();

            const phoneMatch = coordText.match(/[\d+\-\s]{10,15}/);
            const extractedPhone = phoneMatch ? phoneMatch[0].trim() : '';

            let coordNameOnly = coordText;
            if (extractedPhone) {
              coordNameOnly = coordText
                .replace(extractedPhone, '')
                .replace(/[,\-():]+/g, ' ')
                .replace(/\s\s+/g, ' ')
                .trim();
            }

            return {
              id: index,
              district: currentDistrict,
              centerName,
              coordinator: coordNameOnly || 'Help Desk',
              phone: extractedPhone,
              mapLink,
            };
          }).filter(c => c.centerName !== '');

          resolve(formatted);
        },
        error: (err) => reject(err),
      });
    });
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const cacheBust = `&t=${Date.now()}`;
        const [boysRes, girlsRes, coordsRes] = await Promise.all([
          fetch(BOYS_CSV_URL + cacheBust, { cache: 'no-store' }),
          fetch(GIRLS_CSV_URL + cacheBust, { cache: 'no-store' }),
          fetch('/data/center_coords.json').then(r => r.json()).catch(() => ({}))
        ]);
        const boysText = await boysRes.text();
        const girlsText = await girlsRes.text();
        const [boysJson, girlsJson] = await Promise.all([
          parseCsvData(boysText),
          parseCsvData(girlsText),
        ]);
        setBoysData(boysJson);
        setGirlsData(girlsJson);
        setCenterCoords(coordsRes);
      } catch (err) {
        console.error('Error loading data:', err);
        setErrorMsg('Failed to load data. Please check connection.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const activeData = genderFilter === 'boys' ? boysData : girlsData;

  const suggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase().trim();
    const districtMatches = [...new Set(activeData.map(c => c.district))]
      .filter(d => d.toLowerCase().includes(query))
      .map(d => ({ type: 'district', label: d }));
    const centerMatches = activeData
      .filter(c => c.centerName.toLowerCase().includes(query))
      .slice(0, 6)
      .map(c => ({ type: 'center', label: c.centerName, district: c.district }));
    return [...districtMatches.slice(0, 3), ...centerMatches].slice(0, 8);
  }, [searchQuery, activeData]);

  React.useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  };

  const filteredCenters = useMemo(() => {
    let data = activeData.map(c => {
      // Fallback to district level coordinates for reliability
      const coords = centerCoords.DISTRICT_COORDS ? centerCoords.DISTRICT_COORDS[c.district.toUpperCase().trim()] : null;
      if (userCoords && coords) {
        return { ...c, distance: getDistance(userCoords.lat, userCoords.lon, coords.lat, coords.lon) };
      }
      return { ...c, distance: null };
    });

    if (userCoords) {
      // Sort the global list by KM distance
      return [...data].sort((a, b) => {
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
      });
    }

    const query = searchQuery.toLowerCase().trim();
    if (!query) return data;
    return data.filter(
      c => c.centerName.toLowerCase().includes(query) || c.district.toLowerCase().includes(query)
    );
  }, [searchQuery, activeData, userCoords, centerCoords]);

  const handlePinSubmit = async (e) => {
    e.preventDefault();
    const pin = pinInput.trim();
    if (!pin) return;

    setIsPinSearching(true);
    try {
      // 1. Try Zippopotam (Direct GPS)
      const res = await fetch(`https://api.zippopotam.us/IN/${pin}`);
      if (res.ok) {
        const data = await res.json();
        if (data.places && data.places[0]) {
          const place = data.places[0];
          setUserCoords({ lat: parseFloat(place.latitude), lon: parseFloat(place.longitude) });
          setSearchQuery('');
          setShowPinModal(false);
          setPinInput('');
          return;
        }
      }

      // 2. Fallback to Indian Post Office (District)
      const res2 = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
      const data2 = await res2.json();
      if (data2[0]?.Status === "Success" && data2[0].PostOffice) {
        const district = data2[0].PostOffice[0].District.toUpperCase().trim();
        const coords = centerCoords.DISTRICT_COORDS?.[district];
        if (coords) {
          setUserCoords(coords);
          setSearchQuery('');
          setShowPinModal(false);
          setPinInput('');
          return;
        }
      }

      alert("Location not found. Please try searching by your District name directly.");
    } catch (err) {
      console.error(err);
      alert("Error finding location. Please check your connection.");
    } finally {
      setIsPinSearching(false);
    }
  };

  const renderSkeletons = () => (
    <div className="centers-grid">
      {[1, 2, 3, 4, 5, 6].map(i => (
        <div key={i} className="skeleton-card">
          <div className="sk-tag skeleton"></div>
          <div className="sk-title skeleton"></div>
          <div className="sk-text skeleton"></div>
          <div className="sk-text short skeleton"></div>
          <div className="sk-btns">
            <div className="sk-btn skeleton"></div>
            <div className="sk-btn skeleton"></div>
          </div>
        </div>
      ))}
    </div>
  );

  const Sidebar = (
    <aside className="sidebar">
      <div className="sidebar-inner">
        {/* Header Banner */}
        <header className="header">
          <div className="header-card">
            <img
              src="/HEADER.jpg"
              alt="SNEET Centers"
              className="header-image"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
            <div className="header-fallback" style={{ display: 'none' }}>
              <h1 className="fallback-title">SNEET CENTERS</h1>
              <p className="fallback-subtitle">
                Save your image as <strong>HEADER.jpg</strong> in the <code>public</code> folder
              </p>
            </div>
          </div>
        </header>

        {/* Gender Toggle */}
        <div className="segmented-control">
          <button
            className={`segment-btn ${genderFilter === 'boys' ? 'active' : ''}`}
            onClick={() => setGenderFilter('boys')}
          >
            Boys Centers ({boysData.length || '-'})
          </button>
          <button
            className={`segment-btn ${genderFilter === 'girls' ? 'active' : ''}`}
            onClick={() => setGenderFilter('girls')}
          >
            Girls Centers ({girlsData.length || '-'})
          </button>
        </div>

        {/* Search */}
        <div className="search-wrapper" ref={searchRef}>
          <div className="search-input-container">
            <Search className="search-icon" size={20} />
            <input
              type="text"
              className="search-input"
              placeholder="Search center name or district..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              autoComplete="off"
            />
            <button
              className="clear-search"
              onClick={() => { setSearchQuery(''); setShowSuggestions(false); }}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          </div>

          {showSuggestions && suggestions.length > 0 && (
            <div className="suggestions-dropdown">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  className="suggestion-item"
                  onMouseDown={(e) => { e.preventDefault(); setSearchQuery(s.label); setShowSuggestions(false); }}
                  onTouchEnd={(e) => { e.preventDefault(); setSearchQuery(s.label); setShowSuggestions(false); }}
                >
                  <span className="suggestion-icon">
                    {s.type === 'district' ? <MapPin size={16} strokeWidth={2.5}/> : <School size={16} strokeWidth={2.5} />}
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

        <button 
          className="find-nearest-btn"
          onClick={() => setShowPinModal(true)}
        >
          <Crosshair size={18} />
          Find Nearest Center
        </button>

        {/* PIN Entry Modal */}
        {showPinModal && (
          <div className="pin-modal-overlay">
            <div className="pin-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="pin-modal-header">
                <h3>Find Nearest</h3>
                <button className="close-modal" onClick={() => setShowPinModal(false)}><X size={20} /></button>
              </div>
              <p className="pin-modal-desc">Enter your 6-digit PIN code to find centers in your district.</p>
              <form onSubmit={handlePinSubmit}>
                <div className="pin-input-group">
                  <input 
                    type="text" 
                    pattern="[0-9]*"
                    inputMode="numeric"
                    maxLength="6"
                    placeholder="Enter 6-digit PIN"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                    autoFocus
                  />
                  <button type="submit" disabled={isPinSearching || pinInput.length < 6}>
                    {isPinSearching ? "Searching..." : "Find"}
                  </button>
                </div>
              </form>
              <p className="pin-modal-note">Note: For Middle East & International locations, please use the search bar directly.</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );

  const MainContent = (
    <main className="main-content">
      {loading ? (
        renderSkeletons()
      ) : errorMsg ? (
        <div className="empty-state">
          <div className="empty-state-icon"><X size={28} /></div>
          <h3>Oops!</h3>
          <p>{errorMsg}</p>
        </div>
      ) : (
        <>
          <div className="meta-info">
            <span className="result-count">
              {userCoords ? "Nearest Results (by Distance)" : `${filteredCenters.length} ${filteredCenters.length === 1 ? 'Center' : 'Centers'} Found`}
            </span>
            {userCoords && (
              <button className="clear-nearest" onClick={() => setUserCoords(null)}>
                <X size={14} /> Clear Nearest
              </button>
            )}
          </div>

          {filteredCenters.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><Building size={28} /></div>
              <h3>No centers found</h3>
              <p>Try adjusting your search terms.</p>
            </div>
          ) : (
            <div className="centers-grid">
              {filteredCenters.map((center, index) => {
                const showHeading = index === 0 || center.district !== filteredCenters[index - 1].district;
                return (
                  <React.Fragment key={center.id}>
                    {showHeading && !userCoords && <h2 className="district-heading"><Map size={14} strokeWidth={2.5} /> {center.district}</h2>}
                    <div className="center-card" style={{ animationDelay: `${index * 0.025}s` }}>
                      <div className="card-top">
                        <h3 className="center-title">{center.centerName}</h3>
                        {center.distance !== null && (
                          <div className="distance-badge">
                            {center.distance} KM AWAY
                          </div>
                        )}
                      </div>
                      <div className="card-body">
                        <div className="info-row">
                          <MapPin className="info-icon" size={16} />
                          <span className="info-text">
                            <strong>District:</strong> {center.district}
                          </span>
                        </div>
                        <div className="info-row">
                          <User className="info-icon" size={16} />
                          <span className="info-text">
                            <strong>Coordinator:</strong> {center.coordinator}
                          </span>
                        </div>
                      </div>
                      <div className="card-footer">
                        {center.phone ? (
                          <a href={`tel:${center.phone.replace(/[^0-9+]/g, '')}`} className="action-btn btn-outline">
                            <Phone size={17} /> Call Desk
                          </a>
                        ) : <div></div>}
                        <a
                          href={center.mapLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(center.centerName + ' ' + center.district)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="action-btn btn-primary"
                        >
                          <Navigation size={17} /> Navigate
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
  );

  return (
    <div className="app-container">
      <div className="desktop-layout">
        {Sidebar}
        {MainContent}
      </div>
    </div>
  );
}

export default App;
