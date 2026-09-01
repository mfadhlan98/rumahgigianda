# Sistem Kwitansi — Dental Clinic Receipt System

A receipt and payment-record system built for a real dental clinic in West Sumatra,
Indonesia. It replaces a paper receipt book: the cashier issues a numbered receipt,
prints it, and every transaction stays searchable and auditable.

Runs entirely on the clinic's own computers. No internet required, no monthly fees,
no patient data leaving the building.

> **Status** — in production preparation for *Rumah Gigi Anda*, Sijunjung.
> Built end to end: backend, frontend, PDF engine, deployment scripts, and
> the operating manuals the clinic staff actually use.

[Baca dalam Bahasa Indonesia →](README.id.md)

---

## Why it exists

Small clinics in Indonesia still write receipts by hand. That means arithmetic
mistakes, duplicate numbers, receipts that fade or go missing, and no way to answer
"how much came in last Tuesday?" without leafing through a book.

The clinic needed something that a receptionist could learn in fifteen minutes,
that would keep working when the internet went down, and that would not put patient
records on someone else's server.

## Features

**Cashier workflow**
- Instant patient search by name, medical-record number, or phone
- Line items pulled from the clinic's own price list, or typed freely
- Cash / bank transfer / card, with a reference number required for non-cash
- Subtotal, discount, tax, total, change, and amount-in-words computed live

**Receipts**
- Unique numbers as `PREFIX/YYYYMM/NNNN`, sequence resets monthly
- Six paper sizes: A5 and A4 in landscape (the traditional Indonesian receipt shape) and portrait, plus 58 mm / 80 mm thermal
- What you preview is byte-for-byte what prints and what is archived
- Brand colours and logo taken from the clinic's own identity

**Records & reporting**
- Receipts are never deleted — a wrong one is *voided* with a reason, actor, and timestamp
- Search by number, patient, date range, payment method, status
- Revenue summary per period, breakdown by method and service category, CSV export

**Operations**
- Two roles: administrator and cashier, enforced server-side
- Every meaningful action written to an audit log
- Scheduled local backups, plus a guarded restore command
- Windows scripts for firewall, auto-start, and backup scheduling

---

## Engineering decisions worth a look

**Receipts are PDF/A-3b, not just PDF.** Archival-grade output with an sRGB output
intent, XMP metadata, and every glyph embedded — so a receipt opened in ten years
still renders identically. Because PDF/A forbids non-embedded fonts, the renderer
resolves a font chain (bundled Inter → clinic-supplied TTF → system font) and
disables archival mode rather than silently producing a non-compliant file.
See [`services/pdf.js`](backend/src/services/pdf.js) and [`services/fonts.js`](backend/src/services/fonts.js).

**Money is never trusted from the browser.** The client computes totals only to show
them; the server recomputes every figure from the line items before writing.
See [`controllers/receipts.controller.js`](backend/src/controllers/receipts.controller.js).

**Receipt numbers survive concurrent cashiers.** The sequence is derived inside a
transaction and guarded by a `UNIQUE(period, seq)` index; a collision is caught and
retried rather than papered over with a lock.

**Receipts can be verified without the system.** Each carries a QR code and a
truncated HMAC-SHA256 signature over its own key fields. A public endpoint confirms
authenticity and returns a deliberately minimal, name-masked payload — enough for a
patient or an auditor, not enough to leak a medical record.
See [`services/verification.js`](backend/src/services/verification.js).

**The frontend has no build step.** Plain ES modules, no bundler, no framework.
A clinic PC should not need Node tooling to serve a page, and a future maintainer
should be able to open a file and read it. The whole UI is ~3,000 lines.

**One database interface, two engines.** SQLite by default so the app runs with zero
setup; MySQL behind the same adapter for clinics that outgrow one machine. Switching
is one environment variable — no application code changes.
See [`db/`](backend/src/db/).

**Brand colours are computed, not hardcoded.** The clinic supplies two hex values
from its logo. Tints, rules, and zebra stripes are derived, and text colour on any
branded surface is chosen by WCAG contrast ratio — so a light brand colour flips the
text to dark instead of disappearing.
See [`utils/color.js`](backend/src/utils/color.js).

**Same-origin requests are always allowed.** The second clinic PC reaches the app at
`http://192.168.1.50:4000`, an address unknowable at build time. CORS compares the
request's own host rather than a preconfigured list, so LAN access works without
configuration while foreign origins still get nothing.

---

## Tech stack

| Layer | Choice | Why |
| ----- | ------ | --- |
| Runtime | Node.js ≥ 22.5 | `node:sqlite` built in — no native module to compile on a clinic PC |
| Backend | Express 4 | Small, boring, well understood |
| Database | SQLite (default) / MySQL | Zero-setup locally, scalable when needed |
| PDF | PDFKit + embedded Inter | PDF/A-3b, real text, OCR-readable |
| Frontend | Vanilla ES modules | No build step, no framework churn |
| Auth | JWT + scrypt | scrypt is in Node's standard library |

Eight runtime dependencies in total. No bundler, no ORM, no UI framework.

---

## Project structure

```
backend/
  src/
    config/       environment parsing and production guards
    controllers/  one file per resource
    db/           SQLite + MySQL adapters, schema, seed, backup, restore
    middleware/   auth, IP allowlist, error handling
    routes/       URL mapping
    services/     PDF, fonts, QR, settings, audit, verification
    utils/         validation, colour, currency-in-words, password
  test/           end-to-end functional suite
frontend/
  css/            single stylesheet, token-driven
  js/views/       one file per screen
skrip-windows/    firewall, auto-start, backup scheduling
docs/             full technical guide (Indonesian)
```

---

## Getting started

Requires Node.js 22.5 or newer.

```bash
cd backend
npm install
cp .env.example .env
npm start
```

Open <http://localhost:4000>. On first run the app creates an administrator account
and prints the credentials to the console. The service price list is intentionally
left empty — sample prices in a live clinic are a liability, not a convenience.

To see a printable receipt without issuing a real one:

```bash
npm run pratinjau -- a5land thermal80
```

---

## Testing

```bash
npm test
```

69 end-to-end checks against a running server: authentication, role boundaries,
input validation, money arithmetic, receipt numbering, PDF generation in all four
sizes (including embedded-font and PDF/A metadata assertions), logo upload, QR
verification, reporting, and CSV export.

The suite asserts exact totals, so it refuses to run against a non-empty database
and says so rather than failing halfway.

---

## Documentation

The clinic-facing manuals are written in Indonesian, since that is who reads them.

- [`docs/panduan-lengkap.md`](docs/panduan-lengkap.md) — full technical guide:
  configuration, LAN deployment for two PCs, MySQL migration, backup and restore,
  and the complete API reference.

---

## License

[MIT](LICENSE)

Built by Muhammad Fadhlan. The clinic's logo, brand colours, and business data are not part of
this repository.
