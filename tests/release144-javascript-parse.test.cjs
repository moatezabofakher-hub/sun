'use strict';
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
for (const module of ['app', 'field_agent']) {
const base = path.join(__dirname, '..', module, 'src/main/assets/www');
if (!fs.existsSync(base)) continue;
const html = fs.readFileSync(path.join(base, 'index.html'), 'utf8');
let index = 0;
for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  const attributes = match[1];
  if (/\btype\s*=\s*['"](?:application\/ld\+json|application\/json|module)['"]/i.test(attributes)) continue;
  const src = attributes.match(/\bsrc\s*=\s*['"]([^'"]+)['"]/i)?.[1];
  if (src && /^(?:https?:)?\/\//i.test(src)) continue;
  const filename = src ? path.resolve(base, src.split(/[?#]/)[0]) : `index.html:inline-${++index}`;
  const source = src ? fs.readFileSync(filename, 'utf8') : match[2];
  test(`shipped script parses: ${src || filename}`, () => {
    new vm.Script(source, { filename });
  });
}

}
