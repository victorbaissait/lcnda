'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * ✅ Contrôle de la base (lib/controle.php, assets/js/heritage-controle.js) :   node tests/test-controle-base.js
 *  1. un vrai « php -S » sur une petite base où sont glissées des erreurs : une alerte par contrôle (né après la mort du
 *     père, mariage après le décès, mère de 57 ans, 31 février, lieu en 0, 0, baptême loin, inhumation avant le décès, sexe
 *     et Sosa, vrai doublon), « Marie ↔ Martin » ne sort plus, pas de doublon de ligne (une ligne pour la mère de 57 ans),
 *     exceptions (raison, note, anciennes clés reconnues), l'alerte revient quand une date change, seuils (bornés, niveau
 *     qui change), widget (même nombre que la page et que « Travail à suivre »), bandeau de la fiche, « Fusion de doublons »
 *     sans la paire écartée, lieux écartés dans la même table, CSRF ;
 *  2. une base de 5 000 fiches : le contrôle complet en peu de temps, puis gardé (cache) ;
 *  3. le navigateur (Playwright ; sinon sauté) à 1440 px, 390 px et en sombre : la page (pastilles, chercher, ⤓ CSV),
 *     🙈 Exceptions, ▶ Une à une (clavier, date corrigée sur place), anciennes adresses filtrées, widget, bandeau replié,
 *     ⚙️ Seuils (K2) ; aucune erreur JavaScript, pas de défilement horizontal.
 * Captures : SHOTS=dossier node tests/test-controle-base.js
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
if (!phpPath) { console.log('— PHP absent : test sauté'); process.exit(0); }
const SHOTS = process.env.SHOTS || '';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-controle-'));
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const seed = (dir, php) => {
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
` + php + "\necho 'ok';"], { cwd: appRoot, encoding: 'utf8', env: envFor(dir), maxBuffer: 1 << 26 });
    if (r.status !== 0 || !String(r.stdout).includes('ok')) { console.error(r.stderr || r.stdout); process.exit(1); }
};

// ── la petite base : des erreurs glissées exprès (celles de la maquette, et une par contrôle nouveau) ──
const dirA = path.join(tmp, 'a');
seed(dirA, String.raw`
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,is_start) VALUES
 (1,'Jean','FAURE','male',0),(2,'Marie','LACHAUD','female',0),(3,'Marguerite','FAURE','female',0),
 (4,'Martin','MAZEL','male',0),(5,'Rose','LEROY','female',0),(6,'Louise','MAZEL','female',0),
 (7,'Françoise','DELMAS','female',0),(8,'Pierre','PEYRE','male',0),(9,'Pierre','PEYRE','male',0),
 (10,'Paul','BORIE','male',0),(11,'Henri','VIDAL','male',0),
 (12,'Luc','MARTIN','male',1),(13,'Anne','ROUX','female',0),(14,'Jeanne','ROUX','female',0),
 (15,'Marie','LEROY','female',0),(16,'Martin','LEROY','male',0),
 (17,'Jacques','DUPONT','male',0),(18,'Jacques','DUPONT','male',0),(19,'Louis','DUPONT','male',0),(20,'Lucie','BLANC','female',0)");
$pdo->exec("INSERT INTO places(id,name,county,country,latitude,longitude) VALUES(1,'Naves','Corrèze','France',45.31,1.77),(2,'Aurillac','Cantal','France',44.93,2.44),(3,'Arnac-la-Poste','Haute-Vienne','France',0,0),(4,'Tulle','Corrèze','France',45.27,1.77)");
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,1,2),(2,4,5),(3,8,7),(4,13,14),(5,19,20)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,3),(2,6),(3,9),(4,12),(5,17),(5,18)");
$ev = $pdo->prepare('INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?,?)');
foreach ([
 ['person',1,null,'BIRT','12 décembre 1830',1830,4], ['person',1,null,'DEAT','26 mai 1862',1862,4], ['person',2,null,'BIRT','23 octobre 1834',1834,4],
 ['person',3,null,'BIRT','15 mars 1864',1864,1], ['person',3,null,'RESI','31 février 1900',1900,null],
 ['person',4,null,'BIRT','15 novembre 1836',1836,4], ['person',4,null,'DEAT','20 août 1860',1860,4], ['family',null,2,'MARR','17 avril 1863',1863,4],
 ['person',6,null,'BIRT','5 février 1865',1865,1],
 ['person',7,null,'BIRT','7 janvier 1806',1806,4], ['person',8,null,'BIRT','2 mars 1830',1830,4], ['person',9,null,'BIRT','7 septembre 1863',1863,4],
 ['person',10,null,'BIRT','3 mai 1850',1850,1], ['person',10,null,'CHR','4 mai 1850',1850,2],
 ['person',11,null,'BIRT','1 janvier 1800',1800,3], ['person',11,null,'DEAT','10 mai 1850',1850,3], ['person',11,null,'BURI','5 mai 1850',1850,3],
 ['person',12,null,'BIRT','1 juin 1950',1950,4], ['person',13,null,'BIRT','1 juin 1925',1925,4], ['person',14,null,'BIRT','1 juin 1926',1926,4],
 ['person',17,null,'BIRT','4 avril 1880',1880,4], ['person',18,null,'BIRT','4 avril 1880',1880,4], ['person',19,null,'BIRT','1 janvier 1850',1850,4],
] as [$sc,$pid,$fid,$tag,$d,$y,$pl]) { $ev->execute([$sc,$pid,$fid,$t($tag),$d,$y,$pl]); }
// une exception gardée par l'ancien écran (clé d'avant, sans empreinte) : toujours valable
$pdo->exec("INSERT INTO dismissed_issues(issue_key,reason) VALUES('child-after-parent-death:4:6','Vérifié manuellement : faux positif')");
`);

// ── 5 000 fiches : 1 250 couples, 2 500 enfants, quelques erreurs ──
const dirB = path.join(tmp, 'b');
seed(dirB, String.raw`
$pdo->beginTransaction();
$ip = $pdo->prepare('INSERT INTO persons(first_name,last_name,gender) VALUES(?,?,?)');
$ie = $pdo->prepare('INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year,place_id) VALUES(?,?,?,?,?,?,?)');
$months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
$noms = ['MARTIN','BORIE','FAURE','MAZEL','PEYRE','ROUX','VIDAL','BLANC','DELMAS','LEROY','CHASTANG','BESSE','SOULIER','LACHAUD','NOEL'];
$pre = ['Jean','Pierre','Antoine','François','Joseph','Marie','Jeanne','Anne','Louise','Marguerite','Catherine','Léonard','Étienne','Rose','Françoise'];
$pdo->exec("INSERT INTO places(name,country,latitude,longitude) VALUES('Tulle','France',45.27,1.77),('Brive','France',45.16,1.53),('Naves','France',45.31,1.77)");
$bir = $t('BIRT'); $dea = $t('DEAT'); $mar = $t('MARR');
for ($f = 0; $f < 1250; $f++) {
    $y = 1700 + ($f % 200);
    $ip->execute([$pre[$f % 7], $noms[$f % 15] . ($f % 97), 'male']); $h = (int) $pdo->lastInsertId();
    $ip->execute([$pre[7 + $f % 8], $noms[($f + 3) % 15] . ($f % 89), 'female']); $w = (int) $pdo->lastInsertId();
    $ie->execute(['person', $h, null, $bir, (1 + $f % 28) . ' ' . $months[$f % 12] . ' ' . $y, $y, 1 + $f % 3]);
    $ie->execute(['person', $w, null, $bir, (2 + $f % 27) . ' ' . $months[($f + 4) % 12] . ' ' . ($y + 2), $y + 2, 1 + $f % 3]);
    $ie->execute(['person', $h, null, $dea, '3 ' . $months[$f % 12] . ' ' . ($y + 60), $y + 60, 1]);
    $pdo->exec("INSERT INTO families(partner1_id,partner2_id) VALUES($h,$w)"); $fid = (int) $pdo->lastInsertId();
    $ie->execute(['family', null, $fid, $mar, '10 juin ' . ($y + 25), $y + 25, 1]);
    for ($c = 0; $c < 2; $c++) {
        $ip->execute([$pre[($f + $c) % 15], $noms[$f % 15] . ($f % 97), $c ? 'female' : 'male']); $k = (int) $pdo->lastInsertId();
        $cy = $y + 27 + $c * 2 + ($f % 50 === 0 && $c ? 40 : 0); // une naissance sur 100 : bien après la mort du père
        $ie->execute(['person', $k, null, $bir, '5 ' . $months[($f + $c) % 12] . ' ' . $cy, $cy, 1 + $c]);
        $pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES($fid,$k)");
    }
}
$pdo->exec('UPDATE persons SET is_start=1 WHERE id=(SELECT max(id) FROM persons)');
$pdo->commit();
`);

let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

const startServer = async dir => {
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: envFor(dir), stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const get = async (action, q = {}) => { const r = await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, { headers: { Cookie: cookie } }); return r.json(); };
    const post = async (action, body, token = csrf) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ ...body, csrf: token }) }); const j = await r.json().catch(() => ({})); return { status: r.status, body: j, result: j.result }; };
    return { proc, base, get, post };
};

(async () => {
    const A = await startServer(dirA);
    const { get, post } = A;
    const keyOf = (d, prefix) => d.alerts.find(a => a.key.startsWith(prefix));
    try {
        await t('une alerte par contrôle (maquette + contrôles nouveaux), « Marie ↔ Martin » ne sort plus', async () => {
            const d = await get('controle');
            assert.ok(!d.error, d.error);
            const keys = d.alerts.map(a => a.key);
            const has = (k, what) => assert.ok(keys.some(x => x.startsWith(k)), `${what} (${k}) : ${keys.join(', ')}`);
            has('child-after-parent-death:1:3', 'née après la mort du père');
            has('marriage-after-death:4:', 'mariage après le décès');
            has('old-parent:7:9', 'mère de 57 ans');
            has('impossible-date:', '31 février');
            has('place:3', 'lieu en 0, 0');
            has('baptism-far:10', 'baptême loin du lieu de naissance');
            has('burial-before-death:11', 'inhumation avant le décès');
            has('sosa-sex:', 'sexe et Sosa (deux mères)');
            has('dup:17:18', 'vrai doublon (mêmes parents, même naissance)');
            assert.ok(!keys.includes('dup:15:16'), 'Marie ↔ Martin LEROY : sexes différents, pas un doublon');
            assert.ok(!keys.includes('dup:8:9'), 'le père et le fils homonymes ne sont pas un doublon');
            const fr = keyOf(d, 'child-after-parent-death:1:3');
            assert.equal(fr.level, 'red'); assert.equal(fr.sort, 'parents');
            assert.match(fr.title, /Née 21 mois après la mort de son père/);
            assert.deepEqual([...fr.people].sort(), [1, 3], 'l’enfant ET le parent');
            assert.ok(d.people[1] && d.people[3], 'fiches citées');
            const dup = keyOf(d, 'dup:17:18');
            assert.ok(dup.checks.some(c => c[0] === 'ok' && c[1] === 'mêmes parents'), JSON.stringify(dup.checks));
        });
        await t('pas de ligne en double : un problème trouvé par deux anciens contrôles = une ligne', async () => {
            const d = await get('controle');
            const mere = d.alerts.filter(a => a.people.includes(7) && a.people.includes(9));
            assert.equal(mere.length, 1, mere.map(a => a.key).join(', '));
            assert.equal(mere[0].level, 'red'); assert.match(mere[0].detail, /seuil : 55 ans/);
            const faure = d.alerts.filter(a => a.people.includes(3) && a.people.includes(1));
            assert.equal(faure.length, 1);
            assert.equal(new Set(d.alerts.map(a => a.key)).size, d.alerts.length, 'clés uniques');
        });
        await t('ancienne exception (clé d’avant) toujours valable ; widget sans les exceptions', async () => {
            const d = await get('controle');
            assert.ok(!d.alerts.some(a => a.key === 'child-after-parent-death:4:6'));
            assert.ok(d.exceptions.some(e => e.key === 'child-after-parent-death:4:6'));
            const s = await get('controle_summary');
            assert.equal(s.total, d.alerts.length);
            assert.equal(s.exceptions, 1);
            assert.equal(Object.values(s.by_sort).reduce((x, y) => x + y, 0), s.total);
            assert.ok(s.pct_ok >= 0 && s.pct_ok <= 100);
            const dash = await get('dashboard');
            assert.equal(dash.work.issues, s.total, '« Alertes cohérence » de Travail à suivre = le même nombre');
        });
        await t('« Ce n’est pas une erreur » (raison, note) puis l’alerte revient quand une date change ; « ↺ Signaler de nouveau »', async () => {
            const r = await post('controle_dismiss', { key: 'old-parent:7:9', reason: 'J’ai vérifié dans l’acte : c’est bien ça', note: 'acte n° 42', watch: 1 });
            assert.equal(r.status, 200, JSON.stringify(r.body));
            let d = await get('controle');
            assert.ok(!d.alerts.some(a => a.key === 'old-parent:7:9'));
            const e = d.exceptions.find(x => x.key === 'old-parent:7:9');
            assert.equal(e.reason, 'J’ai vérifié dans l’acte : c’est bien ça'); assert.equal(e.note, 'acte n° 42'); assert.equal(e.status, 'ok'); assert.equal(e.sort, 'ages');
            // la date de naissance de la mère change : l'alerte revient, l'exception est « Dates changées »
            const ev = (await get('person', { id: 7 })).events.find(x => x.date_text === '7 janvier 1806');
            const f = await post('controle_fix_date', { event_id: ev.id, date_text: '8 janvier 1806' });
            assert.equal(f.status, 200, JSON.stringify(f.body)); assert.equal(f.result.year, 1806);
            d = await get('controle');
            const back = d.alerts.find(a => a.key === 'old-parent:7:9');
            assert.ok(back && back.returned, 'l’alerte revient');
            assert.equal(d.exceptions.find(x => x.key === 'old-parent:7:9').status, 'changed');
            // sans « me le signaler à nouveau » : elle ne revient pas
            await post('controle_dismiss', { key: 'old-parent:7:9', reason: 'Remariage tardif', watch: 0 });
            await post('controle_fix_date', { event_id: ev.id, date_text: '7 janvier 1806' });
            d = await get('controle');
            assert.ok(!d.alerts.some(a => a.key === 'old-parent:7:9'));
            const u = await post('controle_undismiss', { key: 'old-parent:7:9' });
            assert.equal(u.result.before.reason, 'Remariage tardif', 'l’exception d’avant est rendue (pour ↶ Annuler)');
            d = await get('controle');
            assert.ok(d.alerts.some(a => a.key === 'old-parent:7:9') && !d.exceptions.some(x => x.key === 'old-parent:7:9'));
        });
        await t('clé forgée refusée, CSRF exigé', async () => {
            assert.notEqual((await post('controle_dismiss', { key: '<script>' })).status, 200);
            assert.notEqual((await post('controle_dismiss', { key: 'old-parent:7:9', reason: 'x' }, 'mauvais')).status, 200);
            assert.notEqual((await post('controle_fix_date', { event_id: 99999, date_text: '1 mai 1900' })).status, 200);
        });
        await t('seuils : un seul seuil réglable, borné ; le niveau de l’alerte suit', async () => {
            let s = await post('controle_seuils_save', { values: { mother_max: 58, father_max: 999 } });
            assert.equal(s.status, 200, JSON.stringify(s.body));
            assert.equal(s.result.values.mother_max, 58); assert.equal(s.result.values.father_max, 100, 'borné');
            let d = await get('controle');
            assert.equal(d.alerts.find(a => a.key === 'old-parent:7:9').level, 'orange', '57 ans < 58 : à vérifier');
            await post('controle_seuils_save', { values: { mother_warn: 60, mother_max: 60 } });
            d = await get('controle');
            assert.ok(!d.alerts.some(a => a.key === 'old-parent:7:9'), 'sous les deux seuils : plus d’alerte');
            s = await get('controle_seuils');
            const def = Object.fromEntries(Object.entries(s.bounds).map(([k, b]) => [k, b[0]]));
            await post('controle_seuils_save', { values: { ...def, banner: 'all' } });
            d = await get('controle');
            assert.equal(d.alerts.find(a => a.key === 'old-parent:7:9').level, 'red');
        });
        await t('bandeau de la fiche : les alertes de la fiche, écrites de son point de vue', async () => {
            const p = await get('controle_person', { id: 4 });
            assert.ok(p.alerts.length >= 1);
            assert.ok(p.alerts.some(a => /après sa mort/.test(a.view)), p.alerts.map(a => a.view).join(' | '));
            const jf = await get('controle_person', { id: 1 });
            assert.ok(jf.alerts.some(a => /Sa fille Marguerite naît .* après sa mort/.test(a.view)), jf.alerts.map(a => a.view).join(' | '));
            assert.equal((await get('controle_person', { id: 20 })).alerts.length, 0);
        });
        await t('doublons : « Ce sont deux personnes différentes » → la paire ne revient plus, même dans « Fusion de doublons »', async () => {
            assert.ok((await get('duplicate_candidates')).candidates.some(c => Number(c.id1) === 17 && Number(c.id2) === 18));
            await post('controle_dismiss', { key: 'dup:17:18', reason: 'Ce sont deux personnes différentes', watch: 1 });
            assert.ok(!(await get('duplicate_candidates')).candidates.some(c => Number(c.id1) === 17 && Number(c.id2) === 18));
            assert.ok(!(await get('controle')).alerts.some(a => a.key === 'dup:17:18'));
        });
        await t('lieux : « ne plus signaler » de l’ancien écran va dans la même table d’exceptions', async () => {
            const r = await post('fix_place', { id: 3, ignore: 1 });
            assert.equal(r.status, 200, JSON.stringify(r.body));
            const d = await get('controle');
            assert.ok(!d.alerts.some(a => a.key === 'place:3'));
            assert.equal(d.exceptions.find(e => e.key === 'place:3').reason, 'Le lieu est juste');
            await post('controle_undismiss', { key: 'place:3' });
        });
        await t('filtre par branche : Sosa et descendants', async () => {
            const s = await get('controle_scope', { scope: 'sosa' });
            assert.deepEqual([...s.ids].sort((a, b) => a - b), [12, 13, 14]);
            const dsc = await get('controle_scope', { scope: 'desc:1' });
            assert.deepEqual([...dsc.ids].sort((a, b) => a - b), [1, 3]);
            assert.deepEqual((await get('controle_scope', { scope: 'n’importe quoi' })).ids, []);
        });

        /* ─── 5 000 fiches ─── */
        const B = await startServer(dirB);
        try {
            await t('5 000 fiches : le contrôle complet en peu de temps, puis gardé', async () => {
                let t0 = Date.now();
                const d = await B.get('controle');
                const first = Date.now() - t0;
                assert.ok(!d.error, d.error);
                assert.ok(d.persons_total >= 5000, String(d.persons_total));
                assert.ok(d.alerts.some(a => a.check === 'after-father-death'), 'les naissances après la mort du père sont trouvées');
                assert.ok(first < 8000, `premier contrôle : ${first} ms`);
                t0 = Date.now(); await B.get('controle_summary'); const second = Date.now() - t0;
                assert.ok(second < 1500, `contrôle gardé : ${second} ms`);
                console.log(`   (5 000 fiches : ${first} ms la première fois, ${second} ms ensuite ; calcul ${d.ms} ms ; ${d.alerts.length} alertes)`);
            });
        } finally { B.proc.kill(); }

        /* ─── le navigateur ─── */
        let pw = null;
        for (const m of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(m); break; } catch (_) {} }
        if (!pw) { console.log('— navigateur : Playwright absent, partie sautée'); return; }
        const browser = await pw.chromium.launch();
        const errors = [];
        const watch = (p, name) => {
            p.on('pageerror', e => errors.push(`${name} : ${e.message}`));
            p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(`${name} : ${m.text()}`); });
            p.on('dialog', d => { errors.push(`${name} : dialogue natif ${d.message()}`); d.dismiss(); });
        };
        const shot = async (p, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name), fullPage: false }); };
        const boot = async p => { await p.goto(A.base); await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_EXT?.openControle && window.LCNDA_UI?.listBar, null, { timeout: 20000 }); };
        const open = async (p, f = {}) => { await p.evaluate(f2 => window.LCNDA_EXT.openControle(f2), f); await p.waitForSelector('.ctl-page [data-ctl-pills] button', { timeout: 15000 }); await p.waitForTimeout(300); };
        const noScroll = async p => { const sw = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(sw <= 0, `défilement horizontal : ${sw}`); };
        try {
            for (const [name, vp, dark] of [['1440', { width: 1440, height: 900 }, false], ['390', { width: 390, height: 844 }, false], ['sombre', { width: 1440, height: 900 }, true]]) {
                const ctx = await browser.newContext({ viewport: vp, colorScheme: dark ? 'dark' : 'light', acceptDownloads: true });
                const p = await ctx.newPage(); watch(p, name);
                await boot(p);
                if (dark) { await p.evaluate(() => { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({...A.readDesignSettings(), preset: 'dark'})); A.applyDesign(); }); assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'dark'); }
                await t(`${name} : la page « ✅ Contrôle de la base » (pastilles avec le nombre, chercher, filtre Parents)`, async () => {
                    await open(p);
                    const pills = await p.$$eval('[data-ctl-pills] button', b => b.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
                    assert.ok(pills[0].startsWith('Tout ('), pills.join(' | '));
                    assert.ok(pills.some(x => /Parents \(\d+\)/.test(x)) && pills.some(x => /Exceptions \(\d+\)/.test(x)), pills.join(' | '));
                    const n = await p.$$eval('.ctl-row', r => r.length);
                    assert.ok(n >= 7, `lignes : ${n}`);
                    assert.ok(await p.$('.ctl-row .pk-chip [data-open-person]'), 'pastilles « ↗ Fiche »');
                    await p.click('[data-ctl-sort="parents"]'); await p.waitForTimeout(200);
                    const titles = await p.$$eval('.ctl-row h3', h => h.map(x => x.textContent));
                    assert.ok(titles.length >= 1 && titles.every(x => /PARENTS/i.test(x)), titles.join(' | '));
                    await p.click('[data-ctl-sort="all"]');
                    await p.fill('.ctl-page .ui-listbar input', 'Marguerite'); await p.waitForTimeout(600);
                    const found = await p.$$eval('.ctl-row h3', h => h.map(x => x.textContent));
                    assert.ok(found.length >= 1 && found.length < n, found.join(' | '));
                    await p.fill('.ctl-page .ui-listbar input', ''); await p.waitForTimeout(600);
                    await noScroll(p);
                    await shot(p, `controle-page-${name}.png`);
                });
                if (name === '1440') {
                    await t('⤓ CSV : la liste filtrée, cellules protégées', async () => {
                        const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-ctl-csv]')]);
                        const txt = fs.readFileSync(await dl.path(), 'utf8');
                        assert.match(txt, /Gravité;Sorte;Contrôle;Détail;Fiches;Lieu;Écartée;Raison/);
                        assert.match(txt, /Marguerite FAURE \(n° 3\)/);
                    });
                    await t('« Ce n’est pas une erreur » : fenêtre de raison, puis 🙈 Exceptions et « ↺ Signaler de nouveau »', async () => {
                        const i = await p.$$eval('.ctl-row h3', h => h.findIndex(x => /Mère de 57 ans/.test(x.textContent)));
                        await p.click(`.ctl-row:nth-child(${i + 1}) [data-ctl-dismiss]`);
                        await p.waitForSelector('dialog.ctl-dismiss[open]');
                        const reasons = await p.$$eval('dialog.ctl-dismiss .ctl-reason', r => r.map(x => x.textContent.trim()));
                        assert.ok(reasons.includes('J’ai vérifié dans l’acte : c’est bien ça') && reasons.includes('Autre raison…'), reasons.join(' | '));
                        await shot(p, 'controle-pas-une-erreur.png');
                        await p.fill('dialog.ctl-dismiss input[name=note]', 'acte n° 42');
                        await p.click('dialog.ctl-dismiss button[type=submit]');
                        await p.waitForFunction(() => !document.querySelector('dialog.ctl-dismiss'));
                        await p.waitForTimeout(800);
                        assert.ok(!(await p.$$eval('.ctl-row h3', h => h.some(x => /Mère de 57 ans/.test(x.textContent)))));
                        await p.click('[data-ctl-sort="exceptions"]'); await p.waitForTimeout(300);
                        const ex = await p.$$eval('.ctl-row.is-exc', r => r.map(x => x.textContent));
                        assert.ok(ex.some(x => /Mère de 57 ans/.test(x) && /acte n° 42/.test(x)), ex.join(' | '));
                        await shot(p, 'controle-exceptions.png');
                        const j = await p.$$eval('.ctl-row.is-exc', r => r.findIndex(x => /Mère de 57 ans/.test(x.textContent)));
                        await p.click(`.ctl-row.is-exc:nth-child(${j + 1}) [data-ctl-again]`); await p.waitForTimeout(800);
                        await p.click('[data-ctl-sort="all"]'); await p.waitForTimeout(300);
                        assert.ok(await p.$$eval('.ctl-row h3', h => h.some(x => /Mère de 57 ans/.test(x.textContent))));
                    });
                    await t('▶ Une à une : en grand, frise, famille, clavier ; date corrigée sur place', async () => {
                        await p.click('[data-ctl-one]'); await p.waitForSelector('.ctl-one-card');
                        assert.match(await p.textContent('.ctl-progress'), /Alerte 1 sur \d+/);
                        assert.ok(await p.$('.ctl-one-card h2'));
                        await shot(p, 'controle-une-a-une.png');
                        await p.keyboard.press('ArrowRight'); await p.waitForTimeout(200);
                        assert.match(await p.textContent('.ctl-progress'), /Alerte 2 sur/);
                        await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(200);
                        assert.match(await p.textContent('.ctl-progress'), /Alerte 1 sur/);
                        await p.keyboard.press('l'); await p.waitForTimeout(200);
                        assert.match(await p.textContent('.ctl-progress'), /1 plus tard/);
                        // corriger la date du décès de Jean FAURE sur place : l'alerte de Marguerite est réglée
                        await p.evaluate(() => { window.LCNDA_APP.state.ctlOne = false; });
                        await open(p);
                        await p.fill('.ctl-page .ui-listbar input', 'Marguerite FAURE'); await p.waitForTimeout(600);
                        await p.click('[data-ctl-one]'); await p.waitForSelector('.ctl-one-card');
                        let inp = null;
                        for (let k = 0; k < 6 && !(inp = await p.$('[data-ctl-date][data-was="26 mai 1862"]')); k++) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(200); }
                        assert.ok(inp, 'la date du décès du père se corrige ici');
                        await inp.fill('26 mai 1882'); await inp.press('Enter');
                        await p.waitForTimeout(1500);
                        const d = await get('controle');
                        assert.ok(!d.alerts.some(a => a.key === 'child-after-parent-death:1:3'), 'alerte réglée');
                        await p.keyboard.press('Escape'); await p.waitForTimeout(300);
                        await p.fill('.ctl-page .ui-listbar input', ''); await p.waitForTimeout(500);
                    });
                    await t('anciennes adresses : #maintenance/ages, /misplaced, /journeys, /issues → la page filtrée', async () => {
                        await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'ages'; A.setModule('maintenance'); });
                        await p.waitForSelector('[data-ctl-sort="ages"].is-active', { timeout: 8000 });
                        await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'misplaced'; A.renderMaintenance(); });
                        await p.waitForSelector('[data-ctl-sort="lieux"].is-active', { timeout: 8000 });
                        assert.ok(await p.$('[data-ctl-sub="misplaced"].is-active'));
                        await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'issues'; A.renderMaintenance(); });
                        await p.waitForSelector('[data-ctl-sort="all"].is-active', { timeout: 8000 });
                        const menu = await p.$$eval('#sidebar-content [data-side-value]', b => b.map(x => x.dataset.sideValue));
                        assert.ok(menu.includes('controle') && menu.includes('controle_seuils') && !menu.includes('ages') && !menu.includes('issues'), menu.join(','));
                    });
                    await t('⚙️ Seuils du contrôle : curseurs C3, gardé tout de suite (K2), « ↶ Annuler »', async () => {
                        await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'controle_seuils'; A.setModule('maintenance'); });
                        await p.waitForSelector('[data-ctl-seuil="mother_max"]');
                        await p.$eval('[data-ctl-seuil="mother_max"]', el => { el.value = '58'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
                        await p.waitForTimeout(900);
                        assert.equal((await get('controle_seuils')).values.mother_max, 58);
                        assert.ok(await p.$$eval('.toast, [class*="toast"]', x => x.some(e => /Âge de la mère 🔴 : 55 → 58/.test(e.textContent))), 'message H7');
                        await shot(p, 'controle-seuils.png');
                        await p.click('[data-ctl-reset]'); await p.waitForTimeout(900);
                        assert.equal((await get('controle_seuils')).values.mother_max, 55);
                    });
                }
                await t(`${name} : widget « ✅ Contrôle de la base » (les anciens passent au nouveau)`, async () => {
                    await p.evaluate(() => { localStorage.setItem('genealogie-dashboard-blocks', JSON.stringify({ widgets: [{ id: 'w1', type: 'consistency_issues', width: '6' }, { id: 'w2', type: 'journeys_widget', width: '6' }] })); window.LCNDA_APP.setModule('dashboard'); });
                    await p.waitForSelector('.ctl-widget', { timeout: 15000 });
                    assert.equal(await p.$$eval('.ctl-widget', w => w.length), 2);
                    const txt = await p.textContent('.ctl-widget');
                    assert.match(txt, /\d+ %des fiches sans alerte|\d+ % *des fiches sans alerte/);
                    await noScroll(p);
                    await shot(p, `controle-widget-${name}.png`);
                    await p.click('.ctl-widget [data-ctl-w-level="red"]');
                    await p.waitForSelector('[data-ctl-level="red"].is-active', { timeout: 10000 });
                });
                await t(`${name} : bandeau « ⚠️ N choses à vérifier » sur la fiche, replié par défaut`, async () => {
                    await p.evaluate(() => window.LCNDA_APP.openPersonById(4));
                    await p.waitForSelector('[data-ctl-banner]', { timeout: 15000 });
                    assert.ok(await p.$eval('.ctl-banner-body', b => b.hidden), 'replié');
                    assert.match(await p.textContent('.ctl-banner-head'), /chose(s)? à vérifier/);
                    await p.click('[data-ctl-b-toggle]');
                    assert.ok(!(await p.$eval('.ctl-banner-body', b => b.hidden)));
                    assert.match(await p.textContent('.ctl-banner-body'), /après sa mort/);
                    await noScroll(p);
                    await shot(p, `controle-bandeau-${name}.png`);
                });
                await ctx.close();
            }
            await t('aucune erreur JavaScript', async () => { assert.deepEqual(errors, []); });
        } finally { await browser.close(); }
    } finally {
        A.proc.kill();
        fs.rmSync(tmp, { recursive: true, force: true });
        if (failed) { console.error(`\n${failed} échec(s)`); process.exit(1); }
        console.log('\nTout est bon.');
    }
})();
