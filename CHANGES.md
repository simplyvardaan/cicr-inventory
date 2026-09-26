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

## 7. Version 2.8.0 — Zero-Latency 1-Click Actions, Hardware Request De-duplication, Locked Borrower Details & 54-Item Catalog

- **Instant 1-Click Approvals & Rejections**: Hardware and user authorizations now execute with zero perceived latency (0ms optimistic UI removal and badge decrement). Network checkout and rejection notifications sync seamlessly in the background.
- **Request Queue De-duplication**: Resolved duplicate cards on admin queue with content keying (`itemId__borrowerName__purpose__quantity`) across server and local caches, backed by an atomic button submission lock.
- **Autofilled & Locked Borrower Information**: Student issue request modal automatically fetches the authenticated student's name and roll number, locked as read-only.
- **Full 54-Item Hardware Catalog**: Expanded robotics inventory with full categorization, interactive stat filters, dynamic single-line title scaling, and 500-unit component creation ceiling.
- **Developer Showcase Overhaul**: Added verified LinkedIn & GitHub SVG icons, refined coordinator and mentor guidance credits.
- **Session & Infrastructure Hardening**: Resilient user session preservation across Render cold starts; removed prestart tsc to eliminate cloud OOM; dynamic backend failover.

## 8. Version 2.8.1 — Mobile & Desktop Responsive Overhaul, Touch Interaction Optimization & Notification Telemetry Fix

- **Mobile & Desktop Fully Responsive System**: Eliminated cramped 3-column mobile layout; cards now display in a spacious single column on mobile devices ($\le 640\text{px}$) with natural multi-line title wrapping, while preserving multi-column desktop grids.
- **Swipeable Horizontal Tag Selector**: Stacks search input and category filter pills on mobile/tablet viewports ($\le 1100\text{px}$) with frictionless horizontal touch scrolling (`-webkit-overflow-scrolling: touch;`).
- **Balanced 2x2 Stats Dashboard Grid**: Restructured the 4-in-a-line quick stats bar into a clean $2\times 2$ grid on mobile and tablet screens, ensuring labels and counters never overlap.
- **Adaptive Greeting & Digital Clock**: Dashboard greeting card gracefully collapses into a stacked layout on mobile with an integrated horizontal clock bar (date on left, digital time on right with border separator).
- **Touch & Interactivity Polish**: Enforced `touch-action: manipulation` across all buttons, cards, and pills to eliminate 300ms mobile tap delays; added tactile `:active` tap scale transitions; isolated mouse `:hover` effects using `@media (hover: hover) and (pointer: fine)`.
- **Notification & Telemetry Sync**: Exposed required admin request queues in `AdminManager`, synchronized badge counters across sidebar and drawer, and wired inline one-click drawer approvals/rejections with real-time refresh.

## 9. Version 2.9.0 — Hardware Return Dispatch, Dynamic Partial Return Stepper, Team Showcase Update & Test Email Routing Engine

- **Hardware Return Dispatch Workflow**: Re-engineered the return mechanism into an authenticated, request-driven lifecycle. Borrowers (and administrators) submit return requests specifying custom return quantities via `POST /api/borrow/return-request`.
- **Dynamic Quantity Stepper Modal**: Upgraded `#return-qty-modal` with interactive `[-]` and `[+]` steppers, direct `Return All` shortcut, borrower info card, and live preview badge (`Full Return` vs. `Partial Return (X units stay issued)`).
- **1-Click Card Loan Indicators**: Injected active loan pills directly onto catalog inventory cards (`You have X issued · Return`), giving borrowers immediate visibility and 1-click access to return their hardware.
- **Admin Verification & Stock Restoration**: Return requests land in the Admin Portal queue with distinctive `RETURN` tags. Upon admin approval, inventory `available_quantity` is restored, and loan records are updated (marked `RETURNED` on full return, or remaining units stay `BORROWED` on partial return).
- **Roster & Navigation Polish**: Maintained Gunjan Pal as Management Head / Mentor in the showcase; preserved the integrated navigation sidebar across all views including developers view with responsive hero layout.
- **Transactional Test Email Proxy**: Redirected all transactional emails (login alerts, borrow requests, returns, approvals) strictly to `vardaansaxena096@gmail.com` for safe testing, complete with branded test dispatch headers and mobile-responsive cyber templates.

## 10. Version 2.9.1 — Production Clean Transactional Email Headers

- **Clean Email Dispatch Headers**: Removed the debug `[CICR TEST DISPATCH]` banner header across all direct (`emailService.ts`) and BullMQ background-queued (`emailQueue.ts`) transactional email dispatches.
- **Polished Presentation**: Emails now render cleanly with authentic cyber templates, glowing badges, and crisp telemetry formatting without internal routing debug headers.

## 11. Version 2.10.0 — 7-Day Centralized Audit & Telemetry Log System

- **Centralized 7-Day Backend Retention & Purge Scheduler**: Added automated background retention service (`auditCleanupService.ts`) that runs on server startup and executes every 6 hours to safely prune audit logs older than 7 days (`NOW() - INTERVAL '7 days'`), with graceful shutdown integration in `server.ts`.
- **Database Composite Indexing & Purge Function**: Created migration `007_audit_logs_retention_index.sql` adding composite index `idx_audit_logs_timestamp_action` and stored function `purge_expired_audit_logs(days_to_keep)`.
- **Enforced 7-Day Querying & Activity Spectrum API**: Extended `GET /api/audit` (`dashboard.controller.ts`) to strictly enforce a 7-day ceiling (`timestamp >= NOW() - 7 days`), supporting day-level filtering (`day=YYYY-MM-DD`), category filtering, dynamic pagination (limit up to 1000), real-time 7-day day-by-day activity spectrum calculations (`dailyCounts`), and category distribution metrics (`categoryCounts`).
- **Client Audit Ingestion Endpoint**: Added `POST /api/audit` (`dashboard.routes.ts`) allowing frontend events (logins, item actions, exports, drawer interactions) to be persisted directly into PostgreSQL `audit_logs` via `DatabaseManager.addLog`, eliminating isolated local-only logs.
- **Manual Admin Retention Trigger**: Added `POST /api/audit/cleanup` with dedicated admin HUD button (`#admin-audit-cleanup-btn`) to trigger immediate server retention passes with live feedback.
- **Interactive 7-Day Activity Spectrum HUD**: Built a visual day-by-day spectrum bar card grid (`#admin-audit-spectrum`) displaying activity bars, relative density percentages, event counts, and 1-click day filtering (e.g. "Today", "Yesterday", "3d ago").
- **Aesthetic Cyberpunk Log Cards & Raw Telemetry Modal**: Log records display category-accented borders, action pills, borrower/item tags, relative timestamps, and a 1-click inspection modal (`#audit-detail-modal`) with syntax-styled JSON formatting and copy-to-clipboard.
- **CSV Audit Ledger Export**: Built client-side CSV export (`cicr_audit_ledger_7days_*.csv`) directly from the filtered 7-day audit logs in the Admin Portal.
- **System Telemetry Drawer Integration**: Updated the notification drawer's System section to stream backend 7-day audit records with live event counts.

## 12. Version 2.11.0 — Consolidated Multi-Component Return System ("Return Everything in 1 Go")

- **Consolidated Bulk Return Modal (`#bulk-return-modal`)**: Engineered a glassmorphic return manifest interface displaying all components currently issued to the authenticated student across multiple checkout dates, prefilled with maximum borrowed units.
- **Component-Level Interactive Steppers**: Each borrowed component features `[-]` and `[+]` steppers with live status indicators (`Full Return`, `Partial Return`, `Keep Issued`), alongside global 1-click batch shortcuts (`Return All at 100%`, `Reset`).
- **FIFO Backend Allocation Engine (`POST /api/borrow/bulk-return-request`)**: Added a bulk return dispatch endpoint in `borrow.routes.ts` and `hardwareRequestService.ts` that dynamically allocates return quantities across multiple active `borrow_records` using first-in-first-out scheduling (e.g. 2 units of X on Monday + 3 units of X on Wednesday; returning 4 units resolves Monday's loan completely and partials Wednesday's loan).
- **Multi-Point Return Triggers**: Injected a highlighted "Return in 1 Go" action banner in the Notification/Checkouts Drawer (`#logs-drawer`), an action button in the Component Detail modal (`#item-detail-modal`), and global window accessibility.
- **Instant Admin Portal Synchronization**: Submitted consolidated returns immediately populate the Admin Portal queue with itemized verification records, optimistic badge decrements, and comprehensive audit logs.

## 13. Version 2.12.0 — Multi-Theme Contrast Engine & Responsive Audit Hub

- **Streamlined Audit Hub (Photo 1 Update)**: Removed the 7-day activity spectrum HUD per design refinement request, simplifying the audit ledger view into a cleaner, focused layout with immediate ledger access.
- **Complete Multi-Theme Contrast Overhaul (Photo 2 Update)**: Redesigned the Admin Header Card, shield icon, and stat counter badges (`Hardware Requests`, `Account Approvals`, `Approved Members`, `Admins`, `System Logs`) to deliver crystal-clear text readability and high contrast across all three themes:
  - **Cyber Neon (Cyberpunk)**: Dark obsidian glass background, high-contrast white header title, crisp secondary description, and vivid neon numbers with glowing text shadows.
  - **Clean Light**: Porcelain glass cards with subtle borders, bold `#0f172a` headers, `#334155` descriptions, and soft pastel stat boxes with dark, ultra-legible labels (`#581c87`, `#881337`, `#064e3b`, `#0c4a6e`, `#78350f`).
  - **Cherry Blossom (Sakura)**: Rose-tinted translucent glass, deep plum `#4c0519` titles, `#881337` descriptions, and vibrant frosted pills with dark, high-contrast labels.
- **Responsive Time-Window Range Engine (Photo 3 Update)**: Engineered the audit range pills (`7 Days (All)`, `Last 3 Days`, `Today (24h)`) with:
  - **0ms Instant Client-Side Filtering**: Immediate in-memory re-rendering based on timestamp cutoffs when clicking any range pill, ensuring tactile, instantaneous UI feedback.
  - **Dynamic Category Count Recalculation**: Live re-computation of counts across all category pills (`ALL`, `AUTH`, `INVENTORY`, `HARDWARE`, `LOANS`, `SYSTEM`) based on the active time window.
  - **Seamless Backend Synchronization**: Parallel querying to `/api/audit?days=...` to ensure backend retention records and telemetry remain synchronized.
- **Universal Cross-Theme Element Polish**: Overhauled button and text contrast across all 3 themes for:
  - Hardware issue cards, member approval cards, and Approve/Reject buttons (`.btn-approve`, `.btn-reject`, `.btn-hw-approve`, `.btn-hw-reject`).
  - User Directory Table (`.admin-table-responsive`, table headers, rows, user cell names, registration dates, emails, and action buttons).
  - Bulk Return Manifest Modal (`#bulk-return-modal`, component item cards, stepper buttons, quantity inputs, summary box labels).
  - Notifications Drawer banner and theme selector controls.
- **Fluid Mobile & Desktop Responsiveness**: Implemented a responsive auto-fit grid for the Admin Control Center stats and touch-friendly full-width range pill segments on mobile devices (max-width: 640px and 440px).

## 13. v2.13.0 Release — Cyber Calendar, Active Loans Accuracy, Vault Restock & Showcase Polish
**`v2.13.0` — feat: cyber calendar picker, active loans filter precision, complete vault restock, and showcase UI polish**

- **Interactive Cyber Calendar Picker & Presets**: Integrated an aesthetic date picker modal with calendar icon, dynamic duration badge (`X Days Loan`), and quick presets (`+3 Days`, `+7 Days (Default)`, `+14 Days`, `+1 Month`) for issuing hardware components.
- **Stock Filter & Active Loans Precision**: Fixed `borrowedSum` and `matchesStock` so returned hardware records (`r.returned === true` or `r.status === 'RETURNED'`) are strictly excluded from the "Active Loans" stock filter. Components with full stock availability (e.g. 1/1, 6/6, 4/4) no longer leak into active loans view.
- **Complete Inventory Return & Restock**: Ran automated return sync across Supabase PostgreSQL to restock all hardware units (all 173 components in vault with 100% stock available).
- **Developer Showcase Layout Perfection**: Locked developer social links to 1 horizontal row across all screen sizes; unified hero card length, height, and width across all member profiles; made carousel chevron buttons fully responsive, touch-optimized, and visible without viewport clipping.
- **Security Hardening**: Purged one-off scripts with hardcoded credentials from git history and repository.

## 14. v2.14.6 Release — Cybersecurity Audit Remediation & Defense-in-Depth Hardening
**`v2.14.6` — security: harden access controls, remediate XSS, de-hardcode secrets, and enforce CSP**

Comprehensive remediation across 8 vulnerability findings identified in the cybersecurity audit:

1. **Stored & DOM XSS Remediation**:
   - Deployed universal `escapeHtml` neutralizing `&`, `<`, `>`, `"`, `'` (`&#39;`), and `` ` `` (`&#96;`) across all dynamic template strings (approval cards, user tables, hardware queues, audit stream).
   - Replaced innerHTML interpolation in `ToastManager` notifications with DOM `.textContent`.
2. **Attribute Breakout Elimination in Event Handlers**:
   - Replaced all inline `onclick` string interpolations with HTML5 `data-*` attributes (`data-action`, `data-user-id`, `data-request-id`, `data-log-id`).
   - Bound actions via scoped DOM event delegation on `#admin-pending-list`, `#admin-users-tbody`, `#admin-hardware-list`, and `#admin-audit-stream`.
   - Updated `AdminManager.escapeHtml` to delegate to universal 6-character escaping.
3. **Privilege Escalation Eradication**:
   - Completely removed insecure substring matching on names, emails, and usernames from `ModalManager.getCurrentRole()` and `isDesignatedAdmin()`.
   - Role evaluation now strictly verifies cryptographically authenticated backend JWT role claims (`user.role === 'ADMIN'`).
4. **Elimination of Global `window.admin*` Exposure**:
   - Removed all privileged admin triggers from global window namespace (`window.adminApprove`, `window.adminReject`, `window.adminSetRole`, `window.adminDeleteUser`, `window.adminApproveHardware`, `window.adminRejectHardware`, `window.openAuditDetail`).
   - Actions are strictly scoped to authenticated DOM listeners within the administrative portal.
5. **DOM Credential Hygiene**:
   - Ensured plaintext password values in `PasswordResetManager` are wiped from DOM inputs and local memory variables immediately upon submission.
6. **Complete De-Hardcoding of Secrets & Personal Identifiers**:
   - Eliminated hardcoded emails (`mahakkatahara.mk@gmail.com`, `992501210090@mail.jiit.ac.in`), usernames, and hardcoded localhost/render URLs.
   - Refactored backend and frontend to consume environment configuration: `VITE_API_BASE`, `MASTER_ADMIN_EMAIL`, `BLOCKED_ADMIN_EMAILS`, `SUPER_ADMIN_EMAILS`, and `DEFAULT_ADMIN_NAME`.
   - Removed mock fallback user arrays (`masterDefaults`, `defaultMembers`) from `loadUsers`.
7. **Supply Chain & CDN Integrity**:
   - Removed unpinned `<script src="https://unpkg.com/lucide@latest"></script>` without Subresource Integrity (SRI) from `index.html`. Lucide icons are bundled locally via npm.
8. **Strict Content Security Policy (CSP)**:
   - Configured `<meta http-equiv="Content-Security-Policy">` in `index.html` enforcing `default-src 'self'`, `frame-ancestors 'none'` (anti-clickjacking), and restrictive `connect-src` allowing only authorized Supabase, Render, Neon, and local endpoints.
9. **Test Artifact & State Purge**:
   - Purged all 58 mock accounts and 30 test audit logs with `.test` domains from Supabase database.
   - Reset `backend/user_approval_data.json` and reset `backend/hardware_requests_data.json` to clean baseline state.
   - Restored temporary test borrow record on `RUN CAM` and verified inventory stock restoration.

---

## Net effect

Together, these changes move CICR VAULT from a direct "borrow now" model to a **request → admin-approval → borrow** workflow, add **automated due-date reminder emails**, introduce **live capacity/scale analytics** for the backend, provide a **hardened defense-in-depth security perimeter**, and give the frontend a **theme switcher and mobile-friendly navigation**, backed by a substantially expanded backend test suite.

### Suggested next steps if you're picking this up
- Run the new migrations (`001_add_due_date_to_borrow_records.sql`, `002_add_reminder_sent_at_to_borrow_records.sql`) against your database.
- Set `REMINDERS_ENABLED` and `SMTP_*` in your `.env` to enable real reminder emails (otherwise they run in mock mode).
- Review `docs/BOTE_ESTIMATION.md` if you're planning capacity/infra changes.
- Review `SECURITY.md` for vulnerability reporting guidelines and defense-in-depth controls.
