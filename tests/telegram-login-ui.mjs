import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const full=readFileSync('public/user-app.js','utf8');
const source=full.slice(full.indexOf('let telegramLoginSDK,'),full.indexOf('const accountViewBeforeTelegram'));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function setup({answer={id_token:'signed-token'},failure=false,lostCookie=false,sdkError=false,hash='#/excursions/ritsa?city=Сухум',page='tour',savedBack=null,pending=null,desktop=false}={}){
 const makeWeb=()=>({hidden:true,attrs:{},setAttribute(k,v){this.attrs[k]=v}});const slot={childElementCount:0,innerHTML:'',isConnected:true,button:{},status:{},web:makeWeb()};let reloads=0,options,callback,authenticated=false,chrome=0,routes=0,modal,webStatus='pending';
 const opened=[];const requests=[],listeners=[],timers=new Map(),values=new Map();let timerId=0;
 if(savedBack)values.set('apsua-telegram-return',JSON.stringify({...savedBack,at:Date.now()}));
 if(pending)values.set('apsua-telegram-pending',JSON.stringify(pending));
 const responseData=()=>({user:authenticated&&!lostCookie?{id:'tg:12345',name:'Тест',authKind:'telegram'}:null,lists:{favs:['ritsa']},admin:false,editor:false});
 const context={console,Promise,Date,JSON,Number,String,Error,URL,Event,serverTelegramAuth:{enabled:true},serverIdentity:null,serverLists:{},serverAdmin:false,serverEditor:false,myOrdersCache:null,myOrdersCacheUserId:null,current:page,favs:new Set(),closeReceiptIcon:'×',formDraftValue:'Сохранить этот адрес',scrollY:120,matchMedia:()=>({matches:desktop}),
  sessionStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},
  setTimeout:fn=>{timers.set(++timerId,fn);return timerId},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>fn(),scrollTo(){},
  renderChrome(){chrome++},route(){routes++},updateCustomerOrdersBanner(){},toast(){},
  location:{hash,pathname:'/',reload(){reloads++}},
  addEventListener:(name,fn,capture)=>listeners.push({name,fn,capture,window:true}),dispatchEvent(){},
  Telegram:{Login:{auth(o,cb){options=o;callback=cb;if(sdkError)return Promise.reject(new Error('SDK failed'));if(answer)cb(answer)}}},
  document:{hidden:false,body:{style:{overflow:''},append(node){modal=node}},addEventListener:(name,fn,capture)=>listeners.push({name,fn,capture,window:false}),createElement(){const d={slot:{isConnected:true,childElementCount:0,innerHTML:'',button:{},status:{},web:makeWeb()},events:{},setAttribute(){},addEventListener(name,fn){this.events[name]=fn},showModal(){this.open=true},close(){this.open=false},remove(){this.slot.isConnected=false},focus(){},getBoundingClientRect:()=>({left:0,right:400,top:0,bottom:300})};return d}},
  $:(selector,root)=>{const target=root?.slot||root||slot;if(selector==='[data-tg-login]')return target.isConnected===false?null:target;if(selector==='button')return target.button;if(selector==='[data-telegram-web]')return target.web;return target.status},
  $$:()=>[slot,modal?.slot].filter(s=>s?.isConnected),
  api:async(path,opt)=>{requests.push({path,opt});if(path==='/api/telegram-login/start'){webStatus='pending';return{mode:'web',expires:Date.now()+300000,webUrl:'https://web.telegram.org/k/#?tgaddr=tg%3A%2F%2Fresolve%3Fdomain%3DApsuaturBot%26start%3Dlogin_example'}};if(path==='/api/telegram-login/status')return{status:webStatus};if(path.endsWith('/start'))return{clientId:'8781725503',nonce:'nonce',expires:Date.now()+300000};if(path.endsWith('/finish')){if(failure)throw new Error('Server rejected token');authenticated=true;webStatus='consumed';return{ok:true}}return responseData()}
 };
 context.open=(...args)=>opened.push(args);context.window=context;vm.createContext(context);
 vm.runInContext(source+';globalThis.authUI={safeTelegramReturn,telegramReturnContext,openTelegramSignin,closeTelegramSignin,recoverTelegramSignin,mountTelegramLogin,getAttempt:()=>telegramAuthAttempt};mountTelegramLogin();',context);await tick();
 return{opened,context,slot,button:slot.button,status:slot.status,requests,timers,values,listeners,options:()=>options,reloads:()=>reloads,chrome:()=>chrome,routes:()=>routes,callback:()=>callback,leave:()=>{slot.isConnected=false},authenticate:()=>{authenticated=true},modal:()=>modal,approveWeb:()=>{webStatus='approved'},denyWeb:()=>{webStatus='denied'},ui:context.authUI};
}
const success=await setup();assert.equal(success.button.textContent,'Войти через Telegram');success.button.onclick();await tick();
assert.deepEqual(Array.from(success.options().scope),['profile']);assert.equal(success.options().nonce,'nonce');assert.equal(success.reloads(),0);assert.equal(success.routes(),0);assert.equal(success.context.location.hash,'#/excursions/ritsa?city=Сухум');assert.equal(success.context.serverIdentity.id,'tg:12345');assert.ok(success.chrome()>0);assert.equal(success.context.formDraftValue,'Сохранить этот адрес');assert.equal(success.context.apsuaAuthPending,false);
const account=await setup({hash:'#/account',page:'account',savedBack:{hash:'#/transfer?from=adler',y:200}});account.button.onclick();await tick();assert.equal(account.context.location.hash,'#/transfer?from=adler');assert.equal(account.reloads(),0);
const direct=await setup({hash:'#/account',page:'account'});direct.button.onclick();await tick();assert.equal(direct.context.location.hash,'#/');
for(const bad of ['https://evil.example','//evil.example','#/admin','#/account','#/transfer\nattack'])assert.equal(success.ui.safeTelegramReturn(bad),'#/');
// A redraw or navigation must not discard a still-valid callback.
const detached=await setup({answer:null});detached.button.onclick();detached.leave();detached.context.location.hash='#/map';detached.context.current='map';await detached.callback()({id_token:'signed-token'});await tick();assert.equal(detached.context.serverIdentity.id,'tg:12345');assert.equal(detached.context.location.hash,'#/map');assert.equal(detached.reloads(),0);
// Focus/pageshow recovery sees a session created while Safari was suspended.
const recovery=await setup({answer:null});recovery.button.onclick();recovery.authenticate();await recovery.ui.recoverTelegramSignin();assert.equal(recovery.context.serverIdentity.id,'tg:12345');assert.equal(recovery.context.apsuaAuthPending,false);
const restored=await setup({hash:'#/account',page:'account',pending:{expires:Date.now()+300000,back:{hash:'#/excursions/ritsa',y:90}}});restored.authenticate();await restored.ui.recoverTelegramSignin();assert.equal(restored.context.location.hash,'#/excursions/ritsa');assert.equal(restored.reloads(),0);
const failed=await setup({failure:true});failed.button.onclick();await tick();assert.equal(failed.context.serverIdentity,null);assert.equal(failed.button.disabled,false);assert.equal(failed.status.textContent,'Server rejected token');
const cancelled=await setup({answer:{error:'popup_closed'}});cancelled.button.onclick();await tick();assert.equal(cancelled.context.serverIdentity,null);assert.equal(cancelled.button.disabled,false);
const sdk=await setup({sdkError:true});sdk.button.onclick();await tick();assert.equal(sdk.button.disabled,false);assert.equal(sdk.status.textContent,'SDK failed');
const lost=await setup({lostCookie:true});lost.button.onclick();await tick();assert.equal(lost.context.serverIdentity,null);assert.equal(lost.reloads(),0);assert.ok(lost.ui.getAttempt());lost.ui.getAttempt().expires=0;await lost.ui.recoverTelegramSignin();assert.equal(lost.context.apsuaAuthPending,false);assert.match(lost.status.textContent,/Время входа истекло/);
// Anonymous profile links open a compact dialog over the current page.
const overlay=await setup({answer:null});const handler=overlay.listeners.find(l=>!l.window&&l.name==='click');let prevented=false;handler.fn({target:{closest:()=>({getAttribute:()=> '#/account'})},preventDefault(){prevented=true},stopImmediatePropagation(){}});await tick();assert.ok(prevented);assert.equal(overlay.context.location.hash,'#/excursions/ritsa?city=Сухум');assert.equal(overlay.modal().open,true);assert.ok(overlay.modal().innerHTML.includes('telegram-signin-title'));overlay.ui.closeTelegramSignin();assert.equal(overlay.modal().open,false);assert.equal(overlay.context.document.body.style.overflow,'');
console.log('PASS: modal sign-in, same-page/scroll/form preservation, account return/home fallback, no full reload, detached callbacks, focus/restored-session recovery, safe local return, expiry, cancellation and SDK/server errors.');

const desktop=await setup({desktop:true});assert.equal(desktop.slot.innerHTML.includes('data-telegram-web'),false);assert.equal(desktop.button.textContent,'Войти через Telegram');desktop.button.onclick();await tick();assert.deepEqual(Array.from(desktop.options().scope),['profile']);assert.equal(desktop.opened.length,0);assert.ok(desktop.requests.some(r=>r.path==='/api/telegram-oidc/start'));assert.ok(desktop.requests.some(r=>r.path==='/api/telegram-oidc/finish'));assert.equal(desktop.requests.some(r=>r.path==='/api/telegram-login/start'),false);assert.equal(desktop.context.serverIdentity.id,'tg:12345');
const mobile=await setup({desktop:false});assert.equal(mobile.slot.innerHTML.includes('data-telegram-web'),false);assert.equal(mobile.requests.some(r=>r.path==='/api/telegram-login/start'),false);assert.ok(mobile.requests.some(r=>r.path==='/api/telegram-oidc/start'));
console.log('PASS: the official Telegram OIDC window (now the phone-number fallback) behaves the same on desktop and mobile and finishes on the original page without reload.');

// Build 152: sign-in through the bot. Only the site's own t.me / Telegram Web links are accepted, and the QR code is valid.
{
 const layer=full.slice(full.indexOf('const V152_QR=(()=>{'),full.indexOf('telegramAuthMessage=function'));
 const ctx={TextEncoder,URL,Error,Math,Array,String,Number,window:{}};vm.createContext(ctx);vm.runInContext(layer+';globalThis.out={V152_QR,v152TelegramLinks};',ctx);const {V152_QR,v152TelegramLinks}=ctx.out;
 const id='a1b2c3d4e5f60718293a4b5c6d7e8f90',good={url:'https://t.me/ApsuaturBot?start=login_'+id,webUrl:'https://web.telegram.org/k/#?tgaddr='+encodeURIComponent('tg://resolve?domain=ApsuaturBot&start=login_'+id)};
 const links=v152TelegramLinks(good);assert.equal(links.url,good.url);assert.equal(links.app,'tg://resolve?domain=ApsuaturBot&start=login_'+id);assert.equal(links.web,good.webUrl);
 for(const url of ['https://evil.example/ApsuaturBot?start=login_'+id,'https://t.me/ApsuaturBot?start=other','https://t.me/a?start=login_'+id,'javascript:alert(1)','tg://resolve?domain=x'])assert.throws(()=>v152TelegramLinks({url,webUrl:good.webUrl}));
 assert.equal(v152TelegramLinks({url:good.url,webUrl:'https://evil.example/k/'}).web,'','foreign Telegram Web link is dropped');
 const m=V152_QR.encode(good.url);assert.equal(m.length,37,'version 5 for the sign-in link');for(const [x,y] of [[0,0],[30,0],[0,30]]){for(let i=0;i<7;i++){assert.equal(m[y][x+i],true);assert.equal(m[y+6][x+i],true);assert.equal(m[y+i][x],true);assert.equal(m[y+i][x+6],true)}assert.equal(m[y+1][x+1],false);assert.equal(m[y+3][x+3],true)}
 assert.match(V152_QR.svg(good.url),/^<svg class="v152-qr-svg"/);assert.throws(()=>V152_QR.encode('x'.repeat(400)));
 console.log('PASS: bot sign-in accepts only the site bot links (t.me, tg://resolve, Telegram Web) and draws a valid QR code for them.');
}
