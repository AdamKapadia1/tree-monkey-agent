# KDK Skip Hire — AI Agent

Fully automated Claude Code AI agent for KDK Skip Hire. Eight modules covering the complete customer journey and back-office operations.

## Modules

| # | Module | Description |
|---|--------|-------------|
| 01 | Customer service chatbot | Web chat with session memory, postcode coverage check, live pricing |
| 02 | AI booking & quote form | Conversational booking flow, DB write, confirmation emails |
| 03 | WhatsApp AI assistant | Twilio webhook, same agent brain, media/photo handling |
| 04 | Route & dispatch optimisation | Geocoding, nearest-neighbour TSP, driver manifests via WhatsApp |
| 05 | Permit application assistant | Council lookup, permit requirement check, ops alert with application |
| 06 | Review & reputation manager | Google + Trustpilot fetch, sentiment, AI reply drafts, approval queue |
| 07 | Waste classification & compliance | Text + image analysis, EWC codes, hazard flagging |
| 08 | Driver job sheet & photo logging | Mobile PWA, AI photo descriptions, PDF report generation |

---

## Prerequisites

- Node.js 20+
- Supabase account (free tier works)
- Anthropic API key
- Twilio account (for WhatsApp — optional for v1)
- Resend account (for emails — optional for v1)
- Google Cloud project with Maps API + Business Profile API (optional)

---

## Quick start

```bash
# 1. Clone / copy project
cd kdk-agent

# 2. Install dependencies
npm install

# 3. Set environment variables
cp .env.example .env
# Edit .env with your actual keys

# 4. Set up database (run SQL in Supabase dashboard)
node scripts/migrate.js
# Copy the printed SQL into Supabase Dashboard > SQL Editor

# 5. Create Supabase Storage bucket
# In Supabase Dashboard > Storage > New bucket
# Name: job-photos, Public: true

# 6. Start the server
npm run dev
```

Server starts on http://localhost:3000

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key |
| `SUPABASE_URL` | Yes | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key (not anon) |
| `RESEND_API_KEY` | Recommended | Email sending |
| `KDK_FROM_EMAIL` | Recommended | Sender email address |
| `KDK_OPS_EMAIL` | Recommended | Ops team email for alerts |
| `TWILIO_ACCOUNT_SID` | WhatsApp module | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | WhatsApp module | Twilio auth token |
| `TWILIO_WHATSAPP_FROM` | WhatsApp module | e.g. whatsapp:+14155238886 |
| `GOOGLE_MAPS_API_KEY` | Dispatch module | For geocoding |
| `GOOGLE_BUSINESS_ACCOUNT_ID` | Reviews module | Google Business account |
| `TRUSTPILOT_API_KEY` | Reviews module | Trustpilot API key |
| `DRIVER_A_PHONE` | Dispatch module | Aylesbury driver WhatsApp number |
| `DRIVER_B_PHONE` | Dispatch module | Hemel driver WhatsApp number |

---

## API endpoints

### Chatbot (Module 01)
```
POST /api/chat
{ "message": "What size skip do I need?", "sessionId": "optional-uuid" }
```

### Booking (Module 02)
```
POST /api/booking
{ "message": "I need a 6yd skip in Berkhamsted", "sessionId": "optional-uuid" }
```

### WhatsApp webhook (Module 03)
```
POST /webhooks/whatsapp
# Configure in Twilio console > Messaging > WhatsApp Senders
```

### Dispatch (Module 04)
```
POST /api/dispatch
{ "date": "2026-04-21" }
```

### Permits (Module 05)
```
POST /api/permit/check
{ "postcode": "HP4 1AB", "on_road": true, "id": "booking-id" }

POST /api/permit/apply
{ "id": "booking-id", "postcode": "HP4 1AB", "on_road": true, ... }
```

### Reviews (Module 06)
```
POST /api/reviews/fetch         # Fetch and process new reviews
GET  /api/reviews/pending       # Get queue awaiting approval
POST /api/reviews/:id/approve   # Approve a reply
```

### Waste classifier (Module 07)
```
POST /api/waste/classify
{ "description": "old sofa, paint tins, garden waste" }
# OR
{ "imageUrl": "https://..." }
```

### Job sheets (Module 08)
```
POST /api/jobs
{ "bookingId": 123, "driverId": "driver_1" }

POST /api/jobs/:id/photos
{ "imageBase64": "...", "filename": "photo.jpg", "contentType": "image/jpeg", "photoType": "before" }

POST /api/jobs/:id/complete
{ "driverNotes": "Skip placed on driveway. Customer present." }

GET  /api/jobs/driver/:driverId?date=2026-04-21
```

---

## Driver PWA

The driver app is a mobile-first PWA served at `/`. Drivers can:
- View their daily job list
- Select a job and log photos (before/after/waste/access)
- Get AI-generated photo descriptions automatically
- Run the waste classifier from their phone camera
- Complete jobs with notes, generating a PDF report

**To install on iPhone**: open in Safari → Share → Add to Home Screen
**To install on Android**: open in Chrome → Menu → Add to Home Screen

---

## Cron jobs

Run these as separate processes or use a process manager like PM2:

```bash
# Daily dispatch at 06:00
node crons/dispatch.js

# Daily reviews + permit expiry check at 08:00
node crons/reviews.js

# Run immediately (for testing)
node crons/dispatch.js --now
node crons/reviews.js --now
```

With PM2:
```bash
npm install -g pm2
pm2 start server.js --name kdk-server
pm2 start crons/dispatch.js --name kdk-dispatch
pm2 start crons/reviews.js --name kdk-reviews
pm2 save && pm2 startup
```

---

## Deployment (Railway)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up

# Set environment variables
railway variables set ANTHROPIC_API_KEY=sk-ant-...
# (set all variables from .env.example)
```

Or deploy to Vercel (serverless — note: crons need a separate runner):
```bash
npm install -g vercel
vercel --prod
```

---

## Claude Code usage

Run the agent interactively:
```bash
npm run agent
# or
claude --dangerously-skip-permissions
```

Claude reads `CLAUDE.md` automatically and has access to all tools. You can ask it to:
- "Process today's bookings and generate routes"
- "Check all pending reviews and draft replies"
- "Create a job sheet for booking #42 and assign to driver_1"
- "Classify this waste description: old fridge, bricks, carpet"

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| AI | Anthropic Claude Sonnet (claude-sonnet-4) |
| Runtime | Node.js 20 / ES modules |
| Server | Express 4 |
| Database | Supabase (Postgres) |
| File storage | Supabase Storage |
| Email | Resend |
| SMS / WhatsApp | Twilio |
| PDF generation | PDFKit |
| Image analysis | Claude Vision |
| Geocoding | postcodes.io (free, no key required) |
| Routing | Custom nearest-neighbour TSP |
| Scheduling | node-cron |
| Driver app | Vanilla JS PWA |

---

## Project structure

```
kdk-agent/
├── CLAUDE.md              # Agent brain — business rules and pricing
├── server.js              # Express server — all routes
├── package.json
├── .env.example
├── lib/
│   ├── claude.js          # Anthropic client + agent runner
│   ├── supabase.js        # Database helpers
│   └── email.js           # Resend email helpers
├── tools/
│   ├── chatbot.js         # Module 01 — customer service
│   ├── booking.js         # Module 02 — AI booking flow
│   ├── whatsapp.js        # Module 03 — WhatsApp assistant
│   ├── dispatch.js        # Module 04 — route optimisation
│   ├── permit.js          # Module 05 — permit assistant
│   ├── reviews.js         # Module 06 — reputation management
│   ├── waste_classifier.js # Module 07 — waste compliance
│   └── job_sheet.js       # Module 08 — driver job sheets
├── crons/
│   ├── dispatch.js        # Daily route generation (06:00)
│   └── reviews.js         # Daily review fetch (08:00)
├── scripts/
│   └── migrate.js         # Database migration SQL
└── public/
    ├── index.html         # Driver PWA
    └── manifest.json      # PWA manifest
```

---

## Support

For questions about this agent build: use Claude Code (`claude`) and it will read `CLAUDE.md` to understand the full KDK context.

KDK Skip Hire: 01296 699738 | info@kdkskiphire.co.uk
