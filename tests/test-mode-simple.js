'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🧓 Mode simple (assets/js/app-mode-simple.js, lib/mode_simple.php) :   node tests/test-mode-simple.js
 * Une base neuve avec une petite famille de Corrèze (4 générations au-dessus d'Odette, 3 en dessous), de vraies photos
 * avec les zones des visages, puis un vrai « php -S » et un navigateur (Playwright ; sinon la partie navigateur est sautée) :
 *  1. serveur : GET mode_simple_data (personnes, vivants, unions dans l'ordre, photos et visages, fiche confidentielle) ;
 *  2. liens de parenté calculés justes (sang, alliances, cousins) et histoire au féminin et au masculin ;
 *  3. entrée (la 1re fois « Préparer », puis ▶ Ouvrir) et sortie (appui court refusé, appui long, code à 4 chiffres haché) ;
 *  4. lecture seule : aucune requête POST ne part pendant le mode (même un POST tenté par la page) ;
 *  5. vivants cachés, prénom seulement, fiche confidentielle jamais montrée ;
 *  6. cibles de 64 px et texte de 22 px au moins, sur chaque écran ; contraste AAA des 3 thèmes ; 1024×768, 1440×900, 390×844
 *     sans défilement de côté ;
 *  7. clavier : Tab, flèches, Entrée, ↑ dans l'arbre, + −, Échap = Retour, ← → du diaporama ;
 *  8. Maintenance → Accessibilité → 🧓 Mode simple : réglage → aperçu vivant → mode, « ✓ Enregistré » et « ↶ Annuler » (K2).
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-mode-simple-'));
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
fs.mkdirSync(path.join(tmp, 'media'), { recursive: true });
const SEED = String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:' . DATA_DIR . '/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT . '/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php';
$pdo = db();
$tag = static function (string $t) use ($pdo): int { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$T = ['BIRT' => $tag('BIRT'), 'DEAT' => $tag('DEAT'), 'MARR' => $tag('MARR'), 'CHR' => $tag('CHR') ?: $tag('BAPM')];
$placeId = static function (string $n) use ($pdo): int { static $c = []; if (isset($c[$n])) return $c[$n]; $pdo->prepare("INSERT INTO places(name,country) VALUES(?, 'France')")->execute([$n]); return $c[$n] = (int) $pdo->lastInsertId(); };
$M = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
$fr = static function (string $iso) use ($M): string { $p = array_map('intval', explode('-', $iso)); $y = $p[0]; $mo = $p[1] ?? 0; $d = $p[2] ?? 0; return $d ? "$d {$M[$mo - 1]} $y" : ($mo ? "{$M[$mo - 1]} $y" : "$y"); };
$event = static function (int $type, ?int $pid, ?int $fid, string $iso, string $place) use ($pdo, $placeId, $fr): void {
    if ($iso === '') return;
    $pdo->prepare('INSERT INTO events(scope, person_id, family_id, event_type_id, date_text, year, place_id) VALUES(?,?,?,?,?,?,?)')
        ->execute([$fid ? 'family' : 'person', $pid, $fid, $type, $fr($iso), (int) substr($iso, 0, 4), $place !== '' ? $placeId($place) : null]);
};
$today = new DateTimeImmutable('today'); $md = static fn(int $plus) => $today->modify("+$plus day")->format('m-d');
$rows = [
 ['mp1','Pierre','MARTIN','m','1828-06-06','Naves','1892-09-25','Tulle',''], ['mp2','Marie','MAZEL','f','1830-04-20','Tulle','1895-04-24','Tulle',''],
 ['p1','Jean','MARTIN','m','1858-02-13','Tulle','1938-04-02','Tulle','sabotier'], ['p2','Marguerite','FAURE','f','1864-03-15','Naves','1921-02-02','Naves',''],
 ['p3','Pierre','CHASTANG','m','1867-02-18','Arnac-la-Poste','1940-04-03','Brive-la-Gaillarde','cultivateur'], ['p4','Marie','LEROY','f','1870-06-20','Aurillac','1937-12-05','Brive-la-Gaillarde',''],
 ['p5','Joseph','MARTIN','m','1890-07-22','Tulle','1962-11-03','Tulle','Menuisier'], ['p7','Henri','MARTIN','m','1892-09-30','Tulle','1916-03-12','Verdun','soldat'],
 ['p6','Louise','CHASTANG','f','1897-05-03','Arnac-la-Poste','1961-02-04','Tulle','couturière'], ['p8','Antoine','BORIE','m','1898-03-01','Naves','1970-10-20','Brive-la-Gaillarde','boulanger'],
 ['p9','Jeanne','PEYRE','f','1900-09-23','Aurillac','1979-11-28','Brive-la-Gaillarde',''], ['p11','Paul','MARTIN','m','1920-08-12','Tulle','2004-03-15','Tulle','menuisier'],
 ['p12','Claire','VIDAL','f','1922-12-02','Tulle','2015-01-30','Tulle',''], ['p30','Marcelle','MARTIN','f','1924-02-08','Tulle','2019-08-30','Limoges','sage-femme'],
 ['p13','André','BORIE','m','1931-01-14','Naves','2011-06-09','Brive-la-Gaillarde','facteur'], ['p10','Odette','MARTIN','f','1936-' . $md(6),'Tulle','','','institutrice'],
 ['p18','Luc','MARTIN','m','1954-06-15','Tulle','','','pharmacien'], ['p14','Michel','BORIE','m','1959-11-02','Brive-la-Gaillarde','','','mécanicien'],
 ['p15','Sylvie','DELMAS','f','1961-04-18','Brive-la-Gaillarde','','','infirmière'], ['p17','Laurent','ROUX','m','1960-12-01','Limoges','','','ingénieur'],
 ['p16','Catherine','BORIE','f','1962-03-09','Brive-la-Gaillarde','','',''], ['p19','Julien','BORIE','m','1987-01-25','Brive-la-Gaillarde','','','électricien'],
 ['p20','Camille','NOËL','f','1989-07-08','Bordeaux','','',''], ['p21','Émilie','BORIE','f','1990-' . $md(3),'Brive-la-Gaillarde','','','boulangère'],
 ['p25','Nicolas','FAYE','m','1988-02-02','Tulle','','',''], ['p22','Thomas','ROUX','m','1993-05-30','Limoges','','',''],
 ['p23','Léa','BORIE','f','2016-' . $md(0),'Brive-la-Gaillarde','','',''], ['p24','Hugo','BORIE','m','2019-11-05','Brive-la-Gaillarde','','',''],
 ['px','Secret','CACHÉ','f','1940-01-01','Tulle','','',''],
];
$ID = [];
foreach ($rows as [$k, $first, $last, $sex, $b, $bp, $d, $dp, $job]) {
    $pdo->prepare('INSERT INTO persons(first_name,last_name,gender,living_status,occupation,is_start,is_private) VALUES(?,?,?,?,?,?,?)')
        ->execute([$first, $last, $sex === 'm' ? 'male' : 'female', $d ? 'deceased' : 'living', $job, $k === 'p10' ? 1 : 0, $k === 'px' ? 1 : 0]);
    $ID[$k] = (int) $pdo->lastInsertId();
    $event($T['BIRT'], $ID[$k], null, $b, $bp); if ($d) $event($T['DEAT'], $ID[$k], null, $d, $dp);
}
$fams = [['mp1','mp2','1855-01-15','Tulle',['p1']], ['p1','p2','1887-09-17','Naves',['p5','p7']], ['p3','p4','1894-05-02','Arnac-la-Poste',['p6']],
 ['p5','p6','1919-10-21','Tulle',['p11','p30','p10']], ['p8','p9','1925-04-25','Naves',['p13']], ['p11','p12','1948-09-04','Tulle',['p18']],
 ['p13','p10','1958-' . $md(1),'Naves',['p14','p16']], ['p14','p15','1985-06-22','Brive-la-Gaillarde',['p19','p21']], ['p17','p16','1990-09-15','Brive-la-Gaillarde',['p22']],
 ['p19','p20','2014-06-14','Brive-la-Gaillarde',['p23','p24']], ['p25','p21','2015-05-09','Tulle',[]], ['p10','px','','',[]]];
foreach ($fams as [$a, $b, $d, $pl, $kids]) {
    $pdo->prepare('INSERT INTO families(partner1_id,partner2_id) VALUES(?,?)')->execute([$ID[$a], $ID[$b]]); $fid = (int) $pdo->lastInsertId();
    $event($T['MARR'], null, $fid, $d, $pl);
    foreach ($kids as $i => $k) $pdo->prepare('INSERT INTO family_children(family_id,child_id,position) VALUES(?,?,?)')->execute([$fid, $ID[$k], $i + 1]);
}
$event($T['CHR'], $ID['p6'], null, '1897-05-09', 'Arnac-la-Poste');
$n = 0;
foreach ([['Le mariage de Joseph et Louise', '21 octobre 1919', ['p1','p2','p5','p6','p3','p4'], 0], ['Léa et Hugo', 'juillet 2023', ['p23','p24'], 0], ['Odette au jardin', 'juin 1941', ['p10'], 0], ['La maison de Naves', '1932', [], 0], ['Acte de naissance de Joseph', '23 juillet 1890', ['p5'], 1], ['Photo de Secret', '1950', ['px'], 0]] as [$title, $date, $who, $doc]) {
    $n++; $file = "ms-$n.jpg"; $im = imagecreatetruecolor(800, 600); imagefill($im, 0, 0, imagecolorallocate($im, 120 + 15 * $n, 150, 190)); imagejpeg($im, MEDIA_DIR . '/' . $file, 80);
    $pdo->prepare("INSERT INTO media(title, filename, media_type, date_text, document_title) VALUES(?, ?, 'image', ?, ?)")->execute([$title, $file, $date, $doc ? 'Naissance' : '']);
    $mid = (int) $pdo->lastInsertId();
    foreach ($who as $i => $k) { $pdo->prepare("INSERT INTO media_links(media_id, entity_type, entity_id, position) VALUES(?, 'person', ?, ?)")->execute([$mid, $ID[$k], $i]);
        $pdo->prepare("INSERT INTO media_tags(media_id, person_id, x, y, w, h, tag_type) VALUES(?,?,?,?,?,?, 'person')")->execute([$mid, $ID[$k], 5 + $i * 15, 20, 12, 20]); }
    if ($title === 'Odette au jardin') $pdo->prepare('UPDATE persons SET portrait_media_id=? WHERE id=?')->execute([$mid, $ID['p10']]);
}
echo json_encode($ID);`;
let ID = {};
{
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', SEED], { cwd: appRoot, encoding: 'utf8', env: envFor(tmp) });
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    ID = JSON.parse(r.stdout.trim().split('\n').pop());
}
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const ok = (msg) => console.log('  ✓ ' + msg);

(async () => {
    const port = Number(process.env.MODE_SIMPLE_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(tmp), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    let browser = null;
    try {
        for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
        /* 1. serveur */
        const data = await (await fetch(base + 'api.php?action=mode_simple_data')).json();
        const P = id => data.persons.find(p => p.id === id);
        assert.equal(data.persons.length, 29);
        assert.equal(P(ID.p10).living, 1); assert.equal(P(ID.p6).living, 0); assert.equal(P(ID.px).priv, 1);
        assert.match(P(ID.p10).photo, /^media\/ms-3\.jpg$/);
        assert.deepEqual(P(ID.p6).birth, { date: { y: 1897, m: 5, d: 3, about: false }, place: 'Arnac-la-Poste' });
        assert.equal(P(ID.p6).bapt.date.d, 9);
        const fam = data.families.find(f => f.a === ID.p5 && f.b === ID.p6);
        assert.deepEqual(fam.c, [ID.p11, ID.p30, ID.p10]); assert.equal(fam.marr.place, 'Tulle');
        const wed = data.media.find(m => m.title === 'Le mariage de Joseph et Louise');
        assert.equal(wed.people.length, 6); assert.equal(wed.faces.length, 6); assert.equal(wed.doc, 0);
        assert.equal(data.media.find(m => m.title.startsWith('Acte')).doc, 1);
        assert.equal(data.start, ID.p10);
        ok('serveur : personnes, vivants, unions, photos, visages, documents, fiche confidentielle');

        let pw = null;
        for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
        if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); return; }
        browser = await pw.chromium.launch();
        const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
        const page = await ctx.newPage();
        const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
        page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errors.push(m.text()); });
        const posts = []; page.on('request', r => { if (!/^(GET|HEAD)$/.test(r.method())) posts.push(r.method() + ' ' + r.url()); });
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_EXT?.modeSimple && window.LCNDA_APP?.state && document.getElementById('mode-simple-open'));
        const MS = fn => page.evaluate(fn);

        /* 2. liens de parenté et histoire */
        await MS(() => window.LCNDA_EXT.modeSimple.loadData(true));
        const kin = await page.evaluate(ID => { const k = window.LCNDA_EXT.modeSimple.kin, o = ID.p10; return {
            pere: k(o, ID.p5), mere: k(o, ID.p6), gm: k(o, ID.p2), gp: k(o, ID.p1), agp: k(o, ID.mp1), mari: k(o, ID.p13), fils: k(o, ID.p14), fille: k(o, ID.p16),
            pf: k(o, ID.p22), apf: k(o, ID.p24), apfille: k(o, ID.p23), belleFille: k(o, ID.p15), gendre: k(o, ID.p17), beauPere: k(o, ID.p8), belleMere: k(o, ID.p9),
            femmePf: k(o, ID.p20), mariPf: k(o, ID.p25), soeur: k(o, ID.p30), frere: k(o, ID.p11), belleSoeur: k(o, ID.p12), neveu: k(o, ID.p18), oncle: k(o, ID.p7), toi: k(o, o),
            germain: k(ID.p19, ID.p22), germaine: k(ID.p22, ID.p21), cousin: k(ID.p23, ID.p22), petiteFille: k(ID.p13, ID.p21), grandOncle: k(ID.p19, ID.p11), tante: k(ID.p19, ID.p16) }; }, ID);
        assert.deepEqual(kin, { pere: 'ton père', mere: 'ta mère', gm: 'ta grand-mère', gp: 'ton grand-père', agp: 'ton arrière-grand-père', mari: 'ton mari', fils: 'ton fils', fille: 'ta fille',
            pf: 'ton petit-fils', apf: 'ton arrière-petit-fils', apfille: 'ton arrière-petite-fille', belleFille: 'ta belle-fille', gendre: 'ton gendre', beauPere: 'ton beau-père', belleMere: 'ta belle-mère',
            femmePf: 'la femme de ton petit-fils Julien', mariPf: 'le mari de ta petite-fille Émilie', soeur: 'ta sœur', frere: 'ton frère', belleSoeur: 'ta belle-sœur', neveu: 'ton neveu', oncle: 'ton oncle', toi: 'toi',
            germain: 'ton cousin germain', germaine: 'ta cousine germaine', cousin: 'ton cousin', petiteFille: 'ta petite-fille', grandOncle: 'ton grand-oncle', tante: 'ta tante' });
        ok('liens de parenté : sang, alliances, cousins (« le mari de ta petite-fille Émilie »)');

        /* 3. entrée : la 1re fois, « Préparer » (les réglages) */
        await page.click('#mode-simple-open');
        await page.waitForSelector('.a11y-page [data-ms-box] .ms-set');
        assert.equal(await MS(() => !!window.LCNDA_EXT.modeSimple.isOpen()), false);
        ok('1re fois : le bouton 🧓 ouvre « Préparer » (Maintenance → Accessibilité → 🧓 Mode simple)');
        posts.length = 0;
        await page.click('[data-ms-open="now"]');
        await page.waitForSelector('#ms-root .ms-home');
        const bio = await page.evaluate(ID => { const m = window.LCNDA_EXT.modeSimple.current(); return {f: m.bio(ID.p6).join(' '), m: m.bio(ID.p5).join(' ')}; }, ID);
        for (const s of ['Louise Chastang est née le 3 mai 1897 à Arnac-la-Poste.', 'Elle a été baptisée le 9 mai 1897 à Arnac-la-Poste.', 'C’est la fille de Pierre Chastang et Marie Leroy.', 'Elle était couturière.',
            'Le 21 octobre 1919, à Tulle, elle s’est mariée avec Joseph Martin.', 'Ils ont eu 3 enfants : Paul, Marcelle et Odette.', 'Elle est décédée le 4 février 1961 à Tulle, à 63 ans.']) assert.ok(bio.f.includes(s), 'histoire de Louise : ' + s + '\n' + bio.f);
        for (const s of ['Joseph Martin est né le 22 juillet 1890 à Tulle.', 'C’est le fils de Jean Martin et Marguerite Faure.', 'Il était menuisier.', 'il s’est marié avec Louise Chastang.', 'Il est décédé le 3 novembre 1962 à Tulle, à 72 ans.']) assert.ok(bio.m.includes(s), 'histoire de Joseph : ' + s + '\n' + bio.m);
        ok('histoire en phrases : au féminin (Louise) et au masculin (Joseph)');

        /* 6. tailles : cibles ≥ 64 px, texte ≥ 22 px, sur chaque écran */
        const measure = () => page.evaluate(() => {
            const root = document.querySelector('#ms-root .ms'), bad = [];
            root.querySelectorAll('button, input, [role=tab]').forEach(b => { const r = (b.matches('input') && b.closest('label')) ? b.closest('label').getBoundingClientRect() : b.getBoundingClientRect(); if (!r.width || !b.getClientRects().length || getComputedStyle(b).visibility === 'hidden') return; if (r.width < 63.5 || r.height < 63.5) bad.push('cible ' + Math.round(r.width) + '×' + Math.round(r.height) + ' ' + (b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 30)); });
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
            while ((n = walker.nextNode())) { const el = n.parentElement; if (!n.textContent.trim() || el.closest('.ms-sr, [aria-hidden=true], .lc-av') || !el.getClientRects().length) continue; const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 21.9) bad.push('texte ' + fs + 'px « ' + n.textContent.trim().slice(0, 30) + ' »'); }
            const m = root.querySelector('.ms-main'); if (m.scrollWidth > m.clientWidth + 1) bad.push('défilement de côté ' + m.scrollWidth + ' > ' + m.clientWidth);
            if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('page plus large que l’écran');
            return bad;
        });
        const screens = async label => { const out = {};
            const step = async (name, fn) => { await fn(); await page.waitForTimeout(250); out[name] = await measure(); };
            await step('accueil', async () => { await page.click('#ms-root [data-act=home]').catch(() => {}); await page.waitForSelector('#ms-root .ms-home'); });
            await step('arbre', async () => { await page.click('#ms-root [data-to=tree]'); await page.waitForSelector('#ms-root .ms-tmain'); });
            await step('arbre-monde', async () => { await page.click('#ms-root [data-act=zout]'); await page.click('#ms-root [data-act=zout]'); });
            await step('fiche', async () => { await page.click('#ms-root .ms-tmain [data-act=person]'); await page.waitForSelector('#ms-root .ms-bio'); });
            await step('photos', async () => { await page.click('#ms-root [data-act=home]'); await page.click('#ms-root [data-to=photo]'); await page.waitForSelector('#ms-root .ms-ph-grid'); });
            await step('diaporama', async () => { await page.click('#ms-root [data-act=openslide]'); await page.waitForSelector('#ms-root .ms-pbox'); await page.click('#ms-root [data-act=tags]'); });
            await step('personnes', async () => { await page.click('#ms-root [data-act=home]'); await page.click('#ms-root [data-to=people]'); await page.waitForSelector('#ms-root .ms-prow'); });
            await step('chercher', async () => { await page.click('#ms-root [data-act=ptab][data-v=search]'); await page.fill('#ms-root .ms-q', 'lou'); await page.dispatchEvent('#ms-root .ms-q', 'input'); });
            await step('ce-jour', async () => { await page.click('#ms-root [data-act=home]'); await page.click('#ms-root [data-to=day]'); await page.waitForSelector('#ms-root .ms-h2'); });
            await step('qui', async () => { await page.click('#ms-root [data-act=home]'); await page.click('#ms-root [data-act=who]'); await page.waitForSelector('#ms-root .ms-who'); });
            await page.click('#ms-root [data-act=home]');
            const bad = Object.entries(out).filter(([, v]) => v.length);
            assert.deepEqual(bad, [], `${label} : ` + JSON.stringify(bad));
            return Object.keys(out).length;
        };
        const nScreens = await screens('1024×768');
        ok(`1024×768 : ${nScreens} écrans, cibles ≥ 64 px, texte ≥ 22 px, pas de défilement de côté`);
        for (const [w, h] of [[1440, 900], [390, 844]]) { await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(300); await screens(`${w}×${h}`); ok(`${w}×${h} : mêmes règles sur ${nScreens} écrans`); }
        await page.setViewportSize({ width: 1024, height: 768 });

        /* 6 bis. les 3 thèmes : contraste mesuré AAA (texte, texte gris, boutons, gros boutons) */
        const themes = await page.evaluate(() => { const M = window.LCNDA_EXT.modeSimple, out = {}; ['light', 'sepia', 'dark'].forEach(t => { const s = M.clean({...M.settings(), theme: t}), e = M.eff(s), p = e.pal; out[t] = Math.min(...M.contrastRows(p).map(r => r.r), M.ratio(p.muted, p.bg), M.ratio(p.muted, p.card), M.ratio(p.ink, p.card)); }); return out; });
        Object.entries(themes).forEach(([t, r]) => assert.ok(r >= 7, `contraste ${t} : ${r}`));
        for (const t of ['sepia', 'dark']) {
            await page.evaluate(t => { const M = window.LCNDA_EXT.modeSimple; M.close(); M.write({...M.settings(), theme: t}); M.open(); }, t); await page.waitForSelector('#ms-root .ms-home');
            const th = await page.evaluate(() => { const r = document.querySelector('#ms-root .ms'), cs = getComputedStyle(r); return {theme: r.dataset.theme, bg: cs.backgroundColor, ink: cs.color}; });
            assert.equal(th.theme, t); assert.notEqual(th.bg, th.ink);
            await screens(`thème ${t}`);
        }
        ok(`3 thèmes (clair, sépia, sombre) : contraste ≥ 7:1 partout (${Object.values(themes).map(r => r.toFixed(1)).join(' · ')}) et mêmes tailles`);
        await page.evaluate(() => { const M = window.LCNDA_EXT.modeSimple; M.close(); M.write({...M.settings(), theme: 'light'}); M.open(); }); await page.waitForSelector('#ms-root .ms-home');
        posts.length = 0; // à partir d'ici, le mode reste ouvert jusqu'à la sortie par l'appui long

        /* 7. clavier */
        await page.keyboard.press('Tab');
        const k1 = await page.evaluate(() => !!document.activeElement.closest('#ms-root'));
        await page.evaluate(() => document.querySelector('#ms-root [data-to=tree]').focus()); await page.keyboard.press('Enter'); await page.waitForSelector('#ms-root .ms-tmain');
        const c0 = await page.evaluate(() => window.LCNDA_EXT.modeSimple.debug().V.center);
        await page.keyboard.press('ArrowUp'); await page.waitForTimeout(100);
        const c1 = await page.evaluate(() => window.LCNDA_EXT.modeSimple.debug().V.center);
        await page.keyboard.press('-'); const z1 = await page.evaluate(() => window.LCNDA_EXT.modeSimple.debug().V.zoom); await page.keyboard.press('+'); const z2 = await page.evaluate(() => window.LCNDA_EXT.modeSimple.debug().V.zoom);
        await page.keyboard.press('Escape'); await page.waitForTimeout(100);
        const c2 = await page.evaluate(() => window.LCNDA_EXT.modeSimple.debug().V.center);
        await page.keyboard.press('Escape'); await page.waitForSelector('#ms-root .ms-home');
        await page.evaluate(() => document.querySelector('#ms-root [data-to=tree]').focus());
        const before = await page.evaluate(() => document.activeElement?.textContent); await page.keyboard.press('ArrowDown'); const after = await page.evaluate(() => document.activeElement?.textContent);
        assert.ok(k1, 'Tab reste dans le mode simple'); assert.equal(c0, ID.p10); assert.equal(c1, ID.p5, '↑ = vers les parents'); assert.deepEqual([z1, z2], [2, 3]); assert.equal(c2, ID.p10, 'Échap = Retour (la personne d’avant)'); assert.notEqual(before, after, 'les flèches passent au bouton voisin');
        await page.click('#ms-root [data-to=photo]'); await page.click('#ms-root [data-act=slideshow]'); await page.waitForSelector('#ms-root .ms-pbox');
        await page.keyboard.press('ArrowRight'); const sl = await page.evaluate(() => window.LCNDA_EXT.modeSimple.debug().V.slide);
        assert.equal(sl, 1); await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => window.LCNDA_EXT.modeSimple.debug().screen), 'home');
        ok('clavier : Tab, Entrée, ↑ (parents), − +, Échap = Retour, flèches, ← → du diaporama');

        /* 4. lecture seule : rien ne part pendant le mode, même un POST tenté par la page */
        const tried = await page.evaluate(async () => { try { await fetch('api.php?action=save_note', {method: 'POST', body: '{}'}); return 'parti'; } catch (e) { return 'refusé'; } });
        await page.evaluate(() => { document.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true})); });
        const ctxBlocked = await page.evaluate(() => { const e = new MouseEvent('contextmenu', {bubbles: true, cancelable: true}); document.querySelector('#ms-root .ms-tile').dispatchEvent(e); return e.defaultPrevented; });
        assert.equal(tried, 'refusé'); assert.equal(ctxBlocked, true, 'pas de clic droit');
        assert.deepEqual(posts, [], 'aucune requête POST pendant le mode : ' + posts.join(', '));
        assert.equal(await page.evaluate(() => document.body.classList.contains('is-kiosk')), true);
        ok('lecture seule : aucune requête POST pendant le mode (un POST tenté est refusé), pas de clic droit, comme le mode consultation');

        /* 3 bis. sortie : appui court refusé, appui long */
        const hold = async ms => { const b = await page.$('#ms-root .ms-hold'); const r = await b.boundingBox(); await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up(); await page.waitForTimeout(150); };
        await hold(400); assert.equal(await MS(() => window.LCNDA_EXT.modeSimple.isOpen()), true, 'un appui court ne fait pas sortir');
        assert.match(await page.textContent('#ms-root .ms-hint'), /Garde le doigt appuyé 3 secondes/);
        await hold(3300); assert.equal(await MS(() => window.LCNDA_EXT.modeSimple.isOpen()), false, 'l’appui long fait sortir');
        assert.equal(await page.evaluate(() => document.body.classList.contains('is-kiosk')), false);
        ok('sortie : appui court refusé, appui long de 3 s → l’app normale (mode consultation enlevé)');

        /* 8. l'onglet Accessibilité : réglage → aperçu → mode ; K2 */
        await page.evaluate(async () => { sessionStorage.setItem('lcnda-a11y-tab', 'simple'); localStorage.setItem('lcnda-mode-simple-open', JSON.stringify({who: 1, colors: 1, sizes: 1, font: 1, voice: 1, show: 1, slides: 1, exit: 1})); const A = window.LCNDA_APP; A.state.maintenanceTab = 'accessibilite'; await A.setModule('maintenance'); });
        await page.waitForSelector('[data-ms-box] .ms-preview .ms-home');
        await page.click('[data-ms-set="theme"][data-v="sepia"]'); await page.waitForTimeout(900);
        const pv = await page.evaluate(() => ({theme: document.querySelector('[data-ms-pv-host] .ms')?.dataset.theme, saved: document.querySelector('.ui-ph-saved')?.textContent || '', toast: [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ')}));
        assert.equal(pv.theme, 'sepia'); assert.match(pv.saved, /Enregistré/); assert.match(pv.toast, /Réglage changé[\s\S]*Annuler/);
        await page.click('[data-ms-set="font"][data-v="Atkinson Hyperlegible"]'); await page.waitForTimeout(300);
        assert.match(await page.evaluate(() => document.querySelector('[data-ms-pv-host] .ms').style.getPropertyValue('--font')), /Atkinson/);
        await page.evaluate(() => { const r = document.querySelector('[data-ms-range="fs"]'); if (r.value !== '30') { r.value = '30'; r.dispatchEvent(new Event('change', {bubbles: true})); } }); await page.waitForTimeout(300);
        assert.equal(await page.evaluate(() => document.querySelector('[data-ms-pv-host] .ms').style.getPropertyValue('--fs')), '30px');
        // « Pareil que l'app » : la taille du texte de toute l'app (120 %) s'applique aussi ; « Propre au mode simple » : non
        await page.evaluate(() => window.LCNDA_EXT.access.set('size', 120)); const e1 = await page.evaluate(() => window.LCNDA_EXT.modeSimple.eff(window.LCNDA_EXT.modeSimple.settings()).fs);
        await page.click('[data-ms-link="size"] + i'); await page.waitForTimeout(300); const e2 = await page.evaluate(() => window.LCNDA_EXT.modeSimple.eff(window.LCNDA_EXT.modeSimple.settings()).fs);
        await page.evaluate(() => window.LCNDA_EXT.access.set('size', 100));
        assert.deepEqual([e1, e2], [36, 30]);
        // vivants cachés, puis le code de sortie (haché)
        await page.click('[data-ms-set="living"][data-v="hide"]'); await page.waitForTimeout(200);
        const inputs = await page.$$('[data-ms-codein] input'); for (const [i, d] of ['2', '5', '8', '0'].entries()) await inputs[i].type(d); await page.waitForTimeout(300);
        const stored = await page.evaluate(() => { const all = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); all[k] = localStorage.getItem(k); } return {all: JSON.stringify(all), s: window.LCNDA_EXT.modeSimple.settings()}; });
        assert.ok(stored.s.useCode && /^[0-9a-f]{16}:[0-9a-f]{64}$/.test(stored.s.codeHash), 'code haché'); assert.ok(!/2580/.test(stored.all), 'le code n’est gardé nulle part en clair');
        ok('Accessibilité → 🧓 : thème, police, taille → aperçu vivant ; « ✓ Enregistré », « ↶ Annuler » ; « Pareil que l’app » ; code haché');

        posts.length = 0;
        await page.click('[data-ms-open="now"]'); await page.waitForSelector('#ms-root .ms-home');
        const look = await page.evaluate(() => { const r = document.querySelector('#ms-root .ms'); return {theme: r.dataset.theme, fs: getComputedStyle(r).fontSize, font: getComputedStyle(r).fontFamily}; });
        assert.deepEqual([look.theme, look.fs], ['sepia', '30px']); assert.match(look.font, /Atkinson/);
        /* 5. vivants cachés : la liste des personnes ne montre que les défunts (et la personne qui regarde) */
        await page.click('#ms-root [data-to=people]'); await page.waitForSelector('#ms-root .ms-prow');
        const names = await page.evaluate(() => [...document.querySelectorAll('#ms-root .ms-prow .ms-nm')].map(x => x.textContent));
        assert.ok(names.some(n => /Odette/.test(n)), 'la personne qui regarde reste'); assert.ok(names.some(n => /Louise/.test(n)));
        for (const n of ['Michel', 'Léa', 'Hugo', 'Julien', 'Secret']) assert.ok(!names.some(x => x.includes(n)), `${n} (vivant ou confidentiel) est caché`);
        await page.evaluate(() => { const M = window.LCNDA_EXT.modeSimple; M.close(); M.write({...M.settings(), living: 'first'}); M.open(); }); await page.waitForSelector('#ms-root .ms-home');
        await page.click('#ms-root [data-to=people]'); await page.waitForSelector('#ms-root .ms-prow');
        const firsts = await page.evaluate(() => [...document.querySelectorAll('#ms-root .ms-prow .ms-nm')].map(x => x.textContent));
        assert.ok(firsts.includes('Michel') && firsts.includes('Léa'), 'prénom seulement : ' + firsts.join(', ')); assert.ok(!firsts.some(n => /Secret|CACHÉ/i.test(n)), 'la fiche confidentielle n’est jamais montrée');
        await page.click('#ms-root [data-act=home]');
        ok('vivants : cachés, ou prénom seulement ; fiche confidentielle jamais montrée');
        /* 3 ter. sortie avec le code : mauvais code refusé, bon code accepté */
        const hold2 = async () => { const b = await page.$('#ms-root .ms-hold'); await b.scrollIntoViewIfNeeded(); const r = await b.boundingBox(); await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.mouse.down(); await page.waitForTimeout(3300); await page.mouse.up(); await page.waitForTimeout(150); };
        await hold2(); await page.waitForSelector('#ms-root .ms-pad');
        for (const d of '1111') await page.keyboard.press(d); await page.waitForTimeout(500);
        assert.equal(await MS(() => window.LCNDA_EXT.modeSimple.isOpen()), true); assert.match(await page.textContent('#ms-root .ms-msg'), /pas le bon code/);
        for (const d of '2580') await page.click(`#ms-root .ms-pad [data-k="${d}"]`); await page.waitForTimeout(300);
        assert.equal(await MS(() => window.LCNDA_EXT.modeSimple.isOpen()), false);
        assert.deepEqual(posts.filter(p => !/save_settings/.test(p)), [], 'aucune écriture pendant le mode');
        ok('sortie avec le code : mauvais code refusé (message), bon code → l’app normale');
        /* widget et « Ouvrir l'app en mode simple sur cet appareil » */
        await page.evaluate(() => localStorage.setItem('lcnda-mode-simple-device', JSON.stringify({start: true})));
        await page.goto(base); await page.waitForSelector('#ms-root .ms-home', { timeout: 15000 });
        await page.evaluate(() => { localStorage.removeItem('lcnda-mode-simple-device'); window.LCNDA_EXT.modeSimple.close(); });
        assert.ok(await page.evaluate(() => typeof window.LCNDA_EXT.dashboard.mode_simple_widget.render === 'function' && /Démarrer le mode simple/.test(window.LCNDA_EXT.dashboard.mode_simple_widget.render('01', {}, 'span-6'))));
        ok('« Ouvrir l’app directement en mode simple » (cet appareil) et le widget du tableau de bord');
        assert.deepEqual(errors, [], 'erreurs JavaScript : ' + errors.join(' | '));
        console.log('✓ mode simple : tout est bon');
    } finally {
        if (browser) await browser.close();
        proc.kill();
        fs.rmSync(tmp, { recursive: true, force: true });
    }
})().catch(e => { console.error(e); process.exit(1); });
