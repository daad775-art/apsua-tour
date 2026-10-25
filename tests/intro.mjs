import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../lib/site-shell.ts',import.meta.url),'utf8');
const html=JSON.parse(source.trim().slice('export default '.length).replace(/;$/,''));
const startup=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).find(x=>x.includes('apsuaSkipIntro'));
assert.ok(startup);assert.ok(html.indexOf(startup)<html.indexOf('id="logo-intro-preview"'),'Skip decided before overlay markup');
function run(type,saved=null){
 let removed=false,readyListener=false,hidden=false;
 const root={remove(){removed=true},querySelector(selector){return selector==='.stage'?{classList:{add(){},remove(){}},offsetWidth:0}:{addEventListener(){}}}};
 const window={addEventListener(){readyListener=true},removeEventListener(){}};
 const ctx=vm.createContext({window,document:{getElementById:()=>root,documentElement:{setAttribute(){hidden=true}}},performance:{getEntriesByType:()=>[{type}],now:()=>0},sessionStorage:{getItem:()=>saved?JSON.stringify(saved):null},location:{pathname:'/',hash:'#/'},requestAnimationFrame(){},cancelAnimationFrame(){},setTimeout(){},clearTimeout(){}});
 vm.runInContext(startup,ctx);vm.runInContext(readFileSync(new URL('../public/intro.js',import.meta.url),'utf8'),ctx);
 return {removed,readyListener,hidden};
}
assert.deepEqual(run('navigate'),{removed:false,readyListener:true,hidden:false},'Fresh entry plays logo');
for(const type of ['reload','back_forward'])assert.deepEqual(run(type),{removed:true,readyListener:false,hidden:true},type+' skips logo');
assert.equal(run('navigate',{route:'/#/',at:Date.now()}).removed,true,'Automatic/pull refresh marker skips logo even if installed app reports navigate');
assert.equal(run('navigate',{route:'/#/',at:Date.now()-120000}).removed,false,'Expired marker cannot suppress future entry');
console.log('PASS: entry logo retained, refresh/back navigation skip overlay before paint, installed-app refresh marker and expiration.');
