import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, MapPin, Phone, Building, Navigation, User, X, School, Map } from 'lucide-react';
import Papa from 'papaparse';
import './index.css';

const BOYS_CSV_URL  = "/data/boys_centers.csv";
const GIRLS_CSV_URL = "/data/girls_centers.csv";
const GOOGLE_MAPS_API_KEY = "AIzaSyCQSfsKGe0YuCyRMp5qqNJeWypcyHYuhZc";

function App() {
  const [genderFilter, setGenderFilter] = useState('boys');
  const [boysData,  setBoysData]  = useState([]);
  const [girlsData, setGirlsData] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const searchRef = useRef(null);

  /* ── CSV parser (Clean Schema) ── */
  const parseCsvData = (csvText) => new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: true, skipEmptyLines: true,
      complete: (results) => {
        const formatted = results.data.map((row) => ({
          id: (row['id'] || '').trim() || Math.random().toString(36).substr(2, 9),
          district: (row['district'] || '').trim(),
          centerName: (row['center_name'] || '').trim(),
          coordinator: (row['contact_person'] || 'Help Desk').trim(),
          phone: (row['phone_number'] || '').trim(),
          mapLink: (row['map_link'] || '').trim()
        })).filter(c => c.centerName !== '');
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
        const [boysRes, girlsRes] = await Promise.all([
          fetch(BOYS_CSV_URL + bust, { cache: 'no-store' }),
          fetch(GIRLS_CSV_URL + bust, { cache: 'no-store' })
        ]);
        const [boysJson, girlsJson] = await Promise.all([
          parseCsvData(await boysRes.text()),
          parseCsvData(await girlsRes.text())
        ]);
        setBoysData(boysJson);
        setGirlsData(girlsJson);
      } catch (err) {
        console.error('Error loading data:', err);
        setErrorMsg('Failed to load data. Please check your connection.');
      } finally {
        setLoading(false);
      }
    })();
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

  useEffect(() => {
    const h = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setShowSuggestions(false); };
    document.addEventListener('mousedown', h);
    document.addEventListener('touchstart', h);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('touchstart', h); };
  }, []);

  /* ── Filtered / sorted centers ── */
  const filteredCenters = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return activeData;
    return activeData.filter(c => c.centerName.toLowerCase().includes(q) || c.district.toLowerCase().includes(q));
  }, [searchQuery, activeData]);

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
                {searchQuery && (
                    <button className="clear-search" onClick={() => { setSearchQuery(''); setShowSuggestions(false); }} aria-label="Clear search"><X size={14} /></button>
                )}
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
          </div>
        </aside>

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
                    const destSearch = encodeURIComponent(`${center.centerName.replace(/\s*\n\s*/g, ', ').trim()}, ${center.district}, India`);
                    const mapUrl = center.mapLink || `https://www.google.com/maps/search/?api=1&query=${destSearch}`;

                    return (
                      <React.Fragment key={center.id}>
                        {showHeading && (
                          <h2 className="district-heading"><Map size={14} strokeWidth={2.5}/> {center.district}</h2>
                        )}
                        <div className="center-card" style={{ animationDelay: `${Math.min(index*0.025, 0.5)}s` }}>
                          <div className="card-top">
                            <h3 className="center-title">{center.centerName}</h3>
                          </div>
                          
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
                            <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="action-btn btn-primary">
                              <Navigation size={17}/> Navigate
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
