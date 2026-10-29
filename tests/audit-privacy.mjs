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
console.log('PASS: public lists carry opaque public author IDs (no ChatGPT or Telegram IDs); stories and comments keep their authors; tourist cards open by public ID and trip counts stay private.');

// Transfer price: the server price wins, a forged browser price is kept apart.
const year=new Date().getUTCFullYear()+1,transferBase={via:'WhatsApp',direction:'arrival',terminalId:'sochi',cityId:'gagra',clsId:'standard',cls:'Легковой автомобиль',pax:2,passengerNames:['Ирина Иванова','Анна Иванова'],address:'Улица 1, дом 2',hotel:'Гостиница',flight:'SU 100',date:`${year}-07-10`,time:'12:00',name:'Турист',phone:'+79401234567'};
const content=JSON.parse(readFileSync(new URL('../lib/site-seed.json',import.meta.url),'utf8')),gagra=content.transfer.to.find(x=>x.id==='gagra');
async function transfer(user,token,extra){const r=await call('/api/list',user,'POST',{kind:'transfers',items:[{...transferBase,requestToken:token,...extra}]});assert.equal(r.status,200,JSON.stringify(r.data));const code=r.data.records[0].code;return (await call('/api/my-orders',user)).data.orders.find(o=>o.code===code)}
let order=await transfer(guest,'price-forged-1',{price:1});assert.equal(order.price,Number(gagra.price),'standard class: catalogue price');assert.equal(order.clientPrice,1,'forged browser price is kept apart');
order=await transfer(guest,'price-forged-2',{clsId:'van',cls:'Минивэн',price:100,seat:'yes'});assert.equal(order.price,Number(gagra.rates.van),'van tariff; a non-boolean seat flag adds no surcharge');assert.equal(order.seat,false);assert.equal(order.clientPrice,100);
order=await transfer(guest,'price-group',{clsId:'group',cls:'Групповой',pax:3,passengerNames:['Ирина Иванова','Анна Иванова','Олег Иванов'],price:Number(gagra.rates.group)*3});assert.equal(order.price,Number(gagra.rates.group)*3,'group price is per passenger');assert.equal(order.clientPrice,undefined,'matching price leaves no diagnostic copy');
{const st=(await call('/api/state','owner')).data;st.content.transfer.seat=300;const saved=await call('/api/content','owner','PUT',{content:st.content,revision:st.revision});assert.equal(saved.status,200,JSON.stringify(saved.data))}
order=await transfer(guest,'price-seat',{clsId:'van',cls:'Минивэн',seat:true,price:Number(gagra.rates.van)});assert.equal(order.price,Number(gagra.rates.van)+300,'child seat surcharge from the catalogue');assert.equal(order.clientPrice,Number(gagra.rates.van),'browser price without the surcharge is kept apart');
order=await transfer(guest,'price-on-request',{terminalId:'sukhum-rail',price:999});assert.equal(order.price,null,'no tariff from Sukhum: price on request');assert.equal(order.clientPrice,999);
console.log('PASS: transfer price is computed on the server from tariffs, class, passengers and child seat; a forged browser price never becomes the order price.');

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
