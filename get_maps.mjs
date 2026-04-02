import fs from 'fs';
import Papa from 'papaparse';

const BOYS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vReXaCcSjfY47O5-qzYTNZdQKS7DLgj8iZMGW5g40mkKvRBKlj1FZ3B20KOE9rgpbxMp8Sma4Lsl9BT/pub?gid=0&single=true&output=csv";
const GIRLS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vReXaCcSjfY47O5-qzYTNZdQKS7DLgj8iZMGW5g40mkKvRBKlj1FZ3B20KOE9rgpbxMp8Sma4Lsl9BT/pub?gid=1887904745&single=true&output=csv";

async function processCsv(url, outputFile) {
    console.log(`Downloading ${outputFile}...`);
    const res = await fetch(url);
    const text = await res.text();
    
    let currentDistrict = "Unknown";
    // We intentionally keep empty lines so that the row numbers match their Google Sheet EXACTLY.
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: false });
    
    const outputRows = [];
    // Push the header for the output file
    outputRows.push(['ROW #', 'NAME OF THE EXAM CENTRE', 'DISTRICT', 'GENERATED MAP LINK']);
    
    parsed.data.forEach((row, index) => {
        const rowDist = row['DISTRICT'] ? row['DISTRICT'].trim() : '';
        if (rowDist !== '') {
            currentDistrict = rowDist;
        }
        
        const centerName = row['NAME OF THE EXAM CENTRE'] ? row['NAME OF THE EXAM CENTRE'].trim() : '';
        let mapLink = row['MAP'] ? row['MAP'].trim() : '';
        
        if (!mapLink && centerName) {
            mapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(centerName + ' ' + currentDistrict)}`;
        }
        
        outputRows.push([
            index + 2, // Excel/Sheets row number (1-indexed + 1 for header)
            centerName,
            currentDistrict,
            mapLink
        ]);
    });
    
    const newCsvText = Papa.unparse(outputRows);
    fs.writeFileSync(outputFile, newCsvText);
    console.log(`Saved ${outputFile}`);
}

async function run() {
    await processCsv(BOYS_CSV_URL, 'e:/APPS/SNEC/exam-center-locator/generated_boys_maps.csv');
    await processCsv(GIRLS_CSV_URL, 'e:/APPS/SNEC/exam-center-locator/generated_girls_maps.csv');
    console.log('All links generated successfully!');
}

run();
