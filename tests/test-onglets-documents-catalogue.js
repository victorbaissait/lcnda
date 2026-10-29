'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📄 Documents et 🎨 Catalogue raisonné : les deux onglets du haut (maquette docs/design/onglets-documents-catalogue.html).
 *     node tests/test-onglets-documents-catalogue.js
 * Un vrai « php -S » sur une base neuve (51 documents, un chanteur, une peintre, un artiste vivant), puis un navigateur :
 *  1. serveur (api.php?action=onglets) : liste courte des documents, fiche complète, artistes ; en mode consultation, ni
 *     l'artiste vivant ni son nom sur un document ; une demande inconnue est refusée ;
 *  2. onglets cachés au départ ; ils apparaissent quand on les montre (Réglages → Apparence → onglets) ;
 *  3. Documents : A → Z (lettres repères, lettre sans document grisée), la fiche à droite (#documents/N), 📁 Dossiers
 *     (rangement de Graphiques, kind « document ») ;
 *  4. Catalogue : par albums (pistes dans l'ordre, faces), par chansons (« sur 2 »), par période (décennies, puis périodes
 *     de l'artiste), par technique ; la fiche du moteur des Artistes à droite ;
 *  5. 390 px sans défilement de côté, mode sombre, mode consultation (pas de « ✎ Modifier » ni « 📁 Ranger ») ; aucune erreur JS.
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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-onglets-'));
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
const shots = process.env.ONGLETS_SHOTS || '';
const seed = String.raw`require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php';
require 'tests/api_functions.php';
$pdo = db();
art_ensure($pdo);
$ins = $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES(?,?,?,?)");
$person = function (string $f, string $l, string $g, string $living = 'deceased') use ($pdo, $ins): int { $ins->execute([$f, $l, $g, $living]); return (int) $pdo->lastInsertId(); };
$ld = $person('Lucien', 'Dardel', 'male'); $hv = $person('Hélène', 'Varin', 'female'); $vs = $person('Vivant', 'Secret', 'male', 'living');
$jm = $person('Jean', 'Martin', 'male'); $mr = $person('Marie', 'Roux', 'female');
// naissances, décès
$bt = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT' LIMIT 1")->fetchColumn();
$dt = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='DEAT' LIMIT 1")->fetchColumn();
$ev = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,year,date_text) VALUES('person',?,?,?,?)");
foreach ([[$ld, 1931, 2004], [$hv, 1908, 1987], [$jm, 1892, 1958], [$mr, 1895, 1970]] as [$p, $b, $d]) { $ev->execute([$p, $bt, $b, (string) $b]); $ev->execute([$p, $dt, $d, (string) $d]); }
art_make_artist($pdo, $ld, 'chanteur'); art_make_artist($pdo, $hv, 'peintre'); art_make_artist($pdo, $vs, 'peintre');
$save = fn(int $pid, string $kind, array $data, int $parent = 0) => art_save_item($pdo, ['person_id' => $pid, 'kind' => $kind, 'data' => $data, 'parent_id' => $parent])['id'];
// musique : morceaux, enregistrements, disques
$songs = [];
foreach ([['Printemps', '1966'], ['La Mer à Sète', 'été 1967'], ['Les Vendanges', '1968'], ['Ma mère', '1968'], ['L’Hiver', '1966'], ['Valse des Granges', '1968'], ['Le Dernier Train', '1968']] as [$t, $w]) {
    $songs[$t] = $save($ld, 'track_work', ['title' => $t, 'written' => $w, 'genre' => 'Chanson française']);
}
$rec1 = $save($ld, 'recording', ['title' => 'Prise studio', 'rkind' => 'prise', 'work' => ['iid' => $songs['La Mer à Sète'], 'title' => 'La Mer à Sète', 'kind' => 'track_work'], 'date' => 'oct. 1967', 'dur' => '4:05']);
$rec2 = $save($ld, 'recording', ['title' => 'En public', 'rkind' => 'public', 'work' => ['iid' => $songs['La Mer à Sète'], 'title' => 'La Mer à Sète', 'kind' => 'track_work'], 'date' => '1972', 'dur' => '4:48']);
$tr = fn(string $pos, string $t, string $d, int $rec = 0) => array_filter(['pos' => $pos, 'title' => $t, 'dur' => $d, 'rec' => $rec ? ['iid' => $rec, 'title' => 'enregistrement', 'kind' => 'recording'] : null]);
$save($ld, 'release', ['title' => 'Les Saisons', 'released' => 'mars 1968', 'format' => 'LP 33 t', 'rtype' => 'album', 'catno' => '80 412', 'label' => ['txt' => 'Barclay'], 'genre' => 'Chanson française', 'tracks' => [
    ['heading' => true, 'title' => 'Face A'], $tr('A1', 'Printemps', '3:20'), $tr('A2', 'La Mer à Sète', '4:05', $rec1), $tr('A3', 'Les Vendanges', '2:58'), $tr('A4', 'Ma mère', '3:41'),
    ['heading' => true, 'title' => 'Face B'], $tr('B1', 'L’Hiver', '3:12'), $tr('B2', 'Valse des Granges', '2:47'), $tr('B3', 'Le Dernier Train', '5:30')]]);
$save($ld, 'release', ['title' => 'Rive gauche', 'released' => '1965', 'format' => 'LP 33 t', 'rtype' => 'album', 'label' => ['txt' => 'Barclay'], 'genre' => 'Chanson française', 'tracks' => [$tr('A1', 'L’Hiver', '3:10'), $tr('A2', 'Rue des Lilas', '2:30')]]);
$save($ld, 'release', ['title' => 'En public à Bobino', 'released' => '1972', 'format' => '2 LP', 'rtype' => 'live', 'label' => ['txt' => 'Philips'], 'genre' => 'Variété', 'tracks' => [['heading' => true, 'title' => 'Disque 1'], $tr('1·7', 'La Mer à Sète', '4:48', $rec2), $tr('1·8', 'Ma mère', '3:50')]]);
// peinture
foreach ([['Le Port de Sète', '1947', 'Huile sur toile', 'CR 112'], ['Femme à la fenêtre', '1947', 'Huile sur toile', 'CR 113'], ['Barques', '1949', 'Gouache', 'CR 120'], ['Mas des Granges', '1955', 'Huile sur toile', 'CR 140'], ['Autoportrait', '1930', 'Dessin (fusain)', 'CR 3'], ['Sans date', '', 'Gouache', '']] as [$t, $d, $tech, $cr]) {
    $save($hv, 'work', array_filter(['title' => $t, 'date' => $d, 'technique' => $tech, 'catref' => $cr]));
}
$save($vs, 'work', ['title' => 'Œuvre d’un vivant', 'date' => '2001']);
// documents : des médias de toutes les lettres (le même petit fichier)
$src = '';
if (function_exists('imagecreatetruecolor')) { $im = imagecreatetruecolor(600, 800); imagefill($im, 0, 0, imagecolorallocate($im, 150, 130, 170)); imagejpeg($im, MEDIA_DIR . '/seed-doc.jpg'); $src = MEDIA_DIR . '/seed-doc.jpg'; }
$file = 'seed-doc.jpg';
if ($src) { /* déjà fait */ } else { file_put_contents(MEDIA_DIR . '/' . $file, base64_decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=')); }
$m = $pdo->prepare("INSERT INTO media(title, filename, thumbnail, media_type, date_text, document_reference, transcription, media_subject_type) VALUES(?,?,?,?,?,?,?,?)");
$docs = [['Acte de mariage Martin – Roux', '1908', '3 E 1234', ''], ['Album de la communion', '1921', '', ''], ['Bail de la ferme des Granges', '1897', '', ''],
    ['Lettre de Jean à Marie', '12 mars 1916', 'L 14/3', 'Ma chère Marie, je t’écris de la cagna…'], ['Lettre de Marie à Jean', '2 avril 1916', 'L 14/4', ''],
    ['Livret militaire de Jean Martin', '1912', 'M 2', ''], ['Matrice cadastrale (extrait)', '1913', 'section B', ''], ['Zouave en permission', '1915', '', ''],
    ['Diplôme du certificat d’études', '1906', '', ''], ['Portrait de Marie', '1920', '', ''], ['Testament de Pierre', '1880', 'Not. 12', '']];
for ($k = 1; $k <= 40; $k++) { $docs[] = ['Carte postale n° ' . $k, (string) (1900 + $k), 'CP ' . $k, '']; }
$ids = [];
foreach ($docs as [$t, $d, $c, $tx]) { $m->execute([$t, $file, $file, 'image', $d, $c, $tx, '']); $ids[$t] = (int) $pdo->lastInsertId(); }
$l = $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id) VALUES(?, 'person', ?)");
$l->execute([$ids['Lettre de Jean à Marie'], $jm]); $l->execute([$ids['Lettre de Jean à Marie'], $mr]); $l->execute([$ids['Lettre de Jean à Marie'], $vs]);
echo json_encode(['ld' => $ld, 'hv' => $hv, 'vs' => $vs, 'letter' => $ids['Lettre de Jean à Marie'], 'docs' => count($docs)]);
`;
const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', seed], { cwd: appRoot, encoding: 'utf8', env: envFor(dir) });
if (r.status !== 0 || !/\{"ld"/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); }
const ids = JSON.parse(r.stdout.slice(r.stdout.indexOf('{"ld"')));
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const kioskOn = on => { const f = path.join(dir, 'consultation.json'); if (on) fs.writeFileSync(f, JSON.stringify({ hash: 'x', since: '2026-10-28' })); else if (fs.existsSync(f)) fs.unlinkSync(f); };

(async () => {
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(dir), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    const get = async q => (await fetch(base + 'api.php?action=onglets&' + q)).json();
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(x => setTimeout(x, 100)); } }
    let browser = null;
    try {
        /* 1. serveur */
        const L = await get('op=documents');
        assert.equal(L.documents.length, ids.docs, 'tous les documents');
        assert.ok(L.documents.every(d => d.id && d.title), 'titre partout');
        const D = await get('op=document&id=' + ids.letter);
        assert.equal(D.document.title, 'Lettre de Jean à Marie');
        assert.deepEqual(D.document.people.map(p => p.name).sort(), ['Jean Martin', 'Marie Roux', 'Vivant Secret'], 'personnes reliées');
        assert.equal(D.document.people.find(p => p.name === 'Jean Martin').birth, 1892, 'années de vie');
        const AR = await get('op=artists');
        assert.deepEqual(AR.artists.map(a => a.id).sort(), [ids.ld, ids.hv, ids.vs].sort(), 'les artistes');
        assert.equal((await get('op=nimporte')).error ? 'ok' : 'non', 'ok', 'demande inconnue refusée');
        kioskOn(true);
        assert.ok(!(await get('op=artists')).artists.some(a => a.id === ids.vs), 'consultation : pas l’artiste vivant');
        assert.ok(!(await get('op=document&id=' + ids.letter)).document.people.some(p => p.name === 'Vivant Secret'), 'consultation : vivant pas nommé');
        assert.ok(!(await get('op=documents')).documents.some(d => (d.people || []).some(p => p.name === 'Vivant Secret')), 'consultation : vivant pas nommé (liste)');
        kioskOn(false);
        console.log('✓ serveur : documents, fiche, artistes, mode consultation');

        let pw = null;
        for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
        if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); return; }
        browser = await pw.chromium.launch();
        const errors = [];
        const open = async (vp, init = null) => {
            const ctx = await browser.newContext({ viewport: vp });
            await ctx.route(/cdn\.jsdelivr\.net|unpkg\.com|tile|openstreetmap/, x => x.abort());
            const page = await ctx.newPage();
            page.on('pageerror', e => errors.push(String(e.message)));
            page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
            await page.goto(base); await page.waitForFunction(() => window.LCNDA_APP?.api && window.LCNDA_EXT?.onglets?.catalogue && window.LCNDA_ART?.Store);
            if (init) { await page.evaluate(init); await page.reload(); await page.waitForFunction(() => window.LCNDA_APP?.api && window.LCNDA_EXT?.onglets?.catalogue && window.LCNDA_ART?.Store); }
            return { ctx, page };
        };
        const show = () => { localStorage.setItem('genealogie-menu-documents', '1'); localStorage.setItem('genealogie-menu-catalogue', '1'); localStorage.setItem('genealogie-menu-hidden', '[]'); };

        /* 2. cachés au départ */
        let { ctx, page } = await open({ width: 1440, height: 900 });
        const hidden0 = await page.evaluate(() => ['documents', 'catalogue'].map(k => { const b = document.querySelector(`.main-nav [data-module="${k}"]`); return !!b && (b.hidden || getComputedStyle(b).display === 'none'); }));
        assert.deepEqual(hidden0, [true, true], 'les deux onglets sont cachés au départ');
        // Réglages → Apparence → onglets du menu : les deux lignes sont là, décochées ; on les coche (enregistré tout seul, K2)
        await page.evaluate(() => { location.hash = '#maintenance/nav_menus'; });
        await page.waitForSelector('[data-order-key="documents"] .order-visible input', { state: 'attached' });
        const rows0 = await page.evaluate(() => ['documents', 'catalogue'].map(k => document.querySelector(`[data-order-key="${k}"] .order-visible input`).checked));
        assert.deepEqual(rows0, [false, false], 'dans Réglages, les deux onglets sont décochés au départ');
        await page.evaluate(() => ['documents', 'catalogue'].forEach(k => { const i = document.querySelector(`[data-order-key="${k}"] .order-visible input`); if (!i.checked) i.click(); }));
        await page.waitForFunction(() => ['documents', 'catalogue'].every(k => { const b = document.querySelector(`.main-nav [data-module="${k}"]`); return b && !b.hidden && getComputedStyle(b).display !== 'none'; }), null, { timeout: 8000 });
        await page.reload(); await page.waitForFunction(() => window.LCNDA_EXT?.onglets?.documents);
        const shown = await page.evaluate(() => ['documents', 'catalogue'].map(k => { const b = document.querySelector(`.main-nav [data-module="${k}"]`); return !!b && !b.hidden && getComputedStyle(b).display !== 'none' && b.textContent.trim(); }));
        assert.ok(/📄 Documents/.test(shown[0]) && /🎨 Catalogue raisonné/.test(shown[1]), 'les deux onglets apparaissent : ' + shown);
        console.log('✓ onglets cachés au départ, visibles une fois montrés');

        /* 3. Documents */
        await page.click('.main-nav [data-module="documents"]');
        await page.waitForSelector('#sidebar-content [data-ong-doc]');
        const az = await page.evaluate(() => ({ rows: document.querySelectorAll('#sidebar-content [data-ong-doc]').length, heads: [...document.querySelectorAll('#sidebar-content .ong-lh')].map(x => x.textContent), z: !document.querySelector('[data-ong-letter="Z"]').disabled, q: document.querySelector('[data-ong-letter="Q"]').disabled, title: document.querySelector('#workspace h1, #workspace h2')?.textContent || '' }));
        assert.ok(az.rows >= 50, 'des lignes A → Z : ' + az.rows);
        assert.deepEqual(az.heads.slice(0, 3), ['A', 'B', 'C'], 'lettres repères dans la liste');
        assert.ok(az.z && az.q, 'lettre Z active, lettre Q grisée');
        assert.match(az.title, /Documents/);
        await page.click('#sidebar-content [data-ong-doc]:has-text("Lettre de Jean à Marie")');
        await page.waitForSelector('#workspace [data-ong-page="document"]');
        const sheet = await page.evaluate(() => ({ h: document.querySelector('#workspace h1, #workspace h2').textContent, hash: location.hash, cote: document.querySelector('.ong-fields').textContent, people: document.querySelectorAll('.ong-person').length, range: !!document.querySelector('[data-sf-range="document"]'), edit: !!document.querySelector('[data-ong-edit]') }));
        assert.match(sheet.h, /Lettre de Jean à Marie/); assert.equal(sheet.hash, '#documents/' + ids.letter);
        assert.match(sheet.cote, /L 14\/3/); assert.match(sheet.cote, /Compris/); assert.equal(sheet.people, 3);
        assert.ok(sheet.range && sheet.edit, '✎ Modifier et 📁 Ranger');
        if (shots) await page.screenshot({ path: path.join(shots, 'test-1440-document.png') });
        // 📁 Dossiers : le rangement de Graphiques
        await page.evaluate(id => { window.LCNDA_SIDE_FOLDERS.write('document', { folders: [{ id: 'f_guerre', name: 'Guerre 1914-1918', parent: null }], of: { [id]: 'f_guerre' }, closed: [] }); }, ids.letter);
        await page.click('#sidebar-content [data-ong-mode="folders"]');
        await page.waitForSelector('#sidebar-content [data-sf-folder="f_guerre"]');
        const fold = await page.evaluate(id => ({ inside: !!document.querySelector(`[data-sf-folder="f_guerre"] [data-ong-doc="${id}"]`), loose: document.querySelectorAll('[data-sf-loose] [data-ong-doc]').length, count: document.querySelector('[data-sf-folder="f_guerre"] .sf-count').textContent }), ids.letter);
        assert.ok(fold.inside && fold.loose === ids.docs - 1 && fold.count === '1', 'le document est dans son dossier : ' + JSON.stringify(fold));
        await page.click('#sidebar-content [data-ong-mode="az"]');
        console.log('✓ Documents : A → Z, lettres, fiche, dossiers');

        /* 4. Catalogue */
        await page.evaluate(pid => { localStorage.setItem('genealogie-catalogue-tab', JSON.stringify({ pid, by: { [pid]: 'albums' } })); }, ids.ld);
        await page.click('.main-nav [data-module="catalogue"]');
        await page.waitForSelector('#sidebar-content .ong-grp');
        const alb = await page.evaluate(() => [...document.querySelectorAll('#sidebar-content .ong-grp')].map(g => ({ t: g.querySelector('.ong-gtitle strong').textContent, open: g.classList.contains('is-open'), tracks: [...g.querySelectorAll('.ong-track')].map(x => x.querySelector('.ong-pos').textContent + ' ' + x.querySelector('.ong-ttl').textContent), sides: [...g.querySelectorAll('.ong-side-h')].map(x => x.textContent) })));
        assert.deepEqual(alb.map(a => a.t), ['Rive gauche', 'Les Saisons', 'En public à Bobino'], 'albums par date');
        await page.click('#sidebar-content .ong-grp:nth-child(2) [data-ong-g]');
        const saisons = await page.evaluate(() => { const g = document.querySelectorAll('#sidebar-content .ong-grp')[1]; return { tracks: [...g.querySelectorAll('.ong-track')].map(x => x.querySelector('.ong-pos').textContent), sides: [...g.querySelectorAll('.ong-side-h')].map(x => x.textContent) }; });
        assert.deepEqual(saisons.tracks, ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3'], 'pistes dans l’ordre');
        assert.deepEqual(saisons.sides, ['Face A', 'Face B'], 'faces A et B');
        await page.click('#sidebar-content .ong-track:has-text("La Mer à Sète")');
        await page.waitForSelector('#workspace .ong-catpage .ar-sheet');
        assert.match(await page.textContent('#workspace .ong-catpage'), /Sur 2 albums/);
        assert.equal(await page.locator('#sidebar-content .ong-gtitle.is-active').count(), 0, 'aucun album marqué choisi à tort');
        const act = await page.evaluate(() => [...document.querySelectorAll('#sidebar-content .ong-track.is-active .ong-ttl')].map(x => x.textContent));
        assert.ok(act.length >= 1 && act.every(t => t === 'La Mer à Sète'), 'la chanson choisie est marquée (sur chaque album ouvert) : ' + act);
        if (shots) await page.screenshot({ path: path.join(shots, 'test-1440-catalogue-albums.png') });
        await page.selectOption('#sidebar-content [data-ong-by]', 'songs');
        await page.waitForSelector('#sidebar-content .ong-song');
        const songs = await page.evaluate(() => [...document.querySelectorAll('#sidebar-content .ong-song')].map(s => [s.querySelector('strong').textContent, s.querySelector('.ong-apps')?.textContent.trim()]));
        assert.ok(songs.some(([t, n]) => t === 'La Mer à Sète' && /sur 2/.test(n)), 'la chanson « sur 2 » : ' + JSON.stringify(songs));
        assert.ok(songs.some(([t]) => t === 'Rue des Lilas'), 'une piste sans fiche de morceau devient une chanson');
        await page.click('#sidebar-content .ong-song:has-text("La Mer à Sète") [data-ong-apps]');
        assert.equal(await page.locator('#sidebar-content .ong-applist .ong-app').count(), 2, '« sur 2 » se déplie');
        // une peintre : par période (décennies), puis ses périodes ; par technique
        await page.evaluate(pid => { location.hash = '#catalogue/' + pid; }, ids.hv); // l'adresse choisit l'artiste
        await page.waitForFunction(() => document.querySelector('#sidebar-content [data-ong-by]')?.value === 'period', null, {timeout: 8000});
        const per = await page.evaluate(() => [...document.querySelectorAll('#sidebar-content .ong-grp')].map(g => [g.querySelector('.ong-gtitle strong').textContent, g.querySelector('.sf-count')?.textContent]));
        assert.deepEqual(per, [['Années 1930', '1'], ['Années 1940', '3'], ['Années 1950', '1'], ['Sans date', '1']], 'par décennie : ' + JSON.stringify(per));
        await page.evaluate(pid => { const p = JSON.parse(localStorage.getItem('genealogie-catalogue-tab')); p.periods = { [pid]: [{ name: 'Les débuts', from: 1928, to: 1939 }, { name: 'Période bleue', from: 1946, to: 1952 }] }; localStorage.setItem('genealogie-catalogue-tab', JSON.stringify(p)); }, ids.hv);
        await page.evaluate(() => window.LCNDA_APP.renderSidebar());
        await page.waitForSelector('#sidebar-content .ong-grp');
        const per2 = await page.evaluate(() => [...document.querySelectorAll('#sidebar-content .ong-grp')].map(g => [g.querySelector('.ong-gtitle strong').textContent, g.querySelector('.sf-count')?.textContent]));
        assert.deepEqual(per2, [['Les débuts · 1928–1939', '1'], ['Période bleue · 1946–1952', '3'], ['Sans période', '2']], 'périodes de l’artiste : ' + JSON.stringify(per2));
        await page.selectOption('#sidebar-content [data-ong-by]', 'technique');
        const tech = await page.evaluate(() => [...document.querySelectorAll('#sidebar-content .ong-grp .ong-gtitle strong')].map(x => x.textContent));
        assert.deepEqual(tech, ['Dessin (fusain)', 'Gouache', 'Huile sur toile'], 'par technique');
        await page.selectOption('#sidebar-content [data-ong-by]', 'catref');
        const cr = await page.evaluate(() => [...document.querySelectorAll('#sidebar-content .ong-row .ong-kind')].map(x => x.textContent));
        assert.deepEqual(cr, ['CR 3', 'CR 112', 'CR 113', 'CR 120', 'CR 140'], 'par n° de catalogue');
        console.log('✓ Catalogue : albums (pistes, faces), chansons (sur 2), périodes, technique, n°');
        await ctx.close();

        /* 5. 390 px, sombre, consultation */
        ({ ctx, page } = await open({ width: 390, height: 844 }, show));
        for (const h of ['#documents/' + ids.letter, '#catalogue/' + ids.ld]) {
            await page.evaluate(x => { location.hash = x; }, h); await page.waitForTimeout(1500);
            const w = await page.evaluate(() => document.documentElement.scrollWidth);
            assert.ok(w <= 392, `390 px : pas de défilement de côté (${h} : ${w})`);
            if (shots) await page.screenshot({ path: path.join(shots, `test-390-${h.split('/')[0].slice(1)}.png`) });
        }
        await ctx.close();
        ({ ctx, page } = await open({ width: 1440, height: 900 }, () => { localStorage.setItem('genealogie-menu-documents', '1'); localStorage.setItem('genealogie-menu-hidden', '[]'); localStorage.setItem('genealogie-design', JSON.stringify({ ...window.LCNDA_APP.readDesignSettings(), preset: 'dark' })); }));
        for (let i = 0; i < 3 && await page.evaluate(() => document.documentElement.dataset.theme !== 'dark'); i++) { // le réglage de la base peut arriver après : on le repose
            await page.evaluate(() => localStorage.setItem('genealogie-design', JSON.stringify({ ...window.LCNDA_APP.readDesignSettings(), preset: 'dark' }))); await page.reload(); await page.waitForFunction(() => window.LCNDA_EXT?.onglets?.documents); await page.waitForTimeout(800);
        }
        await page.evaluate(id => { location.hash = '#documents/' + id; }, ids.letter); await page.waitForSelector('#workspace [data-ong-page="document"]');
        const dark = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, bg: getComputedStyle(document.querySelector('.ong-fields')).backgroundColor, fg: getComputedStyle(document.querySelector('.ong-fields dd')).color }));
        const lum = c => { const m = c.match(/\d+/g).map(Number); return (m[0] * 299 + m[1] * 587 + m[2] * 114) / 1000; };
        assert.equal(dark.theme, 'dark'); assert.ok(lum(dark.bg) < 90 && lum(dark.fg) > 160, 'sombre lisible : ' + JSON.stringify(dark));
        if (shots) await page.screenshot({ path: path.join(shots, 'test-sombre-document.png') });
        await ctx.close();
        kioskOn(true);
        ({ ctx, page } = await open({ width: 1440, height: 900 }, show));
        await page.evaluate(id => { location.hash = '#documents/' + id; }, ids.letter); await page.waitForSelector('#workspace [data-ong-page="document"]');
        const ro = await page.evaluate(() => ({ edit: !!document.querySelector('[data-ong-edit]'), range: !!document.querySelector('#workspace [data-sf-range]'), imp: !!document.querySelector('[data-ong-import]'), vivant: /Vivant/.test(document.querySelector('#workspace').textContent) }));
        assert.deepEqual(ro, { edit: false, range: false, imp: false, vivant: false }, 'consultation : lecture seule');
        await page.evaluate(id => { location.hash = '#catalogue/' + id; }, ids.ld); await page.waitForSelector('#workspace [data-ong-page="catalogue"]');
        assert.equal(await page.locator('#workspace [data-ong-edit], #workspace [data-ong-book]').count(), 0, 'consultation : pas de bouton qui modifie');
        await ctx.close();
        kioskOn(false);
        console.log('✓ 390 px, sombre, consultation');
        assert.deepEqual(errors, [], 'aucune erreur JS');
        console.log('✓ aucune erreur JS');
    } finally {
        kioskOn(false);
        if (browser) await browser.close();
        proc.kill();
        fs.rmSync(dir, { recursive: true, force: true });
    }
})().catch(e => { console.error(e); process.exit(1); });
