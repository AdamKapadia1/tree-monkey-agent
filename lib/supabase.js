import { createClient } from '@supabase/supabase-js';

let _client = null;

function getClient() {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url) throw new Error(`SUPABASE_URL not set. Available keys: ${Object.keys(process.env).sort().join(', ')}`);
    _client = createClient(url, key);
  }
  return _client;
}

export const supabase = new Proxy({}, {
  get(_, prop) { return getClient()[prop]; }
});

// ─── Bookings ────────────────────────────────────────────────────────────────

export async function createBooking(data) {
  const { data: booking, error } = await supabase
    .from('bookings')
    .insert({
      customer_name: data.name,
      phone: data.phone,
      email: data.email,
      postcode: data.postcode,
      skip_size: data.skipSize,
      delivery_date: data.deliveryDate,
      on_road: data.onRoad ?? false,
      waste_description: data.wasteDescription,
      permit_required: data.onRoad ?? false,
      status: 'pending',
      source: data.source || 'web',
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return booking;
}

export async function getBookingsByDate(date) {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('delivery_date', date)
    .neq('status', 'cancelled')
    .order('postcode');

  if (error) throw new Error(error.message);
  return data;
}

export async function updateBookingStatus(id, status) {
  const { error } = await supabase
    .from('bookings')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Job Sheets ───────────────────────────────────────────────────────────────

export async function createJobSheet(bookingId, driverId) {
  const { data, error } = await supabase
    .from('job_sheets')
    .insert({
      booking_id: bookingId,
      driver_id: driverId,
      status: 'pending',
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateJobSheet(id, updates) {
  const { data, error } = await supabase
    .from('job_sheets')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getJobSheetsByDriver(driverId, date) {
  const { data, error } = await supabase
    .from('job_sheets')
    .select('*, bookings(*)')
    .eq('driver_id', driverId)
    .eq('bookings.delivery_date', date);

  if (error) throw new Error(error.message);
  return data;
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

// ─── Permits ─────────────────────────────────────────────────────────────────

export async function savePermitApplication(data) {
  const { data: permit, error } = await supabase
    .from('permit_applications')
    .insert({
      booking_id: data.bookingId,
      council: data.council,
      postcode: data.postcode,
      street_address: data.streetAddress,
      application_ref: data.applicationRef,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      expiry_date: data.expiryDate,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return permit;
}
