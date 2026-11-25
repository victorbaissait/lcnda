#!/usr/bin/env node
/* 🌐 Mes arbres en ligne : synchronisation assistée avec Ancestry et Geneanet, PAR FICHIER (lib/arbres_en_ligne.php, lib/echanges.php
 * « Pour Ancestry », lib/merge.php merge_temp_import / merge_candidates, assets/js/heritage-arbres-en-ligne.js).
 * Aucun site n'est appelé : deux GEDCOM d'exemple écrits ici, au style d'Ancestry (HEAD « Ancestry.com Family Trees », _APID, _TREE)
 * et de Geneanet (HEAD « GeneWeb », lieux « Commune, code INSEE, département, région, pays », _UID).
 *  0. Node : les réglages d'export de chaque site ; aucun appel réseau dans le serveur ;
 *  1. ⤴ Envoyer : « Pour Ancestry » (lieux sans morceaux vides, pas de médias, pas de balises _XXX, vivants cachés) ; « Pour Geneanet »
 *     inchangé ; la date d'envoi, ce qui a changé depuis (les fiches cachées le disent), ↶ ;
 *  2. ⤵ Recevoir (Ancestry) : seulement ce qui est nouveau ou différent ; « Personne vivante » ignorée ; une ligne à la fois ;
 *     différence appliquée puis ↶ ; nouvelles personnes reliées à la famille ; « Garder la mienne » retenu à la réception suivante ;
 *  3. ⤵ Recevoir (Geneanet) : _UID reconnu malgré un nom écrit autrement ; « À vérifier » → même personne ;
 *  4. écran : Réglages → 🌐 Mes arbres en ligne (tableau, étapes, lien officiel, fichier préparé, ✓ / ✗ / ↶, Tout ajouter), widget, rappel.
 *   node tests/test-synchro-ancestry-geneanet.js */
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
const AEL = require('../assets/js/heritage-arbres-en-ligne.js');

const TUL = 'Tulle, Corrèze, Nouvelle-Aquitaine, France';
const ANCESTRY_GED = `0 HEAD
1 SOUR Ancestry.com Family Trees
2 NAME Ancestry.com Member Trees
2 VERS 2025.08
2 _TREE Famille MAZAUD
3 RIN 123456789
3 _ENCR 1
3 _PUBLISHED 0
1 DEST GED55
1 DATE 25 NOV 2026
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Jean /MAZAUD/
1 SEX M
1 BIRT
2 DATE 1850
2 PLAC ${TUL}
1 DEAT
2 DATE 1920
2 PLAC ${TUL}
1 OCCU cultivateur
2 DATE 1880
1 BURI
2 DATE 1920
2 PLAC ${TUL}
2 SOUR @S1@
3 PAGE Registre des sépultures 1920
3 _APID 1,61007::12345
1 NOTE Il tenait une ferme au Puy.
1 FAMS @F1@
0 @I2@ INDI
1 NAME Marie /LACOMBE/
1 SEX F
1 BIRT
2 DATE 1856
2 PLAC ${TUL}
1 FAMS @F1@
0 @I3@ INDI
1 NAME Pierre /MAZAUD/
1 SEX M
1 BIRT
2 DATE 1880
2 PLAC ${TUL}
1 DEAT
2 DATE 12 MAR 1950
2 PLAC Brive-la-Gaillarde, Corrèze, Nouvelle-Aquitaine, France
1 FAMC @F1@
1 FAMS @F2@
0 @I4@ INDI
1 NAME Anne /DURAND/
1 SEX F
1 BIRT
2 DATE 1885
2 PLAC ${TUL}
1 FAMS @F2@
0 @I5@ INDI
1 NAME Louise /MAZAUD/
1 SEX F
1 BIRT
2 DATE 1910
2 PLAC ${TUL}
1 FAMC @F2@
0 @I6@ INDI
1 NAME Personne /vivante/
1 SEX F
1 FAMC @F2@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 1875
2 PLAC ${TUL}
1 CHIL @I3@
0 @F2@ FAM
1 HUSB @I3@
1 WIFE @I4@
1 MARR
2 DATE 1908
2 PLAC ${TUL}
1 CHIL @I5@
1 CHIL @I6@
0 @S1@ SOUR
1 TITL France, registres paroissiaux et d'état civil
1 _APID 1,61007::0
0 TRLR
`;
const GENEANET_GED = `0 HEAD
1 SOUR GeneWeb
2 VERS 7.0.0
2 NAME gwb2ged
2 CORP INRIA
3 ADDR http://www.geneweb.org
1 SUBM @U1@
1 DATE 25 NOV 2026
1 FILE mazaud.ged
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
1 PLAC
2 FORM Town, Area code, County, Region, Country, Subdivision
0 @U1@ SUBM
1 NAME Geneanet
0 @I1@ INDI
1 NAME Pierre /MAZEAU/
1 SEX M
1 _UID 7F3A9C2E5B1D4E6F8A0B
1 BIRT
2 DATE 1880
2 PLAC Tulle, 19272, Corrèze, Nouvelle-Aquitaine, France,
1 OCCU menuisier
2 DATE 1905
0 @I2@ INDI
1 NAME Marie /LACOMBE/
1 SEX F
1 RESI
2 DATE 1900
2 PLAC Paris, 75056, Paris, Île-de-France, France,
0 TRLR
`;

(async () => {
    await t('réglages d’export : Ancestry (pas de médias), Geneanet (médias en liens) ; vivants anonymes ou retirés, notes, sources', async () => {
        assert.deepStrictEqual(AEL.exportParams('ancestry'), {target: 'ancestry', gedcom_version: '5.5.1', share: '1', living: 'anon', include_living: '1', include_media: '0', include_notes: '1', include_sources: '1'});
        assert.strictEqual(AEL.exportParams('geneanet', {living: 'drop', notes: false}).include_media, '1');
        assert.strictEqual(AEL.exportParams('geneanet', {living: 'drop', notes: false}).living, 'drop'); assert.strictEqual(AEL.exportParams('geneanet', {notes: false}).include_notes, '0');
    });
    await t('aucune connexion à Ancestry ou Geneanet : ni identifiants, ni lecture de leurs pages', async () => {
        const php = fs.readFileSync(path.join(root, 'lib/arbres_en_ligne.php'), 'utf8');
        assert.ok(!/curl_|file_get_contents\(\s*['"]http|stream_context_create|password|mot de passe/i.test(php));
        const js = fs.readFileSync(path.join(root, 'assets/js/heritage-arbres-en-ligne.js'), 'utf8');
        assert.ok(!/fetch\(\s*['"`]https?:/.test(js));
    });

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-ael-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    const gedA = path.join(tmp, 'arbre-ancestry.ged'), gedG = path.join(tmp, 'arbre-geneanet.ged');
    fs.writeFileSync(gedA, ANCESTRY_GED); fs.writeFileSync(gedG, GENEANET_GED);
    let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
    const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,unique_id) VALUES(1,'Jean','MAZAUD','male','deceased',1,NULL),(2,'Marie','LACOMBE','female','deceased',0,NULL),(3,'Pierre','MAZAUD','male','unknown',0,'7F3A9C2E5B1D4E6F8A0B'),(4,'Jeanne','DURAND','female','living',0,NULL)");
$pdo->exec("INSERT INTO places(id,name,county,state,country,admin4_code) VALUES(1,'Tulle','Corrèze','Nouvelle-Aquitaine','France','19272')");
$t = fn($tag, $scope = 'person') => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' AND scope='$scope' LIMIT 1")->fetchColumn();
$e = $pdo->prepare("INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?,?)");
$e->execute(['person',1,null,$t('BIRT'),'1850',1850,1]); $e->execute(['person',1,null,$t('DEAT'),'1920',1920,1]);
$e->execute(['person',2,null,$t('BIRT'),'1855',1855,1]); $e->execute(['person',3,null,$t('BIRT'),'1880',1880,1]); $e->execute(['person',4,null,$t('BIRT'),'1980',1980,1]);
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,2)"); $pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,3)");
$e->execute(['family',null,1,$t('MARR','family'),'1875',1875,1]);
$pdo->exec("INSERT INTO media(id,title,media_type,filename) VALUES(1,'Portrait de Jean','image','portrait.jpg')");
try { $pdo->exec("INSERT INTO media_links(media_id,entity_type,entity_id) VALUES(1,'person',1)"); } catch (Throwable $_) {}
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
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, acceptDownloads: true});
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP?.defaultMaintenanceTabs, null, {timeout: 30000});
        const api = (a, qq = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, z).catch(e => ({error: e.message})), [a, qq]);
        const post = (a, b = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, {}, {method: 'POST', body: z}).then(r => r.result || r).catch(e => ({error: e.message})), [a, b]);
        const exportText = params => p.evaluate(async pr => { const u = new URL('api.php', location.href); u.searchParams.set('action', 'export_gedcom'); Object.entries(pr).forEach(([k, v]) => u.searchParams.set(k, v)); const r = await fetch(u); return {name: (r.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || '', text: await r.text()}; }, params);
        const receive = (site, text, name) => p.evaluate(async ([s, body, n]) => { const fd = new FormData(); fd.append('file', new Blob([body], {type: 'text/plain'}), n); fd.append('site', s);
            const r = await fetch('api.php?action=enligne_receive', {method: 'POST', headers: {'X-CSRF-Token': window.LCNDA_APP.state.csrf}, body: fd}); return r.json(); }, [site, text, name]);

        /* ═════════ 1. ⤴ Envoyer ═════════ */
        await t('« Pour Ancestry » : GEDCOM 5.5.1, lieux « Tulle, Corrèze, Nouvelle-Aquitaine, France », ni médias ni balises _XXX, vivante cachée', async () => {
            const {name, text} = await exportText(AEL.exportParams('ancestry'));
            assert.match(name, /^genealogie-ancestry-\d{8}-\d{6}\.ged$/);
            assert.match(text, /\n2 VERS 5\.5\.1\n/); assert.match(text, /\n1 PLAC\n2 FORM City, County, State, Country\n/);
            assert.match(text, /\n2 PLAC Tulle, Corrèze, Nouvelle-Aquitaine, France\n/); assert.ok(!/PLAC [^\n]*, ,/.test(text), 'pas de morceau vide');
            assert.ok(!/\n\d OBJE/.test(text), 'pas de médias'); assert.ok(!/\n\d _/.test(text), 'pas de balise propre à LCNDA');
            assert.match(text, /1 NAME Personne \/vivante\//); assert.ok(!/Jeanne/.test(text), 'la vivante ne part pas');
        });
        await t('« Pour Geneanet » ne change pas : lieux au format de Geneanet avec le code INSEE', async () => {
            const {name, text} = await exportText(AEL.exportParams('geneanet'));
            assert.match(name, /^genealogie-geneanet-/); assert.match(text, /2 FORM Town, Area code, County, Region, Country\n/); assert.match(text, /2 PLAC Tulle, 19272, Corrèze, Nouvelle-Aquitaine, France\n/);
        });
        await t('jamais envoyé : tout l’arbre ; après l’envoi, seulement ce qui a changé (une fiche vivante le dit) ; ↶ remet la date', async () => {
            let st = await api('enligne_status');
            assert.strictEqual(st.sites.ancestry.last_sent_at, null); assert.strictEqual(st.sites.ancestry.changes, null);
            assert.match(st.sites.ancestry.help, /^https:\/\/help-redir\.ancestry\.com\/hc\//); assert.strictEqual(st.sites.geneanet.help, 'https://en.geneanet.org/create-your-family-tree/gedcom');
            assert.ok(st.sites.geneanet.send_steps.some(s => /Remplacer l’arbre/.test(s)));
            const c0 = await api('enligne_changes', {site: 'geneanet'}); assert.strictEqual(c0.never, true); assert.strictEqual(c0.total, 4);
            const r = await post('enligne_sent', {site: 'geneanet'}); assert.strictEqual(r.prev, null);
            x("INSERT INTO change_log(entity_type,entity_id,action,summary,created_at) VALUES('person',3,'update','Pierre MAZAUD : profession ajoutée',datetime('now','+5 seconds')),('person',4,'update','Jeanne DURAND : adresse changée',datetime('now','+5 seconds'))");
            const c = await api('enligne_changes', {site: 'geneanet'});
            assert.strictEqual(c.total, 2); assert.deepStrictEqual(c.items.map(i => [i.summary, i.hidden]).sort(), [['Jeanne DURAND : adresse changée', true], ['Pierre MAZAUD : profession ajoutée', false]]);
            st = await api('enligne_status'); assert.strictEqual(st.sites.geneanet.changes, 2); assert.strictEqual(st.sites.ancestry.changes, null, 'chaque site a sa date');
            await post('enligne_sent_undo', {site: 'geneanet', prev: r.prev});
            assert.strictEqual((await api('enligne_status')).sites.geneanet.last_sent_at, null);
            await post('enligne_sent', {site: 'geneanet'});
        });

        /* ═════════ 2. ⤵ Recevoir d'Ancestry ═════════ */
        let L;
        const find = (re, kind) => L.items.find(l => re.test(l.label) && (!kind || l.kind === kind));
        await t('recevoir le GEDCOM d’Ancestry : seulement ce qui est nouveau ou différent, « Personne vivante » ignorée, rien n’est écrit', async () => {
            const before = q('SELECT (SELECT count(*) FROM persons) p, (SELECT count(*) FROM events) e')[0];
            const r = await receive('ancestry', ANCESTRY_GED, 'arbre-ancestry.ged');
            assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 400));
            L = await api('enligne_lines', {site: 'ancestry'});
            const labels = L.items.map(l => `${l.kind} | ${l.label}`);
            assert.ok(find(/^Ajouter à Jean MAZAUD \(1850–1920\) : Profession/i, 'event') || find(/Jean MAZAUD.*cultivateur/, 'event'), labels.join('\n'));
            assert.ok(find(/^Ajouter à Jean MAZAUD.*Inhumation 1920, Tulle/, 'event'), labels.join('\n'));
            assert.ok(find(/^Note pour Jean MAZAUD.*ferme au Puy/, 'note'));
            const d = find(/Marie LACOMBE/, 'diff'); assert.ok(d, labels.join('\n')); assert.match(d.detail.mine_text, /1855/); assert.match(d.detail.site_text, /1856/);
            assert.ok(find(/^Ajouter à Pierre MAZAUD.*Décès.*1950.*Brive-la-Gaillarde/, 'event'), labels.join('\n'));
            assert.ok(find(/^Nouvelle personne : Anne DURAND \(1885–\?\) — conjoint de Pierre MAZAUD \(1880–\?\), parent de Louise MAZAUD \(1910–\?\)$/, 'person'), labels.join('\n'));
            assert.ok(find(/^Nouvelle personne : Louise MAZAUD \(1910–\?\) — fille de Pierre MAZAUD \(1880–\?\) et Anne DURAND \(1885–\?\)$/, 'person'), labels.join('\n'));
            assert.ok(!labels.some(l => /vivante/i.test(l)), 'la « Personne vivante » du fichier n’est jamais proposée');
            assert.ok(!labels.some(l => /Naissance 1850|Mariage 1875|Couple|Lien :/.test(l)), 'ce qui est déjà là n’est pas proposé');
            assert.strictEqual(L.items.length, 7, labels.join('\n'));
            assert.deepStrictEqual(q('SELECT (SELECT count(*) FROM persons) p, (SELECT count(*) FROM events) e')[0], before, 'rien n’est écrit avant un clic');
            const st = await api('enligne_status'); assert.strictEqual(st.sites.ancestry.pending, 7); assert.strictEqual(st.sites.ancestry.last_received_file, 'arbre-ancestry.ged');
        });
        await t('✓ une ligne à la fois : l’inhumation de Jean (« Reçu de Ancestry ») ; ↶ la retire', async () => {
            const l = find(/Inhumation/, 'event');
            assert.deepStrictEqual((await post('enligne_apply', {ids: [l.id]})).applied, [l.id]);
            const ev = q(`SELECT e.id, e.year, e.description, pl.name FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE e.person_id=1 AND t.gedcom_tag='BURI'`);
            assert.strictEqual(ev.length, 1); assert.strictEqual(ev[0].year, 1920); assert.strictEqual(ev[0].name, 'Tulle'); assert.match(ev[0].description, /Reçu de Ancestry/);
            assert.strictEqual(q('SELECT count(*) n FROM places WHERE name=\'Tulle\'')[0].n, 1, 'le lieu existant est repris');
            await post('enligne_undo', {ids: [l.id]});
            assert.strictEqual(q(`SELECT count(*) n FROM events WHERE id=${ev[0].id}`)[0].n, 0);
            assert.strictEqual((await api('enligne_lines', {site: 'ancestry'})).items.find(i => i.id === l.id).status, 'pending');
        });
        await t('≠ prendre la version du site (1856 au lieu de 1855) puis ↶ : la date d’avant revient', async () => {
            const d = find(/Marie LACOMBE/, 'diff');
            await post('enligne_apply', {ids: [d.id]});
            assert.strictEqual(q(`SELECT year FROM events WHERE id=${d.detail.event_id}`)[0].year, 1856);
            await post('enligne_undo', {ids: [d.id]});
            assert.strictEqual(q(`SELECT year, date_text FROM events WHERE id=${d.detail.event_id}`)[0].year, 1855);
        });
        await t('👤 nouvelles personnes : Anne DURAND devient l’épouse de Pierre (avec le mariage), Louise leur fille ; ↶ retire Louise et son lien', async () => {
            const a = find(/^Nouvelle personne : Anne DURAND/, 'person'), lo = find(/^Nouvelle personne : Louise MAZAUD/, 'person');
            await post('enligne_apply', {ids: [a.id]});
            const anne = q("SELECT id FROM persons WHERE first_name='Anne' AND last_name='DURAND'")[0].id;
            const fam = q(`SELECT id FROM families WHERE (partner1_id=3 AND partner2_id=${anne}) OR (partner1_id=${anne} AND partner2_id=3)`);
            assert.strictEqual(fam.length, 1);
            assert.strictEqual(q(`SELECT count(*) n FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.family_id=${fam[0].id} AND t.gedcom_tag='MARR' AND e.year=1908`)[0].n, 1);
            await post('enligne_apply', {ids: [lo.id]});
            const louise = q("SELECT id FROM persons WHERE first_name='Louise'")[0].id;
            assert.strictEqual(q(`SELECT count(*) n FROM family_children WHERE child_id=${louise} AND family_id=${fam[0].id}`)[0].n, 1);
            await post('enligne_undo', {ids: [lo.id]});
            assert.strictEqual(q(`SELECT count(*) n FROM persons WHERE id=${louise}`)[0].n, 0); assert.strictEqual(q(`SELECT count(*) n FROM family_children WHERE child_id=${louise}`)[0].n, 0);
            assert.strictEqual(q(`SELECT count(*) n FROM persons WHERE id=${anne}`)[0].n, 1, 'Anne reste');
        });
        await t('✗ garder la mienne : retenu ; la réception suivante du même fichier ne repropose ni ce refus ni ce qui est déjà ajouté', async () => {
            const d = find(/Marie LACOMBE/, 'diff');
            assert.strictEqual((await post('enligne_dismiss', {ids: [d.id]})).dismissed, 1);
            const r = await receive('ancestry', ANCESTRY_GED, 'arbre-ancestry-2.ged');
            assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 300));
            L = await api('enligne_lines', {site: 'ancestry'});
            const labels = L.items.map(l => `${l.kind} | ${l.label}`);
            assert.ok(!find(/Marie LACOMBE/, 'diff'), labels.join('\n'));
            assert.ok(!find(/^Nouvelle personne : Anne DURAND/, 'person'), 'Anne est déjà là');
            assert.ok(find(/^Nouvelle personne : Louise MAZAUD/, 'person'), 'Louise (annulée) revient');
            assert.ok(r.already >= 1);
        });

        /* ═════════ 3. ⤵ Recevoir de Geneanet ═════════ */
        await t('Geneanet : le _UID reconnaît Pierre malgré « MAZEAU » ; Marie LACOMBE sans date « à vérifier » → même personne', async () => {
            const r = await receive('geneanet', GENEANET_GED, 'arbre-geneanet.ged');
            assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 300));
            L = await api('enligne_lines', {site: 'geneanet'});
            const labels = L.items.map(l => `${l.kind} | ${l.label}`);
            assert.ok(find(/^Ajouter à Pierre MAZAUD.*menuisier/, 'event') || find(/^Ajouter à Pierre MAZAUD.*Profession/i, 'event'), labels.join('\n'));
            assert.ok(!labels.some(l => /Nouvelle personne : Pierre/.test(l)), labels.join('\n'));
            const c = find(/Marie LACOMBE/, 'check'); assert.ok(c, labels.join('\n'));
            assert.strictEqual(c.detail.candidate, 2);
            await post('enligne_apply', {ids: [c.id], choice: 'same'});
            assert.strictEqual(q(`SELECT count(*) n FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=2 AND t.gedcom_tag='RESI' AND e.year=1900`)[0].n, 1);
            await post('enligne_undo', {ids: [c.id]});
            assert.strictEqual(q(`SELECT count(*) n FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=2 AND t.gedcom_tag='RESI'`)[0].n, 0);
        });

        /* ═════════ 4. l'écran ═════════ */
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.arbresEnLigne))) { await p.addStyleTag({url: base + 'assets/css/veille-synchro.css'}); await p.addScriptTag({url: base + 'assets/js/heritage-arbres-en-ligne.js'}); }
        await p.waitForFunction(() => window.LCNDA_EXT?.arbresEnLigne, null, {timeout: 10000});
        await t('Réglages → 🌐 Mes arbres en ligne : le tableau, le lien officiel, les étapes, « pas d’accès ouvert »', async () => {
            await p.evaluate(() => { localStorage.setItem('lcnda-ael-site', 'ancestry'); window.LCNDA_EXT.arbresEnLigne.open('ancestry'); });
            await p.waitForSelector('[data-ael-page] .ael-table', {timeout: 20000});
            const txt = await p.textContent('[data-ael-page]');
            assert.match(txt, /Dernier envoi/); assert.match(txt, /Dernière réception/); assert.match(txt, /En attente/);
            assert.match(txt, /Ni Ancestry ni Geneanet ne permettent aux autres logiciels de se connecter/);
            assert.match(txt, /Téléverser un fichier GEDCOM/); assert.match(txt, /Exporter l’arbre/);
            assert.ok(await p.$('[data-ael-page] a[href^="https://help-redir.ancestry.com/"][target=_blank]'));
            assert.ok(await p.$('[data-ael-lines="ancestry"] [data-ael-line]'));
            assert.ok(await p.evaluate(() => window.LCNDA_APP.defaultMaintenanceTabs.some(x => x[0] === 'arbres_en_ligne')));
        });
        await t('⤓ Préparer le fichier pour Ancestry : téléchargé, envoi noté, ↶', async () => {
            const [dl] = await Promise.all([p.waitForEvent('download', {timeout: 20000}), p.click('[data-ael-send="ancestry"] [type=submit]')]);
            assert.match(dl.suggestedFilename(), /^genealogie-ancestry-.*\.ged$/);
            await p.waitForFunction(() => /Envoi noté/.test([...document.querySelectorAll('.ui-toast, .toast')].map(x => x.textContent).join(' ')), null, {timeout: 10000});
            assert.ok((await api('enligne_status')).sites.ancestry.last_sent_at);
            await p.click('.ui-toast:has-text("Envoi noté") button:has-text("Annuler"), .toast:has-text("Envoi noté") button:has-text("Annuler")');
            await sleep(1000); assert.strictEqual((await api('enligne_status')).sites.ancestry.last_sent_at, null);
        });
        await t('⤵ recevoir à l’écran (choisir le fichier), ✓ Ajouter une ligne puis ↶ ; ✓ Tout ajouter', async () => {
            await p.waitForSelector('[data-ael-receive="ancestry"] input[type=file]');
            const maxBefore = Number(q('SELECT COALESCE(MAX(id),0) m FROM ael_lines')[0].m);
            await p.setInputFiles('[data-ael-receive="ancestry"] input[type=file]', gedA);
            await p.click('[data-ael-receive="ancestry"] [type=submit]');
            await p.waitForFunction(() => /à décider/.test(document.querySelector('[data-ael-receive="ancestry"] [data-ael-msg]')?.textContent || ''), null, {timeout: 20000});
            await p.waitForFunction(m => [...document.querySelectorAll('[data-ael-line]')].some(li => Number(li.dataset.aelLine) > m), maxBefore, {timeout: 20000});
            const id = await p.evaluate(() => [...document.querySelectorAll('[data-ael-line][data-kind="event"]')].find(li => /Inhumation/.test(li.textContent)).dataset.aelLine);
            assert.ok(Number(id) > maxBefore, 'les lignes du fichier qu’on vient de choisir');
            await p.click(`[data-ael-apply="${id}"]`);
            await p.waitForFunction(() => /changement ajouté/.test([...document.querySelectorAll('.ui-toast, .toast')].map(x => x.textContent).join(' ')), null, {timeout: 10000});
            assert.strictEqual(q(`SELECT count(*) n FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=1 AND t.gedcom_tag='BURI'`)[0].n, 1);
            await p.click('.ui-toast:has-text("changement ajouté") button:has-text("Annuler"), .toast:has-text("changement ajouté") button:has-text("Annuler")');
            await sleep(1200);
            assert.strictEqual(q(`SELECT count(*) n FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=1 AND t.gedcom_tag='BURI'`)[0].n, 0);
            await p.waitForSelector('[data-ael-all="ancestry"]');
            await p.click('[data-ael-all="ancestry"]');
            await p.waitForFunction(() => /changements ajoutés/.test([...document.querySelectorAll('.ui-toast, .toast')].map(x => x.textContent).join(' ')), null, {timeout: 10000});
            assert.strictEqual(q("SELECT count(*) n FROM persons WHERE first_name='Louise'")[0].n, 1);
            assert.strictEqual(q(`SELECT count(*) n FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=3 AND t.gedcom_tag='DEAT'`)[0].n, 1);
        });
        await t('le rappel (tous les mois) et le widget du tableau de bord', async () => {
            await p.selectOption('[data-ael-remind="geneanet"]', '30');
            await sleep(600);
            assert.strictEqual(q("SELECT reminder_days FROM ael_sites WHERE site='geneanet'")[0].reminder_days, 30);
            x("UPDATE ael_sites SET last_sent_at=datetime('now','-40 days') WHERE site='geneanet'");
            const st = await api('enligne_status'); assert.strictEqual(st.sites.geneanet.reminder_due, true, JSON.stringify(st.sites.geneanet));
            const w = await p.evaluate(async () => { const D = window.LCNDA_EXT.dashboard.arbres_en_ligne; return D.render('01', {id: 'w'}, 'span-6', await D.load()); });
            assert.match(w, /Mes arbres en ligne/); assert.match(w, /Ancestry/); assert.match(w, /Geneanet/);
        });
        await t('pas d’erreur JavaScript', async () => { assert.deepStrictEqual(errs, []); });
    } finally {
        await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true});
    }
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})();
