# Fix Feedback Modal Layout

Restructure `src/components/feedback/FeedbackModal.tsx` so the submit button is always visible, the content scrolls, and on mobile the modal behaves like a bottom sheet.

## Changes

### 1. Modal container (`DialogContent`)
- Constrain height: `max-h-[90vh]` on desktop.
- Switch to a vertical flex column so header / scroll area / footer can size correctly: `flex flex-col p-0 overflow-hidden`.
- Move padding from the container onto the three internal sections (so only the middle one scrolls).
- On mobile (`< sm`): render as a bottom sheet:
  - `fixed inset-x-0 bottom-0 top-auto translate-x-0 translate-y-0 max-h-[90vh] rounded-t-2xl rounded-b-none w-full`
  - Slide-up animation via existing Radix data-state classes (`data-[state=open]:slide-in-from-bottom`).
  - Use `sm:` variants to restore the default centered dialog on larger screens.
- Add `pb-[env(safe-area-inset-bottom)]` on the footer so the button clears the iOS home indicator / keyboard safe area.

### 2. Three-section layout inside the form
The `<form>` becomes the flex column owning header/body/footer.

```
[DialogHeader]          — shrink-0, px-6 pt-6 pb-4, border-b border-border
[Scrollable body]       — flex-1 overflow-y-auto px-6 py-4, space-y-4
  - Category select
  - Message textarea + counter
  - Inline error
[Footer]                — shrink-0 border-t border-border px-6 py-4
                           flex items-center justify-end gap-3
                           bg-background (so it stays opaque over scroll)
                           Cancel + Send feedback buttons
```

### 3. Keep behavior unchanged
- No changes to validation, submit logic, Supabase insert, error mapping, or toast.
- Keep the existing Cancel button next to Send feedback in the footer.
- Keep the existing Radix `DialogClose` "X" in the top-right (it's rendered by `DialogContent`).

## Out of scope
- No changes to `src/components/ui/dialog.tsx` (the overrides are applied via `className` on `DialogContent`).
- No changes to other modals or to `FeedbackButton` / `FeedbackPanel`.
