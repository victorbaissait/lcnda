'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🔍 « Qui est sur cette photo ? » à plusieurs (lib/photo_ask.php, assets/js/heritage-photo-ask.js) et
 * 📮 Courriers tout prêts (lib/courriers_actes.php, assets/js/heritage-courriers-actes.js) :   node tests/test-photo-courriers.js
 * Un vrai « php -S » sur une base neuve, puis un navigateur (Playwright ; sinon la partie navigateur est sautée) :
 *  1. la demande : visages repérés et identifiés, noms proposés (jamais confidentiels, vivants seulement si coché) ;
 *  2. le fichier .html partagé : autonome, CSP stricte, rien d'autre de la base que les photos, les cadres et les noms choisis ;
 *  3. le cousin le remplit (fichier ouvert depuis le disque, 390 px) → .json ; réponses forgées refusées ;
 *  4. import : propositions, « c'est la même personne ? », accord / désaccord entre cousins, identifications, ↶ Annuler ;
 *  5. la lettre selon le cas (copie intégrale, extrait, recherche, transcription, dispense), le délai légal (75 ans, décès,
 *     plus de 100 ans), le destinataire (mairie, AD de « Services d'archives », Nantes), un modèle à soi ;
 *  6. rangement dans les courriers suivis (relance, Ma semaine de recherche, rappel), ↶ Annuler ;
 *  7. l'app à 1440 px, 390 px et en sombre : visionneuse, fiche (⋯), Questions aux proches, import, Registre de courriers, sans erreur.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
const SHOTS = process.env.PC_SHOTS || '';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-photo-courriers-'));
const dir = path.join(tmp, 'data');
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
const XSS = '<img src=x onerror="window.__pcx=1">';
{
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $p = db();
$y = date('Y');
$p->exec("INSERT INTO places(id,name,county,country,admin4_code) VALUES(1,'Tulle','Corrèze','France','19272'),(2,'Naves','Corrèze','France','19146'),(3,'Berlin','','Allemagne','')");
$p->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_private,is_start) VALUES
 (1,'Jean','BORIE','male','deceased',0,0),(2,'Marie','BORIE','female','deceased',0,0),(3,'Paul','BORIE','male','living',0,1),(4,'Anne','PEYRE','female','deceased',0,0),
 (5,'Pierre','BORIE','male','unknown',0,0),(6,'Louis','MARTIN','male','deceased',0,0),(7,'Sophie','VIDAL','female','unknown',0,0),(8,'Secrète','LEROY','female','deceased',1,0),(9,'Hans','MÜLLER','male','deceased',0,0)");
$t = fn($g) => "(SELECT id FROM event_types WHERE gedcom_tag='$g' LIMIT 1)";
$ev = $p->prepare('INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year,place_id) VALUES(CASE WHEN ? IS NULL THEN \'family\' ELSE \'person\' END,?,?,(SELECT id FROM event_types WHERE gedcom_tag=? LIMIT 1),?,?,?)');
foreach ([[1,null,'BIRT','1850',1850,1],[1,null,'DEAT','1920',1920,1],[2,null,'BIRT','3 avril 1880',1880,1],[2,null,'DEAT','5 juin 1950',1950,1],[4,null,'BIRT','1855',1855,2],[4,null,'DEAT','1930',1930,2],
  [5,null,'BIRT','12 mars '.($y-71),$y-71,1],[6,null,'BIRT','1875',1875,2],[6,null,'DEAT','1940',1940,2],[3,null,'BIRT','1990',1990,1],[8,null,'BIRT','1870',1870,1],[8,null,'DEAT','1940',1940,1],
  [9,null,'BIRT','4 mai 1930',1930,3],[9,null,'DEAT','2000',2000,3]] as $e) { $ev->execute([$e[0], ...$e]); }
$p->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,4),(2,6,2),(3,5,7)");
$p->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,2),(2,5),(3,3)");
$ev->execute([null,null,3,'MARR','20 juin 1985',1985,2]);
$p->exec("INSERT INTO archive_services(name,kind,dept_code,address,city,email) VALUES('Archives départementales de la Corrèze','ad','19','Rue Lucien Sampaix','Tulle','archives@correze.fr')");
foreach (['photo.jpg' => [1200, 800], 'photo2.jpg' => [900, 600]] as $f => [$w, $h]) {
  if (function_exists('imagecreatetruecolor')) { $im = imagecreatetruecolor($w, $h); imagefill($im, 0, 0, imagecolorallocate($im, 160, 140, 110)); imagejpeg($im, MEDIA_DIR.'/'.$f, 80); }
  else { file_put_contents(MEDIA_DIR.'/'.$f, base64_decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=')); }
}
$p->exec("INSERT INTO media(id,title,filename,media_type,date_text) VALUES(1,'Mariage 1925','photo.jpg','image','1925'),(2,'Communion','photo2.jpg','image','')");
$p->exec("INSERT INTO media_links(media_id,entity_type,entity_id,position) VALUES(1,'person',2,1),(1,'person',8,1),(1,'person',3,1),(2,'person',6,1)");
$p->exec("INSERT INTO media_tags(id,media_id,person_id,tag_type,x,y,w,h,confidence,note) VALUES(1,1,1,'person',10,10,10,15,'certain','')");
faces_ensure($p);
$d = base64_encode(str_repeat("\0", 512));
$fp = $p->prepare('INSERT INTO face_prints(media_id,x,y,w,h,score,descriptor,tag_id,status) VALUES(?,?,?,?,?,?,?,?,?)');
$fp->execute([1,10,10,10,15,.9,$d,1,'']); $fp->execute([1,40,12,10,15,.9,$d,null,'']); $fp->execute([1,70,14,10,15,.9,$d,null,'']);
$p->exec("INSERT INTO face_scans(media_id,faces,model) VALUES(1,3,'test')");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
    if (r.status !== 0 || !String(r.stdout).endsWith('ok')) { console.error(r.stderr || r.stdout); process.exit(1); }
}
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

(async () => {
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const page0 = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(page0.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const get = async (action, q = '') => { const r = await fetch(`${base}api.php?action=${action}${q ? '&' + q : ''}`, { headers: { Cookie: cookie } }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
    const postTo = async (action, body, token = csrf) => { const r = await fetch(base + 'api.php?action=' + action, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ ...body, csrf: token }) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
    const pa = (body, token) => postTo('pa_write', body, token);
    const cl = (body, token) => postTo('cl_write', body, token);
    const out = {}; const checks = [];
    let browser = null;
    try {
        /* ── 1. la demande ── */
        out.faces = await get('pa_faces', 'ids=1,2,999');
        const ph1 = out.faces.body.photos[0];
        const faces = ph1.faces.map(f => ({ media_id: 1, print_id: f.print_id, tag_id: f.tag_id, x: f.x, y: f.y, w: f.w, h: f.h }));
        faces.push({ media_id: 2, x: 20, y: 20, w: 15, h: 20 }); // un cadre tracé à la main
        faces.push({ media_id: 999, x: 1, y: 1, w: 5, h: 5 }); // une photo qui n'est pas dans la demande : écartée
        out.save = await pa({ op: 'save', title: `Le mariage ${XSS}`, intro: 'Coucou\n<script>alert(1)</script>', media_ids: [1, 2], faces, names: [2, 3, 8, 1, 6, 999] });
        const ask = out.save.body.ask;
        out.saveLiving = await pa({ op: 'save', title: 'Avec les vivants', media_ids: [1], faces: faces.slice(0, 1), names: [3, 8], include_living: 1 });
        out.noFace = await pa({ op: 'save', title: 'X', media_ids: [1], faces: [] });
        out.noTitle = await pa({ op: 'save', title: ' ', media_ids: [1], faces });
        out.tooMany = await pa({ op: 'save', title: 'X', media_ids: Array.from({ length: 13 }, (_, i) => i + 1), faces });
        out.noCsrf = await pa({ op: 'save', title: 'X', media_ids: [1], faces }, 'mauvais');
        checks.push(['la demande : visages repérés et identifiés, cadre à la main, noms filtrés (pas de confidentiel, pas de vivant sans la case)', () => {
            assert.equal(out.faces.status, 200); assert.equal(out.faces.body.photos.length, 2); assert.equal(ph1.faces.length, 3);
            assert.equal(ph1.faces[0].person.name, 'Jean BORIE'); assert.deepEqual(ph1.linked.sort(), [2, 3, 8]);
            assert.equal(out.save.status, 200); assert.equal(ask.face_count, 4); assert.equal(ask.photo_count, 2);
            assert.deepEqual(ask.names.map(n => n.label), ['Marie BORIE (1880–1950)', 'Jean BORIE (1850–1920)', 'Louis MARTIN (1875–1940)']);
            assert.deepEqual(out.save.body.dropped, { living: 1, private: 1 });
            assert.deepEqual(out.saveLiving.body.ask.names.map(n => n.person_id), [3]); // le vivant coché passe, la fiche confidentielle jamais
            assert.equal(out.noFace.status, 422); assert.equal(out.noTitle.status, 422); assert.equal(out.tooMany.status, 422); assert.ok([403, 419].includes(out.noCsrf.status));
        }]);
        /* ── 2. le fichier partagé ── */
        out.file = await pa({ op: 'render', id: ask.id, mode: 'file' });
        const html = out.file.body.html || '';
        fs.writeFileSync(path.join(tmp, 'demande.html'), html);
        out.list = await get('pa_list');
        checks.push(['le fichier .html : autonome (CSP stricte, rien d’extérieur), échappé, seulement photos + cadres + noms choisis', () => {
            assert.equal(out.file.status, 200); assert.match(out.file.body.filename, /^qui-est-sur-la-photo-.*\.html$/);
            assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:;[^"]*connect-src 'none'">/);
            assert.ok(!/(src|href)\s*=\s*["']?(https?:|\/\/)/i.test(html), 'aucune ressource extérieure');
            assert.ok(!/<script[^>]+src=/i.test(html)); assert.ok(!/<(link|iframe|object|embed|form[^>]+action)/i.test(html));
            assert.equal((html.match(/<img src="data:image\/jpeg;base64,/g) || []).length, 2);
            assert.equal((html.match(/class="pa-box"/g) || []).length, 4);
            assert.ok(html.includes('Marie BORIE (1880–1950)') && html.includes('Louis MARTIN (1875–1940)'));
            for (const no of ['Paul', 'LEROY', 'Secrète', 'PEYRE', 'Pierre', 'VIDAL', 'MÜLLER', 'Tulle', 'Naves', 'person_id', 'print_id', 'photo.jpg']) assert.ok(!html.includes(no), `pas de « ${no} » dans le fichier`);
            assert.ok(!html.includes(XSS) && html.includes('&lt;img src=x onerror=') && !html.includes('<script>alert'));
            const data = JSON.parse(html.match(/<script id="pa-data" type="application\/json">([^<]*)<\/script>/)[1]);
            assert.deepEqual(Object.keys(data).sort(), ['ask', 'checksum', 'faces', 'format', 'names', 'title']);
            assert.deepEqual(Object.keys(data.names[0]).sort(), ['k', 'label']);
            assert.equal(out.list.body.asks.find(a => a.id === ask.id).status, 'sent');
        }]);
        /* ── 3. le cousin, dans son navigateur ── */
        let reply = null;
        const forge = (over = {}, answers = null) => JSON.stringify({ format: 'lcnda-visages-reponses', version: 1, ask: ask.uid, checksum: out.file.body.checksum, title: ask.title, from: 'Cousine Anne', saved_at: new Date().toISOString(),
            answers: answers || [{ face: 'f2', name: 'Marie BORIE (1880–1950)', pick: 'n1', note: 'Au mariage' }, { face: 'f3', name: 'louis martin', pick: '', note: '' }], sum: '0', ...over });
        if (chromium) {
            browser = await chromium.launch();
            const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 390, height: 844 } });
            const p = await ctx.newPage(); const cerr = [];
            p.on('pageerror', e => cerr.push(e.message)); p.on('console', m => { if (m.type() === 'error') cerr.push(m.text()); });
            p.on('request', r => { if (!/^(file|data|blob):/.test(r.url())) cerr.push('requête ' + r.url()); });
            await p.goto('file://' + path.join(tmp, 'demande.html'));
            await p.click('.pa-box[data-face="f2"]');
            const focused = await p.evaluate(() => document.activeElement?.getAttribute('data-name'));
            await p.fill('[data-name="f2"]', 'Marie BORIE (1880–1950)'); await p.fill('[data-note="f2"]', `Au mariage ${XSS}`);
            await p.fill('[data-name="f3"]', 'louis martin');
            await p.fill('#pa-from', 'Cousine Anne');
            await p.waitForTimeout(700);
            const kept = await p.textContent('#pa-state');
            await p.reload(); await p.waitForTimeout(200);
            const back = await p.inputValue('[data-name="f3"]');
            const done = await p.$$eval('.pa-box.is-done', l => l.length);
            if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'cousin-390.png'), fullPage: false });
            const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#pa-save')]);
            const jp = path.join(tmp, 'reponses.json'); await dl.saveAs(jp); reply = fs.readFileSync(jp, 'utf8');
            const hs = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
            out.cousin = { focused, kept, back, done, name: dl.suggestedFilename(), hs, cerr };
            await ctx.close();
            checks.push(['le cousin (390 px) : clic sur un visage → sa case, réponses gardées, .json signé, sans requête ni HTML', () => {
                const C = out.cousin; assert.equal(C.focused, 'f2'); assert.match(C.kept, /Gardé sur cet ordinateur/); assert.equal(C.back, 'louis martin'); assert.equal(C.done, 2);
                assert.equal(C.name, 'reponses-visages.json'); assert.equal(C.hs, false); assert.deepEqual(C.cerr, []);
                const j = JSON.parse(reply); assert.equal(j.ask, ask.uid); assert.equal(j.checksum, out.file.body.checksum); assert.equal(j.answers.length, 2);
                assert.equal(j.answers[0].pick, 'n1'); assert.ok(!/[<>]/.test(j.answers[0].note));
            }]);
        } else { console.log('— Playwright absent : partie navigateur sautée (réponses fabriquées)'); reply = forge(); }
        /* ── réponses forgées ── */
        const bad = {
            checksum: forge({ checksum: 'a'.repeat(32) }), unknownAsk: forge({ ask: 'b'.repeat(32) }), extra: forge({ person_id: 3 }), version: forge({ version: 2 }),
            html: forge({}, [{ face: 'f2', name: '<b>Marie</b>', pick: '', note: '' }]), htmlNote: forge({}, [{ face: 'f2', name: 'Marie', pick: '', note: 'a <script>x</script>' }]),
            face: forge({}, [{ face: 'f99', name: 'Marie', pick: '', note: '' }]), pick: forge({}, [{ face: 'f2', name: 'X', pick: 'n99', note: '' }]),
            twice: forge({}, [{ face: 'f2', name: 'A', pick: '', note: '' }, { face: 'f2', name: 'B', pick: '', note: '' }]), extraAnswer: forge({}, [{ face: 'f2', name: 'A', pick: '', note: '', person_id: 2 }]),
            type: forge({ from: 42 }), list: forge({ answers: { a: 1 } }), json: '{pas du json', big: forge({ title: 'x'.repeat(320 * 1024) }), notObj: '[1,2]', otherFormat: JSON.stringify({ format: 'lcnda-reponses' }),
        };
        out.bad = {};
        for (const [k, f] of Object.entries(bad)) out.bad[k] = (await pa({ op: 'analyze', file: f })).status;
        out.badImport = (await pa({ op: 'import', file: bad.extra, choices: [] })).status;
        checks.push(['réponses forgées refusées : somme de contrôle, demande inconnue, champs en plus, HTML, visage ou nom inconnus, types, taille', () => {
            for (const [k, s] of Object.entries(out.bad)) assert.equal(s, 422, `« ${k} » doit être refusé (${s})`);
            assert.equal(out.badImport, 422);
        }]);
        /* ── 4. import ── */
        out.analyze = await pa({ op: 'analyze', file: reply });
        out.importNoPerson = await pa({ op: 'import', file: reply, choices: [{ face: 'f2', action: 'accept', person_id: 0 }] });
        const tagsBefore = (await get('pa_faces', 'ids=1')).body.photos[0].faces.filter(f => f.person_id).length;
        out.import = await pa({ op: 'import', file: reply, choices: [{ face: 'f2', action: 'accept', person_id: 2 }, { face: 'f3', action: 'accept', person_id: 6 }] });
        out.again = await pa({ op: 'import', file: reply, choices: [] });
        const after1 = (await get('pa_faces', 'ids=1')).body.photos[0];
        // un deuxième cousin : d'accord pour f2, pas d'accord pour f3
        const reply2 = forge({ from: 'Cousin Marc' }, [{ face: 'f2', name: 'Marie BORIE (1880–1950)', pick: 'n1', note: '' }, { face: 'f3', name: 'Pierre Borie', pick: '', note: 'je crois' }]);
        out.analyze2 = await pa({ op: 'analyze', file: reply2 });
        out.import2 = await pa({ op: 'import', file: reply2, choices: [{ face: 'f2', action: 'accept', person_id: 2 }, { face: 'f3', action: 'refuse' }] });
        out.get = await get('pa_get', 'id=' + ask.id);
        out.undo2 = await pa({ op: 'undo_import', id: ask.id });
        out.undo1 = await pa({ op: 'undo_import', id: ask.id });
        const after0 = (await get('pa_faces', 'ids=1')).body.photos[0];
        out.undoNone = await pa({ op: 'undo_import', id: ask.id });
        checks.push(['import : propositions (nom choisi, « c’est la même personne ? »), identifications créées, accord / désaccord, ↶ Annuler', () => {
            const A = out.analyze.body; assert.equal(out.analyze.status, 200); assert.equal(A.answers.length, 2); assert.equal(A.from, 'Cousine Anne');
            assert.equal(A.answers[0].person.id, 2); assert.equal(A.answers[0].suggest, 'accept'); assert.ok(!A.answers[0].note.includes('<'));
            assert.equal(A.answers[1].person, null); assert.deepEqual(A.answers[1].candidates.map(c => c.id), [6]); assert.equal(A.answers[1].state, 'alone');
            assert.equal(out.importNoPerson.status, 422);
            assert.equal(out.import.status, 200); assert.equal(out.import.body.counts.accept, 2); assert.equal(out.again.status, 422);
            assert.equal(tagsBefore, 1); assert.equal(after1.faces.filter(f => f.person_id).length, 3);
            assert.equal(after1.faces.find(f => f.print_id && f.person_id === 2).tag_id > 0, true, 'l’empreinte du visage est reliée');
            const B = out.analyze2.body; assert.equal(B.answers[0].state, 'agree'); assert.equal(B.answers[0].agree[0].from, 'Cousine Anne');
            assert.equal(B.answers[1].state, 'disagree'); assert.equal(B.answers[1].disagree[0].name, 'louis martin'); assert.equal(B.answers[1].current.name, 'Louis MARTIN');
            assert.equal(out.import2.status, 200); assert.equal(out.get.body.ask.reply_count, 2); assert.equal(out.get.body.ask.status, 'answered');
            assert.equal(out.undo2.status, 200); assert.equal(out.undo1.status, 200); assert.equal(out.undo1.body.removed, 2);
            assert.equal(after0.faces.filter(f => f.person_id).length, 1); assert.equal(out.undoNone.status, 422);
        }]);
        /* ── 5. la lettre selon le cas ── */
        const sender = { name: 'Paul Borie', address: '1 rue des Lilas\n19000 Tulle', city: 'Tulle', email: 'paul@example.org' };
        const L = {};
        L.deces = await cl({ op: 'build', person_id: 2, act: 'deces', sender });
        L.old = await cl({ op: 'build', person_id: 2, act: 'naissance', sender });
        L.recentOther = await cl({ op: 'build', person_id: 5, act: 'naissance', relation: 'autre', what: 'integrale' });
        L.recentGuess = await cl({ op: 'build', person_id: 5, act: 'naissance', what: 'integrale' });
        L.abroad = await cl({ op: 'build', person_id: 9, act: 'naissance' });
        L.recherche = await cl({ op: 'build', person_id: 2, act: 'naissance', what: 'recherche' });
        L.dispense = await cl({ op: 'build', person_id: 5, act: 'mariage', what: 'dispense' });
        L.missing = await cl({ op: 'build', person_id: 7, act: 'naissance', precision: 'Vers 1960, sans doute à Naves' });
        L.tpl = await cl({ op: 'build', person_id: 2, act: 'deces', template: 'Bonjour, {personne} ({evenement}) {inconnu}' });
        L.byEvent = await cl({ op: 'build', event_id: 4, what: 'extrait_filiation', relation: 'descendant' });
        L.noPerson = await cl({ op: 'build', person_id: 999 });
        L.tplList = await get('cl_templates');
        checks.push(['la lettre selon le cas : délais (décès libre, 75 ans, plus de 100 ans), lien deviné, destinataire, modèle à soi', () => {
            for (const [k, r] of Object.entries(L)) if (k !== 'noPerson') assert.equal(r.status, 200, k);
            const d = L.deces.body; assert.equal(d.legal.public, true); assert.equal(d.recipient_kind, 'mairie'); assert.match(d.letter, /^Paul Borie\n1 rue des Lilas/); assert.match(d.letter, /Mairie de Tulle\nService de l’état civil/);
            assert.match(d.letter, /À Tulle, le \d/); assert.match(d.letter, /copie intégrale de l’acte de décès de Marie BORIE, fille de Jean BORIE et de Anne PEYRE, décédée le 5 juin 1950 à Tulle \(Corrèze\)/);
            assert.match(d.legal.rule, /L213-2/);
            assert.equal(L.old.body.legal.online, true); assert.match(L.old.body.legal.says.join(' '), /plus de 100 ans.*en ligne/);
            const ro = L.recentOther.body; assert.equal(ro.legal.public, false); assert.equal(ro.what, 'extrait_sans'); assert.equal(ro.asked, 'integrale'); assert.equal(ro.legal.status, 'warn'); assert.match(ro.letter, /extrait sans filiation/);
            const rg = L.recentGuess.body; assert.equal(rg.relation, 'descendant'); assert.equal(rg.what, 'integrale'); assert.match(rg.letter, /Je suis son descendant direct/); assert.match(rg.letter, /pièce d’identité/);
            assert.equal(L.abroad.body.recipient_kind, 'scec'); assert.match(L.abroad.body.letter, /44941 Nantes Cedex 9/);
            assert.equal(L.recherche.body.recipient_kind, 'ad'); assert.match(L.recherche.body.recipient.address, /Rue Lucien Sampaix/); assert.equal(L.recherche.body.recipient.email, 'archives@correze.fr'); assert.match(L.recherche.body.letter, /recherche par correspondance/);
            assert.equal(L.dispense.body.recipient_kind, 'diocese'); assert.match(L.dispense.body.letter, /dispense de mariage.*Pierre BORIE et de Sophie VIDAL, mariés le 20 juin 1985 à Naves/);
            assert.equal(L.missing.body.context.missing, true); assert.match(L.missing.body.letter, /date que je ne connais pas précisément/); assert.match(L.missing.body.letter, /Vers 1960, sans doute à Naves/);
            assert.equal(L.tpl.body.letter, 'Bonjour, Marie BORIE (décédée le 5 juin 1950 à Tulle (Corrèze)) {inconnu}');
            assert.equal(L.byEvent.body.context.person.id, 2); assert.equal(L.byEvent.body.act, 'deces'); assert.match(L.byEvent.body.letter, /extrait avec filiation/);
            assert.equal(L.noPerson.status, 404);
            assert.ok(L.tplList.body.templates.integrale.includes('{demande}'));
        }]);
        /* ── 6. les courriers suivis ── */
        const today = new Date().toISOString().slice(0, 10);
        out.file1 = await cl({ op: 'file', person_id: 5, act: 'naissance', what: 'integrale', relation: 'descendant', letter: `Ma lettre ${XSS}`, objet: 'Demande pour Pierre', date_envoi: today, relance_jours: 30, remind_open: 1 });
        out.courriers = await get('list', 'type=courriers');
        out.letter = await get('cl_letter', 'id=' + out.file1.body.courrier_id);
        out.semaine = await get('semaine');
        out.ids = await get('cl_ids');
        out.badDate = await cl({ op: 'file', person_id: 5, act: 'naissance', date_envoi: '2026-13-45' });
        const plain = await postTo('save_courrier', { organisme: 'mairie', destinataire: 'Mairie X', objet: 'Courrier à la main', date_envoi: today });
        out.unfilePlain = await cl({ op: 'unfile', courrier_id: plain.body.result?.id || plain.body.id || 0 });
        out.unfile = await cl({ op: 'unfile', courrier_id: out.file1.body.courrier_id });
        out.courriers2 = await get('list', 'type=courriers');
        checks.push(['rangé dans les courriers suivis : relance, lettre gardée, Ma semaine de recherche, rappel « libre d’accès », ↶ Annuler', () => {
            assert.equal(out.file1.status, 200); assert.ok(out.file1.body.reminder_id > 0);
            const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 30); assert.equal(out.file1.body.relance_date, d.toISOString().slice(0, 10));
            const row = (out.courriers.body.rows || out.courriers.body.items || []).find(r => Number(r.id) === out.file1.body.courrier_id);
            assert.ok(row, 'dans le Registre de courriers'); assert.equal(row.statut, 'en_attente'); assert.match(row.destinataire, /Mairie de Tulle/);
            assert.equal(out.letter.body.courrier.letter, `Ma lettre ${XSS}`); assert.equal(out.letter.body.courrier.person_id, 5); assert.equal(out.letter.body.courrier.data.what, 'integrale');
            assert.ok(out.semaine.body.items.some(i => i.key === 'courrier:' + out.file1.body.courrier_id), 'dans Ma semaine de recherche');
            assert.deepEqual(out.ids.body.ids, [out.file1.body.courrier_id]);
            assert.equal(out.badDate.status, 422); assert.equal(out.unfilePlain.status, 404);
            assert.equal(out.unfile.status, 200); assert.ok(!(out.courriers2.body.rows || out.courriers2.body.items || []).some(r => Number(r.id) === out.file1.body.courrier_id));
        }]);
        /* ── 7. l'app ── */
        if (chromium) {
            const runApp = async (vw, theme) => {
                const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: vw, height: vw < 500 ? 844 : 950 }, colorScheme: theme === 'dark' ? 'dark' : 'light' });
                const p = await ctx.newPage(); const errs = [];
                p.on('pageerror', e => errs.push(process.env.PC_DEBUG ? e.stack : e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|tile|ERR_/.test(m.text())) errs.push(m.text()); });
                if (theme === 'dark') await p.addInitScript(() => { try { localStorage.setItem('genealogie-theme', 'dark'); } catch (_) {} if (document.documentElement) document.documentElement.dataset.theme = 'dark'; });
                await p.goto(base, { waitUntil: 'load' });
                await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_EXT?.photoAsk && window.LCNDA_EXT?.openActLetter && window.LCNDA_EXT?.openDialog);
                if (theme === 'dark') await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
                const shot = async n => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${n}-${vw}${theme === 'dark' ? '-sombre' : ''}.png`) }); };
                const R = { errs };
                if (process.env.PC_DEBUG) p.on('response', async r => { if (/pa_write|pa_faces/.test(r.url())) console.log('RESP', r.url().slice(-30), r.status(), (await r.text().catch(() => '')).slice(0, 300)); });
                // visionneuse → « 📤 Demander qui c'est »
                await p.evaluate(() => window.LCNDA_APP.openLightbox([{ id: 1, filename: 'photo.jpg', media_type: 'image', title: 'Mariage 1925' }], 0));
                await p.waitForSelector('#lightbox-pa-ask', { state: 'attached' });
                await p.evaluate(() => document.getElementById('lightbox-pa-ask').click());
                await p.waitForSelector('.pa-dialog .pa-fbox');
                R.boxes = await p.$$eval('.pa-dialog .pa-fbox', l => l.length); R.on = await p.$$eval('.pa-dialog .pa-fbox.is-on', l => l.length);
                R.names = await p.$$eval('.pa-dialog [data-pa-names] .pk-chip, .pa-dialog [data-pa-names] .pk-pill, .pa-dialog [data-pa-names] [data-pk-chip]', l => l.length);
                R.livingInfo = await p.textContent('.pa-dialog [data-pa-living]');
                R.dlgOverflow = await p.evaluate(() => { const d = document.querySelector('.pa-dialog'); return d.scrollWidth > d.clientWidth + 2; });
                await shot('demande');
                await p.click('.pa-dialog button[type=submit]');
                await p.waitForSelector('.pa-dialog [data-pa-dl]').catch(async e => { console.log('DBG', errs, await p.evaluate(() => [...document.querySelectorAll('dialog[open]')].map(d => d.className + ' ' + d.textContent.slice(0, 200)).join('\n') + ' TOAST ' + (document.querySelector('#toast-region')?.textContent || ''))); throw e; });
                const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.pa-dialog [data-pa-dl]')]);
                const hp = path.join(tmp, `d-${vw}-${theme}.html`); await dl.saveAs(hp);
                await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
                await p.evaluate(() => document.getElementById('lightbox')?.open && document.getElementById('lightbox').close());
                // le cousin répond
                const c = await ctx.newPage(); await c.goto('file://' + hp); await c.fill('[data-name="f1"]', 'Marie BORIE (1880–1950)'); await c.fill('[data-name="f2"]', 'louis martin');
                const [dl2] = await Promise.all([c.waitForEvent('download'), c.click('#pa-save')]); const jp = path.join(tmp, `r-${vw}-${theme}.json`); await dl2.saveAs(jp); await c.close();
                // Questions aux proches → section → ⤒ Importer les réponses
                await p.evaluate(() => window.LCNDA_QUESTIONS ? window.LCNDA_QUESTIONS.openListPage() : (window.LCNDA_APP.state.listType = 'family_questions', window.LCNDA_APP.setModule('listes')));
                await p.waitForSelector('.pa-list [data-pa-import]');
                R.section = await p.textContent('.pa-list');
                await p.click('.pa-list [data-pa-import]');
                await p.setInputFiles('.k-import input[type=file]', jp);
                await p.waitForSelector('.k-import .pa-ans');
                R.props = await p.$$eval('.k-import .pa-ans', l => l.length);
                R.checked = await p.$$eval('.k-import .pa-ans input[type=radio]:checked', l => l.map(x => x.value).join(','));
                await shot('import');
                await p.click('.k-import [data-k-go]');
                await p.waitForFunction(() => !document.querySelector('dialog.k-import'));
                await p.waitForTimeout(400);
                R.undo = await p.$$eval('#toast-region button, .toast button, [class*=toast] button', l => l.map(b => b.textContent).join('|'));
                // la fiche : ⋯ → « 📮 Demander un acte… »
                await p.evaluate(() => window.LCNDA_APP.openPersonById(5));
                await p.waitForSelector('[data-fsec-hero-more]');
                await p.click('[data-fsec-hero-more]');
                await p.waitForSelector('text=Demander un acte…');
                await p.click('text=Demander un acte…');
                await p.waitForSelector('.cl-dialog [data-cl-legal] .ui-notice');
                await p.waitForFunction(() => /BORIE/.test(document.querySelector('.cl-dialog textarea[name=letter]')?.value || ''));
                R.legal = await p.textContent('.cl-dialog [data-cl-legal]');
                R.remind = await p.$eval('.cl-dialog [data-cl-remind]', e => !e.hidden);
                await shot('lettre');
                await p.selectOption('.cl-dialog select[name=what]', 'recherche');
                await p.waitForFunction(() => /Sampaix/.test(document.querySelector('.cl-dialog textarea[name=recipient_address]')?.value || ''));
                R.recip = await p.inputValue('.cl-dialog select[name=recipient]');
                R.clOverflow = await p.evaluate(() => { const d = document.querySelector('.cl-dialog'); return d.scrollWidth > d.clientWidth + 2; });
                await p.click('.cl-dialog button[type=submit]');
                await p.waitForFunction(() => !document.querySelector('.cl-dialog'));
                await p.waitForTimeout(300);
                R.filed = await p.$$eval('#toast-region, .toast, [class*=toast]', l => l.map(b => b.textContent).join('|'));
                // Registre de courriers : « 📮 Demander un acte » et « 📮 Revoir la lettre »
                await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'courriers'; A.setModule('listes'); });
                await p.waitForSelector('[data-cl-new]'); await p.waitForSelector('[data-cl-see]');
                await p.click('[data-cl-see]');
                await p.waitForSelector('.cl-read');
                R.read = await p.textContent('.cl-read');
                await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
                await shot('registre');
                // ⚙️ réglages des courriers (K2) : l'adresse est gardée tout de suite
                await p.click('[data-cl-new]');
                await p.waitForSelector('.cl-dialog [data-cl-settings]');
                await p.click('.cl-dialog .modal-head [data-cl-settings]');
                await p.waitForSelector('.cl-set input[name=s_name]');
                await p.fill('.cl-set input[name=s_name]', 'Paul Borie'); await p.dispatchEvent('.cl-set input[name=s_name]', 'change');
                await p.waitForTimeout(400);
                R.saved = await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-courriers-lettres') || '{}').sender?.name);
                R.presets = !!(await p.$('.cl-set .ui-presets'));
                await shot('reglages');
                R.xss = await p.evaluate(() => window.__pcx || 0);
                await ctx.close();
                return R;
            };
            out.app = {};
            for (const [vw, theme] of [[1440, 'light'], [390, 'light'], [1440, 'dark']]) {
                out.app[`${vw}-${theme}`] = await runApp(vw, theme);
                // la photo retrouve ses visages sans nom pour le passage suivant (↶ Annuler de l'import fait dans l'app)
                for (const a of (await get('pa_list')).body.asks.filter(x => x.can_undo_import)) await pa({ op: 'undo_import', id: a.id });
            }
            checks.push(['l’app à 1440 px, 390 px et en sombre : visionneuse, demande, Questions aux proches, import, fiche ⋯, lettre, Registre, réglages, sans erreur', () => {
                for (const [k, R] of Object.entries(out.app)) {
                    assert.equal(R.boxes, 3, k); assert.equal(R.on, 2, k); assert.match(R.livingInfo, /vivante/, k); assert.equal(R.dlgOverflow, false, k);
                    assert.match(R.section, /Qui est sur cette photo/, k); assert.equal(R.props, 2, k); assert.equal(R.checked, 'accept,accept', k); assert.match(R.undo, /Annuler/, k);
                    assert.match(R.legal, /descendant|libre d’accès|copie intégrale/i, k); assert.equal(R.remind, true, k); assert.equal(R.recip, 'ad', k); assert.equal(R.clOverflow, false, k);
                    assert.match(R.filed, /courriers suivis/, k); assert.match(R.read, /Pierre BORIE/, k); assert.equal(R.saved, 'Paul Borie', k); assert.ok(R.presets, k);
                    assert.equal(R.xss, 0, k); assert.deepEqual(R.errs, [], k);
                }
            }]);
        }
    } finally {
        if (browser) await browser.close();
        proc.kill();
    }
    let failed = 0;
    for (const [name, fn] of checks) { try { fn(); console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n   ', e.message); } }
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(failed ? `${failed} échec(s)` : `${checks.length} vérifications réussies`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
