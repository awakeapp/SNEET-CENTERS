import React, { useState, useEffect, useMemo } from 'react';
import { Search, MapPin, Phone, Building, Info, Navigation, Map } from 'lucide-react';
import Papa from 'papaparse';
import './index.css';

// DUMMY DATA FOR NOW - UNTIL USER PROVIDES CSV LINK
const DUMMY_DATA = [
  { id: 1, centerName: "St. John's Public School", district: "Chennai", address: "123 Main St, Anna Nagar", phone: "044-2432901", mapLink: "" },
  { id: 2, centerName: "DPS RK Puram", district: "Delhi", address: "Sector 12, RK Puram", phone: "011-2651000", mapLink: "" },
  { id: 3, centerName: "National Public School", district: "Bangalore", address: "Koramangala 4th Block", phone: "080-2553012", mapLink: "" },
  { id: 4, centerName: "Kendriya Vidyalaya", district: "Chennai", address: "IIT Campus, Guindy", phone: "044-2257001", mapLink: "" }
];

function App() {
  const [centers, setCenters] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // In the future this will flex fetch the user's CSV data
  useEffect(() => {
    // Simulate network delay for the real load feeling
    setTimeout(() => {
      setCenters(DUMMY_DATA);
      setLoading(false);
    }, 800);
  }, []);

  const filteredCenters = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return centers;
    
    return centers.filter(center => 
      center.centerName.toLowerCase().includes(query) ||
      center.district.toLowerCase().includes(query)
    );
  }, [searchQuery, centers]);

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <h1>
          <MapPin size={24} />
          Exam Center Locator
        </h1>
        <p>Find your admission test center and helpline details instantly.</p>
      </header>

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
          <p>Loading centers data...</p>
        </div>
      ) : (
        <>
          <div className="filter-summary">
            Showing {filteredCenters.length} {filteredCenters.length === 1 ? 'center' : 'centers'}
          </div>

          {filteredCenters.length === 0 ? (
            <div className="empty-state">
              <Building className="empty-icon" />
              <h3>No centers found</h3>
              <p>Try adjusting your search terms.</p>
            </div>
          ) : (
            <div className="centers-list">
              {filteredCenters.map((center, index) => (
                <div 
                  className="center-card" 
                  key={center.id}
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className="card-header">
                    <h3 className="center-name">{center.centerName}</h3>
                    <span className="district-badge">{center.district}</span>
                  </div>
                  
                  <div className="card-details">
                    <div className="detail-row">
                      <Map className="detail-icon" />
                      <span>{center.address}</span>
                    </div>
                    {center.phone && (
                      <div className="detail-row">
                        <Phone className="detail-icon" />
                        <span>{center.phone}</span>
                      </div>
                    )}
                  </div>

                  <div className="card-actions">
                    {center.phone && (
                      <a href={`tel:${center.phone}`} className="btn btn-secondary">
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
