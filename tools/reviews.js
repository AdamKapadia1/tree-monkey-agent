/**
 * Tool 06 — Review & reputation manager
 * Fetches reviews from Google Business and Trustpilot,
 * classifies sentiment, drafts personalised replies, queues for approval.
 */

import { saveReview, getPendingReviews } from '../lib/supabase.js';
import { complete } from '../lib/claude.js';
import { sendOpsAlert } from '../lib/email.js';

// ─── Google Reviews — two-tier approach ──────────────────────────────────────
//
// TIER 1 (works immediately): Places API — returns most recent 5 reviews.
//   Requires: GOOGLE_MAPS_API_KEY + GOOGLE_PLACE_ID in .env
//
// TIER 2 (apply for access at developers.google.com/my-business/content/prereqs):
//   Business Profile API — returns all reviews with reply capability.
//   Requires: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET,
//             GOOGLE_OAUTH_REFRESH_TOKEN, GOOGLE_BUSINESS_ACCOUNT_ID
//
// The function automatically uses Tier 2 if OAuth env vars are present,
// otherwise falls back to Tier 1.

async function fetchGoogleReviews() {
  // Tier 2 — Business Profile API (full access, reply capability)
  if (process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_BUSINESS_ACCOUNT_ID) {
    return fetchGoogleReviewsBusinessAPI();
  }

  // Tier 1 — Places API (immediate, read-only, max 5 reviews)
  if (process.env.GOOGLE_MAPS_API_KEY && process.env.GOOGLE_PLACE_ID) {
    return fetchGoogleReviewsPlacesAPI();
  }

  console.log('[Reviews] No Google credentials configured — skipping');
  return [];
}

async function fetchGoogleReviewsPlacesAPI() {
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${process.env.GOOGLE_PLACE_ID}&fields=reviews,rating,user_ratings_total&key=${process.env.GOOGLE_MAPS_API_KEY}`;
    const res = await fetch(url);
    const json = await res.json();

    if (json.status !== 'OK') {
      console.error('[Reviews] Places API error:', json.status, json.error_message);
      return [];
    }

    return (json.result?.reviews || []).map(r => ({
      externalId: `google_places_${Buffer.from(r.author_name + r.time).toString('base64').slice(0, 20)}`,
      source: 'google',
      author: r.author_name || 'Anonymous',
      rating: r.rating || 0,
      body: r.text || '',
      publishedAt: new Date(r.time * 1000).toISOString(),
    }));
  } catch (err) {
    console.error('[Reviews] Places API fetch error:', err.message);
    return [];
  }
}

async function fetchGoogleReviewsBusinessAPI() {
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
        refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }),
    });
    const { access_token } = await tokenRes.json();

    const res = await fetch(
      `https://mybusiness.googleapis.com/v4/accounts/${process.env.GOOGLE_BUSINESS_ACCOUNT_ID}/locations/-/reviews?pageSize=20`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
    const json = await res.json();

    return (json.reviews || []).map(r => ({
      externalId: `google_${r.reviewId}`,
      source: 'google',
      author: r.reviewer?.displayName || 'Anonymous',
      rating: { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }[r.starRating] || 0,
      body: r.comment || '',
      publishedAt: r.createTime,
      reviewId: r.reviewId,
    }));
  } catch (err) {
    console.error('[Reviews] Business Profile API error:', err.message);
    return [];
  }
}

/**
 * Post a reply to a Google review via Business Profile API.
 * Only works once Tier 2 access is approved.
 */
export async function postGoogleReply(reviewId, replyText) {
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID) {
    console.log('[Reviews] Business Profile API not configured — reply not posted');
    return { posted: false, reason: 'Business Profile API not configured' };
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
        refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }),
    });
    const { access_token } = await tokenRes.json();

    const res = await fetch(
      `https://mybusiness.googleapis.com/v4/accounts/${process.env.GOOGLE_BUSINESS_ACCOUNT_ID}/locations/-/reviews/${reviewId}/reply`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: replyText }),
      }
    );

    return res.ok ? { posted: true } : { posted: false, status: res.status };
  } catch (err) {
    return { posted: false, error: err.message };
  }
}

// ─── Trustpilot Reviews ───────────────────────────────────────────────────────

async function fetchTrustpilotReviews() {
  const unitId = process.env.TRUSTPILOT_BUSINESS_UNIT_ID;
  const apiKey = process.env.TRUSTPILOT_API_KEY;
  if (!unitId || !apiKey) return [];

  try {
    const res = await fetch(
      `https://api.trustpilot.com/v1/business-units/${unitId}/reviews?perPage=20`,
      { headers: { apikey: apiKey } }
    );
    const json = await res.json();

    return (json.reviews || []).map(r => ({
      externalId: `tp_${r.id}`,
      source: 'trustpilot',
      author: r.consumer?.displayName || 'Anonymous',
      rating: r.stars || 0,
      body: r.text || '',
      publishedAt: r.createdAt,
    }));
  } catch (err) {
    console.error('[Reviews] Trustpilot fetch error:', err.message);
    return [];
  }
}

// ─── Sentiment & Reply Generation ─────────────────────────────────────────────

async function classifyAndDraft(review) {
  const prompt = `
Review for RL Skip Hire High Wycombe:
Author: ${review.author}
Rating: ${review.rating}/5
Text: "${review.body}"

1. Classify sentiment: positive, neutral, or negative
2. Draft a professional, warm reply from RL Skip Hire (max 80 words). Use British English. Thank them by name. If negative, acknowledge the issue, apologise sincerely, and invite them to call 01494 853085.

Respond as JSON: {"sentiment": "...", "draftReply": "..."}
  `.trim();

  const raw = await complete(prompt, 'You are a reputation manager for RL Skip Hire High Wycombe. Respond only with valid JSON.');

  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return { sentiment: 'neutral', draftReply: `Thank you for your review, ${review.author}. We appreciate your feedback and are always looking to improve our service.` };
  }
}

// ─── Main Review Fetch & Process ──────────────────────────────────────────────

/**
 * Fetch all new reviews, classify, draft replies, save to DB.
 * Run daily via cron.
 */
export async function processNewReviews() {
  const [googleReviews, tpReviews] = await Promise.all([
    fetchGoogleReviews(),
    fetchTrustpilotReviews(),
  ]);

  const allReviews = [...googleReviews, ...tpReviews];
  console.log(`[Reviews] Fetched ${allReviews.length} reviews`);

  const results = [];
  for (const review of allReviews) {
    const { sentiment, draftReply } = await classifyAndDraft(review);
    const saved = await saveReview({ ...review, sentiment, draftReply });
    results.push(saved);

    // Immediate alert for negative reviews before any reply goes out
    if (sentiment === 'negative') {
      await sendOpsAlert({
        subject: `Negative review — ${review.source} — ${review.rating}/5 from ${review.author}`,
        body: `
Source: ${review.source}
Rating: ${review.rating}/5
Author: ${review.author}
Review: "${review.body}"

Draft reply (approve before posting):
"${draftReply}"

Review this in the dashboard before it is published.
        `.trim(),
      });
    }
  }

  const summary = {
    total: allReviews.length,
    positive: results.filter(r => r.sentiment === 'positive').length,
    neutral: results.filter(r => r.sentiment === 'neutral').length,
    negative: results.filter(r => r.sentiment === 'negative').length,
  };

  console.log('[Reviews] Summary:', summary);
  return summary;
}

/**
 * Get all pending reviews awaiting approval.
 */
export async function getPendingReplyQueue() {
  return getPendingReviews();
}

/**
 * Approve and publish a reply (mark as approved in DB; actual posting handled per-platform).
 */
export async function approveReply(reviewId) {
  const { supabase } = await import('../lib/supabase.js');
  const { error } = await supabase
    .from('reviews')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', reviewId);
  if (error) throw new Error(error.message);
  return { approved: true, reviewId };
}
