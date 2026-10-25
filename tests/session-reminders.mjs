// Build 146: sliding Telegram sessions, trip reminders, news consent for push and owner-editable site extras.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash,generateKeyPairSync,createECDH,randomBytes} from 'node:crypto';
import ts from 'typescript';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const source=read('lib/site-api.ts')
 .replace("import '../public/fleet-model.js';",read('public/fleet-model.js'))
 .replace("import { dispatchPayload, normalizeDispatchUpdate, sendToDispatcher, verifyDispatchWebhook } from './dispatch';",read('lib/dispatch.ts').replace(/export /g,''))
 .replace("import { orderNotification } from './order-notify';",read('lib/order-notify.ts').replace(/export /g,''))
 .replace("import {pushAPI,pushToUser} from './web-push';",read('lib/web-push.ts').replace(/export /g,''))
 .replace("import seed from './site-seed.json';",'const seed='+read('lib/site-seed.json')+';')
 .replace("import { telegramAuth, telegramConfig, telegramIdentity, telegramLogout, telegramAppAPI } from './telegram-auth';",read('lib/telegram-auth.ts').replace(/export /g,''))
 .replace("import { priceBooking } from './tour-pricing';",read('lib/tour-pricing.ts').replace(/export /g,''))
 .replace("import transferRates from './transfer-rates.json';",'const transferRates='+read('lib/transfer-rates.json')+';');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {siteAPI,sendTripReminders}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const sqlite=new DatabaseSync(':memory:');sqlite.exec(read('drizzle/0000_demonic_black_cat.sql'));
const DB={prepare(sql){let values=[];return {bind(...v){values=v;return this},async first(){return sqlite.prepare(sql).get(...values)||null},async all(){return {results:sqlite.prepare(sql).all(...values)}},async run(){const r=sqlite.prepare(sql).run(...values);return {meta:{changes:Number(r.changes)}}}}},async batch(items){const out=[];for(const x of items)out.push(await x.run());return out}};
const BUCKET={async put(){},async head(){return null},async get(){return null}};
const vapid=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=vapid.privateKey.export({format:'jwk'});
const env={DB,BUCKET,SITE_OWNER_EMAIL:'owner@example.com',VAPID_PUBLIC_KEY:Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')]).toString('base64url'),VAPID_PRIVATE_JWK:JSON.stringify(jwk)};
const sha=text=>createHash('sha256').update(text).digest('hex');
function session(owner,{createdDaysAgo=0,expiresInDays=30}={}){const token=randomBytes(32).toString('hex'),now=Date.now(),created=now-createdDaysAgo*86400000;sqlite.prepare('INSERT INTO records (id,kind,owner,body,status,created,updated) VALUES (?,?,?,?,?,?,?)').run('tg-session:'+sha(token),'tg-session',owner,JSON.stringify({expires:now+expiresInDays*86400000,created}),'private',created,created);return token}
async function call(path,{token,method='GET',data,user}={}){const headers={};if(token)headers.cookie='__Host-apsua_tg='+token;if(user){headers['oai-authenticated-user-id']=user;headers['oai-authenticated-user-email']=user+'@example.com'}if(method!=='GET')headers.origin='https://test.example';if(data)headers['Content-Type']='application/json';const response=await siteAPI(new Request('https://test.example'+path,{method,headers,body:data?JSON.stringify(data):undefined}),env);const text=await response.text();return {status:response.status,cookies:response.headers.getSetCookie?.()||[],data:text?JSON.parse(text):null}}
const tgCookie=list=>list.find(x=>x.startsWith('__Host-apsua_tg='));

// --- Sliding session -------------------------------------------------------------------------
let token=session('tg:1',{createdDaysAgo:0,expiresInDays:30});
let r=await call('/api/state',{token});assert.equal(r.data.user?.authKind,'telegram');assert.equal(tgCookie(r.cookies),undefined,'A fresh session is not rewritten on every request');
token=session('tg:2',{createdDaysAgo:5,expiresInDays:25});
r=await call('/api/state',{token});assert.equal(r.data.user?.authKind,'telegram');const renewed=tgCookie(r.cookies);assert.ok(renewed,'An active session older than a day is renewed');
assert.match(renewed,/HttpOnly/);assert.match(renewed,/Secure/);assert.match(renewed,/SameSite=Lax/);assert.ok(renewed.includes('__Host-apsua_tg='+token+';'),'The same token is kept (no logout of parallel tabs)');
const age=Number(renewed.match(/Max-Age=(\d+)/)[1]);assert.ok(age>29*86400&&age<=30*86400,'Renewed for 30 days from now: '+age);
const stored=JSON.parse(sqlite.prepare('SELECT body FROM records WHERE id=?').get('tg-session:'+sha(token)).body);assert.ok(stored.expires>Date.now()+29*86400000);
r=await call('/api/state',{token});assert.equal(tgCookie(r.cookies),undefined,'Renewal happens at most once a day');
token=session('tg:3',{createdDaysAgo:80,expiresInDays:5});
r=await call('/api/state',{token});const capped=Number(tgCookie(r.cookies).match(/Max-Age=(\d+)/)[1]);assert.ok(capped<=10*86400+5&&capped>9*86400,'Renewal never goes beyond 90 days after sign-in: '+capped);
token=session('tg:4',{createdDaysAgo:91,expiresInDays:5});
r=await call('/api/state',{token});assert.equal(r.data.user,null,'A session older than 90 days is no longer accepted');
token=session('tg:5',{createdDaysAgo:40,expiresInDays:-1});
r=await call('/api/state',{token});assert.equal(r.data.user,null,'An expired session is not revived');
token=session('tg:6',{createdDaysAgo:5,expiresInDays:25});
r=await call('/api/media/00000000-0000-0000-0000-000000000000',{token});assert.equal(tgCookie(r.cookies),undefined,'Immutable media responses never carry a session cookie');
r=await call('/api/state',{token});assert.ok(tgCookie(r.cookies),'…and the renewal is left for the next page request');
r=await call('/api/profile',{token,method:'PUT',data:{name:'Анна'}});assert.equal(r.status,200);
console.log('PASS: Telegram sessions slide 30 days from the last visit (once a day, same token, HttpOnly/Secure/Lax), capped at 90 days; expired sessions stay expired; media is never cookied.');

// --- Trip reminders ---------------------------------------------------------------------------
const pushes=[];const realFetch=globalThis.fetch;globalThis.fetch=async(url,options)=>{pushes.push(String(url));return new Response('',{status:201})};
const ua=createECDH('prime256v1');ua.generateKeys();
const sub={endpoint:'https://web.push.apple.com/device-1',keys:{p256dh:ua.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};
sqlite.prepare("INSERT INTO records (id,kind,owner,body,status,created,updated) VALUES (?,?,?,?,?,?,?)").run('push:'+createHash('sha256').update(sub.endpoint).digest('base64url'),'push-subscription','tg:2',JSON.stringify(sub),'active',Date.now(),Date.now());
const moscow=at=>new Date(at+3*3600000).toISOString();
const soon=Date.now()+20*3600000,later=Date.now()+40*3600000,past=Date.now()-3600000;
const order=(id,status,at,kind='bookings')=>sqlite.prepare("INSERT INTO records (id,kind,owner,body,status,created,updated) VALUES (?,?,?,?,?,?,?)").run(id,kind,'tg:2',JSON.stringify({code:id,tour:'ritsa',route:'Аэропорт Сочи → Гагра',date:moscow(at).slice(0,10),time:moscow(at).slice(11,16)}),status,Date.now(),Date.now());
order('AT-1','confirmed',soon);order('AT-2','private',soon);order('AT-3','paid',later);order('AT-4','cancelled',soon);order('TR-1','awaiting_payment',soon,'transfers');order('AT-5','paid',past);
let sent=await sendTripReminders(env);assert.equal(sent,2,'Only confirmed/unpaid-invoice/paid trips within 24 hours are reminded');
assert.equal(pushes.length,2);assert.equal(await sendTripReminders(env),0,'A reminder is sent once per request');
assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind='reminder'").get().n,2);
const bodies=sqlite.prepare("SELECT body FROM records WHERE id IN ('AT-1','TR-1')").all().map(x=>JSON.parse(x.body));assert.ok(bodies.every(x=>!('reminderSentAt' in x)),'Order data is not modified by reminders');
assert.equal(await sendTripReminders({...env,VAPID_PRIVATE_JWK:''}),0,'Without push keys nothing is claimed');
globalThis.fetch=realFetch;
console.log('PASS: one push reminder about a day before confirmed trips and transfers, never for pending, cancelled, past or later trips; idempotent and order data untouched.');

// --- News consent for push ---------------------------------------------------------------------
const owner='owner',push=async(path,method='GET',data,user='tg:2',admin=false)=>{const response=await siteAPI(new Request('https://test.example'+path,{method,headers:{...(method!=='GET'?{origin:'https://test.example','Content-Type':'application/json'}:{}),...(admin?{'oai-authenticated-user-id':owner,'oai-authenticated-user-email':'owner@example.com'}:{cookie:'__Host-apsua_tg='+token})},body:data?JSON.stringify(data):undefined}),env);return {status:response.status,data:await response.json()}};
token=session('tg:2',{createdDaysAgo:0});
let p=await push('/api/push/preferences?endpoint='+encodeURIComponent(sub.endpoint));assert.equal(p.status,200);assert.equal(p.data.news,false,'News are off by default');
p=await push('/api/push/preferences','POST',{endpoint:sub.endpoint,news:true});assert.equal(p.data.news,true);
p=await push('/api/push/preferences','POST',{endpoint:sub.endpoint,news:'yes'});assert.equal(p.status,400);
const other=session('tg:9');const foreign=await siteAPI(new Request('https://test.example/api/push/preferences',{method:'POST',headers:{origin:'https://test.example','Content-Type':'application/json',cookie:'__Host-apsua_tg='+other},body:JSON.stringify({endpoint:sub.endpoint,news:false})}),env);assert.equal(foreign.status,404,'Another account cannot change this device');
const resub=await push('/api/push/subscription','POST',sub);assert.equal(resub.data.news,true,'Re-registering the same device keeps the consent');
const ua2=createECDH('prime256v1');ua2.generateKeys();sqlite.prepare("INSERT INTO records (id,kind,owner,body,status,created,updated) VALUES (?,?,?,?,?,?,?)").run('push:'+createHash('sha256').update('https://web.push.apple.com/device-2').digest('base64url'),'push-subscription','tg:7',JSON.stringify({endpoint:'https://web.push.apple.com/device-2',keys:{p256dh:ua2.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}}),'active',Date.now(),Date.now());
const dash=await push('/api/admin/push','GET',null,owner,true);assert.equal(dash.data.devices,2);assert.equal(dash.data.newsDevices,1);
const news=await push('/api/admin/push','POST',{id:crypto.randomUUID(),title:'Акция',text:'Скидка',audience:'news'},owner,true);assert.equal(news.data.total,1,'News go only to devices with consent');assert.equal(news.data.audience,'news');
const service=await push('/api/admin/push','POST',{id:crypto.randomUUID(),title:'Перекрыта дорога',text:'Выезд позже'},owner,true);assert.equal(service.data.total,2,'Important service messages reach every subscriber');assert.equal(service.data.audience,'service');
console.log('PASS: marketing consent is separate, off by default, per device and owner-bound; news broadcasts reach only consenting devices, service messages reach all.');

// --- Owner-editable extras ----------------------------------------------------------------------
const state=await call('/api/state',{user:owner});const content=state.data.content;
const save=async site=>call('/api/content',{user:owner,method:'PUT',data:{content:{...content,site:{...content.site,...site}},revision:state.data.revision}});
assert.equal((await save({vk:'https://evil.example/vk'})).status,400,'Only real VK addresses are accepted');
assert.equal((await save({instagram:'javascript:alert(1)'})).status,400);
assert.equal((await save({bookingTerms:'x'.repeat(20001)})).status,400);
const ok=await save({vk:'https://vk.com/apsuatour',instagram:'https://www.instagram.com/apsuatour/',bookingTerms:'Условия\nТекст',faqText:'Вопрос?\nОтвет.'});assert.equal(ok.status,200,JSON.stringify(ok.data));
console.log('PASS: social links, booking terms and FAQ text are validated on the server.');
