/* End-to-end check of import routing, the picture finder and PDF footers.
   Run from the repo root: python3 -m http.server 8741 & then node tests/e2e.js (needs Playwright).
   Outside sites (game-icons, Wikimedia, Openverse, jsPDF) are mocked from tests/fixtures. */
const { chromium } = require('playwright');
const fs = require('fs');
const S = require('./fixtures/samples.js');
const BASE = 'http://localhost:8741/';
const W = __dirname + '/fixtures/';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  // the outside world, mocked
  await ctx.route(/cdnjs\.cloudflare\.com|gstatic\.com/, r => r.abort());
  await ctx.route(/cdn\.jsdelivr\.net\/gh\/game-icons/, r => r.fulfill({ status: 200, contentType: 'image/svg+xml', headers: {'access-control-allow-origin': '*'}, body: fs.readFileSync(W + 'icon.svg') }));
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/pdf-lib/, r => r.abort());
  await ctx.route(/commons\.wikimedia\.org\/w\/api\.php/, r => r.fulfill({ status: 200, contentType: 'application/json', headers: {'access-control-allow-origin': '*'}, body: JSON.stringify({ query: { pages: {
    '1': { title: 'File:Goblin engraving.jpg', index: 1, imageinfo: [{ mime: 'image/png', thumburl: 'https://upload.wikimedia.org/x/pic.png', url: 'https://upload.wikimedia.org/x/pic.png', descriptionurl: 'https://commons.wikimedia.org/wiki/File:x', extmetadata: { License: { value: 'pd' }, LicenseShortName: { value: 'Public domain' }, Artist: { value: '<a href="#">Gustave Doré</a>' } } }] },
    '2': { title: 'File:Nope.jpg', index: 2, imageinfo: [{ mime: 'image/jpeg', thumburl: 'https://upload.wikimedia.org/x/no.jpg', extmetadata: { License: { value: 'cc-by-sa-4.0' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] } } } }) }));
  await ctx.route(/upload\.wikimedia\.org/, r => r.fulfill({ status: 200, contentType: 'image/png', headers: {'access-control-allow-origin': '*'}, body: fs.readFileSync(W + 'pic.png') }));
  await ctx.route(/api\.openverse\.org\/v1\/images\/\?/, r => r.fulfill({ status: 200, contentType: 'application/json', headers: {'access-control-allow-origin': '*'}, body: JSON.stringify({ results: [{ id: 'a', title: 'Old potion', creator: 'Jane', license: 'by', license_version: '4.0', thumbnail: 'https://api.openverse.org/v1/images/a/thumb/', url: 'https://x.example/a.jpg', foreign_landing_url: 'https://x.example' }] }) }));
  await ctx.route(/api\.openverse\.org\/v1\/images\/a\/thumb/, r => r.fulfill({ status: 200, contentType: 'image/png', headers: {'access-control-allow-origin': '*'}, body: fs.readFileSync(W + 'pic.png') }));
  await ctx.route(/apiv4\.demiplane\.com/, r => r.abort());
  await ctx.route(/\/_test\/jspdf-mock\.js/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(W + 'jspdf-mock.js') }));

  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(page.url() + ' :: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::|Failed to load resource/.test(m.text())) errors.push(page.url() + ' :: console ' + m.text()); });

  // 1. every page loads clean
  for (const p of ['index.html', 'item-cards.html', 'feat-cards.html', 'spell-cards.html', 'initiative-cards.html', 'hazard-cards.html', 'session-prep.html', 'licenses.html']) {
    await page.goto(BASE + p); await page.waitForTimeout(600);
  }
  ok(errors.length === 0, 'pages load without script errors ' + (errors.length ? JSON.stringify(errors) : ''));

  // 2. home page Paste anything → spell tool
  await page.goto(BASE + 'index.html');
  await page.fill('#anyText', S.spell);
  await Promise.all([page.waitForNavigation(), page.click('#anyGo')]);
  await page.waitForTimeout(800);
  ok(/spell-cards\.html$/.test(page.url()), 'spell paste routed to Spell Cards (' + page.url() + ')');
  ok((await page.textContent('[data-f="name"]')).trim() === 'Fireball', 'spell name filled');
  ok((await page.textContent('[data-f="src"]')).trim() === 'Player Core p. 330', 'spell source line filled: ' + (await page.textContent('[data-f="src"]')));
  await page.screenshot({ path: __dirname + '/out/shot-spell.png' });

  // 3. home page: each type goes to its tool
  for (const [k, re] of [['item', /item-cards/], ['creature', /initiative-cards/], ['hazard', /hazard-cards/], ['feat', /feat-cards/]]) {
    await page.goto(BASE + 'index.html'); await page.fill('#anyText', S[k]);
    await Promise.all([page.waitForNavigation(), page.click('#anyGo')]); await page.waitForTimeout(900);
    ok(re.test(page.url()), k + ' routed to ' + page.url());
    const nm = await page.evaluate(() => { const e = document.querySelector('[data-f="name"]'); return e ? e.innerText.trim() : ''; });
    ok(nm.length > 2, k + ' name filled: ' + nm);
    await page.screenshot({ path: __dirname + '/out/shot-' + k + '.png' });
    if (k === 'hazard') { const h = await page.evaluate(() => ({ imm: (document.querySelector('[data-f="immune"]') || {}).innerText, kicker: (document.querySelector('[data-f="kicker"]') || {}).innerText })); console.log('   hazard →', JSON.stringify(h)); ok(!/Pitfall/.test(h.imm || ''), 'hazard immunities stop at their line'); }
  }
  // item details
  await page.goto(BASE + 'index.html'); await page.fill('#anyText', S.item);
  await Promise.all([page.waitForNavigation(), page.click('#anyGo')]); await page.waitForTimeout(900);
  const item = await page.evaluate(() => ({ v: document.querySelector('[data-f="value"]').textContent, cat: document.getElementById('cat').value, note: document.querySelector('[data-f="note"]').innerText,
    desc: document.querySelector('[data-f="description"]').innerText, acts: document.querySelectorAll('.sec.active[data-type="a1"]').length, traits: document.getElementById('traitLine').textContent }));
  console.log('   item →', JSON.stringify(item));
  ok(item.v === '4 gp' && item.cat === 'Consumables' && item.acts === 1 && /healing potion is a vial/i.test(item.desc), 'item fields mapped');

  // 4. wrong tool: a spell pasted into Feat Cards offers to move it
  await page.goto(BASE + 'feat-cards.html'); await page.waitForTimeout(500);
  await page.click('#importBtn'); await page.fill('#importText', S.spell); await page.click('#importGo');
  const note = await page.textContent('#importNote');
  ok(/looks like a spell/.test(note) && /Spell Cards/.test(note), 'feat tool offers spell to Spell Cards: ' + note);
  await Promise.all([page.waitForNavigation(), page.click('#importNote button')]); await page.waitForTimeout(800);
  ok(/spell-cards/.test(page.url()) && (await page.textContent('[data-f="name"]')).trim() === 'Fireball', 'button carried the paste to Spell Cards');

  // 5. feat: area / save pickers + source line
  await page.goto(BASE + 'feat-cards.html'); await page.waitForTimeout(500);
  await page.click('#importBtn');
  await page.fill('#importText', 'Dragon Roar [two-actions] Feat 4\nAuditory Fighter\nSource Player Core pg. 140\nYou breathe fire in a 15-foot cone. Each creature in the area takes 4d6 fire damage with a basic Reflex save.');
  await page.click('#importGo'); await page.waitForTimeout(500);
  let f = await page.evaluate(() => ({ area: document.querySelector('[data-f="area"]').innerText, def: document.querySelector('[data-f="defense"]').innerText, src: document.querySelector('[data-f="src"]').innerText,
    size: document.getElementById('aoeSize').value, type: document.getElementById('aoeType').value, save: document.getElementById('aoeSave').value, basic: document.getElementById('aoeBasic').checked }));
  console.log('   feat →', JSON.stringify(f));
  ok(f.area === '15-foot cone' && f.def === 'basic Reflex' && f.size === '15' && f.type === 'cone' && f.save === 'Reflex' && f.basic && f.src === 'Player Core p. 140', 'feat area/save guessed and pickers synced');
  await page.selectOption('#aoeType', 'emanation'); await page.fill('#aoeSize', '30'); await page.selectOption('#aoeSave', 'Will'); await page.uncheck('#aoeBasic');
  f = await page.evaluate(() => ({ area: document.querySelector('[data-f="area"]').innerText, def: document.querySelector('[data-f="defense"]').innerText }));
  ok(f.area === '30-foot emanation' && f.def === 'Will', 'pickers write the lines: ' + JSON.stringify(f));
  await page.screenshot({ path: __dirname + '/out/shot-feat.png' });

  // 6. picture finder on the feat: icons (default for feats)
  ok(await page.isVisible('#findPic'), 'Picture button in the toolbar');
  await page.click('#findPic'); await page.waitForSelector('.tb-pic .grid button[data-i]', { timeout: 5000 });
  const nIcons = await page.locator('.tb-pic .grid button[data-i]').count();
  const firstTitle = await page.getAttribute('.tb-pic .grid button[data-i="0"]', 'title');
  console.log('   icons →', nIcons, firstTitle);
  ok(nIcons > 3 && /CC BY 3\.0|CC0/.test(firstTitle), 'icon results with credit');
  await page.screenshot({ path: __dirname + '/out/shot-finder-icons.png' });
  await page.click('.tb-pic .grid button[data-i="0"]'); await page.waitForTimeout(1200);
  let meta = await page.textContent('#phMeta');
  ok(/Credit: Icon by .*game-icons\.net/.test(meta), 'icon placed with credit: ' + meta);
  // switch this card to classic art (per-card override), default stays icons
  await page.click('#findPic'); await page.waitForTimeout(400);
  ok(await page.getAttribute('.tb-pic .srcs button[data-src="icons"]', 'aria-pressed') === 'true', 'finder opens on this card\'s own source');
  await page.click('.tb-pic .srcs button[data-src="paintings"]'); await page.waitForSelector('.tb-pic .grid button[data-i]');
  const nP = await page.locator('.tb-pic .grid button[data-i]').count();
  ok(nP === 1, 'share-alike picture filtered out (' + nP + ' left)');
  await page.click('.tb-pic .grid button[data-i="0"]'); await page.waitForTimeout(1200);
  meta = await page.textContent('#phMeta');
  ok(/Gustave Doré, via Wikimedia Commons, public domain/.test(meta), 'painting placed with credit: ' + meta);
  await page.click('#findPic'); await page.waitForTimeout(300);
  ok(await page.getAttribute('.tb-pic .srcs button[data-src="paintings"]', 'aria-pressed') === 'true', 'this card now reopens on paintings');
  ok(await page.inputValue('.tb-pic footer select') === 'icons', 'feat default still icons');
  await page.click('.tb-pic .srcs button[data-src="openverse"]'); await page.waitForSelector('.tb-pic .grid button[data-i]');
  await page.click('.tb-pic .grid button[data-i="0"]'); await page.waitForTimeout(1200);
  meta = await page.textContent('#phMeta');
  ok(/Old potion.*Jane, CC BY 4\.0, via Openverse/.test(meta), 'openverse placed with credit: ' + meta);

  // 7. save it and print through the export hook with a stand-in jsPDF
  await page.click('#saveCard'); await page.click('#previewSave'); await page.waitForTimeout(800);
  const ids = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('toolbag', 1); r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').get('pf2e-feat-lib'); q.onsuccess = () => res((q.result || []).map(c => c.id)); }; }));
  ok(ids.length >= 1, 'feat saved (' + ids.length + ')');
  await page.evaluate(() => { TB.JSPDF = { url: '/_test/jspdf-mock.js', sri: '' }; });
  await page.evaluate(ids => window.TBExport.pdf(ids), ids);
  const pdf = await page.evaluate(() => window.__pdf.calls.filter(c => c.op === 'text').map(c => c.t));
  ok(pdf.some(t => /^Player Core p\. 140$/.test(t)), 'PDF has the source line');
  ok(pdf.some(t => /AREA|Area/.test(t)) && pdf.some(t => /30-foot emanation/.test(t)), 'PDF has the Area line');
  ok(pdf.some(t => /Pictures: .*Jane/.test(t)), 'PDF footer credits the picture');
  ok(pdf.join(' ').includes('TX 9-307-067'), 'PDF carries the ORC notice');

  // 8. initiative card + finder button next to Choose
  await page.goto(BASE + 'initiative-cards.html'); await page.waitForTimeout(600);
  ok(await page.isVisible('#phPick + button'), 'initiative has Find picture next to Choose');
  await page.click('#importBtn'); await page.fill('#importText', S.item); await page.click('#importGo');
  ok(/looks like an item/.test(await page.textContent('#importNote')), 'initiative offers an item to Item Cards');

  ok(errors.length === 0, 'no script errors during the run ' + (errors.length ? JSON.stringify(errors) : ''));
  await browser.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
