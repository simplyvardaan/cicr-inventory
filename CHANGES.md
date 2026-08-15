# CICR VAULT — Recent Changes

This document summarizes the most recent commits on `main` in [`simplyvardaan/cicr-inventory`](https://github.com/simplyvardaan/cicr-inventory), from oldest to newest.

---

## 1. Backend schema & test hardening
**`c06c929` — fix(backend): database schema alignment, auth unit tests, and integration test suite**

- Aligned the `borrow.controller.ts` logic with the actual database schema.
- Added `backend/test/auth.middleware.test.cjs` (unit tests for the auth middleware).
- Expanded `backend/test/api.integration.test.cjs` with a much larger integration suite (325 new lines).
- Added `backend/OBJECTIVE.md` documenting backend goals/scope.
- Minor `tsconfig.json` and `.gitignore` cleanup.

## 2. Due-date tracking & email receipts
**`0fa3390` — feat(backend): implement due date tracking, email receipts, and full test suite verification**

- New migration `001_add_due_date_to_borrow_records.sql` adds a `due_date` column to borrow records.
- `borrow.controller.ts` now sets/validates due dates on checkout.
- New `emailService.ts` sends email receipts on borrow/return actions.
- `.env.example` updated with the new email/SMTP config keys.
- Integration tests extended to cover the new due-date and email flows.

## 3. Back-of-the-Envelope (BOTE) capacity estimation — docs
**`1c59d31` — docs(bote): add Back-of-the-Envelope estimation and system capacity analysis for email pipeline**

- New `docs/BOTE_ESTIMATION.md`: a capacity-planning writeup covering expected load on the email pipeline (borrow/return/reminder emails), storage growth, and scaling assumptions.
- `README.md` significantly expanded/restructured (500+ line diff) to reference this analysis and document project maturity.

## 4. BOTE capacity analytics API
**`2eb6618` — feat(system): add live BOTE capacity analytics API and metrics calculation engine**

- New `boteService.ts`: calculation engine that turns live counts (borrows/returns today, active borrows, items due today, total users, inventory quantities) into capacity/load metrics.
- New `system.controller.ts` exposing:
  - `GET /api/system/bote-metrics` — live snapshot of today's usage, active borrows, and inventory load.
  - `GET /api/system/simulate-scale` — projects metrics under simulated higher load.
- Registered under a new `system.routes.ts`, wired into `server.ts`.
- `backend/test/bote.test.cjs` added to cover the new service and endpoints.

**`8658428`** merges the BOTE work (PR #4, branch `kush-backend`) into `main`, alongside a small `README.md` version-history update (`5a0f3a5`).

## 5. Frontend overhaul: request/approval workflow, themes, mobile nav
**`72fc59a` — UPDATES**

A large frontend pass (~2,500 line diff across `index.html`, `src/main.ts`, `src/style.css`, `src/types.ts`):

- **Request/approval flow**: non-admin users now *request* to borrow an item instead of borrowing directly. New `RequestRecord` type (`PENDING` / `APPROVED` / `REJECTED`) with fields for requester, quantity, purpose, timestamps, and reviewer notes. Admins see a pending-requests queue and can approve/reject.
- **New activity log types**: `request`, `approve`, `reject` added alongside the existing `system` / `borrow` / `return` / `add`.
- **Theme switcher**: dark / light / pink themes, persisted to `localStorage` (`cicr_theme`) and applied on load before first render to avoid a flash of the wrong theme.
- **Mobile sidebar navigation**: collapsible sidebar with a toggle button and backdrop for small screens.
- Large accompanying `style.css` rewrite (1,600+ lines) to support the new themes and mobile layout.
- Removed a couple of small unused bits (a stale role-label update and an unused borrow icon).

## 6. Due-date reminder scheduler
**`3f07b95` — Add due-date reminder scheduler and email**

- New `reminderScheduler.ts`: periodically sweeps active borrow records and triggers reminder emails before/when items are due; configurable via env vars, with an in-memory "already sent" stamp to avoid duplicate sends.
- `emailService.ts` gains `sendDueReminder`, with mock/no-SMTP fallback behavior for local dev.
- New migration `002_add_reminder_sent_at_to_borrow_records.sql` adds a `reminder_sent_at` column (+ index).
- Scheduler is started from `server.ts`; new `.env.example` keys for `REMINDERS_ENABLED` / `SMTP_*`.
- New `backend/test/reminder.test.cjs` covering the scheduler.
- Small cleanup in `src/main.ts` (removed an unused role-label update and unused borrow icon).

**`5aa4745`** merges this reminder work into `main` (PR #5, branch `deployment-failure`).

## 7. Version 2.5 Release & UI Refinements (Tag: `v2.5`)
- Added 6 high-tech visual themes: **Cyber Neon**, **Matrix Green**, **Midnight Blue**, **Clean Light**, **Cherry Blossom**, and **Avengers Assemble**.
- Integrated interactive 2D front gridlines (`z-index: 10`, `pointer-events: none`) with dynamic cursor spotlight tracking.
- Upgraded Avengers theme with luminous Stark Arc Reactor and Captain America Shield with bold black ring and star borders.

## 8. Version 2.5 Patches
- **Out of Stock Stat Calculation**: Dynamic counter for components with 0 available quantity (`item.quantity - borrowedSum <= 0`).
- **Status Color-Coded Activity Notifications**: Standardized color indicators for BORROW (Blue), RETURNED (Green), OVERDUE (Red), LOW STOCK (Yellow), ADD/NEW (Purple), and SYSTEM (Neutral Grey).
- **Realistic Theme Backgrounds**: Cinematic scenic wallpapers for Cherry Blossom (Japanese garden park), Cyber Neon (wireframe skyline), Matrix Green (dark data mainframe), Midnight Blue (deep space cosmos), and Clean Light (minimal architectural studio).

---

## Net effect

Together, these changes move CICR VAULT from a direct "borrow now" model to a **request → admin-approval → borrow** workflow, add **automated due-date reminder emails**, introduce **live capacity/scale analytics** for the backend, provide **6 immersive realistic themes with interactive front gridlines**, dynamic **Out of Stock metrics**, and status-colored transaction logs, backed by a substantially expanded backend test suite.

### Suggested next steps if you're picking this up
- Run the new migrations (`001_add_due_date_to_borrow_records.sql`, `002_add_reminder_sent_at_to_borrow_records.sql`) against your database.
- Set `REMINDERS_ENABLED` and `SMTP_*` in your `.env` to enable real reminder emails (otherwise they run in mock mode).
- Review `docs/BOTE_ESTIMATION.md` if you're planning capacity/infra changes.
