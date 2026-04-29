/**
 * SMS confirmation via Twilio — Tree Monkey Tree Care Ltd
 */

import twilio from 'twilio';

let _client = null;
function getTwilio() {
  if (!_client) _client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return _client;
}

/**
 * Send an SMS confirmation to the customer's phone number.
 */
export async function sendSMSConfirmation({ name, phone, enquiryId, workRequired, preferredDate }) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.error('[SMS] Twilio credentials not set — skipping SMS');
    return;
  }
  if (!process.env.TWILIO_FROM_NUMBER) {
    console.error('[SMS] TWILIO_FROM_NUMBER not set — skipping SMS');
    return;
  }

  // Format UK mobile numbers — strip spaces, ensure +44 prefix
  const clean = phone.replace(/\s+/g, '').replace(/^0/, '+44');

  const dateStr = preferredDate
    ? new Date(preferredDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    : 'to be arranged';

  const body = [
    `Hi ${name.split(' ')[0]}, thanks for contacting Tree Monkey Tree Care.`,
    ``,
    `We've received your enquiry (#${enquiryId}) for: ${workRequired}.`,
    ``,
    `A qualified arborist will call you to arrange a free site visit${preferredDate ? ` around ${dateStr}` : ''}.`,
    ``,
    `Any questions? Call us on 01442 733249.`,
    `Tree Monkey Tree Care Ltd`,
  ].join('\n');

  console.log(`[SMS] Sending confirmation to ${clean}`);
  await getTwilio().messages.create({
    body,
    from: process.env.TWILIO_FROM_NUMBER,
    to: clean,
  });
}
