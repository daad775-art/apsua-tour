// Build 146: the site has a single light theme. The switch, its menu arrow, the dark styles and the
// theme script are gone; legacy saved choices are cleared before the page paints.
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const shell=read('lib/site-shell.ts');
assert.equal(existsSync(new URL('../public/theme.js',import.meta.url)),false,'Theme switching script removed');
assert.ok(!shell.includes('/theme.js'),'Theme script is not loaded');
for(const token of ['themeToggle','themeMenu','theme-sun','theme-control','data-theme-mode','Тёмная','prefers-color-scheme: dark','data-theme=dark'])assert.ok(!shell.includes(token),token+' must not be in the page shell');
assert.ok(shell.includes('<html lang=\\"ru\\" data-theme=\\"light\\">'),'Light theme is fixed in the markup');
assert.ok(shell.indexOf("localStorage.removeItem('apsua-color-mode')")<shell.indexOf('user-theme.css'),'A stored dark choice is cleared before styles load');
assert.ok(shell.includes('id=\\"menuToggle\\"'),'The header slot is used by the mobile menu button');
assert.equal((shell.match(/user-theme\.css/g)||[]).length,1,'The main stylesheet is loaded once');
for(const file of ['public/user-theme.css','public/v134.css','public/apple-theme.css','public/v146.css'])assert.ok(!/data-theme=["']?dark|prefers-color-scheme:\s*dark/.test(read(file)),file+' has no dark rules');
const css=read('public/user-theme.css');for(const selector of ['.price-values>label','.map-side','.theatre-event','.service-card','.tourist-stats>div','.admin-save-bar','.transfer-band>.copy'])assert.ok(css.includes(selector),selector+' keeps its light styles');
assert.ok(css.includes('html body :is(button,.btn,.ibtn,.chip,.circle'),'Shared control styles survive the cleanup');
const app=read('public/user-app.js');
assert.ok(!app.includes('<option value="dark"'),'The appearance editor no longer offers a dark variant');
assert.ok(app.includes("style.textContent=['light'].map(mode=>"),'Saved control appearance is applied to the light theme only');
console.log('PASS: single light theme — no switch, no menu arrow, no dark styles or script; legacy choice cleared before paint; shared light styles intact.');
