/**
 * Tool 07 — Waste classification & compliance assistant
 * Analyses text descriptions or images of waste,
 * maps to EWC codes, flags hazardous items, gives skip/no-skip verdict.
 */

import { client, complete } from '../lib/claude.js';

const PROHIBITED = [
  'asbestos', 'fridge', 'freezer', 'food waste', 'clinical waste',
  'medical waste', 'tyre', 'battery', 'hazardous', 'toxic', 'gas cylinder',
  'aerosol', 'paint tin', 'solvent', 'bleach', 'chemical',
];

const EWC_MAP = {
  concrete: '17 01 01',
  brick: '17 01 02',
  tiles: '17 01 03',
  wood: '17 02 01',
  glass: '17 02 02',
  plastic: '17 02 03',
  steel: '17 04 05',
  iron: '17 04 05',
  metal: '17 04 05',
  'garden waste': '20 02 01',
  grass: '20 02 01',
  soil: '17 05 04',
  stone: '17 05 04',
  'household waste': '20 03 01',
  'mixed waste': '20 03 01',
  cardboard: '20 01 01',
  paper: '20 01 01',
};

/**
 * Classify waste from a text description.
 */
export async function classifyWasteText(description) {
  const lower = description.toLowerCase();

  // Quick prohibited check
  const flagged = PROHIBITED.filter(p => lower.includes(p));

  const prompt = `
A customer wants to put this in an RL Skip Hire skip:
"${description}"

You are a UK waste compliance expert. Respond with JSON only:
{
  "verdict": "safe" | "call_first" | "prohibited",
  "reason": "brief explanation (max 40 words)",
  "ewcCodes": ["code1", "code2"],
  "wasteTypes": ["type1", "type2"],
  "hazardousFlag": true | false,
  "customerMessage": "friendly message to send to the customer (max 60 words)"
}

PROHIBITED items: asbestos, fridges, freezers, food waste, clinical/medical waste, tyres, batteries, hazardous/toxic material, gas cylinders, electrical items with CFC gases.
PERMITTED: general household waste, garden waste, wood, metal, paper, cardboard, plastic, glass.
NOTE: soils and rubble are not suitable for standard skips — advise customer to call 01494 853085.
  `.trim();

  const raw = await complete(
    prompt,
    'You are a UK waste classification expert. Respond only with valid JSON. No markdown.'
  );

  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch {
    parsed = {
      verdict: flagged.length > 0 ? 'prohibited' : 'safe',
      reason: 'Classification unavailable — please call for advice.',
      ewcCodes: [],
      wasteTypes: [],
      hazardousFlag: flagged.length > 0,
      customerMessage: flagged.length > 0
        ? `Some items you mentioned (${flagged.join(', ')}) cannot go in our skips. Please call 01494 853085 for advice.`
        : 'Your waste sounds suitable for our skips. Book online or call 01494 853085.',
    };
  }

  return parsed;
}

/**
 * Classify waste from an image URL (WhatsApp photo, web upload).
 * Uses Claude's vision capability.
 */
export async function classifyWasteImage(imageUrl, sessionId = null) {
  try {
    // Fetch image and convert to base64
    const res = await fetch(imageUrl, {
      headers: { Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}` },
    });
    if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);

    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const contentType = res.headers.get('content-type') || 'image/jpeg';

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: contentType, data: base64 },
            },
            {
              type: 'text',
              text: `You are a UK waste compliance expert for RL Skip Hire High Wycombe.

Analyse this image of waste/items and respond with JSON only:
{
  "verdict": "safe" | "call_first" | "prohibited",
  "identifiedItems": ["list of items you can see"],
  "prohibitedItems": ["any prohibited items spotted"],
  "ewcCodes": ["relevant EWC codes"],
  "hazardousFlag": true | false,
  "confidence": "high" | "medium" | "low",
  "customerMessage": "friendly message to customer (max 70 words) in British English"
}

PROHIBITED: asbestos, fridges, freezers, food waste, clinical waste, tyres, batteries, hazardous chemicals, gas cylinders.
NOTE: soils and rubble are not suitable for standard skips.
If image is unclear, set confidence to "low" and ask customer to call 01494 853085.`,
            },
          ],
        },
      ],
    });

    const text = response.content.find(b => b.type === 'text')?.text || '';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    return { ...parsed, analysisType: 'image' };
  } catch (err) {
    console.error('[WasteClassifier] Image analysis error:', err.message);
    return {
      verdict: 'call_first',
      identifiedItems: [],
      prohibitedItems: [],
      ewcCodes: [],
      hazardousFlag: false,
      confidence: 'low',
      customerMessage: "I couldn't analyse that image clearly. Please call us on 01494 853085 and we'll advise what can go in the skip.",
      analysisType: 'image',
      error: err.message,
    };
  }
}

/**
 * Unified handler — auto-detects image vs text.
 */
export async function handleWasteImage(imageUrl, sessionId) {
  const result = await classifyWasteImage(imageUrl, sessionId);
  return { reply: result.customerMessage, result };
}

/**
 * Format a classification result as a human-readable report.
 */
export function formatClassificationReport(result) {
  const lines = [];
  const icon = { safe: '✓', call_first: '!', prohibited: '✗' }[result.verdict] || '?';

  lines.push(`Waste Assessment — RL Skip Hire High Wycombe`);
  lines.push(`Verdict: ${icon} ${result.verdict.replace('_', ' ').toUpperCase()}`);

  if (result.identifiedItems?.length) lines.push(`Items: ${result.identifiedItems.join(', ')}`);
  if (result.prohibitedItems?.length) lines.push(`Prohibited items found: ${result.prohibitedItems.join(', ')}`);
  if (result.ewcCodes?.length) lines.push(`EWC codes: ${result.ewcCodes.join(', ')}`);
  if (result.hazardousFlag) lines.push(`⚠ Hazardous waste flag raised`);
  lines.push(`\n${result.customerMessage}`);

  return lines.join('\n');
}
