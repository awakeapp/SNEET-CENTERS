import fs from 'fs';
import Papa from 'papaparse';

const BOYS_CSV = './NEW_SCHEMA_BOYS.csv';
const GIRLS_CSV = './NEW_SCHEMA_GIRLS.csv';

const resolveLink = async (url) => {
    if (!url || (!url.includes('goo.gl') && !url.includes('share.google'))) return null;
    try {
        const res = await fetch(url, { redirect: 'follow' });
        const finalUrl = res.url;
        // Try extracting !3dLAT!4dLON (most precise)
        let match = finalUrl.match(/!3d([-\d.]+)!4d([-\d.]+)/);
        if (match) return { lat: parseFloat(match[1]), lon: parseFloat(match[2]) };
        // Fallback to @LAT,LON
        match = finalUrl.match(/@([-\d.]+),([-\d.]+)/);
        if (match) return { lat: parseFloat(match[1]), lon: parseFloat(match[2]) };
    } catch (e) {
        console.error(`Failed to resolve ${url}:`, e.message);
    }
    return null;
};

const processSheet = async (fileName) => {
    console.log(`Processing ${fileName}...`);
    const csvData = fs.readFileSync(fileName, 'utf8');
    const parsed = Papa.parse(csvData, { header: true, skipEmptyLines: true });
    
    let resolvedCount = 0;
    
    for (const row of parsed.data) {
        if (!row.latitude || !row.longitude) {
            const coords = await resolveLink(row.map_link);
            if (coords) {
                row.latitude = coords.lat.toString();
                row.longitude = coords.lon.toString();
                resolvedCount++;
                console.log(`Resolved: ${row.center_name} -> ${coords.lat}, ${coords.lon}`);
            }
        }
    }
    
    const newCsv = Papa.unparse(parsed.data);
    fs.writeFileSync(fileName, newCsv);
    console.log(`Finished ${fileName}. Resolved ${resolvedCount} additional coordinates from links.\n`);
};

(async () => {
    await processSheet(BOYS_CSV);
    await processSheet(GIRLS_CSV);
    
    // Copy them into public folder so Vercel uses the latest ones
    fs.copyFileSync(BOYS_CSV, './public/data/boys_centers.csv');
    fs.copyFileSync(GIRLS_CSV, './public/data/girls_centers.csv');
    console.log("Copied exact data to public folder!");
})();
