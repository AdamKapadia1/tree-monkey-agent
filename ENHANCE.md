# KDK Skip Hire — Platform Enhancement Prompt
# Paste everything below this line into Claude Code (claude --dangerously-skip-permissions)

You are working on the KDK Skip Hire AI agent platform located in this directory. 
Read CLAUDE.md first to understand the full business context before making any changes.

This is a Node.js/Express platform with 8 AI-powered modules serving a UK skip hire 
company (KDK Skip Hire, Aylesbury, est. 1986). The platform is live at:
https://energetic-possibility-production-90be.up.railway.app/

Your task is to enhance the platform across the following areas. Work through each 
one systematically. After each enhancement, confirm what was changed and why.

---

## ENHANCEMENT 1 — Admin dashboard (priority: high)

Create public/admin.html — a password-protected web dashboard that gives KDK staff 
a single view of the entire operation. Requirements:

- Login screen with hardcoded password (read from ADMIN_PASSWORD env var, default: kdk2026)
- Overview tab: today's booking count, pending permits, unread reviews, active jobs
- Bookings tab: table of all bookings with status, postcode, skip size, delivery date. 
  Filter by date and status. Click a row to see full details. Button to mark as delivered.
- Reviews tab: list of pending review replies with approve/reject buttons. Show 
  sentiment badge (green/amber/red). One-click approve posts the draft reply.
- Jobs tab: today's driver job sheets, photo count per job, completion status.
- Dispatch tab: trigger today's route generation, show the optimised route on a 
  simple map using Leaflet.js (free, no API key needed).
- All data fetched from the existing /api/* endpoints.
- Style consistently with the existing KDK green (#1a4a2e) and amber (#f5a623) brand.
- Add GET /admin route in server.js that serves admin.html.

---

## ENHANCEMENT 2 — Booking confirmation page (priority: high)

Create public/booking-confirmed.html — a branded confirmation page that customers 
land on after a successful booking. Requirements:

- Shows booking reference number, skip size, delivery date, address
- Clear instructions: what can/cannot go in the skip, how full to load it
- Permit notice if on_road is true
- Contact details if they need to change the booking
- "Add to calendar" button (generates an .ics file for the delivery date)
- KDK branding throughout

Also update the booking tool (tools/booking.js) so that on successful confirm_booking,
the response includes a confirmationUrl pointing to /booking-confirmed?ref=BOOKING_ID

---

## ENHANCEMENT 3 — Missed call SMS responder (priority: high)

Create tools/missed_call.js — when KDK miss a phone call, automatically send the 
caller an SMS with a WhatsApp link to get an instant quote. Requirements:

- POST /webhooks/missed-call endpoint in server.js
- Accepts Twilio voice webhook (caller's number in 'From' field)
- Uses Claude to generate a personalised SMS: "Hi! You just called KDK Skip Hire. 
  We're sorry we missed you. Get an instant quote on WhatsApp: [link]"
- Logs missed calls to a missed_calls table in Supabase (caller number, timestamp, 
  whether they followed up via WhatsApp)
- Add missed_calls table to scripts/migrate.js
- Rate limit: don't send more than one SMS per number per hour

---

## ENHANCEMENT 4 — Smart quote follow-up (priority: medium)

Create tools/followup.js — if someone gets a quote via the chatbot or WhatsApp but 
doesn't complete a booking within 2 hours, automatically follow up. Requirements:

- Cron job in crons/followup.js that runs every 30 minutes
- Queries chat_sessions where flow='quote_given' and no booking created and 
  last_active > 2 hours ago and follow_up_sent IS NULL
- Uses Claude to generate a personalised follow-up message referencing their 
  specific skip size and postcode
- Sends via WhatsApp if session source is 'whatsapp', or email if email is known
- Marks session as follow_up_sent to prevent duplicate messages
- Add follow_up_sent column to chat_sessions in migrate.js

---

## ENHANCEMENT 5 — Driver mobile app improvements (priority: medium)

Enhance public/index.html (the driver PWA) with these improvements:

- Offline support: cache today's job list in localStorage so drivers can view jobs 
  with no signal (common on building sites)
- GPS check-in: when a driver taps "Start job", use browser geolocation API to 
  record their coordinates and timestamp in the job sheet
- Signature capture: add a simple canvas-based signature pad on job completion 
  that saves the signature as a base64 image alongside the job sheet
- Push notification support: add a service worker (public/sw.js) that enables 
  web push notifications so new jobs can be pushed to driver phones
- Improve the route tab: instead of just loading the route, show each stop as a 
  card with a "Navigate" button that opens Google Maps directions from current location

---

## ENHANCEMENT 6 — Automated invoice generation (priority: medium)

Create tools/invoice.js — generate a PDF invoice for each completed booking. Requirements:

- Triggered automatically when a booking status changes to 'completed'
- Uses PDFKit (already installed) to generate a professional A4 invoice with:
  - KDK Skip Hire header with address and company details
  - Invoice number (INV-YEAR-BOOKING_ID format, e.g. INV-2026-0042)
  - Customer details
  - Line items: skip hire, VAT, permit fee if applicable
  - Payment terms: 30 days
  - Bank details placeholder (read from env vars: BANK_NAME, BANK_SORT_CODE, BANK_ACCOUNT)
- Save PDF to Supabase Storage under invoices/INV-2026-0042.pdf
- Email PDF to customer automatically via Resend
- Add invoice_url column to bookings table in migrate.js

---

## ENHANCEMENT 7 — Customer portal (priority: medium)

Create public/portal.html — a simple self-service portal where customers can check 
their booking status. Requirements:

- No login required — customer enters their booking reference + postcode to access
- Shows booking status, delivery date, skip size, permit status
- "Request collection" button — marks the skip as ready for collection in the DB 
  and sends an ops alert email
- "Extend hire" button — sends a request to ops team with current booking details
- "Report an issue" button — opens a text input that sends an ops alert
- Add GET /portal route in server.js

---

## ENHANCEMENT 8 — Enhanced waste classifier (priority: medium)

Improve tools/waste_classifier.js with:

- A fuller EWC code database covering 50+ waste types specific to skip hire
- Detect mixed loads: if description contains both permitted and prohibited items,
  return a split verdict explaining what can and cannot go in
- Add weight estimation: for common waste types (soil, concrete, bricks) warn the 
  customer if their described load likely exceeds the skip's weight limit
- Add a POST /api/waste/report endpoint that generates a formal waste transfer note 
  (WTN) as a PDF — required for commercial customers under UK waste regulations
- The WTN should include: consignor details, waste description, EWC codes, 
  quantity estimate, KDK's waste carrier licence number (placeholder: CBDU123456)

---

## ENHANCEMENT 9 — Analytics and reporting (priority: low)

Create tools/analytics.js and a weekly email report. Requirements:

- Cron in crons/analytics.js that runs every Monday at 07:00
- Queries Supabase for the previous week's data:
  - Total bookings, revenue estimate, most popular skip sizes
  - Busiest postcodes / areas
  - Chatbot conversation count and booking conversion rate
  - Review summary (average rating, new reviews, replies sent)
  - Missed calls count and WhatsApp conversion rate
- Uses Claude to write a plain-English summary paragraph of the week
- Sends formatted HTML email to KDK_OPS_EMAIL via Resend
- Also exposes GET /api/analytics?period=week|month as a JSON endpoint for the 
  admin dashboard

---

## ENHANCEMENT 10 — Competitor price monitoring (priority: low)

Create tools/competitor_monitor.js — weekly check of competitor skip hire prices 
in the KDK service area. Requirements:

- Searches Google for "skip hire [town] price" for 5 key towns: Aylesbury, 
  Berkhamsted, Hemel Hempstead, Tring, Chesham
- Uses web_fetch to pull pricing from competitor websites where visible
- Uses Claude to extract and normalise prices into a comparison table
- Emails KDK ops team a weekly "market position" report showing KDK's prices 
  vs competitor range for each skip size
- Cron runs Sunday evening at 18:00
- Stores results in a competitor_prices table in Supabase
- IMPORTANT: only read publicly visible pricing, no scraping behind logins

---

## GENERAL REQUIREMENTS FOR ALL ENHANCEMENTS

- Maintain the existing code style (ES modules, async/await, no TypeScript)
- All new env vars must be added to .env.example with clear comments
- All new Supabase tables must be added to scripts/migrate.js with full SQL
- All new API endpoints must be added to server.js and documented in README.md
- Error handling on every async operation — never let an unhandled error crash the server
- Log meaningful messages with [Module] prefix for easy Railway log filtering
- Test each endpoint with a curl command after creating it and confirm it returns 
  a sensible response (even if Supabase/Anthropic keys aren't set yet)
- Keep the KDK brand colours (#1a4a2e green, #f5a623 amber) in any new UI

---

## EXECUTION ORDER

Work in this order for maximum impact:
1. Enhancement 1 (admin dashboard) — KDK staff need visibility first
2. Enhancement 2 (booking confirmation page) — customer-facing, high trust impact
3. Enhancement 3 (missed call responder) — immediate revenue recovery
4. Enhancement 5 (driver app improvements) — drivers use this daily
5. Enhancement 6 (invoice generation) — replaces manual invoicing
6. Enhancement 7 (customer portal) — reduces inbound "where's my skip?" calls
7. Enhancement 4 (quote follow-up) — recovery automation
8. Enhancement 8 (enhanced waste classifier) — compliance and commercial use
9. Enhancement 9 (analytics) — visibility and reporting
10. Enhancement 10 (competitor monitoring) — strategic intelligence

Start with Enhancement 1. Read CLAUDE.md, read the existing server.js and 
public/index.html to understand the patterns, then build. Confirm completion 
of each enhancement before moving to the next.
