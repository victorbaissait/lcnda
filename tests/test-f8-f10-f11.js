'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🏞 Cartes postales (F8), 🎂 Dates à fêter (F10), 📤 Partager avec la famille (F11) :   node tests/test-f8-f10-f11.js
 * Un vrai « php -S » sur une base neuve (vivants, probablement vivants, fiche confidentielle, photos reliées), puis un
 * navigateur (Playwright ; sinon la partie navigateur est sautée).
 *  F11 (contrôle strict) : dans le .zip, AUCUN vivant (nom, prénom en mode « cachés », date, lieu, photo, note) ni AUCUNE fiche
 *      confidentielle, à chaque réglage (toute la base, prénom seulement, une branche, sans photos…) ; une photo où figure un
 *      vivant (reliée ou visage nommé) ne part pas ; le nom complet d'un vivant dans une note est retiré ; noms de fichiers
 *      fabriqués ; images réenregistrées sans EXIF ; refus en mode consultation ; la copie s'ouvre en file:// sans requête.
 *  F8  : fiche de carte (recto/verso, personnes, lieu, angle), refus (doublon, recto = verso, personne inconnue, sans CSRF),
 *      texte du dos = transcription du verso, carte reliée aux fiches, candidats, ↶ Annuler, bloc du lieu, calque de la Carte.
 *  F10 : dates du jour / de la semaine, âge des vivants, « il y a », anniversaire rond, filtres, Sosa, branche, confidentiel
 *      jamais montré, mode consultation (prénom seulement), rappel posé dans les rappels de l'app.
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-f8f10f11-'));
const dir = path.join(tmp, 'data');
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
const TODAY = '2026-10-21';
// Ce qui ne doit JAMAIS partir dans la copie à partager
const SECRETS = ['DUPONT-VIVANT', 'Lucas', 'Sophie', 'SECRETON', 'Gaston', 'Villevivante', 'NOTE-CONFIDENTIELLE-XYZ', 'PHOTO-VIVANT-XYZ', 'PHOTO-SECRETE-XYZ', 'PHOTO-VISAGE-XYZ', '1990', '1980'];
{
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$img = function ($name, $r, $g, $b) { $im = imagecreatetruecolor(900, 600); imagefill($im, 0, 0, imagecolorallocate($im, $r, $g, $b)); imagejpeg($im, MEDIA_DIR . '/' . $name, 85); };
$img('jean.jpg', 120, 90, 60); $img('vivant.jpg', 200, 40, 40); $img('secret.jpg', 40, 200, 40); $img('visage.jpg', 40, 40, 200); $img('recto.jpg', 150, 150, 120); $img('verso.jpg', 230, 220, 200); $img('cand.jpg', 90, 90, 90);
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_private,is_start) VALUES
 (1,'Jean','DUPONT','male','deceased',0,0),(2,'Marie','MARTIN','female','deceased',0,0),(3,'Pierre','DUPONT','male','deceased',0,0),(4,'Anne','PEYRE','female','deceased',0,0),
 (5,'Lucas','DUPONT-VIVANT','male','living',0,1),(6,'Sophie','DUPONT-VIVANT','female','unknown',0,0),(7,'Gaston','SECRETON','male','deceased',1,0)");
$t = fn($tag, $scope = 'person') => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' AND scope='$scope' LIMIT 1")->fetchColumn();
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude) VALUES(1,'Tulle','Corrèze','France',45.2667,1.7667),(2,'Villevivante','Corrèze','France',45.3,1.8)");
$ev = $pdo->prepare('INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?,?)');
$ev->execute(['person', 1, null, $t('BIRT'), '25 octobre 1850', 1850, 1]); $ev->execute(['person', 1, null, $t('DEAT'), '21 octobre 1920', 1920, 1]);
$ev->execute(['person', 2, null, $t('BIRT'), '23 octobre 1826', 1826, 1]); $ev->execute(['person', 2, null, $t('DEAT'), '2 mars 1900', 1900, 1]);
$ev->execute(['person', 3, null, $t('BIRT'), '4 mai 1925', 1925, 1]); $ev->execute(['person', 3, null, $t('DEAT'), '9 juin 2000', 2000, 1]);
$ev->execute(['person', 4, null, $t('BIRT'), '1 janvier 1930', 1930, 1]); $ev->execute(['person', 4, null, $t('DEAT'), '1 février 2010', 2010, 1]);
$ev->execute(['person', 5, null, $t('BIRT'), '22 octobre 1990', 1990, 2]);
$ev->execute(['person', 6, null, $t('BIRT'), '24 octobre 1980', 1980, 2]);
$ev->execute(['person', 7, null, $t('BIRT'), '21 octobre 1900', 1900, 1]); $ev->execute(['person', 7, null, $t('DEAT'), '3 mars 1970', 1970, 1]);
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,2),(2,3,4)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,3),(2,5),(2,6)");
$ev->execute(['family', null, 2, $t('MARR', 'family'), '21 octobre 1966', 1966, 1]);
$pdo->exec("INSERT INTO notes(entity_type,entity_id,title,body) VALUES('person',3,'Souvenir','<p>Son petit-fils Lucas DUPONT-VIVANT garde sa montre. Il vivait à Tulle.</p>'),('person',7,'Secret','NOTE-CONFIDENTIELLE-XYZ')");
$pdo->exec("INSERT INTO media(id,title,filename,media_type) VALUES(1,'Jean au moulin','jean.jpg','image'),(2,'PHOTO-VIVANT-XYZ','vivant.jpg','image'),(3,'PHOTO-SECRETE-XYZ','secret.jpg','image'),(4,'PHOTO-VISAGE-XYZ','visage.jpg','image'),(5,'Tulle, la place','recto.jpg','image'),(6,'Tulle, dos','verso.jpg','image'),(7,'Une carte du grenier','cand.jpg','image')");
$pdo->exec("UPDATE media SET postcard_group='g7', postcard_side='recto' WHERE id=7");
$pdo->exec("INSERT INTO media_links(media_id,entity_type,entity_id,position) VALUES(1,'person',1,0),(2,'person',3,0),(2,'person',5,1),(3,'person',7,0),(4,'person',1,0)");
$pdo->exec("INSERT INTO media_tags(media_id,person_id) VALUES(4,6)");
$pdo->exec("UPDATE persons SET portrait_media_id=1 WHERE id=1");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
    if (r.status !== 0 || !String(r.stdout).includes('ok')) { console.error(r.stderr || r.stdout); process.exit(1); }
}
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
/** le .zip lu par PHP : {nom: {size, text?, b64?}} */
function readZip(file) {
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `$z=new ZipArchive();$z->open($argv[1]);$o=[];for($i=0;$i<$z->numFiles;$i++){$n=$z->getNameIndex($i);$c=$z->getFromIndex($i);$o[$n]=['size'=>strlen($c),'text'=>preg_match('/\\.(html|txt)$/',$n)?$c:'','exif'=>str_contains($c,'Exif')];}echo json_encode($o);`, file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return JSON.parse(r.stdout);
}

(async () => {
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const page0 = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(page0.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const get = async (action, q = '') => { const r = await fetch(`${base}api.php?action=${action}${q ? '&' + q : ''}`, { headers: { Cookie: cookie } }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
    const post = async (action, body, token = csrf) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ ...body, csrf: token }) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
    const zipOf = async (q, name) => { const r = await fetch(`${base}api.php?action=family_share_export&${q}`, { headers: { Cookie: cookie } }); const f = path.join(tmp, name + '.zip'); fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); return { status: r.status, type: r.headers.get('content-type'), disp: r.headers.get('content-disposition') || '', file: f, entries: r.status === 200 ? readZip(f) : {} }; };
    const out = {}; const checks = []; let browser = null;
    const enc = encodeURIComponent;
    try {
        /* ═════ F11 ═════ */
        out.prev = await get('family_share_preview', '');
        out.zAll = await zipOf('title=' + enc('Famille <Dupont>'), 'all');
        out.zFirst = await zipOf('living=first&title=Famille', 'first');
        out.zBranch = await zipOf('branches=' + enc(JSON.stringify([{ mode: 'ascendants', person: 3 }])), 'branch');
        out.zNoPhotos = await zipOf('photos=0&docs=0&notes=0', 'nophotos');
        out.badBranch = await get('family_share_preview', 'branches=' + enc(JSON.stringify([{ mode: 'ascendants', person: 999 }])));
        out.junkBranch = await get('family_share_preview', 'branches=' + enc('{pas du json'));
        const strict = (z, { firstNames = false } = {}) => {
            assert.equal(z.status, 200); assert.match(z.type, /zip/); assert.match(z.disp, /filename="arbre-[a-z0-9-]+-\d{8}\.zip"/);
            const names = Object.keys(z.entries);
            names.forEach(n => assert.match(n, /^(index\.html|LISEZ-MOI\.txt|photos\/[mt]\d+\.jpg)$/, 'nom de fichier : ' + n));
            const all = names.map(n => n + '\n' + z.entries[n].text).join('\n');
            for (const s of SECRETS) {
                if (firstNames && (s === 'Lucas' || s === 'Sophie')) continue;
                assert.ok(!all.includes(s), `« ${s} » est parti dans la copie`);
            }
            names.filter(n => n.endsWith('.jpg')).forEach(n => assert.equal(z.entries[n].exif, false, 'EXIF dans ' + n));
            const html = z.entries['index.html'].text;
            const data = JSON.parse(html.match(/<script id="fs-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
            // aucune fiche confidentielle, et un vivant n'a que son prénom
            data.people.forEach(p => { if (p.lv) { assert.deepEqual(Object.keys(p).sort(), ['f', 'fam', 'i', 'l', 'lv', 'par', 's']); assert.equal(p.l, ''); } });
            assert.match(html, /Content-Security-Policy" content="default-src 'none'/); assert.doesNotMatch(html, /(src|href)="(https?:)?\/\//i);
            return data;
        };
        checks.push(['F11 : résumé avant l’export (ce qui part, vivants et confidentielles retirés, photos laissées de côté)', () => {
            const s = out.prev.body.summary;
            assert.equal(out.prev.status, 200); assert.equal(s.people, 4); assert.equal(s.living_hidden, 2); assert.equal(s.private_removed, 1);
            assert.equal(s.photos, 1); assert.equal(s.media_skipped_hidden, 2); // la photo du vivant et celle du visage nommé (celle de la fiche confidentielle ne touche aucune fiche qui part) assert.ok(s.names_redacted >= 1); assert.equal(out.prev.body.root.name, 'Pierre DUPONT');
        }]);
        checks.push(['F11 : toute la base — aucun vivant, aucune fiche confidentielle, aucune photo de vivant, nom retiré de la note', () => {
            const d = strict(out.zAll);
            assert.equal(d.people.length, 4); assert.ok(d.people.every(p => !p.lv));
            assert.deepEqual(Object.keys(out.zAll.entries).filter(n => n.endsWith('.jpg')).sort(), ['photos/m1.jpg', 'photos/t1.jpg']);
            const pierre = d.people.find(p => p.f === 'Pierre'); assert.match(pierre.no[0], /\[nom retiré\]/);
            assert.ok(d.fams.some(f => f.ev.some(e => e.d === '21 octobre 1966') && f.c.length === 0)); // le mariage des parents reste, leurs enfants vivants non
            assert.ok(d.people.find(p => p.f === 'Jean').ph === 0); // le portrait part
            assert.ok(out.zAll.entries['index.html'].text.includes('Famille &lt;Dupont&gt;')); // titre échappé
        }]);
        checks.push(['F11 : prénom seulement — le vivant n’a que son prénom (ni nom, ni date, ni lieu, ni photo)', () => {
            const d = strict(out.zFirst, { firstNames: true });
            const lv = d.people.filter(p => p.lv).map(p => p.f).sort(); assert.deepEqual(lv, ['Lucas', 'Sophie']);
            assert.equal(d.people.length, 6);
        }]);
        checks.push(['F11 : une branche, sans photos ni notes, branche inconnue refusée, paramètre illisible = toute la base', () => {
            const d = strict(out.zBranch); assert.deepEqual(d.people.map(p => p.f).sort(), ['Jean', 'Marie', 'Pierre']);
            const n = strict(out.zNoPhotos); assert.equal(Object.keys(out.zNoPhotos.entries).filter(x => x.endsWith('.jpg')).length, 0); assert.ok(n.people.every(p => !p.no));
            assert.equal(out.badBranch.status, 422); assert.equal(out.junkBranch.status, 200); assert.equal(out.junkBranch.body.summary.people, 4);
        }]);

        /* ═════ F8 ═════ */
        out.pc0 = await get('postcards');
        out.save = await post('postcard_write', { op: 'save', media_id: 5, verso_media_id: 6, title: 'Tulle — <la place>', publisher: 'Éd. Lévy', card_number: '12', sent_date: '12 août 1912', writer: '1', recipient: 'txt:Madame Lafon', back_text: 'Ma chère cousine', place_id: 1, view_bearing: 90, view_lat: '', view_lon: '' });
        const pcId = out.save.body.postcard?.id;
        out.dup = await post('postcard_write', { op: 'save', media_id: 5 });
        out.same = await post('postcard_write', { op: 'save', media_id: 7, verso_media_id: 7 });
        out.badPerson = await post('postcard_write', { op: 'save', media_id: 7, writer: '999' });
        out.badBearing = await post('postcard_write', { op: 'save', media_id: 7, view_bearing: 720, view_lat: '91', view_lon: '2' }); // la carte du grenier : angle et point de vue impossibles → laissés vides
        out.noCsrf = await post('postcard_write', { op: 'save', media_id: 7 }, 'faux');
        out.badOp = await post('postcard_write', { op: 'drop' });
        out.place = await get('postcards', 'place_id=1');
        out.person1 = await get('person', 'id=1');
        out.del = await post('postcard_write', { op: 'delete', id: pcId });
        out.afterDel = await get('postcards');
        out.restore = await post('postcard_write', { op: 'restore', snapshot: out.del.body.snapshot });
        checks.push(['F8 : fiche de carte (recto/verso, personnes, lieu, angle), refus, texte du dos = transcription du verso, ↶ Annuler', () => {
            assert.equal(out.pc0.body.candidates.length, 1); assert.equal(out.pc0.body.candidates[0].media_id, 7);
            const pc = out.save.body.postcard; assert.equal(out.save.status, 200);
            assert.equal(pc.verso.id, 6); assert.equal(pc.writer.id, 1); assert.equal(pc.recipient_text, 'Madame Lafon'); assert.equal(pc.place.name, 'Tulle'); assert.equal(pc.view_bearing, 90);
            assert.equal(pc.back_text, 'Ma chère cousine'); assert.equal(pc.back_on, 'verso'); assert.equal(pc.lat, 45.2667);
            assert.equal(out.dup.status, 422); assert.equal(out.same.status, 422); assert.equal(out.badPerson.status, 422); assert.notEqual(out.noCsrf.status, 200); assert.equal(out.badOp.status, 422);
            assert.equal(out.badBearing.body.postcard.view_bearing, null); assert.equal(out.badBearing.body.postcard.view_lat, null);
            assert.equal(out.place.body.postcards.length, 1);
            assert.ok((out.person1.body.media || []).some(m => Number(m.id) === 5), 'la carte apparaît dans la fiche de celui qui l’a écrite');
            assert.ok(!out.afterDel.body.postcards.some(x => x.id === pcId)); assert.equal(out.restore.status, 200); assert.equal(out.restore.body.postcard.id, pcId);
        }]);

        /* ═════ F10 ═════ */
        const df = q => get('dates_feter', `today=${TODAY}&${q}`);
        out.dToday = await df('period=today');
        out.dWeek = await df('period=week');
        out.dLiving = await df('period=week&who=living');
        out.dDead = await df('period=week&who=dead');
        out.dSosa = await df('period=week&sosa=1');
        out.dRound = await df('period=week&round=1');
        out.dBranch = await df('period=week&branch=3');
        out.dBirth = await df('period=week&kinds=birth');
        checks.push(['F10 : jour, semaine, âge des vivants, « il y a », rond, filtres (vivants, ancêtres, Sosa, branche), confidentiel jamais', () => {
            const t = out.dToday.body.items; assert.deepEqual(t.map(i => i.kind).sort(), ['death', 'union']); // Gaston (né un 21 octobre) : confidentiel, jamais
            const w = out.dWeek.body.items; assert.ok(!JSON.stringify(out.dWeek.body).includes('SECRETON'));
            const lucas = w.find(i => i.persons[0].first === 'Lucas'); assert.equal(lucas.years, 36); assert.equal(lucas.living, true); assert.equal(lucas.days, 1);
            const marie = w.find(i => i.persons[0].first === 'Marie'); assert.equal(marie.years, 200); assert.equal(marie.round, true); assert.equal(marie.living, false);
            const union = t.find(i => i.kind === 'union'); assert.equal(union.living, false); assert.equal(union.years, 60); assert.equal(union.round, false);
            assert.ok(out.dLiving.body.items.every(i => i.living)); assert.deepEqual(out.dLiving.body.items.map(i => i.persons[0].first).sort(), ['Lucas', 'Sophie']);
            assert.ok(out.dDead.body.items.every(i => !i.living));
            assert.ok(!out.dSosa.body.items.some(i => i.persons[0].first === 'Sophie')); assert.ok(out.dSosa.body.items.some(i => i.persons[0].first === 'Lucas'));
            assert.deepEqual(out.dRound.body.items.map(i => i.persons[0].first), ['Marie']);
            assert.ok(out.dBranch.body.items.every(i => i.persons.some(p => [3, 4, 5, 6].includes(p.id))));
            assert.ok(out.dBirth.body.items.every(i => i.kind === 'birth'));
        }]);

        /* ═════ navigateur ═════ */
        if (chromium) {
            browser = await chromium.launch();
            // la copie, ouverte depuis le disque : aucune requête, aucune erreur
            const unz = path.join(tmp, 'unz'); fs.mkdirSync(unz);
            spawnSync(phpPath, ['-r', '$z=new ZipArchive();$z->open($argv[1]);$z->extractTo($argv[2]);', out.zAll.file, unz]);
            const vctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const v = await vctx.newPage(); const verr = [];
            v.on('pageerror', e => verr.push(e.message)); v.on('console', m => { if (m.type() === 'error') verr.push(m.text()); });
            v.on('request', r => { if (!/^(file|data|blob):/.test(r.url())) verr.push('requête ' + r.url()); });
            await v.goto('file://' + path.join(unz, 'index.html')); await v.waitForSelector('.fs-welcome');
            await v.click('a[href="#personnes"]'); await v.fill('#fs-q', 'dupont'); const found = await v.locator('.fs-plink').count();
            await v.goto('file://' + path.join(unz, 'index.html') + '#p/' + 1); const ph = await v.evaluate(() => [...document.images].filter(i => i.naturalWidth > 0).length);
            const hs = await v.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
            out.viewer = { verr, found, ph, hs }; await vctx.close();
            // l'app
            const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); const errs = [];
            await ctx.route(u => !u.href.startsWith(base), r => r.abort());
            p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
            await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.bootstrap && window.LCNDA_POSTCARDS && window.LCNDA_UI?.listBar, null, { timeout: 60000, polling: 300 });
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'postcards'; A.setModule('listes'); });
            await p.waitForSelector('.h-cpo-page [data-cpo-open]'); const cards = await p.locator('.h-cpo-page .ui-card, .h-cpo-page .ui-row').count();
            const titleEsc = await p.evaluate(() => document.querySelector('.h-cpo-page').textContent);
            await p.click(`.h-cpo-page .ui-card-open[data-cpo-open="${out.save.body.postcard.id}"]`); await p.waitForSelector('.h-cpo-form'); const formOk = await p.evaluate(() => document.querySelector('[name=back_text]').value);
            await p.keyboard.press('Escape');
            await p.evaluate(() => { localStorage.setItem('lcnda-map-postcards', '1'); const A = window.LCNDA_APP; A.state.mapMode = 'standard'; A.state.mapCenter = {lat: 45.27, lon: 1.77}; A.state.mapZoom = 12; A.state.mapKeepCenter = true; A.setModule('carte'); });
            await p.waitForSelector('.h-cpo-pin'); const cone = await p.locator('.h-cpo-pin .h-cpo-cone').count();
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.graphMode = 'place_monograph'; A.state.graphPlaceMonograph = {...(A.state.graphPlaceMonograph || {}), id: 1, name: 'Tulle', showEvents: true}; A.setModule('graphiques'); });
            await p.waitForSelector('.h-cpo-block .h-cpo-thumb');
            await p.evaluate(() => { const A = window.LCNDA_APP; const s = A.dashboardBlockSettings(); s.widgets = [{id: 'today-t', type: 'today', config: {period: 'week'}}]; A.saveDashboardBlockSettings(s); A.setModule('dashboard'); });
            await p.waitForSelector('.h-df-row'); const rows = await p.locator('.h-df-row').count(); const rowText = await p.textContent('.h-df-list');
            await p.click('.h-df-row [data-df-remind]'); await p.click('.ui-actmenu-i:has-text("Le jour même")');
            await p.waitForTimeout(800);
            const rem = await p.evaluate(async () => (await window.LCNDA_APP.api('list', {type: 'reminders'})).rows?.map(r => r.item_title || r.title) || []);
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'export'; A.setModule('maintenance'); });
            await p.waitForSelector('[data-fs-open]'); await p.click('[data-fs-open]'); await p.waitForSelector('.h-fs-sum'); const sum = await p.textContent('.h-fs-sum');
            out.app = { errs, cards, titleEsc, formOk, cone, rows, rowText, rem, sum };
            await ctx.close();
            checks.push(['navigateur : la copie s’ouvre en file:// (recherche, photo) sans requête ; liste, fiche, calque, bloc du lieu, widget, rappel, fenêtre d’export, sans erreur', () => {
                assert.deepEqual(out.viewer.verr, []); assert.ok(out.viewer.found >= 2); assert.ok(out.viewer.ph >= 1); assert.equal(out.viewer.hs, false);
                const a = out.app; assert.deepEqual(a.errs, []);
                assert.equal(a.cards, 2); assert.ok(a.titleEsc.includes('Tulle — <la place>'), a.titleEsc.slice(a.titleEsc.indexOf('Tulle') - 40, a.titleEsc.indexOf('Tulle') + 80)); assert.equal(a.formOk, 'Ma chère cousine'); assert.equal(a.cone, 1);
                assert.ok(a.rows >= 4); assert.match(a.rowText, /Lucas DUPONT-VIVANT/); assert.match(a.rowText, /36 ans/); assert.match(a.rowText, /il y a 200 ans/);
                assert.ok(a.rem.some(t => /Anniversaire|ans/.test(t)), 'rappel posé : ' + a.rem.join(' | '));
                assert.match(a.sum, /4 personnes/); assert.match(a.sum, /2 personnes vivantes/); assert.match(a.sum, /1 fiche confidentielle retirée/);
            }]);
        }

        /* ═════ mode consultation ═════ */
        out.kioskOn = await post('kiosk_enter', { password: '1234' });
        out.kZip = await get('family_share_export', '');
        out.kPrev = await get('family_share_preview', '');
        out.kDates = await get('dates_feter', `today=${TODAY}&period=week`);
        out.kWrite = await post('postcard_write', { op: 'save', media_id: 7 });
        out.kioskOff = await post('kiosk_exit', { password: '1234' });
        checks.push(['mode consultation : export refusé, écriture refusée, vivants au prénom seulement (sans âge) dans les dates à fêter', () => {
            assert.equal(out.kioskOn.status, 200); assert.equal(out.kZip.status, 423); assert.equal(out.kPrev.status, 423); assert.equal(out.kWrite.status, 423);
            const l = out.kDates.body.items.find(i => i.persons[0].first === 'Lucas'); assert.equal(out.kDates.body.kiosk, true);
            assert.equal(l.masked, true); assert.equal(l.years, null); assert.equal(l.persons[0].last, ''); assert.equal(l.persons[0].id, 0);
            assert.ok(!JSON.stringify(out.kDates.body).includes('DUPONT-VIVANT'));
        }]);
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
