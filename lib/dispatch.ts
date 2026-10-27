// 14.0: exchange with the dispatcher program (its API is not connected yet — see docs/dispatch-api.md).
//
// Outbound: every new or cancelled request is POSTed to DISPATCH_API_URL with a bearer token
// (DISPATCH_API_TOKEN). Until both secrets are set nothing is sent and requests simply wait for
// the dispatcher in the site admin panel.
// Inbound: the program reports decisions to POST /api/dispatch-webhook, signed with
// DISPATCH_WEBHOOK_SECRET exactly like the payment webhook (HMAC-SHA256 of "<timestamp>.<raw JSON>").

type DispatchEnv = { DB: D1Database; DISPATCH_API_URL?: string; DISPATCH_API_TOKEN?: string; DISPATCH_WEBHOOK_SECRET?: string };

const STATUSES = ['pending', 'needs_info', 'confirmed', 'awaiting_payment', 'paid', 'rejected', 'cancelled', 'completed'];
const text = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
const httpsUrl = (v: unknown) => { try { const u = new URL(String(v || '')); return u.protocol === 'https:' && !u.username && !u.password ? u.href.slice(0, 1000) : ''; } catch { return ''; } };
const phone = (v: unknown) => String(v ?? '').replace(/[^+0-9]/g, '').slice(0, 20);

/** The request as the dispatcher program receives it. */
export function dispatchPayload(kind: string, code: string, owner: string, d: any) {
  const base = { siteCode: code, kind, customer: { id: owner, name: d.name || '', phone: d.phone || '' }, date: d.date || '', time: d.time || '', hotel: d.hotel || '', address: d.address || '', note: d.note || '', createdAt: new Date().toISOString() };
  return kind === 'bookings'
    ? { ...base, tour: { id: d.tour || '', title: d.tourTitle || '' }, format: d.format || '', city: d.city || '', adults: Number(d.adults) || 0, kids: Number(d.kids) || 0, total: d.total ?? null }
    : { ...base, direction: d.direction || '', terminal: d.terminalId || '', city: d.cityId || '', route: d.route || '', flight: d.flight || '', class: d.clsId || '', pax: Number(d.pax) || 0, passengerNames: Array.isArray(d.passengerNames)?d.passengerNames:[], childSeat: !!d.seat };
}

/** Sends one event to the dispatcher program. Returns the program's answer or null. Never throws. */
export async function sendToDispatcher(env: DispatchEnv, event: 'created' | 'cancelled', payload: any) {
  if (!env.DISPATCH_API_URL || !env.DISPATCH_API_TOKEN) return null;
  try {
    const response = await fetch(env.DISPATCH_API_URL, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.DISPATCH_API_TOKEN }, body: JSON.stringify({ event, request: payload }) });
    if (!response.ok) return { error: 'HTTP ' + response.status };
    const data: any = await response.json().catch(() => ({}));
    return { number: text(data.number, 60), status: STATUSES.includes(data.status) ? data.status : '' };
  } catch (error: any) {
    return { error: error?.name === 'TimeoutError' ? 'timeout' : 'network' };
  }
}

/** Cleans what the program sends about a request; anything unknown is dropped. */
export function normalizeDispatchUpdate(value: any) {
  const out: any = {};
  if (STATUSES.includes(value.status)) out.status = value.status;
  if (value.number !== undefined) out.dispatchNumber = text(value.number, 60);
  if (value.rejectionReason !== undefined) out.rejectionReason = text(value.rejectionReason, 500);
  if (value.pickupTime !== undefined) out.pickupTime = text(value.pickupTime, 40);
  if (value.pickupPoint !== undefined) out.pickupPoint = text(value.pickupPoint, 300);
  const person = (p: any) => p && typeof p === 'object' && text(p.name, 120) ? { name: text(p.name, 120), photo: httpsUrl(p.photo), phone: phone(p.phone), whatsapp: phone(p.whatsapp), languages: text(p.languages, 120) } : null;
  if (value.guide !== undefined) out.assignedGuide = person(value.guide);
  if (value.vehicle !== undefined) {
    const v = value.vehicle;
    out.assignedVehicle = v && typeof v === 'object' && text(v.title || v.model, 150) ? { title: text(v.title || v.model, 150), color: text(v.color, 60), registration: text(v.registration, 20), photo: httpsUrl(v.photo), driver: person(v.driver), assignedAt: new Date().toISOString() } : null;
  }
  if (value.payment !== undefined && value.payment && typeof value.payment === 'object') {
    const p = value.payment, amount = Number(p.amount), expires = Date.parse(p.expiresAt), qrUrl = httpsUrl(p.qrUrl), paymentUrl = httpsUrl(p.paymentUrl);
    if (text(p.id, 100) && Number.isFinite(amount) && amount > 0 && amount <= 10000000 && Number.isFinite(expires) && (qrUrl || paymentUrl))
      out.payment = { id: text(p.id, 100), amount: Math.round(amount * 100) / 100, currency: 'RUB', qrUrl, paymentUrl, expiresAt: new Date(expires).toISOString() };
  }
  return out;
}

/** Verifies the webhook signature; returns the parsed event or an error response body. */
export async function verifyDispatchWebhook(request: Request, env: DispatchEnv): Promise<{ event?: any; error?: string; status?: number }> {
  if (!env.DISPATCH_WEBHOOK_SECRET) return { error: 'Диспетчерский сервер ещё не подключён', status: 503 };
  const timestamp = request.headers.get('X-Apsua-Dispatch-Timestamp') || '', signature = request.headers.get('X-Apsua-Dispatch-Signature') || '';
  if (!/^\d{10,13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 300000 || !/^[a-f0-9]{64}$/i.test(signature)) return { error: 'Недопустимая подпись', status: 401 };
  const raw = await request.text();
  if (raw.length > 50000) return { error: 'Слишком большой запрос', status: 413 };
  const encoder = new TextEncoder(), key = await crypto.subtle.importKey('raw', encoder.encode(env.DISPATCH_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = Uint8Array.from(signature.match(/../g)!, h => parseInt(h, 16));
  if (!(await crypto.subtle.verify('HMAC', key, bytes, encoder.encode(timestamp + '.' + raw)))) return { error: 'Недопустимая подпись', status: 401 };
  try { return { event: JSON.parse(raw) }; } catch { return { error: 'Некорректный JSON', status: 400 }; }
}
