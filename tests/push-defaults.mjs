import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('public/user-app.js','utf8').split('/* Device push subscriptions and owner broadcast composer. */')[1].split("ADM_TABS.push(['push'")[0];
async function check(permission,optedOut){
 let subscribed=0,permissions=0,saved=0;
 const label={textContent:''},button={dataset:{},disabled:true};
 const subscription={toJSON:()=>({endpoint:'test'})};
 const registration={pushManager:{getSubscription:async()=>null,subscribe:async()=>{subscribed++;return subscription}}};
 const context=vm.createContext({accountView(){},serverIdentity:{id:'user'},current:'home',app:{},document:{addEventListener(){}},window:{Notification:{},PushManager:{},addEventListener(){}},navigator:{standalone:true,serviceWorker:{register:async()=>registration,ready:Promise.resolve(registration)}},Notification:{permission,requestPermission(){permissions++}},matchMedia:()=>({matches:true}),localStorage:{getItem:()=>optedOut?'1':null},sessionStorage:{getItem:()=>null},$:selector=>selector==='#push-device-status'?label:selector==='#push-device-toggle'?button:null,api:async(path)=>{if(path==='/api/push/config')return {enabled:true,publicKey:'AQ'};saved++},Uint8Array,atob,setTimeout,clearTimeout});
 vm.runInContext(source,context);await vm.runInContext('refreshPushDevice()',context);
 assert.equal(subscribed,permission==='granted'&&!optedOut?1:0);assert.equal(saved,subscribed);assert.equal(permissions,0,'never request system permission without a tap');
}
await check('granted',false);await check('default',false);await check('granted',true);await check('denied',false);
console.log('PASS: automatic subscription with granted permission; explicit opt-out preserved; no automatic permission prompt.');
// Permission dialogs can trigger pageshow while the subscription is still being saved.
{
 const clicks=[],events={};let banner=true,configRequests=0,saveResolve;
 const button={dataset:{enabled:'0'},disabled:false},label={textContent:''};
 const subscription={toJSON:()=>({endpoint:'test'})};
 const context=vm.createContext({accountView(){},serverIdentity:{id:'user'},current:'home',app:{},document:{addEventListener(name,fn){if(name==='click')clicks.push(fn)},body:{insertAdjacentHTML(){throw Error('must not reopen connected banner')}}},window:{Notification:{},PushManager:{},addEventListener(name,fn){events[name]=fn}},navigator:{standalone:true,serviceWorker:{}},Notification:{permission:'default',async requestPermission(){this.permission='granted';return 'granted'}},matchMedia:()=>({matches:true}),localStorage:{getItem:()=>null,removeItem(){}},sessionStorage:{getItem:()=>null},$:s=>s==='#push-welcome'?(banner?{remove(){banner=false}}:null):s==='#push-device-toggle'?button:s==='#push-device-status'?label:null,api:async(path)=>{if(path==='/api/push/config'){configRequests++;throw Error('redundant config check')}await new Promise(r=>saveResolve=r)},Uint8Array,atob,setTimeout,clearTimeout});
 vm.runInContext(source,context);
 context.registration={pushManager:{subscribe:async()=>subscription}};
 vm.runInContext("pushConfig={publicKey:'AQ'};pushRegistration=registration",context);
 const task=clicks[1]({target:{closest:()=>button}});
 await new Promise(r=>setImmediate(r));assert.equal(banner,true,'wait for durable subscription save');events.pageshow();
 saveResolve();await task;assert.equal(banner,false,'close immediately after successful save');assert.equal(configRequests,0,'no second registration check');
 events['site-ready']();events.pageshow();assert.equal(banner,false,'resume events do not reopen banner');
 console.log('PASS: permission/resume race; banner closes after save without reload or redundant registration.');
}
