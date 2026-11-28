#!/usr/bin/env node
/* 🧭 Mémoire et vieux papiers + 🌐 Traduction hors ligne (lot D « téléchargements ») — assets/js/heritage-telech-d.js,
 * assets/js/heritage-telech-d-traduire.js, lib/telech_d.php, lib/telech_d_traduction.php, scripts/telech-d/*, assets/data/td-*.json.gz.
 *  1. Node : les fichiers livrés (licence, source, date, petits) et le calcul (soldat mort à la guerre, nécropoles près de Verdun,
 *     camps pendant la guerre, jeux de Bretagne, musique de l'année du mariage, almanachs de l'année, émigration, latin → aide).
 *  2. Serveur et écran (php -S + Playwright, base temporaire) : rien ne part sur Internet (GENEALOGY_TEST=1 + LCNDA_TEST_TD_DIR).
 *     Réponse VRAIE enregistrée le 2026-11-25 : loc.gov (photos Ellis Island) ; écrites ICI au format des API, marquées « essai » :
 *     Wikidata (commune → article), l'article de Wikipédia (HTML), Wikisource. La traduction : GENEALOGY_TD_SIMULATE=1 (rien n'est
 *     téléchargé, la « traduction » est « [FR] … »).
 *  Fiches : Jean MAZAUD (1890 Allanche – 1916 Verdun, soldat), Marie LACOMBE (1880 Plouaret, mariée en 1905), Paul DURAND (1900 Gurs,
 *  y vit en 1941), Pierre DURAND (1880 Allanche, arrivé à New York en 1907), Luc MAZAUD (vivant, New York : rien ne part pour lui).
 *   node tests/test-telech-d.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const zlib = require('zlib');
const crypto = require('crypto');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
const H = require('../assets/js/heritage-telech-d.js');
const TR = require('../assets/js/heritage-telech-d-traduire.js');
const FIX = path.join(__dirname, 'fixtures', 'telech-d');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const raw = n => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'assets/data', `${n}.json.gz`))).toString('utf8'));
const rows = n => H.table(raw(n));
const sha10 = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
const P = {allanche: {id: 1, name: 'Allanche', lat: 45.2294, lon: 2.9337}, plouaret: {id: 2, name: 'Plouaret', lat: 48.615, lon: -3.483}, verdun: {id: 5, name: 'Verdun', lat: 49.1598, lon: 5.3844},
    gurs: {id: 6, name: 'Gurs', lat: 43.272, lon: -0.746}, ny: {id: 7, name: 'New York', lat: 40.7128, lon: -74.006, country: 'United States'}};
const ev = (tag, year, p) => ({tag, year, place_id: p.id, lat: p.lat, lon: p.lon, place: p.name, country: p.country || 'France'});
const JEAN = {ok: true, person: {id: 1, gender: 'male', birth: 1890, death: 1916}, places: [P.allanche, P.verdun], events: [ev('BIRT', 1890, P.allanche), ev('DEAT', 1916, P.verdun)]};
const MARIE = {ok: true, person: {id: 2, gender: 'female', birth: 1880, death: 1950}, places: [P.plouaret], events: [ev('BIRT', 1880, P.plouaret), ev('MARR', 1905, P.plouaret)]};
const PAUL = {ok: true, person: {id: 3, gender: 'male', birth: 1900, death: 1960}, places: [P.gurs], events: [ev('BIRT', 1900, P.gurs), ev('RESI', 1941, P.gurs)]};

(async () => {
    /* ═════════ 1. les fichiers et le calcul ═════════ */
    await t('fichiers livrés : présents, petits (< 15 Mo), avec source, adresse, licence ouverte et date ; manifeste à jour', async () => {
        const man = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/manifest.json'), 'utf8'));
        for (const n of ['td-necropoles', 'td-camps', 'td-jeux', 'td-latin', 'td-almanachs']) {
            const f = path.join(root, 'assets/data', `${n}.json.gz`); assert.ok(fs.existsSync(f), n);
            assert.ok(fs.statSync(f).size < 15e6, n);
            const m = raw(n); assert.ok(m.source && m.url && m.licence && /^\d{4}-\d\d-\d\d$/.test(m.built), n); assert.ok(m.rows.length > 0, n);
            assert.ok(man.packs[n] && man.packs[n].rows === m.rows.length && man.packs[n].script === 'scripts/telech-d', `${n} dans le manifeste`);
        }
        assert.match(raw('td-latin').licence, /CC BY-SA 4\.0/); assert.match(raw('td-necropoles').licence, /CC0/); assert.match(raw('td-camps').licence, /CC0/);
        assert.ok(rows('td-latin').every(r => /^https:\/\/fr\.wiktionary\.org\/wiki\//.test(r.url)), 'chaque mot a sa page du Wiktionnaire');
        assert.ok(rows('td-almanachs').every(r => r.y <= 1925), 'almanachs : seulement jusqu’en 1925');
        assert.ok(rows('td-camps').every(r => !/MAZAUD|LACOMBE/.test(r.n)), 'des lieux, pas de personnes');
    });
    await t('⚱️ calcul : Jean, mort en 1916 à Verdun = soldat ; les nécropoles à moins de 25 km (Faubourg-Pavé…), lien MémorialGenWeb', async () => {
        const W = H.warDead(JEAN); assert.deepStrictEqual([W.year, W.war], [1916, '1914-1918']);
        assert.strictEqual(H.warDead(MARIE), null, 'une femme morte en 1950 : rien');
        assert.strictEqual(H.warDead({person: {gender: 'male', birth: 1850, death: 1916}, events: []}), null, '66 ans : pas soldat');
        const g = H.gravesFor(rows('td-necropoles'), JEAN);
        assert.ok(g.list.length >= 5 && g.list[0].km < 3, JSON.stringify(g.list[0]));
        assert.ok(g.list.some(x => /Faubourg-Pavé/.test(x.r.n) && /^http:\/\/www\.memorialgenweb\.org\//.test(x.r.mgw)));
        assert.strictEqual(g.buried, false);
    });
    await t('🕯 calcul : Paul vit à Gurs en 1941 → le camp de Gurs ; Marie (morte en 1950, Plouaret) → aucun camp ; né après 1946 → rien', async () => {
        const C = H.campsFor(rows('td-camps'), PAUL);
        assert.ok(C.length && /Gurs/.test(C[0].r.n), JSON.stringify(C.slice(0, 2)));
        assert.deepStrictEqual(H.campsFor(rows('td-camps'), MARIE), []);
        assert.deepStrictEqual(H.campsFor(rows('td-camps'), {person: {birth: 1960}, events: [ev('BIRT', 1960, P.gurs)]}), []);
    });
    await t('🎲 🎶 📅 calcul : jeux bretons près de Plouaret ; 78 tours de 1905 (mariage de Marie) ; almanachs de 1880 ; liens Gallica', async () => {
        const G = H.gamesFor(rows('td-jeux'), P.plouaret); assert.ok(G.some(x => /Trégor|Léon|Bretagne|palet/i.test(`${x.r.n} ${x.r.region} ${x.r.hint}`)), JSON.stringify(G.map(x => x.r.n)));
        assert.strictEqual(H.weddingYear(MARIE), 1905);
        const S = H.recordsOfYear(rows('l9a-sons'), 1905); assert.ok(S.length > 0 && S.every(r => Math.abs(r.y - 1905) <= 1));
        const A = H.almanacsOf(rows('td-almanachs'), 1880); assert.ok(A.length > 0 && A.every(r => Math.abs(r.y - 1880) <= 1));
        assert.match(H.gallicaSearch('almanach vermot', 1905), /^https:\/\/gallica\.bnf\.fr\/services\/engine\/search\/sru\?operation=searchRetrieve/);
        assert.deepStrictEqual(H.emigration({events: [ev('IMMI', 1907, P.ny)]}).year, 1907); assert.strictEqual(H.emigration(MARIE), null);
    });
    await t('📜 calcul : le latin du Wiktionnaire → entrées de l’aide à la lecture (langue la, source Wiktionnaire) ; 🌐 la langue d’un texte', async () => {
        const E = H.latinEntries(rows('td-latin'));
        assert.ok(E.length > 150 && E.every(e => e.lang === 'la' && e.src === 'Wiktionnaire' && e.t && e.d && ['bapteme', 'mariage', 'sepulture', 'general'].includes(e.a)));
        assert.strictEqual(TR.detect('Im Jahre 1823 den 14ten Februar ist getauft worden das Kind des Vaters und der Mutter'), 'de');
        assert.strictEqual(TR.detect('Il giorno 3 marzo è nato il figlio di padre e madre della parrocchia'), 'it');
        assert.strictEqual(TR.detect('Anno domini die 3 mensis martii baptizatus est filius legitimus'), 'la');
        assert.strictEqual(TR.detect('Le 3 mars a été baptisé le fils de Pierre et de la fille'), 'fr');
        assert.deepStrictEqual([TR.langOfOcr('deu'), TR.langOfOcr('fra+lat'), TR.langOfOcr('fra')], ['de', 'la', 'fr']);
    });

    /* ═════════ 2. serveur et écran ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-td-'));
    const net0 = path.join(tmp, 'net'); fs.mkdirSync(net0);
    const calls = () => (fs.existsSync(path.join(net0, 'calls.log')) ? fs.readFileSync(path.join(net0, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean) : []);
    // loc.gov : la vraie réponse, plus une photo d'essai « restreinte » et une d'essai trop récente (à écarter)
    const loc = JSON.parse(fs.readFileSync(path.join(FIX, 'loc-ellis.json'), 'utf8'));
    loc.results.push({title: 'Photo restreinte (essai)', date: '1910-01-01', id: 'http://www.loc.gov/item/essai1/', image_url: ['https://tile.loc.gov/essai1.jpg'], rights_advisory: 'Publication may be restricted. (essai)'},
        {title: 'Photo de 1950 (essai)', date: '1950-01-01', id: 'http://www.loc.gov/item/essai2/', image_url: ['https://tile.loc.gov/essai2.jpg'], rights_advisory: 'No known restrictions on publication.'});
    fs.writeFileSync(path.join(net0, `loc-${sha10('Ellis Island immigrants19021912')}.json`), JSON.stringify(loc));
    // Wikidata : la commune 15001 → son article (format SPARQL), Wikipédia (HTML Parsoid simplifié, essai), Wikisource (essai)
    fs.writeFileSync(path.join(net0, 'wd-com-15001.json'), JSON.stringify({head: {vars: ['a']}, results: {bindings: [{a: {type: 'uri', value: 'https://fr.wikipedia.org/wiki/Allanche'}}]}}));
    fs.writeFileSync(path.join(net0, `wp-${sha10('Allanche')}.html`), '<!DOCTYPE html><html about="https://fr.wikipedia.org/wiki/Special:Redirect/revision/123456"><body><section><table class="infobox"><tr><td>Infobox (essai)</td></tr></table><p>Allanche est une commune française (essai).<sup class="reference">[1]</sup></p></section><section><h2>Toponymie</h2><p>Le nom vient de… (essai)</p></section><section><h2>Histoire</h2><p>Au Moyen Âge… (essai)</p><h3>Époque moderne</h3><p>Foires aux bestiaux (essai).</p></section><section><h2>Notes et références</h2><p>Référence à ne pas garder (essai)</p></section></body></html>');
    fs.writeFileSync(path.join(net0, 'wd-ws-15001.json'), JSON.stringify({head: {}, results: {bindings: [{w: {value: 'http://www.wikidata.org/entity/Q999001'}, wl: {value: 'Notice sur Allanche (essai)'}, ws: {value: 'https://fr.wikisource.org/wiki/Notice_sur_Allanche'}, d: {value: '1862-01-01T00:00:00Z'}, al: {value: 'Auteur d’essai'}}]}}));
    fs.writeFileSync(path.join(net0, `ws-${sha10('Allanche')}.json`), JSON.stringify({batchcomplete: true, query: {search: [{title: 'Voyage à Allanche (1845)'}, {title: 'Notice sur Allanche/Chapitre 1'}]}}));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1', LCNDA_TEST_TD_DIR: net0, GENEALOGY_TD_SIMULATE: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1),(2,'Marie','LACOMBE','female','deceased',0),(3,'Paul','DURAND','male','deceased',0),(4,'Luc','MAZAUD','male','living',0),(5,'Pierre','DURAND','male','deceased',0)");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(1,'Allanche','Cantal','France',45.2294,2.9337,'15001'),(2,'Plouaret','Côtes-d''Armor','France',48.615,-3.483,'22207'),(5,'Verdun','Meuse','France',49.1598,5.3844,'55545'),(6,'Gurs','Pyrénées-Atlantiques','France',43.272,-0.746,'64249'),(7,'New York','New York','United States',40.7128,-74.006,'')");
$t = function ($tag) use ($pdo) { $i = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn(); return $i ?: (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT' LIMIT 1")->fetchColumn(); };
$ins = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
foreach ([[1,'BIRT',1890,1],[1,'DEAT',1916,5],[2,'BIRT',1880,2],[2,'MARR',1905,2],[2,'DEAT',1950,2],[3,'BIRT',1900,6],[3,'RESI',1941,6],[3,'DEAT',1960,6],[4,'BIRT',1990,7],[5,'BIRT',1880,1],[5,'IMMI',1907,7],[5,'DEAT',1940,7]] as [$p,$g,$y,$pl]) { $ins->execute([$p,$t($g),(string)$y,$y,(string)$y,$pl]); }
$pdo->prepare("INSERT INTO notes(entity_type,entity_id,title,body) VALUES('person',2,'Brief','Im Jahre 1905 ist die Tochter des Vaters und der Mutter in der Kirche getauft worden und mit dem Sohn')")->execute();
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
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort()); // pas d'Internet dans l'essai
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultPersonBlocks, null, {timeout: 30000});
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.telechD))) { await p.addStyleTag({url: base + 'assets/css/telech-d.css'}); await p.addScriptTag({url: base + 'assets/js/heritage-telech-d.js'}); await p.addScriptTag({url: base + 'assets/js/heritage-telech-d-traduire.js'}); }
        await p.waitForFunction(() => !!window.LCNDA_EXT?.telechD && !!window.LCNDA_EXT?.telechTraduire);
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [x, q]);
        const post = (x, b = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, {}, {method: 'POST', body: z}).then(r => r?.result || r).catch(e => ({error: e.message})), [x, b]);
        const into = (fn, arg, opts = {}) => p.evaluate(async ([f, a, o]) => { const h = document.createElement('div'); document.body.appendChild(h); const n = await window.LCNDA_EXT.telechD[f](h, a, {detached: true, ...o}); const r = [n, h.innerHTML, h.textContent]; h.remove(); return r; }, [fn, arg, opts]);

        await t('serveur 📷 : loc.gov (vraie réponse) → seulement « No known restrictions » et ≤ 1925 ; fiche vivante → rien ne part', async () => {
            const r = await api('td_loc', {kind: 'ellis', from: 1902, to: 1912, pid: 5});
            assert.strictEqual(r.ok, true, JSON.stringify(r)); assert.strictEqual(r.items.length, 5, JSON.stringify(r.items.map(i => i.title)));
            assert.ok(r.items.every(i => /^https:\/\/www\.loc\.gov\/item\//.test(i.url) && /No known restrictions/.test(i.rights) && i.date <= 1925 && /^https:\/\/tile\.loc\.gov\//.test(i.thumb)));
            assert.match(calls().at(-1), /www\.loc\.gov\/photos\/\?q=Ellis\+Island\+immigrants&dates=1902%2F1912&fo=json/);
            const n0 = calls().length; const priv = await api('td_loc', {kind: 'ellis', from: 1902, to: 1912, pid: 4});
            assert.strictEqual(priv.private, true); assert.deepStrictEqual(priv.items, []); assert.strictEqual(calls().length, n0);
            assert.ok(!calls().some(c => /MAZAUD|LACOMBE|DURAND/i.test(c)), 'aucun nom de personne ne part');
        });
        await t('serveur 📖 : l’article de Wikipédia gardé entier (sections, sans infobox ni références), puis relu sans Internet ; 📚 Wikisource', async () => {
            const w = await api('td_wiki', {insee: '15001'});
            assert.strictEqual(w.ok, true, JSON.stringify(w)); assert.strictEqual(w.title, 'Allanche'); assert.strictEqual(w.revid, 123456);
            assert.deepStrictEqual(w.sections.map(s => s.h), ['', 'Toponymie', 'Histoire', 'Époque moderne']);
            assert.ok(!JSON.stringify(w.sections).includes('Infobox') && !JSON.stringify(w.sections).includes('Référence à ne pas garder') && !JSON.stringify(w.sections).includes('[1]'));
            assert.strictEqual(w.licence, 'CC BY-SA 4.0'); assert.match(w.history, /action=history/);
            const n0 = calls().length; const again = await api('td_wiki', {insee: '15001'}); assert.strictEqual(calls().length, n0, 'gardé'); assert.strictEqual(again.cached, true);
            const ab = await api('td_about'); assert.ok(ab.wiki.some(x => x.title === 'Allanche'), 'listé dans Réglages');
            const s = await api('td_wikisource', {insee: '15001', name: 'Allanche'});
            assert.strictEqual(s.ok, true, JSON.stringify(s)); assert.deepStrictEqual(s.items.map(i => i.title), ['Notice sur Allanche (essai)', 'Voyage à Allanche (1845)'], 'pas les sous-pages');
            assert.strictEqual(s.items[1].year, 1845);
        });
        await t('serveur 🗑 : vider les réponses gardées, ↶ les remettre', async () => {
            const c = await post('td_cache_clear'); assert.ok(c.removed >= 3, JSON.stringify(c));
            assert.strictEqual((await api('td_about')).cache.count, 0);
            const r = await post('td_cache_restore', {token: c.token}); assert.strictEqual(r.restored, c.removed);
        });
        await t('🌐 traduction (essai) : pas installée → le dire ; latin → pas de modèle, dit honnêtement ; installer (file de Réglages) → traduire ; ↶ retirer', async () => {
            const s0 = await api('td_tr_status'); assert.strictEqual(s0.langs.de.installed, false); assert.strictEqual(s0.latin, false);
            assert.match(s0.sources.engine.licence, /MIT/); assert.match(s0.sources.opus.licence, /CC BY 4\.0/);
            const no = await post('td_tr_translate', {text: 'Guten Tag', from: 'de'}); assert.strictEqual(no.code, 'not_installed');
            const la = await post('td_tr_translate', {text: 'filius legitimus', from: 'la'}); assert.strictEqual(la.code, 'latin');
            await p.evaluate(() => window.LCNDA_EXT.telechTraduire.install('de'));
            const s1 = await api('td_tr_status'); assert.strictEqual(s1.langs.de.installed, true); assert.ok(s1.models['de-en'] && s1.models['en-fr']);
            const tr = await post('td_tr_translate', {text: 'Guten Tag', from: 'de'}); assert.strictEqual(tr.text, '[FR] Guten Tag'); assert.deepStrictEqual(tr.route, ['de', 'en', 'fr']);
            const info = await api('td_tr_dl_info'); assert.ok(info.packs.it.size > 0);
            await post('td_tr_dl_start', {kind: 'it'}).then(async r => { for (let i = 0; i < 60; i++) { const s = await post('td_tr_dl_step', {id: r.id}); if (s.done) break; } await post('td_tr_pack_finish', {id: r.id}); });
            const u = await post('td_tr_pack_undo', {kind: 'it'}); assert.deepStrictEqual(u.removed, ['it-en'], 'en → fr reste : il sert à l’allemand');
            assert.strictEqual((await api('td_tr_status')).langs.de.installed, true);
        });
        await t('🌐 atelier : « 🌐 Traduire hors ligne » à côté de l’aide (langue allemande), caché en français ; traduit la sélection ; « ＋ Garder »', async () => {
            const res = await p.evaluate(async () => {
                const d = document.createElement('dialog'); d.className = 'h-tx-dlg';
                d.innerHTML = '<select data-tx-lang><option value="fra">fr</option><option value="deu">de</option></select><button data-tx-cmd="aide">📖 Aide</button><div class="h-tx-right"><div class="h-tx-editor"><textarea data-tx-body>Im Jahre 1823 ist getauft worden das Kind des Vaters</textarea></div></div>';
                const data = {translation: ''}; d.txApi = {get: () => ({data}), touch: () => {}};
                document.body.appendChild(d); d.show();
                await new Promise(r => setTimeout(r, 300));
                const b = d.querySelector('[data-td-translate]'); const out = {exists: !!b};
                d.querySelector('[data-tx-lang]').value = 'fra'; d.querySelector('[data-tx-lang]').dispatchEvent(new Event('change', {bubbles: true}));
                out.hiddenFr = b.hidden;
                d.querySelector('[data-tx-lang]').value = 'deu'; d.querySelector('[data-tx-lang]').dispatchEvent(new Event('change', {bubbles: true}));
                out.hiddenDe = b.hidden;
                const ta = d.querySelector('[data-tx-body]'); ta.setSelectionRange(0, 13);
                b.click();
                for (let i = 0; i < 50 && !d.querySelector('.td-tr-out'); i++) await new Promise(r => setTimeout(r, 100));
                out.text = d.querySelector('.td-tr-out')?.value; out.editorHidden = d.querySelector('.h-tx-editor').hidden;
                d.querySelector('[data-tdt-keep]').click(); out.kept = data.translation;
                d.remove(); return out;
            });
            assert.deepStrictEqual(res, {exists: true, hiddenFr: true, hiddenDe: false, text: '[FR] Im Jahre 1823', editorHidden: true, kept: '[FR] Im Jahre 1823'});
        });
        await t('📜 aide à la lecture : un mot du Wiktionnaire (absent du fichier latin) est trouvé, source « Wiktionnaire » ; dictionnaire à la demande', async () => {
            const word = rows('td-latin').map(r => r.t).find(w => !fs.readFileSync(path.join(root, 'assets/js/aide-langues/la.js'), 'utf8').includes(`'${w}`) && /^[a-z]{5,}$/.test(w));
            assert.ok(word);
            await p.waitForFunction(() => (window.LCNDA_EXT.aideExtraEntries || []).length > 100, null, {timeout: 15000});
            const hit = await p.evaluate(w => (window.LCNDA_AIDE_LECTURE?.search(w, {lang: 'la'}) || []).filter(r => r.type === 'entry').map(r => [r.item.t, r.item.src])[0], word);
            assert.deepStrictEqual(hit, [word, 'Wiktionnaire']);
            const html = await p.evaluate(async () => { const S = window.LCNDA_EXT.dataSources.find(s => s.id === 'td_latin_dico'); const h = document.createElement('div'); document.body.appendChild(h); await S.run({}, h); const q = h.querySelector('input'); q.value = 'filius'; q.dispatchEvent(new Event('input')); const r = h.innerHTML; h.remove(); return r; });
            assert.match(html, /filius/); assert.match(html, /fr\.wiktionary\.org\/wiki\/filius/); assert.match(html, /CC BY-SA 4\.0/);
        });

        await t('fiche de Jean MAZAUD : ⚱️ mort à Verdun en 1916, les nécropoles, MémorialGenWeb ; ↗ source ; ▸ plus', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; A.setModule('personnes'); });
            await p.waitForSelector('[data-td-person="1"] .td-row', {timeout: 30000});
            const txt = await p.textContent('[data-td-person="1"]');
            assert.match(txt, /Il est mort à Verdun en 1916 : \d+ nécropoles et cimetières de guerre à moins de 25 km/);
            assert.match(txt, /▸ plus/); assert.match(txt, /↗ source/);
            const html = await p.innerHTML('[data-td-person="1"]'); assert.match(html, /memorialgenweb\.org/); assert.match(html, /target="_blank" rel="noopener noreferrer"/);
            assert.strictEqual(await p.evaluate(() => document.querySelector('[data-td-person="1"]').closest('section.card').hidden), false);
        });
        await t('fiche de Marie LACOMBE : 🎲 jeux bretons, 🎶 78 tours de 1905, 📅 almanachs ; 🌐 sur sa note en allemand → traduite', async () => {
            const [n, , txt] = await into('personInto', 2);
            assert.ok(n >= 3, txt); assert.match(txt, /Les jeux de son pays/); assert.match(txt, /L’année de leur mariage \(1905\)/); assert.match(txt, /almanachs de l’année de sa naissance \(1880\)/);
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.currentPersonId = 2; A.setModule('personnes'); });
            await p.waitForSelector('.note-item .td-note-tr', {timeout: 30000});
            await p.click('.note-item .td-note-tr');
            await p.waitForSelector('dialog.td-tr-dlg .td-tr-out', {timeout: 15000});
            assert.match(await p.inputValue('dialog.td-tr-dlg .td-tr-out'), /^\[FR\] Im Jahre 1905/);
            await p.click('dialog.td-tr-dlg .modal-head [data-h-close]'); // la fenêtre commune : × en haut à droite
        });
        await t('Paul DURAND : 🕯 le camp de Gurs (1939-1943) ; Pierre DURAND : 📷 photos libres d’Ellis Island ; Luc (vivant) : rien en ligne', async () => {
            const [, , paul] = await into('personInto', 3); assert.match(paul, /Pendant la guerre, près des lieux de sa vie : camp de Gurs/);
            const [, h2, pierre] = await into('personInto', 5); assert.match(pierre, /Parti en Amérique \(New York\)/); assert.match(h2, /tile\.loc\.gov/);
            const n0 = calls().length; const [n4] = await into('personInto', 4, {private: true, parts: ['emigration']}); assert.strictEqual(n4, 0); assert.strictEqual(calls().length, n0);
        });
        await t('village, monographie, listes, cartes, à la demande, Où chercher, Réglages (interrupteur ↶, À propos, traduction)', async () => {
            const [n, html] = await into('placeInto', {id: 5, name: 'Verdun', lat: 49.1598, lon: 5.3844, insee: '55545'}, {parts: ['sepultures', 'camps', 'jeux']});
            assert.ok(n >= 1); assert.match(html, /Faubourg-Pavé/);
            const reg = await p.evaluate(() => { const E = window.LCNDA_EXT; return {mono: E.monographSections.filter(s => /^td_/.test(s.id)).length, lists: E.dataLists.filter(s => /^td_/.test(s.id)).map(s => s.id), maps: E.mapLayerSources.filter(s => /^td_/.test(s.id)).length,
                ds: E.dataSources.filter(s => /^td/.test(s.id)).length, ouc: (window.LCNDA_OUC_MONDE?.SITES || []).some(s => s.key === 'td_relais_cybergeo'), fam: (E.listesMaj?.families || []).some(f => f.id === 'td_tr')}; });
            assert.deepStrictEqual(reg.lists, ['td_necropoles', 'td_camps', 'td_jeux', 'td_latin', 'td_almanachs']); assert.ok(reg.mono === 5 && reg.maps === 3 && reg.ds >= 14 && reg.fam, JSON.stringify(reg));
            const L = await p.evaluate(async () => { const d = window.LCNDA_EXT.dataLists.find(x => x.id === 'td_necropoles'); const r = await d.load(); return [r.length, r[0].src]; });
            assert.ok(L[0] > 500); assert.match(L[1], /^https:\/\/www\.wikidata\.org\/wiki\/Q/);
            const M = await p.evaluate(async () => (await window.LCNDA_EXT.mapLayerSources.find(x => x.id === 'td_camps').run({bbox: [-1, 43, 0, 44]})).features.map(f => f.label));
            assert.ok(M.some(x => /Gurs/.test(x)));
            await p.evaluate(() => window.LCNDA_EXT.telechD.openSettings());
            await p.waitForSelector('[data-td-settings-page] [data-tdt-inst], [data-td-settings-page] [data-tdt-undo]', {timeout: 20000});
            const st = await p.textContent('[data-td-settings-page]');
            assert.match(st, /CC BY-SA 4\.0/); assert.match(st, /Pas de modèle latin dans Argos Translate/); assert.match(st, /Kiwix/); assert.match(st, /Allanche/);
            await p.click('[data-td-tg="jeux"] input');
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-telech-d')).jeux), false);
            await p.waitForSelector('.undo-toast button, [data-undo], .toast button', {timeout: 5000}).then(b => b.click()).catch(() => {});
            await sleep(300);
            assert.notStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-telech-d') || '{}').jeux), false, '↶ Annuler le rallume');
        });
        await t('aucune erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill();
        try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (_) {}
    }
    console.log(fails ? `${fails} essai(s) raté(s).` : 'Mémoire et vieux papiers : tout va bien.');
    process.exit(fails ? 1 : 0);
})();
