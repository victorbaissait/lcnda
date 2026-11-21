#!/usr/bin/env node
/* 📄 Un seul texte par document (maquette docs/design/dossier-et-transcriptions.html, B et C) :
 *  - serveur : l'Atelier de transcription écrit le texte du document (copie dans media.transcription), la case de la visionneuse
 *    écrit dans l'acte (un acte) ou refuse (plusieurs actes : un bloc par acte) ; un texte d'avant n'est jamais écrasé (gardé
 *    dessous) ; migration 102 (les deux textes l'un sous l'autre, rejouable) ; sorte par défaut « À préciser » ;
 *    recherche → Transcriptions, recherche du haut, export GEDCOM (case « Transcriptions des documents »), page du document,
 *    fiche des personnes (« 📜 Actes et transcriptions », « à relier », Relier avec ↶ Annuler) ; mode consultation : vivants masqués ;
 *  - navigateur (1440 et 390) : page du document (« Relié à », « Personnes reliées », « 📜 Ouvrir dans l'Atelier »), visionneuse,
 *    bloc de la fiche, l'Atelier sans « ↪ Mettre le texte dans le média ».
 *   node tests/test-transcription-unique.js   (captures : SHOTS=/chemin node tests/test-transcription-unique.js) */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
const SHOTS = process.env.SHOTS || '';

let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };

(async () => {
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-tr-unique-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const php = code => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; require 'lib/bootstrap.php'; $pdo = db(); ${code}`], {cwd: root, encoding: 'utf8', env}); if (r.status !== 0) throw new Error(r.stderr || r.stdout); const s = r.stdout; return JSON.parse(s.slice(s.indexOf('{'))); };
    // noms fictifs : Pierre DURAND (mort), Jean DURAND (père, mort), Claire DURAND (vivante)
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$ins = $pdo->prepare("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(?,?,?,?,?,?)");
foreach ([[1,'Pierre','DURAND','male','deceased',1],[2,'Jean','DURAND','male','deceased',0],[3,'Claire','DURAND','female','living',0],[4,'Marie','LACOMBE','female','deceased',0]] as $x) $ins->execute($x);
if (function_exists('imagecreatetruecolor')) { $im = imagecreatetruecolor(400, 560); imagefill($im, 0, 0, imagecolorallocate($im, 230, 215, 180)); imagejpeg($im, MEDIA_DIR . '/m.jpg'); } else { file_put_contents(MEDIA_DIR . '/m.jpg', 'x'); }
$m = $pdo->prepare("INSERT INTO media(id,title,filename,thumbnail,media_type,transcription,document_reference) VALUES(?,?,?,?,?,?,?)");
foreach ([[1,'84e6ae97-2284-4a51-9e3d-160902c51eda.jpg','m.jpg','m.jpg','image','test','AD 19, 1 R 612'],[2,'Registre','m.jpg','m.jpg','image','Même texte',''],[3,'Page à trois actes','m.jpg','m.jpg','image','Vieille note',''],
          [4,'Vide','m.jpg','m.jpg','image','',''],[5,'Lettre','m.jpg','m.jpg','image','ancien texte',''],[6,'Sans acte','m.jpg','m.jpg','image','',''],[7,'Acte de Claire','m.jpg','m.jpg','image','',''] ] as $x) $m->execute($x);
$pdo->exec("INSERT INTO media_links(media_id,entity_type,entity_id) VALUES(1,'person',1),(7,'person',3)");
// l'état d'avant (deux textes qui diffèrent), écrit directement comme le faisait l'ancienne version
act_transcriptions_ensure($pdo);
$a = $pdo->prepare("INSERT INTO act_transcriptions(id,title,kind,media_id,body,data_json,updated_at) VALUES(?,?,?,?,?,?,?)");
$a->execute([1,'Registre militaire · Pierre DURAND · 1912','militaire',1,"Fiche matricule n° 845, classe 1912\nPrénoms : Pierre Antoine",json_encode(['people'=>[['name'=>'Pierre DURAND','role'=>'sujet','person_id'=>1],['name'=>'Jean DURAND','role'=>'père','person_id'=>0],['name'=>'Claire DURAND','role'=>'témoin','person_id'=>3]],'zones'=>[['id'=>'z1','x'=>1,'y'=>1,'w'=>5,'h'=>5,'s'=>0,'e'=>5]]]),'2026-01-01']);
$a->execute([2,'Baptême','bapteme',2,'Même texte','{}','2026-01-01']);
$a->execute([3,'Acte 1','bapteme',3,'Premier acte','{}','2026-01-01']);
$a->execute([4,'Acte 2','mariage',3,'Second acte','{}','2026-02-01']);
$a->execute([5,'Décès','deces',4,'Texte de l’Atelier','{}','2026-01-01']);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }

    await t('migration 102 : les deux textes gardés l’un sous l’autre (Atelier puis visionneuse), la copie du média à jour ; rejouable', () => {
        const o = php(String.raw`
$o = ['ver' => SCHEMA_VERSION, 'step' => migration_steps()[102] ?? null];
$o['n1'] = act_doc_text_merge_all($pdo);
$body = fn($id) => (string) $pdo->query("SELECT body FROM act_transcriptions WHERE id=$id")->fetchColumn();
$mt = fn($id) => (string) $pdo->query("SELECT transcription FROM media WHERE id=$id")->fetchColumn();
$o['a1'] = $body(1); $o['m1'] = $mt(1); $o['a2'] = $body(2); $o['m2'] = $mt(2); $o['a3'] = $body(3); $o['a4'] = $body(4); $o['m3'] = $mt(3); $o['m4'] = $mt(4);
$before = $pdo->query("SELECT group_concat(id || ':' || body, '|') FROM act_transcriptions")->fetchColumn() . '#' . $pdo->query("SELECT group_concat(id || ':' || transcription, '|') FROM media")->fetchColumn();
schema_v102($pdo); schema_v102($pdo);
$o['n2'] = act_doc_text_merge_all($pdo);
$after = $pdo->query("SELECT group_concat(id || ':' || body, '|') FROM act_transcriptions")->fetchColumn() . '#' . $pdo->query("SELECT group_concat(id || ':' || transcription, '|') FROM media")->fetchColumn();
$o['same'] = $before === $after;
echo json_encode($o, JSON_UNESCAPED_UNICODE);`);
        assert.ok(o.ver >= 102, 'structure au moins n°102 : ' + o.ver); assert.equal(o.step, 'schema_v102');
        assert.equal(o.a1, 'Fiche matricule n° 845, classe 1912\nPrénoms : Pierre Antoine\n\n———\ntest', 'l’Atelier d’abord, puis « test »');
        assert.equal(o.m1, o.a1, 'un seul texte');
        assert.equal(o.a2, 'Même texte'); assert.equal(o.m2, 'Même texte', 'déjà pareils : rien ne change');
        assert.match(o.a4, /Second acte\n\n———\nVieille note/, 'plusieurs actes : la note va dans le plus récent');
        assert.equal(o.a3, 'Premier acte');
        assert.equal(o.m3, 'Acte 1\nPremier acte\n\nActe 2\nSecond acte\n\n———\nVieille note', 'un bloc par acte, avec son titre');
        assert.equal(o.m4, 'Texte de l’Atelier', 'case vide : le texte de l’Atelier');
        assert.equal(o.n2, 0); assert.equal(o.same, true, 'rejouée : rien ne bouge');
    });
    await t('Atelier → document : copie à jour à chaque enregistrement ; premier acte d’une image déjà écrite : l’ancien texte gardé dessous ; sorte « À préciser » par défaut ; suppression : le média garde son texte', () => {
        const o = php(String.raw`
$r = save_act_transcription($pdo, ['title' => 'Lettre', 'media_id' => 5, 'body' => 'nouveau texte', 'data' => []]);
$o = ['body' => $r['body'], 'kind' => $pdo->query('SELECT kind FROM act_transcriptions WHERE id=' . $r['id'])->fetchColumn(), 'm5' => $pdo->query('SELECT transcription FROM media WHERE id=5')->fetchColumn()];
save_act_transcription($pdo, ['id' => $r['id'], 'title' => 'Lettre', 'media_id' => 5, 'body' => $r['body'] . "\nsuite", 'data' => []]);
$o['m5b'] = $pdo->query('SELECT transcription FROM media WHERE id=5')->fetchColumn();
$r6 = save_act_transcription($pdo, ['title' => 'X', 'kind' => 'pirate', 'media_id' => 6, 'body' => 'seul', 'data' => []]);
$o['kind6'] = $pdo->query('SELECT kind FROM act_transcriptions WHERE id=' . $r6['id'])->fetchColumn(); $o['m6'] = $pdo->query('SELECT transcription FROM media WHERE id=6')->fetchColumn();
delete_act_transcription($pdo, ['id' => $r6['id']]); $o['m6del'] = $pdo->query('SELECT transcription FROM media WHERE id=6')->fetchColumn();
echo json_encode($o, JSON_UNESCAPED_UNICODE);`);
        assert.equal(o.body, 'nouveau texte\n\n———\nancien texte'); assert.equal(o.m5, o.body);
        assert.equal(o.kind, 'apreciser'); assert.equal(o.kind6, 'apreciser', 'sorte inconnue → À préciser (comme l’Atelier)');
        assert.equal(o.m5b, 'nouveau texte\n\n———\nancien texte\nsuite');
        assert.equal(o.m6, 'seul'); assert.equal(o.m6del, 'seul', 'rien n’est perdu');
    });
    await t('fiche : 📜 Actes et transcriptions (relié, relevé avec numéro, « à relier »), Relier puis ↶ Annuler ; un nom déjà relié entre-temps : refus', () => {
        const o = php(String.raw`
$o = ['p1' => act_transcriptions_for_person($pdo, 1), 'p2' => act_transcriptions_for_person($pdo, 2), 'p2no' => act_transcriptions_for_person($pdo, 2, false)];
$t = $o['p2'][0];
act_link_person($pdo, ['id' => $t['act_id'], 'index' => $t['index'], 'person_id' => 2, 'was' => 0]);
$o['p2linked'] = act_transcriptions_for_person($pdo, 2)[0]['state'];
try { act_link_person($pdo, ['id' => $t['act_id'], 'index' => $t['index'], 'person_id' => 4, 'was' => 0]); $o['race'] = 'saved'; } catch (Throwable $e) { $o['race'] = $e->getMessage(); }
act_link_person($pdo, ['id' => $t['act_id'], 'index' => $t['index'], 'person_id' => 0, 'was' => 2]);
$o['p2undo'] = act_transcriptions_for_person($pdo, 2)[0]['state'];
echo json_encode($o, JSON_UNESCAPED_UNICODE);`);
        const a1 = o.p1.find(r => r.act_id === 1);
        assert.ok(a1, 'Pierre relevé dans l’acte 1'); assert.equal(a1.state, 'linked'); assert.equal(a1.role, 'sujet'); assert.match(a1.excerpt, /Pierre Antoine/);
        assert.equal(o.p1.filter(r => r.media_id === 1).length, 1, 'le même document une seule fois');
        assert.equal(o.p2.length, 1); assert.equal(o.p2[0].state, 'tolink'); assert.equal(o.p2[0].role, 'père');
        assert.equal(o.p2no.length, 0, 'sans les noms à relier');
        assert.equal(o.p2linked, 'linked'); assert.match(o.race, /entre-temps/); assert.equal(o.p2undo, 'tolink');
    });

    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(res => setTimeout(res, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(x => { cookie = (x.headers.get('set-cookie') || '').split(';')[0]; return x; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const get = async (action, q = {}) => { const x = await fetch(`${base}api.php?${new URLSearchParams({action, ...q})}`, {headers: {Cookie: cookie}}); return {status: x.status, text: await x.text()}; };
    const post = async (action, body, token = csrf) => { const x = await fetch(`${base}api.php?action=${action}`, {method: 'POST', headers: {Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token}, body: JSON.stringify({...body, csrf: token})}); return {status: x.status, body: await x.json().catch(() => ({}))}; };
    const kioskOn = on => { const f = path.join(tmp, 'consultation.json'); if (on) fs.writeFileSync(f, JSON.stringify({hash: 'x', since: '2026-11-21'})); else if (fs.existsSync(f)) fs.unlinkSync(f); };
    const browser = await chromium.launch();
    const shot = async (pg, name, full = false) => { if (SHOTS) { fs.mkdirSync(SHOTS, {recursive: true}); await pg.screenshot({path: path.join(SHOTS, name + '.png'), fullPage: full}); } };
    try {
        await t('recherche → Transcriptions et recherche du haut lisent le texte unique (et le titre de l’acte) ; d’où il vient (📜)', async () => {
            const a = JSON.parse((await get('transcription_search', {q: 'matricule'})).text);
            assert.deepEqual(a.media.map(m => m.id), [1]); assert.equal(Number(a.media[0].act_count), 1);
            const b = JSON.parse((await get('transcription_search', {q: 'Registre militaire'})).text);
            assert.ok(b.media.some(m => m.id === 1), 'trouvé par le titre de l’acte');
            const q = JSON.parse((await get('quick_search', {q: 'matricule'})).text);
            assert.equal(q.transcriptions.length, 1); assert.equal(q.transcriptions[0].id, 1); assert.ok(q.transcriptions[0].acts >= 1);
        });
        await t('visionneuse → Atelier : un acte, la case écrit dans l’acte ; plusieurs actes : refus clair (le texte reste), le même texte passe', async () => {
            assert.equal((await post('save_media_transcription', {media_id: 2, transcription: 'Texte corrigé dans la visionneuse'})).status, 200);
            const o = php(String.raw`echo json_encode(['a2' => $pdo->query('SELECT body FROM act_transcriptions WHERE id=2')->fetchColumn(), 'm3' => $pdo->query('SELECT transcription FROM media WHERE id=3')->fetchColumn()], JSON_UNESCAPED_UNICODE);`);
            assert.equal(o.a2, 'Texte corrigé dans la visionneuse');
            const many = await post('save_media_transcription', {media_id: 3, transcription: 'écrasé ?'});
            assert.notEqual(many.status, 200); assert.match(many.body.error || '', /plusieurs actes/);
            assert.equal((await post('save_media', {media_id: 3, title: 'Page à trois actes', transcription: 'écrasé par la fenêtre ?'})).status, 200);
            const o2 = php(String.raw`echo json_encode(['m3' => $pdo->query('SELECT transcription FROM media WHERE id=3')->fetchColumn()], JSON_UNESCAPED_UNICODE);`);
            assert.equal(o2.m3, o.m3, 'la fenêtre du média ne l’écrase pas non plus'); assert.match(o.m3, /Acte 1\nPremier acte/);
            assert.equal((await post('save_media_transcription', {media_id: 3, transcription: o.m3})).status, 200, 'le même texte passe');
        });
        await t('⤓ GEDCOM : le texte part dans le média (NOTE), sauf si « Transcriptions des documents » est décochée', async () => {
            const on = (await get('export_gedcom', {gedcom_version: '7', include_media: '1'})).text;
            assert.match(on, /1 NOTE Fiche matricule n° 845/);
            const off = (await get('export_gedcom', {gedcom_version: '7', include_media: '1', include_transcriptions: '0'})).text;
            assert.doesNotMatch(off, /Fiche matricule/);
        });
        await t('CSRF : Relier refusé sans jeton ; mode consultation : ni écriture, ni vivante nommée (page du document, fiche, visionneuse)', async () => {
            assert.notEqual((await post('act_link_person', {id: 1, index: 1, person_id: 2, was: 0}, 'faux')).status, 200);
            kioskOn(true);
            try {
                assert.notEqual((await post('act_link_person', {id: 1, index: 1, person_id: 2, was: 0})).status, 200);
                assert.notEqual((await post('save_act_transcription', {title: 'x', data: {}})).status, 200);
                const d = JSON.parse((await get('onglets', {op: 'document', id: '1'})).text).document;
                assert.ok(d.acts.length === 1);
                assert.ok(!d.acts[0].people.some(p => /Claire/.test(p.name)), 'la vivante n’est pas nommée');
                assert.ok(!d.people.some(p => /Claire/.test(p.name)));
                const m = JSON.parse((await get('act_transcriptions_media', {media_id: '1'})).text);
                assert.ok(!JSON.stringify(m.items).includes('Claire'));
            } finally { kioskOn(false); }
        });

        const open = async (vp, hash = '') => {
            const ctx = await browser.newContext({viewport: vp, deviceScaleFactor: 1});
            await ctx.route(/cdn\.jsdelivr\.net|unpkg\.com|tile|openstreetmap/, x => x.abort());
            const pg = await ctx.newPage(); const errs = [];
            pg.on('pageerror', e => errs.push(e.message));
            await pg.goto(base, {waitUntil: 'load'});
            await pg.waitForFunction(() => window.LCNDA_APP?.api && window.LCNDA_EXT?.onglets?.documents && window.LCNDA_EXT?.openActTranscriber, null, {timeout: 30000});
            if (hash) { await pg.evaluate(() => { localStorage.setItem('genealogie-menu-documents', '1'); localStorage.setItem('genealogie-menu-hidden', '[]'); }); await pg.evaluate(h => { location.hash = h; }, hash); await pg.reload({waitUntil: 'load'}); await pg.waitForSelector('#sidebar-content [data-ong-doc]', {timeout: 30000}); await pg.evaluate(id => window.LCNDA_EXT.onglets.documents.select(id), Number(hash.split('/')[1])); }
            return {ctx, pg, errs};
        };
        const noSide = pg => pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
        for (const vp of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
            await t(`page du document (${vp.width}) : le texte de l’Atelier, sorte et état, « 📜 Ouvrir dans l’Atelier », « Personnes reliées » avec rôles, « Relié à »`, async () => {
                const {ctx, pg, errs} = await open(vp, '#documents/1');
                await pg.waitForSelector('.ong-trsec[data-ong-act="1"]', {timeout: 30000});
                const sec = await pg.textContent('.ong-trsec');
                assert.match(sec, /Fiche matricule n° 845/); assert.match(sec, /Registre militaire/); assert.match(sec, /———\s*test/, 'les deux textes');
                assert.equal(await pg.locator('[data-ong-txopen="1"]').count(), 1);
                const page = await pg.textContent('.ong-docpage');
                assert.match(page, /Personnes reliées/); assert.doesNotMatch(page, /Personnes liées|Rattaché à/);
                assert.match(page, /sujet/, 'le rôle relevé dans l’Atelier');
                assert.match(page, /Jean DURAND/, 'le nom relevé pas encore relié');
                assert.equal(await noSide(pg), true);
                await shot(pg, `doc-${vp.width}`, true);
                await pg.click('[data-ong-txopen="1"]');
                await pg.waitForSelector('dialog.h-tx-dlg[open]');
                assert.equal(await pg.inputValue('dialog.h-tx-dlg [data-tx-body]'), 'Fiche matricule n° 845, classe 1912\nPrénoms : Pierre Antoine\n\n———\ntest');
                assert.equal(await pg.isVisible('dialog.h-tx-dlg [data-tx-docnote]'), true, 'la phrase « Ce texte est celui du document »');
                assert.equal(await pg.locator('dialog.h-tx-dlg [data-tx-cmd="tomedia"]').count(), 0, 'plus de « Mettre le texte dans le média »');
                await pg.click('dialog.h-tx-dlg .h-tx-menus button:first-child').catch(() => {});
                await pg.waitForTimeout(200);
                assert.doesNotMatch(await pg.evaluate(() => [...document.querySelectorAll('.ui-actmenu')].map(m => m.textContent).join(' ')), /Mettre le texte dans le média/);
                assert.deepEqual(errs, []); await ctx.close();
            });
        }
        await t('visionneuse (1440 et 390) : la case montre le texte unique, la sorte, l’état, les zones et « 📜 Ouvrir dans l’Atelier » ; plusieurs actes : la case en lecture', async () => {
            for (const vp of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
                const {ctx, pg, errs} = await open(vp);
                await pg.evaluate(() => window.LCNDA_EXT.openDocMedia(1));
                await pg.waitForSelector('#lightbox-acts [data-lbact-new]', {timeout: 15000});
                assert.match(await pg.inputValue('#lightbox-transcription'), /Fiche matricule/);
                const box = await pg.textContent('#lightbox-acts');
                assert.match(box, /Registre militaire/); assert.match(box, /zone/); assert.match(box, /Jean DURAND/);
                assert.equal(await pg.isVisible('#act-transcriber-open'), false, 'un seul bouton pour l’Atelier');
                await pg.locator('#lightbox-acts').scrollIntoViewIfNeeded(); await shot(pg, `visionneuse-${vp.width}`);
                await pg.evaluate(() => document.getElementById('lightbox').close());
                await pg.evaluate(() => window.LCNDA_EXT.openDocMedia(3));
                await pg.waitForFunction(() => document.getElementById('lightbox-transcription')?.readOnly === true, null, {timeout: 15000});
                assert.equal(await pg.locator('#lightbox-acts [data-lbact-open]').count(), 2, 'un bloc par acte');
                assert.deepEqual(errs, []); await ctx.close();
            }
        });
        await t('fiche de Pierre DURAND (1440 et 390) : bloc « 📜 Actes et transcriptions » ; fiche de Jean : « relevé, à relier », Relier puis ↶ Annuler', async () => {
            for (const vp of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
                const {ctx, pg, errs} = await open(vp);
                await pg.evaluate(() => window.LCNDA_APP.openPersonById(1));
                await pg.waitForSelector('.h-pacts [data-pacts-row]', {timeout: 30000, state: 'attached'}); await pg.evaluate(() => { const s = document.querySelector('.h-pacts')?.closest('[data-fsec]'); const b = s && document.querySelector(`[data-fsec-tab="${s.dataset.fsec}"]`); if (b && !b.classList.contains('is-active')) b.click(); if (s?.classList.contains('is-folded')) s.querySelector('[data-fsec-fold]')?.click(); }); await pg.waitForTimeout(400); await pg.evaluate(() => document.querySelector('.h-pacts')?.scrollIntoView({block: 'center'})); await pg.waitForTimeout(300);
                assert.match(await pg.textContent('.h-pacts'), /Registre militaire · Pierre DURAND/);
                assert.match(await pg.textContent('.h-pacts'), /sujet/);
                assert.equal(await noSide(pg), true);
                await pg.evaluate(() => { const s = document.querySelector('.h-pacts')?.closest('[data-fsec]'); const b = s && document.querySelector(`[data-fsec-tab="${s.dataset.fsec}"]`); if (b && !b.classList.contains('is-active')) b.click(); if (s?.classList.contains('is-folded')) s.querySelector('[data-fsec-fold]')?.click(); }); await pg.waitForTimeout(400); await pg.evaluate(() => document.querySelector('.h-pacts')?.scrollIntoView({block: 'center'})); await pg.waitForTimeout(300); await shot(pg, `fiche-${vp.width}`);
                await pg.click('.h-pacts [data-pacts-more]'); await pg.waitForSelector('.ui-actmenu');
                const items = await pg.$$eval('.ui-actmenu .ui-actmenu-i', b => b.map(x => x.textContent.trim()));
                assert.ok(items.some(x => /Atelier/.test(x)) && items.some(x => /Page du document/.test(x)), items.join(' | '));
                await pg.keyboard.press('Escape');
                assert.deepEqual(errs, []); await ctx.close();
            }
            const {ctx, pg, errs} = await open({width: 1440, height: 900});
            await pg.evaluate(() => window.LCNDA_APP.openPersonById(2));
            await pg.waitForSelector('.h-pacts [data-pacts-link]', {timeout: 30000, state: 'attached'}); await pg.evaluate(() => { const s = document.querySelector('.h-pacts')?.closest('[data-fsec]'); const b = s && document.querySelector(`[data-fsec-tab="${s.dataset.fsec}"]`); if (b && !b.classList.contains('is-active')) b.click(); if (s?.classList.contains('is-folded')) s.querySelector('[data-fsec-fold]')?.click(); }); await pg.waitForTimeout(400); await pg.evaluate(() => document.querySelector('.h-pacts')?.scrollIntoView({block: 'center'})); await pg.waitForTimeout(300);
            assert.match(await pg.textContent('.h-pacts'), /à relier/);
            await pg.click('.h-pacts [data-pacts-link]');
            await pg.waitForSelector('.h-pacts [data-pacts-open]', {timeout: 15000, state: 'attached'});
            assert.equal(await pg.locator('.h-pacts [data-pacts-link]').count(), 0);
            await pg.click('.toast-region button:has-text("Annuler")');
            await pg.waitForSelector('.h-pacts [data-pacts-link]', {timeout: 15000, state: 'attached'});
            assert.deepEqual(errs, []); await ctx.close();
        });
        await t('page d’un document sans acte ni texte : « 📜 Atelier de transcription » en haut ouvre l’Atelier', async () => {
            php(`$pdo->exec("INSERT INTO media(id,title,filename,thumbnail,media_type,transcription) VALUES(99,'annibal05','m.jpg','m.jpg','image','')"); echo json_encode(1);`);
            const {ctx, pg, errs} = await open({width: 1440, height: 900}, '#documents/99');
            await pg.waitForSelector('[data-ong-tx]', {timeout: 30000});
            await pg.click('[data-ong-tx]');
            await pg.waitForSelector('dialog.h-tx-dlg[open]', {timeout: 15000});
            assert.equal(await pg.inputValue('dialog.h-tx-dlg [data-tx="title"]'), 'annibal05');
            assert.deepEqual(errs, []); await ctx.close();
        });
    } finally { await browser.close(); proc.kill(); }
    console.log(fails ? `✗ ${fails} échec(s)` : '✓ tout est bon');
    process.exit(fails ? 1 : 0);
})();
