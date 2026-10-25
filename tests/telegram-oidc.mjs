import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';

const source=readFileSync(new URL('../lib/telegram-auth.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {telegramAppAPI,telegramIdentity,verifyTelegramIDToken}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../drizzle/0000_demonic_black_cat.sql',import.meta.url),'utf8'));
const DB={prepare(sql){let values=[];return{bind(...v){values=v;return this},async first(){return sqlite.prepare(sql).get(...values)||null},async run(){const r=sqlite.prepare(sql).run(...values);return{meta:{changes:Number(r.changes)}}}}},async batch(items){return Promise.all(items.map(x=>x.run()))}};
const env={DB,TELEGRAM_BOT_TOKEN:'1234567890:TEST_TOKEN_FOR_SIGNATURES_ONLY',TELEGRAM_WEBHOOK_SECRET:'test-webhook-secret'};
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'test-key',alg:'RS256'};
const ecPair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const ecJwk={...await crypto.subtle.exportKey('jwk',ecPair.publicKey),kid:'ec-key',alg:'ES256'};
globalThis.fetch=async url=>{assert.equal(url,'https://oauth.telegram.org/.well-known/jwks.json');return Response.json({keys:[jwk,ecJwk]})};
async function call(path,method='POST',{cookie='',origin='https://test.example',data={}}={}){
 const response=await telegramAppAPI(new Request('https://test.example'+path,{method,headers:{cookie,origin,'cf-connecting-ip':'192.0.2.1'},...(method!=='GET'?{body:JSON.stringify(data)}:{})}),env);
 return{response,status:response.status,data:await response.json(),cookie:response.headers.get('Set-Cookie')?.split(';')[0]};
}
const start=()=>call('/api/telegram-oidc/start');
assert.equal((await call('/api/telegram-oidc/start','POST',{origin:'https://evil.example'})).status,403);
assert.equal((await call('/api/telegram-oidc/start','GET')).status,405);
const first=await start();assert.equal(first.status,200);assert.equal(first.data.clientId,'1234567890');assert.match(first.data.nonce,/^[a-f0-9]{64}$/);
assert.match(first.response.headers.get('Set-Cookie'),/Secure; HttpOnly; SameSite=Lax/);
const resumed=await call('/api/telegram-oidc/start','POST',{cookie:first.cookie});assert.equal(resumed.data.nonce,first.data.nonce);assert.equal(resumed.cookie,undefined);
const now=Math.floor(Date.now()/1000),claims={iss:'https://oauth.telegram.org',aud:'1234567890',sub:'opaque-sub',id:12345,name:'Тест',preferred_username:'example',iat:now,exp:now+300,nonce:first.data.nonce};
async function jwt(changes={},headerChanges={}){
 const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const input=encode({alg:'RS256',kid:'test-key',...headerChanges})+'.'+encode({...claims,...changes});
 const signature=await crypto.subtle.sign(headerChanges.alg==='ES256'?{name:'ECDSA',hash:'SHA-256'}:'RSASSA-PKCS1-v1_5',headerChanges.alg==='ES256'?ecPair.privateKey:pair.privateKey,new TextEncoder().encode(input));
 return input+'.'+Buffer.from(signature).toString('base64url');
}
assert.equal((await verifyTelegramIDToken(await jwt({id:'12345'}),'1234567890',first.data.nonce)).id,'tg:12345');
assert.equal((await verifyTelegramIDToken(await jwt({}, {kid:undefined}),'1234567890',first.data.nonce)).id,'tg:12345');
assert.equal((await verifyTelegramIDToken(await jwt({}, {alg:'ES256',kid:'ec-key'}),'1234567890',first.data.nonce)).id,'tg:12345');
const opaque=await verifyTelegramIDToken(await jwt({id:undefined}),'1234567890',first.data.nonce);assert.match(opaque.id,/^tg:oidc:[a-f0-9]{64}$/);assert.equal(opaque.subject,'opaque-sub');
const token=await jwt(),cookie=first.cookie;
const finish=(id_token,options={})=>call('/api/telegram-oidc/finish','POST',{cookie,data:{id_token},...options});
assert.equal((await finish(token,{cookie:''})).status,410);
assert.equal((await finish(token,{origin:'https://evil.example'})).status,403);
for(const change of [{iss:'https://evil.example'},{aud:'other'},{nonce:'wrong'},{exp:now-1},{iat:now+300},{id:'invalid'},{id:-1},{sub:''}])assert.equal((await finish(await jwt(change))).status,401,JSON.stringify(change));
assert.equal((await finish(await jwt({}, {alg:'none'}))).status,401);
assert.equal((await finish(token.slice(0,-12)+'AAAAAAAAAAAA')).status,401);
const other=await start();assert.equal((await finish(token,{cookie:other.cookie})).status,401);
const success=await finish(token);assert.equal(success.status,200);assert.equal(success.data.ok,true);
const sessionCookie=success.response.headers.get('Set-Cookie').match(/__Host-apsua_tg=[a-f0-9]{64}/)[0];
assert.equal((await telegramIdentity(new Request('https://test.example',{headers:{cookie:sessionCookie}}),env)).id,'tg:12345');
assert.equal((await finish(token)).status,410);
const id=other.cookie.split('=')[1].split('.')[0],record=sqlite.prepare('SELECT body FROM records WHERE id=?').get('tg-oidc:'+id);sqlite.prepare('UPDATE records SET body=? WHERE id=?').run(JSON.stringify({...JSON.parse(record.body),expires:Date.now()-1}),'tg-oidc:'+id);
assert.equal((await finish(token,{cookie:other.cookie})).status,410);
// Stable subject mapping survives later omission/representation changes of optional id.
const stable=await start(), stableToken=await jwt({id:undefined,nonce:stable.data.nonce});
const stableFinish=await finish(stableToken,{cookie:stable.cookie});assert.equal(stableFinish.status,200);
const stableCookie=stableFinish.response.headers.get('Set-Cookie').match(/__Host-apsua_tg=[a-f0-9]{64}/)[0];
assert.equal((await telegramIdentity(new Request('https://test.example',{headers:{cookie:stableCookie}}),env)).id,'tg:12345');
// No id ever present: use a separate subject namespace, never guess a Bot API id.
const opaqueStart=await start(), opaqueToken=await jwt({id:undefined,sub:'different-opaque-sub',nonce:opaqueStart.data.nonce});
const opaqueFinish=await finish(opaqueToken,{cookie:opaqueStart.cookie});assert.equal(opaqueFinish.status,200);
const opaqueCookie=opaqueFinish.response.headers.get('Set-Cookie').match(/__Host-apsua_tg=[a-f0-9]{64}/)[0];
assert.match((await telegramIdentity(new Request('https://test.example',{headers:{cookie:opaqueCookie}}),env)).id,/^tg:oidc:/);
for(let i=0;i<6;i++)await start();assert.equal((await start()).status,429);
console.log('PASS: real RSA/EC signatures, numeric/string/absent optional id, stable opaque-subject mapping, JWT issuer/audience/nonce/expiry/issued-at/id, cookie binding, Origin, replay, rate limit and same Telegram user session. No bot/chat/phone scope.');
