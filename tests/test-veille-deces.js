#!/usr/bin/env node
/* ⚰️ Veille des décès (lib/veille_deces.php, assets/js/heritage-veille-deces.js, assets/css/veille-synchro.css).
 * Une base INSEE MINUSCULE est fabriquée ici (quelques lignes, deux « fichiers » importés) : rien ne vient d'Internet.
 *  0. Node : la phrase « Décès possible : … », les liens de recherche des avis de décès (pas de données copiées) ; aucun appel réseau
 *     dans le serveur ni dans l'écran ;
 *  1. serveur : quelles fiches sont surveillées (vivantes ou inconnues, nées il y a moins de 110 ans, sans décès) ; nom exact et nom
 *     proche (MAZEAUD / MAZAUD) ; un nouveau fichier → seulement ses lignes ; « Vérifier maintenant » → tout ; « ✗ Ce n'est pas
 *     elle » retenu ; « ✓ C'est elle » → décès + source INSEE + fiche décédée ; ↶ remet tout comme avant ;
 *  2. écran : Réglages → ⚰️ Veille des décès (phrase, ↗ source, ✓, ↶, ✗), l'interrupteur (allumé par défaut seulement si la base
 *     INSEE est installée), le message au démarrage, le widget du tableau de bord, « Où chercher » (liens d'avis de décès).
 *   node tests/test-veille-deces.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn, spawnSync} = require('child_process');
const root = path.join(__dirname, '..');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const VD = require('../assets/js/heritage-veille-deces.js');

(async () => {
    /* ═════════ 0. Node ═════════ */
    await t('la phrase d’un décès possible, au féminin et au masculin', async () => {
        const it = {person: {name: 'Jeanne LACOMBE', gender: 'female'}, insee: {naissance: '12 mars 1935', lieu_naissance: 'TULLE (19)', deces: '3 octobre 2026', lieu_deces: 'BRIVE-LA-GAILLARDE (19)'}};
        assert.strictEqual(VD.sentence(it), 'Décès possible : Jeanne LACOMBE, née le 12 mars 1935 à TULLE (19), décédée le 3 octobre 2026 à BRIVE-LA-GAILLARDE (19)');
        assert.strictEqual(VD.yesLabel(it), '✓ C’est elle : ajouter le décès (source INSEE)'); assert.strictEqual(VD.noLabel(it), '✗ Ce n’est pas elle');
        assert.match(VD.sentence({person: {name: 'Paul MAZAUD', gender: 'male'}, insee: {naissance: '1950', deces: '2026'}}), /né le 1950, décédé le 2026$/);
    });
    await t('avis de décès des journaux : seulement un lien de recherche (nom + commune), jamais de données copiées', async () => {
        assert.deepStrictEqual(VD.OBIT.map(o => o[2]), ['libramemoria.com', 'dansnoscoeurs.fr', 'avis-de-deces.net', 'inmemori.com']);
        const u = new URL(VD.obitUrl('libramemoria.com', {first: 'Jeanne', last: 'LACOMBE', place: 'Tulle, Corrèze'}));
        assert.strictEqual(u.hostname, 'www.google.com'); assert.strictEqual(u.searchParams.get('q'), 'site:libramemoria.com "Jeanne LACOMBE" Tulle');
    });
    await t('rien n’est envoyé sur Internet : ni le serveur ni l’écran n’appellent un autre site', async () => {
        const php = fs.readFileSync(path.join(root, 'lib/veille_deces.php'), 'utf8');
        assert.ok(!/curl_|file_get_contents\(\s*['"]http|stream_context_create|wiki_get_json|insee_maj_http/.test(php));
        const js = fs.readFileSync(path.join(root, 'assets/js/heritage-veille-deces.js'), 'utf8');
        assert.ok(!/fetch\(\s*['"`]https?:/.test(js) && !/XMLHttpRequest/.test(js));
    });

    /* ═════════ 1. la base de l'essai ═════════ */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-vd-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
    const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$y = (int) date('Y');
// 1 Jeanne LACOMBE, vivante, née le 12 mars 1935 à Tulle · 2 Paul MAZAUD, statut inconnu, né le 2 juin 1950 à Brive · 3 Pierre DURAND, vivant, né en 1980
// 4 Marie DURAND, décédée (décès noté) · 5 Louise LACOMBE née en 1900 (plus de 110 ans) · 6 Jean LACOMBE, vivant, né en 1960
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jeanne','LACOMBE','female','living',1),(2,'Paul','MAZAUD','male','unknown',0),(3,'Pierre','DURAND','male','living',0),(4,'Marie','DURAND','female','deceased',0),(5,'Louise','LACOMBE','female','unknown',0),(6,'Jean','LACOMBE','male','living',0)");
$pdo->exec("INSERT INTO places(id,name,county,country,admin4_code) VALUES(1,'Tulle','Corrèze','France','19272'),(2,'Brive-la-Gaillarde','Corrèze','France','19031')");
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$e = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES('person',?,?,?,?,?,?)");
$e->execute([1,$t('BIRT'),'12 mars 1935',1935,'1935-03-12',1]); $e->execute([2,$t('BIRT'),'2 juin 1950',1950,'1950-06-02',2]); $e->execute([3,$t('BIRT'),'1980',1980,'1980',2]);
$e->execute([4,$t('BIRT'),'1940',1940,'1940',1]); $e->execute([4,$t('DEAT'),'2001',2001,'2001',1]); $e->execute([5,$t('BIRT'),'1900',1900,'1900',1]); $e->execute([6,$t('BIRT'),'1960',1960,'1960',1]);
// le fichier INSEE de l'essai : un « fichier » importé, quelques lignes
$pdo->exec("INSERT INTO insee_deces_imports(id,filename,row_count,inserted_count,max_annee_deces,min_annee_deces) VALUES(1,'deces-2026-m09.csv',6,6,2026,2026)");
$i = $pdo->prepare("INSERT INTO insee_deces(nom,prenom,prenoms,sexe,date_naissance,annee_naissance,code_lieu_naissance,commune_naissance,pays_naissance,date_deces,annee_deces,code_lieu_deces,commune_deces,numero_acte_deces,source_file,source_import_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)");
$i->execute(['LACOMBE','JEANNE','JEANNE MARIE','2','19350312',1935,'19272','TULLE','','20260903',2026,'19031','BRIVE-LA-GAILLARDE','512','deces-2026-m09.csv']);
$i->execute(['MAZEAUD','PAUL','PAUL ANDRE','1','19500602',1950,'19031','BRIVE-LA-GAILLARDE','','20260911',2026,'19031','BRIVE-LA-GAILLARDE','77','deces-2026-m09.csv']);
$i->execute(['DURAND','MARIE','MARIE','2','19400101',1940,'19272','TULLE','','20010101',2001,'19272','TULLE','3','deces-2026-m09.csv']);
$i->execute(['LACOMBE','LOUISE','LOUISE','2','19000101',1900,'19272','TULLE','','20260101',2026,'19272','TULLE','4','deces-2026-m09.csv']);
$i->execute(['LACOMBE','JEAN','JEAN','1','19620505',1962,'19272','TULLE','','20260505',2026,'19272','TULLE','5','deces-2026-m09.csv']);
$i->execute(['LACOMBE','JEANNE','JEANNE','2','19350312',1935,'19272','TULLE','','20260903',2026,'75056','PARIS','999','deces-2026-m09.csv']); // une deuxième ligne presque pareille (autre acte, à Paris) : une piste de plus, à trancher
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    function q(sql) { return JSON.parse(spawnSync(phpPath, ['-r', `$p=new PDO('sqlite:${path.join(tmp, 'genealogy.sqlite')}');echo json_encode($p->query(${JSON.stringify(sql)})->fetchAll(PDO::FETCH_ASSOC));`], {encoding: 'utf8'}).stdout || '[]'); }
    function x(sql) { const r = spawnSync(phpPath, ['-r', `$p=new PDO('sqlite:${path.join(tmp, 'genealogy.sqlite')}');$p->exec(${JSON.stringify(sql)});echo 'ok';`], {encoding: 'utf8'}); assert.strictEqual(r.stdout, 'ok', r.stderr); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultMaintenanceTabs, null, {timeout: 30000});
        const api = (a, qq = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [a, qq]);
        const post = (a, b = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, {}, {method: 'POST', body: z}).then(r => r.result || r).catch(e => ({error: e.message})), [a, b]);

        await t('vd_status : base INSEE installée, 4 fiches surveillées (pas la décédée, pas celle née il y a plus de 110 ans)', async () => {
            const s = await api('vd_status');
            assert.strictEqual(s.insee.installed, true, JSON.stringify(s)); assert.strictEqual(s.watched, 4); assert.strictEqual(s.pending, 0);
            assert.strictEqual(s.new_file, true); assert.match(s.source.url, /^https:\/\/www\.data\.gouv\.fr\/fr\/datasets\/fichier-des-personnes-decedees\/$/); assert.match(s.source.licence, /Licence Ouverte 2\.0/);
        });
        let items;
        await t('vd_auto : Jeanne LACOMBE (même nom, même date, même lieu) et Paul MAZAUD (nom proche : MAZEAUD) ; pas Jean (né en 1962 ≠ 1960)', async () => {
            const r = await post('vd_auto');
            assert.strictEqual(r.ran, true, JSON.stringify(r)); assert.strictEqual(r.ok, true);
            const L = await api('vd_list'); items = L.items;
            const who = items.map(i => i.person.name).sort();
            assert.deepStrictEqual([...new Set(who)], ['Jeanne LACOMBE', 'Paul MAZAUD'], JSON.stringify(items.map(i => [i.person.name, i.insee.nom, i.score])));
            const j = items.find(i => i.person.id === 1 && i.insee.acte === '512');
            assert.ok(j.score >= 90 && j.detail.birth === 'day' && j.detail.place === 1);
            assert.strictEqual(j.insee.deces, '3 septembre 2026'); assert.match(j.insee.lieu_deces, /^BRIVE-LA-GAILLARDE \(19\)$/); assert.match(j.insee.url, /^https:\/\/deces\.matchid\.io\/search\?q=JEANNE%20LACOMBE%201935$/);
            const m = items.find(i => i.person.id === 2); assert.strictEqual(m.insee.nom, 'MAZEAUD'); assert.strictEqual(m.detail.near, 1);
            assert.ok(!items.some(i => [3, 4, 5, 6].includes(i.person.id)));
            assert.strictEqual((await post('vd_auto')).ran, false, 'pas de nouveau fichier : rien à refaire');
        });
        await t('un nouveau fichier INSEE : seulement ses lignes sont comparées ; « Vérifier maintenant » compare tout', async () => {
            // une ligne de l'ANCIEN fichier, qui correspond à Jean LACOMBE (né en 1960) : pas vue par la comparaison des seules nouvelles lignes
            x("INSERT INTO insee_deces(nom,prenom,prenoms,sexe,date_naissance,annee_naissance,code_lieu_naissance,commune_naissance,date_deces,annee_deces,commune_deces,numero_acte_deces,source_file,source_import_id) VALUES('LACOMBE','JEAN','JEAN','1','19600101',1960,'19272','TULLE','20260808',2026,'TULLE','6','deces-2026-m09.csv',1)");
            x("INSERT INTO insee_deces_imports(id,filename,row_count,inserted_count) VALUES(2,'deces-2026-m10.csv',1,1)");
            x("INSERT INTO insee_deces(nom,prenom,prenoms,sexe,date_naissance,annee_naissance,code_lieu_naissance,commune_naissance,date_deces,annee_deces,commune_deces,numero_acte_deces,source_file,source_import_id) VALUES('DURAND','PIERRE','PIERRE','1','19800707',1980,'19031','BRIVE-LA-GAILLARDE','20261002',2026,'BRIVE-LA-GAILLARDE','8','deces-2026-m10.csv',2)");
            assert.strictEqual((await api('vd_status')).new_file, true);
            const r = await post('vd_auto');
            assert.strictEqual(r.ran, true); assert.strictEqual(r.found, 1, JSON.stringify(r));
            let L = await api('vd_list');
            assert.ok(L.items.some(i => i.person.id === 3)); assert.ok(!L.items.some(i => i.person.id === 6), 'l’ancien fichier n’est pas relu');
            const f = await post('vd_run', {full: 1});
            assert.strictEqual(f.found, 1); L = await api('vd_list'); assert.ok(L.items.some(i => i.person.id === 6));
            assert.strictEqual((await post('vd_run', {full: 1})).found, 0, 'une piste ne revient pas deux fois');
        });
        await t('« ✗ Ce n’est pas lui » : retenu, jamais reproposé ; ↶ le remet', async () => {
            const m = (await api('vd_list')).items.find(i => i.person.id === 2);
            await post('vd_not_same', {id: m.id});
            await post('vd_run', {full: 1});
            assert.ok(!(await api('vd_list')).items.some(i => i.person.id === 2));
            assert.ok((await api('vd_dismissed')).items.some(i => i.id === m.id));
            await post('vd_undo', {id: m.id}); assert.ok((await api('vd_list')).items.some(i => i.id === m.id));
            await post('vd_not_same', {id: m.id});
        });
        await t('« ✓ C’est elle » : le décès sur la fiche avec la source INSEE (Licence Ouverte, n° d’acte), la fiche passe décédée ; ↶ remet tout', async () => {
            const j = (await api('vd_list')).items.find(i => i.person.id === 1 && i.insee.acte === '512');
            const r = await post('vd_confirm', {id: j.id}); assert.strictEqual(r.ok, true, JSON.stringify(r));
            const ev = q(`SELECT e.id, e.date_text, e.year, e.sort_date, pl.name AS place FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.person_id=1 AND t.gedcom_tag='DEAT'`);
            assert.strictEqual(ev.length, 1); assert.strictEqual(ev[0].sort_date, '2026-09-03'); assert.strictEqual(String(ev[0].place).toUpperCase(), 'BRIVE-LA-GAILLARDE');
            const sl = q(`SELECT sl.page, sl.note, s.title, s.url, s.publication FROM source_links sl JOIN sources s ON s.id=sl.source_record_id WHERE sl.entity_type='event' AND sl.entity_id=${ev[0].id}`);
            assert.strictEqual(sl.length, 1); assert.strictEqual(sl[0].title, 'Fichier des personnes décédées (INSEE)'); assert.match(sl[0].url, /data\.gouv\.fr/); assert.match(sl[0].publication, /Licence Ouverte 2\.0/);
            assert.match(sl[0].page, /Acte n° 512/); assert.match(sl[0].note, /deces\.matchid\.io/);
            assert.strictEqual(q('SELECT living_status FROM persons WHERE id=1')[0].living_status, 'deceased');
            assert.ok(!(await api('vd_list')).items.some(i => i.person.id === 1), 'la fiche décédée ne fait plus partie de la veille');
            await post('vd_undo', {id: j.id});
            assert.strictEqual(q(`SELECT count(*) n FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=1 AND t.gedcom_tag='DEAT'`)[0].n, 0);
            assert.strictEqual(q(`SELECT count(*) n FROM source_links WHERE entity_id=${ev[0].id} AND entity_type='event'`)[0].n, 0);
            assert.strictEqual(q('SELECT living_status FROM persons WHERE id=1')[0].living_status, 'living');
            assert.ok((await api('vd_list')).items.some(i => i.id === j.id));
        });

        /* ═════════ 2. l'écran ═════════ */
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.veilleDeces))) { await p.addStyleTag({url: base + 'assets/css/veille-synchro.css'}); await p.addScriptTag({url: base + 'assets/js/heritage-veille-deces.js'}); }
        await p.waitForFunction(() => window.LCNDA_EXT?.veilleDeces, null, {timeout: 10000});
        await t('allumée par défaut seulement si la base INSEE est installée', async () => {
            const r = await p.evaluate(() => { localStorage.removeItem('genealogie-veille-deces'); const V = window.LCNDA_EXT.veilleDeces; return [V.enabled({insee: {installed: true}}), V.enabled({insee: {installed: false}})]; });
            assert.deepStrictEqual(r, [true, false]);
        });
        await t('au démarrage : un message « ⚰️ Veille des décès : N décès possibles » avec « Voir »', async () => {
            await p.evaluate(() => { localStorage.setItem('lcnda-vd-told', '0'); return window.LCNDA_EXT.veilleDeces.refresh(); });
            await p.waitForFunction(() => /Veille des décès : \d+ décès possibles/.test([...document.querySelectorAll('.ui-toast, .toast')].map(x => x.textContent).join(' ')), null, {timeout: 8000});
            await p.click('.ui-toast button:has-text("Voir"), .toast button:has-text("Voir")');
            await p.waitForSelector('[data-vd-page] [data-vd-card]', {timeout: 15000});
        });
        await t('Réglages → ⚰️ Veille des décès : la phrase, « INSEE, Licence Ouverte », ↗ source ; ✓ C’est elle → décès, ↶ Annuler', async () => {
            const txt = await p.textContent('[data-vd-page]');
            assert.match(txt, /Décès possible : Jeanne LACOMBE, née le 12 mars 1935 à TULLE \(19\), décédée le 3 septembre 2026 à BRIVE-LA-GAILLARDE \(19\)/);
            assert.match(txt, /INSEE, Licence Ouverte/); assert.match(txt, /Rien n’est envoyé sur Internet/);
            assert.ok(await p.$('[data-vd-card] a[href^="https://www.data.gouv.fr/fr/datasets/fichier-des-personnes-decedees/"][target=_blank]'));
            assert.ok(await p.$('[data-vd-card] a[href^="https://deces.matchid.io/search"]'));
            assert.ok(await p.$('[data-vd-page] [data-vd-no]')); assert.ok(/Pistes écartées \(1\)/.test(txt), 'la piste écartée de Paul');
            const id = await p.evaluate(() => [...document.querySelectorAll('[data-vd-card]')].find(c => /Décès possible : Jeanne LACOMBE.*acte n° 512/s.test(c.textContent)).dataset.vdCard);
            await p.click(`[data-vd-yes="${id}"]`);
            await p.waitForFunction(() => /Décès ajouté à la fiche/.test([...document.querySelectorAll('.ui-toast, .toast')].map(x => x.textContent).join(' ')), null, {timeout: 10000});
            assert.strictEqual(q('SELECT living_status FROM persons WHERE id=1')[0].living_status, 'deceased');
            await p.click('.ui-toast:has-text("Décès ajouté") button:has-text("Annuler"), .toast:has-text("Décès ajouté") button:has-text("Annuler")');
            await sleep(1200);
            assert.strictEqual(q('SELECT living_status FROM persons WHERE id=1')[0].living_status, 'living');
            assert.strictEqual(q(`SELECT count(*) n FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=1 AND t.gedcom_tag='DEAT'`)[0].n, 0);
        });
        await t('« ✗ Ce n’est pas lui » à l’écran, puis ↶ Annuler ; l’interrupteur s’éteint (et ↶)', async () => {
            await p.waitForSelector('[data-vd-card]');
            const id = await p.evaluate(() => [...document.querySelectorAll('[data-vd-card]')].find(c => /Pierre DURAND/.test(c.textContent)).dataset.vdCard);
            await p.click(`[data-vd-no="${id}"]`);
            await p.waitForFunction(() => /ne reviendra pas/.test([...document.querySelectorAll('.ui-toast, .toast')].map(x => x.textContent).join(' ')), null, {timeout: 10000});
            assert.strictEqual(q(`SELECT status FROM vd_pistes WHERE id=${id}`)[0].status, 'not_same');
            await p.click('.ui-toast:has-text("ne reviendra pas") button:has-text("Annuler"), .toast:has-text("ne reviendra pas") button:has-text("Annuler")');
            await sleep(1000); assert.strictEqual(q(`SELECT status FROM vd_pistes WHERE id=${id}`)[0].status, 'new');
            await p.uncheck('[data-vd-toggle]');
            assert.strictEqual(await p.evaluate(() => localStorage.getItem('genealogie-veille-deces')), '0');
            await p.check('[data-vd-toggle]');
        });
        await t('widget du tableau de bord et « Où chercher » (liens d’avis de décès, période après 2000)', async () => {
            const w = await p.evaluate(async () => { const D = window.LCNDA_EXT.dashboard.veille_deces; const d = await D.load(); return D.render('01', {id: 'w'}, 'span-6', d); });
            assert.match(w, /Veille des décès/); assert.match(w, /Décès possible : /); assert.match(w, /Licence Ouverte/);
            assert.ok(await p.evaluate(() => window.LCNDA_APP.defaultDashboardBlocks.some(b => b[0] === 'veille_deces')));
            const so = await p.evaluate(() => { const G = window.LCNDA_SO21; return {n: G.SITES.length, u: G.url('dansnoscoeurs', {first: 'Paul', last: 'MAZAUD', place: 'Brive-la-Gaillarde'}), rel: G.SITES[0].rel.from}; });
            assert.strictEqual(so.n, 4); assert.strictEqual(so.rel, 2000); assert.match(decodeURIComponent(so.u), /site:dansnoscoeurs\.fr "Paul MAZAUD" Brive-la-Gaillarde/);
        });
        await t('la fiche de Pierre DURAND : le bloc « ⚰️ Décès possible » (rien sur une fiche sans piste) ; à la demande (dataSources)', async () => {
            await p.evaluate(() => window.LCNDA_APP.openPersonById(3));
            await p.waitForSelector('[data-vd-person="3"] [data-vd-card]', {timeout: 20000});
            assert.match(await p.textContent('[data-vd-person="3"]'), /Décès possible : Pierre DURAND, né le 7 juillet 1980/);
            assert.ok(await p.$('[data-vd-person="3"] [data-vd-yes]'));
            await p.evaluate(() => window.LCNDA_APP.openPersonById(4));
            await sleep(1500);
            assert.strictEqual(await p.$('[data-vd-person="4"] [data-vd-card]'), null);
            const ds = await p.evaluate(async () => { const s = window.LCNDA_EXT.dataSources.find(x => x.id === 'veille_deces'); const h = document.createElement('div'); await s.run({person: {id: 6}}, h); return [await s.installed(), h.textContent]; });
            assert.strictEqual(ds[0], true); assert.match(ds[1], /Jean LACOMBE/);
        });
        await t('pas d’erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
