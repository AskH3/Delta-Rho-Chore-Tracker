# House Duty Board — hosted edition

Fraternity chore management with real user accounts. Two independent sections
(New Boys / House Boys), each with its own chore bank and weekly rotation;
photo proof-of-work; thumbs up/down voting; week-by-week history; downloadable
weekly/monthly reports.

Permissions are enforced by the database (row-level security), not just the UI:

- Only the admin can edit chore banks and rosters
- Only the submitter or the admin can edit/delete a submission
- One vote per account per submission

## Stack (all free tiers)

- **Supabase** — accounts (email + password), database, photo storage
- **Vercel** — hosting; gives you a URL like `yourname-duty.vercel.app`
- **Vite + React** — the app itself

---

## Setup (~20 minutes)

### 1. Create the Supabase project

1. Go to https://supabase.com → sign up → **New project** (free tier).
2. Pick any name/region, set a strong database password (save it somewhere).
3. When it finishes provisioning, open **SQL Editor** → **New query**,
   paste the entire contents of `schema.sql` from this folder, and hit **Run**.
   You should see "Success. No rows returned."
4. Go to **Authentication → Sign In / Up → Email** and turn **OFF**
   "Confirm email." (Otherwise every brother has to click an email link
   before they can sign in. Turn it back on later if you want.)
5. Go to **Project Settings → API** and copy two values:
   - **Project URL** (looks like `https://abcdefg.supabase.co`)
   - **anon / public key** (long string). The anon key is safe to expose in
     the frontend — row-level security is what protects the data.

### 2. Deploy to Vercel

1. Put this folder in a GitHub repo (or use `vercel` CLI if you prefer):
   ```bash
   cd duty-site
   git init && git add -A && git commit -m "duty board"
   # create a repo on github.com, then:
   git remote add origin https://github.com/YOURUSER/duty-board.git
   git push -u origin main
   ```
2. Go to https://vercel.com → sign up with GitHub → **Add New Project** →
   import the repo. Vercel auto-detects Vite.
3. Before deploying, expand **Environment Variables** and add:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key
4. Hit **Deploy**. In a minute you'll have your URL.
   (You can attach a custom domain later under Project → Settings → Domains.)

### 3. Make yourself admin

1. Open your new site, **Create account** with your name/email/password.
2. Back in Supabase: **SQL Editor** → run (with YOUR email):
   ```sql
   update public.profiles set is_admin = true
     where id = (select id from auth.users where email = 'you@example.com');
   ```
3. Refresh the site — you'll see "· Admin" next to your name, and the
   Chore Bank / Roster editors and the Report button unlock.

### 4. Load it and share it

1. Add chores + day assignments in each section's **Chore Bank**.
2. Add names to each **Roster** (this is the rotation order — shifts one
   name every Monday automatically).
3. Send the URL to the house. Everyone creates their own account; their
   posts are automatically credited to their account name.

---

## Local development (optional)

```bash
cp .env.example .env      # fill in your two Supabase values
npm install
npm run dev               # http://localhost:5173
```

## Notes

- **Rotation** is computed from the calendar (anchored to Mon Jan 5, 2026),
  so it advances every Monday with zero maintenance.
- **Reports**: admin-only. Work Log → ⤓ Report → pick week or month →
  downloads an HTML file with a per-person tally and every submission with
  its photo. Open it in a browser and print to PDF for records.
- **Photos** are compressed in the browser before upload (~100–200 KB each).
  The free Supabase tier includes 1 GB of storage — thousands of photos.
- **Photo privacy**: photos are stored in a public-read bucket, meaning
  anyone with a photo's direct URL can view that image. The site itself
  requires login. If you want photos fully locked down too, that's a small
  change (signed URLs) — ask Claude to switch the `photos` bucket to private
  and update `photoUrl()` to use `createSignedUrl`.
- **Removing someone**: Supabase → Authentication → Users → delete their
  account. Their past posts remain attributed by name.
