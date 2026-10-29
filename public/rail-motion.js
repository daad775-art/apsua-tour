(()=>{
'use strict';
// build 166: with prefers-reduced-motion the wheel moves the rail at once and a released swipe does not coast.
const reducedMotion=()=>{try{return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches}catch{return false}};
function create(rail,{now=()=>performance.now(),raf=fn=>requestAnimationFrame(fn),caf=id=>cancelAnimationFrame(id),reduced=reducedMotion}={}){
 let frame=0,phase='',target=0,velocity=0,last=0,gesture=null,suppressUntil=0;
 const cycle=()=>Number(rail.dataset?.loopLength)||0,base=()=>Number(rail.dataset?.loopBase)||0;
 const max=()=>Math.max(0,rail.scrollWidth-rail.clientWidth),clamp=x=>cycle()?x:Math.max(0,Math.min(max(),x));
 function place(x){const length=cycle();if(length){const wrapped=base()+((x-base())%length+length)%length;if(phase==='wheel')target+=wrapped-x;rail.scrollLeft=wrapped}else rail.scrollLeft=clamp(x)}
 function cancel(){if(frame)caf(frame);frame=0;phase='';velocity=0}
 function tick(time){frame=0;if(rail.isConnected===false){cancel();return}const dt=Math.min(40,Math.max(1,time-last));last=time;
  if(phase==='wheel'){const gap=target-rail.scrollLeft;if(Math.abs(gap)<.5){place(target);phase='';return}place(rail.scrollLeft+gap*(1-Math.exp(-dt/110)))}
  else if(phase==='coast'){velocity*=Math.exp(-dt/310);const previous=rail.scrollLeft;place(previous+velocity*dt);if(Math.abs(velocity)<.015||Math.abs(rail.scrollLeft-previous)<.05){phase='';return}}
  else return;frame=raf(tick);
 }
 function start(mode){phase=mode;if(!frame){last=now();frame=raf(tick)}}
 function wheel(delta){const base=phase==='wheel'?target:rail.scrollLeft,next=clamp(base+delta);if(Math.abs(next-base)<.1)return false;if(reduced()){cancel();place(next);return true}if(phase!=='wheel')cancel();target=next;start('wheel');return true}
 function touchStart(x,y){cancel();gesture={x,y,lastX:x,lastAt:now(),dragging:false,vertical:false};}
 function touchMove(x,y){if(!gesture||gesture.vertical)return false;const dx=x-gesture.x,dy=y-gesture.y;
  if(!gesture.dragging){if(Math.max(Math.abs(dx),Math.abs(dy))<6)return false;if(Math.abs(dy)>=Math.abs(dx)){gesture.vertical=true;return false}gesture.dragging=true}
  const time=now(),dt=Math.max(1,time-gesture.lastAt),distance=gesture.lastX-x;place(rail.scrollLeft+distance);velocity=.25*velocity+.75*Math.max(-3.5,Math.min(3.5,distance/dt));gesture.lastX=x;gesture.lastAt=time;return true;
 }
 function touchEnd(cancelled=false){if(!gesture)return;const dragged=gesture.dragging,recent=now()-gesture.lastAt<100;gesture=null;if(dragged)suppressUntil=now()+350;if(!cancelled&&dragged&&recent&&Math.abs(velocity)>.03&&!reduced())start('coast');else cancel()}
 return {wheel,touchStart,touchMove,touchEnd,cancel,suppressClick:()=>now()<suppressUntil};
}
window.ApsuaRailMotion={create};
if(document.documentElement)document.documentElement.dataset.railMotion='ready';
const controllers=new WeakMap();let active=null;
const forRail=rail=>{if(!controllers.has(rail))controllers.set(rail,create(rail));return controllers.get(rail)};
window.ApsuaRailMotion.move=(rail,delta)=>forRail(rail).wheel(delta);
function initPopularLoop(){const rail=document.getElementById?.('v4Pop');if(!rail||rail.dataset.loopReady)return;const originals=[...rail.children];if(originals.length<2)return;const length=originals.reduce((sum,e)=>sum+e.getBoundingClientRect().width,0)+(parseFloat(getComputedStyle(rail).gap)||0)*originals.length;if(!length)return;
 const side=Math.max(1,Math.ceil(rail.clientWidth/length)),clone=()=>originals.map(e=>{const copy=e.cloneNode(true);copy.dataset.loopClone='';copy.setAttribute('aria-hidden','true');copy.tabIndex=-1;copy.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));copy.querySelectorAll('a,button,input,select').forEach(n=>n.tabIndex=-1);return copy});
 for(let i=0;i<side;i++){rail.prepend(...clone());rail.append(...clone())}rail.dataset.loopLength=String(length);rail.dataset.loopBase=String(side*length);rail.dataset.loopReady='true';rail.scrollLeft=side*length;
 const resize=()=>{forRail(rail).cancel();const first=rail.children[0],next=rail.children[originals.length],updated=next.getBoundingClientRect().left-first.getBoundingClientRect().left;if(updated>0){rail.dataset.loopLength=String(updated);rail.dataset.loopBase=String(side*updated);rail.scrollLeft=side*updated}};
 if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(()=>{if(!rail.isConnected){observer.disconnect();return}resize()});observer.observe(rail)}
}
// build 166: the handlers that may cancel scrolling (non-passive wheel/touchmove) sit on the rails only, so the rest of the page
// scrolls without waiting for script. Rails are bound as they appear.
function railWheel(event){const rail=event.currentTarget;if(event.ctrlKey||event.metaKey)return;const delta=(Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY)*(event.deltaMode===1?16:event.deltaMode===2?rail.clientWidth:1);if(forRail(rail).wheel(delta))event.preventDefault()}
function railTouchMove(event){if(!active)return;if(event.touches.length!==1||!event.cancelable){active.touchEnd(true);active=null;return}if(active.touchMove(event.touches[0].clientX,event.touches[0].clientY))event.preventDefault()}
const bound=new WeakSet();
function bindRails(){const root=document.getElementById?.('app');if(!root?.querySelectorAll)return;for(const rail of root.querySelectorAll('.v4-rail,#v4Places,#v4Pop')){if(bound.has(rail))continue;bound.add(rail);if(rail.matches?.('#v4Places,#v4Pop'))rail.addEventListener('wheel',railWheel,{passive:false});if(rail.matches?.('.v4-rail'))rail.addEventListener('touchmove',railTouchMove,{passive:false})}}
window.ApsuaRailMotion.bindRails=bindRails;
let loopScheduled=false;function scheduleLoop(){if(loopScheduled)return;loopScheduled=true;requestAnimationFrame(()=>{loopScheduled=false;bindRails();initPopularLoop()})}
if(typeof MutationObserver!=='undefined'&&document.getElementById?.('app')){new MutationObserver(scheduleLoop).observe(document.getElementById('app'),{childList:true,subtree:true});scheduleLoop()}
document.addEventListener('touchstart',event=>{if(active){active.touchEnd(true);active=null}if(event.touches.length!==1)return;const rail=event.target.closest?.('.v4-rail');if(!rail)return;active=forRail(rail);active.touchStart(event.touches[0].clientX,event.touches[0].clientY)},{passive:true});
document.addEventListener('touchend',()=>{active?.touchEnd();active=null},{passive:true});
document.addEventListener('touchcancel',()=>{active?.touchEnd(true);active=null},{passive:true});
document.addEventListener('click',event=>{const rail=event.target.closest?.('.v4-rail');if(rail&&controllers.get(rail)?.suppressClick()){event.preventDefault();event.stopImmediatePropagation()}},true);
document.addEventListener('dragstart',event=>{if(event.target.closest?.('.v4-rail'))event.preventDefault()});
})();
