import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('public/visual-editor.js','utf8');
const context=vm.createContext({window:{apsuaVisualBridge:{}}});
vm.runInContext(source.replace('window.apsuaVisualTools={normalize,cssRules,snapAxis,snapMove,snapResize};','window.apsuaVisualTools={normalize,cssRules,snapAxis,snapMove,snapResize};return;'),context);
const {normalize,cssRules}=context.window.apsuaVisualTools;
const selector=':where(#app > section:nth-of-type(1) > h1:nth-of-type(1))';
const settings={pages:{'#/':{desktop:{[selector]:{x:20,y:-5,fontSize:36,color:'#123456',textAlign:'center'}},mobile:{[selector]:{fontSize:24,paddingLeft:12}}},'*':{desktop:{':where(body>header)':{height:70}}}}};
const css=cssRules(settings,'#/');assert.match(css,/min-width:701px/);assert.match(css,/max-width:700px/);assert.match(css,/translate:20px -5px!important/);assert.match(css,/font-size:36px!important/);assert.match(css,/font-size:24px!important/);assert.match(css,/height:70px!important/);
assert.ok(!cssRules(settings,'#/transfer').includes('font-size:36px'));
assert.ok(cssRules(settings,'#/transfer').includes('height:70px'));
const before=JSON.stringify(settings);normalize(settings);assert.equal(JSON.stringify(settings),before);
const bad={pages:{'#/':{desktop:{[selector]:{fontSize:9999,color:'red;display:none',backgroundImage:'url(https://evil.test)',width:Infinity,position:'fixed',x:-9999,textAlign:'evil',boxShadow:'url(evil)'},':where(body){display:none}':{fontSize:50}}}}};
const clean=normalize(bad).pages['#/'].desktop[selector];assert.equal(clean.fontSize,160);assert.equal(clean.x,-1500);assert.equal(clean.color,undefined);assert.equal(clean.width,undefined);assert.equal(clean.backgroundImage,undefined);assert.equal(clean.position,undefined);assert.equal(clean.boxShadow,undefined);
assert.ok(!cssRules(bad,'#/').includes('evil'));assert.equal(Object.keys(normalize(bad).pages['#/'].desktop).length,1);
const shell=readFileSync('lib/site-shell.ts','utf8');assert.ok(shell.includes('/visual-editor.js?v=166'));assert.ok(!shell.includes('/visual-editor.css'),'editor panel styles are not loaded for every visitor');assert.match(source,/function open\(\)\{if\(!B\.canEdit\(\)\)return;ensureStyles\(\);/);assert.ok(source.includes("link.href='/visual-editor.css?v=166'"));
console.log('PASS: per-page and device scopes, shared chrome, bounded styling, no arbitrary CSS/HTML, immutable normalization and shell wiring.');

const {snapAxis,snapMove,snapResize}=context.window.apsuaVisualTools;
const rect={left:23,top:30,width:100,height:60},refs=[{left:0,top:0,width:400,height:300,label:'Родитель'},{left:200,top:100,width:100,height:60,label:'Сосед'}];
const snapped=snapMove(rect,74,65,refs);assert.equal(snapped.dx,77);assert.equal(snapped.dy,70);assert.equal(snapped.guides[0].position,200);assert.equal(snapped.guides[1].position,100);
const free=snapMove(rect,74,65,refs,false);assert.equal(free.dx,74);assert.equal(free.dy,65);assert.equal(free.guides.length,0);
const gridded=snapMove(rect,9,11,[],false,8);assert.equal(gridded.dx,9);assert.equal(gridded.dy,10);
const resized=snapResize(rect,174,66,refs);assert.equal(resized.width,177);assert.equal(resized.height,70);assert.equal(snapResize(rect,-20,-20,[],false).width,1);
assert.equal(snapAxis([19],[{position:20,label:'Ближе'},{position:22,label:'Дальше'}]).position,20);
assert.equal(snapAxis([0],[{position:20}]),null);
assert.ok(!source.includes("launch.id='visualLaunch'"));assert.ok(source.includes('data-ancestor'));assert.ok(source.includes('data-layer-search'));assert.ok(source.includes('data-align'));assert.ok(source.includes('e.shiftKey?10:1'));console.log('PASS: nearest edge/center snapping, bypass, 8 px grid, bounded resize, nested selection controls and admin-only launch.');
// Exercise module initialization and editor opening with a small DOM adapter.
const events=new Map(),elements=[];
function node(tag='div'){const n={tagName:tag.toUpperCase(),id:'',hidden:false,style:{},dataset:{},children:[],isConnected:true,textContent:'',innerHTML:'',setAttribute(){},getAttribute(){return ''},classList:{add(){},remove(){},toggle(){},contains(){return false}},append(...items){this.children.push(...items)},replaceChildren(){this.children=[]},querySelector(){return node()},querySelectorAll(){return []},addEventListener(){},closest(){return null},matches(){return false}};elements.push(n);return n}
const dom={head:node('head'),body:node('body'),createElement:node,querySelector:()=>node(),querySelectorAll:()=>[]};
let owner=false;const runtime=vm.createContext({window:{apsuaVisualBridge:{canEdit:()=>owner,canOpen:()=>true,get:()=>({version:1,pages:{}}),toast(){}}},document:dom,innerWidth:1200,innerHeight:800,location:{hash:'#/'},Element:class{},MutationObserver:class{observe(){}},requestAnimationFrame(){},getComputedStyle(){return {}},CSS:{escape:s=>s}});runtime.window.addEventListener=(name,fn)=>{const list=events.get(name)||[];list.push(fn);events.set(name,list)};
vm.runInContext(source,runtime);assert.ok(!elements.some(el=>el.id==='visualLaunch'));assert.equal(elements.find(el=>el.id==='visualEditor').hidden,true);
for(const fn of events.get('resize'))fn();owner=true;const trigger={closest:s=>s==='[data-visual-open]'?{}:null};for(const fn of events.get('click'))fn({target:trigger,preventDefault(){}});assert.equal(elements.find(el=>el.id==='visualEditor').hidden,false);assert.ok(elements.find(el=>el.id==='visualEditor').innerHTML.includes('data-magnet'));for(const fn of events.get('resize'))fn();
console.log('PASS: visitor has no launch control; owner opens from admin action; editor initialization and resize run without errors.');
// Group movement preserves each object's existing offset and is one undo action.
const root=node();root.id='app';root.matches=()=>false;const makeGroup=(id,left)=>{const el=node();el.id=id;el.closest=s=>s==='#app,body>header,#contacts,.mnav,#mbar,.comparison-tray,.popover,.photo-lightbox,.question-layer'?root:null;el.getBoundingClientRect=()=>({left,top:10,right:left+40,bottom:30,width:40,height:20});return el};
const ga=makeGroup('ga',10),gb=makeGroup('gb',80);dom.querySelectorAll=s=>s==='#ga'?[ga]:s==='#gb'?[gb]:[];
const groupRuntime=vm.createContext({...runtime,ga,gb,window:{...runtime.window,apsuaVisualBridge:{canEdit:()=>true,canOpen:()=>true,get:()=>({version:1,pages:{}}),history:async()=>({entries:[]}),toast(){}}}});
const hooks="window.groupTest={set(){selected=gb;selection=[ga,gb];selector=':where(#gb)';active=true;draft={version:1,pages:{'#/':{desktop:{':where(#ga)':{x:5},':where(#gb)':{x:20}}}}}},move:setValue,checkpoint,get:()=>draft,undo(){draft=undo.pop();apply()}};";
vm.runInContext(source.replace('refresh();\n})();',hooks+'refresh();\n})();'),groupRuntime);groupRuntime.window.groupTest.set();groupRuntime.window.groupTest.checkpoint();groupRuntime.window.groupTest.move('x',30);let groupDraft=groupRuntime.window.groupTest.get();assert.equal(groupDraft.pages['#/'].desktop[':where(#ga)'].x,15);assert.equal(groupDraft.pages['#/'].desktop[':where(#gb)'].x,30);groupRuntime.window.groupTest.undo();groupDraft=groupRuntime.window.groupTest.get();assert.equal(groupDraft.pages['#/'].desktop[':where(#ga)'].x,5);assert.equal(groupDraft.pages['#/'].desktop[':where(#gb)'].x,20);
console.log('PASS: grouped movement retains relative offsets and undoes the whole action.');
