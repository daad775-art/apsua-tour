import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const rsa=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const ec=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const keys=[{...await crypto.subtle.exportKey('jwk',rsa.publicKey),kid:'pinned-rsa',alg:'RS256'},{...await crypto.subtle.exportKey('jwk',ec.publicKey),kid:'pinned-ec',alg:'ES256'}];
const original=readFileSync('lib/telegram-auth.ts','utf8');
const match=original.match(/const telegramPinnedJWKS: \{ keys: TelegramJWK\[\] \} = ([^\n]+);/);assert.ok(match);
const productionPins=JSON.parse(match[1]).keys;assert.deepEqual(productionPins.map(k=>k.kid),['oidc-1','oidc-es256-1']);assert.ok(productionPins.every(k=>!('d' in k)&&!('p' in k)&&!('q' in k)));
const now=Math.floor(Date.now()/1000),claims={iss:'https://oauth.telegram.org',aud:'test-client',sub:'test-subject',id:12345,name:'Test',iat:now,exp:now+300,nonce:'test-nonce'};
async function token(alg,kid,changes={}){
 const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const input=encode({alg,kid})+'.'+encode({...claims,...changes});
 const signature=await crypto.subtle.sign(alg==='RS256'?'RSASSA-PKCS1-v1_5':{name:'ECDSA',hash:'SHA-256'},alg==='RS256'?rsa.privateKey:ec.privateKey,new TextEncoder().encode(input));
 return input+'.'+Buffer.from(signature).toString('base64url');
}
let moduleIndex=0;
async function verifier(fetcher){
 globalThis.fetch=async url=>{assert.equal(url,'https://oauth.telegram.org/.well-known/jwks.json');return fetcher()};
 const fixture=original.replace(match[0],'const telegramPinnedJWKS: { keys: TelegramJWK[] } = '+JSON.stringify({keys})+';')+'\n// instance '+moduleIndex++;
 const js=ts.transpileModule(fixture,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 return (await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))).verifyTelegramIDToken;
}
for(const fetcher of [()=>{throw new TypeError('offline')},()=>new Response('Forbidden',{status:403}),()=>new Response('<html>gateway</html>'),()=>Response.json({keys:[]})]){
 const verify=await verifier(fetcher);
 assert.equal((await verify(await token('RS256','pinned-rsa'),'test-client','test-nonce')).id,'tg:12345');
 assert.equal((await verify(await token('ES256','pinned-ec'),'test-client','test-nonce')).id,'tg:12345');
 assert.equal(await verify(await token('RS256','unknown-key'),'test-client','test-nonce'),null);
 assert.equal(await verify(await token('RS256','pinned-rsa',{nonce:'wrong'}),'test-client','test-nonce'),null);
 assert.equal(await verify(await token('RS256','pinned-rsa',{exp:now-1}),'test-client','test-nonce'),null);
}
// Reachable Telegram JWKS is authoritative; do not fall back to an old key if it
// was removed from the live list, nor accept a forged/incorrect signature.
const live=await verifier(()=>Response.json({keys:[{...keys[0],kid:'rotated-key'}]}));
assert.equal(await live(await token('RS256','pinned-rsa'),'test-client','test-nonce'),null);
assert.equal((await live(await token('RS256','rotated-key'),'test-client','test-nonce')).id,'tg:12345');
console.log('PASS: production pins contain only official public RSA/EC keys; offline/403/invalid JWKS fallback verifies signatures, nonce and expiry, rejects unknown kids, and respects live key rotation.');
