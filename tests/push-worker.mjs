import vm from 'node:vm';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const events={};let notification,opened,focused=false;
const self={location:{origin:'https://example.test'},registration:{async showNotification(title,options){notification={title,...options}}},clients:{async matchAll(){return[{url:'https://example.test/#/account',async focus(){focused=true}}]},async openWindow(url){opened=url}},addEventListener(name,fn){events[name]=fn}};
vm.runInNewContext(readFileSync('public/sw.js','utf8'),{self,URL});
let work;events.push({data:{json:()=>({title:'Новости 🌴',body:'Поездка подтверждена ✅',tag:'job1'})},waitUntil(p){work=p}});await work;assert.equal(notification.title,'Новости 🌴');assert.equal(notification.body,'Поездка подтверждена ✅');assert.ok(notification.icon);assert.equal(notification.tag,'job1');
events.push({data:{json(){throw Error('bad json')}},waitUntil(p){work=p}});await work;assert.equal(notification.title,'Апсуа Тур','Even malformed push displays a visible notification');
events.notificationclick({notification:{close(){}},waitUntil(p){work=p}});await work;assert.ok(focused);assert.equal(opened,undefined);
self.clients.matchAll=async()=>[];events.notificationclick({notification:{close(){}},waitUntil(p){work=p}});await work;assert.equal(opened,'/#/');
console.log('PASS: background push displays emoji, app icon and fallback notification; tapping focuses or opens the app.');
