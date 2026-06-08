# Improve signup password UX

Scope: `src/routes/auth.signup.tsx` only. Pure frontend/presentation change.

## 1. Requirements checklist (below password input)
Compute 4 booleans from `password`:
- `len` — `password.length >= 8`
- `upper` — `/[A-Z]/.test(password)`
- `lower` — `/[a-z]/.test(password)`
- `digit` — `/[0-9]/.test(password)`

Render the list only when `password.length > 0`. Each row:
- Unmet: `text-muted-foreground` with `○` (lucide `Circle`)
- Met: `text-emerald-500` with `✓` (lucide `Check`)

Labels: "At least 8 characters", "One uppercase letter (A-Z)", "One lowercase letter (a-z)", "One number (0-9)".

## 2. Strength bar (below checklist)
`metCount = len + upper + lower + digit`.
- 0: hide
- 1–2: red bar (33%), label "Weak" (`text-destructive`)
- 3: amber bar (66%), label "Almost there" (`text-amber-glow`)
- 4: green bar (100%), label "Strong" (`text-emerald-500`)

Track: `h-1 rounded-full bg-secondary` with inner `div` width + color transition.

## 3. Confirm-password indicator
Track `confirmTouched` (set true on first `onChange`). When `confirmTouched && confirm.length > 0`:
- `confirm === password` → green ✓ next to/inside field (right-aligned absolute icon)
- else → red ✗
Use a relative wrapper with `pr-10` on the input and an absolute icon on the right.

## 4. Submit button gating
Disable "Create account" unless `len && upper && lower && digit && confirm === password && age18 && privacy`. Keep existing `loading` disable. (Existing consent error UX stays the same.)

## 5. Friendly Supabase error
In `submit` catch block, replace generic toast for password-strength rejections. Detect via `/password/i.test(err.message)` (covers Supabase's "Password should contain..." and weak-password errors). Show:
> "Password not strong enough. Please use at least 8 characters including uppercase, lowercase and a number."
Other errors keep current behavior (generic message, not raw if unclear). Never surface raw message for password errors.

## 6. Not changed
- No DB/auth/server changes.
- No changes to login, reset, or new-password screens.
- No change to consent checkbox logic.

## Technical notes
- Icons: `Check`, `Circle`, `X` from `lucide-react` (already used elsewhere).
- All colors via existing tokens (`text-destructive`, `text-emerald-500`, `text-amber-glow`, `bg-secondary`).
- Keep `minLength={8}` on inputs as a fallback.
