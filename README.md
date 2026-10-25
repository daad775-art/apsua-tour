# Апсуа Тур — тестовый сервер

Vinext/Cloudflare Worker with Sites-managed D1 and R2. Existing HTML design and browser UI are in `public/`; server routing retains the Sites Worker integration in `build/sites-worker.ts`.

- `lib/site-api.ts`: shared catalogue, owner-only changes, private requests, stories, moderation, ratings, comments and uploads.
- `lib/site-seed.json`: initial catalogue; inserted only if the hosted database is empty.
- `db/schema.ts`, `drizzle/`: schema and append-only migrations.
- `.openai/hosting.json`: site identity and bindings `DB`, `BUCKET`.
- Runtime secret `SITE_OWNER_EMAIL`: first authenticated owner account is bound to its stable Site user ID.

Visitors sign in through the Sites-owned ChatGPT sign-in flow. Requests appear in the admin panel; email/Telegram notifications and payments are not connected. Guest stories stay pending until a moderator publishes or rejects them; an author edit returns a published story to moderation. Excursion totals are recomputed on the server from the catalogue (`lib/tour-pricing.ts`). User data is persisted in D1; media in R2. Local browser records are not deleted and are not automatically published to the server. The current backup/export interface covers catalogue and settings; a later migration to another host also needs export of D1 records and R2 objects.

Build: `node <sites-plugin-root>/scripts/build-site.mjs`. Generate schema migrations with `npm run db:generate`. Publish through the Sites source helper, retaining the existing project identity.

### Request receipts and payment server integration

New browser requests POST `/api/list` with `kind: bookings | transfers` and an item `requestToken` (stable per attempted submission). The server assigns canonical `code`; its response `records[]` contains `code`, `requestToken`, `uid`, and `status`. Retries return the original stored request. The client requires that acknowledgement and never fabricates a successful receipt. Legacy requests with `code` remain supported.

Customer data and statuses are read from authenticated `GET /api/my-orders`. The open receipt is restored after reload using an account-bound session pointer. Private/pending means operator review; confirmed means approved, invoice pending; awaiting_payment requires a real invoice; paid means payment noted/in work; needs_info, rejected, cancelled, completed are separate outcomes. Existing manual admin payment marking remains available and is distinct from `payment.source: server`.

An operator can attach real invoice data through `/api/order-status`: `payment: {id, amount /* RUB */, qrUrl, paymentUrl, expiresAt /* ISO timestamp with timezone */}`. At least one HTTPS QR/link or an uploaded `/api/media/<uuid>` QR is required. The site does not generate bank invoices. For automatic invoices, connect the external server's authenticated approval/invoice API; provider endpoints and credentials have not been supplied.

Prepared callback: `POST /api/payment-webhook` is disabled (503) until runtime secret `PAYMENT_WEBHOOK_SECRET` is securely configured and shared with the payment server. Send raw JSON `{eventId, code, kind, paymentId, amount /* integer kopecks */, currency: "RUB", status: "paid"}`. Header `X-Apsua-Payment-Timestamp` is milliseconds since epoch within 5 minutes; `X-Apsua-Payment-Signature` is hex HMAC-SHA256 of `<timestamp>.<raw JSON>` with the shared secret. Server checks signature, invoice, amount and currency; repeats are idempotent. Payment arriving for rejected/cancelled requests requires operator review, not automatic acceptance. This adapter must be mapped to the actual payment provider's verified notification flow before production payments are enabled. No secret belongs in Git or browser code.
