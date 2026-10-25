import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {createHash} from 'node:crypto';
const source=readFileSync(new URL('../lib/site-api.ts',import.meta.url),'utf8')
 .replace("import '../public/fleet-model.js';",readFileSync(new URL('../public/fleet-model.js',import.meta.url),'utf8'))
 .replace("import { dispatchPayload, normalizeDispatchUpdate, sendToDispatcher, verifyDispatchWebhook } from './dispatch';",readFileSync(new URL('../lib/dispatch.ts',import.meta.url),'utf8').replace(/export /g,''))
 .replace("import { orderNotification } from './order-notify';",readFileSync(new URL('../lib/order-notify.ts',import.meta.url),'utf8').replace(/export /g,''))
 .replace("import {pushAPI,pushToUser} from './web-push';",readFileSync(new URL('../lib/web-push.ts',import.meta.url),'utf8').replace(/export /g,''))
 .replace("import seed from './site-seed.json';",'const seed='+readFileSync(new URL('../lib/site-seed.json',import.meta.url),'utf8')+';')
 .replace("import { telegramAuth, telegramConfig, telegramIdentity, telegramLogout, telegramAppAPI } from './telegram-auth';",readFileSync(new URL('../lib/telegram-auth.ts',import.meta.url),'utf8').replace(/export /g,''))
 .replace("import { priceBooking } from './tour-pricing';",readFileSync(new URL('../lib/tour-pricing.ts',import.meta.url),'utf8').replace(/export /g,''))
 .replace("import transferRates from './transfer-rates.json';",'const transferRates='+readFileSync(new URL('../lib/transfer-rates.json',import.meta.url),'utf8')+';');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {siteAPI}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../drizzle/0000_demonic_black_cat.sql',import.meta.url),'utf8'));
const DB={prepare(sql){let values=[];return {bind(...v){values=v;return this},async first(){return sqlite.prepare(sql).get(...values)||null},async all(){return {results:sqlite.prepare(sql).all(...values)}},async run(){const r=sqlite.prepare(sql).run(...values);return {meta:{changes:Number(r.changes)}}}}},async batch(items){return Promise.all(items.map(x=>x.run()))}};
const files=new Map();const BUCKET={async put(key,bytes,options){files.set(key,{bytes,...options})},async head(key){return files.get(key)||null}};
const env={DB,BUCKET,SITE_OWNER_EMAIL:'owner@example.com'};
async function call(path,user='tourist',method='GET',data,options={}){const headers={};if(options.cookie)headers.cookie=options.cookie;if(user){headers['oai-authenticated-user-id']=user;headers['oai-authenticated-user-email']=user+'@example.com'}if(method!=='GET')headers.origin=options.origin||'https://test.example';if(data instanceof Blob)headers['Content-Type']=data.type;else if(data)headers['Content-Type']='application/json';const response=await siteAPI(new Request('https://test.example'+path,{method,headers,body:data?(data instanceof Blob?data:JSON.stringify(data)):undefined}),env);return {status:response.status,cookie:response.headers.get('Set-Cookie'),data:await response.json()}}
let response=await call('/api/profile','', 'PUT',{name:'Ирина'});assert.equal(response.status,401);
response=await call('/api/media','tourist','POST',new Blob([new Uint8Array([255,216,255,217])],{type:'image/jpeg'}));assert.equal(response.status,200);const avatar=response.data.url;
response=await call('/api/profile','tourist','PUT',{name:'Ирина',city:'Москва',about:'Люблю горы и путешествия',avatar,id:'owner'});assert.equal(response.status,200);assert.equal(response.data.user.id,'tourist');
response=await call('/api/state');assert.equal(response.data.user.name,'Ирина');assert.equal(response.data.user.city,'Москва');assert.equal(response.data.user.about,'Люблю горы и путешествия');assert.equal(response.data.user.avatar,avatar);
response=await call('/api/profile','other','PUT',{name:'Другой',avatar});assert.equal(response.status,400);
response=await call('/api/state','other');assert.equal(response.data.user.about,'');assert.equal(response.data.user.avatar,'');
const story={id:'regression-story',t:'Поездка на Рицу',x:'История поездки с красивыми видами на горы.',img:avatar,a:'Ирина, октябрь',status:'published',uid:'owner'};
response=await call('/api/list','tourist','POST',{kind:'diary',items:[story]});assert.equal(response.status,200);
response=await call('/api/state');assert.equal(response.data.lists.diary[0].status,'pending');assert.equal(response.data.lists.diary[0].uid,'tourist');
response=await call('/api/state','other');assert.equal(response.data.lists.diary.length,0);
response=await call('/api/moderation','other');assert.equal(response.status,403);
response=await call('/api/moderation','owner');assert.equal(response.status,200);assert.equal(response.data.diary[0].id,story.id);assert.equal(response.data.diary[0].status,'pending');assert.equal(response.data.diary[0].img,avatar);
response=await call('/api/list','other','POST',{kind:'diary',items:[{...story,status:'published'}]});assert.equal(response.status,200);
response=await call('/api/moderation','owner');assert.equal(response.data.diary[0].status,'pending');
response=await call('/api/moderation','other','PUT',{id:story.id,status:'published'});assert.equal(response.status,403);
response=await call('/api/moderation','owner','PUT',{id:story.id,status:'published'});assert.equal(response.status,200);
response=await call('/api/state','other');assert.equal(response.data.lists.diary[0].status,'published');
response=await call('/api/list','tourist','POST',{kind:'diary',items:[{...story,id:'inline-photo',img:'data:image/jpeg;base64,'+'A'.repeat(120000)}]});assert.equal(response.status,400);
response=await call('/api/moderation','owner');assert.equal(response.data.diary.length,1);
response=await call('/api/list','tourist','POST',{kind:'diary',items:[{...story,id:'rejected-story'}]});assert.equal(response.status,200);
response=await call('/api/moderation','owner');const rejected=response.data.diary.find(x=>x.id==='rejected-story');
response=await call('/api/moderation','owner','PUT',{id:rejected.id,status:'rejected'});assert.equal(response.status,200);
sqlite.prepare('UPDATE records SET created=? WHERE id=?').run(Date.now()-3*86400000,'rejected-story');
response=await call('/api/moderation','owner');assert.equal(response.data.diary.find(x=>x.id==='rejected-story').status,'rejected');
// Existing comments follow the current profile for every viewer, without rewriting their text.
response=await call('/api/story','tourist','POST',{id:story.id,action:'comment',text:'Старый комментарий',author:'Подставное имя'});assert.equal(response.status,200);
response=await call('/api/state','other');let comment=response.data.lists.diary.find(x=>x.id===story.id).comments[0];assert.equal(comment.author,'Ирина');assert.equal(comment.avatar,avatar);
response=await call('/api/media','tourist','POST',new Blob(['new picture'],{type:'image/png'}));const newAvatar=response.data.url;
response=await call('/api/profile','tourist','PUT',{name:'Ирина Новая',city:'Казань',about:'Личная информация',avatar:newAvatar});assert.equal(response.status,200);
for(const viewer of ['tourist','other','']){response=await call('/api/state',viewer);comment=response.data.lists.diary.find(x=>x.id===story.id).comments[0];assert.equal(comment.author,'Ирина Новая');assert.equal(comment.avatar,newAvatar);assert.equal(comment.text,'Старый комментарий');assert.equal(comment.about,undefined);assert.equal(comment.email,undefined)}
response=await call('/api/moderation','owner');assert.equal(response.data.diary.find(x=>x.id===story.id).comments[0].author,'Ирина Новая');
response=await call('/api/profile','tourist','PUT',{name:'Ирина Новая',avatar:''});assert.equal(response.status,200);
response=await call('/api/state','other');assert.equal(response.data.lists.diary.find(x=>x.id===story.id).comments[0].avatar,'');
// A review must match an owned, paid booking and a past excursion date.
// Orders created before 13.6 (past dates, no phone) are stored as legacy records; new requests are validated by the server.
const FUTURE_DATE=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
const legacy=(kind,item,owner='tourist')=>sqlite.prepare('INSERT INTO records (id,kind,owner,body,status,created,updated) VALUES (?,?,?,?,?,?,?)').run(item.code,kind,owner,JSON.stringify(item),'private',Date.now(),Date.now());
const booking={code:'AT-verified-123',tour:'ritsa',date:'2026-01-01',name:'Ирина',adults:1,kids:0,status:'paid'};
legacy('bookings',booking);
let reviewPayload={bookingCode:booking.code,tour:booking.tour,date:booking.date,rating:5,text:'Спасибо за прекрасную экскурсию!',uid:'owner',verified:true};
response=await call('/api/review','', 'POST',reviewPayload);assert.equal(response.status,401);
response=await call('/api/review','tourist','POST',reviewPayload);assert.equal(response.status,400,'Client cannot mark its own booking paid');
response=await call('/api/order-status','tourist','PUT',{id:booking.code,kind:'bookings',status:'paid'});assert.equal(response.status,403);
response=await call('/api/order-status','owner','PUT',{id:booking.code,kind:'bookings',status:'paid'});assert.equal(response.status,200);
response=await call('/api/review','other','POST',reviewPayload);assert.equal(response.status,400);
response=await call('/api/review','tourist','POST',{...reviewPayload,date:'2026-01-02'});assert.equal(response.status,400);
response=await call('/api/review','tourist','POST',{...reviewPayload,tour:'spa'});assert.equal(response.status,400);
response=await call('/api/list','tourist','POST',{kind:'reviews',items:[{id:'bypass',x:'Fake review'}]});assert.equal(response.status,400);
response=await call('/api/review','tourist','POST',reviewPayload);assert.equal(response.status,200);assert.equal(response.data.review.verified,true);assert.equal(response.data.review.uid,'tourist');
response=await call('/api/review','tourist','POST',reviewPayload);assert.equal(response.status,409);
response=await call('/api/state','other');assert.equal(response.data.lists.reviews.length,1);assert.equal(response.data.lists.reviews[0].bookingCode,undefined,'Booking code stays private');
const futureBooking={...booking,code:'AT-future',date:'2099-01-01'};
legacy('bookings',futureBooking);
response=await call('/api/order-status','owner','PUT',{id:futureBooking.code,kind:'bookings',status:'paid'});assert.equal(response.status,200);
response=await call('/api/review','tourist','POST',{...reviewPayload,bookingCode:futureBooking.code,date:futureBooking.date});assert.equal(response.status,400);
legacy('transfers',{code:'TR-1',date:'2026-01-01'});legacy('transfers',{code:'TR-2',date:'2026-01-02'});
response=await call('/api/order-status','owner','PUT',{id:'TR-2',kind:'transfers',status:'cancelled'});assert.equal(response.status,200);
response=await call('/api/tourist?id=tourist','');assert.equal(response.status,200);const card=response.data.profile;assert.equal(card.name,'Ирина Новая');assert.equal(card.excursions,2);assert.equal(card.transfers,1);assert.ok(Date.parse(card.joinedAt)<=Date.now());for(const secret of ['email','phone','bookings','bookingCode'])assert.equal(card[secret],undefined);
response=await call('/api/tourist?id=nonexistent','');assert.equal(response.status,404);
for(const viewer of ['','other','owner']){response=await call('/api/tourist?id=tourist',viewer);assert.equal(response.data.profile.canEdit,false)}
response=await call('/api/tourist?id=tourist','tourist');assert.equal(response.data.profile.canEdit,true);
response=await call('/api/profile','other','PUT',{id:'tourist',name:'Чужое изменение',city:'Другой город'});assert.equal(response.status,200);assert.equal(response.data.user.id,'other');
response=await call('/api/state','tourist');assert.equal(response.data.user.name,'Ирина Новая');assert.notEqual(response.data.user.city,'Другой город');
// Temporary invitation sessions never verify email or grant administrator privileges.
response=await call('/api/test-login','','POST',{name:'Тест',email:'test@example.com',code:'TEST'});assert.equal(response.status,410);
const testId='test:'+'1'.repeat(32),testId2='test:'+'2'.repeat(32);const hash=v=>createHash('sha256').update(v).digest('hex');env.TEST_AUTH_INVITES=JSON.stringify([{id:testId,hash:hash('ATTESTCODEONE')},{id:testId2,hash:hash('ATTESTCODETWO')}]);env.TEST_AUTH_UNTIL=new Date(Date.now()+30*86400000).toISOString();
response=await call('/api/test-login','','POST',{name:'Тест',email:'owner@example.com',code:'WRONG'});assert.equal(response.status,401);
response=await call('/api/test-login','','POST',{name:'Тест',email:'owner@example.com',code:'AT-TEST-CODE-ONE'},{origin:'https://evil.example'});assert.equal(response.status,403);
response=await call('/api/test-login','','POST',{name:'Первый тест',email:'owner@example.com',code:'AT-TEST-CODE-ONE'});assert.equal(response.status,200);assert.ok(response.cookie.includes('HttpOnly'));assert.ok(response.cookie.includes('Secure'));const cookie=response.cookie.split(';')[0];
response=await call('/api/state','','GET',undefined,{cookie});assert.equal(response.data.user.id,testId);assert.equal(response.data.user.authKind,'test');assert.equal(response.data.user.emailVerified,false);assert.equal(response.data.admin,false,'Typing owner email does not grant admin');
response=await call('/api/moderation','','GET',undefined,{cookie});assert.equal(response.status,403);
response=await call('/api/profile','','PUT',{name:'Изменённый тест',id:'tourist',city:'Сухум'},{cookie});assert.equal(response.status,200);assert.equal(response.data.user.id,testId);assert.equal(response.data.user.authKind,'test');
response=await call('/api/state','tourist');assert.equal(response.data.user.name,'Ирина Новая');
response=await call('/api/test-login','','POST',{name:'Второй тест',email:'another@example.com',code:'AT-TEST-CODE-TWO'});assert.equal(response.status,200);const cookie2=response.cookie.split(';')[0];
response=await call('/api/state','','GET',undefined,{cookie:cookie2});assert.equal(response.data.user.id,testId2);assert.equal(response.data.user.city,'');
response=await call('/api/test-login','','POST',{name:'Тест',email:'different@example.com',code:'AT-TEST-CODE-ONE'});assert.equal(response.status,400,'Invitation bound to first email');
response=await call('/api/test-login','','POST',{name:'Новое имя',email:'owner@example.com',code:'AT-TEST-CODE-ONE'});assert.equal(response.status,200);const newCookie=response.cookie.split(';')[0];
response=await call('/api/state','','GET',undefined,{cookie:newCookie});assert.equal(response.data.user.name,'Изменённый тест','Repeat login preserves profile');
response=await call('/api/test-logout','','POST',{}, {cookie:newCookie});assert.equal(response.status,200);assert.ok(response.cookie.includes('Max-Age=0'));
response=await call('/api/state','','GET',undefined,{cookie:newCookie});assert.equal(response.data.user,null);
env.TEST_AUTH_UNTIL=new Date(Date.now()-1000).toISOString();response=await call('/api/state','','GET',undefined,{cookie});assert.equal(response.data.user,null);assert.equal(response.data.testAuth.enabled,false);response=await call('/api/test-login','','POST',{name:'Тест',email:'owner@example.com',code:'AT-TEST-CODE-ONE'});assert.equal(response.status,410);
// Personal editor invitations grant catalog rights without exposing owner operations.
env.TEST_AUTH_UNTIL=new Date(Date.now()+30*86400000).toISOString();
const editorId='test:'+'3'.repeat(32);env.DEMO_AUTH_INVITES=JSON.stringify([{id:editorId,hash:hash('ATEDITORCODE'),role:'editor'}]);
response=await call('/api/test-login','','POST',{name:'Редактор',email:'editor@example.com',code:'AT-EDITOR-CODE'});assert.equal(response.status,200);const editorCookie=response.cookie.split(';')[0];
response=await call('/api/state','','GET',undefined,{cookie:editorCookie});assert.equal(response.data.admin,true);assert.equal(response.data.editor,true);assert.equal(response.data.user.id,editorId);assert.ok(response.data.lists.bookings.every(x=>x.uid===editorId));
const editorContent=structuredClone(response.data.content);editorContent.tours[0].title='Редактор изменил экскурсию';
response=await call('/api/content','','PUT',{content:editorContent,revision:response.data.revision},{cookie:editorCookie});assert.equal(response.status,200);
const editorState=(await call('/api/state','','GET',undefined,{cookie:editorCookie})).data;assert.equal(editorState.content.tours[0].title,'Редактор изменил экскурсию');
const forbiddenContent=structuredClone(editorState.content);forbiddenContent.site.title='Чужие настройки';response=await call('/api/content','','PUT',{content:forbiddenContent,revision:editorState.revision},{cookie:editorCookie});assert.equal(response.status,403);
response=await call('/api/moderation','','GET',undefined,{cookie:editorCookie});assert.equal(response.status,403);
response=await call('/api/content','','PUT',{content:editorState.content,revision:editorState.revision},{cookie});assert.equal(response.status,403,'Ordinary invite never gets editor rights');
response=await call('/api/test-login','','POST',{name:'Другой',email:'other-editor@example.com',code:'AT-EDITOR-CODE'});assert.equal(response.status,400);
// Scoped editor patch preserves server-only/default settings and revision protection.
let scopedState=(await call('/api/state','','GET',undefined,{cookie:editorCookie})).data;
const patchedTours=structuredClone(scopedState.content.tours);patchedTours[0].price=4321;
response=await call('/api/content','','PUT',{patch:{tours:patchedTours},revision:scopedState.revision},{cookie:editorCookie});assert.equal(response.status,200);
let afterPatch=(await call('/api/state','','GET',undefined,{cookie:editorCookie})).data;
assert.equal(afterPatch.content.tours[0].price,4321);assert.deepEqual(afterPatch.content.site,scopedState.content.site);
response=await call('/api/content','','PUT',{patch:{tours:patchedTours},revision:scopedState.revision},{cookie:editorCookie});assert.equal(response.status,409);
response=await call('/api/content','','PUT',{patch:{site:{title:'Forbidden'}},revision:afterPatch.revision},{cookie:editorCookie});assert.equal(response.status,403);
patchedTours[0].seasons=[{start:'02-30',mode:'group',departures:[]}];
response=await call('/api/content','','PUT',{patch:{tours:patchedTours},revision:afterPatch.revision},{cookie:editorCookie});assert.equal(response.status,400);
console.log('PASS: editor saves scoped excursion prices, retains unrelated settings, rejects stale revisions and malformed seasons.');
// Only the owner sees login history; failed logins never create entries, logout preserves it.
for(const user of ['', 'tourist'])assert.equal((await call('/api/admin/logins',user)).status,403);
assert.equal((await call('/api/admin/logins','','GET',undefined,{cookie:editorCookie})).status,403);
let audit=await call('/api/admin/logins','owner');assert.equal(audit.status,200);assert.equal(audit.data.logins.length,4);
assert.equal(audit.data.logins.filter(x=>x.email==='owner@example.com').length,2,'Both successful repeat logins remain after logout');
assert.ok(audit.data.logins.filter(x=>x.email==='owner@example.com').every(x=>x.name==='Изменённый тест'));
assert.ok(audit.data.logins.every(x=>Object.keys(x).sort().join(',')==='at,email,name'),'No session hashes, codes or tokens exposed');
assert.ok(audit.data.logins.every((x,i,a)=>!i||a[i-1].at>=x.at));
// Existing first registrations are visible even if their old session has been deleted.
const legacyId='test:'+'4'.repeat(32),legacyAt=Date.now()-86400000;
sqlite.prepare('INSERT INTO records (id,kind,owner,body,status,created,updated) VALUES (?,?,?,?,?,?,?)').run('test-identity:'+legacyId,'test-identity',legacyId,JSON.stringify({email:'legacy@example.com'}),'private',legacyAt,legacyAt);
audit=await call('/api/admin/logins','owner');assert.equal(audit.data.logins.length,5);assert.equal(audit.data.logins.at(-1).email,'legacy@example.com');
env.DEMO_AUTH_INVITES='[]';response=await call('/api/state','','GET',undefined,{cookie:editorCookie});assert.equal(response.data.user,null,'Revoking invite removes editor session access');
env.TEST_AUTH_UNTIL=new Date(Date.now()-1000).toISOString();
// Admin timestamps survive reads and only successful authorized writes change them.
const snapshot=(await call('/api/state','owner')).data;
const saved=await call('/api/content','owner','PUT',{content:snapshot.content,revision:snapshot.revision});assert.equal(saved.status,200);assert.ok(saved.data.lastModifiedAt>0);
assert.equal((await call('/api/state','owner')).data.lastModifiedAt,saved.data.lastModifiedAt);
sqlite.prepare("UPDATE settings SET value='1234567890000' WHERE key='last_admin_change'").run();
assert.equal((await call('/api/content','owner','PUT',{content:snapshot.content,revision:snapshot.revision})).status,409);
assert.equal((await call('/api/content','tourist','PUT',{content:snapshot.content,revision:saved.data.revision})).status,403);
assert.equal((await call('/api/order-status','owner','PUT',{id:'missing',kind:'bookings',status:'paid'})).status,404);
assert.equal((await call('/api/state','owner')).data.lastModifiedAt,1234567890000,'Failed saves and page reads leave timestamp intact');
response=await call('/api/moderation','owner','PUT',{id:story.id,status:'published'});assert.ok(response.data.lastModifiedAt>1234567890000);
assert.equal((await call('/api/state','owner')).data.lastModifiedAt,response.data.lastModifiedAt);
console.log('PASS: profile and avatar persist; profile privacy; tourist submission reaches admin; approval, rejection, upload validation and current profile on old comments, verified reviews and public card statistics.');
// Live theatre feed: reuse cached data and mark stale responses on upstream failure.
const originalFetch=globalThis.fetch;let feedFetches=0;
const showDate=new Date(Date.now()+86400000+10800000),showMonth=['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'][showDate.getUTCMonth()];
const feedHTML=`<article><p>14+</p><p>${showDate.getUTCDate()}</p><p>${showMonth}</p><p>19:00</p><a href="/theater/performs/test"><img src="https://ucarecdn.com/test/poster.png"></a><h2>Проверка афиши</h2><p>Комедия</p><button>Состав</button><a href="/buy/test/session">Купить билет</a></article>`;
try{
 globalThis.fetch=async()=>{feedFetches++;return new Response(feedHTML)};
 let feed=await call('/api/theatre','');assert.equal(feed.status,200);assert.equal(feed.data.events.length,1);assert.equal(feed.data.events[0].buy,'https://rusdram.org/buy/test/session');assert.equal(feed.data.stale,false);
 await call('/api/theatre','');assert.equal(feedFetches,1,'Fresh cached feed avoids duplicate upstream requests');
 sqlite.prepare("UPDATE settings SET value=json_set(value,'$.checkedAt',0) WHERE key='rusdram_feed'").run();
 globalThis.fetch=async()=>{throw new Error('offline')};feed=await call('/api/theatre','');assert.equal(feed.data.stale,true);assert.equal(feed.data.events.length,1);
 sqlite.prepare("UPDATE settings SET value=json_set(value,'$.updatedAt',0) WHERE key='rusdram_feed'").run();feed=await call('/api/theatre','');assert.equal(feed.data.unavailable,true);assert.equal(feed.data.events.length,0,'Very old posters are not presented as current');
}finally{globalThis.fetch=originalFetch}
console.log('PASS: theatre import, cache, ticket URLs and stale-feed fallback.');


// Live revisions contain no records; only successful shared writes notify clients.
let liveBefore=(await call('/api/updates','')).data.revision;
assert.equal(typeof liveBefore,'string');
response=await call('/api/profile','tourist','PUT',{name:'Обновлённый профиль',city:'Сухум',about:''});assert.equal(response.status,200);
let liveAfter=(await call('/api/updates','')).data;
assert.notEqual(liveAfter.revision,liveBefore);assert.deepEqual(Object.keys(liveAfter),['revision']);
assert.equal((await call('/api/state','tourist')).data.liveRevision,liveAfter.revision);
liveBefore=liveAfter.revision;
await call('/api/profile','tourist','PUT',{name:'X'});
assert.equal((await call('/api/updates','')).data.revision,liveBefore,'Failed write does not notify');
await call('/api/list','tourist','POST',{kind:'favs',items:[]});
assert.equal((await call('/api/updates','')).data.revision,liveBefore,'Personal favorites do not reload everyone');
const abort=new AbortController();
const streamResponse=await siteAPI(new Request('https://test.example/api/updates',{headers:{Accept:'text/event-stream'},signal:abort.signal}),env);
assert.match(streamResponse.headers.get('Content-Type'),/text\/event-stream/);
const reader=streamResponse.body.getReader(),decoder=new TextDecoder();
assert.match(decoder.decode((await reader.read()).value),/retry: 1000/);
assert.match(decoder.decode((await reader.read()).value),new RegExp(liveBefore));
await call('/api/profile','tourist','PUT',{name:'Ещё одно обновление',city:'Гагра'});
assert.match(decoder.decode((await reader.read()).value),/event: revision/);
await reader.cancel();abort.abort();
console.log('PASS: live stream sends initial and changed revisions, preserves privacy and ignores failed writes and favorites.');

// Real road geometry and distance are returned together; failures never synthesize a line.
let roadFetches=0;const beforeRoadFetch=globalThis.fetch;
try{
 globalThis.fetch=async(url)=>{roadFetches++;assert.ok(String(url).startsWith('https://routing.openstreetmap.de/routed-car/route/v1/driving/'));assert.ok(String(url).includes('overview=full&geometries=geojson'));return Response.json({code:'Ok',routes:[{distance:110026.3,geometry:{coordinates:[[41.02,43.003],[40.81,43.09],[40.7,43.2],[40.535,43.478]]}}],waypoints:[{location:[41.02,43.003]},{location:[40.815,43.09]},{location:[40.535,43.478]}]})};
 let road=await call('/api/road-route?from='+encodeURIComponent('Сухум')+'&stops=afon,ritsa','');assert.equal(road.status,200);assert.equal(road.data.distanceKm,110);assert.equal(road.data.coordinates.length,4);assert.equal(road.data.waypoints.length,3);assert.deepEqual(road.data.stops,['suhum','afon','ritsa']);
 await call('/api/road-route?from='+encodeURIComponent('Сухум')+'&stops=afon,ritsa','');assert.equal(roadFetches,1,'Repeated itinerary uses cache');
 assert.equal((await call('/api/road-route?from=constructor&stops=ritsa','')).status,400);
 assert.equal((await call('/api/road-route?from='+encodeURIComponent('Сухум')+'&stops=evil','')).status,400);assert.equal(roadFetches,1);
 globalThis.fetch=async()=>Response.json({code:'NoRoute'});
 road=await call('/api/road-route?from='+encodeURIComponent('Гагра')+'&stops=ritsa','');assert.equal(road.status,502);assert.equal(road.data.coordinates,undefined);
 globalThis.fetch=async()=>{throw new Error('offline')};assert.equal((await call('/api/road-route?from='+encodeURIComponent('Гагра')+'&stops=afon','')).status,502);
}finally{globalThis.fetch=beforeRoadFetch}
console.log('PASS: curved road geometry, road kilometers, stop order, cache, restricted routing inputs and honest upstream failure.');

// Content history is private and records only successful content revisions.
response=await call('/api/state','owner');let historyContent=structuredClone(response.data.content),historyRevision=response.data.revision;
historyContent.tours[0].short+=' Тест изменения текста.';
response=await call('/api/content','owner','PUT',{content:historyContent,revision:historyRevision});assert.equal(response.status,200);
let contentHistoryResponse=await call('/api/admin/content-history','owner');assert.equal(contentHistoryResponse.status,200);assert.ok(contentHistoryResponse.data.entries[0].author);assert.ok(contentHistoryResponse.data.entries[0].changes.some(x=>x.includes('краткое описание')));const historyCount=contentHistoryResponse.data.entries.length;
response=await call('/api/content','owner','PUT',{content:historyContent,revision:historyRevision});assert.equal(response.status,409);
contentHistoryResponse=await call('/api/admin/content-history','owner');assert.equal(contentHistoryResponse.data.entries.length,historyCount,'Conflicts do not append history');
response=await call('/api/admin/content-history','tourist');assert.equal(response.status,403);response=await call('/api/admin/content-history','');assert.ok([401,403].includes(response.status));
response=await call('/api/state','owner');historyContent=structuredClone(response.data.content);historyRevision=response.data.revision;historyContent.tours.push({...historyContent.tours[0],id:'history-new-tour',title:'Новая тестовая экскурсия'});response=await call('/api/content','owner','PUT',{content:historyContent,revision:historyRevision});assert.equal(response.status,200);contentHistoryResponse=await call('/api/admin/content-history','owner');assert.ok(contentHistoryResponse.data.entries[0].changes.some(x=>x.includes('добавлено «Новая тестовая экскурсия»')));
console.log('PASS: private automatic content history, text edits, new excursions and no entries for stale saves.');


// Customers see only their own trip statuses and cannot forge manager details.
response=await call('/api/list','tourist','POST',{kind:'bookings',items:[{code:'AT-COMFORT',tour:'ritsa',date:FUTURE_DATE,time:'09:00',adults:2,kids:0,name:'Ирина',phone:'+79400000000',city:'Сухум',assignee:'Поддельный сотрудник',managerNote:'Поддельное подтверждение',meetingPoint:'Поддельное место',contactPhone:'123'}]});assert.equal(response.status,200);
response=await call('/api/my-orders','tourist');let comfortOrder=response.data.orders.find(x=>x.code==='AT-COMFORT');assert.ok(comfortOrder);assert.equal(comfortOrder.status,'private');assert.equal(comfortOrder.managerNote,undefined);assert.equal(comfortOrder.assignee,undefined);assert.equal(comfortOrder.meetingPoint,undefined);
response=await call('/api/order-status','tourist','PUT',{id:'AT-COMFORT',kind:'bookings',status:'confirmed'});assert.equal(response.status,403);
response=await call('/api/order-status','owner','PUT',{id:'AT-COMFORT',kind:'bookings',status:'confirmed',assignee:'Лолита',meetingPoint:'У центрального входа',managerNote:'Подойдите за 10 минут',contactPhone:'+79401112233'});assert.equal(response.status,200);assert.equal(response.data.order.assignee,'Лолита');
response=await call('/api/my-orders','tourist');comfortOrder=response.data.orders.find(x=>x.code==='AT-COMFORT');assert.equal(comfortOrder.assignee,undefined);assert.equal(comfortOrder.status,'confirmed');assert.equal(comfortOrder.meetingPoint,'У центрального входа');assert.equal(comfortOrder.managerNote,'Подойдите за 10 минут');assert.equal(comfortOrder.phone,'+79400000000');
response=await call('/api/my-orders','other');assert.ok(!response.data.orders.some(x=>x.code==='AT-COMFORT'));response=await call('/api/my-orders','');assert.equal(response.status,401);
response=await call('/api/order-status','owner','PUT',{id:'AT-COMFORT',kind:'bookings',status:'needs_info',clarification:{field:'manual',prompt:'Уточните детали встречи'}});assert.equal(response.status,200);response=await call('/api/my-orders','tourist');assert.equal(response.data.orders.find(x=>x.code==='AT-COMFORT').status,'needs_info');
console.log('PASS: private trip statuses, administrator confirmation/details, customer field protection and no cross-account access.');


// Visual snapshots are private, bounded, and committed with the content revision.
assert.equal((await call('/api/admin/visual-history','tourist')).status,403);
let visualState=(await call('/api/state','owner')).data;
const originalVisual=visualState.content.visualEditor||{version:1,pages:{}};
for(let n=1;n<=12;n++){const content={...visualState.content,visualEditor:{version:1,pages:{'#/':{desktop:{':where(#app > h1)':{fontSize:20+n}}}}}};const result=await call('/api/content','owner','PUT',{content,revision:visualState.revision});assert.equal(result.status,200);visualState=(await call('/api/state','owner')).data}
let visualHistory=(await call('/api/admin/visual-history','owner')).data.entries;assert.equal(visualHistory.length,10);assert.ok(visualHistory.every(x=>x.author&&x.at&&x.before));assert.ok(visualHistory[0].id>visualHistory[1].id);
const historyBeforeStale=JSON.stringify(visualHistory);response=await call('/api/content','owner','PUT',{content:{...visualState.content,visualEditor:originalVisual},revision:visualState.revision-1});assert.equal(response.status,409);assert.equal(JSON.stringify((await call('/api/admin/visual-history','owner')).data.entries),historyBeforeStale);
const rollbackTarget=visualHistory[3],retainedTitle=visualState.content.tours[0].title;response=await call('/api/content','owner','PUT',{content:visualState.content,revision:visualState.revision,visualRestore:rollbackTarget.id});assert.equal(response.status,200);visualState=(await call('/api/state','owner')).data;assert.deepEqual(visualState.content.visualEditor,rollbackTarget.before);assert.equal(visualState.content.tours[0].title,retainedTitle);
visualHistory=(await call('/api/admin/visual-history','owner')).data.entries;assert.equal(visualHistory.length,10);assert.equal(visualHistory[0].kind,'restore');assert.equal(visualHistory[0].restoredId,rollbackTarget.id);
response=await call('/api/content','owner','PUT',{content:visualState.content,revision:visualState.revision,visualRestore:-1});assert.equal(response.status,404);
response=await call('/api/content','tourist','PUT',{content:visualState.content,revision:visualState.revision,visualRestore:visualHistory[0].id});assert.equal(response.status,403);
const undoRollback=visualHistory[0];response=await call('/api/content','owner','PUT',{content:visualState.content,revision:visualState.revision,visualRestore:undoRollback.id});assert.equal(response.status,200);assert.deepEqual((await call('/api/state','owner')).data.content.visualEditor,undoRollback.before);
console.log('PASS: ten durable private visual snapshots, chronological order, no stale-write snapshot, exact rollback preserving content, missing version rejection and reversible rollback.');

// Only an existing invitation AND its bound email can receive full in-app access.
env.TEST_AUTH_UNTIL=new Date(Date.now()+86400000).toISOString();env.DEMO_AUTH_INVITES=JSON.stringify([{id:editorId,hash:hash('ATEDITORCODE'),role:'editor'}]);env.APP_ADMIN_INVITE=JSON.stringify({hash:hash('ATEDITORCODE'),email:'editor@example.com'});
response=await call('/api/state','','GET',undefined,{cookie:editorCookie});assert.equal(response.data.admin,true);assert.equal(response.data.editor,false);
assert.equal((await call('/api/admin/visual-history','','GET',undefined,{cookie:editorCookie})).status,200);assert.equal((await call('/api/admin/logins','','GET',undefined,{cookie:editorCookie})).status,200);assert.equal((await call('/api/moderation','','GET',undefined,{cookie:editorCookie})).status,200);
const fullState=response.data,fullContent=structuredClone(fullState.content);fullContent.site.title='Full admin setting';response=await call('/api/content','','PUT',{content:fullContent,revision:fullState.revision},{cookie:editorCookie});assert.equal(response.status,200);
env.APP_ADMIN_INVITE=JSON.stringify({hash:hash('ATEDITORCODE'),email:'different@example.com'});response=await call('/api/state','','GET',undefined,{cookie:editorCookie});assert.equal(response.data.editor,true);assert.equal((await call('/api/admin/visual-history','','GET',undefined,{cookie:editorCookie})).status,403);
env.APP_ADMIN_INVITE=JSON.stringify({hash:hash('WRONGCODE'),email:'editor@example.com'});response=await call('/api/state','','GET',undefined,{cookie:editorCookie});assert.equal(response.data.editor,true);
env.APP_ADMIN_INVITE=JSON.stringify({hash:hash('ATEDITORCODE'),email:'editor@example.com'});response=await call('/api/state','','GET',undefined,{cookie:cookie2});assert.equal(response.data.admin,false);env.DEMO_AUTH_INVITES='[]';response=await call('/api/state','','GET',undefined,{cookie:editorCookie});assert.equal(response.data.user,null);
console.log('PASS: full in-app admin requires exact invitation plus bound email; other invites unchanged; removal immediately revokes access.');


// New transfer requests enforce the chosen direction, address, season and deadline.
const transferPayload={via:'WhatsApp',direction:'arrival',terminalId:'sukhum-rail',cityId:'gagra',clsId:'standard',cls:'Легковой автомобиль',pax:2,address:'Улица 1, дом 2',hotel:'Гостиница',flight:'SU 100',date:'2027-07-10',time:'12:00',name:'Турист',phone:'+79401234567'};
for(const via of ['', 'SMS']){const rejected=await call('/api/list','tourist','POST',{kind:'transfers',items:[{...transferPayload,via,code:'TR-VIA-'+(via||'EMPTY')}]});assert.equal(rejected.status,400);assert.match(rejected.data.error,/WhatsApp|Telegram/)}

response=await call('/api/list','tourist','POST',{kind:'transfers',items:[{...transferPayload,code:'TR-NEW-ARRIVAL'}]});assert.equal(response.status,200);assert.equal(JSON.parse(sqlite.prepare('SELECT body FROM records WHERE id=?').get('TR-NEW-ARRIVAL').body).address,transferPayload.address);
response=await call('/api/list','tourist','POST',{kind:'transfers',items:[{...transferPayload,code:'TR-NO-ADDRESS',address:''}]});assert.equal(response.status,400);
response=await call('/api/list','tourist','POST',{kind:'transfers',items:[{...transferPayload,code:'TR-WINTER',date:'2027-01-10',clsId:'group',cls:'Групповой трансфер'}]});assert.equal(response.status,400);
const moscowIn=hours=>new Date(Date.now()+(hours+3)*3600000).toISOString();const soon=moscowIn(6),later=moscowIn(13);response=await call('/api/list','tourist','POST',{kind:'transfers',items:[{...transferPayload,code:'TR-LATE',direction:'departure',date:soon.slice(0,10),time:soon.slice(11,16)}]});assert.equal(response.status,400);assert.ok(response.data.error.includes('12 часов'));
response=await call('/api/list','tourist','POST',{kind:'transfers',items:[{...transferPayload,code:'TR-DEPARTURE',direction:'departure',terminalId:'gagra-rail',date:later.slice(0,10),time:later.slice(11,16)}]});assert.equal(response.status,200);
let stopState=(await call('/api/state','owner')).data;const pointIds=['gagra','pitsunda','ritsa','gudauta','afon','suhum','kamany','gulripsh','dranda','ochamchira','tkuarchal','gal'],stopList=pointIds.map(id=>({id,name:id,district:'gudauta',lat:'',lon:''}));const addedStop={id:'custom-test',name:'Тестовая остановка',district:'gudauta',lat:43.478,lon:40.535};stopList.push(addedStop);
response=await call('/api/content','owner','PUT',{content:{...stopState.content,routeStops:stopList},revision:stopState.revision});assert.equal(response.status,200,JSON.stringify(response.data));stopState=(await call('/api/state','owner')).data;
const usedId=stopState.content.tours.find(t=>t.pin)?.pin;response=await call('/api/content','owner','PUT',{content:{...stopState.content,routeStops:stopList.filter(s=>s.id!==usedId)},revision:stopState.revision});assert.equal(response.status,400);
let customFetches=0;const originalRoadFetch=globalThis.fetch;globalThis.fetch=async()=>{customFetches++;return Response.json({code:'Ok',routes:[{distance:1000,geometry:{coordinates:[[40.27,43.28],[40.535,43.478]]}}],waypoints:[{location:[40.27,43.28]},{location:[40.535,43.478]}]})};
response=await call('/api/road-route?from=Гагра&stops=custom-test','');assert.equal(response.status,200);assert.equal(response.data.distanceKm,1);const editedStops=structuredClone(stopList);editedStops.at(-1).lon=40.6;response=await call('/api/content','owner','PUT',{content:{...stopState.content,routeStops:editedStops},revision:stopState.revision});assert.equal(response.status,200);response=await call('/api/road-route?from=Гагра&stops=custom-test','');assert.equal(response.status,200);assert.equal(customFetches,2,'Changing coordinates invalidates the route cache');globalThis.fetch=originalRoadFetch;
console.log('PASS: persisted addresses, server-side transfer deadline/winter rules, custom coordinate routes, cache invalidation and in-use stop deletion protection.');

response=await call('/api/list','tourist','POST',{kind:'bookings',items:[{code:'AT-COMFORT',tour:'other',name:'Изменённое имя'}]});assert.equal(response.status,200);assert.equal(response.data.records[0].name,'Ирина');assert.equal(response.data.records[0].tour,'ritsa');assert.equal(response.data.records[0].assignee,undefined);response=await call('/api/list','other','POST',{kind:'bookings',items:[{code:'AT-COMFORT',name:'Другой'}]});assert.equal(response.status,200);assert.equal(response.data.records.length,0);
console.log('PASS: duplicate submission acknowledges the original stored request and never reveals another customer’s request.');


// Canonical numbers are assigned on the server and stable for the owner's retry token.
const numberedPayload={requestToken:'unique-client-request-token',tour:'ritsa',date:'2027-01-15',time:'09:00',adults:2,kids:0,name:'Ирина',phone:'+79400000000',total:3800,payment:{verifiedAt:'forged'}};
response=await call('/api/list','tourist','POST',{kind:'bookings',items:[numberedPayload]});assert.equal(response.status,200);const numbered=response.data.records[0];assert.match(numbered.code,/^AT-[A-F0-9]{20}$/);assert.equal(numbered.status,'private');assert.equal(numbered.payment,undefined);response=await call('/api/list','tourist','POST',{kind:'bookings',items:[{...numberedPayload,name:'Повтор'}]});assert.equal(response.data.records[0].code,numbered.code);assert.equal(response.data.records[0].name,'Ирина');
response=await call('/api/order-status','owner','PUT',{id:numbered.code,kind:'bookings',status:'awaiting_payment'});assert.equal(response.status,400);const invoice={id:'invoice-test',amount:3800,qrUrl:'https://pay.example/qr.png',paymentUrl:'https://pay.example/pay',expiresAt:new Date(Date.now()+3600000).toISOString()};response=await call('/api/order-status','owner','PUT',{id:numbered.code,kind:'bookings',status:'awaiting_payment',payment:invoice});assert.equal(response.status,200);response=await call('/api/my-orders','tourist');assert.equal(response.data.orders.find(x=>x.code===numbered.code).payment.id,invoice.id);
assert.equal((await call('/api/payment-webhook','','POST',{})).status,503);env.PAYMENT_WEBHOOK_SECRET='test-only-hook-secret';const hookEvent={eventId:'event-test',code:numbered.code,kind:'bookings',status:'paid',paymentId:invoice.id,amount:380000,currency:'RUB'};
async function signedHook(event,timestamp=String(Date.now()),badSignature=false){const text=JSON.stringify(event),encoder=new TextEncoder(),key=await crypto.subtle.importKey('raw',encoder.encode(env.PAYMENT_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']),signature=Buffer.from(await crypto.subtle.sign('HMAC',key,encoder.encode(timestamp+'.'+text))).toString('hex');const res=await siteAPI(new Request('https://test.example/api/payment-webhook',{method:'POST',headers:{'Content-Type':'application/json','X-Apsua-Payment-Timestamp':timestamp,'X-Apsua-Payment-Signature':badSignature?'0'.repeat(64):signature},body:text}),env);return {status:res.status,data:await res.json()}}
assert.equal((await signedHook(hookEvent,String(Date.now()),true)).status,401);assert.equal((await signedHook(hookEvent,String(Date.now()-600000))).status,401);assert.equal((await signedHook({...hookEvent,amount:1})).status,409);response=await signedHook(hookEvent);assert.equal(response.status,200);assert.equal(response.data.status,'paid');response=await signedHook(hookEvent);assert.equal(response.data.duplicate,true);response=await call('/api/my-orders','tourist');const paidReceipt=response.data.orders.find(x=>x.code===numbered.code);assert.equal(paidReceipt.status,'paid');assert.equal(paidReceipt.payment.source,'server');assert.ok(paidReceipt.payment.verifiedAt);
console.log('PASS: server-issued stable numbers, real invoice lifecycle, signed amount-checked payment callbacks, replay protection and durable customer receipts.');

const clarifyBooking={code:'AT-CLARIFY',tour:'ritsa',date:'2027-01-15',time:'09:00',adults:2,kids:0,name:'Ирина',phone:'+79400000000',clarification:{id:'forged',field:'name'}};response=await call('/api/list','tourist','POST',{kind:'bookings',items:[clarifyBooking]});assert.equal(response.status,200);assert.equal(response.data.records[0].clarification,undefined);response=await call('/api/order-status','owner','PUT',{id:clarifyBooking.code,kind:'bookings',status:'needs_info'});assert.equal(response.status,400);response=await call('/api/order-status','owner','PUT',{id:clarifyBooking.code,kind:'bookings',status:'needs_info',clarification:{field:'address',prompt:'Адрес'}});assert.equal(response.status,400);response=await call('/api/order-status','owner','PUT',{id:clarifyBooking.code,kind:'bookings',status:'needs_info',clarification:{field:'phone',prompt:'Укажите актуальный номер'}});assert.equal(response.status,200);const phoneQuestion=response.data.order.clarification;const reply={code:clarifyBooking.code,kind:'bookings',clarificationId:phoneQuestion.id,answer:'+79401112233'};assert.equal((await call('/api/order-clarification','other','POST',reply)).status,404);assert.equal((await call('/api/order-clarification','','POST',reply)).status,401);assert.equal((await call('/api/order-clarification','tourist','POST',{...reply,clarificationId:'old'})).status,409);assert.equal((await call('/api/order-clarification','tourist','POST',{...reply,answer:'12'})).status,400);response=await call('/api/order-clarification','tourist','POST',reply);assert.equal(response.status,200);assert.equal(response.data.order.phone,reply.answer);assert.equal(response.data.order.status,'pending');assert.equal((await call('/api/order-clarification','tourist','POST',reply)).status,409);response=await call('/api/order-status','owner','PUT',{id:clarifyBooking.code,kind:'bookings',status:'needs_info',clarification:{field:'manual',prompt:'Что ещё нужно для встречи?'}});assert.equal(response.status,200);const manualQuestion=response.data.order.clarification;response=await call('/api/order-clarification','tourist','POST',{...reply,clarificationId:manualQuestion.id,answer:'Нужно детское кресло'});assert.equal(response.status,200);assert.equal(response.data.order.phone,reply.answer);assert.equal(response.data.order.clarification.answer,'Нужно детское кресло');assert.equal(response.data.order.clarificationHistory[0].answer,reply.answer);response=await call('/api/state','owner');assert.equal(response.data.lists.bookings.find(x=>x.code===clarifyBooking.code).clarification.answer,'Нужно детское кресло');console.log('PASS: structured clarification updates only the chosen field; manual replies reach the operator; ownership, stale requests and duplicate replies are enforced.');
response=await call('/api/order-status','owner','PUT',{id:clarifyBooking.code,kind:'bookings',status:'confirmed'});assert.equal(response.status,200);assert.ok(response.data.order.clarification.reviewedAt);assert.equal(response.data.order.clarification.reviewedStatus,'confirmed');assert.equal(response.data.order.clarification.answer,'Нужно детское кресло');assert.equal(response.data.order.code,clarifyBooking.code);

// Fleet preferences are non-binding, validated against server catalog; assignments are never client-owned.
const fleetState=(await call('/api/state','owner')).data;
const fleetVehicle={id:'van-test',name:'Тестовый минивэн',type:'minivan',capacity:7,luggage:5,photos:['/assets/transfer-panorama.webp'],features:['Кондиционер'],transfer:true,excursion:true,individual:true,group:true,hidden:false,example:false,transferClassIds:[]};
fleetState.content.fleet={vehicles:[fleetVehicle],company:{title:'О компании',intro:'',body:'',partners:''}};
response=await call('/api/content','owner','PUT',{content:fleetState.content,revision:fleetState.revision});assert.equal(response.status,200);
const fleetRequest={requestToken:'fleet-preference-owner-token',tour:'ritsa',date:'2027-01-15',time:'09:00',format:'individual',adults:2,kids:0,name:'Ирина',phone:'+79400000000',preferredVehicleId:'van-test',preferredVehicle:{name:'Подмена'},assignedVehicle:{title:'Поддельная машина',registration:'FAKE'},vehicleAssignment:{id:'fake'}};
response=await call('/api/list','tourist','POST',{kind:'bookings',items:[fleetRequest]});assert.equal(response.status,200);const fleetAck=response.data.records[0];assert.equal(fleetAck.preferredVehicle.name,'Тестовый минивэн');assert.equal(fleetAck.assignedVehicle,undefined);assert.equal(fleetAck.vehicleAssignment,undefined);
for(const [token,change]of [['group',{format:'group'}],['capacity',{adults:8}],['missing',{preferredVehicleId:'missing'}]]){response=await call('/api/list','tourist','POST',{kind:'bookings',items:[{...fleetRequest,...change,requestToken:'fleet-invalid-'+token}]});assert.equal(response.status,400)}
const assigned={id:'dispatch-01',title:'Назначен сервером',registration:'А123АА',photo:'/assets/transfer-panorama.webp',driver:{name:'Водитель',phone:'+79400000000'},assignedAt:new Date().toISOString()};
const record=sqlite.prepare('SELECT body,updated FROM records WHERE id=?').get(fleetAck.code);sqlite.prepare('UPDATE records SET body=?,updated=? WHERE id=?').run(JSON.stringify({...JSON.parse(record.body),assignedVehicle:assigned}),record.updated+1,fleetAck.code);
response=await call('/api/my-orders','tourist');assert.equal(response.data.orders.find(x=>x.code===fleetAck.code).assignedVehicle.registration,'А123АА');response=await call('/api/my-orders','other');assert.ok(!response.data.orders.some(x=>x.code===fleetAck.code));
response=await call('/api/list','tourist','POST',{kind:'bookings',items:[fleetRequest]});assert.equal(response.data.records[0].assignedVehicle.title,'Назначен сервером','retry must never overwrite dispatcher assignment');
const invalidFleetState=(await call('/api/state','owner')).data;invalidFleetState.content.fleet.vehicles[0].photos=['javascript:alert(1)'];response=await call('/api/content','owner','PUT',{content:invalidFleetState.content,revision:invalidFleetState.revision});assert.equal(response.status,400);
console.log('PASS: server-owned fleet compatibility, capacity, group restriction, sanitized preference snapshot, forged assignment rejection, idempotent retries and private dispatcher data.');

// 13.6–13.7: server-authoritative prices, protected orders, strict transfers, re-moderation, no auto-publication, no 1000-row cap.
{const base={tour:"ritsa",date:FUTURE_DATE,time:"09:00",adults:2,kids:1,name:"Ирина",phone:"+79400000001",city:"Сухум",format:"group"};
response=await call("/api/list","price-user","POST",{kind:"bookings",items:[{...base,requestToken:"price-check-1",total:1}]});assert.equal(response.status,200);
let order=(await call("/api/my-orders","price-user")).data.orders[0];assert.equal(order.total,2*2600+2100,"server recomputes the total from the catalogue");assert.equal(order.clientTotal,1);assert.equal(order.priceSource,"server");
response=await call("/api/list","price-user","POST",{kind:"bookings",items:[{...base,requestToken:"price-check-2",date:"2020-01-01"}]});assert.equal(response.status,400,"past dates are rejected");
response=await call("/api/list","price-user","POST",{kind:"bookings",items:[{...base,requestToken:"price-check-3",tour:"no-such-tour"}]});assert.equal(response.status,400,"unknown tours are rejected");
response=await call("/api/list","price-user","POST",{kind:"bookings",items:[{...base,requestToken:"price-check-4",time:"03:00"}]});assert.equal(response.status,400,"times outside the schedule are rejected");
response=await call("/api/list","price-user","POST",{kind:"bookings",items:[],deleted:[order.code]});assert.equal(response.status,200);
assert.ok((await call("/api/my-orders","price-user")).data.orders.some(x=>x.code===order.code),"customers cannot delete their requests");
response=await call("/api/list","price-user","POST",{kind:"transfers",items:[{requestToken:"transfer-no-direction",date:FUTURE_DATE,name:"Ирина",phone:"+79400000001"}]});assert.equal(response.status,400,"transfer direction is mandatory");
for(let i=0;i<1100;i++)sqlite.prepare("INSERT INTO records (id,kind,owner,body,status,created,updated) VALUES (?,?,?,?,?,?,?)").run("bulk-upload-"+i,"upload","bulk-"+i,"{}","private",Date.now()+1000,Date.now()+1000);
assert.ok((await call("/api/state","owner")).data.lists.bookings.some(x=>x.code===order.code),"service rows never push orders out of the admin list");
const s={id:"remoderate-story",t:"Рассвет на Рице",x:"Встали в пять утра, чтобы увидеть озеро без людей.",a:"Ирина, октябрь"};
response=await call("/api/list","story-user","POST",{kind:"diary",items:[s]});assert.equal(response.status,200);
sqlite.prepare("UPDATE records SET created=? WHERE id=?").run(Date.now()-10*86400000,s.id);
assert.equal((await call("/api/state","story-user")).data.lists.diary.find(x=>x.id===s.id).status,"pending","stories are never published automatically");
response=await call("/api/moderation","owner","PUT",{id:s.id,status:"published"});assert.equal(response.status,200);
response=await call("/api/list","story-user","POST",{kind:"diary",items:[{...s,status:"published"}]});assert.equal(response.status,200);
assert.equal((await call("/api/state","other")).data.lists.diary.find(x=>x.id===s.id)?.status,"published","an unchanged resubmission keeps the story published");
response=await call("/api/list","story-user","POST",{kind:"diary",items:[{...s,x:"Теперь здесь совсем другой текст со ссылкой."}]});assert.equal(response.status,200);
assert.equal((await call("/api/state","story-user")).data.lists.diary.find(x=>x.id===s.id).status,"pending","an edited published story returns to moderation");
console.log("PASS: server prices, order protection, strict transfers, re-moderation after edits, no auto-publication and admin lists beyond 1000 service rows.");}

// 14.0: sign-in with Telegram — signed widget data creates a session; tampered or stale data is refused.
{const {createHmac,createHash}=await import("node:crypto");const botToken="123456:TEST-TOKEN";
const sign=(fields)=>{const check=Object.keys(fields).sort().map(k=>k+"="+fields[k]).join("\n");return createHmac("sha256",createHash("sha256").update(botToken).digest()).update(check).digest("hex")};
const tgCall=async(query)=>{const r=await siteAPI(new Request("https://test.example/api/telegram-auth?"+new URLSearchParams(query)),env);return {status:r.status,location:r.headers.get("Location"),cookie:r.headers.get("Set-Cookie")}};
const fields={id:"987654321",first_name:"Ирина",last_name:"Тестова",username:"irina_t",auth_date:String(Math.floor(Date.now()/1000))};
let r=await tgCall({...fields,hash:sign(fields)});assert.equal(r.location,"https://test.example/?login=unavailable#/account","no token configured: login is unavailable");
assert.equal((await call("/api/state","")).data.telegramAuth.enabled,false);
env.TELEGRAM_BOT_TOKEN=botToken;
assert.deepEqual((await call("/api/state","")).data.telegramAuth,{enabled:true,bot:"ApsuaturBot"});
r=await tgCall({...fields,hash:sign({...fields,first_name:"Другое"})});assert.equal(r.location,"https://test.example/?login=failed#/account","tampered data is refused");assert.equal(r.cookie,null);
const old={...fields,auth_date:String(Math.floor(Date.now()/1000)-2*86400)};r=await tgCall({...old,hash:sign(old)});assert.equal(r.location,"https://test.example/?login=failed#/account","stale data is refused");
r=await tgCall({...fields,hash:sign(fields)});assert.equal(r.status,302);assert.equal(r.location,"https://test.example/#/account");
const cookie=r.cookie.split(";")[0];assert.match(cookie,/^__Host-apsua_tg=[a-f0-9]{64}$/);assert.match(r.cookie,/HttpOnly/);
let state=(await call("/api/state","","GET",undefined,{cookie})).data;assert.equal(state.user.id,"tg:987654321");assert.equal(state.user.name,"Ирина Тестова");assert.equal(state.user.authKind,"telegram");assert.equal(state.user.telegram,"irina_t");assert.equal(state.admin,false);
response=await call("/api/list","","POST",{kind:"bookings",items:[{tour:"ritsa",date:FUTURE_DATE,time:"09:00",adults:1,kids:0,name:"Ирина",phone:"+79400000002",city:"Сухум",format:"group",requestToken:"tg-booking-1"}]},{cookie});assert.equal(response.status,200,"a Telegram user can send a request");const tgBookingCode=response.data.records[0].code;
assert.equal((await call("/api/my-orders","","GET",undefined,{cookie})).data.orders.length,1);
let staff=await call("/api/admin/staff","owner");assert.equal(staff.status,200);assert.equal(staff.data.staff.find(x=>x.id==="tg:987654321").username,"irina_t");assert.equal((await call("/api/admin/staff","","GET",undefined,{cookie})).status,403);
response=await call("/api/admin/staff","owner","PUT",{userId:"tg:987654321",role:"dispatcher"});assert.equal(response.status,200);assert.equal(response.data.staff.find(x=>x.id==="tg:987654321").role,"dispatcher");
state=(await call("/api/state","","GET",undefined,{cookie})).data;assert.equal(state.admin,true);assert.equal(state.staffRole,"dispatcher");assert.ok(state.lists.bookings.length>1,"dispatcher sees all requests");
response=await call("/api/order-status","","PUT",{id:tgBookingCode,kind:"bookings",status:"confirmed"},{cookie});assert.equal(response.status,200,"dispatcher can update a request");
response=await call("/api/content","","PUT",{content:state.content,revision:state.revision},{cookie});assert.equal(response.status,403,"dispatcher cannot edit site content");
await call("/api/admin/staff","owner","PUT",{userId:"tg:987654321",role:"observer"});state=(await call("/api/state","","GET",undefined,{cookie})).data;assert.equal(state.staffRole,"observer");assert.equal((await call("/api/order-status","","PUT",{id:tgBookingCode,kind:"bookings",status:"completed"},{cookie})).status,403,"observer is read-only");
await call("/api/admin/staff","owner","PUT",{userId:"tg:987654321",role:""});state=(await call("/api/state","","GET",undefined,{cookie})).data;assert.equal(state.admin,false);assert.equal(state.staffRole,"");
response=await call("/api/telegram-logout","","POST",{}, {cookie,origin:"https://evil.example"});assert.equal(response.status,403);
response=await call("/api/telegram-logout","","POST",{}, {cookie});assert.equal(response.status,200);assert.match(response.cookie,/Max-Age=0/);
assert.equal((await call("/api/state","","GET",undefined,{cookie})).data.user,null,"the session ends on logout");
delete env.TELEGRAM_BOT_TOKEN;
console.log("PASS: Telegram sign-in verifies the signature and age, staff search data is private, dispatcher/observer rights are enforced and revocation is immediate.");}

// 14.0: a tourist cancels their own request before payment; paid requests stay with the dispatcher.
{const base={tour:"ritsa",date:FUTURE_DATE,time:"09:00",adults:1,kids:0,name:"Ирина",phone:"+79400000009",city:"Сухум",format:"group"};
response=await call("/api/list","cancel-user","POST",{kind:"bookings",items:[{...base,requestToken:"cancel-check-1"}]});const code=response.data.records[0].code;
response=await call("/api/order-cancel","other","POST",{code,kind:"bookings"});assert.equal(response.status,404,"only the owner can cancel");
response=await call("/api/order-cancel","cancel-user","POST",{code,kind:"bookings"},{origin:"https://evil.example"});assert.equal(response.status,403);
response=await call("/api/order-cancel","cancel-user","POST",{code,kind:"bookings"});assert.equal(response.status,200);assert.equal(response.data.order.status,"cancelled");assert.equal(response.data.order.cancelledBy,"customer");
response=await call("/api/order-cancel","cancel-user","POST",{code,kind:"bookings"});assert.equal(response.status,409);
response=await call("/api/list","cancel-user","POST",{kind:"bookings",items:[{...base,requestToken:"cancel-check-2"}]});const paidCode=response.data.records[0].code;
response=await call("/api/order-status","owner","PUT",{id:paidCode,kind:"bookings",status:"paid"});assert.equal(response.status,200);
response=await call("/api/order-cancel","cancel-user","POST",{code:paidCode,kind:"bookings"});assert.equal(response.status,409,"after payment only the dispatcher cancels");
response=await call("/api/list","cancel-user","POST",{kind:"bookings",items:[{...base,requestToken:"cancel-check-3",assignedGuide:{name:"Подделка"},rejectionReason:"x",dispatchNumber:"FAKE"}]});
const forged=(await call("/api/my-orders","cancel-user")).data.orders.find(o=>o.code===response.data.records[0].code);assert.equal(forged.assignedGuide,undefined);assert.equal(forged.dispatchNumber,undefined);assert.equal(forged.rejectionReason,undefined);
console.log("PASS: tourists cancel their own unpaid requests; paid requests and dispatcher fields stay server-owned.");}

// 14.0: dispatcher program exchange — outbound request with the server number, signed inbound decisions.
{const {createHmac}=await import("node:crypto");const secret="dispatch-secret-test";const realFetch=globalThis.fetch;const sent=[];
globalThis.fetch=async(url,init)=>{if(String(url).startsWith("https://dispatch.test/")){sent.push(JSON.parse(init.body));assert.equal(init.headers.Authorization,"Bearer dispatch-token");return new Response(JSON.stringify({number:"D-100",status:"pending"}),{status:200,headers:{"Content-Type":"application/json"}})}return realFetch(url,init)};
env.DISPATCH_API_URL="https://dispatch.test/requests";env.DISPATCH_API_TOKEN="dispatch-token";
response=await call("/api/list","dispatch-user","POST",{kind:"bookings",items:[{tour:"ritsa",date:FUTURE_DATE,time:"09:00",adults:2,kids:0,name:"Ирина",phone:"+79400000010",city:"Сухум",format:"group",hotel:"Амра",requestToken:"dispatch-1"}]});assert.equal(response.status,200);
const code=response.data.records[0].code;assert.equal(response.data.records[0].dispatchNumber,"D-100","the server number comes back to the tourist");assert.equal(sent.length,1);assert.equal(sent[0].event,"created");assert.equal(sent[0].request.siteCode,code);assert.equal(sent[0].request.tour.title.length>0,true);assert.equal(sent[0].request.hotel,"Амра");
const hook=async(body,{sig,ts}={})=>{const raw=JSON.stringify(body),stamp=ts||String(Date.now());const r=await siteAPI(new Request("https://test.example/api/dispatch-webhook",{method:"POST",headers:{"X-Apsua-Dispatch-Timestamp":stamp,"X-Apsua-Dispatch-Signature":sig||createHmac("sha256",secret).update(stamp+"."+raw).digest("hex"),"Content-Type":"application/json"},body:raw}),env);return {status:r.status,data:await r.json()}};
assert.equal((await hook({eventId:"e0",siteCode:code,kind:"bookings",status:"confirmed"})).status,503,"disabled until the secret is set");
env.DISPATCH_WEBHOOK_SECRET=secret;
assert.equal((await hook({eventId:"e1",siteCode:code,kind:"bookings",status:"confirmed"},{sig:"0".repeat(64)})).status,401);
assert.equal((await hook({eventId:"e1",siteCode:code,kind:"bookings",status:"confirmed"})).data.status,"confirmed");
assert.equal((await hook({eventId:"e1",siteCode:code,kind:"bookings",status:"rejected"})).data.duplicate,true,"repeated events are ignored");
assert.equal((await hook({eventId:"e2",siteCode:code,kind:"bookings",status:"awaiting_payment"})).status,400,"no invoice, no payment status");
assert.equal((await hook({eventId:"e3",siteCode:code,kind:"bookings",status:"awaiting_payment",payment:{id:"inv-9",amount:5200,qrUrl:"https://qr.nspk.ru/AD10",expiresAt:new Date(Date.now()+3600000).toISOString()}})).data.status,"awaiting_payment");
assert.equal((await hook({eventId:"e4",siteCode:code,kind:"bookings",status:"paid",pickupTime:"08:20",pickupPoint:"Амра, главный вход",guide:{name:"Астамур Кварчелия",phone:"+7 940 555-01-01",photo:"javascript:alert(1)"},vehicle:{title:"Mercedes Sprinter",color:"белый",registration:"А 482 ВК",driver:{name:"Беслан Агрба",phone:"+79405550202",photo:"https://example.org/d.jpg"}},extra:"ignored"})).data.status,"paid");
const order=(await call("/api/my-orders","dispatch-user")).data.orders.find(o=>o.code===code);
assert.equal(order.dispatchNumber,"D-100");assert.equal(order.pickupTime,"08:20");assert.equal(order.assignedGuide.name,"Астамур Кварчелия");assert.equal(order.assignedGuide.phone,"+79405550101");assert.equal(order.assignedGuide.photo,"","unsafe photo links are dropped");
assert.equal(order.assignedVehicle.registration,"А 482 ВК");assert.equal(order.assignedVehicle.driver.photo,"https://example.org/d.jpg");assert.equal(order.extra,undefined);assert.equal(order.payment.id,"inv-9");
assert.equal((await call("/api/order-cancel","dispatch-user","POST",{code,kind:"bookings"})).status,409,"paid requests are cancelled only by the dispatcher");
globalThis.fetch=realFetch;delete env.DISPATCH_API_URL;delete env.DISPATCH_API_TOKEN;delete env.DISPATCH_WEBHOOK_SECRET;
console.log("PASS: dispatcher exchange: outbound request returns the server number; signed, idempotent inbound decisions set status, invoice, pickup, guide, vehicle and driver; unsafe data is dropped.");}

sqlite.close();
