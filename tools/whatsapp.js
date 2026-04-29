/**
 * Tool 03 — WhatsApp AI assistant
 * Receives Twilio WhatsApp webhooks, routes to chatbot or booking flow,
 * handles media (photos) and sends replies back via Twilio.
 */

import twilio from 'twilio';
import { handleChatMessage } from './chatbot.js';
import { handleBookingMessage } from './booking.js';
import { handleWasteImage } from './waste_classifier.js';
import { getSession, upsertSession } from '../lib/supabase.js';

let _twilioClient = null;
function getTwilio() {
  if (!_twilioClient) _twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return _twilioClient;
}

/**
 * Validate that inbound webhook is genuinely from Twilio.
 */
export function validateTwilioSignature(req) {
  const signature = req.headers['x-twilio-signature'];
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  return twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    signature,
    url,
    req.body
  );
}

/**
 * Send a WhatsApp message via Twilio.
 */
export async function sendWhatsApp(to, body) {
  return getTwilio().messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM,
    to: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
    body,
  });
}

/**
 * Determine which flow to use based on session state and message content.
 */
function detectIntent(message, sessionMeta) {
  const lower = message.toLowerCase();

  // Already in a booking flow
  if (sessionMeta?.flow === 'booking') return 'booking';

  // Booking intent keywords
  const bookingKeywords = ['book', 'hire', 'order', 'want a skip', 'need a skip', 'get a skip', 'quote'];
  if (bookingKeywords.some(k => lower.includes(k))) return 'booking';

  // Default to chatbot
  return 'chat';
}

/**
 * Main inbound WhatsApp message handler.
 * Called by Express route POST /webhooks/whatsapp
 */
export async function handleWhatsAppMessage(body) {
  const from = body.From;           // e.g. whatsapp:+447911123456
  const messageBody = body.Body?.trim() || '';
  const numMedia = parseInt(body.NumMedia || '0', 10);
  const mediaUrl = body.MediaUrl0;
  const mediaType = body.MediaContentType0;

  // Use phone number as session key (strip whatsapp: prefix)
  const sessionId = `wa_${from.replace('whatsapp:', '').replace('+', '')}`;
  const session = await getSession(sessionId);
  const meta = session?.metadata || {};

  let replyText = '';

  try {
    // Handle image/media messages
    if (numMedia > 0 && mediaUrl) {
      if (mediaType?.startsWith('image/')) {
        const result = await handleWasteImage(mediaUrl, sessionId);
        replyText = result.reply;
      } else {
        replyText = "Thanks for sending that file. For documents or queries, please call us on 01494 853085. For waste photos, please send a JPEG or PNG image.";
      }
    } else if (!messageBody) {
      replyText = "Hi! I'm the RL Skip Hire High Wycombe assistant. How can I help you today? You can ask about skip sizes, prices, or say 'book a skip' to get started.";
    } else {
      // Route to appropriate flow
      const intent = detectIntent(messageBody, meta);

      if (intent === 'booking') {
        const result = await handleBookingMessage(messageBody, sessionId, 'whatsapp');
        replyText = result.reply;
        // Update metadata to track we're in booking flow
        await upsertSession(sessionId, result.messages || [], { ...meta, flow: 'booking', source: 'whatsapp' });
      } else {
        const result = await handleChatMessage(messageBody, sessionId);
        replyText = result.reply;
      }
    }
  } catch (err) {
    console.error('[WhatsApp handler error]', err);
    replyText = "Sorry, I had a technical issue. Please call us directly on 01494 853085 and we'll be happy to help.";
  }

  // Send reply — split if over WhatsApp 1600 char limit
  const chunks = splitMessage(replyText, 1500);
  for (const chunk of chunks) {
    await sendWhatsApp(from, chunk);
  }

  return { success: true, chunks: chunks.length };
}

/**
 * Split long messages into chunks at sentence boundaries.
 */
function splitMessage(text, maxLength) {
  if (text.length <= maxLength) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf('. ', maxLength);
    if (splitAt === -1) splitAt = maxLength;
    chunks.push(remaining.slice(0, splitAt + 1).trim());
    remaining = remaining.slice(splitAt + 1).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
