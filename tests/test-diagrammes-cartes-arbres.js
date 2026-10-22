'use strict';
/**
 * 🗺️ Cartes et arbres en plus — D16 à D22 (assets/js/heritage-diagram-cartes2.js, lib/diagram_cartes2.php) :
 *     node tests/test-diagrammes-cartes-arbres.js     (DC2_SHOTS=dossier pour les captures, DC2_PORT=port, DC2_TMP=dossier)
 * 1. Sans navigateur (bac à sable, fonds de carte lus sur le disque) : les 7 sortes au catalogue (groupe, icône, nom,
 *    exemple, « Depuis l'app »), chaque exemple se dessine, SVG valide en XML, textes et couleurs piégés échappés,
 *    beaucoup de données sans figer, calculs (familles de causes, prénoms transmis, points, étapes).
 * 2. Navigateur (Playwright + PHP ; sinon partie sautée), sur un « php -S » à lui avec une petite généalogie
 *    (tests/fixtures/diagram-more-seed.php + parrains et causes de décès) : api diagram_cartes2, galerie, chaque sorte
 *    dans l'éditeur (exemple, un réglage, « Depuis l'app »), clic → fiche ou « qui est compté », carte qui raconte
 *    (◀ ▶, lecture, frise), enregistrer + poser + exporter (SVG, PNG), Éditeur de graphiques (causes en anneaux),
 *    mode sombre et 390 px, aucune erreur JavaScript.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const vm = require('node:vm');
const { spawn, spawnSync } = require('node:child_process');

const appRoot = path.resolve(__dirname, '..');
let failed = 0;
const steps = [];
const step = (name, fn) => steps.push([name, fn]);
const KINDS = ['dotmap', 'hexmap', 'cartogram', 'storymap', 'icicle', 'godnames', 'causesun'];
const GROUP = { dotmap: 'Cartes', hexmap: 'Cartes', cartogram: 'Cartes', storymap: 'Cartes', icicle: 'Généalogie', godnames: 'Généalogie', causesun: 'Généalogie' };
const EXPECT = { dotmap: /class="c2-pt"/, hexmap: /class="c2-hex"/, cartogram: /class="c2-cg"/, storymap: /data-c2-story=/, icicle: /class="c2-ic"/, godnames: /class="c2-gn"/, causesun: /class="c2-cs"/ };
const SHOTS = process.env.DC2_SHOTS || '';

/* ── 1. Bac à sable ── */
const readGeo = url => fs.readFileSync(path.join(appRoot, String(url).split('?')[0]));
const sandbox = { window: {}, console, setTimeout, clearTimeout, performance, Intl, TextDecoder, Response, Blob, DecompressionStream, MutationObserver: class { observe() {} },
    document: { documentElement: {}, querySelectorAll: () => [], addEventListener() {} },
    fetch: async url => { const b = readGeo(url); return { ok: true, json: async () => JSON.parse(b.toString('utf8')), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }; } };
sandbox.window.LCNDA_APP = { state: {} };
vm.createContext(sandbox);
for (const f of ['heritage-diagrams-render.js', 'heritage-diagram-genea.js', 'heritage-diagram-cartes.js', 'heritage-diagram-cartes2.js']) vm.runInContext(fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8'), sandbox, { filename: f });
const ext = sandbox.window.LCNDA_EXT, R = ext.diagramRender, X = ext.diagramCartes2;
const N = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const J = v => JSON.parse(JSON.stringify(v));
const draw = async spec => { let s = J(spec); if (R.KINDS[s.kind].resolve) s = await R.KINDS[s.kind].resolve(s); return R.svg(s); };
const TRAP = '<img src=x onerror=alert(1)>"\'&';

step('les 7 sortes au catalogue : groupe, icône, nom, tableaux, exemple, « Depuis l’app »', () => {
    for (const k of KINDS) {
        const K = R.KINDS[k]; assert.ok(K, k);
        assert.ok(K.icon && K.label && typeof K.render === 'function' && typeof K.sample === 'function' && K.grids.length && K.options.length, k);
        assert.equal(K.group, GROUP[k], k);
        assert.ok(K.fromApp && typeof K.fromApp.html === 'function' && typeof K.fromApp.bind === 'function', k + ' : Depuis l’app');
    }
});
step('chaque exemple se dessine (fonds de carte chargés), SVG valide en XML', async () => {
    for (const k of KINDS) {
        const svg = await draw({ kind: k, ...R.KINDS[k].sample() });
        assert.match(svg, /^<svg[^>]+viewBox="0 0 900 \d+/, k); assert.doesNotMatch(svg, /Dessin impossible|data-geo-wait/, k); assert.match(svg, EXPECT[k], k);
        for (const [, name, attrs] of svg.matchAll(/<([a-zA-Z][\w:-]*)((?:\s+[^\s=>\/]+(?:="[^"]*")?)*)\s*\/?>/g)) assert.equal(attrs.replace(/\s+[^\s=>\/]+="[^"]*"/g, '').trim(), '', `${k} : <${name}>`);
    }
});
step('calculs : familles de causes, prénoms transmis, lieux des points, étapes', () => {
    assert.equal(X.familyOf('Phtisie pulmonaire'), 'Maladies infectieuses'); assert.equal(X.familyOf('Mort pour la France'), 'Guerre et violence');
    assert.equal(X.familyOf('apoplexie'), 'Cœur et vaisseaux'); assert.equal(X.familyOf('Suites de couches'), 'Naissance et petite enfance'); assert.equal(X.familyOf('zzz'), 'Autres et inconnues');
    assert.deepEqual(J(X.givenOf('Jean-Baptiste Marie MARTIN').given), ['jean-baptiste', 'marie']);
    assert.ok(X.sameName('jean', 'jeanne') && X.sameName('louis', 'louise') && !X.sameName('jean', 'jeannette') && !X.sameName('anne', 'marie'));
    const t = X.transmissions({ rows: [{ godparent: 'Jean MARTIN', godchild: 'Jean DURAND', role: 'parrain' }, { godparent: 'Marie ROUX', godchild: 'Anne Marie ROUX', role: 'marraine' }, { godparent: 'Pierre ROUX', godchild: 'Louis ROUX', role: 'parrain' }] });
    assert.deepEqual(t.map(x => x.how), ['premier', 'autre', 'non']);
    const s = { kind: 'dotmap', ...R.KINDS.dotmap.sample(), o: { from: 1800, to: 1850 } }, base = sandbox.window.LCNDA_EXT.diagramCartes.loaded('monde-110m');
    const P = X.pointsOf(s, [base]); assert.ok(P.pts.length > 5 && P.pts.every(p => p.y >= 1800 && p.y <= 1850), 'période');
    const st = X.stepsOf(R.KINDS.storymap.sample(), [base]); assert.equal(st.length, 8); assert.ok(st.every(x => x.p), 'étapes placées');
});
step('carte qui raconte : une étape montrée, la frise et la bulle', async () => {
    const svg = await draw({ kind: 'storymap', ...R.KINDS.storymap.sample(), o: { ...R.KINDS.storymap.sample().o, step: 3 } });
    assert.match(svg, /data-c2-cur="3"/); assert.match(svg, /Étape 4 sur 8/); assert.match(svg, /Mariage avec Marie Durand/);
});
step('données piégées : textes échappés, couleurs refusées, nombres absurdes bornés', async () => {
    for (const k of KINDS) {
        const s = { kind: k, o: { title: TRAP, height: '1e9', hexSize: '-5', dotSize: 'NaN', step: '999', depth: '1e9', maxRows: '-1', fill: 'x', palette: '__proto__', ramp: '__proto__' },
            places: { [TRAP]: { lat: 'x', lon: 1 } },
            rows: N(30, i => ({ label: TRAP + (i % 3), date: TRAP, kind: TRAP, name: TRAP, pid: TRAP, place: TRAP, note: TRAP, s0: i % 2 ? '1e400' : String(i + 1), family: TRAP, pids: [TRAP],
                parent: i ? TRAP + 0 : '', year: TRAP, gender: TRAP, godparent: TRAP + ' MARTIN', godchild: TRAP + ' DURAND', role: TRAP, rel: TRAP, gpYear: TRAP, gcYear: '1800', color: 'red;background:url(x)' })) };
        const svg = await draw(s);
        assert.doesNotMatch(svg, /<img|<script|url\(x|" onerror/i, k); assert.doesNotMatch(svg, /Dessin impossible/, k);
    }
});
step('beaucoup de données : dessin rapide et borné', async () => {
    const places = Object.fromEntries(N(400, i => ['l' + i, { lat: 43 + (i % 20) * .4, lon: -3 + Math.floor(i / 20) * .45, n: 'L' + i }]));
    const big = {
        dotmap: { places, rows: N(12000, i => ({ label: 'L' + (i % 400), date: String(1600 + i % 300), kind: ['Naissance', 'Décès', 'Mariage'][i % 3], pid: i + 1 })) },
        hexmap: { places, rows: N(12000, i => ({ label: 'L' + (i * 7 % 400), date: String(1600 + i % 300), pid: i + 1 })) },
        cartogram: { o: { map: 'monde', level: 'pays' }, rows: ['FR', 'DE', 'IT', 'ES', 'US', 'CA', 'BR', 'AR', 'CN', 'IN', 'RU', 'AU', 'ZA', 'EG', 'MA', 'DZ', 'GB', 'BE', 'CH', 'PL', 'PT', 'MX', 'JP', 'VN'].map((label, i) => ({ label, s0: (i * 37) % 90 + 1 })) },
        storymap: { places, rows: N(300, i => ({ date: String(1800 + i), label: 'Étape ' + i, place: 'L' + (i % 400) })), o: { step: 150 } },
        icicle: { rows: N(5000, i => ({ name: 'p' + i, parent: i ? 'p' + Math.floor((i - 1) / 3) : '', pid: i + 1 })) },
        godnames: { rows: N(3000, i => ({ godparent: `${['Jean', 'Marie', 'Pierre', 'Anne'][i % 4]} N${i % 50}`.replace(/N(\d+)/, 'NOM$1'), godchild: `${['Jean', 'Marie', 'Louis', 'Anne'][i % 4]} NOM${i}`, role: i % 2 ? 'marraine' : 'parrain', gpYear: String(1700 + i % 150), gcYear: String(1720 + i % 150) })) },
        causesun: { rows: N(300, i => ({ label: ['Phtisie', 'Choléra', 'Vieillesse', 'Cancer', 'Noyade', 'Apoplexie'][i % 6] + ' ' + i, s0: 1 + i % 9 })) },
    };
    const times = [];
    for (const [k, s] of Object.entries(big)) {
        const sp = { kind: k, ...s }; let best = 1e9, svg = '';
        for (let r = 0; r < 2; r++) { const t = performance.now(); svg = await draw(sp); best = Math.min(best, performance.now() - t); }
        times.push(`${k} ${Math.round(best)} ms`);
        assert.doesNotMatch(svg, /Dessin impossible|data-geo-wait/, k); assert.ok(svg.length < 6e6, `${k} : ${svg.length} octets`); assert.ok(best < 1500, `${k} : ${Math.round(best)} ms`);
    }
    console.log('   ', times.join(' · '));
});

/* ── 2. Navigateur ── */
let chromium = null;
for (const p of ['playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) { try { ({ chromium } = require(p)); break; } catch (_) { chromium = null; } }
const php = spawnSync('php', ['-v'], { encoding: 'utf8' }).status === 0 ? 'php' : null;
const tmpRoot = process.env.DC2_TMP || os.tmpdir(); fs.mkdirSync(tmpRoot, { recursive: true });
const tmp = fs.mkdtempSync(path.join(tmpRoot, 'lcnda-dc2-'));
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));
// en plus de la généalogie des diagrammes : des parrains qui donnent leur prénom, des causes de décès (dont une piégée)
const SEED = String.raw`<?php
require $argv[1];
$w = $pdo->prepare('INSERT INTO event_witnesses(event_id,person_id,note,position) VALUES(?,?,?,0)');
$births = $pdo->query("SELECT e.id, e.person_id, p.first_name FROM events e JOIN event_types t ON t.id=e.event_type_id JOIN persons p ON p.id=e.person_id WHERE t.gedcom_tag='BIRT' ORDER BY e.id")->fetchAll();
$byFirst = []; foreach ($births as $b) { $byFirst[$b['first_name']][] = (int) $b['person_id']; }
$n = 0; foreach ($births as $i => $b) { $same = array_values(array_filter($byFirst[$b['first_name']] ?? [], fn($x) => $x !== (int) $b['person_id'])); if (!$same || $n >= 25) continue; $w->execute([$b['id'], $same[$i % count($same)], $i % 2 ? 'marraine' : 'parrain de l\'enfant']); $n++; }
$causes = ['Phtisie', 'Choléra', 'Vieillesse', 'Apoplexie', 'Fluxion de poitrine', 'Mort pour la France', '<img src=x onerror=alert(1)>'];
foreach ($pdo->query("SELECT e.id FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE t.gedcom_tag='DEAT' ORDER BY e.id")->fetchAll() as $i => $d) { $pdo->prepare('UPDATE events SET cause=? WHERE id=?')->execute([$causes[$i % count($causes)], $d['id']]); }
echo "ok cartes2 $n\n";`;

(async () => {
    for (const [name, fn] of steps) { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } }
    if (!chromium || !php) { console.log('— navigateur : Playwright ou PHP absent, partie sautée'); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(failed ? 1 : 0); }
    fs.mkdirSync(path.join(tmp, 'media'), { recursive: true });
    const init = spawnSync(php, ['-r', 'require "lib/paths.php"; (new PDO("sqlite:".DATA_DIR."/genealogy.sqlite"))->exec(file_get_contents(APP_ROOT."/data/schema.sql")); require "lib/bootstrap.php"; db();'], { cwd: appRoot, encoding: 'utf8', env: envFor(tmp) });
    if (init.status !== 0) { console.error(init.stderr || init.stdout); process.exit(1); }
    const seedFile = path.join(tmp, 'seed.php'); fs.writeFileSync(seedFile, SEED);
    const r = spawnSync(php, [seedFile, path.join(appRoot, 'tests/fixtures/diagram-more-seed.php')], { cwd: appRoot, encoding: 'utf8', env: envFor(tmp) });
    if (r.status !== 0 || !/^ok cartes2 \d+/m.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
    const port = Number(process.env.DC2_PORT) || await freePort();
    const proc = spawn(php, ['-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(tmp), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    const browser = await chromium.launch(exe ? { executablePath: exe } : {});
    const errors = [];
    const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
    const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); }); p.on('dialog', d => { errors.push('dialogue : ' + d.message()); d.dismiss(); }); };
    const ready = async p => { await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.bootstrap && window.LCNDA_EXT?.openDiagramEditor && window.LCNDA_EXT?.diagramCartes2, null, { timeout: 20000 }); await p.waitForTimeout(400); };
    const closeAll = p => p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => { d.close(); d.remove(); }));
    const openKind = async (p, k) => { await closeAll(p); await p.evaluate(k => { window.__ed = window.LCNDA_EXT.openDiagramEditor(null, { kind: k }); }, k); await p.waitForSelector('.h-dg-dlg [data-dg-preview] svg'); await p.waitForFunction(() => !document.querySelector('.h-dg-dlg [data-dg-preview] [data-geo-wait]'), null, { timeout: 15000 }); };
    const preview = p => p.$eval('.h-dg-dlg [data-dg-preview]', s => s.innerHTML);
    const shot = async (p, name, sel = '.h-dg-dlg [data-dg-preview]') => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const el = await p.$(sel); if (el) await el.screenshot({ path: path.join(SHOTS, name + '.png') }); };
    try {
        const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 }, acceptDownloads: true });
        const p = await ctx.newPage(); watch(p); await ready(p);
        const api = q => p.evaluate(q => window.LCNDA_APP.api('diagram_cartes2', q), q);
        await t('serveur : points, vie d’une personne, parrains, causes, personnes ; demande inconnue refusée', async () => {
            const pt = await api({ what: 'points', ev: 'all' }); assert.ok(pt.events.length > 100); assert.ok(pt.kinds.includes('Naissance') && pt.kinds.includes('Mariage'));
            const pl = Object.values(pt.places); assert.ok(pl.some(x => x[0] === 'Rennes' && x[4] === 48.1147), 'coordonnées');
            assert.ok(pt.events.every(([pid, plc]) => pt.people[pid] && pt.places[plc]));
            const anc = await api({ what: 'points', ev: 'births', ancestors: 1 }); assert.ok(anc.events.length > 10 && anc.events.length < pt.events.length);
            const per = await api({ what: 'points', ev: 'births', from: 1900, to: 1950 }); assert.ok(per.events.every(e => e[2] >= 1900 && e[2] <= 1950));
            const root = await p.evaluate(() => window.LCNDA_APP.state.bootstrap.startPersonId);
            const st = await api({ what: 'story', person: root }); assert.ok(st.steps.length >= 1 && st.name);
            const gn = await api({ what: 'godnames' }); assert.ok(gn.rows.length >= 10, 'parrains'); assert.ok(gn.rows.some(x => x.gpFirst === x.gcFirst));
            const ca = await api({ what: 'causes' }); assert.ok(ca.rows.some(x => x.label === 'Choléra' && x.n > 0 && x.ids.length === x.n));
            const pe = await api({ what: 'people', ids: ca.rows[0].ids.join(',') }); assert.equal(pe.people.length, ca.rows[0].ids.length);
            const bad = await p.evaluate(() => window.LCNDA_APP.api('diagram_cartes2', { what: 'rien' }).then(() => 'ok', e => e.message)); assert.match(bad, /inconnue/);
            assert.equal(await p.evaluate(() => fetch('api.php?action=diagram_cartes2&what=points&ev[]=1&from[]=2').then(r => r.status)), 200);
        });
        await t('« Nouveau diagramme » : les 7 sortes rangées dans leur groupe, vignettes dessinées', async () => {
            await p.evaluate(() => { window.__ch = window.LCNDA_EXT.diagramsInternals.chooseType(); });
            await p.waitForSelector('.h-dg-gallery .h-dg-tile');
            await p.waitForFunction(() => !document.querySelector('dialog.h-dg-gallery [data-geo-wait]'), null, { timeout: 15000 });
            const groups = await p.$$eval('.h-dg-gallery h4', hs => Object.fromEntries(hs.map(h => [h.textContent, [...h.nextElementSibling.querySelectorAll('.h-dg-tile')].map(x => x.textContent.trim())])));
            for (const k of KINDS) { const label = await p.evaluate(k => window.LCNDA_EXT.diagramRender.KINDS[k].label, k); assert.ok(groups[GROUP[k]]?.some(x => x.includes(label)), `${k} dans ${GROUP[k]}`); }
            if (SHOTS) { await p.evaluate(() => [...document.querySelectorAll('dialog.h-dg-gallery h4')].find(x => x.textContent === 'Cartes')?.scrollIntoView()); await shot(p, 'galerie-cartes', 'dialog.h-dg-gallery'); }
            await p.click('.h-dg-gallery [data-close]');
        });
        await t('chaque sorte s’ouvre dans l’éditeur avec son exemple, et un réglage la redessine', async () => {
            const SET = { dotmap: ['colorBy', 'century', /siècle/], hexmap: ['hexSize', '8', /c2-hex/], cartogram: ['shape', 'square', /<rect class="c2-cg"/], storymap: ['follow', 'all', /data-c2-story/], icicle: ['dir', 'right', /c2-ic/], godnames: ['show', 'all', /Autre prénom/], causesun: ['labels', 'pct', /%/] };
            for (const k of KINDS) {
                await openKind(p, k); assert.match(await preview(p), EXPECT[k], k); await shot(p, 'exemple-' + k);
                await p.click('.h-dg-dlg [data-dg-tab="opts"]'); const [opt, v, re] = SET[k];
                const el = await p.$(`.h-dg-dlg [data-opt="${opt}"]`); assert.ok(el, `${k} : réglage ${opt}`);
                if (await el.evaluate(e => e.tagName === 'SELECT')) await el.selectOption(v); else await el.evaluate((e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
                await p.waitForFunction(re => new RegExp(re).test(document.querySelector('.h-dg-dlg [data-dg-preview]').innerHTML), re.source, { timeout: 8000 }).catch(() => { throw new Error(`${k} : le réglage ${opt} ne redessine pas`); });
            }
        });
        const fromApp = async (k, before) => {
            await openKind(p, k); await p.click('.h-dg-dlg [data-dg-tab="app"]'); await p.waitForSelector('.h-dg-dlg [data-c2-go], .h-dg-dlg [data-dgm-go]');
            if (before) await before();
            const rows0 = await p.evaluate(() => JSON.stringify(window.__lastSpec || ''));
            await p.click('.h-dg-dlg [data-c2-go], .h-dg-dlg [data-dgm-go]');
            await p.waitForFunction(() => document.querySelector('.h-dg-dlg [data-dg-tab="data"]')?.classList.contains('is-active') || /✓|⚠️|⛔|Aucun/.test(document.querySelector('.h-dg-dlg [data-c2-msg], .h-dg-dlg [data-dgm-msg]')?.textContent || ''), null, { timeout: 20000 });
            const msg = await p.$eval('.h-dg-dlg [data-c2-msg], .h-dg-dlg [data-dgm-msg]', e => e.textContent).catch(() => '');
            assert.doesNotMatch(msg, /⚠️|⛔|Aucun/, `${k} : ${msg}`); void rows0;
            await p.waitForTimeout(400);
            await p.click('.h-dg-dlg [data-dg-tab="data"]'); await p.waitForSelector('.h-dg-dlg [data-grid="0"]');
            await p.waitForFunction(() => !document.querySelector('.h-dg-dlg [data-dg-preview] [data-geo-wait]'), null, { timeout: 15000 });
            return p.evaluate(() => document.querySelectorAll('.h-dg-dlg [data-grid="0"] tbody tr').length);
        };
        const root = await p.evaluate(() => window.LCNDA_APP.state.bootstrap.startPersonId);
        const elder = (await p.evaluate(() => window.LCNDA_APP.api('diagram_genea', { what: 'fan', gens: 4 }))).rows.filter(x => x.sosa >= 8).map(x => x.id)[0]; // un arrière-grand-parent : il a une descendance
        const APP = {
            dotmap: [() => p.selectOption('.h-dg-dlg [data-c2="ev"]', 'all'), async () => { const h = await preview(p); assert.match(h, /Rennes/); assert.match(h, /data-c2-pids="\d/); }],
            hexmap: [null, async () => assert.match(await preview(p), /class="c2-hex" data-c2-pids="\d/)],
            cartogram: [() => p.selectOption('.h-dg-dlg [data-dgo="pop"]', 'anc'), // « Seulement mes ancêtres » est devenu le groupe de personnes commun (heritage-diagram-options.js)
                 async () => assert.match(await preview(p), /Ille-et-Vilaine/)],
            storymap: [() => p.evaluate(id => window.LCNDA_PICKER.pickerSet(document.querySelector('.h-dg-dlg [name=c2_person]').closest('.pk'), id), root), async () => assert.match(await preview(p), /data-c2-step="0"/)],
            icicle: [async () => { await p.selectOption('.h-dg-dlg [data-c2="gens"]', '4'); await p.evaluate(id => window.LCNDA_PICKER.pickerSet(document.querySelector('.h-dg-dlg [name=c2_root]').closest('.pk'), id), elder); }, async () => assert.ok((await p.$$('.h-dg-dlg [data-dg-preview] [data-c2-pid]')).length > 5)],
            godnames: [null, async () => assert.match(await preview(p), /data-c2-pid="\d/)],
            causesun: [null, async () => { const h = await preview(p); assert.match(h, /Choléra/); assert.match(h, /Maladies infectieuses/); assert.doesNotMatch(h, /<img/); }],
        };
        for (const k of KINDS) {
            await t(`« Depuis l’app » : ${k}`, async () => {
                if (k === 'storymap') { // la personne de départ n'a qu'une naissance : on prend un ancêtre avec plusieurs lieux
                    const pts = await api({ what: 'points', ev: 'all' }); const cnt = new Map(); pts.events.forEach(e => cnt.set(e[0], (cnt.get(e[0]) || 0) + 1));
                    const best = [...cnt].sort((a, b) => b[1] - a[1])[0][0]; APP.storymap[0] = () => p.evaluate(id => window.LCNDA_PICKER.pickerSet(document.querySelector('.h-dg-dlg [name=c2_person]').closest('.pk'), id), best);
                }
                const n = await fromApp(k, APP[k][0]); assert.ok(n > 0, `${k} : ${n} lignes`);
                await APP[k][1](); await shot(p, 'base-' + k);
            });
        }
        await t('📖 carte qui raconte : ▶ avance d’une étape, la frise y va, la lecture fait défiler', async () => {
            await openKind(p, 'storymap'); await p.waitForSelector('.h-dg-dlg .c2-tools');
            const cur = () => p.$eval('.h-dg-dlg [data-c2-story]', g => Number(g.getAttribute('data-c2-cur')));
            assert.equal(await cur(), -1);
            await p.click('.h-dg-dlg .c2-tools [data-c2-t="next"]'); await p.waitForFunction(() => document.querySelector('.h-dg-dlg [data-c2-story]')?.getAttribute('data-c2-cur') === '0');
            assert.match(await p.$eval('.h-dg-dlg .c2-tools output', e => e.textContent), /Étape 1 \/ 8/);
            await p.$eval('.h-dg-dlg [data-c2-story] g.c2-st[data-c2-step="5"]', e => e.dispatchEvent(new MouseEvent('click', { bubbles: true })));
            await p.waitForFunction(() => document.querySelector('.h-dg-dlg [data-c2-story]')?.getAttribute('data-c2-cur') === '5');
            await shot(p, 'raconte-etape-6');
            await p.click('.h-dg-dlg .c2-tools [data-c2-t="play"]'); await p.waitForFunction(() => Number(document.querySelector('.h-dg-dlg [data-c2-story]')?.getAttribute('data-c2-cur')) >= 6, null, { timeout: 5000 });
            await p.click('.h-dg-dlg .c2-tools [data-c2-t="play"]'); await p.waitForTimeout(800);
            assert.ok((await p.evaluate(() => window.__ed && true)), 'éditeur ouvert');
            assert.ok(Number(await p.$eval('.h-dg-dlg [data-opt="step"]', e => e.value).catch(() => '6')) >= -1);
        });
        await t('clic : un point ouvre « qui est compté », une case la fiche ; enregistrés et posés, exportés en SVG et PNG', async () => {
            await closeAll(p);
            const ids = {};
            for (const k of KINDS) ids[k] = await p.evaluate(async k => { const R = window.LCNDA_EXT.diagramRender; const { kind, ...spec } = { kind: k, ...R.KINDS[k].sample() }; const r = await window.LCNDA_APP.api('save_diagram', {}, { method: 'POST', body: { name: 'Test ' + k, kind, spec } }); return Number(r.result?.id || r.id); }, k);
            assert.ok(Object.values(ids).every(x => x > 0));
            await p.evaluate(ids => { const box = document.createElement('div'); box.id = 'dc2-test'; box.style.width = '760px'; box.innerHTML = Object.values(ids).map(id => window.LCNDA_EXT.diagramEmbedHtml(id)).join(''); document.body.prepend(box); }, ids);
            await p.waitForFunction(n => document.querySelectorAll('#dc2-test .h-dg-svg svg').length === n && !document.querySelector('#dc2-test [data-geo-wait]'), KINDS.length, { timeout: 20000 });
            // la carte qui raconte posée : ▶ redessine sur place
            await p.waitForSelector('#dc2-test .c2-tools'); await p.click('#dc2-test .c2-tools [data-c2-t="next"]');
            await p.waitForFunction(() => document.querySelector('#dc2-test [data-c2-story]')?.getAttribute('data-c2-cur') === '0');
            // une case de descendance rattachée à une fiche : la fiche s'ouvre
            const pid = (await p.evaluate(r => window.LCNDA_APP.api('diagram_genea', { what: 'desc', gens: 2, root: r }), elder)).nodes[1].id;
            await p.evaluate(pid => { const d = document.createElement('div'); d.id = 'dc2-ic'; d.innerHTML = window.LCNDA_EXT.diagramRender.svg({ kind: 'icicle', rows: [{ name: 'Moi' }, { name: 'Enfant', parent: 'Moi', pid }] }, 600); document.body.prepend(d); }, pid);
            await p.$eval('#dc2-ic [data-c2-pid]', e => e.dispatchEvent(new MouseEvent('click', { bubbles: true })));
            await p.waitForFunction(pid => window.LCNDA_APP.state.currentPersonId === pid && window.LCNDA_APP.state.module === 'personnes', pid, { timeout: 8000 });
            // une part de causes avec des personnes : « qui est compté »
            const ca = await api({ what: 'causes' });
            await p.evaluate(rows => { const d = document.createElement('div'); d.id = 'dc2-cs'; d.innerHTML = window.LCNDA_EXT.diagramRender.svg({ kind: 'causesun', rows: rows.map(r => ({ label: r.label, s0: r.n, pids: r.ids })) }, 600); document.body.prepend(d); }, ca.rows);
            await p.$eval('#dc2-cs .c2-cs[data-c2-label="Choléra"]', e => e.dispatchEvent(new MouseEvent('click', { bubbles: true })));
            await p.waitForSelector('#h-cw-who-dialog[open] .h-cw-who-card', { timeout: 8000 });
            await shot(p, 'qui-est-compte', '#h-cw-who-dialog');
            await closeAll(p); await p.evaluate(() => ['dc2-test', 'dc2-ic', 'dc2-cs'].forEach(i => document.getElementById(i)?.remove()));
            assert.equal(await p.evaluate(() => window.__xss), undefined);
            for (const k of ['hexmap', 'causesun']) for (const fmt of ['svg', 'png']) {
                await p.evaluate(i => window.LCNDA_EXT.openDiagram(i), ids[k]); await p.waitForSelector('[data-dg-pexpdlg]');
                await p.click('[data-dg-pexpdlg]'); await p.click(`.ui-export-fmt[data-fmt="${fmt}"]`);
                const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), p.click('[data-ui-go]')]);
                assert.ok(dl.suggestedFilename().endsWith('.' + fmt)); const body = fs.readFileSync(await dl.path()); assert.ok(body.length > 1000, `${k} ${fmt} : ${body.length}`);
                if (fmt === 'svg') { assert.match(body.toString(), /^<svg/); assert.doesNotMatch(body.toString(), /data-geo-wait/); }
                await closeAll(p);
            }
        });
        await t('Éditeur de graphiques : les causes en anneaux se proposent comme dessin', async () => {
            const styles = await p.evaluate(() => (window.LCNDA_EXT.diagramStatStyles?.() || []).flatMap(([, l]) => l.map(x => x[0])));
            assert.ok(styles.includes('dg:causesun'), styles.join(','));
        });
        await t('mode sombre et 390 px : le dessin reste sur fond clair, rien ne déborde', async () => {
            const m = await ctx.newPage(); await m.setViewportSize({ width: 390, height: 844 }); await m.emulateMedia({ colorScheme: 'dark' }); watch(m); await ready(m);
            await m.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
            for (const k of KINDS) {
                await openKind(m, k);
                const w = await m.evaluate(() => ({ doc: document.documentElement.scrollWidth, svg: document.querySelector('.h-dg-dlg [data-dg-preview] svg').getBoundingClientRect().right, bg: document.querySelector('.h-dg-dlg [data-dg-preview] svg > rect').getAttribute('fill') }));
                assert.ok(w.doc <= 391 && w.svg <= 391, `${k} : ${JSON.stringify(w)}`); assert.equal(w.bg, '#ffffff');
                if (k === 'storymap') { await m.waitForSelector('.h-dg-dlg .c2-tools'); assert.ok(await m.$eval('.h-dg-dlg .c2-tools', e => e.getBoundingClientRect().right <= 391)); }
                if (['dotmap', 'storymap', 'causesun'].includes(k)) await shot(m, `sombre-390-${k}`, '.h-dg-dlg');
            }
            await m.close();
        });
        await t('aucune erreur JavaScript', async () => assert.deepEqual(errors, []));
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
    process.exit(failed ? 1 : 0);
})();
