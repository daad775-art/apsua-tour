import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const js=ts.transpileModule(fs.readFileSync('lib/app-icons.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {installationAsset}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
for(const size of [32,180,192,512]){
 const url='https://site.test/api/app-icon-'+size+'.png',response=installationAsset(new Request(url));assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'image/png');assert.equal(response.headers.get('Set-Cookie'),null);
 const bytes=Buffer.from(await response.arrayBuffer());assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);assert.equal(Number(response.headers.get('Content-Length')),bytes.length);
 const head=installationAsset(new Request(url,{method:'HEAD'}));assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);assert.equal(head.headers.get('ETag'),response.headers.get('ETag'));
 const cached=installationAsset(new Request(url,{headers:{'If-None-Match':response.headers.get('ETag')}}));assert.equal(cached.status,304);
 assert.equal(installationAsset(new Request(url,{method:'POST'})).status,405);
}
const manifest=installationAsset(new Request('https://site.test/api/app-manifest.webmanifest'));assert.match(manifest.headers.get('Content-Type'),/application\/manifest\+json/);const m=await manifest.json();assert.equal(m.id,'/');assert.equal(m.scope,'/');assert.equal(m.display,'standalone');for(const i of m.icons)assert.equal(installationAsset(new Request('https://site.test'+i.src)).status,200);
assert.equal(installationAsset(new Request('https://site.test/api/private')),null);
const source=fs.readFileSync('lib/site-shell.ts','utf8'),html=JSON.parse(source.slice('export default '.length).replace(/;\s*$/,'')),head=html.split('</head>')[0];assert.equal((head.match(/rel="apple-touch-icon"/g)||[]).length,1);assert.ok(head.includes('href="/api/app-icon-180.png"'));assert.ok(head.includes('href="/api/app-manifest.webmanifest"'));assert.ok(head.includes('property="og:image"'));assert.ok(!head.includes('apple-touch-icon-precomposed'));
const worker=fs.readFileSync('build/sites-worker.ts','utf8');assert.ok(worker.indexOf('installationAsset(request)')<worker.indexOf("path.startsWith('/api/')"));assert.ok(worker.includes("['GET','HEAD'].includes(request.method)"));
console.log('PASS: public PNG signatures/dimensions, anonymous GET/HEAD, correct MIME/length/ETag, no cookies, manifest/icon consistency, one server-rendered Apple icon, Safari share image and HEAD page routing.');
