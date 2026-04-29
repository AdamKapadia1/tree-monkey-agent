/**
 * RL Skip Hire Agent — Express server
 * Mounts all eight module routes.
 */

import 'dotenv/config';
import express from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { handleChatMessage } from './tools/chatbot.js';
import { handleBookingMessage } from './tools/booking.js';
import { handleWhatsAppMessage, validateTwilioSignature } from './tools/whatsapp.js';
import { generateDailyDispatch } from './tools/dispatch.js';
import { checkPermitRequirement, generatePermitApplication } from './tools/permit.js';
import { processNewReviews, getPendingReplyQueue, approveReply } from './tools/reviews.js';
import { classifyWasteText, classifyWasteImage, formatClassificationReport } from './tools/waste_classifier.js';
import { startJobSheet, addPhoto, completeJobSheet, getDriverJobs } from './tools/job_sheet.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// ─── CORS (must be before all routes) ────────────────────────────────────────
const ALLOWED = [
  'https://www.tree-monkey.co.uk',
  'https://tree-monkey.co.uk',
  'https://tree-monkey-production.up.railway.app',
  'http://localhost:3000',
  ...(process.env.EXTRA_ORIGINS ? process.env.EXTRA_ORIGINS.split(',') : []),
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || ALLOWED.includes(origin)) {
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(join(__dirname, 'public')));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', agent: 'Tree Monkey Tree Care', version: '1.0.0' }));

// ─── Module 01: Chatbot ───────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });
    const result = await handleChatMessage(message, sessionId || null);
    res.json(result);
  } catch (err) {
    console.error('[/api/chat]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Module 02: Booking ───────────────────────────────────────────────────────
app.post('/api/booking', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });
    const result = await handleBookingMessage(message, sessionId || null, 'web');
    res.json(result);
  } catch (err) {
    console.error('[/api/booking]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Module 03: WhatsApp webhook ──────────────────────────────────────────────
app.post('/webhooks/whatsapp', async (req, res) => {
  // Twilio expects a 200 quickly — handle async
  res.status(200).send('<Response></Response>');
  await handleWhatsAppMessage(req.body).catch(err =>
    console.error('[WhatsApp webhook error]', err)
  );
});

// ─── Module 04: Dispatch ──────────────────────────────────────────────────────
app.post('/api/dispatch', async (req, res) => {
  try {
    const { date } = req.body;
    const targetDate = date || new Date().toISOString().split('T')[0];
    const result = await generateDailyDispatch(targetDate);
    res.json(result);
  } catch (err) {
    console.error('[/api/dispatch]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Module 05: Permits ───────────────────────────────────────────────────────
app.post('/api/permit/check', async (req, res) => {
  try {
    const result = await checkPermitRequirement(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/permit/apply', async (req, res) => {
  try {
    const result = await generatePermitApplication(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Module 06: Reviews ───────────────────────────────────────────────────────
app.post('/api/reviews/fetch', async (req, res) => {
  try {
    const summary = await processNewReviews();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reviews/pending', async (req, res) => {
  try {
    const reviews = await getPendingReplyQueue();
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reviews/:id/approve', async (req, res) => {
  try {
    const result = await approveReply(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Module 07: Waste classifier ─────────────────────────────────────────────
app.post('/api/waste/classify', async (req, res) => {
  try {
    const { description, imageUrl } = req.body;
    let result;
    if (imageUrl) {
      result = await classifyWasteImage(imageUrl);
    } else if (description) {
      result = await classifyWasteText(description);
    } else {
      return res.status(400).json({ error: 'Provide description or imageUrl' });
    }
    res.json({ ...result, report: formatClassificationReport(result) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Module 08: Job sheets ────────────────────────────────────────────────────
app.post('/api/jobs', async (req, res) => {
  try {
    const { bookingId, driverId } = req.body;
    const jobSheet = await startJobSheet(bookingId, driverId);
    res.json(jobSheet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/jobs/:id/photos', async (req, res) => {
  try {
    const { imageBase64, filename, contentType, photoType } = req.body;
    const buffer = Buffer.from(imageBase64, 'base64');
    const result = await addPhoto(req.params.id, buffer, filename, contentType, photoType);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/jobs/:id/complete', async (req, res) => {
  try {
    const { driverNotes } = req.body;
    const result = await completeJobSheet(req.params.id, driverNotes);
    res.json({ success: true, jobSheetId: result.jobSheet.id, pdfPath: result.pdfPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jobs/driver/:driverId', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const jobs = await getDriverJobs(req.params.driverId, date);
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Tree Monkey Tree Care Agent running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
});

// Demo page — shows widget embedded in a mock RL Skip Hire website
app.get('/demo', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'demo.html'));
});

// ─── Global error alerting ────────────────────────────────────────────────────
import { sendOpsAlert } from './lib/email.js';

async function alertCriticalError(type, err) {
  console.error(`[CRITICAL ${type}]`, err);
  try {
    await sendOpsAlert({
      subject: `CRITICAL ERROR - Tree Monkey Agent (${type})`,
      body: `A critical error occurred on the Tree Monkey Tree Care AI agent.\n\nError type: ${type}\nMessage: ${err?.message || err}\nStack: ${err?.stack || 'N/A'}\nTime: ${new Date().toISOString()}\n\nPlease check Railway logs immediately.`,
    });
  } catch (e) {
    console.error('[Alert email failed]', e);
  }
}

process.on('uncaughtException', (err) => {
  alertCriticalError('uncaughtException', err);
});

process.on('unhandledRejection', (reason) => {
  alertCriticalError('unhandledRejection', reason);
});
