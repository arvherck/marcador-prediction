# English-by-default sweep

Translate all user-facing copy to English while keeping branded terms intact.

## Brand terms to KEEP (untouched)
- **Marcador** (product name, logo, "El Marcador" leaderboard title)
- **Ligas** (nav tab + section header for leagues)
- **Mi Marcador** (profile tab)
- **Panel** (admin tab)

Everything else becomes English. "Jornada" → "Matchday", "Predicción" → "Prediction", etc.

## Files & key replacements

### `src/components/GuestGate.tsx`
- "Crea una cuenta gratis" → "Create a free account"
- Body → "Create a free account to make predictions and compete on the leaderboard."
- "Crear cuenta" → "Sign up"
- "Seguir como invitado" → "Stay as guest"

### `src/components/AppShell.tsx`
- "Invitado" → "Guest"
- "Salir" (guest logout) → "Exit"

### `src/components/KickoffCountdown.tsx`
- "Jornada bloqueada" → "Matchday locked"
- "⚠ Bloqueo inminente" → "⚠ Locking soon"
- "Bloqueo en" → "Locks in"

### `src/components/ShareModal.tsx`
- "Tu navegador no permite copiar imágenes. Usa Descargar." → "Your browser can't copy images. Use Download."
- Any other Spanish labels in this file (will sweep on edit).

### `src/routes/auth.tsx`
- Toast "Modo invitado activado." → "Guest mode on."
- Button "Continuar como invitado" → "Continue as guest"
- Subtext → "Read-only. You can't predict or appear on the leaderboard."

### `src/routes/_authenticated/play.tsx`
- "Sin jornada activa" → "No active matchday"
- Sub → "No matches available yet. Check back soon — the ball's about to roll."
- "Las predicciones se bloquean al saque. Aplica un 2× booster por jornada." → "Predictions lock at kickoff. Apply one 2× booster per matchday."
- "Esta jornada aún no tiene partidos" → "This matchday has no fixtures yet"
- Sub → "The admin hasn't published them."
- Submit label `Enviar N predicción(es)` → `Submit N prediction(s)`
- aria-label "Compartir picks" → "Share picks"; button text "Compartir" → "Share"
- "Crear cuenta para predecir" → "Sign up to predict"
- Default displayName fallback "Jugador" → "Player"

### `src/routes/_authenticated/me.tsx`
- "Puntos por jornada" → "Points per matchday"
- "Ranking en el tiempo" → "Rank over time"
- "Historial de predicciones" → "Prediction history"
- "Sin puntos todavía" / sub → "No points yet" / "Once a matchday finishes, your points will appear here."
- "Sin ranking todavía" / sub → "No rank yet" / "Your position will appear after the first scored matchday."
- "Aún no has jugado" / sub → "No predictions yet" / "Once you submit predictions, your history will appear here."

### `src/routes/_authenticated/leagues.tsx` & `leagues.join.tsx`
- Section headers: keep "Ligas" where it's the H1 brand label; translate descriptive copy.
- "Crear liga" → "Create league" (the button); H1 if "Crear liga" is a heading inside the page stays English.
- "Crear" / "Límite alcanzado" / "máximo permitido" → "Create" / "Limit reached" / "max allowed"
- "Unirse con código" → "Join with code"
- "Aún no estás en ninguna liga. Crea una o únete con un código." → "You're not in any leagues yet. Create one or join with a code."
- "Copiar enlace de invitación" → "Copy invite link"
- "Sin puntos aún" → "No points yet"
- Toasts: "Liga creada. Código: X" → "League created. Code: X"; "Algo falló." → "Something went wrong."; "¡Te uniste a la liga!" → "Joined the league!"; "Código inválido." → "Invalid code."
- `leagues.join.tsx`: "Invitación a una liga" → "League invitation"; "Vas a unirte con el código" → "You're about to join with code"; "Unirse" / "Uniéndose…" → "Join" / "Joining…"

### `src/routes/_authenticated/admin.tsx`
- "Esta sección está restringida a administradores." → "This section is restricted to admins."
- "Nueva jornada (6 partidos)" → "New matchday (6 matches)"
- "Añadir partido manualmente" → "Add match manually"
- "Resultados y cálculo de puntuación" → "Results & scoring"
- "No hay jornadas todavía." → "No matchdays yet."
- "Predicciones por jornada" → "Predictions by matchday"
- "Partido añadido." → "Match added."
- "Selecciona jornada…" → "Select matchday…"
- "Añadir partido" → "Add match"
- "Jornada calculada." → "Matchday scored."
- "Calcular puntuación" → "Run scoring"
- "No hay partidos en esta jornada." → "No matches in this matchday."
- "X marcó primero" → "X scored first"; "Sin goles" → "No goals"
- "Selecciona una jornada para ver las predicciones." → "Select a matchday to view predictions."
- "Sin predicciones." → "No predictions."
- Table headers: "Predicción" → "Prediction"; "Puntos" → "Points"
- "Jornada creada." → "Matchday created."
- "Crear jornada con 6 partidos" → "Create matchday with 6 matches"
- Placeholder "Nombre de jornada" → "Matchday name"
- "Crear jornada" → "Create matchday"

## Out of scope
- No logic changes — purely copy.
- No `i18n` library; the app stays single-language. If full localization is desired later, that's a separate task.
- "Marcador", "Ligas", "Mi Marcador", "Panel" stay as-is per branding guidance.
