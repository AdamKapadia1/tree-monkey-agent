import { createClient } from '@supabase/supabase-js';

let _client = null;

function getClient() {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    if (!url) throw new Error(`SUPABASE_URL not set. Available keys: ${Object.keys(process.env).sort().join(', ')}`);
    _client = createClient(url, key);
  }
  return _client;
}

export const supabase = new Proxy({}, {
  get(_, prop) { return getClient()[prop]; }
});

// ─── Enquiries ────────────────────────────────────────────────────────────────

export async function createEnquiry(data) {
  const { data: enquiry, error } = await supabase
    .from('enquiries')
    .insert({
      customer_name: data.name,
      phone: data.phone,
      email: data.email,
      postcode: data.postcode,
      work_required: data.workRequired,
      tree_species: data.treeSpecies || null,
      tree_height: data.treeHeight || null,
      access_details: data.accessDetails || null,
      tpo_risk: data.tpoRisk ?? false,
      is_emergency: data.isEmergency ?? false,
      photo_analysis: data.photoAnalysis || null,
      preferred_date: data.preferredDate || null,
      status: 'pending',
      source: data.source || 'web',
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return enquiry;
}

export async function getEnquiriesByStatus(status) {
  const { data, error } = await supabase
    .from('enquiries')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function updateEnquiryStatus(id, status) {
  const { error } = await supabase
    .from('enquiries')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Reviews ──────────────────────────────────────────────────────────────────

export async function saveReview(review) {
  const { data, error } = await supabase
    .from('reviews')
    .upsert({
      external_id: review.externalId,
      source: review.source,
      author: review.author,
      rating: review.rating,
      body: review.body,
      sentiment: review.sentiment,
      draft_reply: review.draftReply,
      status: 'pending_approval',
      published_at: review.publishedAt,
      fetched_at: new Date().toISOString(),
    }, { onConflict: 'external_id' })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getPendingReviews() {
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('status', 'pending_approval')
    .order('published_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

// ─── Sessions (chat) ──────────────────────────────────────────────────────────

export async function upsertSession(sessionId, messages, metadata = {}) {
  const { error } = await supabase
    .from('chat_sessions')
    .upsert({
      id: sessionId,
      messages: JSON.stringify(messages),
      metadata,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
}

export async function getSession(sessionId) {
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error) return null;
  return { ...data, messages: JSON.parse(data.messages || '[]') };
}
