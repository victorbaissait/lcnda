#!/usr/bin/env node
/* 📊 La vie en chiffres / 📚 la commune dans les livres d'époque (téléchargements, lot C) — assets/js/heritage-telech-c.js,
 * assets/css/telech-c.css, assets/data/tc-sgf-deces.json.gz (scripts/telech-c/build_sgf_deces.py), docs/telechargements-lot-c.md.
 *  1. Node : le fichier livré (source, licence, taille), les années de choléra comparées aux années voisines, le département d'un lieu,
 *     la lecture des fichiers HMD et HFD, les liens (rien d'autre que le nom de la commune ou du département dedans).
 *  2. Serveur et écran (php -S + Playwright, base temporaire, aucune requête vers Internet) : fiche d'une personne, village,
 *     Réglages (un sujet s'éteint ↶, une table HMD ouverte puis retirée ↶), registres (Listes, Monographie, à la demande).
 *  Les fichiers HMD / HFD de l'essai sont ÉCRITS ICI au format des fichiers texte des deux bases (en-tête, colonnes), avec des
 *  chiffres d'essai : les vrais fichiers demandent un compte.
 *  Fiches : Jean LEROUX (1820 Laon – 1860 Laon), Rose MARTIN (1990, vivante), Paul DURAND (sans dates ni lieu).
 *   node tests/test-telech-c.js */
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
const H = require('../assets/js/heritage-telech-c.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FILE = path.join(root, 'assets/data/tc-sgf-deces.json.gz');
const D = JSON.parse(zlib.gunzipSync(fs.readFileSync(FILE)).toString('utf8'));

/* une table HMD d'essai (format de « fltper_1x1.txt » / « bltcoh_1x1.txt ») : 1 000 enfants sur 100 000 meurent chaque année d'âge… */
function hmdText(kind, sexWord, years) {
    const out = [`France, Life tables (${kind} 1x1), ${sexWord}\tLast modified: 01 Jan 2026;  Methods Protocol: v6 (2017)`, '', '  Year          Age         mx       qx    ax      lx      dx      Lx       Tx     ex'];
    for (const y of years) {
        let lx = 100000;
        for (let a = 0; a <= 110; a++) {
            const q = a === 0 ? 0.2 : a < 5 ? 0.03 : a < 60 ? 0.008 : 0.06;
            out.push(`  ${y}  ${String(a === 110 ? '110+' : a).padStart(11)}  0.01000  ${q.toFixed(5)}  0.50  ${String(Math.round(lx)).padStart(6)}  100  100  100  ${a === 0 ? '38.50' : '30.00'}`);
            lx = lx * (1 - q);
        }
    }
    return out.join('\n');
}
const HFD = 'France, Total fertility rate\tLast modified: 01.01.2026;  Methods Protocol: v. 2 (2023)\n\n  Year      TFR\n  1946   2.9873\n  1950   2.9300\n';

(async () => {
    /* ═════════ 1. le fichier et le calcul ═════════ */
    await t('fichier livré : petit (< 100 Ko), source Insee, Licence Ouverte citée, date ; ans IX à XIV puis 1806 → 1855', async () => {
        const st = fs.statSync(FILE); assert.ok(st.size < 100e3, `${st.size} octets`); console.log(`  (${Math.round(st.size / 1024)} Ko)`);
        assert.ok(/Insee/.test(D.source) && /^https:\/\/www\.insee\.fr\//.test(D.url) && /Licence Ouverte/.test(D.licence) && /^https:\/\/www\.insee\.fr\/fr\/information\/2008466$/.test(D.licence_url) && /Licence Ouverte/.test(D.licence_quote) && D.built);
        assert.strictEqual(D.years[0], 'an IX (1800-1801)'); ['an XIII (1804-1805)', '1806', '1832', '1849', '1850', '1853', '1854', '1855'].forEach(y => assert.ok(D.years.includes(y), y));
        assert.ok(D.rows.length >= 87 && D.rows.every(r => r.v.length === D.years.length && r.deps.length), 'une valeur par année');
        assert.ok(D.years.every(y => D.tables[y]?.t && D.tables[y]?.col), 'chaque colonne dit son tableau');
        const fr = H.sgfRow(D, 'FR'); assert.strictEqual(fr.v[D.years.indexOf('1832')], 933800, 'France, 1832 : le chiffre du tableau T90');
    });
    await t('⚰️ choléra : Seine en 1832 (+74 %), Aisne en 1832 (+55 %), Bouches-du-Rhône en 1854 ; les années voisines sans autre année de choléra', async () => {
        const seine = H.sgfRow(D, '92'); assert.strictEqual(seine.n, 'Seine', 'Hauts-de-Seine → Seine');
        const c = H.crisis(D, seine, 1832); assert.ok(c.pct >= 60 && c.pct <= 90, JSON.stringify(c)); assert.deepStrictEqual(c.baseYears, [1829, 1830, 1831, 1833, 1834, 1835]);
        const a = H.crisis(D, H.sgfRow(D, '02'), 1832); assert.ok(a.pct > 40, JSON.stringify(a));
        const m = H.crisis(D, H.sgfRow(D, '13'), 1854); assert.ok(m.pct > 30 && !m.baseYears.includes(1849), JSON.stringify(m));
        assert.strictEqual(H.crisis(D, seine, 1900), null, 'hors série : rien');
        const life = H.choleraInLife(D, H.sgfRow(D, '02'), 1820, 1860); assert.deepStrictEqual(life.map(x => [x.year, x.age]), [[1832, 12], [1849, 29], [1854, 34]]);
        assert.deepStrictEqual(H.choleraInLife(D, H.sgfRow(D, '02'), 1860, 1900), [], 'né après : rien');
    });
    await t('département d’un lieu : code INSEE, nom écrit (ancien ou d’aujourd’hui), rien pour un autre pays', async () => {
        assert.strictEqual(H.depOf({insee: '02408'}), '02'); assert.strictEqual(H.depOf({insee: '2A004'}), '2A');
        assert.strictEqual(H.depOf({full: 'Allanche, Cantal, Auvergne, France'}), '15');
        assert.strictEqual(H.depOf({county: 'Côtes-du-Nord'}), '22'); assert.strictEqual(H.depOf({county: 'Côtes-d’Armor'}), '22');
        assert.strictEqual(H.depOf({country: 'Italie', full: 'Roma, Lazio'}), null); assert.strictEqual(H.depOf({insee: '97411'}), null);
    });
    await t('🧮 HMD : tables du moment et par génération, hommes / femmes ; la génération d’abord', async () => {
        const p = H.parseHMD(hmdText('period', 'Females', [1820, 1821])); assert.ok(p && p.kind === 'period' && p.sex === 'F' && p.from === 1820 && p.to === 1821 && p.country === 'France');
        const c = H.parseHMD(hmdText('cohort', 'Males', [1820])); assert.ok(c && c.kind === 'cohort' && c.sex === 'M');
        assert.strictEqual(H.parseHMD('n’importe quoi'), null);
        const s = H.survival([p, c], 1820, 'M'); assert.strictEqual(s.table.kind, 'cohort');
        assert.strictEqual(s.at(0), 100); assert.strictEqual(s.at(1), 80); assert.ok(s.at(20) < s.at(1) && s.at(60) < s.at(20));
        assert.strictEqual(H.survival([p], 1820, 'M').table.sex, 'F', 'pas de table pour son sexe : celle qui existe');
        assert.strictEqual(H.survival([p], 1900, 'F'), null);
    });
    await t('👶 HFD : TFR par année (fichier d’un pays ou fichier de tous les pays)', async () => {
        const [f] = H.parseHFD(HFD); assert.ok(f.measure === 'tfr' && f.by === 'year' && f.years[1950] === 2.93 && f.country === 'France');
        const all = H.parseHFD('Total fertility rate\n\n  Code    Year      TFR\n  FRATNP  1950   2.9300\n  CZE     1950   2.8000\n'); assert.deepStrictEqual(all.map(x => x.country).sort(), ['CZE', 'FRATNP']);
        assert.ok(H.isFrance('FRATNP') && H.isFrance('France') && !H.isFrance('CZE'));
        assert.strictEqual(H.parseHFD('rien'), null);
    });
    await t('🔗 liens : https, seulement le nom de la commune / du département ; licences dites', async () => {
        const L = H.LINKS;
        assert.match(L.joanne1869('Allanche'), /^https:\/\/archive\.org\/details\/dictionnairego00joanuoft\?q=%22Allanche%22$/);
        assert.match(L.prefets('Aisne'), /^https:\/\/archive\.org\/search\?query=.*Aisne/);
        Object.values(L).forEach(f => assert.match(f('X'), /^https:\/\//));
        const src = fs.readFileSync(path.join(root, 'assets/js/heritage-telech-c.js'), 'utf8');
        assert.ok(!/fetch\(\s*[`'"]https?:/.test(src), 'aucune requête vers Internet dans le module');
        const doc = fs.readFileSync(path.join(root, 'docs/telechargements-lot-c.md'), 'utf8');
        for (let n = 28; n <= 42; n++) assert.ok(new RegExp(`^## ${n}\\.`, 'm').test(doc), `doc : idée ${n}`);
        assert.ok(/Licence Ouverte \/ Open Licence version 2\.0/.test(doc) && /Creative Commons Attribution 4\.0/.test(doc), 'licences citées');
    });

    /* ═════════ 2. serveur et écran ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-tc-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const hmdFile = path.join(tmp, 'mltcoh_1x1.txt'); fs.writeFileSync(hmdFile, hmdText('cohort', 'Males', [1820]));
    const hfdFile = path.join(tmp, 'FRATNPtfrRR.txt'); fs.writeFileSync(hfdFile, HFD);
    const badFile = path.join(tmp, 'autre.txt'); fs.writeFileSync(badFile, 'pas une table');
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','LEROUX','male','deceased',1),(2,'Rose','MARTIN','female','living',0),(3,'Paul','DURAND','male','deceased',0)");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Laon','Aisne','France',49.5641,3.6199,'02408'),(2,'Allanche','Cantal','France',45.2294,2.9337,'15001')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
$ins->execute([1,$t('BIRT'),'1820',1820,'1820',1]); $ins->execute([1,$t('DEAT'),'1860',1860,'1860',1]);
$ins->execute([2,$t('BIRT'),'1990',1990,'1990',2]);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [], outside = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => { outside.push(r.request().url()); r.abort(); }); // pas d'Internet dans l'essai
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks, null, {timeout: 30000});
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.telechC))) { await p.addStyleTag({url: base + 'assets/css/telech-c.css'}); await p.addScriptTag({url: base + 'assets/js/heritage-telech-c.js'}); }
        await p.waitForFunction(() => !!window.LCNDA_EXT?.telechC);
        const into = (fn, arg, opts = {}) => p.evaluate(async ([f, a, o]) => { const h = document.createElement('div'); document.body.appendChild(h); const n = await window.LCNDA_EXT.telechC[f](h, a, {detached: true, ...o}); const r = [n, h.innerHTML, h.textContent]; h.remove(); return r; }, [fn, arg, opts]);

        await t('fiche de Jean LEROUX (Laon, 1820-1860) : ⚰️ 1832 dans l’Aisne, avec son âge et ↗ source Insee', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-tc-person="1"] .tc-row', {timeout: 30000});
            const txt = await p.textContent('[data-tc-person="1"]');
            assert.match(txt, /En 1832, année du choléra, Aisne a compté 18\s773 décès : \d+ % de décès en plus que les années voisines\. Il avait 12 ans\./);
            const a = await p.$$eval('[data-tc-person="1"] a', l => l.map(x => [x.href, x.target, x.rel]));
            assert.ok(a.length && a.every(([h, tg, r]) => /^https:\/\//.test(h) && tg === '_blank' && /noopener/.test(r)) && a.some(([h]) => /insee\.fr/.test(h)));
            assert.strictEqual(await p.$eval('[data-tc-person="1"]', h => h.closest('section.card').hidden), false);
        });
        await t('Paul DURAND (sans dates ni lieu) et Rose MARTIN (née en 1990) : bloc caché', async () => {
            for (const id of [3, 2]) {
                await p.evaluate(i => { const A = window.LCNDA_APP; A.state.currentPersonId = i; A.setModule('personnes'); }, id);
                await p.waitForSelector(`[data-tc-person="${id}"]`, {state: 'attached', timeout: 20000}); await sleep(1500);
                assert.strictEqual(await p.$eval(`[data-tc-person="${id}"]`, h => [h.closest('section.card').hidden, h.textContent.trim()].join('|')), 'true|');
            }
        });
        await t('lieu : 📚 liens d’époque (Joanne 1869, guides, préfet de l’Aisne) + ⚰️ choléra ; un lieu sans nom : rien', async () => {
            const [n, html, txt] = await into('placeInto', {id: 1, name: 'Laon', insee: '02408'});
            assert.strictEqual(n, 2); assert.match(txt, /Laon dans les livres d’époque/); assert.match(txt, /année du choléra, Aisne/);
            assert.match(html, /archive\.org\/details\/dictionnairego00joanuoft\?q=%22Laon%22/); assert.match(html, /statistique%20du%20d%C3%A9partement|statistique\+du/i); assert.match(html, /Aisne/);
            const none = await into('placeInto', {id: 0, name: ''}); assert.strictEqual(none[0], 0);
            const abroad = await into('placeInto', {id: 9, name: 'Roma', country: 'Italie'}, {parts: ['cholera']}); assert.strictEqual(abroad[0], 0);
        });
        await t('Réglages → 📊 La vie en chiffres : un sujet s’éteint (↶) ; une table HMD et une HFD ouvertes → 🧮 et 👶 sur la fiche ; retirer (↶)', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'telech_c'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-tc-settings-page] table tbody tr', {timeout: 20000});
            const txt = await p.textContent('[data-tc-settings-page]');
            assert.match(txt, /Human Mortality Database/); assert.match(txt, /Licence Ouverte 2\.0/); assert.match(txt, /Aucune table ouverte/);
            assert.strictEqual(await p.$$eval('[data-tc-settings-page] tbody tr', r => r.length), 16);
            await p.click('[data-tc-tg="cholera"] input'); await sleep(200);
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-telech-c')).cholera), false);
            await p.locator('button:has-text("↶ Annuler")').last().click({timeout: 5000}); await sleep(300);
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-telech-c')).cholera), true);
            await p.setInputFiles('[data-tc-file]', [hmdFile, hfdFile, badFile]); await sleep(800);
            assert.strictEqual(await p.$$eval('[data-tc-tables] li', l => l.length), 2);
            const [n, , ptxt] = await into('personInto', 1);
            assert.strictEqual(n, 3, ptxt); assert.match(ptxt, /Sur 100 enfants nés en 1820 \(France\), 80 atteignaient 1 an, \d+ atteignaient 20 ans/); assert.match(ptxt, /Il a vécu 40 ans : \d+ sur 100 de sa génération/);
            await p.click('[data-tc-del]'); await sleep(200); assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.telechC.tables().length), 1);
            await p.locator('button:has-text("↶ Annuler")').last().click({timeout: 5000}); await sleep(300);
            assert.strictEqual(await p.evaluate(() => window.LCNDA_EXT.telechC.tables().length), 2);
        });
        await t('registres : Liste (colonne Source), Monographie, à la demande, bloc et onglet Réglages', async () => {
            const r = await p.evaluate(async () => {
                const E = window.LCNDA_EXT, L = E.dataLists.find(d => d.id === 'tc_sgf_deces'), rows = await L.load();
                const out = {rows: rows.length, src: L.fields.some(f => f.key === 'src' && f.type === 'url') && /^https:\/\//.test(rows[0].src), y1832: rows.find(x => x.dep === 'Seine' && x.period === '1832')};
                const mh = document.createElement('div'); document.body.appendChild(mh);
                out.mono = [await E.monographSections.find(s => s.id === 'tc_livres').render({id: 2, name: 'Allanche', county: 'Cantal', country: 'France'}, mh, {}), mh.textContent]; mh.remove();
                const h = document.createElement('div'); document.body.appendChild(h);
                await E.dataSources.find(d => d.id === 'tc_p_cholera').run({person: {id: 1}}, h); out.ds = h.textContent;
                await E.dataSources.find(d => d.id === 'tc_liens').run({}, h); out.links = h.querySelectorAll('a[target=_blank]').length; h.remove();
                out.block = window.LCNDA_APP.defaultPersonBlocks.some(b => b[0] === 'telech_c');
                out.tab = window.LCNDA_APP.defaultMaintenanceTabs.some(b => b[0] === 'telech_c');
                return out;
            });
            assert.ok(r.rows > 4000 && r.src, JSON.stringify(r).slice(0, 200)); assert.ok(r.y1832.deaths === 53382 && r.y1832.vs >= 60, JSON.stringify(r.y1832));
            assert.strictEqual(r.mono[0], true); assert.match(r.mono[1], /Allanche dans les livres d’époque/);
            assert.match(r.ds, /1832/); assert.strictEqual(r.links, 6); assert.ok(r.block && r.tab);
            const ts = fs.readFileSync(path.join(root, 'assets/js/heritage-tout-sur.js'), 'utf8'); assert.match(ts, /\[\/\^tc_p_\/, 'telech_c'\]/);
            const man = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/manifest.json'), 'utf8')); assert.ok(man.packs['tc-sgf-deces']?.licence && man.packs['tc-sgf-deces'].script === 'scripts/telech-c', 'Réglages → 🗂 Données');
        });
        await t('rien n’est parti sur Internet ; aucune erreur JavaScript', async () => {
            assert.deepStrictEqual(outside.filter(u => /archive\.org|gallica|insee|mortality|humanfertility|nypl/.test(u)), []);
            assert.deepStrictEqual(errs, []);
        });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
