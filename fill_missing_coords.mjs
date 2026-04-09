import fs from 'fs';
import Papa from 'papaparse';

const BOYS_CSV = './NEW_SCHEMA_BOYS.csv';
const GIRLS_CSV = './NEW_SCHEMA_GIRLS.csv';
const API_KEY = 'AIzaSyCQSfsKGe0YuCyRMp5qqNJeWypcyHYuhZc'; // From enrich_placeids.mjs

const geocodeLocation = async (query) => {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&region=IN&key=${API_KEY}`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.status === 'OK' && data.results && data.results[0]) {
            const loc = data.results[0].geometry.location;
            if (loc?.lat && loc?.lng) {
                return { lat: loc.lat, lon: loc.lng };
            }
        } else {
            console.warn(`    ⚠️ Geocode failed for "${query}": status ${data.status}`);
        }
    } catch (e) {
        console.error(`    ❌ Fetch err for "${query}":`, e.message);
    }
    return null;
};

const processSheet = async (fileName) => {
    console.log(`\n--- Auditing & Fetching Missing Coords for: ${fileName} ---`);
    const csvData = fs.readFileSync(fileName, 'utf8');
    const parsed = Papa.parse(csvData, { header: true, skipEmptyLines: true });
    
    let resolvedCount = 0;
    
    for (const row of parsed.data) {
        if (!row.latitude || !row.longitude) {
            console.log(`🔍 Missing coords for: [${row.district}] ${row.center_name}`);
            const query = `${row.center_name}, ${row.district}, Kerala, India`;
            const coords = await geocodeLocation(query);
            if (coords) {
                row.latitude = coords.lat.toString();
                row.longitude = coords.lon.toString();
                resolvedCount++;
                console.log(`  ✅ Found exact coordinates: ${coords.lat}, ${coords.lon}`);
            }
        }
    }
    
    if (resolvedCount > 0) {
        const newCsv = Papa.unparse(parsed.data);
        fs.writeFileSync(fileName, newCsv);
        console.log(`\n🎉 Finished ${fileName}. Auto-filled ${resolvedCount} missing locations.\n`);
    } else {
        console.log(`\n✅ Finished ${fileName}. Everything was perfect or couldn't be auto-resolved.\n`);
    }
};

(async () => {
    await processSheet(BOYS_CSV);
    await processSheet(GIRLS_CSV);
    
    // Copy them into public folder so Vercel uses the latest ones
    fs.copyFileSync(BOYS_CSV, './public/data/boys_centers.csv');
    fs.copyFileSync(GIRLS_CSV, './public/data/girls_centers.csv');
    console.log("Copied exact, verified data to public folder!");
})();
