/**
 * Live TPO and Conservation Area lookup
 *
 * Data sources:
 *   - postcodes.io     — free, no key, converts postcode to coordinates
 *   - planning.data.gov.uk — UK Government Planning Data platform
 *     Covers tree-preservation-order and conservation-area datasets
 *     submitted by local planning authorities.
 *
 * Coverage note: not all councils have submitted data. A negative result
 * should always be verified with the local planning authority.
 */

const PLANNING_API = 'https://www.planning.data.gov.uk/entity.json';
const TIMEOUT_MS   = 8000;

// ─── Postcode → coordinates ───────────────────────────────────────────────────

async function postcodeToCoords(postcode) {
  const clean = postcode.replace(/\s+/g, '').toUpperCase();
  const res = await fetch(
    `https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`,
    { signal: AbortSignal.timeout(5000) }
  );
  if (!res.ok) throw new Error(`Postcode not recognised: ${postcode}`);
  const json = await res.json();
  if (json.status !== 200 || !json.result) throw new Error(`Postcode not found: ${postcode}`);
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

  return {
    summary: formatResult({ postcode, district, ward, county, tpos, conservationAreas }),
    hasTPO: tpos.length > 0,
    inConservationArea: conservationAreas.length > 0,
    tpoCount: tpos.length,
    district,
  };
}
