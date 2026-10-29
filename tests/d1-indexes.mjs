import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
// Applies every migration in order to a database that already holds data (like the live D1) and checks the hot queries use the new indexes.
const db=new DatabaseSync(':memory:');
const files=readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>/^\d{4}_.*\.sql$/.test(f)).sort();
db.exec(readFileSync(new URL('../drizzle/'+files[0],import.meta.url),'utf8'));
const ins=db.prepare('INSERT INTO records VALUES (?,?,?,?,?,?,?)');for(let i=0;i<3000;i++){const k=['bookings','transfers','profile','member','upload','diary'][i%6];ins.run(k+':'+i,k,'u'+(i%300),'{"date":"2026-11-02"}',['pending','paid','published'][i%3],i,i)}
for(const f of files.slice(1))db.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8').replaceAll('--> statement-breakpoint',''));
for(const f of files.slice(1))db.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8').replaceAll('--> statement-breakpoint',''));// re-running is harmless (IF NOT EXISTS)
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM records').get().n,3000,'existing rows are untouched');
const plan=(sql,...a)=>db.prepare('EXPLAIN QUERY PLAN '+sql).all(...a).map(r=>r.detail).join(' | ');
for(const [sql,args,index] of [
 ["SELECT * FROM records WHERE kind='profile' AND owner=?",['u1'],'records_kind_owner_created_idx'],
 ["SELECT COUNT(*) AS n FROM records WHERE kind=? AND owner=? AND created>?",['upload','u1',0],'records_kind_owner_created_idx'],
 ["SELECT id,kind,body,status,updated FROM records WHERE owner=? AND kind IN ('bookings','transfers') ORDER BY created DESC LIMIT 1000",['u1'],'records_owner_created_idx'],
 ["SELECT MIN(created) AS created FROM records WHERE owner=?",['u1'],'records_owner_created_idx'],
 ["SELECT id FROM records WHERE kind IN ('bookings','transfers') AND status IN ('confirmed','awaiting_payment','paid') AND json_extract(body,'$.date') BETWEEN ? AND ?",['2026-11-01','2026-11-03'],'records_kind_status_created_idx'],
])assert.ok(plan(sql,...args).includes(index),`${sql} → ${plan(sql,...args)}`);
console.log('PASS: index migration applies to a populated database, is safe to repeat, keeps rows and serves the hot request/profile/reminder queries.');
