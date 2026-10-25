// One-time recolouring of the site's stylesheets into an Apple-style palette (version 13.8).
// Every colour literal keeps its lightness and transparency; only hue and saturation change:
//   near-neutral, very light and dark text colours -> Apple's cool neutral greys (#f5f5f7 … #1d1d1f)
//   blues and teals -> Apple blue (hue 211, #0071e3 family)
//   greens / oranges / yellows / reds -> the iOS system green / orange / yellow / red hues
// Usage: node scripts/apple-palette.mjs [--check] <file> [...]
// --check prints a sample of the mapping without writing.
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2), check = args[0] === '--check', files = check ? args.slice(1) : args;

function toHsl(r, g, b) {
  const R = r / 255, G = g / 255, B = b / 255, mx = Math.max(R, G, B), mn = Math.min(R, G, B), l = (mx + mn) / 2, d = mx - mn;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  let h = 0;
  if (d) h = mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
function toRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map(v => Math.round((v + m) * 255));
}
export function appleColour(r, g, b) {
  const [h, s, l] = toHsl(r, g, b);
  if (l > 0.85 && s < 0.65) return toRgb(240, 0.1, l); // pale tints and dark-theme text stay neutral
  if (s < 0.3 || (l < 0.45 && s < 0.45) || l > 0.94 || l < 0.26) return toRgb(240, l > 0.7 ? 0.1 : 0.03, l); // greys and text
  if (h < 15 || h >= 340) return toRgb(3, 1, Math.min(l, 0.6));        // system red
  if (h < 50) return toRgb(35, 1, l);                                  // system orange
  if (h < 70) return toRgb(48, 1, l);                                  // system yellow
  if (h < 165) return toRgb(135, Math.min(1, Math.max(s, 0.55)), l);   // system green
  if (h < 250) return toRgb(211, l > 0.85 ? 0.75 : 1, l);              // Apple blue
  return [r, g, b];                                                    // purples stay as they are
}

const hex2 = v => v.toString(16).padStart(2, '0');
// A hex colour only in a value position (after : space , or ( and before ; } ) , space ! or a quote).
const HEX = /(?<=[:\s,(])#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?=[;}),\s!"'\\])/g;
const RGB = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(,\s*[\d.]+%?\s*)?\)/g;

function recolour(text, samples) {
  text = text.replace(HEX, (all, h) => {
    const full = h.length <= 4 ? [...h].map(c => c + c).join('') : h;
    const [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)), alpha = full.length === 8 ? full.slice(6) : '';
    const out = '#' + appleColour(r, g, b).map(hex2).join('') + alpha;
    if (samples.size < 40 && out !== all.toLowerCase()) samples.set(all, out);
    return out;
  });
  return text.replace(RGB, (all, r, g, b, a) => {
    const [R, G, B] = appleColour(+r, +g, +b);
    const out = a ? `rgba(${R},${G},${B}${a.replace(/\s/g, '')})` : `rgb(${R},${G},${B})`;
    if (samples.size < 40 && out !== all) samples.set(all, out);
    return out;
  });
}

for (const file of files) {
  const samples = new Map(), before = readFileSync(file, 'utf8'), after = recolour(before, samples);
  if (check) { console.log(file); for (const [a, b] of samples) console.log('  ' + a.padEnd(26) + ' -> ' + b); }
  else { writeFileSync(file, after); console.log(`${file}: recoloured`); }
}
