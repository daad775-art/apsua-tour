import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function harness(worker=null){
 const listeners={},windowListeners={},streams=[],events=[];let reloads=0;
 const makeNode=()=>({hidden:true,style:{setProperty(){}},classList:{add(){},remove(){},toggle(){}},setAttribute(){}});const notice=makeNode(),indicator=makeNode();let created=0;const offsets={};
 const document={hidden:false,body:{append(){}},documentElement:{style:{setProperty(k,v){offsets[k]=v}},classList:{add(){},remove(){}}},createElement:()=>created++?indicator:notice,querySelector:()=>null,addEventListener(type,fn){(listeners[type]??=[]).push(fn)}};
 const window={apsuaLiveRevision:'release:1',scrollY:0,fetch:async()=>new Response(JSON.stringify({revision:'release:1'})),dispatchEvent(event){events.push(event)},addEventListener(type,fn){windowListeners[type]=fn}};
 const ctx={console,window,document,location:{href:'https://test.example/',origin:'https://test.example',pathname:'/',hash:'#/excursions',reload(){reloads++}},navigator:{onLine:true,...(worker?{serviceWorker:worker}:{})},URL,AbortSignal,Response,CustomEvent,sessionStorage:{setItem(){},getItem(){return null},removeItem(){}},matchMedia:()=>({matches:true}),getComputedStyle:()=>({overflowY:'visible'}),setTimeout(){},clearTimeout(){},setInterval(){},requestAnimationFrame(fn){fn()},scrollTo(){},EventSource:class{constructor(){this.listeners={};streams.push(this)}addEventListener(type,fn){this.listeners[type]=fn}close(){this.closed=true}}};
 vm.createContext(ctx);
 const source=readFileSync(new URL('../public/live-updates.js',import.meta.url),'utf8').replace(/\}\)\(\);\s*$/, 'globalThis.testLive={receive,applyPending,hasDrafts,rememberSubmission};})();');
 vm.runInContext(source,ctx);
 const dispatch=(type,event)=>listeners[type]?.forEach(fn=>fn(event));
 const target={closest:()=>null,parentElement:document.body,scrollHeight:0,clientHeight:0};
 function pull(dx,dy){dispatch('touchstart',{touches:[{clientX:10,clientY:20}],target});dispatch('touchmove',{touches:[{clientX:10+dx,clientY:20+dy}],cancelable:true,preventDefault(){}});dispatch('touchend',{})}
 return {events,ctx,dispatch,pull,notice,indicator,offsets,streams,target,windowListeners,get reloads(){return reloads},api:ctx.testLive};
}
let h=harness();h.api.receive('release:1');assert.equal(h.reloads,0);h.api.receive('release:2');assert.equal(h.reloads,1);h.api.receive('release:3');assert.equal(h.reloads,1,'Reload coalesced');
h=harness();const form={contains:()=>true},node={isConnected:true,matches:()=>true,closest:selector=>selector==='form'?form:null,id:'name'};
h.dispatch('input',{target:node});h.api.receive('release:2');assert.equal(h.reloads,0);assert.match(h.notice.textContent,/Сохраните/);
node.isConnected=false;h.api.applyPending();assert.equal(h.reloads,1,'Closing form resumes pending update');
h=harness();h.pull(0,20);assert.equal(h.reloads,0,'Small pull is ignored');h.pull(180,140);assert.equal(h.reloads,0,'Horizontal swipe is ignored');h.ctx.window.scrollY=80;h.pull(0,160);assert.equal(h.reloads,0,'Pull only at page top');h.ctx.window.scrollY=0;h.pull(0,160);assert.equal(h.reloads,1);
h=harness();h.ctx.navigator.onLine=false;h.pull(0,160);assert.equal(h.reloads,0);assert.match(h.notice.textContent,/Нет интернета/);
h=harness();h.ctx.document.hidden=true;h.api.receive('release:2');assert.equal(h.reloads,0);h.ctx.document.hidden=false;h.api.applyPending();assert.equal(h.reloads,1);
h=harness();node.isConnected=true;h.dispatch('input',{target:node});h.api.rememberSubmission(node);await h.ctx.window.fetch('/api/profile',{method:'PUT'});assert.equal(h.api.hasDrafts(),false,'Successful submitted form permits update');
h=harness();h.dispatch('input',{target:node});h.api.rememberSubmission(node);const request=h.ctx.window.fetch('/api/profile',{method:'PUT'});h.dispatch('input',{target:node});await request;assert.equal(h.api.hasDrafts(),true,'Typing during save remains protected');
console.log('PASS: desktop/mobile revisions, reload coalescing, unsaved forms, changes during save, top-only pull threshold, horizontal gestures, background and offline behavior.');

// Regression: the first small move must be intercepted before Safari owns it.
h=harness();let prevented=0;
h.dispatch('touchstart',{touches:[{clientX:0,clientY:0}],target:h.target});
h.dispatch('touchmove',{touches:[{clientX:0,clientY:2}],cancelable:true,preventDefault(){prevented++}});
assert.equal(prevented,1,'First downward move is intercepted without a 12px delay');
h.dispatch('touchmove',{touches:[{clientX:0,clientY:130}],cancelable:true,preventDefault(){}});
assert.match(h.indicator.textContent,/Отпустите/);h.dispatch('touchend',{});assert.equal(h.reloads,1,'Deliberate 130px pull refreshes');
h=harness();h.ctx.matchMedia=()=>({matches:false});h.pull(0,130);assert.equal(h.reloads,1,'Touch does not depend on coarse pointer detection');
h=harness();h.ctx.window.scrollY=40;h.dispatch('touchstart',{touches:[{clientX:0,clientY:0}],target:h.target});
h.dispatch('touchmove',{touches:[{clientX:0,clientY:40}],cancelable:true,preventDefault(){}});h.ctx.window.scrollY=0;
h.dispatch('touchmove',{touches:[{clientX:0,clientY:60}],cancelable:true,preventDefault(){}});
h.dispatch('touchmove',{touches:[{clientX:0,clientY:190}],cancelable:true,preventDefault(){}});h.dispatch('touchend',{});assert.equal(h.reloads,1,'Scroll to top and pull within one continuous gesture');
h=harness();h.ctx.document.scrollingElement={scrollTop:-12};h.ctx.window.scrollY=-12;h.pull(0,130);assert.equal(h.reloads,1,'iOS negative rubber-band scroll counts as page top');
console.log('PASS: first-move interception, shorter pull, hybrid touch devices, continuous scroll-to-top and iOS overscroll.');

h=harness();const first=h.streams[0];h.windowListeners.focus();assert.ok(first.closed);assert.equal(h.streams.length,2,'Returning focus replaces a possibly suspended stream');h.windowListeners.pageshow();assert.equal(h.streams.length,3,'Restored installed page reconnects');
const workerEvents={};let updates=0;
const worker={controller:{},getRegistration:async()=>({update:async()=>{updates++}}),addEventListener(type,fn){workerEvents[type]=fn}};
h=harness(worker);await new Promise(resolve=>setImmediate(resolve));assert.equal(updates,1,'Installed worker checked on startup');
workerEvents.controllerchange();assert.equal(h.reloads,1,'Replacing an existing worker updates the page');
worker.controller=null;h=harness(worker);workerEvents.controllerchange();assert.equal(h.reloads,0,'First worker claim never causes reload loop');
console.log('PASS: app focus/pageshow reconnect suspended streams; installed worker updates and first installation avoids reload loop.');

h=harness();h.pull(0,110);assert.equal(h.reloads,0,'A pull below 120px must never refresh');
h=harness();let buzzes=0;h.ctx.navigator.vibrate=()=>{buzzes++;return true};
h.dispatch('touchstart',{touches:[{clientX:0,clientY:0}],target:h.target});
for(const y of [60,120,135,150])h.dispatch('touchmove',{touches:[{clientX:0,clientY:y}],cancelable:true,preventDefault(){}});
assert.equal(buzzes,1,'Haptic only once per gesture');const offsetAt150=parseFloat(h.indicator.style.height);assert.ok(offsetAt150>78&&offsetAt150<97.5,'Past the unchanged 120px line the page follows with growing resistance: '+offsetAt150);h.dispatch('touchmove',{touches:[{clientX:0,clientY:400}],cancelable:true,preventDefault(){}});const offsetAt400=parseFloat(h.indicator.style.height);assert.ok(offsetAt400>148&&offsetAt400<400*.65,'The page can be pulled well below the old 148px stop, softly: '+offsetAt400);h.dispatch('touchmove',{touches:[{clientX:0,clientY:900}],cancelable:true,preventDefault(){}});assert.ok(parseFloat(h.indicator.style.height)<78+300*.65+1,'The stretch has a soft upper bound');assert.equal(buzzes,1,'Still one haptic per gesture');assert.equal(h.notice.hidden,true,'No floating toast during pull');assert.equal(h.indicator.hidden,false);
h.dispatch('touchmove',{touches:[{clientX:0,clientY:100}],cancelable:true,preventDefault(){}});h.dispatch('touchend',{});assert.equal(h.reloads,0,'Returning above threshold disarms refresh');assert.equal(h.indicator.style.height,'0px','Cancelled pull springs back to the start');
console.log('PASS: content displacement, gap indicator, unchanged 120px threshold, rubber-band stretch well below it, spring return, disarming and one supported haptic per gesture.');

h=harness();h.ctx.window.apsuaAdminDirty=true;h.api.receive('release:2');assert.equal(h.reloads,0,'Admin structural drafts protect reload even without connected inputs');h.ctx.window.apsuaAdminDirty=false;h.ctx.window.apsuaAdminSaving=true;h.api.applyPending();assert.equal(h.reloads,0,'Explicit admin save protects reload');h.ctx.window.apsuaAdminSaving=false;h.api.applyPending();assert.equal(h.reloads,1);console.log('PASS: manual admin drafts and saves protect automatic reload.');

h=harness();h.ctx.window.apsuaRequestSending=true;h.api.receive('release:2');assert.equal(h.reloads,0);h.ctx.window.apsuaRequestSending=false;h.ctx.window.apsuaRequestResultOpen=true;h.api.applyPending();assert.equal(h.reloads,0);h.ctx.window.apsuaRequestResultOpen=false;h.api.applyPending();assert.equal(h.reloads,1);console.log('PASS: server submission and the request receipt defer reload until the customer closes the result.');

h=harness();h.ctx.window.apsuaPartialUpdatesReady=true;h.api.receive('release:2');assert.equal(h.reloads,0);assert.equal(h.events[0].type,'site-data-updated');assert.equal(h.events[0].detail.contentSafe,true);h.api.receive('release:2');assert.equal(h.events.length,1);h.api.receive('nextrelease:1');assert.equal(h.reloads,1);
h=harness();h.ctx.window.apsuaPartialUpdatesReady=true;const pendingField={isConnected:true,matches:()=>true,closest:()=>null,id:'form-field'};h.dispatch('input',{target:pendingField});h.api.receive('release:2');assert.equal(h.reloads,0);assert.equal(h.events[0].detail.contentSafe,false);pendingField.isConnected=false;h.api.applyPending();assert.equal(h.events.at(-1).detail.contentSafe,true);assert.equal(h.reloads,0);h=harness();h.ctx.window.apsuaPartialUpdatesReady=true;h.ctx.document.hidden=true;h.api.receive('release:2');assert.equal(h.events.length,0);h.ctx.document.hidden=false;h.api.applyPending();assert.equal(h.events.length,1);assert.equal(h.reloads,0);console.log('PASS: same-build revisions patch data without reload, protect forms and resume from the background; new builds still refresh the site.');
// build 166: the 5-second poll is a fallback only while the event stream is not open.
{const intervals=[],streams=[];let fetches=0;const document={hidden:false,body:{append(){}},documentElement:{style:{setProperty(){}},classList:{add(){},remove(){}}},createElement:()=>({hidden:true,style:{setProperty(){}},classList:{add(){},remove(){},toggle(){}},setAttribute(){}}),querySelector:()=>null,addEventListener(){}};
 const window={apsuaLiveRevision:'release:1',scrollY:0,fetch:async()=>{fetches++;return new Response(JSON.stringify({revision:'release:1'}))},dispatchEvent(){},addEventListener(){}};
 const ctx={console,window,document,location:{href:'https://test.example/',origin:'https://test.example',pathname:'/',hash:'#/',reload(){}},navigator:{onLine:true},URL,AbortSignal,Response,CustomEvent,sessionStorage:{setItem(){},getItem(){return null},removeItem(){}},matchMedia:()=>({matches:true}),getComputedStyle:()=>({overflowY:'visible'}),setTimeout(){},clearTimeout(){},setInterval(fn,ms){intervals.push({fn,ms})},requestAnimationFrame(fn){fn()},scrollTo(){},EventSource:class{constructor(){this.readyState=0;this.listeners={};streams.push(this)}addEventListener(t,f){this.listeners[t]=f}close(){this.closed=true;this.readyState=2}}};
 vm.createContext(ctx);vm.runInContext(readFileSync(new URL('../public/live-updates.js',import.meta.url),'utf8'),ctx);
 const poll=intervals.find(x=>x.ms===5000);assert.ok(poll,'fallback poll is scheduled');await new Promise(r=>setImmediate(r));
 const start=fetches;streams[0].readyState=1;poll.fn();await new Promise(r=>setImmediate(r));assert.equal(fetches,start,'no polling while the stream is open');
 streams[0].readyState=0;poll.fn();await new Promise(r=>setImmediate(r));assert.equal(fetches,start+1,'polling resumes while the stream reconnects');
 streams[0].readyState=1;poll.fn();await new Promise(r=>setImmediate(r));assert.equal(fetches,start+1,'and stops again once it is back')}
console.log('PASS: the 5-second poll runs only while the update stream is unavailable and stops after it reconnects.');
