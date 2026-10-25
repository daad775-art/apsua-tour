(()=>{const root=document.getElementById('logo-intro-preview');if(!root)return;let skip=!!window.apsuaSkipIntro;try{const navigation=performance.getEntriesByType('navigation')[0];const saved=JSON.parse(sessionStorage.getItem('apsua-refresh-position')||'null');skip=skip||navigation?.type==='reload'||navigation?.type==='back_forward'||saved?.route===location.pathname+location.hash&&(!saved.at||Date.now()-saved.at<60000)}catch{}if(skip){root.remove();return}
// The logo covers only the time the catalogue needs to load: it closes on site-ready,
// on any tap or key press, and never stays longer than 1.5 s. It never loops.
const logo=root.querySelector('.intro-mark'),stage=root.querySelector('.stage');let closed=false,timer;
const dismiss=()=>{if(closed)return;closed=true;clearTimeout(timer);for(const type of ['site-ready','pointerdown','keydown'])window.removeEventListener(type,dismiss);stage.classList.add('closing');setTimeout(()=>root.remove(),220)};
for(const type of ['site-ready','pointerdown','keydown'])window.addEventListener(type,dismiss,{once:true});
logo.addEventListener('error',dismiss,{once:true});timer=setTimeout(dismiss,1500)})();
