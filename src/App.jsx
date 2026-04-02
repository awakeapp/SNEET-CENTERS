import React, { useState, useEffect, useMemo } from 'react';
import { Search, MapPin, Phone, Building, Navigation, User, X } from 'lucide-react';
import Papa from 'papaparse';
import './index.css';

const BOYS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vReXaCcSjfY47O5-qzYTNZdQKS7DLgj8iZMGW5g40mkKvRBKlj1FZ3B20KOE9rgpbxMp8Sma4Lsl9BT/pub?gid=0&single=true&output=csv";
const GIRLS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vReXaCcSjfY47O5-qzYTNZdQKS7DLgj8iZMGW5g40mkKvRBKlj1FZ3B20KOE9rgpbxMp8Sma4Lsl9BT/pub?gid=1887904745&single=true&output=csv";

function App() {
  const [genderFilter, setGenderFilter] = useState('boys');
  const [boysData, setBoysData] = useState([]);
  const [girlsData, setGirlsData] = useState([]);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const parseCsvData = (csvText) => {
    return new Promise((resolve, reject) => {
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          let currentDistrict = "Unknown";
          const formatted = results.data.map((row, index) => {
            const rowDist = (row['DISTRICT'] || '').trim();
            if (rowDist !== '') {
              currentDistrict = rowDist;
            }
            
            const centerName = (row['NAME OF THE EXAM CENTRE'] || '').trim();
            const coordText = (row['CENTRE COORDINATOR NUMBER'] || '').trim();
            const mapLink = (row['MAP'] || '').trim();

            const phoneMatch = coordText.match(/[\d+\-\s]{10,15}/);
            const extractedPhone = phoneMatch ? phoneMatch[0].trim() : '';
            
            let coordNameOnly = coordText;
            if (extractedPhone) {
              // Strip the phone number and trailing/leading punctuation
              coordNameOnly = coordText.replace(extractedPhone, '').replace(/[,\-():]+/g, ' ').replace(/\s\s+/g, ' ').trim();
            }

            return {
              id: index,
              district: currentDistrict,
              centerName: centerName,
              coordinator: coordNameOnly || 'Help Desk',
              phone: extractedPhone,
              mapLink: mapLink
            };
          }).filter(c => c.centerName !== '');
          
          // Preserve the original order from the Google Sheet
          resolve(formatted);
        },
        error: (err) => reject(err)
      });
    });
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [boysRes, girlsRes] = await Promise.all([
          fetch(BOYS_CSV_URL),
          fetch(GIRLS_CSV_URL)
        ]);

        const boysText = await boysRes.text();
        const girlsText = await girlsRes.text();

        const [boysJson, girlsJson] = await Promise.all([
          parseCsvData(boysText),
          parseCsvData(girlsText)
        ]);

        setBoysData(boysJson);
        setGirlsData(girlsJson);
      } catch (err) {
        console.error("Error loading CSV:", err);
        setErrorMsg("Failed to load data. Please check connection.");
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  const activeData = genderFilter === 'boys' ? boysData : girlsData;

  const filteredCenters = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return activeData;
    
    return activeData.filter(center => 
      center.centerName.toLowerCase().includes(query) ||
      center.district.toLowerCase().includes(query)
    );
  }, [searchQuery, activeData]);

  // Loading Skeleton Component
  const renderSkeletons = () => (
    <div className="centers-grid">
      {[1, 2, 3, 4].map(i => (
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

  return (
    <div className="app-container">
      {/* Header */}
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
          {/* Fallback shown if the user hasn't saved the image in the public folder yet */}
          <div className="header-fallback" style={{ display: 'none' }}>
            <h1 className="fallback-title">SNEET CENTERS</h1>
            <p className="fallback-subtitle">Save your image as <strong>HEADER.jpg</strong> in the <code>public</code> folder</p>
          </div>
        </div>
      </header>

      {/* Segmented Control */}
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

      {/* Search Bar */}
      <div className="search-wrapper">
        <div className="search-input-container">
          <Search className="search-icon" size={20} />
          <input 
            type="text" 
            className="search-input"
            placeholder="Search center name or district..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button 
            className="clear-search" 
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        renderSkeletons()
      ) : errorMsg ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <X size={32} />
          </div>
          <h3>Oops!</h3>
          <p>{errorMsg}</p>
        </div>
      ) : (
        <>
          <div className="meta-info">
            <span className="result-count">
              {filteredCenters.length} {filteredCenters.length === 1 ? 'Result' : 'Results'}
            </span>
          </div>

          {filteredCenters.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Building size={32} />
              </div>
              <h3>No centers found</h3>
              <p>Try adjusting your search terms.</p>
            </div>
          ) : (
            <div className="centers-grid">
              {filteredCenters.map((center, index) => (
                <div 
                  className="center-card" 
                  key={center.id}
                  style={{ animationDelay: `${index * 0.03}s` }}
                >
                  <div className="card-top">
                    <h3 className="center-title">{center.centerName}</h3>
                    <span className="district-tag">{center.district}</span>
                  </div>
                  
                  <div className="card-body">
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
                        <Phone size={18} />
                        Call Desk
                      </a>
                    ) : (
                      <div></div>
                    )}
                    <a 
                      href={center.mapLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(center.centerName + ' ' + center.district)}`}
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="action-btn btn-primary"
                    >
                      <Navigation size={18} />
                      Navigate
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default App;
