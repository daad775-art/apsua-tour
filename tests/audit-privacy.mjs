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
const dispatchJs=ts.transpileModule(readFileSync(new URL('../lib/dispatch.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {dispatchPayload}=await import('data:text/javascript;base64,'+Buffer.from(dispatchJs).toString('base64'));const dispatchPayloadForTest=d=>dispatchPayload('transfers',d.code,'owner-id',d);
const {siteAPI,seoFile,pageShellFor}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../drizzle/0000_demonic_black_cat.sql',import.meta.url),'utf8'));
const DB={prepare(sql){let values=[];return {bind(...v){values=v;return this},async first(){return sqlite.prepare(sql).get(...values)||null},async all(){return {results:sqlite.prepare(sql).all(...values)}},async run(){const r=sqlite.prepare(sql).run(...values);return {meta:{changes:Number(r.changes)}}}}},async batch(items){return Promise.all(items.map(x=>x.run()))}};
const files=new Map();const BUCKET={async put(key,bytes,options){files.set(key,{bytes,...options})},async head(key){return files.get(key)||null}};
const env={DB,BUCKET,SITE_OWNER_EMAIL:'owner@example.com'};
// Audit follow-up (build 166): privacy of author IDs and trip counts, server-owned transfer price, role checks, 4xx on bad input.
async function call(path,user='tourist',method='GET',data,options={}){const headers={...(options.headers||{})};if(user){headers['oai-authenticated-user-id']=user;headers['oai-authenticated-user-email']=user+'@example.com'}if(method!=='GET')headers.origin='https://test.example';if(data!==undefined)headers['Content-Type']='application/json';const body=data===undefined?undefined:options.raw?data:JSON.stringify(data);const response=await siteAPI(new Request('https://test.example'+path,{method,headers,body}),env);const text=await response.text();let parsed=null;try{parsed=JSON.parse(text)}catch{}return {status:response.status,data:parsed,text}}
const telegramUser='tg:123456789',guest='chatgpt-user-42';
// Owner publishes a guest story; a Telegram user and another guest comment on it.
await call('/api/profile',telegramUser,'PUT',{name:'Астамур'});await call('/api/profile',guest,'PUT',{name:'Мария'});
let response=await call('/api/list',telegramUser,'POST',{kind:'diary',items:[{id:'story-privacy',t:'Рица осенью',x:'Красивая дорога к озеру, туман и горы.',a:'Астамур, октябрь'}]});assert.equal(response.status,200);
response=await call('/api/moderation','owner','PUT',{id:'story-privacy',status:'published'});assert.equal(response.status,200);
response=await call('/api/story',guest,'POST',{id:'story-privacy',action:'comment',text:'Спасибо за совет!'});assert.equal(response.status,200);
for(const viewer of ['',guest,'owner']){response=await call('/api/state',viewer);assert.equal(response.status,200);const lists=JSON.stringify({diary:response.data.lists.diary,reviews:response.data.lists.reviews});for(const internal of [telegramUser,'123456789',guest])assert.ok(!lists.includes(internal),`internal ID ${internal} must not reach ${viewer||'anonymous'} in public lists`);const story=response.data.lists.diary.find(s=>s.id==='story-privacy');assert.match(story.uid,/^p[a-f0-9]{24}$/);assert.match(story.comments[0].uid,/^p[a-f0-9]{24}$/);assert.notEqual(story.uid,story.comments[0].uid);assert.equal(story.authorName,'Астамур','story stays linked to its author');assert.equal(story.comments[0].author,'Мария','comment stays linked to its author')}
const authorPublicId=(await call('/api/state','')).data.lists.diary.find(s=>s.id==='story-privacy').uid;
assert.equal((await call('/api/state',telegramUser)).data.user.publicId,authorPublicId,'the same public ID for every viewer and for the author');
response=await call('/api/moderation','owner');assert.ok(!JSON.stringify(response.data).includes(telegramUser),'moderation list uses public IDs too');
// Tourist card: public by public ID, never by an internal ID for strangers; trip counts only for the person and order staff.
response=await call('/api/tourist?id='+authorPublicId,'');assert.equal(response.status,200);assert.equal(response.data.profile.name,'Астамур');assert.equal(response.data.profile.id,authorPublicId);for(const key of ['excursions','transfers','email','phone'])assert.equal(response.data.profile[key],undefined,key+' is private');
for(const viewer of ['',guest])assert.equal((await call('/api/tourist?id='+encodeURIComponent(telegramUser),viewer)).status,404,'an internal ID does not open a stranger\'s card');
response=await call('/api/tourist?id='+encodeURIComponent(telegramUser),'owner');assert.equal(response.status,200);assert.equal(typeof response.data.profile.excursions,'number','staff see counts');
response=await call('/api/tourist?id='+encodeURIComponent(telegramUser),telegramUser);assert.equal(response.data.profile.canEdit,true);assert.equal(typeof response.data.profile.transfers,'number','the person sees their own counts');
assert.equal((await call('/api/tourist?id=p'+'0'.repeat(24),'')).status,404,'unknown public ID');
// Ratings are keyed by public ID; a voter who published nothing does not get a resolvable card.
assert.equal((await call('/api/story',telegramUser,'POST',{id:'story-privacy',action:'rate',rating:5})).status,200);assert.equal((await call('/api/story','voter-only','POST',{id:'story-privacy',action:'rate',rating:3})).status,200);
{const st=(await call('/api/state','')).data,story=st.lists.diary.find(s=>s.id==='story-privacy');const keys=Object.keys(story.ratings||{});assert.equal(keys.length,2);assert.ok(keys.every(k=>/^p[a-f0-9]{24}$/.test(k)),'rating keys are public IDs');assert.ok(!JSON.stringify(st).includes('voter-only')&&!JSON.stringify(st).includes(telegramUser),'no internal IDs anywhere in public state');
 const mine=(await call('/api/state',telegramUser)).data;assert.equal(mine.lists.diary.find(s=>s.id==='story-privacy').ratings[mine.user.publicId],5,'own rating found by own public ID');
 const voterKey=keys.find(k=>k!==authorPublicId);assert.equal((await call('/api/tourist?id='+voterKey,'')).status,404,'a voter-only public ID does not open a card')}
console.log('PASS: public lists carry opaque public author IDs (no ChatGPT or Telegram IDs); stories and comments keep their authors; tourist cards open by public ID and trip counts stay private.');

// Transfer formats and price (build 166): only individual and group. Individual = fixed price per car for the route,
// group = price per passenger × passengers, child seat added once, browser price never final, old class ids still readable.
const year=new Date().getUTCFullYear()+1,transferBase={via:'WhatsApp',direction:'arrival',terminalId:'sochi',cityId:'gagra',format:'individual',pax:1,passengerNames:['Ирина Иванова'],address:'Улица 1, дом 2',hotel:'Гостиница',flight:'SU 100',date:`${year}-07-10`,time:'12:00',name:'Турист',phone:'+79401234567'};
const content=JSON.parse(readFileSync(new URL('../lib/site-seed.json',import.meta.url),'utf8')),gagra=content.transfer.to.find(x=>x.id==='gagra'),carPrice=Number(gagra.price),seatPrice=Number(gagra.rates.group);
const names=n=>['Ирина Иванова','Анна Иванова','Олег Иванов','Мария Петрова','Пётр Петров'].slice(0,n);
async function submit(user,token,extra){return call('/api/list',user,'POST',{kind:'transfers',items:[{...transferBase,requestToken:'tr-format-'+token,...extra}]})}
async function transfer(user,token,extra){const r=await submit(user,token,extra);assert.equal(r.status,200,JSON.stringify(r.data));const code=r.data.records[0].code;return (await call('/api/my-orders',user)).data.orders.find(o=>o.code===code)}
let order=await transfer(guest,'individual-1',{price:carPrice});assert.equal(order.format,'individual');assert.equal(order.cls,'Индивидуальный');assert.equal(order.clsId,undefined,'no technical class is stored');assert.equal(order.price,carPrice,'individual, 1 passenger: price per car');assert.equal(order.clientPrice,undefined);
order=await transfer(guest,'individual-4',{pax:4,passengerNames:names(4),price:carPrice});assert.equal(order.price,carPrice,'individual, 4 passengers: the car price is not multiplied');
order=await transfer(guest,'group-3',{format:'group',pax:3,passengerNames:names(3),price:seatPrice*3});assert.equal(order.format,'group');assert.equal(order.cls,'Групповой');assert.equal(order.price,seatPrice*3,'group: price per passenger × passengers');
order=await transfer(guest,'forged-individual',{pax:2,passengerNames:names(2),price:1});assert.equal(order.price,carPrice,'a forged browser price does not change the server price');assert.equal(order.clientPrice,1,'kept apart for diagnostics');
order=await transfer(guest,'forged-group',{format:'group',pax:2,passengerNames:names(2),price:seatPrice});assert.equal(order.price,seatPrice*2);assert.equal(order.clientPrice,seatPrice);
order=await transfer(guest,'seat-flag',{price:100,seat:'yes'});assert.equal(order.seat,false,'only a real true adds a child seat');assert.equal(order.price,carPrice);
{const st=(await call('/api/state','owner')).data;st.content.transfer.seat=300;const saved=await call('/api/content','owner','PUT',{content:st.content,revision:st.revision});assert.equal(saved.status,200,JSON.stringify(saved.data))}
order=await transfer(guest,'seat-individual',{seat:true,pax:3,passengerNames:names(3),price:carPrice});assert.equal(order.price,carPrice+300,'child seat surcharge on top of the car price');assert.equal(order.clientPrice,carPrice);
order=await transfer(guest,'seat-group',{format:'group',seat:true,pax:2,passengerNames:names(2)});assert.equal(order.price,seatPrice*2+300,'child seat surcharge added once to a group transfer');
order=await transfer(guest,'price-on-request',{terminalId:'sukhum-rail',price:999});assert.equal(order.price,null,'no tariff from Sukhum: price on request');assert.equal(order.clientPrice,999);
// The catalogue's class list (order, names, legacy van tariff) has no influence on the price.
{const st=(await call('/api/state','owner')).data;st.content.transfer.classes=[{id:'van',name:'Минивэн',max:7},{id:'group',name:'Групповой',max:21},{id:'standard',name:'Легковой',max:4}];assert.equal((await call('/api/content','owner','PUT',{content:st.content,revision:st.revision})).status,200)}
order=await transfer(guest,'reordered-classes',{pax:2,passengerNames:names(2)});assert.equal(order.price,carPrice+0*1,'individual price ignores classes[0]');
// Capacity: individual up to 4 per car (no multiplication), group up to 21; both can be set in transfer.formats.
assert.equal((await submit(guest,'individual-too-many',{pax:5,passengerNames:names(5)})).status,400,'individual over capacity is refused');
{const st=(await call('/api/state','owner')).data;st.content.transfer.formats={individual:{max:5},group:{max:21}};assert.equal((await call('/api/content','owner','PUT',{content:st.content,revision:st.revision})).status,200);order=await transfer(guest,'individual-5',{pax:5,passengerNames:names(5)});assert.equal(order.price,carPrice+0,'capacity from transfer.formats, price still per car');
 st.content.transfer.formats={individual:{max:0}};assert.equal((await call('/api/content','owner','PUT',{content:{...st.content},revision:st.revision+1})).status,400,'invalid capacity is refused')}
// Old class ids are still accepted on input and read as the two formats; anything else is refused.
for(const [legacy,format] of [['comfort','individual'],['standard','individual'],['van','individual'],['group','group']]){const {format:_,...rest}=transferBase;order=await transfer(guest,'legacy-'+legacy,{...rest,format:undefined,clsId:legacy,cls:'Старое название',pax:2,passengerNames:names(2)});assert.equal(order.format,format,legacy);assert.equal(order.clsId,undefined);assert.equal(order.price,format==='group'?seatPrice*2:carPrice)}
for(const bad of [{format:'van'},{format:'business'},{format:'standard'},{format:'GROUP'},{format:'',clsId:'business'},{format:undefined,clsId:undefined}]){const r=await submit(guest,'bad-'+JSON.stringify(bad).replace(/\W/g,''),bad);assert.equal(r.status,400,'refused: '+JSON.stringify(bad));assert.match(r.data.error,/индивидуальный или групповой/)}
// Old rows exactly as they may sit in D1 (clsId + car class name, no format) open everywhere as one of the two formats; the stored body is not rewritten.
const legacyRows=[['TR-OLD-COMFORT','comfort','Комфорт','individual'],['TR-OLD-STANDARD','standard','Легковой автомобиль','individual'],['TR-OLD-VAN','van','Минивэн','individual'],['TR-OLD-GROUP','group','Групповой трансфер','group'],['TR-OLD-NOCLASS',undefined,'','individual']];
for(const [code,clsId,cls] of legacyRows){const body={...transferBase,code,clsId,cls,pax:2,passengerNames:names(2),price:3000};delete body.format;sqlite.prepare('INSERT INTO records (id,kind,owner,body,status,created,updated) VALUES (?,?,?,?,?,?,?)').run(code,'transfers',guest,JSON.stringify(body),'pending',Date.now()-86400000,Date.now()-86400000)}
const stored=Object.fromEntries(legacyRows.map(([code])=>[code,sqlite.prepare('SELECT body FROM records WHERE id=?').get(code).body]));
const mine=(await call('/api/my-orders',guest)).data.orders,staffList=(await call('/api/admin/orders?kind=transfers&pageSize=100','owner')).data.data,stateList=(await call('/api/state','owner')).data.lists.transfers,ownState=(await call('/api/state',guest)).data.lists.transfers;
for(const [code,clsId,,format] of legacyRows)for(const [where,list] of [['my-orders',mine],['admin/orders',staffList],['state (staff)',stateList],['state (owner)',ownState]]){const o=list.find(x=>x.code===code);assert.ok(o,code+' visible in '+where);assert.equal(o.format,format,code+' '+where);assert.equal(o.cls,format==='group'?'Групповой':'Индивидуальный',code+' label in '+where);assert.equal(o.price,3000,'stored price untouched')}
// A dispatcher question on an old order is still answered; the old row is not refused for its class or capacity.
assert.equal((await call('/api/order-status','owner','PUT',{id:'TR-OLD-VAN',kind:'transfers',status:'needs_info',clarification:{field:'hotel',prompt:'Уточните отель'}})).status,200);
const question=(await call('/api/my-orders',guest)).data.orders.find(x=>x.code==='TR-OLD-VAN').clarification;
response=await call('/api/order-clarification',guest,'POST',{kind:'transfers',code:'TR-OLD-VAN',clarificationId:question.id,answer:'Гостиница «Абхазия»'});assert.equal(response.status,200,JSON.stringify(response.data));
for(const [code] of legacyRows.filter(([c])=>c!=='TR-OLD-VAN'))assert.equal(sqlite.prepare('SELECT body FROM records WHERE id=?').get(code).body,stored[code],'reading never rewrites an old row');
// The dispatcher payload carries the format for old rows too.
{const old=JSON.parse(stored['TR-OLD-STANDARD']),grp=JSON.parse(stored['TR-OLD-GROUP']);const p1=dispatchPayloadForTest(old),p2=dispatchPayloadForTest(grp);assert.equal(p1.format,'individual');assert.equal(p1.formatName,'Индивидуальный');assert.equal(p1.class,'individual','no car class reaches the dispatcher');assert.equal(p2.format,'group');assert.equal(p2.formatName,'Групповой')}
console.log('PASS: two transfer formats: individual = price per car (not multiplied), group = per passenger × passengers, child seat once, forged browser price ignored, class order irrelevant, capacity enforced, old class ids read as formats, invalid formats refused; old D1 rows (comfort/standard/van/group) open in the account, staff list and state as «Индивидуальный»/«Групповой» without being rewritten, and still take clarifications.');

// Roles: a tourist cannot moderate, change orders or read staff lists.
for(const [path,method,data] of [['/api/moderation','GET'],['/api/moderation','PUT',{id:'story-privacy',status:'rejected'}],['/api/order-status','PUT',{id:order.code,kind:'transfers',status:'paid'}],['/api/admin/staff','GET'],['/api/admin/content-history','GET']]){response=await call(path,guest,method,data);assert.equal(response.status,403,`${method} ${path} must be forbidden for a tourist`)}
assert.equal((await call('/api/list','','POST',{kind:'diary',items:[]})).status,401,'anonymous writes need an account');
console.log('PASS: tourists cannot moderate stories, change order status or read staff data; anonymous writes are refused.');

// Malformed input gets a 4xx answer, never a 500.
for(const [path,method,raw] of [['/api/list','POST','{'],['/api/list','POST','null'],['/api/list','POST','[]'],['/api/list','POST','"text"'],['/api/profile','PUT','{"name":'],['/api/story','POST','not json'],['/api/order-cancel','POST','42']]){response=await call(path,guest,method,raw,{raw:true});assert.equal(response.status,400,`${method} ${path} ${raw} → ${response.status}`);assert.equal(response.data.code,'BAD_REQUEST')}
for(const data of [{kind:'diary',items:[],deleted:'story-privacy'},{kind:'diary',items:['text']},{kind:'bookings',items:[null]}]){response=await call('/api/list',guest,'POST',data);assert.equal(response.status,400,JSON.stringify(data))}
response=await call('/api/profile',guest,'PUT','{}',{raw:true,headers:{'content-length':'3000000'}});assert.equal(response.status,413);
assert.equal((await call('/api/tourist?id=p'+'0'.repeat(24),'')).status,404);
console.log('PASS: malformed or oversized JSON and wrong list shapes return 400/413 instead of an internal error.');

// Staff request list: protected, paginated, filtered; /api/state still carries requests for compatibility.
for(const viewer of ['',guest])assert.equal((await call('/api/admin/orders',viewer)).status,403,'staff only');
{const all=(await call('/api/admin/orders?kind=transfers&pageSize=2','owner')).data;assert.equal(all.pagination.pageSize,2);assert.equal(all.data.length,2);assert.ok(all.pagination.totalItems>=5);assert.equal(all.pagination.totalPages,Math.ceil(all.pagination.totalItems/2));assert.ok(all.data[0].createdAt>=all.data[1].createdAt,'newest first');
 const page2=(await call('/api/admin/orders?kind=transfers&pageSize=2&page=2','owner')).data;assert.ok(page2.data.every(o=>!all.data.some(x=>x.code===o.code)),'pages do not overlap');
 const code=all.data[0].code,found=(await call('/api/admin/orders?q='+encodeURIComponent(code.slice(0,8)),'owner')).data;assert.ok(found.data.some(o=>o.code===code),'search by request number');
 assert.equal((await call('/api/admin/orders?q=%25','owner')).data.pagination.totalItems,0,'% is a literal character in search');
 assert.equal((await call('/api/admin/orders?status=private','owner')).data.data.every(o=>o.status==='private'),true);
 assert.equal((await call('/api/admin/orders?status=hacked','owner')).status,400);assert.equal((await call('/api/admin/orders?kind=diary','owner')).status,400);
 assert.ok((await call('/api/state','owner')).data.lists.transfers.length>=5,'compatibility: /api/state still lists requests for staff')}
console.log('PASS: /api/admin/orders is staff-only, paginated newest first, filters by kind/status, searches literally and leaves /api/state compatible.');

// SEO: robots.txt keeps private pages out, sitemap lists public pages and public tours only, tour pages get their own title.
{const robots=await (await seoFile(new Request('https://test.example/robots.txt'),env)).text();for(const line of ['Disallow: /api/','Allow: /api/media/','Disallow: /account','Disallow: /administrator','Sitemap: https://test.example/sitemap.xml'])assert.ok(robots.includes(line),line);
 const st=(await call('/api/state','owner')).data;st.content.tours[1].hidden=true;assert.equal((await call('/api/content','owner','PUT',{content:st.content,revision:st.revision})).status,200);
 const sitemap=await (await seoFile(new Request('https://test.example/sitemap.xml'),env)).text();assert.ok(sitemap.startsWith('<?xml'));for(const p of ['/','/catalog','/transfer','/map','/journal','/tour/'+st.content.tours[0].id])assert.ok(sitemap.includes('<loc>https://test.example'+p+'</loc>'),p);assert.ok(!sitemap.includes('/tour/'+st.content.tours[1].id+'<'),'hidden tours are not listed');for(const p of ['/account','/administrator','/api/'])assert.ok(!sitemap.includes(p),p);
 const shell='<head><title>Апсуа Тур</title><meta name="description" content="x"><meta property="og:title" content="Апсуа Тур"><meta property="og:description" content="x"></head>';const tour=st.content.tours[0];
 const html=await pageShellFor(shell,new Request('https://test.example/tour/'+tour.id),env);assert.ok(html.includes('<title>'+tour.title+' — Апсуа Тур</title>'));assert.ok(html.includes('rel="canonical" href="https://test.example/tour/'+tour.id+'"'));assert.ok(!html.includes('content="x"'),'description replaced');
 assert.equal(await pageShellFor(shell,new Request('https://test.example/tour/'+st.content.tours[1].id),env),shell,'hidden tour keeps the generic shell');assert.equal(await pageShellFor(shell,new Request('https://test.example/catalog'),env),shell);assert.equal(await pageShellFor(shell,new Request('https://test.example/tour/%E0%A4%A'),env),shell,'malformed path is ignored')}
{const s2=(await call('/api/state','owner')).data;s2.content.tours[0].title='<script>alert(1)</script>';assert.equal((await call('/api/content','owner','PUT',{content:s2.content,revision:s2.revision})).status,200);const html=await pageShellFor('<title>Апсуа Тур</title>',new Request('https://test.example/tour/'+s2.content.tours[0].id),env);assert.ok(!html.includes('<script>'),'tour title is escaped');assert.ok(html.includes('&lt;script&gt;'));s2.content.tours[0].title="Рица $' $& $1";const st3=(await call('/api/state','owner')).data;st3.content.tours[0].title="Рица $' $& $1";assert.equal((await call('/api/content','owner','PUT',{content:st3.content,revision:st3.revision})).status,200);const html2=await pageShellFor('<head><title>Апсуа Тур</title></head>',new Request('https://test.example/tour/'+st3.content.tours[0].id),env);assert.ok(html2.includes("<title>Рица $&#39; $&amp; $1 — Апсуа Тур</title>"),'dollar signs are literal: '+html2)}
console.log('PASS: robots.txt hides private pages; sitemap lists public pages and visible tours; tour pages get an escaped server-side title, description and canonical link.');

// Story views: cookie-less requests do not inflate the counter; a known visitor counts once a day.
{const views=()=>call('/api/state','').then(r=>r.data.lists.diary.find(s=>s.id==='story-privacy').views);const start=await views();
 for(let i=0;i<5;i++){const r=await call('/api/view?id=story-privacy','');assert.equal(r.status,200);assert.equal(r.data.counted,false)}assert.equal(await views(),start,'cookie-less requests are not counted');
 const cookie={headers:{cookie:'apsua_visitor=11111111-2222-4333-8444-555555555555'}};for(let i=0;i<3;i++)await call('/api/view?id=story-privacy','','GET',undefined,cookie);assert.equal(await views(),start+1,'a known visitor counts once per day')}
console.log('PASS: story views ignore cookie-less requests and count a known visitor once a day.');
