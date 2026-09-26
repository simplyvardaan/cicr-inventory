# Security Policy & Quality Standards

## 1. Supported Versions

Security patches and updates are actively maintained on the `main` branch and tagged releases:

| Version | Supported          | Security Maintenance Level |
| :------ | :----------------: | :------------------------- |
| 2.x     | :white_check_mark: | Active (Current production baseline) |
| < 2.0   | :x:                | End of Life (Unsupported) |

Only the latest release line (`2.x`) receives automated dependency patches, static analysis scanning, and vulnerability remediations.

---

## 2. Reporting a Vulnerability

**Do not open a public GitHub issue for suspected vulnerabilities or sensitive security findings.**

To report a vulnerability responsibly:
1. **GitHub Private Vulnerability Reporting (Recommended):** Submit an advisory via [GitHub Security Advisories](https://github.com/simplyvardaan/cicr-inventory/security/advisories/new).
2. **Private Direct Channel:** Contact repository maintainers directly with reproduction details and relevant log snippets.

### Report Requirements
- Clear summary of the suspected weakness and affected endpoint/component.
- Exact steps to reproduce in a local development environment (never against live production instances).
- Any proof of concept (PoC) must be redacted of actual secret keys, personal identifiers (PII), or live tokens.

Please allow **48 to 72 hours** for triage and initial confirmation before public disclosure.

---

## 3. Threat Model & Scope

### In-Scope Assets
- **Backend Service (`backend/`):** Express 4 + TypeScript REST API covering JWT authentication, user approval lifecycle, inventory allocation, hardware borrowing/returning workflows, and audit logging.
- **Frontend Client (`src/`, `index.html`):** Vite + Vanilla TypeScript client covering session token handling, modal workflows, admin portal event delegation, and role-based UI gating.
- **Data Stores & Access Layer:** Supabase PostgreSQL row-level boundaries, connection pools, and in-memory rate-limiting middleware.

### Out-of-Scope Assets
- Third-party infrastructure outages (Supabase, Neon, Render, Redis, Vercel).
- Denial-of-Service attacks requiring sustained volumetric flooding beyond application rate limiters.
- Social engineering, credential compromise outside system control, or physical attacks on client devices.

---

## 4. Security Architecture & Hardening Controls

The repository implements rigorous defense-in-depth controls across client and server tiers:

### A. Injection & XSS Mitigations
- **Universal HTML Escaping:** Dynamic strings interpolated into template literals are neutralized via `escapeHtml()` covering `&`, `<`, `>`, `"`, `'` (`&#39;`), and `` ` `` (`&#96;`).
- **DOM Insertion Safeguards:** User-controlled notifications in `ToastManager` use DOM `.textContent` rather than `innerHTML`.
- **Zero Inline Event Handlers:** Administrative operations and user tables utilize HTML5 `data-*` attributes (`data-action`, `data-user-id`, `data-request-id`, `data-log-id`) coupled with scoped DOM event delegation, eliminating `onclick="..."` string breakout vectors.

### B. Broken Access Control & Privilege Boundaries
- **Strict Role Claims:** Substring checks on user emails or usernames are strictly forbidden. Role verification exclusively inspects cryptographically signed backend JWT claims (`user.role === 'ADMIN'`).
- **Encapsulated Admin Logic:** Privileged administrative triggers (`window.admin*`) are removed from global `window` scope and sealed within class modules.
- **Protected Administrative Endpoints:** Administrative rosters (`/api/borrow/admins`) and audit logs require verified bearer tokens via `authenticateToken` and `requireAdmin` middleware.

### C. Content Security Policy (CSP) & Defense-in-Depth
- Strict `<meta http-equiv="Content-Security-Policy">` enforced on `index.html`:
  - `default-src 'self'`
  - `frame-ancestors 'none'` (anti-clickjacking)
  - `connect-src 'self' http://localhost:* ws://localhost:* https://*.onrender.com https://*.supabase.co https://*.neon.tech`
  - Restricts fonts and styles to authorized origins and bundles icons locally, eliminating unpinned third-party CDN scripts.

### D. Credential & State Hygiene
- Sensitive authentication payloads and passwords in DOM inputs are cleared from memory immediately upon submission.
- All secrets, API URLs, and administrative whitelists are supplied strictly through environment variables (`VITE_API_BASE`, `MASTER_ADMIN_EMAIL`, `BLOCKED_ADMIN_EMAILS`, `SUPER_ADMIN_EMAILS`).

---

## 5. Automated Security & Quality Scanners

- **GitHub CodeQL Analysis:** Configured in `.github/workflows/codeql.yml` running `security-extended` and `security-and-quality` queries on every push to `main` and pull requests.
- **Dependabot Dependency Auditing:** Configured in `.github/dependabot.yml` monitoring root and `/backend` npm ecosystems with weekly security scans.
- **Continuous Integration (CI):** Fully automated TypeScript compilation and regression test suite validation on `.github/workflows/ci.yml`.
