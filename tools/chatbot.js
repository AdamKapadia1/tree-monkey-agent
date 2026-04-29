/**
 * Tool 01 — Tree Surgery Chatbot
 * Handles customer queries for Tree Monkey Tree Care Ltd.
 * Supports photo analysis, species ID, condition assessment, TPO checks, booking.
 */

import { runAgent } from '../lib/claude.js';
import { createEnquiry, upsertSession, getSession } from '../lib/supabase.js';
import { sendBookingConfirmation, sendOpsAlert } from '../lib/email.js';
import { checkTPOStatus } from '../lib/tpo.js';
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
    name: 'check_tpo_status',
    description: 'Live lookup of Tree Preservation Orders and conservation area status for a UK postcode using government planning data. Call this whenever the customer provides a postcode and asks about TPOs, conservation areas, or whether they need permission for tree work.',
    input_schema: {
      type: 'object',
      properties: {
        postcode: { type: 'string', description: 'UK postcode to check, e.g. HP23 5AB' },
      },
      required: ['postcode'],
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

const ARBORIST_ASSESSMENT_PROMPT = (notes = '') => `You are a senior consulting arborist and dendrologist with 30+ years experience in UK tree species. Produce a comprehensive arboricultural identification and condition assessment using the exact structure below. Where a feature is not determinable from the image, state "not visible in image" rather than guessing.

─── SECTION 1: SPECIES IDENTIFICATION ─────────────────────────────
Primary ID: [Common name] ([Latin binomial]) — [X]% confidence
Confirming features: [List the specific morphological features visible in this image that confirm the identification]
Alternatives considered: [Any lookalike species and the specific features that rule them out]

─── SECTION 2: MORPHOLOGICAL FEATURES ────────────────────────────
Bark: [Texture, colour, fissuring pattern, scaling or plating, any notable markings]
Crown form: [Overall shape — e.g. broadly spreading, columnar, weeping; branching pattern; crown density]
Trunk: [Estimated girth/DBH if determinable, form, buttressing, root flare]
Leaves/Needles: [Shape, margin type — serrate/entire/lobed, colour, surface texture, arrangement on stem — if visible]
Fruit/Seeds/Cones: [Type, size, colour — if visible]
Buds/Twigs: [Bud size, colour, arrangement; twig colour and texture — if visible]
Other features: [Flowers, catkins, epicormic growth, ivy, lichen, moss — if visible]

─── SECTION 3: DIMENSIONS & AGE ──────────────────────────────────
Estimated height: [X–Y metres]
Estimated DBH: [X cm — or "not determinable from image"]
Estimated age: [X–Y years]
Growth classification: [Slow / Moderate / Fast for this species in UK conditions]

─── SECTION 4: HEALTH & STRUCTURAL ASSESSMENT ────────────────────
Overall condition: [Excellent / Good / Fair / Poor / Critical]
Crown health: [Density, die-back %, vigour]
Structural integrity: [Assessment of trunk, scaffold branches, union angles]
Visible defects:
  • Dead wood: [present/absent — location and volume if present]
  • Cracks/splits: [present/absent — describe if present]
  • Co-dominant stems: [present/absent — describe included bark if applicable]
  • Cavities: [present/absent — location and estimated size]
  • Lean: [present/absent — direction and estimated degree]
  • Basal damage: [any visible root damage, decay, mowing injury]
Disease/pest indicators:
  • Fungal bodies: [present/absent — species ID if possible]
  • Cankers/lesions: [present/absent — describe]
  • Discolouration/dieback: [present/absent — describe]
  • Ash dieback (if Ash): [signs present/absent]
  • Bleeding canker (if Horse Chestnut): [signs present/absent]
Root zone: [Any visible heave, decay, severed roots, compaction, waterlogging]

─── SECTION 5: RISK & URGENCY ────────────────────────────────────
Structural risk rating: [Low / Medium / High / Very High]
Failure potential: [What might fail, under what conditions]
Targets at risk: [People, vehicles, buildings, overhead lines — based on visible context]
Urgency: [Routine (annual inspection) / Soon — within 3 months / Urgent — within 1 month / Emergency — immediate action]
Primary concern: [Single most important issue identified]

─── SECTION 6: RECOMMENDED ARBORICULTURAL WORK ───────────────────
[List each recommended operation with justification, e.g.:]
1. [Operation] — [Reason]
2. [Operation] — [Reason]
Suggested timing: [When work should be carried out]

─── SECTION 7: TPO & LEGAL STATUS ────────────────────────────────
TPO likelihood: [Low / Medium / High — with reasoning based on species, apparent age, and size]
Conservation area: [Cannot confirm without postcode — advise customer to provide postcode for live check]
Legal note: [Specific legal requirement relevant to this species and condition]

Customer notes: ${notes || 'None provided'}

This report will be reviewed by qualified NPTC-trained arborists at Tree Monkey Tree Care Ltd (Tring, Hertfordshire) to prepare a site visit and written quotation.`;

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
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: imageData },
        { type: 'text', text: ARBORIST_ASSESSMENT_PROMPT(customerNotes) },
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

      // Send emails independently so a failure doesn't block the booking confirmation
      sendOpsAlert({
        subject: `${urgencyFlag}New tree surgery enquiry #${enquiry.id} - ${input.postcode}`,
        body: `${tpoFlag}Name: ${input.name}\nPhone: ${input.phone}\nEmail: ${input.email}\nPostcode: ${input.postcode}\nWork required: ${input.workRequired}\nSpecies: ${input.treeSpecies || 'Unknown'}\nHeight: ${input.treeHeight || 'Unknown'}\nAccess: ${input.accessDetails || 'Not specified'}\nPreferred date: ${input.preferredDate || 'Flexible'}\nPhoto analysis: ${input.photoAnalysis || 'No photo provided'}\nSource: Tree Monkey chatbot`,
      }).catch(e => console.error('[Email] Ops alert failed:', e.message));

      sendBookingConfirmation({
        id: enquiry.id,
        customer_name: input.name,
        email: input.email,
        work_required: input.workRequired,
        preferred_date: input.preferredDate || null,
        postcode: input.postcode,
        tpo_risk: input.tpoRisk || false,
      }).catch(e => console.error('[Email] Customer confirmation failed:', e.message));

      return JSON.stringify({
        success: true,
        enquiryId: enquiry.id,
        message: `Enquiry confirmed. Reference #${enquiry.id}. Confirmation sent to ${input.email}. The Tree Monkey Tree Care team will be in touch to arrange your free site visit.`,
      });
    } catch (err) {
      return JSON.stringify({ success: false, error: err.message });
    }
  }

  if (toolName === 'check_tpo_status') {
    try {
      const result = await checkTPOStatus(input.postcode);
      return result.summary;
    } catch (err) {
      return `Unable to complete live TPO check for ${input.postcode}: ${err.message}. Please advise the customer to contact their local planning authority directly, or call Tree Monkey Tree Care on 01442 733249 for guidance.`;
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

  // imageData: null | { base64, mediaType } | [{ base64, mediaType }, ...]
  let userContent;
  if (Array.isArray(imageData) && imageData.length > 0) {
    // 3-shot scan: interleave each image with its label so Claude knows the view
    const labels = [
      'IMAGE 1 OF 3 — CROWN VIEW (canopy and top branches)',
      'IMAGE 2 OF 3 — TRUNK VIEW (main stem at mid-height)',
      'IMAGE 3 OF 3 — BASE VIEW (root zone and ground level)',
    ];
    userContent = [];
    imageData.forEach((img, i) => {
      userContent.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType || 'image/jpeg', data: img.base64 } });
      userContent.push({ type: 'text', text: labels[i] || `Image ${i + 1}` });
    });
    userContent.push({ type: 'text', text: message });
  } else if (imageData?.base64) {
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
1. Photo uploaded directly (image appears in this message): Produce a full arboricultural assessment using this exact structure:
   SECTION 1 — SPECIES IDENTIFICATION: Primary ID with Latin name and confidence %, the specific morphological features that confirm it, and alternative species considered and ruled out.
   SECTION 2 — MORPHOLOGICAL FEATURES: Bark (texture, colour, fissuring), crown form (shape, branching, density), trunk (estimated girth/DBH, buttressing, root flare), leaves/needles (shape, margin, colour, arrangement — if visible), fruit/seeds/cones (if visible), buds/twigs (if visible), other features (lichen, ivy, epicormic growth).
   SECTION 3 — DIMENSIONS & AGE: Estimated height (metres), estimated DBH (cm), estimated age range, growth rate classification.
   SECTION 4 — HEALTH & STRUCTURAL ASSESSMENT: Overall condition (Excellent/Good/Fair/Poor/Critical), crown health, structural integrity, visible defects (dead wood, cracks, co-dominant stems, cavities, lean, basal damage), disease/pest indicators (fungal bodies, cankers, dieback, ash dieback if Ash, bleeding canker if Horse Chestnut), root zone observations.
   SECTION 5 — RISK & URGENCY: Structural risk rating (Low/Medium/High/Very High), failure potential, targets at risk, urgency (Routine/Soon/Urgent/Emergency), primary concern.
   SECTION 6 — RECOMMENDED WORK: Numbered list of operations each with justification and suggested timing.
   SECTION 7 — TPO & LEGAL STATUS: TPO likelihood with reasoning, note that postcode needed for live council check, relevant legal note.
   Then call estimate_work_cost for the primary recommended work.
   Where a feature is not visible in the image, state "not visible in image" — never guess.
2. Customer provides a photo URL in text: Call the analyse_tree_photo tool, which will produce the same structured report.
3. THREE-IMAGE SCAN (images labelled crown view / trunk view / base view): This is the most comprehensive assessment mode. Draw from all three images:
   - Section 1 Species ID: use all three views — crown silhouette, bark detail on trunk, root flare at base
   - Section 2 Morphological: crown form from image 1, bark/trunk detail from image 2, root flare and basal features from image 3
   - Section 4 Health: crown dieback from image 1, trunk defects and fungal bodies from image 2, basal decay and root damage from image 3
   - Note in the opening of your response that this is a 3-view scan and therefore more diagnostically comprehensive than a single photo
   - The assessment should be notably more thorough — use all available evidence from all three images
   - Still follow the same 7-section structure

PRICING:
- Always use estimate_work_cost tool when asked about cost or after analysing a photo
- Present estimates as rough ballpark guides, clearly stating the final price is confirmed at free site visit
- Never give a single fixed price — always give a range

TPO GUIDANCE:
- Whenever a customer provides a postcode and asks about TPOs, permissions, conservation areas, or whether they need consent — call check_tpo_status immediately
- Also call check_tpo_status proactively when booking a job involving Oak, Ash, Beech, Yew, Lime, Elm, or any mature/large tree, once you have their postcode
- Present the results clearly and explain the legal implications
- Conservation area: 6 weeks written notice required to local council before any work
- TPO: written consent from local planning authority required before any work; unlimited fine for unauthorised work
- Tree Monkey Tree Care can handle TPO applications and consent paperwork on the customer's behalf
- Always include the data caveat: coverage is not complete for all councils, so a negative result should be confirmed with the local authority before work commences

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
    { maxTokens: 4096, systemOverride: SYSTEM }
  );

  // Strip base64 image data before persisting to Supabase — images can be
  // hundreds of KB and are not needed in subsequent conversation turns.
  const messagesForSession = updatedMessages.map(msg => {
    if (!Array.isArray(msg.content)) return msg;
    return {
      ...msg,
      content: msg.content.map(block =>
        block.type === 'image' ? { type: 'text', text: '[Photo provided by customer]' } : block
      ),
    };
  });

  await upsertSession(sid, messagesForSession, { source: 'web', lastActive: new Date().toISOString() });

  return { reply: text, sessionId: sid };
}
