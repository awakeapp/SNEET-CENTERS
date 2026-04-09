/**
 * enrich_placeids.mjs
 * ─────────────────────────────────────────────────────────────
 * Reads center_coords.json, geocodes every INDIVIDUAL_CENTERS
 * entry via Google Geocoding REST API, and writes back the
 * verified placeId alongside the existing lat/lon.
 *
 * Run once:  node enrich_placeids.mjs
 * ─────────────────────────────────────────────────────────────
 */

import fs from 'fs';

const API_KEY   = 'AIzaSyCQSfsKGe0YuCyRMp5qqNJeWypcyHYuhZc';
const JSON_PATH = './public/data/center_coords.json';
const DELAY_MS  = 200; // stay well under Geocoding API rate limit

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function geocode(query) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&region=IN&key=${API_KEY}`;
  const res  = await fetch(url);
  const data = await res.json();
  if (data.status === 'OK' && data.results[0]) {
    return {
      placeId: data.results[0].place_id,
      lat:     data.results[0].geometry.location.lat,
      lon:     data.results[0].geometry.location.lng,
      formatted: data.results[0].formatted_address,
    };
  }
  return null;
}

async function run() {
  const raw  = fs.readFileSync(JSON_PATH, 'utf8');
  const data = JSON.parse(raw);

  const centers = data.INDIVIDUAL_CENTERS;
  const keys    = Object.keys(centers).filter(k => !k.startsWith('_comment'));

  let updated = 0, skipped = 0, failed = 0;

  console.log(`\n🔍 Enriching ${keys.length} centers with Place IDs…\n`);

  for (const key of keys) {
    const entry = centers[key];

    // Already has a placeId → skip (saves API quota)
    if (entry.placeId) {
      console.log(`  ⏭  SKIP  ${key.substring(0, 70)}`);
      skipped++;
      continue;
    }

    // Build a smart query: key name + region hint from key itself
    // Keys like "ZEENATH BAKSH BELLARE, SULLIA" already contain location
    const query = `${key}, India`;

    const result = await geocode(query);
    await sleep(DELAY_MS);

    if (result) {
      centers[key] = {
        lat:     result.lat,
        lon:     result.lon,
        placeId: result.placeId,
      };
      console.log(`  ✅ OK    ${key.substring(0, 60).padEnd(60)} → ${result.placeId.substring(0,27)}…`);
      console.log(`           📍 ${result.formatted}`);
      updated++;
    } else {
      console.log(`  ❌ FAIL  ${key.substring(0, 70)} — no result from Geocoder`);
      failed++;
    }
  }

  // Write enriched JSON back (pretty-printed, preserving comments)
  fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2));
  console.log(`\n✅ Done!  Updated: ${updated}  Skipped: ${skipped}  Failed: ${failed}`);
  console.log(`📄 Written to ${JSON_PATH}\n`);
}

run().catch(e => { console.error(e); process.exit(1); });
