/**
 * Tool 01 — Tree Surgery Chatbot
 * Handles customer queries for Tree Monkey Tree Care Ltd.
 * Supports photo analysis, species ID, condition assessment, TPO checks, booking.
 */

import { runAgent } from '../lib/claude.js';
import { createEnquiry, upsertSession, getSession } from '../lib/supabase.js';
import { sendBookingConfirmation, sendOpsAlert } from '../lib/email.js';
import { randomUUID } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';

let _anthropic = null;
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

const SERVICE_AREAS = [
  'tring', 'hemel hempstead', 'watford', 'berkhamsted', 'st albans',
  'harpenden', 'redbourn', 'kings langley', 'chesham', 'amersham',
  'aylesbury', 'leighton buzzard', 'luton', 'dunstable', 'hitchin',
  'letchworth', 'stevenage', 'baldock', 'royston',
  'hp1', 'hp2', 'hp3', 'hp4', 'hp5', 'hp6', 'hp7', 'hp22', 'hp23',
  'wd1', 'wd2', 'wd3', 'wd4', 'wd5', 'wd6', 'wd7', 'wd17', 'wd18', 'wd19', 'wd23', 'wd24', 'wd25',
  'al1', 'al2', 'al3', 'al4', 'al5', 'al6', 'al7', 'al8', 'al9', 'al10',
  'lu1', 'lu2', 'lu3', 'lu4', 'lu5', 'lu6', 'lu7',
  'sg1', 'sg2', 'sg3', 'sg4', 'sg5', 'sg6', 'sg7',
  'mk40', 'mk41', 'mk42', 'mk43', 'mk44', 'mk45',
];

const PRICING_GUIDE = {
  'stump grinding': { low: 75, high: 300, note: 'per stump, depending on diameter' },
  'crown reduction small': { low: 200, high: 450, note: 'tree up to 5m' },
  'crown reduction medium': { low: 400, high: 750, note: 'tree 5-10m' },
  'crown reduction large': { low: 650, high: 1400, note: 'tree over 10m' },
  'crown lifting': { low: 150, high: 500, note: 'depending on size and access' },
  'crown thinning': { low: 200, high: 600, note: 'depending on size' },
  'deadwooding': { low: 150, high: 500, note: 'depending on size and volume' },
  'tree felling small': { low: 150, high: 400, note: 'tree up to 5m' },
  'tree felling medium': { low: 350, high: 800, note: 'tree 5-10m' },
  'tree felling large': { low: 700, high: 2000, note: 'tree over 10m, may be more for very large specimens' },
  'hedge trimming': { low: 150, high: 500, note: 'depending on length, height and species' },
  'pollarding': { low: 250, high: 800, note: 'depending on size' },
  'ash dieback': { low: 300, high: 1200, note: 'depending on extent and tree size' },
  'emergency': { low: 500, high: 2500, note: 'emergency callout, highly variable' },
};

const CHATBOT_TOOLS = [
  {
    name: 'analyse_tree_photo',
    description: 'Analyse a tree photo from a URL — fetch, identify species, estimate age/height, assess condition, recommend work. Only use this when the customer provides a URL. If a photo was uploaded directly, analyse it using your vision — do not call this tool.',
    input_schema: {
      type: 'object',
      properties: {
        imageUrl: { type: 'string', description: 'URL of the tree photo' },
        customerNotes: { type: 'string', description: 'Any notes the customer provided about the tree' },
      },
      required: ['imageUrl'],
    },
  },
  {
    name: 'estimate_work_cost',
    description: 'Provide a ballpark cost estimate for tree surgery work. Always present as a rough guide subject to site visit confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        workType: { type: 'string', description: 'Type of work e.g. crown reduction, tree felling, stump grinding' },
        treeHeight: { type: 'string', description: 'Approximate tree height: small (<5m), medium (5-10m), large (>10m)' },
        additionalContext: { type: 'string', description: 'Any other relevant details affecting price' },
      },
      required: ['workType'],
    },
  },
  {
    name: 'check_postcode_coverage',
    description: 'Check whether Tree Monkey Tree Care covers a given postcode',
    input_schema: {
      type: 'object',
      properties: { postcode: { type: 'string' } },
      required: ['postcode'],
    },
  },
  {
    name: 'check_tpo_risk',
    description: 'Assess TPO (Tree Preservation Order) risk based on tree description and location',
    input_schema: {
      type: 'object',
      properties: {
        treeDescription: { type: 'string' },
        postcode: { type: 'string' },
        isConservationArea: { type: 'boolean' },
      },
      required: ['treeDescription'],
    },
  },
  {
    name: 'confirm_booking',
    description: 'Save a confirmed site visit booking and send confirmation emails. Only call once all details are collected and customer has confirmed.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
        postcode: { type: 'string' },
        workRequired: { type: 'string' },
        treeSpecies: { type: 'string' },
        treeHeight: { type: 'string' },
        accessDetails: { type: 'string' },
        tpoRisk: { type: 'boolean' },
        preferredDate: { type: 'string' },
        isEmergency: { type: 'boolean' },
        photoAnalysis: { type: 'string' },
      },
      required: ['name', 'phone', 'email', 'postcode', 'workRequired'],
    },
  },
  {
    name: 'escalate_emergency',
    description: 'Escalate an emergency tree situation — fallen tree, dangerous lean, storm damage over road or building',
    input_schema: {
      type: 'object',
      properties: {
        situation: { type: 'string' },
        customerName: { type: 'string' },
        customerPhone: { type: 'string' },
        postcode: { type: 'string' },
      },
      required: ['situation'],
    },
  },
];

async function analyseTreePhoto(imageUrl, customerNotes = '') {
  const client = getAnthropic();
  let imageData;
  try {
    const res = await fetch(imageUrl);
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    imageData = { type: 'base64', media_type: contentType, data: base64 };
  } catch {
    return { error: 'Could not load the image. Please check the URL is accessible.' };
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: imageData },
        {
          type: 'text',
          text: `You are an expert arborist with 20+ years experience in UK trees. Analyse this photo and provide:

1. SPECIES: Identify the tree species (state confidence level)
2. ESTIMATED HEIGHT: Approximate height in metres
3. ESTIMATED AGE: Approximate age range
4. CONDITION: Overall health (good/fair/poor/critical)
5. VISIBLE ISSUES: Diseases, structural problems, dead wood, fungal growth, storm damage
6. TPO RISK: Whether this tree is likely protected (Oak, Ash, Beech, Yew, mature trees commonly are)
7. RECOMMENDED WORK: What tree surgery work appears to be needed
8. URGENCY: Routine / Soon (3 months) / Urgent (1 month) / Emergency

Customer notes: ${customerNotes || 'None provided'}

Be precise and professional. If you cannot clearly identify something, state that clearly. This assessment will be used by qualified arborists to prepare a quote.`,
        },
      ],
    }],
  });

  return { analysis: response.content.find(b => b.type === 'text')?.text || 'Analysis unavailable' };
}

async function chatbotToolHandler(toolName, input) {
  if (toolName === 'analyse_tree_photo') {
    const result = await analyseTreePhoto(input.imageUrl, input.customerNotes);
    if (result.error) return result.error;
    return result.analysis;
  }

  if (toolName === 'estimate_work_cost') {
    const work = input.workType.toLowerCase();
    const height = (input.treeHeight || '').toLowerCase();

    // Find best matching price band
    let key = null;
    if (work.includes('stump')) key = 'stump grinding';
    else if (work.includes('poll')) key = 'pollarding';
    else if (work.includes('dead')) key = 'deadwooding';
    else if (work.includes('ash dieback') || work.includes('dieback')) key = 'ash dieback';
    else if (work.includes('emerg')) key = 'emergency';
    else if (work.includes('hedge')) key = 'hedge trimming';
    else if (work.includes('lift')) key = 'crown lifting';
    else if (work.includes('thin')) key = 'crown thinning';
    else if (work.includes('reduc') || work.includes('crown')) {
      key = height.includes('large') || height.includes('>10') || height.includes('10m') ? 'crown reduction large'
          : height.includes('medium') || height.includes('5-10') ? 'crown reduction medium'
          : 'crown reduction small';
    } else if (work.includes('fell') || work.includes('remov')) {
      key = height.includes('large') || height.includes('>10') || height.includes('10m') ? 'tree felling large'
          : height.includes('medium') || height.includes('5-10') ? 'tree felling medium'
          : 'tree felling small';
    }

    if (!key) {
      return 'Tree surgery costs vary widely depending on species, size, access, and complexity. A free site visit is the best way to get an accurate figure — all quotes are no-obligation.';
    }

    const band = PRICING_GUIDE[key];
    return `Ballpark estimate for ${input.workType}: **£${band.low}–£${band.high}** (${band.note}). This is a rough guide only — the exact price depends on species, access, proximity to structures, and waste disposal. Your free site visit will confirm the actual cost with a written quote. All prices exclude VAT.${input.additionalContext ? ` Note: ${input.additionalContext}` : ''}`;
  }

  if (toolName === 'check_postcode_coverage') {
    const pc = input.postcode.toLowerCase().replace(/\s/g, '');
    const covered = SERVICE_AREAS.some(t => pc.startsWith(t.replace(/\s/g, '')) || pc.includes(t.replace(/\s/g, '')));
    return covered
      ? `Yes, Tree Monkey Tree Care covers the ${input.postcode} area across Hertfordshire, Buckinghamshire and Bedfordshire.`
      : `We may not directly cover ${input.postcode} - please call 01442 733249 to confirm.`;
  }

  if (toolName === 'check_tpo_risk') {
    const highRiskSpecies = ['oak', 'ash', 'beech', 'lime', 'yew', 'elm', 'cedar', 'plane'];
    const desc = input.treeDescription.toLowerCase();
    const isHighRisk = highRiskSpecies.some(s => desc.includes(s));
    if (input.isConservationArea) {
      return 'This tree is in a conservation area. A minimum of 6 weeks notice must be given to the local council before any work. Tree Monkey Tree Care can guide you through this process.';
    }
    if (isHighRisk) {
      return 'This species is commonly subject to Tree Preservation Orders (TPOs). We recommend checking with your local council before proceeding. Tree Monkey Tree Care can assist with TPO applications.';
    }
    return 'No immediate TPO concerns identified, but we recommend confirming with your local council for any mature or prominent trees before work begins.';
  }

  if (toolName === 'confirm_booking') {
    try {
      const enquiry = await createEnquiry({
        name: input.name,
        phone: input.phone,
        email: input.email,
        postcode: input.postcode,
        workRequired: input.workRequired,
        treeSpecies: input.treeSpecies,
        treeHeight: input.treeHeight,
        accessDetails: input.accessDetails,
        tpoRisk: input.tpoRisk,
        isEmergency: input.isEmergency,
        photoAnalysis: input.photoAnalysis,
        preferredDate: input.preferredDate,
        source: 'web',
      });

      const urgencyFlag = input.isEmergency ? 'EMERGENCY - ' : '';
      const tpoFlag = input.tpoRisk ? '\nTPO RISK FLAGGED - confirm council consent before proceeding.\n' : '';

      await sendOpsAlert({
        subject: `${urgencyFlag}New tree surgery enquiry #${enquiry.id} - ${input.postcode}`,
        body: `${tpoFlag}Name: ${input.name}\nPhone: ${input.phone}\nEmail: ${input.email}\nPostcode: ${input.postcode}\nWork required: ${input.workRequired}\nSpecies: ${input.treeSpecies || 'Unknown'}\nHeight: ${input.treeHeight || 'Unknown'}\nAccess: ${input.accessDetails || 'Not specified'}\nPreferred date: ${input.preferredDate || 'Flexible'}\nPhoto analysis: ${input.photoAnalysis || 'No photo provided'}\nSource: Tree Monkey chatbot`,
      });

      await sendBookingConfirmation({
        id: enquiry.id,
        customer_name: input.name,
        email: input.email,
        work_required: input.workRequired,
        preferred_date: input.preferredDate || null,
        postcode: input.postcode,
        tpo_risk: input.tpoRisk || false,
      });

      return JSON.stringify({
        success: true,
        enquiryId: enquiry.id,
        message: `Enquiry confirmed. Reference #${enquiry.id}. Confirmation sent to ${input.email}. The Tree Monkey Tree Care team will be in touch to arrange your free site visit.`,
      });
    } catch (err) {
      return JSON.stringify({ success: false, error: err.message });
    }
  }

  if (toolName === 'escalate_emergency') {
    try {
      await sendOpsAlert({
        subject: `🚨 EMERGENCY TREE SITUATION - ${input.postcode || 'Unknown location'}`,
        body: `EMERGENCY ESCALATION\n\nSituation: ${input.situation}\nCustomer: ${input.customerName || 'Unknown'}\nPhone: ${input.customerPhone || 'Not provided'}\nPostcode: ${input.postcode || 'Not provided'}\n\nCustomer directed to call 07734 779 187 immediately.`,
      });
    } catch (err) {
      console.error('[Emergency escalation failed]', err);
    }
    return 'Emergency escalated to Tree Monkey Tree Care team.';
  }

  return 'Unknown tool';
}

export async function handleChatMessage(message, sessionId = null, imageData = null) {
  const sid = sessionId || randomUUID();
  const session = await getSession(sid);
  const history = session?.messages || [];

  const today = new Date();
  const todayStr = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const tomorrowStr = new Date(today.getTime() + 86400000).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const todayISO = today.toISOString().split('T')[0];

  // imageData = { base64, mediaType } from direct upload, or null
  let userContent;
  if (imageData?.base64) {
    userContent = [
      { type: 'image', source: { type: 'base64', media_type: imageData.mediaType || 'image/jpeg', data: imageData.base64 } },
      { type: 'text', text: message },
    ];
  } else {
    userContent = message;
  }

  const messages = [...history, { role: 'user', content: userContent }];

  const SYSTEM = `Today is ${todayStr} (${todayISO}). Tomorrow is ${tomorrowStr}. Always use these exact dates.

You are the professional AI assistant for Tree Monkey Tree Care Ltd - a NPTC qualified, family-run tree surgery company based in Tring, Hertfordshire, serving Hertfordshire, Buckinghamshire, and Bedfordshire.

YOUR ROLE:
- Answer questions about tree surgery services professionally and accurately
- Analyse tree photos — identify species, estimate age and height, assess condition, flag issues, recommend work
- Provide ballpark cost estimates using the estimate_work_cost tool
- Guide customers through booking a free site visit
- Flag TPO risks and conservation area obligations
- Escalate emergencies immediately to phone

PHOTO ANALYSIS — TWO SCENARIOS:
1. Photo uploaded directly (image appears in this message): Analyse it yourself using your vision. Identify species (with confidence), estimated height, estimated age, condition (good/fair/poor/critical), visible issues (disease, dead wood, fungal growth, structural problems), TPO risk, and recommended work with urgency. Then call estimate_work_cost for the recommended work. Present results clearly.
2. Customer provides a photo URL in text: Call the analyse_tree_photo tool.

PRICING:
- Always use estimate_work_cost tool when asked about cost or after analysing a photo
- Present estimates as rough ballpark guides, clearly stating the final price is confirmed at free site visit
- Never give a single fixed price — always give a range

TPO GUIDANCE:
- Oak, Ash, Beech, Yew, Lime, Elm, and mature/large trees commonly have TPOs
- Conservation area trees require 6 weeks notice to council before any work
- Direct customers to check planning.gov.uk or their local council portal to confirm TPO status
- Tree Monkey can assist with TPO applications

BOOKING FLOW - collect conversationally, one or two questions at a time:
1. Full name
2. Phone number
3. Email address
4. Property postcode
5. Description of work needed (or analyse their photo)
6. Tree species and approximate height (if known)
7. Access details - vehicle access, overhead lines nearby
8. TPO or conservation area concerns
9. Preferred date for free site visit

Once all details collected: summarise the enquiry, confirm with customer, then call confirm_booking.

IMPORTANT RULES:
- Quotes and site visits are always free with no obligation
- For emergencies (fallen tree, dangerous lean, storm damage) - call escalate_emergency and direct customer to call 07734 779 187 immediately
- Only use phone numbers: 01442 733249 and 07734 779 187
- British English throughout
- Professional, reassuring, and knowledgeable at all times`;

  const { text, messages: updatedMessages } = await runAgent(
    messages,
    CHATBOT_TOOLS,
    chatbotToolHandler,
    { maxTokens: 1024, systemOverride: SYSTEM }
  );

  await upsertSession(sid, updatedMessages, { source: 'web', lastActive: new Date().toISOString() });

  return { reply: text, sessionId: sid };
}
