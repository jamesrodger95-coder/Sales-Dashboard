# Bryant Dental Sales Intelligence

AI-powered sales dashboard that reads Google Calendar data and uses Claude AI agents to provide actionable insights for the Bryant Dental sales team.

## Tech Stack

- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS** — dark theme, Apple-inspired design, mobile-responsive
- **Claude API** (Anthropic) — 5 AI agents for sales analysis
- **Google Calendar API** — live event data via OAuth2
- **Recharts** — data visualisation
- **Vercel** — serverless deployment

## Quick Start

```bash
git clone https://github.com/Jamesbryantdental/Sales-Dashboard.git
cd Sales-Dashboard
npm install
```

### Environment Variables

Create `.env.local` in the project root with these 4 variables:

```
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REFRESH_TOKEN=your_google_refresh_token
ANTHROPIC_API_KEY=your_anthropic_api_key
```

### Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) and import the GitHub repository
3. Add the 4 environment variables above in Vercel Settings > Environment Variables
4. Deploy

## Pages

| Route | Description |
|-------|-------------|
| `/` | Main dashboard — KPIs, call list, analytics preview, schedules, CRM placeholder |
| `/calls` | Full call history with month selector, search, click-to-expand details, copy list |
| `/analytics` | 8-week volume chart, day-of-week breakdown, time-of-day analysis, monthly comparison |
| `/reports` | AI agent reports — morning briefing, follow-up chase list, weekly analysis |
| `/prep` | Demo prep — AI-generated talking points for upcoming demos (auto-refreshes) |
| `/settings` | Connection status for Google Calendar, Zoho CRM placeholder, agent config |

## AI Agents

| Agent | Endpoint | Purpose |
|-------|----------|---------|
| Head Agent | `/api/agents/briefing` | Morning briefing with RED/YELLOW/GREEN priorities |
| Call Tracker | `/api/agents/call-tracker` | Monthly cumulative call list |
| Follow-Up Chaser | `/api/agents/follow-up` | Overdue follow-ups and at-risk leads |
| Weekly Analyst | `/api/agents/weekly` | Booking trends and patterns |
| Demo Prep | `/api/agents/demo-prep` | Pre-call briefing with talking points |

## Calendar Parsing Rules

- **Sales call**: Event with external attendees (not @bryant.dental), Calendly/Cal.com bookings, or phone in location
- **Cancelled**: Title starts with "Canceled:", status is cancelled, or myResponseStatus is declined
- **Excluded**: Internal-only meetings, cancelled events, leave/holiday
- **Extracted**: Contact name, phone number, country from event metadata
