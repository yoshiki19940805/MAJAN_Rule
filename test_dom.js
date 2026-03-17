const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const html = fs.readFileSync('index.html', 'utf8');

// VERY basic evaluation to find the category definition and how they map
// I will just extract the rendering logic of array slices.

const content = html.substring(html.indexOf('function renderEdit()'), html.indexOf('function onNameChange(val)'));

console.log((content.match(/renderKeys = renderKeys\.filter\(k => /g) || []).length, "filter matches");

const idx = content.indexOf("if (catNameLong.includes('上がり放棄') || catNameLong.includes('軽罰符'))");
if (idx > -1) {
  console.log("Filter Logic:\n" + content.substring(idx, idx + 150));
}

