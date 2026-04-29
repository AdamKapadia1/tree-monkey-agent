/**
 * Tool 05 — Permit application assistant
 * Determines council from postcode, checks permit requirements,
 * tracks permit status, and alerts on expiry.
 */

import { savePermitApplication } from '../lib/supabase.js';
import { complete } from '../lib/claude.js';
import { sendOpsAlert } from '../lib/email.js';

// Map postcode prefixes to council names and their permit portals
const COUNCIL_MAP = {
  HP: { council: 'Buckinghamshire Council', portal: 'https://www.buckinghamshire.gov.uk/parking-roads-and-transport/skips-and-scaffolding/', phone: '0300 131 6000' },
  SL7: { council: 'Buckinghamshire Council', portal: 'https://www.buckinghamshire.gov.uk/parking-roads-and-transport/skips-and-scaffolding/', phone: '0300 131 6000' },
  SL9: { council: 'Buckinghamshire Council', portal: 'https://www.buckinghamshire.gov.uk/parking-roads-and-transport/skips-and-scaffolding/', phone: '0300 131 6000' },
};

/**
 * Look up council info from a UK postcode.
 */
function getCouncilInfo(postcode) {
  const upper = postcode.toUpperCase().replace(/\s/g, '');
  // Try 3-char prefix first, then 2-char
  const prefix3 = upper.slice(0, 3);
  const prefix2 = upper.slice(0, 2);
  return COUNCIL_MAP[prefix3] || COUNCIL_MAP[prefix2] || {
    council: 'Local council (unknown — check manually)',
    portal: null,
    phone: null,
  };
}

/**
 * Check whether a permit is required for a given booking.
 * Returns structured permit requirement info.
 */
export async function checkPermitRequirement(booking) {
  if (!booking.on_road) {
    return {
      required: false,
      reason: 'Skip is on private driveway or garden — no permit needed.',
      council: null,
    };
  }

  const info = getCouncilInfo(booking.postcode);

  return {
    required: true,
    council: info.council,
    councilPhone: info.phone,
    portalUrl: info.portal,
    maxDuration: 7,   // days on public highway
    noticeRequired: 1, // working days
    permitValidDays: 30,
    instructions: `RL Skip Hire will apply for the permit on your behalf. The ${info.council} requires at least 24 hours' notice. The permit covers up to 7 days on the highway.`,
  };
}

/**
 * Generate a permit application summary using Claude.
 * In production this would drive a Playwright form-fill.
 */
export async function generatePermitApplication(booking) {
  const info = getCouncilInfo(booking.postcode);

  const applicationData = {
    applicantName: 'RL Skip Hire High Wycombe',
    applicantPhone: '01494 853085',
    applicantEmail: process.env.FROM_EMAIL || 'info@rlskiphirehighwycombe.co.uk',
    siteAddress: `${booking.postcode}`,
    customerName: booking.customer_name,
    skipSize: booking.skip_size,
    proposedStartDate: booking.delivery_date,
    duration: 7,
    council: info.council,
    portalUrl: info.portal,
  };

  // Use Claude to draft the application description
  const description = await complete(
    `Write a concise highway skip permit application description for: a ${booking.skip_size} skip at ${booking.postcode}. Customer: ${booking.customer_name}. Duration: 7 days. Keep it under 100 words, factual, professional.`,
    'You write UK highway skip permit applications. Be concise and factual.'
  );

  applicationData.description = description;

  // Alert ops to complete the actual council portal submission
  await sendOpsAlert({
    subject: `Permit needed — Booking #${booking.id} at ${booking.postcode}`,
    body: `
A permit is required for booking #${booking.id}.

Council: ${info.council}
Portal: ${info.portal || 'Call council'}
Phone: ${info.phone || 'N/A'}
Customer: ${booking.customer_name}
Address: ${booking.postcode}
Skip size: ${booking.skip_size}
Delivery: ${booking.delivery_date}

Application description:
${description}

IMPORTANT: Submit via council portal at least 24 hours before delivery.
    `.trim(),
  });

  // Log to database
  const expiryDate = new Date(booking.delivery_date);
  expiryDate.setDate(expiryDate.getDate() + 30);

  await savePermitApplication({
    bookingId: booking.id,
    council: info.council,
    postcode: booking.postcode,
    streetAddress: booking.postcode,
    applicationRef: `RL-${booking.id}-PERMIT`,
    expiryDate: expiryDate.toISOString().split('T')[0],
  });

  return applicationData;
}

/**
 * Check all active permits and alert on ones expiring within 48 hours.
 * Run daily via cron.
 */
export async function checkPermitExpiries() {
  const { supabase } = await import('../lib/supabase.js');
  const in48h = new Date();
  in48h.setHours(in48h.getHours() + 48);

  const { data: expiring } = await supabase
    .from('permit_applications')
    .select('*, bookings(*)')
    .eq('status', 'submitted')
    .lte('expiry_date', in48h.toISOString().split('T')[0]);

  if (!expiring || expiring.length === 0) return;

  for (const permit of expiring) {
    await sendOpsAlert({
      subject: `PERMIT EXPIRY — ${permit.postcode} expires ${permit.expiry_date}`,
      body: `Permit for booking #${permit.booking_id} at ${permit.postcode} expires on ${permit.expiry_date}. Arrange collection or renewal immediately.`,
    });
  }

  console.log(`[Permits] Alerted on ${expiring.length} expiring permits`);
}
