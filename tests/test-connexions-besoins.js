#!/usr/bin/env node
/* 🧩 Connexions, étapes 3 et 4 : les besoins (lib/connexions_besoins.php, assets/js/heritage-connexions-besoins.js ;
 * maquette docs/design/connexions-besoins.html). Base temporaire, noms fictifs (MAZAUD, LACOMBE, DURAND).
 *  1. serveur : une piste « à explorer » dit ce qui lui manque (devinée d'après son titre, ou écrite) ; les fournisseurs hors ligne
 *     répondent (✓ Atelier, ✓ Médias, 🚫 Journal, 🔎 Où chercher / Courriers) ; « Cet acte répond à… » (presque sûr / ressemblance) ;
 *     ranger (+ ↶), « Pas lui » (+ ↶) ; « Mettre dans… » une carte (ce qui n'a pas de position est rendu) ; ce qui manque au livre,
 *     à la monographie ; Ma semaine → tous les besoins ;
 *  2. écran : la ligne « 🧩 Il manque… » sur les pistes à explorer, la pastille « 🧩 1 », « Ranger » + ↶ ; ✎ « Ce que cette piste
 *     cherche » (+ ↶) ; « ＋ Ajouter → 🧩 Un besoin… » ; l'Atelier enregistre l'acte → le message « Cet acte répond au besoin de… »,
 *     réglable (⚙ : jamais → plus de message) ; Ma semaine en grand → onglet « 🧩 Ce qui manque » ; Réglages ; le livre ; la monographie ;
 *     la carte (📍 Mettre dans… → 📌 épingles, couche des cartes) ; la petite carte vide propose de placer les lieux ; 390 px ; aucune erreur.
 *   node tests/test-connexions-besoins.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const zlib = require('zlib');
const {spawn, spawnSync} = require('child_process');
const root = path.join(__dirname, '..');
let fails = 0;
const ONLY = process.env.CXN_ONLY ? new RegExp(process.env.CXN_ONLY) : null;
const t = async (name, fn) => { if (ONLY && !ONLY.test(name)) return; try { await t.before?.(); await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// une petite image PNG (gris) pour l'acte de l'Atelier
const crc32 = buf => { let c, crc = 0xFFFFFFFF; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xFF; for (let q = 0; q < 8; q++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
const png = (w, h) => { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; const raw = Buffer.alloc((w * 3 + 1) * h, 200); for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); };

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-cxn-'));
    fs.mkdirSync(path.join(tmp, 'media'), {recursive: true});
    fs.writeFileSync(path.join(tmp, 'media', 'naissance-mazaud.png'), png(400, 300));
    fs.writeFileSync(path.join(tmp, 'media', 'portrait-lacombe.png'), png(60, 80));
    let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
    const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; require_once 'lib/transcriptions.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1),(2,'Marie','LACOMBE','female','deceased',0),(3,'Pierre','DURAND','male','deceased',0)");
$pl = $pdo->prepare("INSERT INTO places(id,name,county,country,latitude,longitude) VALUES(?,?,?,'France',?,?)");
$pl->execute([1,'Tulle','Corrèze',45.2675,1.7711]); $pl->execute([2,'Naves','Corrèze',null,null]);
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$ev = $pdo->prepare("INSERT INTO events(id,scope,person_id,event_type_id,date_text,year,sort_date,place_id) VALUES(?,'person',?,?,?,?,?,?)");
$ev->execute([1,1,$t('BIRT'),'3 mai 1872',1872,'1872-05-03',1]); $ev->execute([2,3,$t('BIRT'),'12 mars 1850',1850,'1850-03-12',2]);
$pdo->exec("INSERT INTO investigations(id,person_id,title,status) VALUES(1,1,'Les parents de Jean MAZAUD','open'),(2,2,'Le portrait de Marie LACOMBE','open')");
$pdo->exec("INSERT INTO investigation_items(id,investigation_id,kind,title,status) VALUES(1,1,'source','Acte de naissance ou de baptême','to_explore_priority'),(2,1,'source','Acte de mariage (il nomme les parents)','to_explore'),(3,1,'source','Recensements : le foyer et ses voisins','explored'),(4,2,'lead','Une photo de Marie','to_explore')");
$pdo->exec("INSERT INTO media(id,title,media_type,filename) VALUES(1,'Naissance, Tulle 1872','image','naissance-mazaud.png'),(2,'Marie LACOMBE vers 1900','image','portrait-lacombe.png')");
$pdo->exec("INSERT INTO media_links(media_id,entity_type,entity_id) VALUES(2,'person',2)");
$pdo->exec("INSERT INTO research_journal(person_id,title,body,result) VALUES(1,'Acte de mariage des parents','Tulle 1860-1870','Rien trouvé dans les tables décennales')");
$pdo->exec("INSERT INTO hypotheses(id,person_id,title,status) VALUES(1,1,'Jean né à Tulle ou à Naves ?','open')");
$pdo->exec("INSERT INTO archive_digest_entries(place_id,city_name,year_text,record_type,status) VALUES(1,'Tulle','1850','naissance','done')");
act_transcriptions_ensure($pdo);
$body = "L'an mil huit cent soixante-douze, le trois mai, est né Jean Mazaud, fils de Pierre Mazaud et de Marie Lacombe.\n";
$data = ['zones' => [], 'people' => [['name' => 'Jean Mazaud', 'role' => 'sujet', 'person_id' => 1, 's' => 0, 'e' => 0]], 'status' => 'doing'];
$pdo->prepare("INSERT INTO act_transcriptions(id,title,kind,media_id,date_text,place,body,data_json) VALUES(1,'Naissance de Jean MAZAUD','naissance',1,'3 mai 1872','Tulle',?,?)")->execute([$body, json_encode($data, JSON_UNESCAPED_UNICODE)]);
echo json_encode(['ok' => 1]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const pt = s.address().port; s.close(() => res(pt)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 150; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
        const p = await ctx.newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.cxNeeds && window.LCNDA_EXT?.connexions && window.LCNDA_APP?.defaultMaintenanceTabs, null, {timeout: 60000});
        assert.ok(await p.evaluate(() => !!document.querySelector('script[src*="heritage-connexions-besoins.js?v="]')), 'index.php charge heritage-connexions-besoins.js');
        const api = (x, q = {}) => p.evaluate(([y, z]) => window.LCNDA_APP.api(y, {...z, _t: String(Date.now() + Math.random())}).catch(e => ({error: e.message})), [x, q]);
        const cx = (op, body = {}) => p.evaluate(([o, b]) => window.LCNDA_APP.api('cx_write', {}, {method: 'POST', body: {op: o, ...b}}).then(r => r?.result ?? r).catch(e => ({error: e.message})), [op, body]);
        const go = (mod, set = {}) => p.evaluate(([m, s]) => { const A = window.LCNDA_APP; Object.assign(A.state, s); A.setModule(m); }, [mod, set]);
        const clickUndo = async re => { const b = re ? p.locator('.toast', {hasText: re}).last().locator('button', {hasText: '↶'}) : p.locator('.toast button', {hasText: '↶'}).last(); await b.waitFor({timeout: 10000}); await b.click(); await sleep(500); };
        const clearToasts = () => p.evaluate(() => document.querySelectorAll('.toast').forEach(x => x.remove()));
        t.before = () => p.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); document.querySelectorAll('.ui-actmenu').forEach(x => x.remove()); }).catch(() => {});
        const openInv = async id => { await go('enquetes', {enquetesTab: 'enquetes', currentInvestigationId: id, investigationFolderId: 0}); await p.waitForSelector('.investigation-detail', {timeout: 20000}); };
        const needsOf = async inv => (await api('cx_needs', {investigation_id: inv}));

        /* ═════════ 1. le serveur ═════════ */
        await t('une piste « à explorer » dit ce qui lui manque, deviné d’après son titre (personne, lieu et années connus de la fiche) ; pas une piste explorée', async () => {
            const r = await needsOf(1);
            const n1 = r.needs.find(n => n.item_id === 1), n2 = r.needs.find(n => n.item_id === 2);
            assert.ok(n1 && n2, JSON.stringify(r).slice(0, 400)); assert.ok(!r.needs.some(n => n.item_id === 3), 'la piste explorée ne demande rien');
            assert.deepStrictEqual([n1.what, n1.person, n1.place, n1.year_from, n1.year_to, n1.guessed], ['birth', 'Jean MAZAUD', 'Tulle', 1870, 1874, true]);
            assert.strictEqual(n2.what, 'marriage');
            assert.ok(r.hypotheses.some(h => /Tulle ou à Naves/.test(h.title)), 'les hypothèses de la personne, pour trancher');
        });
        await t('les fournisseurs : ✓ Atelier (l’acte transcrit qui nomme Jean), 🚫 Journal (« rien trouvé »), 🔎 Où chercher et Courriers ; « 🧩 1 » réponse', async () => {
            const r = await needsOf(1), n1 = r.needs.find(n => n.item_id === 1), n2 = r.needs.find(n => n.item_id === 2);
            const a = n1.answers.find(x => x.have === 'yes'); assert.ok(a, JSON.stringify(n1.answers));
            assert.deepStrictEqual([a.provider, a.kind, a.ref_id, a.sure], ['atelier', 'act', 1, true]);
            assert.ok(n1.answers.some(x => x.provider === 'ou_chercher') && n1.answers.some(x => x.provider === 'courrier'));
            assert.ok(n2.answers.some(x => x.have === 'searched' && x.provider === 'journal' && /Rien trouvé/.test(x.value)), JSON.stringify(n2.answers));
            assert.strictEqual(r.have, 1);
            const r2 = await needsOf(2); const ph = r2.needs.find(n => n.item_id === 4);
            assert.strictEqual(ph.what, 'photo'); assert.ok(ph.answers.some(x => x.provider === 'media' && x.ref_id === 2), '✓ Médias : la photo de Marie');
        });
        await t('écrire le besoin (quoi · qui · où · quand · hypothèse) puis ↶ : il redevient deviné', async () => {
            const r = await cx('need_set', {item_id: 2, what: 'marriage', person_id: 1, place_name: 'Naves', year_from: 1871, year_to: 1860, hypothesis_id: 1});
            assert.ok(r.id > 0, JSON.stringify(r)); assert.strictEqual(r.prev, null);
            let n2 = (await needsOf(1)).needs.find(n => n.item_id === 2);
            assert.deepStrictEqual([n2.guessed, n2.place, n2.year_from, n2.year_to, n2.hypothesis_id, n2.hypothesis], [false, 'Naves', 1860, 1871, 1, 'Jean né à Tulle ou à Naves ?']);
            await cx('need_restore', {id: r.id, prev: r.prev});
            n2 = (await needsOf(1)).needs.find(n => n.item_id === 2); assert.strictEqual(n2.guessed, true);
        });
        await t('« Cet acte répond à… » : presque sûr (même personne et même sorte), par la fiche reliée ou le nom dans le texte ; rien pour une autre sorte ou une autre personne', async () => {
            let m = (await cx('need_match', {kind: 'act', ref_id: 99, what: 'naissance', person_ids: [1], year: 1872})).matches;
            assert.ok(m.some(x => x.item_id === 1 && x.level === 'sure' && x.investigation_title === 'Les parents de Jean MAZAUD'), JSON.stringify(m).slice(0, 300));
            m = (await cx('need_match', {kind: 'act', ref_id: 99, what: 'bapteme', names: ['Jean Mazaud'], date: '1873'})).matches; assert.ok(m.some(x => x.item_id === 1 && x.level === 'sure'));
            m = (await cx('need_match', {kind: 'act', ref_id: 99, what: 'naissance', person_ids: [1], year: 1900})).matches; assert.ok(m.some(x => x.item_id === 1 && x.level === 'close'), 'une autre année : seulement une ressemblance');
            assert.deepStrictEqual((await cx('need_match', {kind: 'act', ref_id: 99, what: 'deces', person_ids: [1]})).matches, []);
            assert.deepStrictEqual((await cx('need_match', {kind: 'act', ref_id: 99, what: 'naissance', person_ids: [3], names: ['Pierre DURAND']})).matches, []);
        });
        await t('ranger la réponse : la pièce sur la piste, le besoin rempli ; ↶ défait les deux', async () => {
            const r = await cx('need_file', {item_id: 1, need: {what: 'birth', person_id: 1}, item: {kind: 'act', ref_id: 1, title: 'Naissance de Jean MAZAUD', origin: {kind: 'act', id: 1, label: 'Atelier'}}});
            assert.ok(r.receive && r.need_id, JSON.stringify(r));
            let d = await api('investigation', {id: 1}); assert.ok(d.items.find(x => x.id === 1).links.some(l => l.entity_type === 'act' && l.entity_id === 1));
            let n1 = (await needsOf(1)).needs.find(n => n.item_id === 1); assert.strictEqual(n1.state, 'done'); assert.strictEqual(n1.filled.title, 'Naissance de Jean MAZAUD');
            assert.deepStrictEqual((await cx('need_match', {kind: 'act', ref_id: 1, what: 'naissance', person_ids: [1]})).matches.filter(x => x.item_id === 1), [], 'un besoin rempli ne demande plus rien');
            await cx('need_file_undo', r);
            d = await api('investigation', {id: 1}); assert.ok(!d.items.find(x => x.id === 1).links.some(l => l.entity_type === 'act'));
            n1 = (await needsOf(1)).needs.find(n => n.item_id === 1); assert.strictEqual(n1.state, 'open'); assert.strictEqual(n1.guessed, true);
        });
        await t('« Pas lui » : l’acte n’est plus proposé pour ce besoin ; ↶ le remet', async () => {
            const r = await cx('need_skip', {item_id: 1, need: {what: 'birth', person_id: 1}, key: 'act:1'});
            let n1 = (await needsOf(1)).needs.find(n => n.item_id === 1); assert.ok(!n1.answers.some(x => x.provider === 'atelier'));
            assert.deepStrictEqual((await cx('need_match', {kind: 'act', ref_id: 1, what: 'naissance', person_ids: [1]})).matches.filter(x => x.item_id === 1), []);
            await cx('need_unskip', {need_id: r.need_id, key: 'act:1', created: r.created ? 1 : 0});
            n1 = (await needsOf(1)).needs.find(n => n.item_id === 1); assert.ok(n1.answers.some(x => x.provider === 'atelier')); assert.strictEqual(n1.guessed, true);
        });
        await t('🗺 « Mettre dans… » une carte : un lieu, une info avec lat / lon, un ensemble ; ce qui n’a pas de position est rendu ; retirer et ↶', async () => {
            const r = await cx('map_add', {items: [{kind: 'place', ref_id: 1, title: 'Tulle (Corrèze)'}, {kind: 'place', ref_id: 2, title: 'Naves'}, {kind: 'datum', title: 'Moulin', value: 'vu en 1900', data: {lat: 45.3, lon: 1.8}},
                {kind: 'set', title: 'Châteaux', data: {columns: ['Nom', 'Lat', 'Lon'], rows: [['Château A', 45.1, 1.7], ['Château B', 'x', 1]]}}]});
            assert.strictEqual(r.ids.length, 3, JSON.stringify(r)); assert.deepStrictEqual(r.left, [1]);
            const l = (await api('cx_map')).items; assert.deepStrictEqual(l.map(x => x.title).sort(), ['Château A', 'Moulin', 'Tulle (Corrèze)']);
            const rm = await cx('map_remove', {ids: r.ids}); assert.strictEqual((await api('cx_map')).items.length, 0);
            await cx('map_restore', {rows: rm.removed}); assert.strictEqual((await api('cx_map')).items.length, 3);
            await cx('map_remove', {all: 1});
        });
        await t('📖 ce qui manque au livre (fiches sans photo, événements sans source) ; 📜 à la monographie de Tulle (1872 pas dépouillé)', async () => {
            const b = await api('cx_hints', {tool: 'book', scope: 'all'});
            const ph = b.rows.find(x => x.what === 'photo'); assert.ok(ph && ph.people.some(x => x.name === 'Jean MAZAUD') && !ph.people.some(x => x.name === 'Marie LACOMBE'), JSON.stringify(b));
            assert.ok(b.rows.some(x => x.what === 'source' && x.count === 2));
            const m = await api('cx_hints', {tool: 'place', place_id: 1});
            assert.deepStrictEqual(m.rows.find(x => x.what === 'digest')?.years, [1872]); assert.ok(m.rows.some(x => x.what === 'source'));
            assert.ok((await api('cx_hints', {tool: 'place', place_id: 2})).rows.some(x => x.what === 'coords'));
        });
        await t('🗓 Ma semaine → tous les besoins : par réponse (je l’ai, je peux le trouver, sans réponse) et les lieux sans position', async () => {
            const r = await api('cx_needs_all');
            assert.ok(r.rows.some(n => n.item_id === 1 && n.bucket === 'have'), JSON.stringify(r.counts)); assert.ok(r.rows.some(n => n.item_id === 4 && n.bucket === 'have'));
            assert.ok(r.computed.some(x => x.tool === 'map' && x.count === 1)); assert.strictEqual(r.counts.all, r.rows.length + r.computed.length);
        });

        /* ═════════ 2. l'écran ═════════ */
        await t('l’enquête : « 🧩 Il manque… » sur les pistes à explorer seulement ; la pastille « 🧩 1 » ; « Ranger » puis ↶', async () => {
            await openInv(1);
            await p.waitForSelector('.investigation-detail .cx-need', {timeout: 15000});
            const lines = await p.evaluate(() => [...document.querySelectorAll('.investigation-item[data-enq-piste]')].map(el => [Number(el.dataset.enqPiste), el.querySelector('.cx-need')?.textContent.replace(/\s+/g, ' ').trim() || '']));
            assert.match(lines.find(l => l[0] === 1)[1], /Il manque : 📜 Acte de naissance — Jean MAZAUD · Tulle · 1870–1874/); assert.match(lines.find(l => l[0] === 2)[1], /Acte de mariage/); assert.strictEqual(lines.find(l => l[0] === 3)[1], '');
            assert.match(await p.textContent('.cx-needs-pill'), /🧩 1/);
            assert.ok(await p.evaluate(() => document.querySelector('[data-cx-need="1"] .cx-need-ans').hidden), 'les réponses sont repliées');
            await p.click('.cx-needs-pill');
            assert.ok(await p.evaluate(() => !document.querySelector('[data-cx-need="1"] .cx-need-ans').hidden));
            assert.match(await p.textContent('[data-cx-need="1"] .cx-need-ans'), /je l’ai.*Atelier.*Naissance de Jean MAZAUD/s);
            await p.click('[data-cx-need="1"] [data-cx-ans-file]');
            await p.waitForFunction(() => /Trouvé/.test(document.querySelector('[data-cx-need="1"]')?.textContent || ''), null, {timeout: 15000});
            assert.ok((await api('investigation', {id: 1})).items.find(x => x.id === 1).links.some(l => l.entity_type === 'act'));
            await clickUndo(/Rangé dans la piste/);
            await p.waitForFunction(() => /Il manque/.test(document.querySelector('[data-cx-need="1"]')?.textContent || ''), null, {timeout: 15000});
            assert.ok(!(await api('investigation', {id: 1})).items.find(x => x.id === 1).links.some(l => l.entity_type === 'act'));
        });
        await t('✎ « Ce que cette piste cherche » : quoi, qui, où, quand, l’hypothèse ; enregistré, puis ↶', async () => {
            await openInv(1); await p.waitForSelector('[data-cx-need="2"] [data-cx-need-edit]', {timeout: 15000});
            await p.click('[data-cx-need="2"] [data-cx-need-edit]');
            await p.waitForSelector('dialog[open] .cx-need-form');
            assert.strictEqual(await p.inputValue('dialog[open] [name="what"]'), 'marriage');
            await p.fill('dialog[open] [name="y0"]', '1860'); await p.fill('dialog[open] [name="y1"]', '1871');
            await p.selectOption('dialog[open] [name="hyp"]', '1');
            await p.click('dialog[open] [type="submit"]');
            await p.waitForFunction(() => /1860–1871/.test(document.querySelector('[data-cx-need="2"]')?.textContent || ''), null, {timeout: 15000});
            assert.match(await p.textContent('[data-cx-need="2"]'), /Tulle ou à Naves/);
            await clickUndo(/Ce qui manque est noté/);
            await p.waitForFunction(() => !/1860–1871/.test(document.querySelector('[data-cx-need="2"]')?.textContent || 'x'), null, {timeout: 15000});
        });
        await t('« ＋ Ajouter » de l’enquête : « 🧩 Un besoin… » ; le ⋯ d’une piste : « 🧩 Ce qui manque… »', async () => {
            await openInv(1);
            await p.click('#add-investigation-item');
            await p.waitForSelector('.ui-actmenu');
            assert.match(await p.textContent('.ui-actmenu'), /Un besoin… \(quoi · qui · où · quand\)/);
            await p.keyboard.press('Escape'); await p.evaluate(() => document.querySelectorAll('.ui-actmenu').forEach(x => x.remove()));
            await p.click('[data-enq-pmenu="2"]'); await p.waitForSelector('.ui-actmenu');
            assert.match(await p.textContent('.ui-actmenu'), /Ce qui manque…/);
        });
        await t('l’Atelier enregistre l’acte → « Cet acte que tu viens de transcrire répond au besoin de l’enquête… » ; « 🕵️ Ranger dans l’enquête » + ↶', async () => {
            await clearToasts();
            await p.evaluate(() => window.LCNDA_EXT.openActTranscriber({id: 1}));
            await p.waitForSelector('dialog.h-tx-dlg [data-tx-cmd="save"]', {timeout: 20000}); await sleep(600);
            await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="save"]').click());
            const toastSel = p.locator('.toast', {hasText: 'répond au besoin de l’enquête « Les parents de Jean MAZAUD »'});
            await toastSel.first().waitFor({timeout: 15000});
            const btns = await toastSel.first().locator('button').allTextContents();
            assert.ok(btns.some(b => /Ranger dans l’enquête/.test(b)) && btns.includes('Pas lui') && btns.includes('⚙'), btns.join(' | '));
            await toastSel.first().locator('button', {hasText: 'Ranger dans l’enquête'}).click(); await sleep(800);
            assert.ok((await api('investigation', {id: 1})).items.find(x => x.id === 1).links.some(l => l.entity_type === 'act' && l.entity_id === 1));
            await clickUndo(/Rangé dans la piste/);
            assert.ok(!(await api('investigation', {id: 1})).items.find(x => x.id === 1).links.some(l => l.entity_type === 'act'));
            // une seule fois : enregistrer encore ne redit rien
            await clearToasts(); await p.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="save"]').click()); await sleep(1500);
            assert.strictEqual(await p.locator('.toast', {hasText: 'répond au besoin'}).count(), 0);
            await p.evaluate(() => { const d = document.querySelector('dialog.h-tx-dlg'); d?.querySelector('[data-tx-cmd="close"]')?.click(); }); await sleep(400);
            await p.evaluate(() => { const b = [...document.querySelectorAll('dialog[open] button')].find(x => /Fermer sans|Ne pas enregistrer|Fermer quand même/.test(x.textContent)); b?.click(); }); await sleep(300);
        });
        await t('le message se règle (⚙) : « Ne plus proposer » → plus de message ; « À chaque ressemblance » → aussi les ressemblances', async () => {
            await clearToasts();
            await p.evaluate(() => { localStorage.removeItem('genealogie-connexions-besoins'); });
            const ann = o => p.evaluate(x => window.LCNDA_EXT.cxNeeds.announce(x).then(l => l.map(m => m.level)), o);
            assert.deepStrictEqual(await ann({kind: 'act', ref_id: 501, what: 'naissance', person_ids: [1], year: 1900, title: 'Naissance ?'}), [], 'une ressemblance seulement : rien au départ');
            await p.evaluate(() => window.LCNDA_EXT.cxNeeds.msgMenu(document.body)); await p.waitForSelector('.ui-actmenu');
            await p.locator('.ui-actmenu button, .ui-actmenu [role="menuitem"]', {hasText: 'Ne plus proposer'}).first().click(); await sleep(300);
            assert.strictEqual(JSON.parse(await p.evaluate(() => localStorage.getItem('genealogie-connexions-besoins'))).msg, 'off');
            assert.deepStrictEqual(await ann({kind: 'act', ref_id: 502, what: 'naissance', person_ids: [1], year: 1872}), []);
            await clickUndo(/ne sera plus proposé/);
            await p.evaluate(() => localStorage.setItem('genealogie-connexions-besoins', JSON.stringify({msg: 'close'})));
            assert.deepStrictEqual(await ann({kind: 'act', ref_id: 503, what: 'naissance', person_ids: [1], year: 1900, title: 'Naissance ?'}), ['close']);
            assert.match(await p.locator('.toast', {hasText: 'répond au besoin'}).last().textContent(), /à vérifier/);
            await p.evaluate(() => localStorage.removeItem('genealogie-connexions-besoins'));
        });
        await t('🗓 Ma semaine en grand → onglet « 🧩 Ce qui manque » : le tableau, les filtres, « Ranger »', async () => {
            await p.evaluate(() => window.LCNDA_EXT.semaine.openNeeds());
            await p.waitForSelector('dialog.msr-big .cx-sem-table', {timeout: 20000});
            assert.ok(await p.evaluate(() => document.querySelector('dialog.msr-big [data-msr-tab="needs"]').classList.contains('is-active') && document.querySelector('dialog.msr-big .msr-big-bar').hidden));
            const txt = await p.textContent('dialog.msr-big .cx-sem-table');
            assert.match(txt, /Acte de naissance — Jean MAZAUD/); assert.match(txt, /Les parents de Jean MAZAUD/); assert.match(txt, /Photo — Marie LACOMBE/); assert.match(txt, /1 lieu sans coordonnées/);
            await p.click('dialog.msr-big [data-cx-sf="have"]');
            const rows = await p.evaluate(() => [...document.querySelectorAll('dialog.msr-big .cx-sem-table tbody tr')].map(r => r.textContent));
            assert.ok(rows.length >= 2 && rows.every(r => /✓/.test(r)), rows.join('\n'));
            await p.click('dialog.msr-big [data-msr-tab="todo"]');
            await p.waitForFunction(() => !document.querySelector('dialog.msr-big .cx-sem-table') && !document.querySelector('dialog.msr-big .msr-big-bar').hidden, null, {timeout: 10000});
            await p.evaluate(() => document.querySelector('dialog.msr-big')?.close());
        });
        await t('Réglages → 🧺 Panier et connexions : « 🧩 Les besoins » ; éteint → plus de ligne dans l’enquête ; ↶', async () => {
            await go('maintenance', {maintenanceTab: 'connexions'}); await p.waitForSelector('.cx-settings .cx-needs-settings');
            assert.match(await p.textContent('.cx-needs-settings'), /Seulement quand c’est presque sûr/);
            await p.evaluate(() => { const i = document.querySelector('[data-cxn-tg="on"]'); const inp = i.matches('input') ? i : i.querySelector('input'); inp.checked = false; inp.dispatchEvent(new Event('change', {bubbles: true})); });
            assert.strictEqual(JSON.parse(await p.evaluate(() => localStorage.getItem('genealogie-connexions-besoins'))).on, false);
            await openInv(1); await sleep(1200);
            assert.strictEqual(await p.locator('.cx-need').count(), 0);
            await p.evaluate(() => localStorage.removeItem('genealogie-connexions-besoins'));
        });
        await t('📖 le Livre de famille : « 🧩 N il manque des choses au livre », repliée', async () => {
            const html = await p.evaluate(async () => { const ws = document.getElementById('workspace'); ws.innerHTML = window.LCNDA_EXT.familyBookPanelHtml(); window.LCNDA_EXT.bindFamilyBook(() => '#');
                for (let i = 0; i < 50; i++) { const b = document.querySelector('[data-cx-book-hint]'); if (b && !b.hidden && b.textContent.trim()) return {open: b.open, text: b.textContent}; await new Promise(r => setTimeout(r, 200)); } return null; });
            assert.ok(html, 'la ligne repliée apparaît'); assert.strictEqual(html.open, false); assert.match(html.text, /il manque des choses au livre/); assert.match(html.text, /Pas de photo/);
        });
        await t('📜 la monographie : la partie « 🧩 Ce qui manque » (1872 pas dépouillé), passée s’il ne manque rien', async () => {
            const r = await p.evaluate(async () => { const s = window.LCNDA_EXT.monographSections.find(x => x.id === 'cx_manque'); const h = document.createElement('div'); const ok = await s.render({id: 1, name: 'Tulle'}, h, {}); return {ok, text: h.textContent}; });
            assert.strictEqual(r.ok, true); assert.match(r.text, /1872/);
        });
        await t('🗺 « 📍 Mettre dans… » une carte : la position trouvée, Naves reste (pas de position) ; 📌 sur la Carte et dans la couche des cartes', async () => {
            await clearToasts();
            const r = await p.evaluate(async () => { const C = window.LCNDA_EXT.connexions, tg = window.LCNDA_EXT.dropTargets.find(x => x.id === 'map');
                const res = await C.deliver(tg, [{kind: 'place', ref_id: 1, title: 'Tulle (Corrèze)'}, {kind: 'place', ref_id: 2, title: 'Naves'}], {ctx: {}}); return {left: res.left.map(x => x.title)}; });
            assert.deepStrictEqual(r.left, ['Naves']);
            assert.match(await p.locator('.toast').last().textContent(), /1 point sur la carte.*« Naves » : pas de position/s);
            const feats = await p.evaluate(async () => (await window.LCNDA_EXT.mapLayerSources.find(x => x.id === 'cx_map').run({})).features.map(f => f.label));
            assert.deepStrictEqual(feats, ['Tulle (Corrèze)']);
            await go('carte'); await p.waitForSelector('.map-layout .cx-pins-btn', {timeout: 20000});
            assert.match(await p.textContent('.cx-pins-btn'), /📌 1/);
            await p.waitForSelector('#cx-pins g', {state: 'attached', timeout: 10000}); // ce qu'on vient de mettre sur la carte se voit ; le bouton cache et remontre
            await p.click('.cx-pins-btn'); await p.waitForFunction(() => !document.querySelector('#cx-pins'), null, {timeout: 5000});
            await p.click('.cx-pins-btn'); await p.waitForSelector('#cx-pins g', {state: 'attached', timeout: 5000});
            const lap = await api('lieux_a_placer'); const sure = (lap.items || []).filter(x => x.status === 'sure').length;
            if (sure) { await p.waitForSelector('.map-layout .cx-maphint', {timeout: 15000}); assert.match(await p.textContent('.cx-maphint'), new RegExp(`✓ ${sure}`)); }
            assert.match(await p.evaluate(() => window.LCNDA_EXT.miniMap([], [])), /data-lap-open/);
        });
        await t('à 390 px : les lignes « Il manque » et leurs réponses ne débordent pas', async () => {
            await p.setViewportSize({width: 390, height: 844});
            await openInv(1); await p.waitForSelector('.cx-need', {timeout: 15000});
            await p.evaluate(() => document.querySelectorAll('.cx-need-ans').forEach(x => { x.hidden = false; }));
            const over = await p.evaluate(() => [...document.querySelectorAll('.cx-need, .cx-need *')].filter(e => e.offsetParent && e.getBoundingClientRect().right > innerWidth + 1).map(e => e.className || e.tagName).slice(0, 5));
            assert.deepStrictEqual(over, []);
            await p.setViewportSize({width: 1440, height: 900});
        });
        await t('aucune erreur JS', async () => { assert.deepStrictEqual(errs, []); });
    } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} échec(s)` : 'tout est bon');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
