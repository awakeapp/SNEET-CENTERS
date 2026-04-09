import fs from 'fs';
import https from 'https';
import Papa from 'papaparse';

const BOYS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vReXaCcSjfY47O5-qzYTNZdQKS7DLgj8iZMGW5g40mkKvRBKlj1FZ3B20KOE9rgpbxMp8Sma4Lsl9BT/pub?gid=0&single=true&output=csv";
const GIRLS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vReXaCcSjfY47O5-qzYTNZdQKS7DLgj8iZMGW5g40mkKvRBKlj1FZ3B20KOE9rgpbxMp8Sma4Lsl9BT/pub?gid=1887904745&single=true&output=csv";

// Load existing coords json so we can populate lat & lon directly
let centerCoords = {};
try {
  centerCoords = JSON.parse(fs.readFileSync('./public/data/center_coords.json', 'utf8'));
} catch (e) {
  console.log("Could not find center_coords.json, continuing without preexisting coords.");
}

const fetchCSV = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return await res.text();
};

const generateSchema = async (url, prefix, outputFile) => {
  console.log(`Downloading ${prefix} data...`);
  const csvText = await fetchCSV(url);
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  
  let currentDistrict = 'Unknown';
  let counter = 1;
  
  const newData = parsed.data.map(row => {
    const rowDist = (row['DISTRICT'] || '').trim();
    if (rowDist) currentDistrict = rowDist;
    
    const centerName = (row['NAME OF THE EXAM CENTRE'] || '').trim();
    if (!centerName) return null;
    
    // Separation logic for contact person vs phone number
    const coordText = (row['CENTRE COORDINATOR NUMBER'] || '').trim();
    const phoneMatch = coordText.match(/[\d+\-\s]{10,15}/);
    let phoneNumber = phoneMatch ? phoneMatch[0].trim() : '';
    let contactPerson = coordText;
    if (phoneNumber) {
      contactPerson = coordText.replace(phoneNumber, '').replace(/[,\-():]+/g, ' ').replace(/\s\s+/g, ' ').trim();
    }
    
    // Lookup latitude and longitude from JSON mapping Cache
    const nameKey = centerName.toUpperCase().replace(/\s*\n\s*/g, ' ');
    const distKey = currentDistrict.toUpperCase();
    
    const individualCoord = centerCoords?.INDIVIDUAL_CENTERS?.[nameKey];
    const districtCoord = centerCoords?.DISTRICT_COORDS?.[distKey];
    let lat = individualCoord?.lat || districtCoord?.lat || '';
    let lon = individualCoord?.lon || districtCoord?.lon || '';
        
    let mapLink = (row['MAP'] || '').trim();
    if (!mapLink) {
        mapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${centerName} ${currentDistrict}`)}`;
    }

    return {
      id: `${prefix}-${counter++}`,
      center_name: centerName,
      district: currentDistrict,
      taluk_or_city: '', // Kept empty for manual entry later if desired
      address: '',       // Left empty for manual entry
      latitude: lat,
      longitude: lon,
      contact_person: contactPerson || 'Help Desk',
      phone_number: phoneNumber,
      map_link: mapLink,
      status: 'TRUE'
    };
  }).filter(Boolean);

  const newCSVText = Papa.unparse(newData);
  fs.writeFileSync(outputFile, newCSVText);
  console.log(`Done! Wrote ${newData.length} rows to ${outputFile}`);
};

(async () => {
  try {
    await generateSchema(BOYS_CSV_URL, 'BOY', 'NEW_SCHEMA_BOYS.csv');
    await generateSchema(GIRLS_CSV_URL, 'GIRL', 'NEW_SCHEMA_GIRLS.csv');
  } catch (err) {
    console.error("Error generating schema CSVs: ", err);
  }
})();
