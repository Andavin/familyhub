# FamilyHub

Self-hosted family chores, calendar, and grocery list.
SvelteKit + SQLite (Drizzle) + Tailwind v4. Built to look like Apple Reminders / Apple Calendar.

## Features

- **Multi-column task board** – one column per family member plus a shared "Family" list. Side-scrolls when the kiosk runs out of width. Tap circle to complete (with strikethrough animation).
- **Checklists** – first-class. Define a checklist (e.g. "Pre-Trip", "Saturday Reset") with per-row assignees; one tap fans out N tasks across the right columns.
- **Recurring tasks** – RRULE-backed; completing a recurring task auto-spawns the next occurrence (Apple Reminders semantics).
- **Calendar** – month grid + day detail. Reminders (tasks with due dates) overlay onto the grid alongside subscribed iCal feeds (read-only public URLs).
- **Grocery list** – Apple-Reminders-Groceries style: auto-categorization (Produce, Dairy & Eggs, Meat & Seafood, Bakery, Frozen, Pantry, Beverages, Snacks, Household, Personal Care).
- **PWA** – installable to iPhone home screen via Safari.
- **Single-password auth** – shared family cookie. Cookie lives 60 days.

## Local development

```bash
pnpm install
pnpm db:push
pnpm db:seed
FAMILY_PASSWORD=letmein pnpm dev
```

Visit http://localhost:5173 — log in with `letmein`.

## Tests

```bash
pnpm test            # vitest unit tests
pnpm test:e2e        # playwright e2e tests
```

## Production

```bash
docker compose up -d --build familyhub
```

The kiosk should point Fully Kiosk Browser tabs at:
- `http://<host>:3030/`           – tasks (multi-column board)
- `http://<host>:3030/calendar`   – calendar
- `http://<host>:3030/grocery`    – grocery
- `http://<host>:3030/checklists` – manage checklists

For the iPhone PWA: open `http://<host>:3030/grocery` in Safari → Share → Add to Home Screen.

## Schema

```
users        – name, color, emoji, displayOrder
lists        – name, color, ownerId (null = shared), kind (chores|grocery|general)
tasks        – listId, assigneeId, title, dueAt, rrule, flagged, completedAt
checklists   – name, emoji, items [{title, listId, offsetDays?}]
groceryItems – name, quantity, category, checkedAt
sessions     – id, expiresAt
```
