# Lumi Setup

## 1. Create Supabase project
- Create a project in Supabase.
- Copy your project URL and anon key.

## 2. Create the database table
- Open Supabase SQL editor.
- Run the SQL in `database.sql`.

## 3. Add your client config
- Open `app-config.js`.
- Replace the empty values with your Supabase URL and anon key.

## 4. Auth settings
- In Supabase Auth, enable Email auth.
- If you want instant signup for testing, disable email confirmation.

## 5. Host the site
- Deploy the folder to Netlify, Vercel, or GitHub Pages.

## Notes
- Each signed-in user gets their own private journal state.
- Without valid Supabase config, the app falls back to local browser storage only.
