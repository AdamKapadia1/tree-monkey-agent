/**
 * Tool 02 — AI booking & quote form
 * Collects booking details conversationally, validates, writes to DB,
 * sends confirmation email to customer and alert to ops.
 */

import { runAgent } from '../lib/claude.js';
import { createBooking, upsertSession, getSession } from '../lib/supabase.js';
import { sendBookingConfirmation, sendOpsAlert } from '../lib/email.js';
import { randomUUID } from 'crypto';

export const BOOKING_TOOLS = [
  {
    name: 'validate_booking_details',
    description: 'Validate all collected booking fields before saving',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
        postcode: { type: 'string' },
        skipSize: { type: 'string', description: 'e.g. "6yd"' },
        deliveryDate: { type: 'string', description: 'ISO date YYYY-MM-DD' },
        onRoad: { type: 'boolean' },
        wasteDescription: { type: 'string' },
      },
      required: ['name', 'phone', 'email', 'postcode', 'skipSize', 'deliveryDate'],
    },
  },
  {
    name: 'confirm_booking',
    description: 'Save a validated booking to the database and send confirmation emails',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
        postcode: { type: 'string' },
        skipSize: { type: 'string' },
        deliveryDate: { type: 'string' },
        onRoad: { type: 'boolean' },
        wasteDescription: { type: 'string' },
        source: { type: 'string', enum: ['web', 'whatsapp', 'phone'] },
      },
      required: ['name', 'phone', 'email', 'postcode', 'skipSize', 'deliveryDate'],
    },
  },
  {
    name: 'calculate_quote',
    description: 'Calculate the total price for a skip hire including VAT',
    input_schema: {
      type: 'object',
      properties: {
        skipSize: { type: 'string', description: 'e.g. "6yd"' },
        permitRequired: { type: 'boolean' },
      },
      required: ['skipSize'],
    },
  },
];

const PRICES = { '2yd': 120, '4yd': 160, '6yd': 195, '8yd': 240, '10yd': 299, '12yd': 339, '14yd': 399, '16yd': 420, '20yd': 499, '40yd': 599 };

export async function bookingToolHandler(toolName, input) {
  if (toolName === 'calculate_quote') {
    const base = PRICES[input.skipSize];
    if (!base) return `Unknown skip size: ${input.skipSize}`;
    const permitEstimate = input.permitRequired ? 45 : 0;
    const subtotal = base + permitEstimate;
    const vat = subtotal * 0.2;
    const total = subtotal + vat;
    return JSON.stringify({
      skipSize: input.skipSize,
      basePrice: base,
      permitEstimate: permitEstimate,
      subtotal,
      vat: vat.toFixed(2),
      totalIncVat: total.toFixed(2),
      currency: 'GBP',
    });
  }

  if (toolName === 'validate_booking_details') {
    const errors = [];
    if (!input.name?.trim()) errors.push('Customer name is required');
    if (!input.phone?.match(/^[\d\s+()-]{10,}$/)) errors.push('Valid UK phone number required');
    if (!input.email?.includes('@')) errors.push('Valid email address required');
    if (!input.postcode?.trim()) errors.push('Postcode is required');
    if (!PRICES[input.skipSize]) errors.push(`Invalid skip size: ${input.skipSize}. Choose from 2yd–18yd`);
    if (!input.deliveryDate?.match(/^\d{4}-\d{2}-\d{2}$/)) errors.push('Delivery date must be in YYYY-MM-DD format');

    const date = new Date(input.deliveryDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) errors.push('Delivery date cannot be in the past');

    return errors.length === 0
      ? 'Validation passed. All booking details are valid.'
      : `Validation failed: ${errors.join('; ')}`;
  }

  if (toolName === 'confirm_booking') {
    try {
      const booking = await createBooking(input);

      // Send confirmation email to customer
      await sendBookingConfirmation(booking);

      // Alert ops team
      await sendOpsAlert({
        subject: `New booking #${booking.id} — ${input.skipSize} skip to ${input.postcode}`,
        body: `
Name: ${input.name}
Phone: ${input.phone}
Email: ${input.email}
Postcode: ${input.postcode}
Skip size: ${input.skipSize}
Delivery date: ${input.deliveryDate}
On road: ${input.onRoad ? 'YES — permit required' : 'No (driveway)'}
Waste: ${input.wasteDescription || 'Not specified'}
Source: ${input.source || 'web'}
        `.trim(),
      });

      return JSON.stringify({
        success: true,
        bookingId: booking.id,
        message: `Booking confirmed! Reference #${booking.id}. Confirmation sent to ${input.email}.`,
      });
    } catch (err) {
      return JSON.stringify({ success: false, error: err.message });
    }
  }

  return 'Unknown tool';
}

/**
 * Handle a booking conversation turn.
 */
export async function handleBookingMessage(message, sessionId = null, source = 'web') {
  const sid = sessionId || randomUUID();
  const session = await getSession(sid);
  const history = session?.messages || [];

  const BOOKING_SYSTEM = `You are the RL Skip Hire High Wycombe booking assistant. Your job is to collect all required booking details from the customer in a friendly, conversational way, then confirm the booking using the available tools.

Required fields to collect (in order):
1. Full name
2. Phone number
3. Email address
4. Delivery postcode
5. Skip size needed (guide them if unsure — ask what they're clearing)
6. Preferred delivery date
7. Is the skip going on the road or driveway? (affects permit)
8. Brief description of waste

Once you have all details: use calculate_quote to show the price, use validate_booking_details to check, then use confirm_booking to finalise.

Note: soils and rubble are not suitable for standard skips — if the customer mentions these, advise them to call 01494 853085 before proceeding.

Keep each message short. Ask one or two questions at a time. Be warm and efficient.`;

  const messages = [...history, { role: 'user', content: message }];

  const { text, messages: updated } = await runAgent(
    messages,
    BOOKING_TOOLS,
    bookingToolHandler,
    { maxTokens: 400 }
  );

  await upsertSession(sid, updated, { source, flow: 'booking' });

  return { reply: text, sessionId: sid };
}
