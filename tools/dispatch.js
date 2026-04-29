/**
 * Tool 04 — Route & dispatch optimisation
 * Fetches the day's bookings, geocodes addresses, clusters by depot,
 * runs nearest-neighbour routing, and sends driver manifests via SMS.
 */

import { getBookingsByDate, updateBookingStatus } from '../lib/supabase.js';
import { sendWhatsApp } from './whatsapp.js';
import { complete } from '../lib/claude.js';

const DEPOTS = {
  hwycombe: { name: 'High Wycombe depot', lat: 51.6282, lng: -0.7483, phone: process.env.DRIVER_A_PHONE },
};

/**
 * Geocode a UK postcode using the free postcodes.io API.
 */
async function geocodePostcode(postcode) {
  try {
    const clean = postcode.replace(/\s/g, '').toUpperCase();
    const res = await fetch(`https://api.postcodes.io/postcodes/${clean}`);
    const json = await res.json();
    if (json.status === 200) {
      return { lat: json.result.latitude, lng: json.result.longitude };
    }
  } catch {}
  return null;
}

/**
 * Haversine distance in km between two lat/lng points.
 */
function distanceKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

/**
 * Assign bookings to the nearest depot.
 */
function assignToDepot(bookings) {
  const depotKeys = Object.keys(DEPOTS);
  const routes = Object.fromEntries(depotKeys.map(k => [k, []]));
  for (const booking of bookings) {
    if (!booking.coords) continue;
    let nearest = depotKeys[0];
    let nearestDist = Infinity;
    for (const key of depotKeys) {
      const d = distanceKm(DEPOTS[key], booking.coords);
      if (d < nearestDist) { nearestDist = d; nearest = key; }
    }
    routes[nearest].push({ ...booking, distanceFromDepot: nearestDist });
  }
  return routes;
}

/**
 * Nearest-neighbour TSP heuristic — orders stops to minimise total distance.
 */
function optimiseRoute(depot, stops) {
  if (stops.length === 0) return [];
  const unvisited = [...stops];
  const route = [];
  let current = depot;

  while (unvisited.length > 0) {
    let nearest = null;
    let nearestDist = Infinity;
    for (const stop of unvisited) {
      const d = distanceKm(current, stop.coords);
      if (d < nearestDist) { nearestDist = d; nearest = stop; }
    }
    route.push({ ...nearest, legKm: nearestDist.toFixed(1) });
    current = nearest.coords;
    unvisited.splice(unvisited.indexOf(nearest), 1);
  }
  return route;
}

/**
 * Format a driver manifest as a readable message.
 */
function formatManifest(depotName, route, date) {
  if (route.length === 0) return null;
  const lines = [
    `RL Skip Hire — Driver Manifest`,
    `${depotName} | ${date}`,
    `Total jobs: ${route.length}`,
    `─────────────────`,
  ];
  route.forEach((stop, i) => {
    lines.push(`${i + 1}. ${stop.customer_name}`);
    lines.push(`   ${stop.postcode} | ${stop.skip_size}`);
    lines.push(`   ${stop.on_road ? 'ROAD — permit req.' : 'Driveway'}`);
    if (stop.waste_description) lines.push(`   Waste: ${stop.waste_description}`);
    lines.push(`   Approx ${stop.legKm}km from prev stop`);
    lines.push('');
  });
  lines.push(`─────────────────`);
  lines.push(`Call RL Skip Hire: 01494 853085`);
  return lines.join('\n');
}

/**
 * Main dispatch function — run this every morning (see crons/dispatch.js).
 * @param {string} date - ISO date string YYYY-MM-DD
 */
export async function generateDailyDispatch(date) {
  const bookings = await getBookingsByDate(date);
  if (bookings.length === 0) {
    console.log(`[Dispatch] No bookings for ${date}`);
    return { date, routes: {} };
  }

  console.log(`[Dispatch] Processing ${bookings.length} bookings for ${date}`);

  // Geocode all postcodes
  const geocoded = await Promise.all(
    bookings.map(async b => ({
      ...b,
      coords: await geocodePostcode(b.postcode),
    }))
  );

  const failed = geocoded.filter(b => !b.coords);
  if (failed.length > 0) {
    console.warn(`[Dispatch] Could not geocode: ${failed.map(b => b.postcode).join(', ')}`);
  }

  // Assign to depots and optimise
  const assignments = assignToDepot(geocoded.filter(b => b.coords));
  const results = {};

  for (const [depotKey, depot] of Object.entries(DEPOTS)) {
    const stops = assignments[depotKey];
    const route = optimiseRoute(depot, stops);
    results[depotKey] = route;

    const manifest = formatManifest(depot.name, route, date);
    if (manifest && depot.phone) {
      // Send manifest to driver via WhatsApp
      await sendWhatsApp(depot.phone, manifest);
      console.log(`[Dispatch] Manifest sent to ${depot.name} driver`);
    }

    // Use Claude to summarise and flag anything unusual
    if (route.length > 0) {
      const summary = await complete(
        `Summarise this driver route for the RL Skip Hire ops manager in 2-3 sentences. Flag any issues (permit jobs, unusual waste, very long routes). Route: ${JSON.stringify(route.map(s => ({ postcode: s.postcode, skipSize: s.skip_size, onRoad: s.on_road, waste: s.waste_description })))}`,
        'You are a brief, factual dispatch summariser for a skip hire company. Be concise.'
      );
      console.log(`[Dispatch] ${depot.name} summary: ${summary}`);
      results[`${depotKey}_summary`] = summary;
    }
  }

  return { date, totalBookings: bookings.length, routes: results };
}
