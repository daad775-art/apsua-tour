type PushEnv={DB:D1Database;VAPID_PUBLIC_KEY?:string;VAPID_PRIVATE_JWK?:string;VAPID_SUBJECT?:string};
const pushJson=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const pushBytes=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const pushB64=(b:Uint8Array)=>btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const pushText=(s:string)=>new TextEncoder().encode(s);
const pushConcat=(...parts:Uint8Array[])=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let i=0;for(const p of parts){out.set(p,i);i+=p.length}return out};
const pushBuffer=(b:Uint8Array)=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer;
async function pushHKDF(secret:Uint8Array,salt:Uint8Array,info:Uint8Array,size:number){const key=await crypto.subtle.importKey('raw',pushBuffer(secret),'HKDF',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:pushBuffer(salt),info:pushBuffer(info)},key,size*8))}
export function validPushSubscription(value:any){
 try{const u=new URL(value.endpoint);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||value.endpoint.length>2000)return false;
 if(!['web.push.apple.com','fcm.googleapis.com','updates.push.services.mozilla.com'].includes(u.hostname)&&!u.hostname.endsWith('.push.services.mozilla.com'))return false;
 const key=pushBytes(value.keys.p256dh),auth=pushBytes(value.keys.auth);return key.length===65&&key[0]===4&&auth.length===16}catch{return false}
}
async function pushSigningKey(env:PushEnv){
 const jwk=JSON.parse(env.VAPID_PRIVATE_JWK!);
 // Key usage metadata must describe ES256 signing, even if the EC key was exported for ECDH.
 return await crypto.subtle.importKey('jwk',{...jwk,alg:'ES256',key_ops:['sign']},{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
}
async function pushKeyHealth(env:PushEnv){
 try{const jwk=JSON.parse(env.VAPID_PRIVATE_JWK!);const publicKey=pushConcat(new Uint8Array([4]),pushBytes(jwk.x),pushBytes(jwk.y));
 if(pushB64(publicKey)!==env.VAPID_PUBLIC_KEY)return 'VapidKeyMismatch';
 const key=await pushSigningKey(env),test=pushText('apsua-push-key-check');
 const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,pushBuffer(test));
 const verify=await crypto.subtle.importKey('raw',pushBuffer(publicKey),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
 if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},verify,sig,pushBuffer(test)))return 'VapidSignatureInvalid';return null;
 }catch{return 'VapidKeyInvalid'}
}
function pushFailure(job:any,provider:string,code:string){
 job.errors ||= [];const found=job.errors.find((x:any)=>x.provider===provider&&x.code===code);
 if(found)found.count++;else if(job.errors.length<20)job.errors.push({provider,code,count:1});
 console.error('web-push failure',JSON.stringify({provider,code}));
}
// RFC 8291 / RFC 8188 single-record aes128gcm payload, using Worker-native WebCrypto.
export async function createPushRequest(subscription:any,payload:any,env:PushEnv){
 if(!validPushSubscription(subscription))throw new Error('Некорректная подписка');
 const ua=pushBytes(subscription.keys.p256dh),auth=pushBytes(subscription.keys.auth);
 const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const as=new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey));
 const uaKey=await crypto.subtle.importKey('raw',pushBuffer(ua),{name:'ECDH',namedCurve:'P-256'},false,[]);
 const secret=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:uaKey},pair.privateKey,256));
 const ikm=await pushHKDF(secret,auth,pushConcat(pushText('WebPush: info\0'),ua,as),32),salt=crypto.getRandomValues(new Uint8Array(16));
 const cek=await pushHKDF(ikm,salt,pushText('Content-Encoding: aes128gcm\0'),16),nonce=await pushHKDF(ikm,salt,pushText('Content-Encoding: nonce\0'),12);
 const plain=pushConcat(pushText(JSON.stringify(payload)),new Uint8Array([2]));if(plain.length>3900)throw new Error('Уведомление слишком длинное');
 const key=await crypto.subtle.importKey('raw',pushBuffer(cek),'AES-GCM',false,['encrypt']);
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:pushBuffer(nonce)},key,pushBuffer(plain)));
 const recordSize=new Uint8Array(4);new DataView(recordSize.buffer).setUint32(0,4096);
 const body=pushConcat(salt,recordSize,new Uint8Array([as.length]),as,encrypted);
 const header=pushB64(pushText(JSON.stringify({typ:'JWT',alg:'ES256'}))),claims=pushB64(pushText(JSON.stringify({aud:new URL(subscription.endpoint).origin,exp:Math.floor(Date.now()/1000)+43200,sub:env.VAPID_SUBJECT||'mailto:apsuatur@mail.ru'})));
 const jwt=header+'.'+claims,signingKey=await pushSigningKey(env);
 const signature=pushB64(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},signingKey,pushBuffer(pushText(jwt)))));
 return {body:pushBuffer(body),headers:{Authorization:'vapid t='+jwt+'.'+signature+', k='+env.VAPID_PUBLIC_KEY,'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',TTL:'86400',Urgency:'normal'}}
}
export async function sendPushRequest(subscription:any,payload:any,env:PushEnv){
 const details=await createPushRequest(subscription,payload,env);
 // Workers supports manual/follow only. Manual also keeps VAPID credentials on the validated origin.
 return await fetch(subscription.endpoint,{method:'POST',headers:details.headers,body:details.body,redirect:'manual',signal:AbortSignal.timeout(12000)});
}
function pushSummary(job:any){return {id:job.id,title:job.title,text:job.text,audience:job.audience==='news'?'news':'service',total:job.targets.length,cursor:job.cursor,accepted:job.accepted,failed:job.failed,expired:job.expired,errors:job.errors||[],created:job.created}}
export async function pushAPI(request:Request,env:PushEnv,user:string,owner:boolean):Promise<Response>{
 const path=new URL(request.url).pathname,enabled=!!env.VAPID_PRIVATE_JWK&&!!env.VAPID_PUBLIC_KEY;
 if(path==='/api/push/config'){const setupError=enabled?await pushKeyHealth(env):'PushNotConfigured';return pushJson({enabled:enabled&&!setupError,publicKey:enabled&&!setupError?env.VAPID_PUBLIC_KEY:null,setupError})}
 if(!user)return pushJson({error:'Войдите в аккаунт'},401);
 if(path.startsWith('/api/admin/push')&&!owner)return pushJson({error:'Отправка доступна только владельцу'},403);
 if(request.method!=='GET'&&request.headers.get('origin')!==new URL(request.url).origin)return pushJson({error:'Недопустимый источник запроса'},403);
 if(path==='/api/push/subscription'&&['POST','DELETE'].includes(request.method)){
  const raw=await request.text();if(raw.length>5000)return pushJson({error:'Некорректная подписка'},400);const value=JSON.parse(raw);
  const sid='push:'+pushB64(new Uint8Array(await crypto.subtle.digest('SHA-256',pushBuffer(pushText(value.endpoint||'')))));
  if(request.method==='DELETE'){await env.DB.prepare("DELETE FROM records WHERE id=? AND kind='push-subscription' AND owner=?").bind(sid,user).run();return pushJson({ok:true})}
  if(!enabled)return pushJson({error:'Уведомления пока не настроены'},503);
  if(!validPushSubscription(value))return pushJson({error:'Некорректная подписка'},400);
  await crypto.subtle.importKey('raw',pushBuffer(pushBytes(value.keys.p256dh)),{name:'ECDH',namedCurve:'P-256'},false,[]);
  const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM records WHERE kind='push-subscription' AND owner=? AND id<>?").bind(user,sid).first<any>();if(count.n>=20)return pushJson({error:'Лимит подписанных устройств'},429);
  const stored={endpoint:value.endpoint,keys:{p256dh:value.keys.p256dh,auth:value.keys.auth}};
  // build 146: marketing consent ("news") is separate and off by default; a re-registration of the same device by the same user keeps it.
  await env.DB.prepare("INSERT INTO records(id,kind,owner,body,status,created,updated) VALUES(?,'push-subscription',?,?,'active',?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,body=CASE WHEN records.owner=excluded.owner AND json_extract(records.body,'$.news')=1 THEN json_set(excluded.body,'$.news',json('true')) ELSE excluded.body END,updated=excluded.updated").bind(sid,user,JSON.stringify(stored),Date.now(),Date.now()).run();
  const saved=await env.DB.prepare("SELECT body FROM records WHERE id=? AND kind='push-subscription' AND owner=?").bind(sid,user).first<any>();return pushJson({ok:true,news:!!(saved&&JSON.parse(saved.body).news===true)})
 }
 if(path==='/api/push/preferences'&&['GET','POST'].includes(request.method)){
  // Consent to news and offers for one device of the signed-in user. Trip notifications do not depend on it.
  const raw=request.method==='GET'?JSON.stringify({endpoint:new URL(request.url).searchParams.get('endpoint')||''}):await request.text();if(raw.length>5000)return pushJson({error:'Некорректный запрос'},400);let value:any;try{value=JSON.parse(raw)}catch{return pushJson({error:'Некорректный запрос'},400)}
  const sid='push:'+pushB64(new Uint8Array(await crypto.subtle.digest('SHA-256',pushBuffer(pushText(String(value.endpoint||''))))));
  const row=await env.DB.prepare("SELECT body FROM records WHERE id=? AND kind='push-subscription' AND owner=?").bind(sid,user).first<any>();if(!row)return pushJson({error:'Уведомления на этом устройстве не включены'},404);
  const body=JSON.parse(row.body);if(request.method==='POST'){if(typeof value.news!=='boolean')return pushJson({error:'Некорректный запрос'},400);body.news=value.news;await env.DB.prepare("UPDATE records SET body=?,updated=? WHERE id=? AND kind='push-subscription' AND owner=?").bind(JSON.stringify(body),Date.now(),sid,user).run()}
  return pushJson({ok:true,news:body.news===true})
 }
 if(path==='/api/admin/push'&&request.method==='GET'){
  const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM records WHERE kind='push-subscription'").first<any>();const news=await env.DB.prepare("SELECT COUNT(*) AS n FROM records WHERE kind='push-subscription' AND json_extract(body,'$.news')=1").first<any>();
  const rows=await env.DB.prepare("SELECT body,status FROM records WHERE kind='push-message' ORDER BY created DESC LIMIT 15").all<any>();return pushJson({enabled,devices:count.n,newsDevices:news.n,history:rows.results.map(r=>({...pushSummary(JSON.parse(r.body)),status:r.status}))})
 }
 if(path==='/api/admin/push'&&request.method==='POST'){
  if(!enabled)return pushJson({error:'Уведомления пока не настроены'},503);
  const value:any=await request.json(),title=String(value.title||'').trim(),text=String(value.text||'').trim();
  if(!title||title.length>80||!text||text.length>700)return pushJson({error:'Заголовок: до 80 символов, текст: до 700 символов'},400);
  if(!/^[a-f0-9-]{36}$/.test(value.id||''))return pushJson({error:'Некорректный идентификатор отправки'},400);
  const id='push-message:'+value.id,existing=await env.DB.prepare("SELECT body,status FROM records WHERE id=? AND kind='push-message'").bind(id).first<any>();if(existing)return pushJson({...pushSummary(JSON.parse(existing.body)),status:existing.status});
  // "service" (default): important information for travellers, every subscribed device. "news": advertising and offers,
  // only devices whose owner explicitly agreed to receive them.
  const audience=value.audience==='news'?'news':'service';
  const targets=await env.DB.prepare("SELECT id FROM records WHERE kind='push-subscription'"+(audience==='news'?" AND json_extract(body,'$.news')=1":"")+" ORDER BY id").all<any>();if(!targets.results.length)return pushJson({error:audience==='news'?'Пока никто не согласился получать новости и предложения':'Пока нет подписанных устройств'},400);
  const job={id,title,text,audience,targets:targets.results.map(r=>r.id),cursor:0,accepted:0,failed:0,expired:0,created:Date.now()};
  await env.DB.prepare("INSERT OR IGNORE INTO records(id,kind,owner,body,status,created,updated) VALUES(?,'push-message',?,?,'pending',?,?)").bind(id,user,JSON.stringify(job),job.created,job.created).run();return pushJson({...pushSummary(job),status:'pending'})
 }
 if(path==='/api/admin/push/batch'&&request.method==='POST'){
  const value:any=await request.json(),row=await env.DB.prepare("SELECT body,status,updated FROM records WHERE id=? AND kind='push-message' AND owner=?").bind(value.id,user).first<any>();if(!row)return pushJson({error:'Отправка не найдена'},404);
  const job=JSON.parse(row.body);if(row.status==='done'||Number(value.cursor)!==job.cursor)return pushJson({...pushSummary(job),status:row.status});
  if(row.status==='sending')return pushJson({error:'Эта часть отправки уже выполняется'},409);
  const lock=await env.DB.prepare("UPDATE records SET status='sending',updated=? WHERE id=? AND updated=? AND status='pending'").bind(Date.now(),job.id,row.updated).run();if(!lock.meta.changes)return pushJson({error:'Отправка уже выполняется'},409);
  const ids=job.targets.slice(job.cursor,job.cursor+25),rows=await env.DB.prepare("SELECT id,body FROM records WHERE kind='push-subscription' AND id IN ("+ids.map(()=>'?').join(',')+")").bind(...ids).all<any>();
  for(let i=0;i<ids.length;i+=5)await Promise.all(ids.slice(i,i+5).map(async(sid:string)=>{
   const saved=rows.results.find(r=>r.id===sid);if(!saved){job.expired++;return}
   if(job.audience==='news'){try{if(JSON.parse(saved.body).news!==true){job.expired++;return}}catch{job.expired++;return}}
   try{const subscription=JSON.parse(saved.body);
    const result=await sendPushRequest(subscription,{title:job.title,body:job.text,url:'/#/',tag:job.id},env);
    if(result.ok)job.accepted++;else if([404,410].includes(result.status)){job.expired++;await env.DB.prepare("DELETE FROM records WHERE id=? AND body=?").bind(sid,saved.body).run()}else {job.failed++;let reason='';try{const body:any=await result.json();if(typeof body.reason==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(body.reason))reason=' '+body.reason}catch{}pushFailure(job,new URL(subscription.endpoint).hostname,'HTTP '+result.status+reason)}
   }catch(error:any){job.failed++;const code=error?.name==='TimeoutError'?'Timeout':error?.name==='AbortError'?'Aborted':error?.name==='DataError'?'CryptoDataError':error?.name==='SyntaxError'?'InvalidKeyJSON':error?.name==='InvalidAccessError'?'CryptoKeyUsage':error?.name==='OperationError'?'CryptoOperationError':'NetworkOrCryptoError';pushFailure(job,new URL(JSON.parse(saved.body).endpoint).hostname,code)}
  }));
  job.cursor+=ids.length;const status=job.cursor>=job.targets.length?'done':'pending';await env.DB.prepare('UPDATE records SET body=?,status=?,updated=? WHERE id=?').bind(JSON.stringify(job),status,Date.now(),job.id).run();return pushJson({...pushSummary(job),status})
 }
 return pushJson({error:'Не найдено'},404)
}

// 14.0: a personal notification to every device of one tourist (status change of their request).
// Never throws: a failed push must not undo the order update that triggered it.
export async function pushToUser(env:PushEnv,owner:string,message:{title:string;body:string;url?:string;tag?:string}){if(!owner||!env.VAPID_PRIVATE_JWK||!env.VAPID_PUBLIC_KEY)return 0;let sent=0;try{const rows=await env.DB.prepare("SELECT id,body FROM records WHERE kind='push-subscription' AND owner=? LIMIT 20").bind(owner).all<any>();await Promise.all(rows.results.map(async(row:any)=>{try{const result=await sendPushRequest(JSON.parse(row.body),{title:message.title.slice(0,80),body:message.body.slice(0,700),url:message.url||'/#/account',tag:message.tag||'apsua-order'},env);if(result.ok)sent++;else if([404,410].includes(result.status))await env.DB.prepare("DELETE FROM records WHERE id=? AND body=?").bind(row.id,row.body).run()}catch{}}))}catch{}return sent}
