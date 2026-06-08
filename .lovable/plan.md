## Add Privacy Policy page

### New file: `src/routes/privacy.tsx`
- Public route `/privacy` (mirrors `rules.tsx` structure: header with logo + back link, dark theme, amber headings, TOC sidebar on desktop).
- `head()` with title "Privacy Policy — Marcador", description, og tags, canonical URL.
- Page sections (plain English, per spec):
  1. Who we are
  2. What data we collect
  3. Why we collect it & legal basis
  4. How long we keep your data
  5. Who we share with (Supabase, Stripe)
  6. Your GDPR rights
  7. Cookies & local storage
  8. Children (18+)
  9. Changes to this policy
  10. Contact
- "Last updated: June 2026" note at the top and in footer of page.
- Bottom: "← Back to Marcador" link to `/`.

### Footer links (add "Privacy" alongside Rules)
- `src/components/AppShell.tsx` footer — insert `<Link to="/privacy">Privacy</Link>` between Rules and FeedbackButton.
- `src/routes/index.tsx` landing footer — same insertion.
- `src/routes/rules.tsx` footer — add Privacy link for consistency.

### Signup screen
- `src/routes/auth.signup.tsx` — add a small line under the form: "By creating an account you agree to our [Rules] and [Privacy Policy]."

### Out of scope
- No DB changes, no content updates to rules page, no cookie banner (storage is essential-only per policy text).
