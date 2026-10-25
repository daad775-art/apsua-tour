// Sign-in with Telegram (Telegram Login Widget, redirect mode).
// The widget sends the visitor to GET /api/telegram-auth?id=…&first_name=…&auth_date=…&hash=…
// The signature is checked with the bot token (secret TELEGRAM_BOT_TOKEN); a server session
// cookie is then issued. Telegram never shares the phone number here: the tourist types it in
// the request form. https://core.telegram.org/widgets/login#checking-authorization

type TelegramEnv = { DB: D1Database; TELEGRAM_BOT_TOKEN?: string; TELEGRAM_BOT_USERNAME?: string; TELEGRAM_WEBHOOK_SECRET?: string };

export const telegramCookie = '__Host-apsua_tg';
// Sliding session: every visit extends the login to SESSION_DAYS from the last activity, at most once a day,
// but never beyond SESSION_MAX_DAYS after the actual Telegram sign-in. The token itself is never extended forever.
const SESSION_DAYS = 30, SESSION_MAX_DAYS = 90, SESSION_RENEW_AFTER = 86400000, MAX_AUTH_AGE = 86400;
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2, '0')).join('');
const sha256 = async (text: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));

export function telegramConfig(env: TelegramEnv) {
  const bot = String(env.TELEGRAM_BOT_USERNAME || 'ApsuaturBot').replace(/^@/, '');
  const clientId = String(env.TELEGRAM_BOT_TOKEN || '').split(':')[0];
  return { enabled: /^[0-9]+$/.test(clientId) && /^[A-Za-z0-9_]{5,32}$/.test(bot), bot };
}

/** Verifies the widget's hash. Returns the Telegram user or null. */
export async function verifyTelegram(params: URLSearchParams, token: string, now = Date.now()) {
  const hash = params.get('hash') || '';
  if (!/^[a-f0-9]{64}$/.test(hash)) return null;
  const fields = [...params.entries()].filter(([k]) => k !== 'hash' && k !== 'return_to').sort(([a], [b]) => (a < b ? -1 : 1));
  const check = fields.map(([k, v]) => k + '=' + v).join('\n');
  const secret = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(check)));
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= expected.charCodeAt(i) ^ hash.charCodeAt(i);
  const authDate = Number(params.get('auth_date')), id = params.get('id') || '';
  if (diff || !/^\d{1,20}$/.test(id) || !Number.isFinite(authDate) || now / 1000 - authDate > MAX_AUTH_AGE || authDate - now / 1000 > 300) return null;
  const photo = params.get('photo_url') || '';
  return {
    id: 'tg:' + id,
    name: [params.get('first_name'), params.get('last_name')].filter(Boolean).join(' ').trim().slice(0, 100) || 'Путешественник',
    username: (params.get('username') || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 32),
    photo: /^https:\/\/t\.me\/i\/userpic\/[^\s"'<>]+$/.test(photo) ? photo.slice(0, 500) : '',
  };
}

/** GET /api/telegram-auth: checks the signature, creates the session and returns to the site. */
export async function telegramAuth(request: Request, env: TelegramEnv) {
  const url = new URL(request.url), back = (query: string, status = 302) => new Response(null, { status, headers: { Location: url.origin + '/' + query + '#/account', 'Cache-Control': 'no-store' } });
  if (!env.TELEGRAM_BOT_TOKEN) return back('?login=unavailable');
  const user = await verifyTelegram(url.searchParams, env.TELEGRAM_BOT_TOKEN);
  if (!user) return back('?login=failed');
  return issueTelegramSession(request, env, user);
}

async function issueTelegramSession(request: Request, env: TelegramEnv, user: { id: string; name: string; username: string; photo: string }) {
  const at = Date.now(), token = hex(crypto.getRandomValues(new Uint8Array(32)).buffer), expires = at + SESSION_DAYS * 86400000;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO records (id,kind,owner,body,status,created,updated) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=CASE WHEN COALESCE(json_extract(excluded.body,'$.photo'),'')='' AND COALESCE(json_extract(records.body,'$.photo'),'')<>'' THEN json_set(excluded.body,'$.photo',json_extract(records.body,'$.photo')) ELSE excluded.body END,updated=excluded.updated")
      // A sign-in through the bot carries no photo: keep the Telegram photo saved by an earlier sign-in.
      .bind('tg-identity:' + user.id, 'tg-identity', user.id, JSON.stringify({ username: user.username, photo: user.photo, name: user.name }), 'private', at, at),
    env.DB.prepare("INSERT OR IGNORE INTO records (id,kind,owner,body,status,created,updated) VALUES (?,?,?,?,?,?,?)")
      .bind('profile:' + user.id, 'profile', user.id, JSON.stringify({ name: user.name, city: '', about: '', avatar: '' }), 'private', at, at),
    env.DB.prepare("INSERT INTO records (id,kind,owner,body,status,created,updated) VALUES (?,?,?,?,?,?,?)")
      .bind('tg-session:' + (await sha256(token)), 'tg-session', user.id, JSON.stringify({ expires, created: at }), 'private', at, at),
    env.DB.prepare("DELETE FROM records WHERE kind='tg-session' AND CAST(json_extract(body,'$.expires') AS INTEGER)<?").bind(at),
  ]);
  const response = new Response(null, { status: 302, headers: { Location: new URL('/#/account', request.url).href, 'Cache-Control': 'no-store' } });
  response.headers.append('Set-Cookie', `${telegramCookie}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`);
  return response;
}

const tokenFromCookie = (request: Request) => request.headers.get('cookie')?.match(/(?:^|; )__Host-apsua_tg=([a-f0-9]{64})(?:;|$)/)?.[1] || '';

/** Resolves the signed-in Telegram user from the session cookie. */
export async function telegramIdentity(request: Request, env: TelegramEnv, renew = true) {
  const token = tokenFromCookie(request);
  if (!token) return null;
  const sid = 'tg-session:' + (await sha256(token));
  const row = await env.DB.prepare("SELECT owner,body,created FROM records WHERE id=? AND kind='tg-session'").bind(sid).first<any>();
  if (!row) return null;
  let data: any;
  try { data = JSON.parse(row.body); } catch { return null; }
  const now = Date.now(), created = Number(data.created) || Number(row.created) || now, hardLimit = created + SESSION_MAX_DAYS * 86400000;
  if (!(data.expires > now) || now >= hardLimit) return null;
  // Renew the idle window (and the cookie lifetime) when the last renewal is older than a day.
  let renewCookie = '';
  const target = Math.min(now + SESSION_DAYS * 86400000, hardLimit);
  if (renew && target - data.expires >= SESSION_RENEW_AFTER) {
    try {
      const updated = await env.DB.prepare("UPDATE records SET body=?,updated=? WHERE id=? AND kind='tg-session' AND body=?")
        .bind(JSON.stringify({ ...data, created, expires: target }), now, sid, row.body).run();
      if (updated?.meta?.changes) renewCookie = `${telegramCookie}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${Math.floor((target - now) / 1000)}`;
    } catch { /* a failed renewal must never sign the visitor out: the current session stays valid */ }
  }
  const identity = await env.DB.prepare("SELECT body FROM records WHERE id=? AND kind='tg-identity'").bind('tg-identity:' + row.owner).first<any>();
  const details = identity ? JSON.parse(identity.body) : {};
  return { id: String(row.owner), username: details.username || '', photo: details.photo || '', renewCookie };
}

/** POST /api/telegram-logout */
export async function telegramLogout(request: Request, env: TelegramEnv) {
  const token = tokenFromCookie(request);
  if (token) await env.DB.prepare("DELETE FROM records WHERE id=? AND kind='tg-session'").bind('tg-session:' + (await sha256(token))).run();
  const response = Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  response.headers.set('Set-Cookie', `${telegramCookie}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`);
  return response;
}

// Application login: the public deep link alone can never create a browser session.
// The original browser also needs its HttpOnly proof cookie and explicit final consent.
const loginCookie = '__Host-apsua_tg_login';
const loginTTL = 5 * 60000;
const randomHex = (size: number) => hex(crypto.getRandomValues(new Uint8Array(size)).buffer);
const loginJSON = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const loginProof = (request: Request) => request.headers.get('cookie')?.match(/(?:^|; )__Host-apsua_tg_login=([a-f0-9]{32}\.[a-f0-9]{64})(?:;|$)/)?.[1] || '';
async function ownedLogin(request: Request, env: TelegramEnv) {
  const [id, proof] = loginProof(request).split('.');
  if (!id || !proof) return null;
  const row = await env.DB.prepare("SELECT id,owner,body,status FROM records WHERE id=? AND kind='tg-login'").bind('tg-login:' + id).first<any>();
  if (!row) return null;
  const data = JSON.parse(row.body);
  if (data.proof !== await sha256(proof) || data.expires <= Date.now()) return null;
  return { ...row, data };
}
async function telegramBotCall(env: TelegramEnv, method: string, data: unknown) {
  const response = await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/' + method, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  const result: any = await response.json();
  if (!response.ok || !result.ok) throw new Error('Telegram temporarily unavailable');
  return result.result;
}

// Telegram can execute a Bot API method directly from the signed webhook response.
// Keep consent available even when the hosting runtime cannot reach api.telegram.org.
async function telegramWebhookReply(env: TelegramEnv, method: string, data: Record<string, unknown>) {
  try { await telegramBotCall(env, method, data); return null; }
  catch { return loginJSON({ method, ...data }); }
}

export async function telegramAppAPI(request: Request, env: TelegramEnv): Promise<Response> {
  const url = new URL(request.url), path = url.pathname;
  if (path.startsWith('/api/telegram-oidc/')) return telegramOIDC(request, env);
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) return loginJSON({ error: 'Вход через приложение пока недоступен' }, 503);
  if (path === '/api/telegram-bot-webhook') return telegramBotUpdate(request, env);
  if (request.method !== 'GET' && request.headers.get('origin') !== url.origin) return loginJSON({ error: 'Недопустимый источник запроса' }, 403);
  if (path === '/api/telegram-login/start' && request.method === 'POST') {
    const raw = await request.text();
    if (raw.length > 1000) return loginJSON({ error: 'Некорректный запрос' }, 400);
    let value: any; try { value = JSON.parse(raw || '{}'); } catch { return loginJSON({ error: 'Некорректный запрос' }, 400); }
    const mode = value?.mode === 'web' ? 'web' : 'legacy';
    // Repeated clicks reuse a challenge; bounded creation per IP limits public storage abuse.
    const old = await ownedLogin(request, env);
    if (old && (old.data.mode || 'legacy') === mode && ['pending', 'awaiting', 'approved'].includes(old.status)) return loginJSON(loginStartData(old.data, env));
    const at = Date.now(), id = randomHex(16), proof = randomHex(32), ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const owner = 'tg-login-ip:' + await sha256(ip);
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM records WHERE kind='tg-login' AND owner=? AND created>?").bind(owner, at - 60000).first<any>();
    if (count?.n >= 10) return loginJSON({ error: 'Слишком много попыток. Подождите минуту.' }, 429);
    const data = { id, mode, proof: await sha256(proof), expires: at + loginTTL, code: String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0'), origin: url.origin };
    await env.DB.batch([
      env.DB.prepare("DELETE FROM records WHERE kind='tg-login' AND created<?").bind(at - loginTTL),
      env.DB.prepare('INSERT INTO records (id,kind,owner,body,status,created,updated) VALUES (?,?,?,?,?,?,?)').bind('tg-login:' + id, 'tg-login', owner, JSON.stringify(data), 'pending', at, at),
    ]);
    const response = loginJSON(loginStartData(data, env));
    response.headers.set('Set-Cookie', `${loginCookie}=${id}.${proof}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=300`);
    return response;
  }
  const row = await ownedLogin(request, env);
  if (!row) return loginJSON({ error: 'Время входа истекло. Начните заново.' }, 410);
  if (path === '/api/telegram-login/status' && request.method === 'GET') return loginJSON({ status: row.status, ...(row.status === 'approved' ? { name: row.data.user.name } : {}) });
  if (path === '/api/telegram-login/finish' && request.method === 'POST') {
    if (row.status !== 'approved' || !row.data.user) return loginJSON({ error: 'Подтвердите вход в Telegram' }, 409);
    const changed = await env.DB.prepare("UPDATE records SET status='consumed',updated=? WHERE id=? AND status='approved'").bind(Date.now(), row.id).run();
    if (!changed.meta.changes) return loginJSON({ error: 'Этот вход уже использован' }, 409);
    // Fetch endpoints must not follow a redirect and lose Set-Cookie on the final response.
    const session = await issueTelegramSession(request, env, row.data.user);
    const response = loginJSON({ ok: true });
    response.headers.append('Set-Cookie', session.headers.get('Set-Cookie')!);
    response.headers.append('Set-Cookie', `${loginCookie}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`);
    return response;
  }
  return loginJSON({ error: 'Не найдено' }, 404);
}

// Official Telegram Login SDK: popup/app consent, with no bot-chat or phone/write scopes.
// Only signed ID tokens for this client and this browser's nonce can create a session.
type TelegramJWK = JsonWebKey & { kid?: string };
const oidcCookie = '__Host-apsua_tg_oidc';
// Public verification keys retrieved over HTTPS from Telegram on 2026-10-24.
// Live JWKS remains authoritative when reachable. This snapshot is used only for
// transport failures, never to accept an unknown key or skip signature validation.
const telegramPinnedJWKS: { keys: TelegramJWK[] } = {"keys":[{"alg":"RS256","e":"AQAB","ext":true,"key_ops":["verify"],"kty":"RSA","n":"5RneLtsKvVcxdv6gu6gxEQu30Cru5NiMQnY6SNr9ZyZFZ4ya-pfHNuaZXJ6QPG0JSFwoxeOkEO2-eZN_REVPm448PvjjsR1eQdZ5QpEkNxnItFcmxkHH91v5cgf52_EI9BGO-MT6f1vaBSg3uWHFlDxI7J2AYxNvd1_Nf3TkgrrR7gyJFTmEIai5RefGnA0KGNYDlRIGUzrz2F05n6gTaHFT_iHL5UHatTZA4GCiUSjIOuwqu5pE5uZge20TFv3cxXMQaFw_xv1pgQt_Rq8eoCN7TS0RQ0zjWKiad-W286BcFectXsUm03p5Nq_kY4mf_7rqwX_B8yy_bBreyKn7RQ","kid":"oidc-1"},{"alg":"ES256","kty":"EC","x":"ahVYrohhX6YA7w0P2gUNSwMFbaabCgBZFkeq9bWdmwU","y":"Ea8nKJ34VQMA7zv8aYDfzcBhXEjnWQ9C06jVke_eUV0","crv":"P-256","kid":"oidc-es256-1","use":"sig"}]};
let telegramJWKS: { at: number; keys: TelegramJWK[]; fallback?: boolean } | null = null;
function decodeJWTPart(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid token');
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}
async function telegramSigningKeys(refresh = false) {
  if (!refresh && telegramJWKS && Date.now() - telegramJWKS.at < (telegramJWKS.fallback ? 60000 : 300000)) return telegramJWKS.keys;
  let failure = 'network';
  try {
    const response = await fetch('https://oauth.telegram.org/.well-known/jwks.json', { headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(8000) });
    if (!response.ok) { failure = 'HTTP_' + response.status; throw new Error('JWKS unavailable'); }
    const raw = await response.text();
    failure = 'invalid_response';
    if (raw.length > 100000) throw new Error('Invalid keys');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.keys) || !data.keys.length) throw new Error('Invalid keys');
    telegramJWKS = { at: Date.now(), keys: data.keys };
  } catch {
    // Do not log tokens, claims, cookies, IPs, or raw provider/error response text.
    console.warn('telegram_jwks_fallback', { reason: failure });
    telegramJWKS = { at: Date.now(), keys: telegramPinnedJWKS.keys, fallback: true };
  }
  return telegramJWKS.keys;
}

export async function verifyTelegramIDToken(token: string, clientId: string, nonce: string) {
  let stage = 'format';
  const reject = (reason: string) => { console.warn('telegram_login_rejected', { reason }); return null; };
  try {
    if (token.length > 20000) return reject('format');
    const parts = token.split('.');
    if (parts.length !== 3) return reject('format');
    const header = JSON.parse(new TextDecoder().decode(decodeJWTPart(parts[0])));
    if (!['RS256', 'ES256'].includes(header.alg) || (header.kid !== undefined && typeof header.kid !== 'string')) return reject('algorithm');
    const compatible = (key: any) => (!key.alg || key.alg === header.alg) && (!key.use || key.use === 'sig') && (header.alg === 'RS256' ? key.kty === 'RSA' : key.kty === 'EC' && key.crv === 'P-256');
    const select = (keys: TelegramJWK[]) => { const found = keys.filter((key: any) => compatible(key) && (header.kid === undefined || key.kid === header.kid)); return found.length === 1 ? found[0] : null; };
    stage = 'keys';
    let jwk = select(await telegramSigningKeys());
    if (!jwk) jwk = select(await telegramSigningKeys(true));
    if (!jwk) return reject('key_not_found');
    stage = 'signature';
    const algorithm = header.alg === 'RS256' ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } : { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' };
    const key = await crypto.subtle.importKey('jwk', jwk, algorithm, false, ['verify']);
    if (!await crypto.subtle.verify(algorithm, key, decodeJWTPart(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]))) return reject('signature');
    stage = 'claims';
    const claims = JSON.parse(new TextDecoder().decode(decodeJWTPart(parts[1]))), now = Date.now() / 1000;
    if (claims.iss !== 'https://oauth.telegram.org') return reject('issuer');
    const audiences = Array.isArray(claims.aud) ? claims.aud.map(String) : [String(claims.aud)];
    if (!audiences.includes(clientId) || (audiences.length > 1 && String(claims.azp) !== clientId)) return reject('audience');
    if (claims.nonce !== nonce) return reject('nonce');
    if (typeof claims.sub !== 'string' || !/^[\x21-\x7e]{1,255}$/.test(claims.sub)) return reject('subject');
    if (!Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.iat) || claims.iat > now + 60 || claims.iat < now - 600) return reject('time');
    // OIDC sub is the required identity. The optional profile id may be a decimal
    // string; never assume sub is the numeric Bot API id or merge accounts by name.
    let telegramId = '';
    if (claims.id != null) {
      if (!['number', 'string'].includes(typeof claims.id) || !/^[1-9][0-9]{0,15}$/.test(String(claims.id)) || !Number.isSafeInteger(Number(claims.id))) return reject('profile_id');
      telegramId = String(claims.id);
    }
    const picture = String(claims.picture || '');
    const safePhoto = /^https:\/\/(?:cdn\d*\.telesco\.pe|t\.me|telegram\.org)\/[^\s"'<>]+$/.test(picture) ? picture.slice(0, 1000) : '';
    return { id: telegramId ? 'tg:' + telegramId : 'tg:oidc:' + await sha256(clientId + ':' + claims.sub), subject: claims.sub, name: String(claims.name || [claims.given_name, claims.family_name].filter(Boolean).join(' ') || 'Путешественник').slice(0, 100), username: String(claims.preferred_username || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 32), photo: safePhoto };
  } catch { return reject(stage); }
}
async function resolveTelegramSubject(env: TelegramEnv, clientId: string, user: { id: string; subject: string; name: string; username: string; photo: string }) {
  const at = Date.now(), key = 'tg-subject:' + await sha256(clientId + ':' + user.subject);
  // First verified sign-in fixes the mapping. Later profile/id representation changes
  // cannot create a second account or silently merge it with a different account.
  await env.DB.prepare('INSERT OR IGNORE INTO records (id,kind,owner,body,status,created,updated) VALUES (?,?,?,?,?,?,?)').bind(key, 'tg-subject', user.id, '{}', 'private', at, at).run();
  const saved = await env.DB.prepare("SELECT owner FROM records WHERE id=? AND kind='tg-subject'").bind(key).first<any>();
  return { ...user, id: saved.owner };
}

async function telegramOIDC(request: Request, env: TelegramEnv) {
  const url = new URL(request.url), config = telegramConfig(env), clientId = String(env.TELEGRAM_BOT_TOKEN || '').split(':')[0];
  if (!config.enabled) return loginJSON({ error: 'Вход через Telegram пока недоступен' }, 503);
  if (request.method !== 'POST') return loginJSON({ error: 'Method not allowed' }, 405);
  if (request.headers.get('origin') !== url.origin) return loginJSON({ error: 'Недопустимый источник запроса' }, 403);
  if (url.pathname === '/api/telegram-oidc/start') {
    // Focus, refresh and a second rendering must not replace the challenge while
    // Telegram is approving it in another window or application.
    const existing = request.headers.get('cookie')?.match(/(?:^|; )__Host-apsua_tg_oidc=([a-f0-9]{32})\.([a-f0-9]{64})(?:;|$)/);
    if (existing) {
      const pending = await env.DB.prepare("SELECT body,status FROM records WHERE id=? AND kind='tg-oidc'").bind('tg-oidc:' + existing[1]).first<any>();
      const old = pending ? JSON.parse(pending.body) : null;
      if (old && pending.status === 'pending' && old.expires > Date.now() && old.proof === await sha256(existing[2])) return loginJSON({ clientId, nonce: old.nonce, expires: old.expires });
    }
    const at = Date.now(), id = randomHex(16), proof = randomHex(32), nonce = randomHex(32);
    const owner = 'tg-oidc-ip:' + await sha256(request.headers.get('cf-connecting-ip') || 'unknown');
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM records WHERE kind='tg-oidc' AND owner=? AND created>?").bind(owner, at - 60000).first<any>();
    if (count?.n >= 10) return loginJSON({ error: 'Слишком много попыток. Подождите минуту.' }, 429);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM records WHERE kind='tg-oidc' AND created<?").bind(at - loginTTL),
      env.DB.prepare('INSERT INTO records (id,kind,owner,body,status,created,updated) VALUES (?,?,?,?,?,?,?)').bind('tg-oidc:' + id, 'tg-oidc', owner, JSON.stringify({ nonce, proof: await sha256(proof), expires: at + loginTTL }), 'pending', at, at),
    ]);
    const response = loginJSON({ clientId: clientId, nonce, expires: at + loginTTL });
    response.headers.set('Set-Cookie', `${oidcCookie}=${id}.${proof}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=300`);
    return response;
  }
  if (url.pathname !== '/api/telegram-oidc/finish') return loginJSON({ error: 'Не найдено' }, 404);
  const cookie = request.headers.get('cookie')?.match(/(?:^|; )__Host-apsua_tg_oidc=([a-f0-9]{32})\.([a-f0-9]{64})(?:;|$)/);
  if (!cookie) return loginJSON({ error: 'Начните вход заново' }, 410);
  const row = await env.DB.prepare("SELECT id,body,status FROM records WHERE id=? AND kind='tg-oidc'").bind('tg-oidc:' + cookie[1]).first<any>();
  const data = row ? JSON.parse(row.body) : null;
  if (!data || row.status !== 'pending' || data.expires <= Date.now() || data.proof !== await sha256(cookie[2])) return loginJSON({ error: 'Время входа истекло. Попробуйте снова.' }, 410);
  const raw = await request.text();
  if (raw.length > 22000) return loginJSON({ error: 'Некорректный ответ Telegram' }, 400);
  let value: any; try { value = JSON.parse(raw); } catch { return loginJSON({ error: 'Некорректный ответ Telegram' }, 400); }
  const user = typeof value.id_token === 'string' ? await verifyTelegramIDToken(value.id_token, clientId, data.nonce) : null;
  if (!user) return loginJSON({ error: 'Не удалось подтвердить вход через Telegram' }, 401);
  const changed = await env.DB.prepare("UPDATE records SET status='consumed',updated=? WHERE id=? AND status='pending'").bind(Date.now(), row.id).run();
  if (!changed.meta.changes) return loginJSON({ error: 'Вход уже завершён' }, 409);
  const session = await issueTelegramSession(request, env, await resolveTelegramSubject(env, clientId, user)), response = loginJSON({ ok: true });
  response.headers.append('Set-Cookie', session.headers.get('Set-Cookie')!);
  response.headers.append('Set-Cookie', `${oidcCookie}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`);
  return response;
}
function loginStartData(data: any, env: TelegramEnv) {
  const bot = telegramConfig(env).bot, deepLink = 'tg://resolve?domain=' + bot + '&start=login_' + data.id;
  return { url: 'https://t.me/' + bot + '?start=login_' + data.id, webUrl: 'https://web.telegram.org/k/#?tgaddr=' + encodeURIComponent(deepLink), mode: data.mode || 'legacy', ...(data.mode === 'web' ? {} : { code: data.code }), expires: data.expires };
}

async function telegramBotUpdate(request: Request, env: TelegramEnv) {
  if (request.method !== 'POST') return loginJSON({ error: 'Method not allowed' }, 405);
  const provided = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
  if (await sha256(provided) !== await sha256(env.TELEGRAM_WEBHOOK_SECRET!)) return loginJSON({ error: 'Unauthorized' }, 401);
  const raw = await request.text();
  if (raw.length > 64000) return loginJSON({ error: 'Too large' }, 413);
  let update: any; try { update = JSON.parse(raw); } catch { return loginJSON({ error: 'Invalid JSON' }, 400); }
  const callback = update.callback_query, message = callback?.message || update.message;
  const from = callback?.from || message?.from;
  if (!message || message.chat?.type !== 'private' || !from || from.is_bot || message.chat.id !== from.id || !Number.isSafeInteger(from.id) || from.id <= 0) return loginJSON({ ok: true });
  const start = !callback ? /^\/start(?:@[A-Za-z0-9_]+)? login_([a-f0-9]{32})$/.exec(message.text || '') : null;
  const action = /^login_(yes|no)_([a-f0-9]{32})$/.exec(callback?.data || '');
  const id = start?.[1] || action?.[2];
  if (!id) return loginJSON({ ok: true });
  const row = await env.DB.prepare("SELECT id,body,status FROM records WHERE id=? AND kind='tg-login'").bind('tg-login:' + id).first<any>();
  const data = row ? JSON.parse(row.body) : null;
  const active = data && data.expires > Date.now();
  if (start && active && ['pending', 'awaiting'].includes(row.status)) {
    if (data.user && data.user.id !== 'tg:' + from.id) return loginJSON({ ok: true });
    data.user = { id: 'tg:' + from.id, name: [from.first_name, from.last_name].filter(Boolean).join(' ').trim().slice(0, 100) || 'Путешественник', username: String(from.username || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 32), photo: '' };
    // Bind the first Telegram account; concurrent other accounts cannot replace it.
    const changed = await env.DB.prepare("UPDATE records SET body=?,status='awaiting',updated=? WHERE id=? AND body=? AND status=?").bind(JSON.stringify(data), Date.now(), row.id, row.body, row.status).run();
    if (!changed.meta.changes) return loginJSON({ ok: true });
    const reply = await telegramWebhookReply(env, 'sendMessage', { chat_id: from.id, text: data.mode === 'web' ? `Вход в «Апсуа Тур»\n${new URL(data.origin).hostname}\n\nНажмите «Авторизоваться», только если сами начали вход на сайте. Не подтверждайте чужие запросы. Телефон и SMS для этого входа не нужны.` : `Вход в «Апсуа Тур»\nСайт: ${new URL(data.origin).hostname}\nКод на сайте: ${data.code}\n\nПодтвердите, только если сами нажали кнопку входа на сайте и код совпадает. Чужие ссылки не подтверждайте. Номер телефона и код из SMS не нужны.`, reply_markup: { inline_keyboard: [[{ text: data.mode === 'web' ? 'Авторизоваться' : 'Подтвердить вход', callback_data: 'login_yes_' + id }], [{ text: 'Отклонить', callback_data: 'login_no_' + id }]] } });
    if (reply) return reply;
  } else if (action) {
    const approved = active && row.status === 'awaiting' && data.user?.id === 'tg:' + from.id;
    let changed = false;
    if (approved) changed = !!(await env.DB.prepare('UPDATE records SET status=?,updated=? WHERE id=? AND status=\'awaiting\' AND body=?').bind(action[1] === 'yes' ? 'approved' : 'denied', Date.now(), row.id, row.body).run()).meta.changes;
    const reply = await telegramWebhookReply(env, 'answerCallbackQuery', { callback_query_id: callback.id, text: changed ? action[1] === 'yes' ? 'Подтверждено. Вернитесь на сайт.' : 'Вход отклонён.' : 'Запрос уже завершён или истёк.' });
    if (reply) return reply;
    if (changed) await telegramWebhookReply(env, 'editMessageReplyMarkup', { chat_id: from.id, message_id: message.message_id, reply_markup: { inline_keyboard: [] } });
  }
  return loginJSON({ ok: true });
}
