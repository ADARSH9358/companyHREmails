# Contact Hub

Single-page Next.js app (App Router) with a Neon Postgres database.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env.local` and paste your Neon connection string into `DATABASE_URL`.
3. `npm run dev` and open http://localhost:3000

The `contacts` table is created automatically on the first request.

## Deploy (Vercel)
Add `DATABASE_URL` under Project Settings -> Environment Variables, then deploy.

## Notes
- Emails and phone numbers are stored as JSON arrays, so one person can have many of each.
- "Send email" opens your mail app (mailto). "Send on WhatsApp" opens wa.me.
- 10-digit numbers get the country code in `DEFAULT_COUNTRY_CODE` (app/page.js, default 91). Change it if needed.
