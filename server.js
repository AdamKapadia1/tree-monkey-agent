/**
 * Tree Monkey Tree Care — Express server
 */

import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { handleChatMessage } from './tools/chatbot.js';
import { processNewReviews, getPendingReplyQueue, approveReply } from './tools/reviews.js';
import { sendOpsAlert } from './lib/email.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// ─── CORS ─────────────────────────────────────────────────────────────────────
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

// ─── Chatbot ──────────────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId, imageBase64, imageMediaType } = req.body;
    if (!message && !imageBase64) return res.status(400).json({ error: 'message or image is required' });
    const imageData = imageBase64 ? { base64: imageBase64, mediaType: imageMediaType || 'image/jpeg' } : null;
    const result = await handleChatMessage(message || 'Please analyse this tree photo.', sessionId || null, imageData);
    res.json(result);
  } catch (err) {
    console.error('[/api/chat]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Reviews ──────────────────────────────────────────────────────────────────
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

// ─── Demo page ────────────────────────────────────────────────────────────────
app.get('/demo', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'demo.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Tree Monkey Tree Care Agent running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
});

// ─── Global error alerting ────────────────────────────────────────────────────
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

process.on('uncaughtException', (err) => alertCriticalError('uncaughtException', err));
process.on('unhandledRejection', (reason) => alertCriticalError('unhandledRejection', reason));
