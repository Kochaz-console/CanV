# Study Tracker

A mobile-first study tracker for recording daily Physics, Chemistry, and Maths questions and sharing progress with a small study group. Built with React, TypeScript, Vite, Tailwind CSS, and Supabase.

## What is included

- Email/password sign-up, login, session persistence, and logout.
- Unique usernames and editable display names and avatar image URLs.
- A daily dashboard with subject totals, all-time totals, active days, streaks, and recent activity.
- Daily and current-week leaderboards, plus profiles with recent daily and subject-wise progress.
- PostgreSQL tables, indexes, triggers, row-level security (RLS), and restricted database functions in [`supabase/schema.sql`](./supabase/schema.sql).
- A Vercel rewrite for client-side routes.

## Supabase setup

1. Create a Supabase project.
2. In the Supabase Dashboard, open **SQL Editor**, paste in [`supabase/schema.sql`](./supabase/schema.sql), and run it. It creates the profile and daily-progress tables, the sign-up profile trigger, RLS policies, and the safe summary/leaderboard functions used by the app.
3. In **Authentication → URL Configuration**, set your local site URL to `http://localhost:5173`. Add your deployed Vercel URL to the allowed redirect URLs. Email confirmation can be enabled or disabled under **Authentication → Providers → Email**.
4. Copy the project URL and the **anon/public** key from **Project Settings → API**. Never put a Supabase `service_role` key in this frontend app.

Signed-in users can read usernames and display names, but can only read or write their own raw daily-progress rows and update their own profile. Leaderboards, totals, streaks, and the last 14 days of progress are returned by database functions that expose only the summaries required by the UI.

## Run locally

```sh
npm install
cp .env.example .env.local
```

Edit `.env.local` with the Supabase values:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Then start the development server:

```sh
npm run dev
```

Open the local URL Vite prints (normally `http://localhost:5173`). To validate a production build, run `npm run build`; to preview it locally, run `npm run preview`.

## Deploy to Vercel

Import this repository as a Vite project in Vercel. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under the project's environment variables for each deployment environment, then deploy. The included [`vercel.json`](./vercel.json) routes browser requests back to the app entry point.
