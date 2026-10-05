# Fitness module — design

- **Date:** 2026-10-04
- **Status:** Draft for review
- **Branch:** `feat/fitness-today` (PR 1 of 5)

## 1. Purpose

Family Hub gets a **Fitness** tab that tells a family member what to do today, records whether they did it, and keeps a missed day from undoing their progress. It shows body-composition trends without exposing them to everyone else who uses the shared family login.

The program targets an adult beginner who wants to lose fat and add muscle with short Apple Fitness+ strength sessions, daily walks, and a gradual run-walk progression. Data is keyed by user, so any family member can opt in.

### Success criteria

1. On a phone, the Today screen answers "what do I do today?" without scrolling.
2. Logging a day takes under 30 seconds by hand, and no time once Health sync runs.
3. One missed day never resets visible progress to zero. Freezes, repair and pause cover a miss, and best streak, weeks won and 28-day consistency never reset.
4. Weight, body fat and waist stay hidden on shared devices until the user unlocks them with a PIN.
5. Every program, scoring, streak, weekly and trend rule is covered by unit tests written before the code.

### Non-goals

- Calorie counting or a food database. Food photos live in a dedicated app such as Lose It!; Family Hub only imports daily totals through Apple Health.
- Workout video. Apple Fitness+ provides the classes.
- Social features and a general-purpose habit tracker.
- Desk automation, which is a separate project.

## 2. Program rules

### 2.1 Phases

Program weeks run Monday to Sunday. Week 1 is the week that contains the profile's start date.

| Phase | Weeks | Strength (Fitness+, 10–20 min) | Walks | Run-walk | Extras | Food habits |
|---|---|---|---|---|---|---|
| Start | 1–2 | 2 per week | 20–30 min daily | none | none | Protein |
| Build | 3–4 | 3 per week | 30–45 min | 2 per week | Core or yoga, optional | Protein, plants |
| Full | 5+ | 3–4 per week | about 45 min | 3 per week | Core (Tue), yoga or Pilates (Thu) | Protein, plants, drinks |

### 2.2 Weekly templates

| Day | Start | Build | Full |
|---|---|---|---|
| Mon | Strength + walk | Strength + walk | Strength (upper) + walk |
| Tue | Walk | Run-walk | Core 10 + run-walk |
| Wed | Walk | Strength + walk | Strength (lower) + walk |
| Thu | Strength + walk | Walk (yoga optional) | Yoga or Pilates + run-walk |
| Fri | Walk | Strength + walk | Strength (total body) + walk |
| Sat | Walk or easy ride | Run-walk or ride | Run-walk or ride (45–90 min) |
| Sun | Walk + check-in | Walk + check-in | Strength (optional 4th) + easy walk + check-in |

- **Check-in** means the Sunday waist measurement, weekly summary and nutrition tweak (PR 3).
- A bike ride can replace any run-walk.

### 2.3 Strength

- **Weeks 1–4** use the Fitness+ program **Strength Basics in 3 Weeks**: 9 sessions (upper, lower and total body, three times), 10–20 minutes each, one or two pairs of medium dumbbells.
  - Sessions run in order at the phase's pace.
  - The session number is the count of strength workouts completed since the start date, plus one, capped at 9.
- **After session 9, and from week 5,** the item reads "Fitness+ Strength, 20 min" with the weekday's focus. The Plan tab suggests setting up a Fitness+ Custom Plan.
- Every strength item shows this effort cue: "End each set with 2–3 reps left. When the last reps stop feeling hard, go up a dumbbell."

### 2.4 Run-walk levels

Levels follow the NHS Couch to 5K plan. Each level has three runs. Every run starts with a 5-minute warm-up walk and ends with a 5-minute cool-down walk.

| Level | Run 1 | Run 2 | Run 3 |
|---|---|---|---|
| 1 | Run 1:00 / walk 1:30, 7 times, then run 1:00 | same | same |
| 2 | Run 1:30 / walk 2:00, 5 times, then run 1:30 | same | same |
| 3 | Run 1:30, walk 1:30, run 3:00, walk 3:00, run 1:30, walk 1:30, run 3:00 | same | same |
| 4 | Run 3:00, walk 1:30, run 5:00, walk 2:30, run 3:00, walk 1:30, run 5:00 | same | same |
| 5 | Run 5:00, walk 3:00, run 5:00, walk 3:00, run 5:00 | Run 8:00, walk 5:00, run 8:00 | Run 20:00 |
| 6 | Run 5:00, walk 3:00, run 8:00, walk 3:00, run 5:00 | Run 10:00, walk 3:00, run 10:00 | Run 25:00 |
| 7 | Run 25:00 | same | same |
| 8 | Run 28:00 | same | same |
| 9 | Run 30:00 | same | same |

- Run-walk starts in week 3 at level 1, run 1.
- **Progression:** the next run is the one after the last completed run. Completing a run stores its level and run number on that day. After run 3 the next level starts.
  - In Build (2 runs a week) a level takes about a week and a half. In Full (3 a week) it takes about a week.
- **Repeat this level** is always available. It makes the next run run 1 of the current level; Couch to 5K explicitly allows repeating weeks.
- Each run shows the matching **Apple Watch Custom Workout** recipe (Fitness app → Add Repeat). The NHS app is only on the UK App Store.
- **After level 9** the item reads "Easy run, 30 min."
- **Long-run warning (PR 4, needs Health distance data):** a run longer than planned is flagged if it exceeds 110% of the longest run in the previous 30 days.

### 2.5 Day items and scoring

Each day has up to two plan items, any number of extra activities, and the food habits.

- **Workout** (when scheduled) is done when checked, or when the day has a workout-type activity of at least 10 minutes. Workout types are strength, core, yoga, Pilates, HIIT and other classes.
  - Doing a different workout type than planned still completes the slot.
  - Only strength-type activities count toward the weekly strength range and the strength session number.
- **Move** is done when checked, or when the day's walk, hike, run and ride minutes reach the phase minimum: Start 20, Build 30, Full 40.
  - On run-walk days, a checked run-walk or a run of at least 20 minutes completes the item and advances the run-walk level.
- **Extra activity:** the user can log an unplanned activity (kind and minutes) on any day.
  - Extras count toward the floor and the weekly ranges.
  - This is how a swapped day works. For example, Monday's strength done on Tuesday is logged on Tuesday as an extra strength activity.
- **Floor** is met in any of these cases:
  - the user taps "I did 10 minutes";
  - any single activity (manual, extra or imported) lasts at least `floorMinutes` (default 10);
  - any plan item is done.
- **Day status** is checked in this order, and the first match wins:
  1. `full`: every scheduled plan item is done.
  2. `floor`: the floor is met.
  3. `paused`: the day is inside a pause range.
  4. `frozen` or `repaired`: a resolved miss (§2.7).
  5. `pending`: today, or a past day still inside a resolution window with nothing logged.
  6. `missed`: a past day with no activity after every window has closed.

Items marked optional in the templates never block `full`: yoga on Build Thursdays, and the fourth strength session on Full Sundays.

Imported completions (PR 4) can't be unchecked. Manual check-offs are stored separately and are never overwritten by imports.

### 2.6 Food habits

| Habit | From phase | Done when |
|---|---|---|
| Protein | Start | 4 "hits" of about 35–40 g (about 150 g a day). A **protein day** is at least 3 hits (about 120 g), or at least 120 g imported from Health. |
| Plants | Build | Vegetables or fruit at 3 or more meals or snacks |
| Drinks | Full | Only zero-calorie drinks; alcohol is occasional |

Food habits never affect the streak. They count toward the weekly protein range and show on the calendar.

### 2.7 Streak rules

**Streak count**
- **Active day:** `full` or `floor`. Adds 1 to the streak.
- **Held day:** `paused`, `frozen`, `repaired`, or a `pending` past day. It neither adds to nor breaks the streak.
- **Missed day:** the current streak becomes the number of active days after the most recent missed day.
- **Today** counts once it's active. Until then it's `pending` and never breaks the streak.
- Days before the start date are ignored.

**Resolving a past day with no activity**
- **Freeze**
  - There are 2 per program week, and unused freezes don't carry over.
  - The user taps "Use a freeze" on the missed-day card. It works for a no-activity day on any of the 7 days before today, if that day's program week still has a freeze left.
  - When the 7-day window closes, an unresolved day gets a freeze automatically if its week still has one; otherwise it becomes `missed`. The engine computes this, so no background job is needed.
  - Automatic freezes count toward the week's 2.
  - If activity is logged late for a frozen day (late logging allows up to 7 days back), the day becomes active and its freeze is returned.
  - Manual application comes first because emergency skips helped most when people applied them after a miss. The automatic fallback means forgetting to tap never costs the streak.
- **Repair**
  - The user taps "Repair with 10 extra minutes" on either of the two days after the miss, confirming they did one extra walk of at least 10 minutes beyond that day's floor. The missed day becomes `repaired`.
  - Repair is available whether or not freezes remain.
- **Pause**
  - A pause is a date range with a reason (sick, injured, travel or other).
  - It can be set ahead of time or up to 7 days back. Paused days are held and don't use freezes.

**Marks and counters**
- **Comeback:** the first `full` day after a missed, frozen or repaired day gets a comeback mark. Progress shows the total.
- **Best streak, weeks won, week-won streak and 28-day consistency** are always shown and never reset. Consistency is active days divided by non-paused days in the last 28.

**Copy**
- The app says "Streak protected", never "Streak lost".
- After a miss it asks "What got in the way?" and offers one if-then plan, saved on the missed day: "If ___, then I'll do my 10 minutes ___."

### 2.8 Weekly ranges

| Phase | Strength | Run-walk | Active days | Protein days |
|---|---|---|---|---|
| Start | 1–2 | n/a | 5–7 | 3–7 |
| Build | 2–3 | 1–2 | 5–7 | 4–7 |
| Full | 3–4 | 2–3 | 5–7 | 5–7 |

- A week is **won** when every low end is met.
- A week with 4 or more paused days is held: it neither wins nor breaks the week-won streak.
- A first week that starts on a day other than Monday is held.
- The current week shows progress toward each range.

### 2.9 Body trends (PR 3)

- **Daily value:** the earliest weigh-in of the local day, for both weight and body fat.
- **Trend:** an exponentially weighted moving average with α = 0.1, updated only on days with a reading.
- **Lean and fat mass:** lean mass is trend weight × (1 − trend body fat); fat mass is trend weight × trend body fat.
- **Rate:** the least-squares slope of the trend over the last 14 days, in lb per week. It needs at least 10 weigh-ins in that window.
- **Projection:** target weight is lean mass ÷ (1 − target body fat).
  - If the user is losing faster than 0.1 lb a week, the projected date is today + (trend weight − target weight) ÷ rate.
  - Otherwise the screen shows "No projection yet."
- **Sunday nutrition tweak**, based on the 14-day rate (loss counted as positive):

  | 14-day rate | Message |
  |---|---|
  | Under 0.5 lb/week | "Pick one change this week." Options: a smaller starch portion at dinner; swap one snack for a protein hit; zero-calorie drinks only; one fewer restaurant meal. |
  | 0.5–2.0 lb/week | "Keep going." |
  | Over 2.0 lb/week | "You're losing fast. Add a snack, or a fist of carbs on strength days, to protect muscle." |
  | Not enough weigh-ins | "Weigh in on more mornings so the trend can judge." |
- **Scale note on Progress:** consumer scales that measure through the feet can misread body fat by several points and understate change, so the trend matters more than single readings. A DEXA scan gives a reliable baseline.

### 2.10 Privacy

Family Hub uses one shared family login, so the Fitness tab has to be safe on shared devices such as a kiosk.

- **Visible to anyone signed in:** the plan, check-offs, streak, freezes, weekly ranges, calendar and food-habit taps.
- **Locked behind the user's PIN:** weight, body fat, lean and fat mass, waist, trends, the projection, and the nutrition tweak (because it describes weight change).
- **PIN storage:** 4–8 digits, stored as a scrypt hash on the profile.
- **Unlocking** sets an httpOnly `fh_fit` cookie holding a random token.
  - The token is stored as a SHA-256 hash in `fitness_unlocks`, is scoped to one user, and expires after 30 days.
  - "Lock" deletes it.
- **Throttling:** failed PIN attempts are limited like logins, to 10 per 15 minutes per IP and user.
- **API access:** a bearer API key bound to the same user bypasses the PIN, which Health sync relies on.
- **Limits:** this is a privacy screen for shared household devices, not protection against someone with server access.

### 2.11 Apple Health sync (PR 4)

**What an iPhone Shortcut can do** (researched 2026-10-04)
- The "Find Health Samples" action reads weight, body fat, steps, exercise minutes and active energy, and can group results by day.
  - Dietary energy and protein are unconfirmed and must be checked in the action's type picker.
  - Lean body mass isn't written to Health by common scale apps, so the server derives it.
- **No built-in action reads workouts**, through iOS 27.
- **Health can't be read while the phone is locked.** A time-of-day automation that fires on a locked phone gets nothing.
- **"App Is Closed" automations run while the phone is unlocked,** so they're the reliable trigger. Closing the scale app after a weigh-in, or the food app after logging, syncs right away.
- **"Apple Watch Workout starts / ends" automations** can run without a tap and don't need to read Health. The planned workout path uses them: the start automation saves the start time to a file, and the end automation posts the finished workout with its activity, start and end. One pair per workout type.
- If that proves unreliable, the alternatives are a third-party Health export app that posts workouts, or exercise minutes as a floor-only signal. Manual check-off always works.

**Endpoint and auth**
- `POST /api/fitness/sync` accepts Apple Health data posted by an iOS Shortcut.
- It requires a bearer API key bound to a user (`locals.apiUserId`). Cookie sessions and shared keys get 403.

**Payload.** A top-level object, because Shortcuts can't send a bare array. All arrays are optional.
```json
{
  "samples": [
    { "type": "weight", "value": 182.4, "unit": "lb", "start": "2026-10-05T07:02:00-06:00" },
    { "type": "bodyFat", "value": 24.0, "unit": "%", "start": "2026-10-05T07:02:00-06:00" },
    { "type": "steps", "value": 8432, "date": "2026-10-05" },
    { "type": "dietaryEnergy", "value": 2150, "unit": "kcal", "date": "2026-10-05" },
    { "type": "protein", "value": 142, "unit": "g", "date": "2026-10-05" }
  ],
  "workouts": [
    {
      "activity": "Traditional Strength Training",
      "start": "2026-10-05T12:10:00-06:00",
      "end": "2026-10-05T12:28:00-06:00",
      "energyKcal": 140,
      "distanceKm": null
    }
  ]
}
```

**Processing**
- **Normalization**
  - Weight in kg is converted to lb, and body fat sent as a fraction (≤ 1) is converted to percent.
  - Values may arrive as numbers or as numeric strings with a decimal comma or a long decimal tail; they're parsed and rounded to 0.1.
  - Times are ISO 8601 with an offset (Shortcuts' Format Date → ISO 8601 with time).
  - Health activity names map to the kinds strength, core, yoga, Pilates, HIIT, walk, hike, run, ride and other.
- **Idempotency:** each row is upserted by (user, source `health`, source key).
  - The source key is the Health sample's id when the Shortcut can supply one. Otherwise it's `type + start`, or `type + date` for daily totals.
  - Sending the same week again changes nothing.
- **Backfill:** the Shortcut sends the last 7 days on every run, which also fills in days from before the sync existed.
- **Completion:** imported workouts complete plan items under §2.5.

**Getting there**
- **Remote access:** a Cloudflare Access application scoped to exactly `/api/fitness/sync`, with a Service Auth policy and a service token.
  - The Shortcut sends `CF-Access-Client-Id` and `CF-Access-Client-Secret` along with `Authorization: Bearer fh_…`.
  - The scope must stay that narrow. A path-scoped Access app overrides its parent and inherits none of its rules, so a broader `/api/*` scope would lock the web app out of its own API.
  - Cloudflare's strict service-token mode (October 2026) answers failures with 401/403 instead of a login redirect, which makes errors visible in the Shortcut.
- **Triggers:**
  - "App Is Closed" automations for the scale app and the food app.
  - The Apple Watch workout start/end pairs.
  - A "Sync from Health" button on Today that opens the Shortcut through `shortcuts://run-shortcut?name=…`. iOS can't route back into a Home Screen web app afterwards, so the Fitness pages reload their data when they become visible again.
- The Plan tab gets a step-by-step Shortcut guide and the Cloudflare steps.

### 2.12 Reminders (PR 5)

- Web Push goes to Home Screen web apps (iOS 16.4 and later).
- There are three reminders:
  - A morning "today's plan" at a set time.
  - An evening "10 minutes still counts" if today isn't active by a set time.
  - A "never miss twice" note the morning after a miss.
- VAPID keys come from the environment. Subscriptions are stored per user and device. An in-process timer that runs every minute sends whatever is due.

## 3. Architecture

### 3.1 Code layout

| Path | Contents |
|---|---|
| `src/lib/fitness/` | Client-safe pure TypeScript, each file with a colocated `*.test.ts`: `types.ts`, `dates.ts` (local-date math and program weeks), `program.ts` (phases, templates, strength sessions, run-walk levels), `scoring.ts`, `streak.ts`, `weekly.ts`, `trend.ts`, `tweak.ts` |
| `src/lib/server/fitness/` | `repo.ts` (all database access), `pin.ts` (hashing, verification, unlock tokens, throttle), `sync.ts` (payload validation and normalization) |
| `src/routes/fitness/` | A `+layout` with the Today / Progress / Plan segmented control and person chips; `+page` (Today), `progress/`, `plan/` and `setup/` |
| `src/routes/api/fitness/` | REST endpoints (§3.3) |
| `src/lib/server/schema.ts` and `drizzle/` | New tables (§3.2), with migrations generated by `drizzle-kit generate` |
| `src/lib/channels.ts` | A new `fitness` realtime channel |
| `src/routes/+layout.svelte` | A fifth nav item, "Fitness", with outline and filled icons like the others |
| `openapi.yaml` | New paths and schemas |

The engine in `src/lib/fitness/` imports nothing from `$lib/server` and does no I/O. Pages reach it through the server `load` functions and API routes.

### 3.2 Tables

Each PR adds only the tables it uses.

- **`fitness_profiles`** (PR 1)
  - `user_id`: primary key, references `users`
  - `start_date`: `YYYY-MM-DD`
  - `timezone`: IANA name; defaults to the `TZ` environment variable, else UTC
  - `height_cm`
  - `sex`: `male` or `female`; used only to suggest a body-fat target
  - `target_body_fat_pct`: suggested 15 for male, 22 for female
  - `pace_min_lb_week`: default 1.0
  - `pace_max_lb_week`: default 1.5
  - `floor_minutes`: default 10
  - `run_repeat_from`: nullable date; makes the next run run 1 of the current level
  - `pin_hash`: nullable; used from PR 3
  - `created_at`, `updated_at`
- **`fitness_days`** (PR 1), primary key (`user_id`, `date`)
  - `workout_done`, `move_done`, `floor_done`
  - `extras`: JSON array of `{ kind, minutes }`
  - `protein_hits`, `plant_hits`: 0–6
  - `drinks_ok`
  - `run_level`, `run_index`: snapshot when a run-walk is completed
  - `resolution`: `frozen`, `repaired` or null; `resolution_source`: `manual` or `auto`
  - `repaired_on`: date the repair was logged
  - `lapse_note`, `if_then`
  - `updated_at`
- **`fitness_pauses`** (PR 2): `id`, `user_id`, `start_date`, `end_date`, `reason`, `created_at`
- **`fitness_samples`** (PR 3)
  - `id`, `user_id`
  - `kind`: `weight`, `body_fat`, `lean_mass`, `waist`, `steps`, `dietary_energy`, `protein` or `workout`
  - `value`: minutes for workouts; `unit`
  - `date`: local date; `start_at`, `end_at`
  - `source`: `manual` or `health`; `source_key`
  - `meta`: JSON with kind, raw activity name, distance and energy for workouts
  - `created_at`
  - Unique on (`user_id`, `source`, `source_key`); indexed on (`user_id`, `kind`, `date`)
- **`fitness_unlocks`** (PR 3): `token_hash` (primary key), `user_id`, `expires_at`
- **`fitness_push_subscriptions`** (PR 5): `id`, `user_id`, `endpoint`, `keys` (JSON), `created_at`

### 3.3 API

All routes follow the existing conventions:
- cookie or bearer auth through the global hook;
- `apiError` bodies for 4xx responses;
- `broadcast('fitness')` after every write;
- documentation in `openapi.yaml`.

| Method and path | PR | Purpose |
|---|---|---|
| `GET /api/fitness/{userId}/today?date=` | 1 | Plan items, day state and weekly progress; streak from PR 2 |
| `PUT /api/fitness/{userId}/profile` | 1 | Create or update the profile |
| `PATCH /api/fitness/{userId}/days/{date}` | 1 | Check-offs, floor, extras, food taps and notes, for today and the previous 7 days only |
| `POST /api/fitness/{userId}/run/repeat` | 1 | Repeat the current run-walk level |
| `POST /api/fitness/{userId}/days/{date}/resolve` | 2 | `freeze`, `repair` or `clear`; window rules are enforced and a disallowed action returns 409 |
| `POST /api/fitness/{userId}/pauses`, `DELETE …/pauses/{id}` | 2 | Pause ranges |
| `POST` and `DELETE /api/fitness/{userId}/unlock` | 3 | Unlock with the PIN, or lock |
| `PUT /api/fitness/{userId}/pin` | 3 | Set or change the PIN |
| `GET` and `POST /api/fitness/{userId}/measurements`, `DELETE …/{id}` | 3 | Body measurements; requires an unlock cookie or a user-bound key |
| `POST /api/fitness/sync` | 4 | Health import; user-bound key only |
| `POST` and `DELETE /api/fitness/{userId}/push` | 5 | Push subscriptions |

### 3.4 Dates and time zones

- All day logic uses local calendar dates (`YYYY-MM-DD`) in the profile's time zone, converted with `Intl.DateTimeFormat`.
- Tests cover the 2026-11-01 daylight-saving change in America/Denver, plus week and year boundaries.

### 3.5 Screens

The screens follow Family Hub's Apple Reminders look and its theme tokens. They are designed for phones first, with the bottom tab bar, and also work on the kiosk.

- **Today**
  - **Header:** date; phase and week (for example "Week 3 · Build"); streak count; freezes left this week; weekly progress.
  - **Missed-day card** when a day needs resolving: Use a freeze, Repair or Pause, plus "What got in the way?" and the if-then prompt.
  - **Plan items** as Reminders-style rows, each with detail text: the Fitness+ session, the run-walk recipe with Apple Watch steps, or the walk minutes.
  - **Actions and logging:** the "I did 10 minutes" button, "Log an extra activity", and the food habits as tap counters.
  - **Weigh-in row**, PIN-locked, from PR 3.
  - **Earlier days:** day arrows go back up to 7 days for late logging.
- **Progress**
  - Weekly range bars and weeks won.
  - A calendar heatmap showing full, floor, frozen, repaired, paused and missed days, with comeback marks.
  - Best streak and consistency.
  - A PIN-locked body section: weight and body-fat trend charts, lean vs fat mass, waist, projected date and the Sunday tweak.
- **Plan**
  - The phase table and weekly template, run-walk levels, strength cues, food habits, the desk routine and the streak rules.
  - The Health sync guide (PR 4) and sources.
  - Settings: start date, time zone, height, targets, floor minutes and PIN.
- **Setup** appears the first time someone opens Fitness without a profile. It asks for:
  - start date (defaults to the next Monday);
  - height;
  - sex, used for the body-fat suggestion;
  - target body fat;
  - a PIN (from PR 3).

## 4. Testing

**Unit tests** (Vitest, written before the code):
- `dates`: program week, Monday weeks, daylight saving, year boundary.
- `program`: phase by week, template by weekday, strength session numbering, next run-walk run, repeat level.
- `scoring`: every status, matching imported workouts, extras, floor minutes.
- `streak`:
  - active, held and missed days;
  - two freezes per week;
  - manual freeze vs automatic freeze when the window closes;
  - repair inside and after the two-day window;
  - pause ranges;
  - today pending;
  - comeback marks, best streak and consistency.
- `weekly`: ranges by phase, won and held weeks, week-won streak.
- `trend`: moving average, choice of daily value, slope, projection, too little data.
- `tweak`: the thresholds.
- `pin`: hashing and verification, token expiry, throttling.
- `sync`: validation, unit conversion, activity mapping, idempotency keys.

**Repository tests** (Vitest with a temporary SQLite file): upserts and the 7-day editing limit.

**End-to-end tests** (Playwright):
- set up a profile;
- check off today;
- log the floor;
- freeze a missed day;
- confirm the PIN hides and reveals body numbers;
- sync with a user-bound key.

**Gates:** every commit runs `pnpm check` and `pnpm test`. Opening or updating a PR also runs `pnpm test:e2e`.

## 5. Delivery

This spec covers all five PRs. Each PR gets its own implementation plan, written just before work on it starts, so later plans can use what earlier PRs taught us.

| PR | Scope | Done when |
|---|---|---|
| 1 | Profiles, days, program, scoring, extras, food habits; Today, Plan and Setup screens; Fitness tab; realtime channel; API; OpenAPI | A user can see each day's plan, check items off, log the floor and extras, and edit the previous 7 days |
| 2 | Streak, freezes, repair, pause, comeback marks, weekly ranges, calendar, consistency | The missed-day card works end to end, and Progress shows streaks, weeks won and the calendar |
| 3 | Measurements, PIN, trends, projection, waist, Sunday tweak | Body numbers stay hidden until the PIN is entered, and trend charts render from manual entries |
| 4 | Health sync endpoint, auto-completion, Shortcut and Cloudflare guide | The Shortcut backfills 7 days without duplicates, and imported workouts check off plan items |
| 5 | Web Push reminders | Morning and evening reminders arrive on the iPhone Home Screen app |

## 6. Risks and open questions

- **Health sync:**
  - Shortcuts can't read workouts, and can't read anything while the phone is locked, so the workout path (Watch start/end automations) has to be proven on a real phone in PR 4.
  - Dietary energy and protein still need confirming in the Shortcuts type picker.
  - Manual sync and manual entry work regardless.
- **Body fat in Health:** scale apps' Health writes are reported as unreliable at times (late starts, body fat differing from the app by a few points), and lean mass usually isn't written. Lean mass is derived, and manual entry covers gaps.
- **Food totals:** estimates from photo-logging apps undercount, so imported calories are shown as rough and never drive a decision. Only protein counts toward a habit.
- **PIN strength:** the PIN is a privacy screen, not strong security (§2.10).

## 7. Evidence behind the rules

| Rule | Source |
|---|---|
| At least 2 strength days a week; end sets about 2–3 reps short of failure; home training works | ACSM resistance training position stand, 2026 — doi:10.1249/MSS.0000000000003897 |
| Light loads taken near failure build muscle comparably to heavy loads | Lopez et al. 2021 — doi:10.1249/MSS.0000000000002585 |
| Run-walk structure | NHS Couch to 5K plan |
| Careful first running week at higher body weight | Nielsen et al. 2014 — PMC4060311 |
| Single runs more than 10% longer than the recent longest raise injury risk | Frandsen et al. 2025 — doi:10.1136/bjsports-2024-109380 |
| Protein about 1.6 g/kg/day, about 0.4 g/kg per meal | Morton et al. 2018 — PMID 28698222; Schoenfeld & Aragon 2018 — PMID 29497353 |
| Daily weighing supports weight loss | Steinberg et al. 2013 — PMID 23512320 |
| Consumer scales misread body fat and understate change | Siedler et al. 2023 — PMID 36404739 |
| Missing one day doesn't hurt habit formation | Lally et al. 2010 — doi:10.1002/ejsp.674 |
| Goals with two emergency skips beat fixed goals; skips work when applied after a miss | Sharif & Shu 2017 — doi:10.1509/jmr.15.0231; Sharif & Shu 2021 — doi:10.1016/j.obhdp.2019.01.004 |
| Repairable streaks keep people engaged | Silverman & Barasch 2023 — doi:10.1093/jcr/ucac029 |
| Rewarding the return after a missed workout increases visits | Milkman et al. 2021 — doi:10.1038/s41586-021-04128-4 |
| Range goals help people re-engage | Scott & Nowlis 2013 — doi:10.1086/670766 |
| Training breaks don't erase strength or size gains | Ogasawara et al. 2013 — doi:10.1007/s00421-012-2511-9 |
