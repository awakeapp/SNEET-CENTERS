import React, { useState, useEffect, useMemo } from 'react';
import { Search, MapPin, Phone, Building, Navigation, User, Map } from 'lucide-react';
import Papa from 'papaparse';
import './index.css';

// We implement fetching in a robust way
const BOYS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vReXaCcSjfY47O5-qzYTNZdQKS7DLgj8iZMGW5g40mkKvRBKlj1FZ3B20KOE9rgpbxMp8Sma4Lsl9BT/pub?output=csv";
const GIRLS_CSV_URL = null; // We need user to provide this

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

            const phoneMatch = coordText.match(/[\d\+\-\s]{10,15}/);
            const extractedPhone = phoneMatch ? phoneMatch[0].trim() : '';

            return {
              id: index,
              district: currentDistrict,
              centerName: centerName,
              coordinator: coordText,
              phone: extractedPhone,
              mapLink: mapLink
            };
          }).filter(c => c.centerName !== ''); // remove invalid lines
          
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
        // Fetch boys
        const boysRes = await fetch(BOYS_CSV_URL);
        const boysText = await boysRes.text();
        const boysJson = await parseCsvData(boysText);
        setBoysData(boysJson);

        // Fetch girls if url exists
        if (GIRLS_CSV_URL) {
          const girlsRes = await fetch(GIRLS_CSV_URL);
          const girlsText = await girlsRes.text();
          const girlsJson = await parseCsvData(girlsText);
          setGirlsData(girlsJson);
        }
        
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

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <h1>
          <MapPin size={24} />
          Exam Center Locator
        </h1>
        <p>Find your admission test center details instantly.</p>
      </header>

      {/* Gender Toggle */}
      <div className="gender-toggle">
        <button 
          className={`toggle-btn ${genderFilter === 'boys' ? 'active' : ''}`}
          onClick={() => setGenderFilter('boys')}
        >
          Boys Centers ({boysData.length})
        </button>
        <button 
          className={`toggle-btn ${genderFilter === 'girls' ? 'active' : ''}`}
          onClick={() => setGenderFilter('girls')}
        >
          Girls Centers {GIRLS_CSV_URL ? `(${girlsData.length})` : '(Need Link)'}
        </button>
      </div>

      {/* Search Bar */}
      <div className="search-container">
        <Search className="search-icon" />
        <input 
          type="text" 
          className="search-input"
          placeholder="Search by center name or district..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading centers data from Google Sheets...</p>
        </div>
      ) : errorMsg ? (
        <div className="empty-state">
          <h3>Oops!</h3>
          <p>{errorMsg}</p>
        </div>
      ) : (
        <>
          <div className="filter-summary">
            Showing {filteredCenters.length} {filteredCenters.length === 1 ? 'center' : 'centers'}
            {searchQuery && ` for "${searchQuery}"`}
          </div>

          {filteredCenters.length === 0 ? (
            <div className="empty-state">
              <Building className="empty-icon" />
              <h3>No centers found</h3>
              {genderFilter === 'girls' && !GIRLS_CSV_URL ? (
                <p>Waiting for the Girls Sheet CSV Link from Administrator.</p>
              ) : (
                <p>Try adjusting your search terms.</p>
              )}
            </div>
          ) : (
            <div className="centers-list">
              {filteredCenters.map((center, index) => (
                <div 
                  className="center-card" 
                  key={center.id}
                  style={{ animationDelay: `${index * 0.03}s` }}
                >
                  <div className="card-header">
                    <h3 className="center-name">{center.centerName}</h3>
                    <span className="district-badge">{center.district}</span>
                  </div>
                  
                  <div className="card-details">
                    <div className="detail-row">
                      <User className="detail-icon" />
                      <span><strong>Coordinator:</strong> {center.coordinator}</span>
                    </div>
                  </div>

                  <div className="card-actions">
                    {center.phone && (
                      <a href={`tel:${center.phone.replace(/[^0-9+]/g, '')}`} className="btn btn-secondary">
                        <Phone size={18} />
                        Call
                      </a>
                    )}
                    <a 
                      href={center.mapLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(center.centerName + ' ' + center.district)}`}
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="btn btn-primary"
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
