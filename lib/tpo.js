/**
 * Live TPO and Conservation Area lookup
 *
 * Data sources:
 *   - postcodes.io     — free, no key, converts postcode to coordinates
 *   - planning.data.gov.uk — UK Government Planning Data platform
 *     Covers tree-preservation-order and conservation-area datasets
 *     submitted by local planning authorities.
 *
 * Fallback: when a council has not submitted data to the national platform,
 * we return the council's own TPO search portal URL so the customer can
 * check directly. The lookup table covers all councils in Tree Monkey's
 * service area (Hertfordshire, Buckinghamshire, Bedfordshire).
 */

const PLANNING_API = 'https://www.planning.data.gov.uk/entity.json';
const TIMEOUT_MS   = 8000;

// ─── Council TPO portal lookup table ─────────────────────────────────────────
// Keys are matched case-insensitively against the admin_district from postcodes.io.
// URLs link to each council's own TPO/planning constraint search tool.

const COUNCIL_TPO_PORTALS = {
  // Hertfordshire
  'dacorum':              { url: 'https://www.dacorum.gov.uk/home/environment-street-care/trees/tree-preservation-orders', label: 'Dacorum Borough Council' },
  'three rivers':         { url: 'https://www.threerivers.gov.uk/egcl-page/tree-preservation-orders', label: 'Three Rivers District Council' },
  'watford':              { url: 'https://www.watford.gov.uk/info/20051/planning/325/planning_applications_and_decisions/5', label: 'Watford Borough Council' },
  'st albans':            { url: 'https://www.stalbans.gov.uk/trees-and-hedges', label: 'St Albans City and District Council' },
  'welwyn hatfield':      { url: 'https://www.welhat.gov.uk/article/1065/Tree-Preservation-Orders', label: 'Welwyn Hatfield Borough Council' },
  'hertsmere':            { url: 'https://www.hertsmere.gov.uk/Planning--Building-Control/Planning-and-Building-Control/Trees-and-hedgerows.aspx', label: 'Hertsmere Borough Council' },
  'east hertfordshire':   { url: 'https://www.eastherts.gov.uk/planning-and-building/planning-applications/trees', label: 'East Hertfordshire District Council' },
  'north hertfordshire':  { url: 'https://www.north-herts.gov.uk/home/planning-and-building-control/trees-and-hedges', label: 'North Hertfordshire District Council' },
  'stevenage':            { url: 'https://www.stevenage.gov.uk/planning/trees', label: 'Stevenage Borough Council' },
  'broxbourne':           { url: 'https://www.broxbourne.gov.uk/planning/trees', label: 'Broxbourne Borough Council' },
  // Buckinghamshire (merged into Buckinghamshire Council in 2020)
  'buckinghamshire':      { url: 'https://www.buckinghamshire.gov.uk/planning-and-building-control/trees-and-hedges/tree-preservation-orders/', label: 'Buckinghamshire Council' },
  'chiltern':             { url: 'https://www.buckinghamshire.gov.uk/planning-and-building-control/trees-and-hedges/tree-preservation-orders/', label: 'Buckinghamshire Council (formerly Chiltern)' },
  'south bucks':          { url: 'https://www.buckinghamshire.gov.uk/planning-and-building-control/trees-and-hedges/tree-preservation-orders/', label: 'Buckinghamshire Council (formerly South Bucks)' },
  'wycombe':              { url: 'https://www.buckinghamshire.gov.uk/planning-and-building-control/trees-and-hedges/tree-preservation-orders/', label: 'Buckinghamshire Council (formerly Wycombe)' },
  'aylesbury vale':       { url: 'https://www.buckinghamshire.gov.uk/planning-and-building-control/trees-and-hedges/tree-preservation-orders/', label: 'Buckinghamshire Council (formerly Aylesbury Vale)' },
  // Bedfordshire
  'central bedfordshire': { url: 'https://www.centralbedfordshire.gov.uk/info/44/planning/110/planning_applications_and_search', label: 'Central Bedfordshire Council' },
  'bedford':              { url: 'https://www.bedford.gov.uk/planning-buildings-land/trees/', label: 'Bedford Borough Council' },
  'luton':                { url: 'https://luton.gov.uk/planning_and_building/pages/planning-applications.aspx', label: 'Luton Borough Council' },
  // Fallback for any council not in the table
  '__default__':          { url: 'https://www.planning.data.gov.uk/map/?dataset=tree-preservation-order', label: 'National Planning Data (map view)' },
};

// ─── Postcode → coordinates ───────────────────────────────────────────────────

async function postcodeToCoords(postcode) {
  const clean = postcode.replace(/\s+/g, '').toUpperCase();

  let res = await fetch(
    `https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`,
    { signal: AbortSignal.timeout(5000) }
  );
  let json = await res.json();

  // Handle terminated postcodes — coordinates are still known, district is not
  if ((json.status === 404 || !json.result) && json.terminated) {
    const { latitude, longitude } = json.terminated;
    const nearby = await fetch(
      `https://api.postcodes.io/postcodes?lon=${longitude}&lat=${latitude}&limit=1`,
      { signal: AbortSignal.timeout(5000) }
    );
    const nearbyJson = await nearby.json();
    const nr = nearbyJson.result?.[0];
    return {
      lat:      latitude,
      lng:      longitude,
      district: nr?.admin_district || 'your local council',
      ward:     nr?.admin_ward     || null,
      county:   nr?.admin_county   || null,
    };
  }

  if (!res.ok || json.status !== 200 || !json.result) {
    throw new Error(`Postcode not recognised: ${postcode}`);
  }

  return {
    lat:      json.result.latitude,
    lng:      json.result.longitude,
    district: json.result.admin_district  || 'your local council',
    ward:     json.result.admin_ward      || null,
    county:   json.result.admin_county    || null,
  };
}

// ─── Bounding box ─────────────────────────────────────────────────────────────
// Builds a WKT polygon ~radiusMetres around a lat/lng centre.

function buildBoundingBox(lat, lng, radiusMetres = 200) {
  const dLat = radiusMetres / 111_320;
  const dLng = radiusMetres / (111_320 * Math.cos(lat * Math.PI / 180));
  const [s, n, w, e] = [lat - dLat, lat + dLat, lng - dLng, lng + dLng];
  return `POLYGON((${w} ${s},${e} ${s},${e} ${n},${w} ${n},${w} ${s}))`;
}

// ─── Planning Data query ──────────────────────────────────────────────────────

async function queryPlanningData(dataset, geometry) {
  const params = new URLSearchParams({
    dataset,
    geometry,
    geometry_relation: 'intersects',
    limit: '25',
    fields: 'entity,name,reference,start-date,end-date,organisation-entity',
  });

  const res = await fetch(`${PLANNING_API}?${params}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) throw new Error(`Planning Data API error ${res.status} for ${dataset}`);
  const json = await res.json();

  // Filter out revoked entries (they carry an end-date)
  return (json.entities || []).filter(e => !e['end-date']);
}

// ─── Result formatter ─────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ─── Council portal lookup ────────────────────────────────────────────────────

function getCouncilPortal(district) {
  const key = (district || '').toLowerCase().trim();
  return COUNCIL_TPO_PORTALS[key] || COUNCIL_TPO_PORTALS['__default__'];
}

// ─── No-coverage fallback formatter ──────────────────────────────────────────

function formatFallback({ postcode, district, ward, county }) {
  const portal = getCouncilPortal(district);
  const lines = [];

  lines.push(`TPO & CONSERVATION AREA CHECK`);
  lines.push(`Postcode: ${postcode.toUpperCase()}`);
  lines.push(`Local authority: ${portal.label}${county && county !== district ? `, ${county}` : ''}`);
  if (ward) lines.push(`Ward: ${ward}`);
  lines.push('');
  lines.push('NATIONAL DATASET: No data submitted by this council yet');
  lines.push('');
  lines.push(`${portal.label} manages its own TPO register.`);
  lines.push(`To check whether your tree has a Preservation Order, visit:`);
  lines.push('');
  lines.push(`  ${portal.url}`);
  lines.push('');
  lines.push('What to look for:');
  lines.push('  • Search by postcode or address for TPOs in your area');
  lines.push('  • Look for "conservation area" designations on the map');
  lines.push('  • Download or view the TPO schedule if one exists');
  lines.push('');
  lines.push('─────────────────────────────────────────────────────');
  lines.push(`Tree Monkey Tree Care can carry out this council check`);
  lines.push(`on your behalf and advise on the result. Call us on`);
  lines.push(`01442 733249 or email info@tree-monkey.co.uk.`);
  lines.push('');
  lines.push(`Important: Never carry out work on a tree without confirming`);
  lines.push(`its TPO status. Unauthorised work on a protected tree can`);
  lines.push(`result in an unlimited fine.`);

  return lines.join('\n');
}

// ─── Result formatter (national data found) ───────────────────────────────────

function formatResult({ postcode, district, ward, county, tpos, conservationAreas }) {
  const lines = [];

  lines.push(`TPO & CONSERVATION AREA CHECK`);
  lines.push(`Postcode: ${postcode.toUpperCase()}`);
  lines.push(`Local authority: ${district}${county && county !== district ? `, ${county}` : ''}`);
  if (ward) lines.push(`Ward: ${ward}`);
  lines.push('');

  // ── Conservation area ──────────────────────────────────────────────────────
  if (conservationAreas.length > 0) {
    lines.push('CONSERVATION AREA: YES');
    conservationAreas.slice(0, 3).forEach(ca => {
      const name = ca.name || ca.reference || 'Unnamed conservation area';
      const date = formatDate(ca['start-date']);
      lines.push(`  • ${name}${date ? ` (designated ${date})` : ''}`);
    });
    lines.push('');
    lines.push('  Legal requirement: Written notice to the local planning authority');
    lines.push('  is required at least 6 weeks before any tree work in a conservation');
    lines.push('  area. Tree Monkey Tree Care can manage this process for you.');
  } else {
    lines.push('CONSERVATION AREA: None detected at this postcode');
  }

  lines.push('');

  // ── TPOs ───────────────────────────────────────────────────────────────────
  if (tpos.length > 0) {
    lines.push(`TREE PRESERVATION ORDERS: ${tpos.length} order${tpos.length > 1 ? 's' : ''} found within 200m`);
    tpos.slice(0, 6).forEach((tpo, i) => {
      const ref  = tpo.reference || tpo.name || `Order ref: ${tpo.entity}`;
      const date = formatDate(tpo['start-date']);
      lines.push(`  ${i + 1}. ${ref}${date ? ` — designated ${date}` : ''}`);
    });
    if (tpos.length > 6) lines.push(`  ...and ${tpos.length - 6} further order(s) in this area`);
    lines.push('');
    lines.push('  Legal requirement: Written consent from the local planning authority');
    lines.push('  is required before any work on a TPO-protected tree. Unauthorised');
    lines.push('  work can result in an unlimited fine. Tree Monkey Tree Care can');
    lines.push('  submit the application and advise on permitted work.');
  } else {
    lines.push('TREE PRESERVATION ORDERS: None found within 200m of this postcode');
  }

  lines.push('');
  lines.push('─────────────────────────────────────────────────────');
  lines.push('Data: planning.data.gov.uk (UK Government, Crown Copyright)');
  lines.push(`Important: Coverage is not yet complete for all councils.`);
  lines.push(`A negative result does not guarantee the absence of a TPO.`);
  lines.push(`Always confirm with ${district} planning department before`);
  lines.push(`any work begins. Tree Monkey Tree Care can carry out this check.`);

  return lines.join('\n');
}

// ─── Public function ──────────────────────────────────────────────────────────

export async function checkTPOStatus(postcode) {
  const { lat, lng, district, ward, county } = await postcodeToCoords(postcode);
  const geometry = buildBoundingBox(lat, lng, 200);

  const [tpos, conservationAreas] = await Promise.all([
    queryPlanningData('tree-preservation-order', geometry),
    queryPlanningData('conservation-area', geometry),
  ]);

  // When the national dataset has no data at all for this location, fall back
  // to the council's own TPO portal so the customer can check directly.
  const noNationalData = tpos.length === 0 && conservationAreas.length === 0;
  const portal = getCouncilPortal(district);

  const summary = noNationalData
    ? formatFallback({ postcode, district, ward, county })
    : formatResult({ postcode, district, ward, county, tpos, conservationAreas });

  return {
    summary,
    hasTPO: tpos.length > 0,
    inConservationArea: conservationAreas.length > 0,
    tpoCount: tpos.length,
    district,
    noNationalData,
    councilPortal: portal.url,
    councilName: portal.label,
  };
}
