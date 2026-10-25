/* Server revision stream and a guarded mobile pull-to-refresh. */
(()=>{
'use strict';
let stream=null,baseline=null,pending=false,checking=false,saving=0,reloading=false,ready=false,pullRefreshing=false,dataPending=false;
const drafts=new Map(),submitted=new Map();
const mutations=new Set(['/api/content','/api/profile','/api/moderation','/api/order-status','/api/order-clarification','/api/review','/api/list','/api/story']);
const notice=document.createElement('div');notice.className='live-refresh';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.hidden=true;document.body.append(notice);
function status(text){notice.textContent=text;notice.hidden=!text}
function hasDrafts(){for(const [node] of drafts)if(!node.isConnected)drafts.delete(node);return !!window.apsuaAuthPending||!!window.apsuaClarificationDirty||!!window.apsuaRequestSending||!!window.apsuaRequestResultOpen||!!window.apsuaVisualActive||!!window.apsuaVisualDirty||!!window.apsuaVisualSaving||!!window.apsuaAdminDirty||!!window.apsuaAdminSaving||drafts.size>0||saving>0||!!document.querySelector('dialog[open],.lightbox,.popover')}
for(const name of ['admin-content-saved','admin-content-discarded'])window.addEventListener(name,()=>{for(const [node]of drafts)if(node.closest('.adm'))drafts.delete(node)});
window.apsuaLiveCanPatch=()=>!hasDrafts();
window.addEventListener('order-operation-saved',e=>{for(const [node]of drafts)if(e.detail?.root?.contains(node))drafts.delete(node)});
function rememberSubmission(target){const form=target?.closest('form');if(form)submitted.set(form,new Map([...drafts].filter(([node])=>form.contains(node))))}
for(const type of ['input','change'])document.addEventListener(type,e=>{const node=e.target;if(!node.matches('input,textarea,select')||node.closest('.search,.toolbar,.price-filter,#visualEditor')||['priceMin','priceMax','priceFromInput','priceToInput','sort'].includes(node.id))return;drafts.set(node,(drafts.get(node)||0)+1)},true);
document.addEventListener('pointerdown',e=>{const button=e.target.closest('button,input[type=submit]');if(button&&(!button.hasAttribute('type')||button.type==='submit'))rememberSubmission(button)},true);
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.tagName!=='TEXTAREA')rememberSubmission(e.target)},true);
document.addEventListener('submit',e=>rememberSubmission(e.target),true);
document.addEventListener('reset',e=>{for(const [node] of drafts)if(e.target.contains(node))drafts.delete(node)},true);
const nativeFetch=window.fetch.bind(window);
window.fetch=async function(input,options={}){
 const url=new URL(typeof input==='string'?input:input.url,location.href),method=(options.method||input.method||'GET').toUpperCase();
 const mutating=url.origin===location.origin&&method!=='GET'&&url.pathname.startsWith('/api/');
 const candidates=mutating&&mutations.has(url.pathname)?new Map(submitted):null;
 if(mutating)saving++;
 try{
  const response=await nativeFetch(input,options);
  if(response.ok&&candidates)for(const [form,snapshot] of candidates){for(const [node,version] of snapshot)if(drafts.get(node)===version)drafts.delete(node);if(submitted.get(form)===snapshot)submitted.delete(form)}
  return response;
 }finally{if(mutating){saving--;setTimeout(applyPending,400)}}
};
function reload(){
 if(reloading)return;reloading=true;if(!pullRefreshing)status('Обновляем…');
 try{sessionStorage.setItem('apsua-refresh-position',JSON.stringify({route:location.pathname+location.hash,y:window.scrollY,at:Date.now()}))}catch{}
 location.reload();
}
function emitDataUpdate(){window.dispatchEvent(new CustomEvent('site-data-updated',{detail:{revision:baseline,contentSafe:!hasDrafts()}}))}
window.addEventListener('site-data-retry',()=>{dataPending=true});
function applyPending(){if(dataPending&&!document.hidden&&!reloading&&!hasDrafts()){dataPending=false;emitDataUpdate()}if(!pending||document.hidden||reloading)return;if(hasDrafts()){status(window.apsuaRequestResultOpen?'Статус заявки обновляется в окне. Обновление страницы — после его закрытия.':'Есть обновления. Сохраните или закройте форму.');return}reload()}
function receive(revision){if(typeof revision!=='string'||!revision)return;if(!baseline){baseline=revision;return}if(revision!==baseline){if(window.apsuaPartialUpdatesReady&&revision.split(':')[0]===baseline.split(':')[0]){baseline=revision;dataPending=document.hidden||hasDrafts();if(!document.hidden)emitDataUpdate();return}pending=true;applyPending()}}
async function check(){if(checking||document.hidden||!ready||navigator.onLine===false)return;checking=true;try{const response=await nativeFetch('/api/updates',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(8000)});if(response.ok)receive((await response.json()).revision)}catch{}finally{checking=false}}
function connect(){
 if(!ready||document.hidden||stream||typeof EventSource==='undefined'||navigator.onLine===false)return;
 stream=new EventSource('/api/updates');stream.addEventListener('revision',e=>{try{receive(JSON.parse(e.data).revision)}catch{}});stream.onerror=()=>check();
}
function disconnect(){stream?.close();stream=null}
function start(){if(ready||!window.apsuaLiveRevision)return;ready=true;baseline=window.apsuaLiveRevision;
 try{const saved=JSON.parse(sessionStorage.getItem('apsua-refresh-position')||'null');sessionStorage.removeItem('apsua-refresh-position');if(saved?.route===location.pathname+location.hash)requestAnimationFrame(()=>scrollTo(0,saved.y))}catch{}
 if(window.apsuaPageBuildId&&baseline.split(':')[0]!==window.apsuaPageBuildId){pending=true;applyPending()}
 connect();check();
}
window.addEventListener('site-ready',start);start();
function resume(){if(document.hidden)return;disconnect();connect();check();applyPending();updateWorker()}
document.addEventListener('visibilitychange',()=>{if(document.hidden)disconnect();else resume()});
window.addEventListener('focus',resume);window.addEventListener('pageshow',resume);
window.addEventListener('online',resume);window.addEventListener('offline',disconnect);
window.addEventListener('pagehide',disconnect);
// Also catches a new release if a proxy closes or buffers the event stream.
setInterval(check,5000);setInterval(applyPending,1000);
let workerUpdating=false;
async function updateWorker(){
 if(workerUpdating||document.hidden||navigator.onLine===false||!navigator.serviceWorker)return;
 workerUpdating=true;
 try{const registration=await navigator.serviceWorker.getRegistration('/');if(registration)await registration.update()}catch{}finally{workerUpdating=false}
}
if(navigator.serviceWorker){
 let controlled=!!navigator.serviceWorker.controller;
 navigator.serviceWorker.addEventListener('controllerchange',()=>{
  // First installation claims the page too; only replacing an existing worker
  // should reload the app. This avoids a first-install reload loop.
  if(controlled){pending=true;applyPending()}controlled=true;
 });
 updateWorker();setInterval(updateWorker,60000);
}
const pullIndicator=document.createElement('div');pullIndicator.className='pull-refresh-indicator';pullIndicator.setAttribute('role','status');pullIndicator.setAttribute('aria-live','polite');pullIndicator.hidden=true;document.body.append(pullIndicator);
// build 146: the refresh line stays where it was (a 120 px finger movement = 78 px page offset), but the page can
// now be pulled well below it. Up to the line the page follows the finger; past it the resistance grows
// smoothly (rubber band, no hard stop). On release a spring returns the page from its current position and
// velocity. Only transform/translate is animated, on the three moving blocks — no layout work per frame.
const pullThreshold=120; // About a 2cm finger movement on common phone screens. Unchanged.
const pullFollow=.65,pullLine=pullThreshold*pullFollow,pullExtra=300; // pullExtra: asymptote of the stretch past the line
const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
let gesture=null,pull=0,returnTimer,spring=null,lastMove=null,pullVelocity=0;
function pullDistance(dy){if(dy<=pullThreshold)return dy*pullFollow;const x=dy-pullThreshold;return pullLine+(x*pullExtra*pullFollow)/(pullExtra+pullFollow*x)}
function pullTargets(){return ['body>.header','#app','#contacts'].map(selector=>document.querySelector(selector)).filter(Boolean)}
function offsetPage(value){pull=value;const px=Math.round(value*10)/10+'px';for(const node of pullTargets())node.style.translate=value?'0 '+px:'';pullIndicator.style.height=Math.max(0,Math.round(value*10)/10)+'px'}
function stopSpring(){if(spring){cancelAnimationFrame(spring.frame);spring=null}}
// Critically/under-damped spring in Apple's terms: response (s) and damping ratio. Returns a promise when settled.
function springTo(target,{velocity=0,response=.38,damping=.78}={}){
 stopSpring();
 if(reduceMotion?.matches){offsetPage(target);return Promise.resolve()}
 return new Promise(resolve=>{
  const k=Math.pow(2*Math.PI/response,2),c=4*Math.PI*damping/response;let x=pull,v=velocity,last=null,elapsed=0;
  const state={frame:0};spring=state;
  const step=now=>{if(spring!==state){resolve();return}const clock=typeof now==='number'&&Number.isFinite(now);if(last===null)last=clock?now-16.7:0;let dt=clock?Math.min(.032,Math.max(0,(now-last)/1000)):1/60;last=clock?now:0;elapsed+=dt;if(elapsed>2){offsetPage(target);spring=null;resolve();return}
   // two half steps keep the integration stable on 30 Hz devices
   for(let i=0;i<2;i++){const h=dt/2,a=-k*(x-target)-c*v;v+=a*h;x+=v*h}
   // keep the bounce controlled: at most a few px above the resting position
   if(target===0&&x<-6){x=-6;v=Math.max(v,0)}
   offsetPage(x);
   if(Math.abs(v)<4&&Math.abs(x-target)<.4){offsetPage(target);spring=null;resolve();return}
   state.frame=requestAnimationFrame(step)};
  state.frame=requestAnimationFrame(step);
 });
}
function finishIndicator(){pullIndicator.hidden=true;pullIndicator.classList.remove('armed','loading');document.documentElement.classList.remove('pull-refresh-active','pull-refresh-return');if(!pending&&!reloading)status('')}
function resetPull(){
 const releaseVelocity=pullVelocity;gesture=null;lastMove=null;pullVelocity=0;
 if(!pull){stopSpring();offsetPage(0);finishIndicator();return}
 document.documentElement.classList.add('pull-refresh-return');
 springTo(0,{velocity:releaseVelocity}).then(()=>{if(!pull&&!gesture)finishIndicator()});
}
function haptic(){try{if(typeof navigator.vibrate==='function')navigator.vibrate(12)}catch{}}

function nestedScroll(target){for(let node=target;node&&node!==document.body&&node!==document.documentElement;node=node.parentElement){if(node.scrollHeight>node.clientHeight+2&&/auto|scroll/.test(getComputedStyle(node).overflowY))return true}return false}
function pageTop(){const root=document.scrollingElement;return Math.max(0,root?root.scrollTop:window.scrollY)<=3}
function pullBlocked(target){return reloading||!!document.documentElement.classList?.contains?.('menu-open')||document.body?.style?.overflow==='hidden'||target.closest('input,textarea,select,[role=slider],dialog,.lightbox,.popover,.site-menu,.order-dock,[data-no-pull]')||nestedScroll(target)}
document.addEventListener('touchstart',e=>{
 // Touch events already identify a touch device. Pointer media queries can be
 // inaccurate in installed apps, embedded browsers and hybrid devices.
 if(e.touches.length!==1||pullBlocked(e.target))return;
 clearTimeout(returnTimer);
 // Grabbing the page while it springs back continues from the current position (interruptible).
 const carried=spring&&pull>0?pull:0;stopSpring();
 const startY=e.touches[0].clientY;
 gesture={x:e.touches[0].clientX,y:carried?startY-(carried<=pullLine?carried/pullFollow:pullThreshold+(pullExtra*(carried-pullLine))/(pullFollow*(pullExtra-(carried-pullLine)))):startY,atTop:pageTop(),locked:!!carried,armed:false,buzzed:false};
 if(!carried)pull=0;
},{passive:true,capture:true});
document.addEventListener('touchmove',e=>{
 if(!gesture)return;if(e.touches.length!==1){resetPull();return}
 const touch=e.touches[0];
 // A single downward gesture may first scroll to the top and then pull.
 if(!pageTop()){gesture.x=touch.clientX;gesture.y=touch.clientY;gesture.atTop=false;return}
 if(!gesture.atTop){gesture.x=touch.clientX;gesture.y=touch.clientY;gesture.atTop=true;return}
 const dx=touch.clientX-gesture.x,dy=touch.clientY-gesture.y;
 if(dy<0){if(e.cancelable&&gesture.locked)e.preventDefault();if(pull){offsetPage(0);finishIndicator()}gesture.locked=false;gesture.y=touch.clientY;return}
 if(!gesture.locked&&Math.abs(dx)>8&&Math.abs(dx)>dy){gesture=null;if(pull)resetPull();return}
 if(dy<=0)return;
 // Cancel the FIRST downward move, before Safari starts native scrolling.
 // Waiting for a distance threshold makes later moves non-cancellable on iOS.
 if(e.cancelable)e.preventDefault();
 if(dy<4&&!gesture.locked)return;gesture.locked=true;
 document.documentElement.classList.add('pull-refresh-active');document.documentElement.classList.remove('pull-refresh-return');
 const next=pullDistance(dy),now=e.timeStamp||(typeof performance==='object'?performance.now():Date.now());
 if(lastMove&&now>lastMove.t){const v=(next-lastMove.y)/((now-lastMove.t)/1000);pullVelocity=pullVelocity*.4+v*.6}lastMove={y:next,t:now};
 offsetPage(next);
 // The threshold is the finger distance, exactly as before; pulling further does not move it.
 const armed=dy>=pullThreshold;
 if(armed&&!gesture.buzzed){gesture.buzzed=true;haptic()}
 if(armed!==gesture.armed||pullIndicator.hidden){gesture.armed=armed;pullIndicator.hidden=false;pullIndicator.classList.toggle('armed',armed);pullIndicator.textContent=armed?'Отпустите, чтобы обновить':'Потяните вниз для обновления'}
 if(!pending)status('');
},{passive:false,capture:true});
document.addEventListener('touchend',()=>{
 if(!gesture)return;
 const trigger=gesture.armed;
 if(!trigger){resetPull();return}
 gesture=null;lastMove=null;const velocity=pullVelocity;pullVelocity=0;
 if(navigator.onLine===false){resetPull();status('Нет интернета. Попробуйте позже.');setTimeout(()=>status(''),2500);return}
 if(hasDrafts()){resetPull();status('Сохраните или закройте форму перед обновлением.');setTimeout(()=>{if(!pending)status('')},3000);return}
 // One gesture → one refresh: the indicator settles on the loading position, then the page reloads once.
 pullIndicator.hidden=false;pullIndicator.classList.remove('armed');pullIndicator.classList.add('loading');pullIndicator.textContent='Обновляем…';
 pullRefreshing=true;
 springTo(64,{velocity,damping:1,response:.32});
 reload();
},{passive:true,capture:true});
document.addEventListener('touchcancel',()=>{if(gesture)resetPull()},{passive:true,capture:true});
})();
