'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🔄 Mises à jour :   node tests/test-mises-a-jour.js
 *  1. electron/updates.js sans réseau : comparaison de versions, choix du bon installateur (Mac arm64/x64, Windows,
 *     Linux AppImage/deb, ARM), lecture de SHA256SUMS.txt, « ne plus prévenir », « plus tard », réglage « Jamais » ;
 *  2. un faux GitHub (http://127.0.0.1) : dernière version, résultat gardé un jour (pas de 2e requête), « Rechercher »
 *     force, téléchargement avec progression et empreinte vérifiée, fichier abîmé effacé, adresse d'un autre site
 *     refusée, version sans SHA256SUMS.txt refusée, GitHub qui répond 403 ou 404, rien d'autre que la requête envoyée ;
 *  3. branchements : package.json embarque updates.js, preload expose seulement des commandes, main.js et le menu ;
 *  4. navigateur (Playwright, sinon sauté) : message au démarrage avec ses 4 boutons, « Ne plus me prévenir »,
 *     rien en mode consultation, page Réglages → 🔄 Mises à jour (K2 Automatiquement / Jamais, Télécharger → Ouvrir),
 *     dans un navigateur sans l'app de bureau : un lien vers les versions, aucune recherche.
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const U = require('../electron/updates');

const appRoot = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-maj-'));
let failed = 0;
const ok = (name, fn) => { try { fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.error('  ✗ ' + name + '\n    ' + (e && e.message)); } };
const okA = async (name, fn) => { try { await fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.error('  ✗ ' + name + '\n    ' + (e && e.stack || e)); } };

console.log('1. Calculs (sans réseau)');
ok('comparaison de versions', () => {
  assert.equal(U.compareVersions('0.9.2', '0.9.1'), 1);
  assert.equal(U.compareVersions('v0.9.1', '0.9.1'), 0);
  assert.equal(U.compareVersions('0.10.0', '0.9.9'), 1);
  assert.equal(U.compareVersions('1.0.0', '0.99.99'), 1);
  assert.equal(U.compareVersions('0.9.1', '0.9.10'), -1);
  assert.equal(U.compareVersions('0.9.2-beta.1', '0.9.2'), -1);
  assert.equal(U.compareVersions('0.9.2-beta.2', '0.9.2-beta.10'), -1);
  assert.equal(U.compareVersions('0.9.2', '0.9.2-rc.1'), 1);
  assert.equal(U.compareVersions('1', '1.0.0'), 0);
  assert.equal(U.compareVersions('pas une version', '0.9.1'), 0);
  assert.equal(U.parseVersion('v0.9.2; rm -rf'), null);
});
const NAMES = ['LCNDA-0.9.2-mac-arm64.dmg', 'LCNDA-0.9.2-mac-x64.dmg', 'LCNDA-0.9.2-windows-x64.exe', 'LCNDA-0.9.2-linux-x86_64.AppImage', 'LCNDA-0.9.2-linux-arm64.AppImage', 'LCNDA-0.9.2-linux-amd64.deb', 'LCNDA-0.9.2-linux-arm64.deb', 'SHA256SUMS.txt'];
const assets = NAMES.map((name) => ({ name, size: 10, url: U.DOWNLOAD_PREFIX + 'v0.9.2/' + name }));
ok('le bon installateur pour chaque ordinateur', () => {
  const pick = (platform, arch, format) => (U.pickAsset(assets, { platform, arch, format }) || {}).name;
  assert.equal(pick('darwin', 'arm64'), 'LCNDA-0.9.2-mac-arm64.dmg');
  assert.equal(pick('darwin', 'x64'), 'LCNDA-0.9.2-mac-x64.dmg');
  assert.equal(pick('win32', 'x64'), 'LCNDA-0.9.2-windows-x64.exe');
  assert.equal(pick('win32', 'arm64'), 'LCNDA-0.9.2-windows-x64.exe', 'Windows ARM : le x64 (émulé)');
  assert.equal(pick('linux', 'x64', 'AppImage'), 'LCNDA-0.9.2-linux-x86_64.AppImage');
  assert.equal(pick('linux', 'arm64', 'AppImage'), 'LCNDA-0.9.2-linux-arm64.AppImage');
  assert.equal(pick('linux', 'x64', 'deb'), 'LCNDA-0.9.2-linux-amd64.deb');
  assert.equal(pick('linux', 'arm64', 'deb'), 'LCNDA-0.9.2-linux-arm64.deb');
  assert.equal(pick('freebsd', 'x64'), undefined);
  assert.equal(U.pickAsset(assets.filter((a) => !/mac-arm64/.test(a.name)), { platform: 'darwin', arch: 'arm64' }), null, 'pas de x64 donné à un Mac arm64');
  assert.equal(U.currentFormat('linux', { APPIMAGE: '/x/LCNDA.AppImage' }), 'AppImage');
  assert.equal(U.currentFormat('linux', {}), 'deb');
  assert.equal(U.currentFormat('darwin', {}), 'dmg');
  assert.equal(U.currentFormat('win32', {}), 'exe');
});
ok('lecture de SHA256SUMS.txt', () => {
  const h = 'ab'.repeat(32);
  const m = U.parseSums(`${h}  LCNDA-0.9.2-mac-arm64.dmg\n${'CD'.repeat(32)} *LCNDA-0.9.2-windows-x64.exe\r\nn'importe quoi\n`);
  assert.equal(m.get('LCNDA-0.9.2-mac-arm64.dmg'), h);
  assert.equal(m.get('LCNDA-0.9.2-windows-x64.exe'), 'cd'.repeat(32));
  assert.equal(m.size, 2);
});
ok('« ne plus prévenir », « plus tard », « jamais »', () => {
  const info = { ok: true, newer: true, latest: '0.9.2' };
  const now = 1e12;
  assert.equal(U.shouldNotify(info, {}, now), true);
  assert.equal(U.shouldNotify(info, { skip: '0.9.2' }, now), false, 'cette version : plus de message');
  assert.equal(U.shouldNotify({ ...info, latest: '0.9.3' }, { skip: '0.9.2' }, now), true, 'la suivante : de nouveau');
  assert.equal(U.shouldNotify(info, { laterUntil: now + 1000 }, now), false);
  assert.equal(U.shouldNotify(info, { laterUntil: now - 1 }, now), true);
  assert.equal(U.shouldNotify(info, { auto: false }, now), false);
  assert.equal(U.shouldNotify({ ...info, newer: false }, {}, now), false);
  assert.equal(U.shouldNotify({ ok: false }, {}, now), false);
});
ok('réponse forgée : adresses d’un autre site retirées', () => {
  const r = U.slimRelease({ tag_name: 'v0.9.2', html_url: 'https://evil.example/x', assets: [
    { name: 'LCNDA-0.9.2-mac-arm64.dmg', size: 1, browser_download_url: 'https://evil.example/LCNDA-0.9.2-mac-arm64.dmg' },
    { name: 'LCNDA-0.9.2-mac-x64.dmg', size: 1, browser_download_url: U.DOWNLOAD_PREFIX + 'v0.9.2/../../../evil' },
    { name: '../x.dmg', size: 1, browser_download_url: U.DOWNLOAD_PREFIX + 'v0.9.2/x.dmg' },
    { name: 'LCNDA-0.9.2-windows-x64.exe', size: 1, browser_download_url: U.DOWNLOAD_PREFIX + 'v0.9.2/LCNDA-0.9.2-windows-x64.exe' }] });
  assert.deepEqual(r.assets.map((a) => a.name), ['LCNDA-0.9.2-windows-x64.exe']);
  assert.equal(r.page, U.PAGE_PREFIX + 'latest');
  assert.equal(U.slimRelease({ tag_name: 'v0.9.2', draft: true, assets: [] }), null);
  assert.equal(U.slimRelease({ tag_name: '<script>', assets: [] }), null);
});

console.log('2. Faux GitHub (sans réseau)');
const installer = crypto.randomBytes(300 * 1024);
const goodSum = crypto.createHash('sha256').update(installer).digest('hex');
const srv = { hits: [], mode: 'ok', headers: [] };
const server = http.createServer((req, res) => {
  srv.hits.push(req.url); srv.headers.push({ ...req.headers });
  const base = `http://127.0.0.1:${server.address().port}`;
  if (req.url === '/repos/victorbaissait/lcnda/releases/latest') {
    if (srv.mode === '403') { res.writeHead(403); return res.end('{}'); }
    if (srv.mode === '404') { res.writeHead(404); return res.end('{}'); }
    const names = srv.mode === 'nosums' ? NAMES.filter((n) => n !== 'SHA256SUMS.txt') : NAMES;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ tag_name: 'v0.9.2', html_url: base + '/page/tag/v0.9.2', published_at: '2026-11-01T10:00:00Z', body: '## Nouveautés',
      assets: names.map((name) => ({ name, size: name.endsWith('.txt') ? 100 : installer.length, browser_download_url: `${base}/download/v0.9.2/${name}` })) }));
  }
  if (req.url === '/download/v0.9.2/SHA256SUMS.txt') {
    res.writeHead(200);
    const sum = srv.mode === 'badsum' ? '0'.repeat(64) : goodSum;
    return res.end(NAMES.filter((n) => n !== 'SHA256SUMS.txt').map((n) => `${n === 'LCNDA-0.9.2-mac-arm64.dmg' ? sum : 'f'.repeat(64)}  ${n}`).join('\n') + '\n');
  }
  if (req.url === '/download/v0.9.2/LCNDA-0.9.2-mac-arm64.dmg') {
    // comme GitHub : une redirection vers le vrai stockage
    res.writeHead(302, { Location: '/storage/mac-arm64' }); return res.end();
  }
  if (req.url === '/storage/mac-arm64') {
    res.writeHead(200, { 'Content-Length': installer.length });
    let i = 0; const step = () => { if (i >= installer.length) return res.end(); res.write(installer.subarray(i, i + 65536)); i += 65536; setTimeout(step, 5); }; return step();
  }
  res.writeHead(404); res.end();
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const urls = { apiUrl: base + '/repos/victorbaissait/lcnda/releases/latest', downloadPrefix: base + '/download/', pagePrefix: base + '/page/' };
  const sys = { platform: 'darwin', arch: 'arm64', format: 'dmg' };
  let prefs = {};
  await okA('dernière version trouvée, bon fichier, rien d’autre envoyé', async () => {
    const r = await U.check({ current: '0.9.1', prefs, sys, now: 1e12, ...urls });
    assert.equal(r.info.ok, true); assert.equal(r.info.newer, true); assert.equal(r.info.latest, '0.9.2');
    assert.equal(r.info.asset.name, 'LCNDA-0.9.2-mac-arm64.dmg'); assert.equal(r.info.hasSums, true);
    assert.equal(r.info.page, base + '/page/tag/v0.9.2');
    assert.equal(r.fromCache, false); assert.equal(srv.hits.length, 1);
    const h = srv.headers[0];
    assert.ok(!h.cookie && !h.authorization, 'ni cookie ni clé');
    assert.ok(!/0\.9\.1|lcnda|genealog/i.test(JSON.stringify(h)), 'la version et la base ne sont pas envoyées : ' + JSON.stringify(h));
    prefs = r.prefs;
  });
  await okA('au plus une fois par jour ; « Rechercher » regarde tout de suite', async () => {
    const r = await U.check({ current: '0.9.1', prefs, sys, now: 1e12 + 3600e3, ...urls });
    assert.equal(r.fromCache, true); assert.equal(srv.hits.length, 1, 'pas de 2e requête dans la journée');
    const r2 = await U.check({ current: '0.9.1', prefs, sys, now: 1e12 + 25 * 3600e3, ...urls });
    assert.equal(r2.fromCache, false); assert.equal(srv.hits.length, 2, 'le lendemain : de nouveau');
    const r3 = await U.check({ current: '0.9.1', prefs: r2.prefs, sys, now: 1e12 + 25 * 3600e3 + 5, force: true, ...urls });
    assert.equal(r3.fromCache, false); assert.equal(srv.hits.length, 3);
    const r4 = await U.check({ current: '0.9.2', prefs: r3.prefs, sys, now: 1e12 + 25 * 3600e3 + 9, ...urls });
    assert.equal(r4.info.newer, false, 'déjà à jour');
    prefs = r3.prefs;
  });
  await okA('téléchargement avec progression, empreinte vérifiée', async () => {
    const dir = path.join(tmp, 'dl'); fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'LCNDA-0.9.2-mac-arm64.dmg'), 'ancien');
    const steps = [];
    const r = await U.download({ release: prefs.release, sys, dir, downloadPrefix: urls.downloadPrefix, onProgress: (a, b) => steps.push([a, b]) });
    assert.equal(r.ok, true, r.error);
    assert.equal(r.name, 'LCNDA-0.9.2-mac-arm64 (1).dmg', 'le fichier déjà là n’est pas écrasé');
    assert.equal(r.sha256, goodSum);
    assert.ok(fs.readFileSync(r.file).equals(installer));
    assert.ok(steps.length >= 2 && steps.at(-1)[0] === installer.length && steps.at(-1)[1] === installer.length, 'progression jusqu’au bout');
    assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.part')), []);
  });
  await okA('fichier abîmé : effacé, message clair', async () => {
    srv.mode = 'badsum';
    const dir = path.join(tmp, 'dl2');
    const r = await U.download({ release: prefs.release, sys, dir, downloadPrefix: urls.downloadPrefix });
    assert.equal(r.ok, false); assert.match(r.error, /abîmé/);
    assert.deepEqual(fs.readdirSync(dir), [], 'rien ne reste dans Téléchargements');
    srv.mode = 'ok';
  });
  await okA('pas d’installateur pour cet ordinateur, pas d’empreintes, adresse d’ailleurs : refusé', async () => {
    const r1 = await U.download({ release: prefs.release, sys: { platform: 'sunos', arch: 'x64' }, dir: tmp, downloadPrefix: urls.downloadPrefix });
    assert.equal(r1.ok, false); assert.match(r1.error, /Pas d’installateur/);
    const noSums = { ...prefs.release, assets: prefs.release.assets.filter((a) => a.name !== 'SHA256SUMS.txt') };
    const r2 = await U.download({ release: noSums, sys, dir: tmp, downloadPrefix: urls.downloadPrefix });
    assert.equal(r2.ok, false); assert.match(r2.error, /empreintes/);
    const before = srv.hits.length;
    const r3 = await U.download({ release: prefs.release, sys, dir: tmp }); // préfixe du vrai GitHub : l'adresse locale est refusée
    assert.equal(r3.ok, false); assert.match(r3.error, /inattendue/); assert.equal(srv.hits.length, before, 'aucune requête');
    srv.mode = 'nosums';
    const r4 = await U.check({ current: '0.9.1', prefs: {}, sys, force: true, ...urls });
    assert.equal(r4.info.hasSums, false);
    srv.mode = 'ok';
  });
  await okA('GitHub qui refuse ou rien de publié : phrase simple, rien de gardé', async () => {
    srv.mode = '403';
    const r = await U.check({ current: '0.9.1', prefs: {}, sys, force: true, ...urls });
    assert.equal(r.info.ok, false); assert.match(r.info.error, /attendre/); assert.equal(r.prefs.release, null);
    srv.mode = '404';
    const r2 = await U.check({ current: '0.9.1', prefs: {}, sys, force: true, ...urls });
    assert.match(r2.info.error, /Aucune version/);
    srv.mode = 'ok';
    const r3 = await U.check({ current: '0.9.1', prefs: {}, sys, force: true, apiUrl: 'http://127.0.0.1:1/x' });
    assert.equal(r3.info.ok, false); assert.match(r3.info.error, /connexion/);
  });

  console.log('3. Branchements');
  ok('package.json, preload, main.js et menu', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
    assert.ok(pkg.build.files.includes('electron/updates.js'), 'updates.js embarqué dans l’app');
    const pre = fs.readFileSync(path.join(appRoot, 'electron/preload.js'), 'utf8');
    assert.match(pre, /updates: \{/); assert.doesNotMatch(pre.slice(pre.indexOf('updates: {')), /url|path/i, 'la page ne donne ni adresse ni chemin');
    const main = fs.readFileSync(path.join(appRoot, 'electron/main.js'), 'utf8');
    assert.match(main, /ipcMain\.handle\('lcnda:updates'/);
    assert.match(main, /if \(!fromApp\(event\)\) return \{ ok: false, error: 'Refusé' \};\n  const a = arg/);
    assert.match(main, /Rechercher une mise à jour…/); assert.match(main, /Signaler un problème…/);
    assert.match(main, /!app\.isPackaged && process\.env\.LCNDA_UPDATE_API/, 'adresse d’essai : jamais dans l’app installée');
    assert.match(main, /app\.getPath\('downloads'\)/);
    const wf = fs.readFileSync(path.join(appRoot, '.github/workflows/build.yml'), 'utf8');
    assert.match(wf, /SHA256SUMS\.txt/);
    assert.equal(pkg.build.mac.artifactName, 'LCNDA-${version}-mac-${arch}.${ext}');
    assert.equal(pkg.build.win.artifactName, 'LCNDA-${version}-windows-${arch}.${ext}');
    assert.equal(pkg.build.linux.artifactName, 'LCNDA-${version}-linux-${arch}.${ext}');
  });

  console.log('4. Navigateur');
  let pw = null;
  for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) { /* suivant */ } }
  if (!pw) { console.log('  – sauté (Playwright absent)'); }
  else await browserPart(pw);
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  if (failed) { console.error(`\n✗ ${failed} test(s) en échec`); process.exit(1); }
  console.log('\n✓ Mises à jour : tout va bien');
})().catch((e) => { console.error(e); process.exit(1); });

/* ─────────── navigateur : faux pont de l'app de bureau (window.lcnda.updates) ─────────── */
function mockBridge() {
  const listeners = [];
  const prefs = { auto: true, skip: '', laterUntil: 0, lastCheck: 0 }; let prog = null;
  window.__calls = [];
  const info = { ok: true, current: '0.9.1', latest: '0.9.2', tag: 'v0.9.2', newer: true, asset: { name: 'LCNDA-0.9.2-mac-arm64.dmg', size: 312e6 }, hasSums: true };
  window.lcnda = { onCommand: (cb) => listeners.push(cb), __send: (c) => listeners.forEach((f) => f(c)),
    updates: {
      info: async () => ({ ok: true, version: '0.9.1', platform: 'darwin', arch: 'arm64', format: 'dmg', prefs: { ...prefs } }),
      check: async (force) => { window.__calls.push(['check', force]); prefs.lastCheck = Date.now(); return { ...info, notify: prefs.auto && prefs.skip !== '0.9.2' && !(prefs.laterUntil > Date.now()), prefs: { ...prefs } }; },
      setPrefs: async (p) => { window.__calls.push(['prefs', p]); if (typeof p.auto === 'boolean') prefs.auto = p.auto; if (typeof p.skip === 'string') prefs.skip = p.skip; if (p.later === true) prefs.laterUntil = Date.now() + 864e5; if (p.later === false) prefs.laterUntil = 0; return { ok: true, prefs: { ...prefs } }; },
      download: async () => { for (let i = 1; i <= 3; i++) { await new Promise((r) => setTimeout(r, 60)); if (prog) prog({ received: i * 104e6, total: 312e6 }); } window.__calls.push(['download']); return { ok: true, name: 'LCNDA-0.9.2-mac-arm64.dmg', size: 312e6, sha256: 'a'.repeat(64) }; },
      cancel: async () => ({ ok: true }), open: async () => { window.__calls.push(['open']); return { ok: true }; }, show: async () => ({ ok: true }), page: async () => { window.__calls.push(['page']); return { ok: true }; },
      onProgress: (cb) => { prog = cb; },
    } };
}
async function browserPart(pw) {
  const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
  const phpPath = findPhp([devBundledPhp()]);
  const dir = path.join(tmp, 'data'); fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
  const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
  const mk = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Joseph','Martin','male')"); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
  assert.match(mk.stdout, /ok$/, mk.stderr);
  const port = await new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
  const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise((r) => setTimeout(r, 100)); } }
  const browser = await pw.chromium.launch();
  try {
    const errors = [];
    const newPage = async (bridge, opts = {}) => {
      const ctx = await browser.newContext({ viewport: { width: opts.w || 1440, height: 900 } });
      await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errors.push(e.message));
      if (bridge) await p.addInitScript(mockBridge);
      if (opts.before) await p.addInitScript(opts.before);
      await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.api && window.LCNDA_EXT?.updates && window.LCNDA_EXT?.reportProblem);
      return p;
    };
    await okA('au démarrage : un message avec ses 4 boutons, une seule fois', async () => {
      const p = await newPage(true);
      await p.evaluate(() => window.LCNDA_EXT.updates.startupCheck());
      await p.waitForSelector('.toast.mj-toast');
      const btns = await p.$$eval('.toast.mj-toast .ui-toast-btn', (b) => b.map((x) => x.textContent));
      assert.deepEqual(btns, ['⤓ Télécharger', 'Voir les nouveautés', 'Plus tard', 'Ne plus me prévenir pour cette version']);
      assert.match(await p.textContent('.toast.mj-toast'), /nouvelle version 0\.9\.2 est disponible/);
      await p.click('.toast.mj-toast .ui-toast-btn:has-text("Ne plus me prévenir")');
      await p.waitForTimeout(200);
      const calls = await p.evaluate(() => window.__calls);
      assert.ok(calls.some((c) => c[0] === 'prefs' && c[1].skip === '0.9.2'), JSON.stringify(calls));
      await p.evaluate(() => { document.querySelectorAll('.toast').forEach((t) => t.remove()); return window.LCNDA_EXT.updates.startupCheck(); });
      await p.waitForTimeout(300);
      assert.equal(await p.$('.toast.mj-toast'), null, 'plus de message pour cette version');
      await p.context().close();
    });
    await okA('rien en mode consultation ni avec « Jamais »', async () => {
      const p = await newPage(true);
      await p.evaluate(() => { document.body.classList.add('is-kiosk'); return window.LCNDA_EXT.updates.startupCheck(); });
      await p.waitForTimeout(300);
      assert.equal(await p.$('.toast.mj-toast'), null);
      assert.equal((await p.evaluate(() => window.__calls)).filter((c) => c[0] === 'check').length, 0, 'aucune recherche');
      await p.evaluate(() => { document.body.classList.remove('is-kiosk'); localStorage.setItem('lcnda-mises-a-jour', JSON.stringify({ auto: false })); return window.LCNDA_EXT.updates.startupCheck(); });
      await p.waitForTimeout(300);
      assert.equal((await p.evaluate(() => window.__calls)).filter((c) => c[0] === 'check').length, 0, 'Jamais : aucune recherche');
      await p.context().close();
    });
    await okA('Réglages → 🔄 Mises à jour : rechercher, K2, télécharger puis ouvrir', async () => {
      const p = await newPage(true, { w: 390 });
      await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'mises_a_jour'; A.setModule('maintenance'); });
      await p.waitForSelector('.mj-page [data-mj-check]');
      assert.match(await p.textContent('.mj-page h2'), /Mises à jour/);
      await p.click('[data-mj-check]');
      await p.waitForSelector('[data-mj-download]');
      assert.match(await p.textContent('[data-mj-status]'), /0\.9\.2/);
      await p.click('[data-mj-auto="false"]'); await p.waitForTimeout(900);
      assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('lcnda-mises-a-jour')).auto), false);
      assert.ok((await p.evaluate(() => window.__calls)).some((c) => c[0] === 'prefs' && c[1].auto === false), 'recopié dans le bureau');
      assert.match(await p.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent).join('|')), /Réglage changé/, 'K2 : message H7 avec ↶ Annuler');
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, 'pas de défilement de côté à 390 px');
      await p.click('[data-mj-download]');
      await p.waitForSelector('[data-mj-open]:not([hidden])');
      assert.match(await p.textContent('.mj-dl'), /vérifié/);
      await p.click('[data-mj-open]'); await p.waitForTimeout(100);
      assert.ok((await p.evaluate(() => window.__calls)).some((c) => c[0] === 'open'));
      await p.context().close();
    });
    await okA('menu « Rechercher une mise à jour… » : la page et la recherche', async () => {
      const p = await newPage(true);
      await p.evaluate(() => window.lcnda.__send('check-updates'));
      await p.waitForSelector('[data-mj-download]');
      assert.ok((await p.evaluate(() => window.__calls)).some((c) => c[0] === 'check' && c[1] === true));
      await p.context().close();
    });
    await okA('dans un navigateur : un lien vers les versions, aucune recherche', async () => {
      const p = await newPage(false);
      await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'mises_a_jour'; A.setModule('maintenance'); });
      await p.waitForSelector('.mj-page');
      assert.equal(await p.$('[data-mj-check]'), null);
      assert.equal(await p.getAttribute('.mj-page a[href*="github.com/victorbaissait/lcnda/releases"]', 'rel'), 'noopener noreferrer');
      await p.evaluate(() => window.LCNDA_EXT.updates.startupCheck());
      await p.context().close();
    });
    assert.deepEqual(errors, [], 'erreurs de page : ' + errors.join(' | '));
  } finally {
    await browser.close();
    proc.kill();
  }
}
