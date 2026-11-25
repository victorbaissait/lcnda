#!/usr/bin/env node
/* 🕰 Son époque et son travail (assets/js/heritage-epoque-travail.js, assets/css/epoque-travail.css, assets/data/et-*.json.gz
 * fabriqués par scripts/epoque-travail/build.py ; la vie d'une personne vient de ha_life, lib/histoire_autour.php). Les données
 * livrées sont les VRAIES.
 *  1. données : présentes, tailles mesurées (< 15 Mo en tout), source et licence ; chaque phrase citée contient son année ;
 *  2. calcul (Node) : Pierre MAZAUD, vigneron à Cognac (1840–1900) → le phylloxéra en 1872 ; un boulanger : rien ;
 *     un mineur de Carmaux → les grèves de Carmaux, « son métier » ; un éclusier → son écluse ; né en 1820 : pas encore de train,
 *     à sa mort (1890) le téléphone ; 20 ans en 1862 → Les Misérables ; la mode d'une décennie ; les formats de photos ;
 *  3. écran : bloc « 🕰 Son époque » de la fiche (caché quand il n'y a rien), lieu (placeInto), registres (listes avec
 *     colonne Source, monographie, dataSources), « 📷 Dater une photo », Réglages (éteindre un sujet, ↶).
 *   node tests/test-epoque-travail.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const zlib = require('zlib');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
const H = require('../assets/js/heritage-epoque-travail.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DATA = path.join(root, 'assets/data');
const FILES = {fleaux: 'et-fleaux', greves: 'et-greves', ouvrages: 'et-ouvrages', nouveautes: 'et-nouveautes', livres: 'et-livres', mode: 'et-mode'};
const has = k => fs.existsSync(path.join(DATA, FILES[k] + '.json.gz'));
const raw = k => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DATA, FILES[k] + '.json.gz'))).toString('utf8'));
const life = (p, places, events = [], jobs = []) => ({ok: true, person: {first: 'Pierre', gender: 'male', ...p}, places, events, jobs, text: ''});
const COGNAC = {name: 'Cognac', insee: '16102', country: 'France', lat: 45.6958, lon: -0.3287};

(async () => {
    await t('données : tailles mesurées (< 15 Mo en tout), source, licence, et l’année dans chaque phrase citée', async () => {
        let size = 0;
        for (const k of Object.keys(FILES)) {
            assert.ok(has(k), `${k} manque`);
            const s = fs.statSync(path.join(DATA, FILES[k] + '.json.gz')).size; size += s;
            const f = raw(k);
            assert.ok(f.source && f.licence && f.url && f.built, k);
            const n = k === 'mode' ? Object.values(f.decades).reduce((a, b) => a + b.length, 0) : f.rows.length;
            assert.ok(n > 5, `${k} : ${n}`);
            console.log(`  ${k} : ${n} lignes, ${(s / 1024).toFixed(0)} Ko — ${f.licence}`);
        }
        assert.ok(size < 15e6, `${size} octets`);
        console.log(`  (taille dans l’app : ${(size / 1e6).toFixed(2)} Mo)`);
        for (const r of raw('fleaux').rows) { assert.ok(r.url.startsWith('https://') && r.sentence, r.f); assert.ok(r.sentence.includes(String(r.y)) || /quatre ans plus tard/i.test(r.sentence), `${r.f} ${r.y} : ${r.sentence}`); }
        for (const r of raw('nouveautes').rows) { assert.ok(r.sentence.includes(String(r.y)), `${r.id} : ${r.sentence}`); assert.match(r.url, /^https:\/\/fr\.wikipedia\.org\/wiki\//); }
        for (const p of raw('mode').photos) assert.ok(p.sentence.includes(String(p.from)), p.id);
        for (const list of Object.values(raw('mode').decades)) for (const g of list) { assert.ok(g.lic && g.page && /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(g.t), g.f); }
        assert.strictEqual(raw('greves').licence, 'CC0 1.0'); assert.match(raw('fleaux').licence, /CC BY-SA/);
    });

    const F = H.prepFleaux(raw('fleaux'));
    await t('🐛 Pierre MAZAUD, vigneron à Cognac (1840–1900) : le phylloxéra en 1872 ; boulanger ou sans lieu : rien', async () => {
        const L = life({birth: 1840, death: 1900}, [COGNAC], [], [{text: 'vigneron'}]);
        const got = H.fleauxForLife(F, L);
        assert.ok(got.length, 'un fléau');
        assert.strictEqual(got[0].r.f, 'phylloxera'); assert.strictEqual(got[0].r.y, 1872); assert.strictEqual(got[0].dep, '16'); assert.strictEqual(got[0].strong, true); assert.strictEqual(got[0].age, 32);
        assert.match(got[0].r.sentence, /Cognac|charentais/);
        assert.deepStrictEqual(H.fleauxForLife(F, {...L, jobs: [{text: 'boulanger'}]}), [], 'un boulanger : rien');
        assert.deepStrictEqual(H.fleauxForLife(F, {...L, places: []}), [], 'sans lieu : rien');
        assert.deepStrictEqual(H.fleauxForLife(F, life({birth: 1900, death: 1960}, [COGNAC], [], [{text: 'vigneron'}])).filter(x => x.r.f === 'phylloxera'), [], 'né après : rien');
        assert.strictEqual(H.deptOf({county: 'Corrèze'}), '19'); assert.strictEqual(H.deptOf({insee: '2A004'}), '2A'); assert.strictEqual(H.deptOf({full: 'Tulle, Corrèze, Limousin, France'}), '19');
        const C = H.fleauxForLife(F, life({birth: 1830, death: 1890}, [{name: 'Tulle', insee: '19272', lat: 45.27, lon: 1.77}], [], [{text: 'vigneron'}]));
        console.log(`  (Corrèze : ${C.map(x => `${x.r.f} ${x.r.y}${x.r.exact ? '' : ' (France)'}`).join(', ') || 'rien'})`);
    });

    const G = H.table(raw('greves'));
    await t('✊ un mineur du Nord : la grève des mineurs, « son métier » ; Carmaux à 2 km ; trop loin ou avant 14 ans : rien', async () => {
        const c = G.find(x => /Carmaux/.test(x.n) && x.lat !== null);
        assert.ok(c, 'les grèves de Carmaux sont dans les données');
        const cl = H.strikesForLife(G, life({birth: c.y - 30, death: c.y + 20}, [{name: 'Blaye-les-Mines', lat: c.lat + 0.018, lon: c.lon}], [], [{text: 'verrier'}]));
        assert.ok(cl.some(x => x.s.q === c.q && x.km < 3), 'Carmaux à 2 km');
        const s = G.find(x => x.ind === 'mine' && x.lat !== null && x.r !== -1 && /France/.test(x.country || ''));
        assert.ok(s, 'une grève de mineurs placée en France');
        const L = life({birth: s.y - 30, death: s.y + 20}, [{name: 'Carmaux', lat: s.lat + 0.01, lon: s.lon}], [], [{text: 'mineur'}]);
        const got = H.strikesForLife(G, L, 20);
        assert.ok(got.length && got[0].job === 'mineur' && got.some(x => x.s.q === s.q && x.job === 'mineur' && x.km < 3), JSON.stringify(got.slice(0, 2).map(x => [x.s.n, x.km, x.job])));
        assert.deepStrictEqual(H.strikesForLife(G, life({birth: s.y - 10, death: s.y + 50}, [{name: 'X', lat: s.lat, lon: s.lon}])).filter(x => x.s.q === s.q), [], 'il a 10 ans : rien');
        assert.deepStrictEqual(H.strikesForLife(G, life({birth: s.y - 30, death: s.y + 20}, [{name: 'Y', lat: s.lat + 1, lon: s.lon}])).filter(x => x.s.q === s.q), [], 'à 110 km : rien');
        console.log(`  (grèves placées : ${G.filter(x => x.lat !== null).length} sur ${G.length} ; en France : ${G.filter(x => /France/.test(x.country || '')).length})`);
    });

    const O = H.table(raw('ouvrages'));
    await t('🌉 un éclusier : l’écluse près de chez lui ; un terrassier : l’ouvrage construit pendant sa vie ; un boulanger : rien', async () => {
        const w = O.find(x => x.k === 'ecluse' && x.country === 'France' && x.y > 1700 && x.y < 1900);
        assert.ok(w, 'une écluse française datée');
        const L = life({birth: w.y + 10, death: w.y + 70}, [{name: 'Z', lat: w.lat + 0.005, lon: w.lon}], [], [{text: 'éclusier'}]);
        const got = H.worksForLife(O, L);
        assert.ok(got.some(x => x.w.q === w.q && x.mode === 'keeper'), JSON.stringify(got.slice(0, 3).map(x => [x.w.n, x.mode])));
        const b = O.find(x => x.k === 'pont' && x.country === 'France' && x.y > 1820 && x.y < 1900);
        const T2 = H.worksForLife(O, life({birth: b.y - 30, death: b.y + 20}, [{name: 'Q', lat: b.lat, lon: b.lon + 0.01}], [], [{text: 'terrassier'}]));
        assert.ok(T2.some(x => x.w.q === b.q && x.mode === 'build' && x.age === 30), b.n);
        assert.deepStrictEqual(H.worksForLife(O, {...L, jobs: [{text: 'boulanger'}]}), []);
        console.log(`  (${['pont', 'canal', 'ecluse', 'tunnel', 'aqueduc'].map(k => `${k} ${O.filter(x => x.k === k).length}`).join(', ')})`);
    });

    const N = raw('nouveautes').rows;
    await t('💡 né en 1820, mort en 1890 : pas encore de train ; à sa mort, le téléphone ; sans naissance : rien', async () => {
        const nv = H.novelties(N, life({birth: 1820, death: 1890}, []));
        assert.ok(nv.notYet.some(r => r.id === 'train') && nv.notYet.some(r => r.id === 'photographie'));
        assert.ok(nv.known.some(r => r.id === 'telephone') && !nv.known.some(r => r.id === 'avion'));
        assert.ok(nv.after.some(r => r.id === 'avion') && nv.during.some(r => r.id === 'timbre'));
        assert.strictEqual(H.novelties(N, life({}, [])), null);
    });

    await t('📚 20 ans en 1862 : Les Misérables (Victor Hugo) ; 👗 la mode d’une décennie ; 📷 les formats de 1865', async () => {
        const B = H.table(raw('livres'));
        const l = H.booksOf(B, 1862);
        assert.ok(l.length && /Misérables/.test(l[0].t) && /Hugo/.test(l[0].a), JSON.stringify(l.slice(0, 2)));
        const M = raw('mode');
        const dd = Object.keys(M.decades)[Math.floor(Object.keys(M.decades).length / 2)];
        const imgs = H.fashionOf(M.decades, Number(dd) + 3, 6);
        assert.ok(imgs.length, dd);
        assert.ok(H.photoFormatsFor(M.photos, 1865).length >= 2, 'plusieurs formats possibles en 1865');
        assert.ok(!H.photoFormatsFor(M.photos, 1830).length, 'pas de photo en 1830');
        console.log(`  (mode : ${Object.keys(M.decades).length} décennies${M.gaps.length ? ` ; sans image : ${M.gaps.join(', ')}` : ''} ; formats : ${M.photos.map(p => p.id).join(', ')})`);
    });

    /* ─────────── serveur et écran ─────────── */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-et-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,occupation) VALUES(1,'Pierre','MAZAUD','male','deceased',1,'vigneron'),(2,'Marie','LACOMBE','female','deceased',0,''),(3,'Jean','DURAND','male','deceased',0,'boulanger')");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Cognac','Charente','France',45.6958,-0.3287,'16102'),(2,'Tulle','Corrèze','France',45.2670,1.7680,'19272')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
$ins->execute([1,$t('BIRT'),'1842',1842,'1842',1]); $ins->execute([1,$t('DEAT'),'1900',1900,'1900',1]);
$ins->execute([2,$t('BIRT'),'1842',1842,'1842',2]); $ins->execute([2,$t('DEAT'),'1930',1930,'1930',2]);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        await ctx.route(/^https:\/\/(upload|thumb|commons)\.wikimedia\.org\//, r => r.abort()); // pas d'Internet dans l'essai
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks, null, {timeout: 30000});
        // index.php ne charge pas encore heritage-epoque-travail.js : on l'ajoute (comme le feront les balises)
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.epoqueTravail))) { await p.addStyleTag({url: base + 'assets/css/epoque-travail.css'}); await p.addScriptTag({url: base + 'assets/js/heritage-epoque-travail.js'}); }
        await p.waitForFunction(() => !!window.LCNDA_EXT?.epoqueTravail);

        await t('fiche : « 🕰 Son époque » dit le phylloxéra à Cognac (« il était vigneron »), les nouveautés, le livre de ses 20 ans ; la source à un clic', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-et-person="1"] .et-row', {timeout: 30000});
            const txt = await p.textContent('[data-et-person="1"]');
            assert.match(txt, /Le phylloxéra touche les vignes près de Cognac en 1872 : il était vigneron\./);
            assert.match(txt, /Quand Pierre naît, en 1842, il n’y a pas encore/); assert.match(txt, /Quand il meurt, en 1900, il y a/);
            assert.match(txt, /L’année de ses 20 ans \(1862\) paraît Les Misérables \(Victor Hugo\)/);
            assert.match(txt, /Source : Wikipédia/); assert.match(txt, /▸ plus/);
            const a = await p.$$eval('[data-et-person="1"] a.et-src-link', l => l.map(x => [x.href, x.target, x.rel]));
            assert.ok(a.length && a.every(([h, tg, rel]) => /^https:\/\//.test(h) && tg === '_blank' && /noopener/.test(rel)), JSON.stringify(a.slice(0, 2)));
            assert.strictEqual(await p.evaluate(() => document.querySelector('[data-et-person="1"]').closest('section.card').hidden), false);
        });

        await t('fiche : Marie LACOMBE (sans métier) n’a pas de fléau ; Jean DURAND (sans dates ni lieu) : bloc caché', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 2; A.setModule('personnes'); });
            await p.waitForSelector('[data-et-person="2"] .et-row', {timeout: 30000});
            const txt = await p.textContent('[data-et-person="2"]');
            assert.ok(!/phylloxéra/.test(txt)); assert.match(txt, /Quand Marie naît, en 1842/); assert.match(txt, /Quand elle meurt, en 1930/);
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 3; A.setModule('personnes'); });
            await p.waitForSelector('[data-et-person="3"]', {state: 'attached', timeout: 20000}); await sleep(2500);
            assert.strictEqual(await p.evaluate(() => document.querySelector('[data-et-person="3"]').closest('section.card').hidden), true);
        });

        await t('lieu : Cognac → fléaux du département ; un point en mer : rien', async () => {
            const html = await p.evaluate(async () => { const h = document.createElement('div'); document.body.appendChild(h); await window.LCNDA_EXT.epoqueTravail.placeInto(h, {id: 1, name: 'Cognac', insee: '16102', country: 'France', lat: 45.6958, lon: -0.3287}); const x = h.innerHTML; h.remove(); return x; });
            assert.match(html, /phylloxéra/i); assert.match(html, /▸ plus/); assert.match(html, /↗ source/);
            const none = await p.evaluate(async () => { const h = document.createElement('div'); document.body.appendChild(h); const n = await window.LCNDA_EXT.epoqueTravail.placeInto(h, {id: 0, name: 'En mer', lat: 46.0, lon: -6.0}); const r = [n, h.innerHTML]; h.remove(); return r; });
            assert.deepStrictEqual(none, [0, '']);
        });

        await t('registres : listes (colonne Source, filtres, carte), monographie, dataSources', async () => {
            const r = await p.evaluate(async () => {
                const E = window.LCNDA_EXT, L = E.dataLists.filter(d => d.id.startsWith('et_'));
                const out = {ids: L.map(d => d.id), src: true, rows: {}};
                for (const d of L) { const rows = await d.load(); out.rows[d.id] = rows.length; if (!d.fields.some(f => f.key === 'src' && f.type === 'url') || !d.source) out.src = false; if (rows[0] && !/^https:\/\//.test(rows[0].src)) out.src = false; }
                const gr = L.find(d => d.id === 'et_greves'), g = (await gr.load()).find(x => x.lat !== null && x.r !== -1);
                out.geo = gr.geo(g);
                const mono = E.monographSections.find(s => s.id === 'et_fleaux'), mh = document.createElement('div'); document.body.appendChild(mh);
                out.mono = [await mono.render({id: 1, name: 'Cognac', county: 'Charente', latitude: 45.6958, longitude: -0.3287}, mh, {village: async () => ({insee: '16102'})}), mh.textContent]; mh.remove();
                const host = document.createElement('div'); document.body.appendChild(host);
                await E.dataSources.find(d => d.id === 'et_livres_annee').run({year: 1862}, host); out.ds = host.textContent; host.remove();
                out.secs = E.monographSections.filter(s => s.id.startsWith('et_')).map(s => s.id); out.srcs = E.dataSources.filter(s => s.id.startsWith('et_')).length;
                return out;
            });
            ['et_fleaux', 'et_greves', 'et_ouvrages', 'et_nouveautes', 'et_livres', 'et_mode', 'et_photos'].forEach(id => assert.ok(r.ids.includes(id) && r.rows[id] > 0, id));
            assert.ok(r.src, 'colonne Source partout'); assert.ok(Number.isFinite(r.geo[0]));
            assert.strictEqual(r.mono[0], true); assert.match(r.mono[1], /phylloxéra/i);
            assert.match(r.ds, /Misérables/); assert.deepStrictEqual(r.secs, ['et_fleaux', 'et_greves', 'et_ouvrages']); assert.ok(r.srcs >= 8);
        });

        await t('📷 « Dater une photo » : le tableau des formats (avec ↗ source) et les décennies à comparer', async () => {
            await p.evaluate(() => window.LCNDA_EXT.epoqueTravail.openPhotoDating({year: 1866}));
            await p.waitForSelector('dialog.et-dialog .et-photo-tbl tbody tr');
            const txt = await p.textContent('dialog.et-dialog');
            assert.match(txt, /Daguerréotype/); assert.match(txt, /↗ source/); assert.match(txt, /années 1860/);
            assert.ok(await p.$('dialog.et-dialog [data-et-dec="1860"].is-active'));
            await p.click('dialog.et-dialog [data-et-x]');
        });

        await t('Réglages → 🕰 Son époque : éteindre « fléaux » le retire de la fiche (↶ le remet)', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'epoque_travail'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-et-settings] table tbody tr', {timeout: 20000});
            assert.match(await p.textContent('[data-et-settings] table'), /CC BY-SA 4\.0/);
            await p.click('[data-et-tg="fleaux"] input');
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-epoque-travail')).fleaux), false);
            const txt = await p.evaluate(async () => { const h = document.createElement('div'); document.body.appendChild(h); await window.LCNDA_EXT.epoqueTravail.personInto(h, 1); const x = h.textContent; h.remove(); return x; });
            assert.ok(!/phylloxéra/.test(txt) && /Quand Pierre naît/.test(txt));
            await p.click('button:has-text("↶ Annuler")', {timeout: 5000});
            await sleep(300);
            assert.notStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-epoque-travail')).fleaux), false);
        });

        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
