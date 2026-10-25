import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import ts from 'typescript';
import fs from 'node:fs';
import {generateKeyPairSync,createECDH,randomBytes} from 'node:crypto';
const js=ts.transpileModule(fs.readFileSync('lib/web-push.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const jwk=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({format:'jwk'}),ua=createECDH('prime256v1');ua.generateKeys();
const env={VAPID_PRIVATE_JWK:JSON.stringify(jwk),VAPID_PUBLIC_KEY:Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')]).toString('base64url')};
const sub={endpoint:'https://web.push.apple.com/test',keys:{p256dh:ua.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};
let status=201,calls=0;
const mf=new Miniflare({modules:true,compatibilityDate:'2026-05-15',script:js+`\nexport default {async fetch(){try{const r=await sendPushRequest(${JSON.stringify(sub)},{title:'test',body:'test'},${JSON.stringify(env)});return Response.json({status:r.status})}catch(e){return Response.json({error:e.message})}}}`,outboundService:async request=>{
 calls++;assert.equal(request.url,sub.endpoint);assert.equal(request.method,'POST');assert.equal(request.headers.get('content-encoding'),'aes128gcm');assert.ok(request.headers.get('authorization').startsWith('vapid t='));assert.ok((await request.arrayBuffer()).byteLength>100);
 return new Response('',{status,headers:status===302?{Location:'https://example.com/redirect'}:{}});
}});
try{
 assert.deepEqual(await (await mf.dispatchFetch('https://example.test')).json(),{status:201});assert.equal(calls,1);
 status=302;assert.deepEqual(await (await mf.dispatchFetch('https://example.test')).json(),{status:302});assert.equal(calls,2,'redirect must not forward subscription or credentials');
 console.log('PASS: actual Worker runtime sends encrypted VAPID requests; redirects remain unfollowed. No real devices contacted.');
}finally{await mf.dispose()}
