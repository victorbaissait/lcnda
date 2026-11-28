#!/usr/bin/env node
/* 🌒 La Lune et les éclipses (assets/js/app-lune-core.js, assets/js/heritage-lune.js, lib/lune.php).
 *  1. le moteur (Node) contre les exemples de Meeus et des faits connus : Lune 1992-04-12 (ex. 47.a), Soleil 1992-10-13 (ex. 25.a),
 *     éclipse 1993-05-21 (ex. 54.a), pleine lune du 21 janvier 2000, nouvelle lune du 1er janvier 1900, la Lune du 20 juillet 1969,
 *     éclipse totale du 11 août 1999 (totale à Reims vers 12 h 30, ~99 % à Paris), 22 mai 1724 (totale dans le nord-ouest de la France),
 *     17 avril 1912 (presque totale à Paris), éclipse totale de Lune du 27 juillet 2018 vue de France, lever et coucher du soleil ;
 *  2. écran (Playwright, base temporaire) : MAZAUD né à Reims le 11 août 1999 → le bloc de la fiche montre l'éclipse ;
 *     Listes → Histoire → « 🌒 Éclipses vues par la famille » la montre ; aucune erreur JS.
 *   node tests/test-lune.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn, spawnSync} = require('child_process');
const root = path.join(__dirname, '..');
const L = require('../assets/js/app-lune-core.js');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what} : ${a} au lieu de ${b} (±${tol})`);
const minutes = (j, y, m, d, h, mi) => (j - L.jd(y, m, d, h + mi / 60)) * 1440;
const REIMS = [49.258, 4.031], PARIS = [48.857, 2.352];

(async () => {
    await t('moteur : exemples de Meeus (47.a Lune, 25.a Soleil, 54.a éclipse)', () => {
        const m = L.moon(2448724.5); // 1992-04-12 0 h TD : λ 133.162655 + Δψ 0.004610, β −3.229126, Δ 368409.7 km, α 134.688470, δ 13.768368
        near(m.lon, 133.167265, 0.0003, 'λ Lune'); near(m.lat, -3.229126, 0.0001, 'β Lune'); near(m.dist, 368409.7, 0.5, 'Δ Lune');
        near(m.ra, 134.688470, 0.0003, 'α Lune'); near(m.dec, 13.768368, 0.0003, 'δ Lune');
        const s = L.sun(2448908.5); // 1992-10-13 0 h TD : λ apparent 199.90737 (VSOP87), α 198.37817, δ −7.78544 (à 0,01° près avec le ch. 25)
        near(s.lon, 199.90737, 0.01, 'λ Soleil'); near(s.ra, 198.378, 0.01, 'α Soleil'); near(s.dec, -7.785, 0.01, 'δ Soleil');
        const e = L.eclipseAt(-82, true); // 1993-05-21 : JDE 2449129.0979, γ 1.1348, u 0.0097, partielle de grandeur 0,740
        near(e.jde, 2449129.0979, 0.0002, 'JDE'); near(e.gamma, 1.1348, 0.0002, 'γ'); near(e.mag, 0.740, 0.001, 'grandeur'); assert.strictEqual(e.type, 'partial');
        near(L.deltaT(1999.6), 64, 1, 'ΔT 1999'); near(L.deltaT(1724.4), 11, 2, 'ΔT 1724'); near(L.deltaT(1912.3), 13.5, 1.5, 'ΔT 1912');
    });
    await t('moteur : phases à quelques minutes des valeurs publiées', () => {
        near(minutes(L.nextPhase(L.jd(2000, 1, 15), 180), 2000, 1, 21, 4, 40), 0, 5, 'pleine lune 2000-01-21 04:40 UT');
        near(minutes(L.nextPhase(L.jd(1899, 12, 28), 0), 1900, 1, 1, 13, 52), 0, 10, 'nouvelle lune 1900-01-01 13:52 UT');
        near(minutes(L.nextPhase(L.jd(1999, 8, 1), 0), 1999, 8, 11, 11, 8), 0, 5, 'nouvelle lune 1999-08-11 11:08 UT');
        near(minutes(L.prevPhase(L.jd(2018, 7, 30), 180), 2018, 7, 27, 20, 20), 0, 5, 'pleine lune 2018-07-27 20:20 UT');
        const a = L.phase(L.jd(1969, 7, 20, 20.3)); // premiers pas sur la Lune : nouvelle lune le 14 juillet à 14 h 11 UT
        assert.strictEqual(a.key, 'wax1'); assert.strictEqual(a.name, 'premier croissant'); near(a.age, 6.25, 0.05, 'âge'); near(a.illumination, 33, 3, 'éclairée');
        assert.strictEqual(L.phase(L.jd(2000, 1, 21, 6)).key, 'full'); assert.strictEqual(L.phase(L.jd(2000, 1, 21, 6)).name, 'pleine lune');
        assert.strictEqual(L.phase(L.jd(2000, 1, 23, 6)).key, 'wan2'); assert.strictEqual(L.phase(L.jd(1999, 8, 11, 12)).key, 'new');
    });
    await t('moteur : liste des éclipses (dates, type), 21e siècle', () => {
        const s = L.solarEclipses(2001, 2100), l = L.lunarEclipses(2001, 2100);
        near(s.length, 224, 2, 'éclipses de Soleil 2001-2100 (NASA : 224)'); near(l.length, 228, 3, 'éclipses de Lune 2001-2100 (NASA : 228)');
        const e99 = L.solarEclipses(1999).find(e => e.id === 's1999-08-11'); assert.strictEqual(e99.type, 'total'); near(e99.gamma, 0.506, 0.003, 'γ 1999');
        near(minutes(e99.jd, 1999, 8, 11, 11, 3), 0, 3, 'maximum 1999 11:03 UT');
        assert.strictEqual(L.solarEclipses(1912).find(e => e.id === 's1912-04-17').type, 'hybrid');
        assert.strictEqual(L.solarEclipses(1724).find(e => e.id === 's1724-05-22').type, 'total');
        const l18 = L.lunarEclipses(2018).find(e => e.id === 'l2018-07-27'); assert.strictEqual(l18.type, 'total'); near(l18.magUmb, 1.609, 0.01, 'grandeur 2018');
        near(minutes(l18.jd, 2018, 7, 27, 20, 22), 0, 3, 'maximum 2018 20:22 UT'); near((l18.contacts.u3 - l18.contacts.u2) * 1440, 103, 2, 'totalité 1 h 43');
        assert.strictEqual(L.lunarEclipses(2000).find(e => e.id === 'l2000-01-21').type, 'total');
    });
    await t('moteur : 11 août 1999 — totale à Reims vers 12 h 30, ~99 % à Paris, 87 % à Tulle', () => {
        const e = L.solarEclipses(1999).find(x => x.id === 's1999-08-11');
        const r = L.solarAt(e, ...REIMS); assert.strictEqual(r.type, 'total');
        const c = L.localClock(r.jd, ...REIMS); assert.ok(c.hour === 12 && c.min >= 20 && c.min <= 35, c.text); assert.ok(c.legal);
        near(r.duration, 120, 25, 'durée de la totalité à Reims (s)');
        const p = L.solarAt(e, ...PARIS); assert.strictEqual(p.type, 'partial'); near(p.obscuration, 99, 1, '% caché à Paris'); assert.ok(p.mag > 0.98 && p.mag < 1);
        near(minutes(p.c1, 1999, 8, 11, 9, 4), 0, 3, 'premier contact à Paris 9:04 UT');
        const tu = L.solarAt(e, 45.267, 1.770); near(tu.obscuration, 87, 3, '% caché à Tulle');
        assert.strictEqual(L.solarAt(e, -33.87, 151.2), null, 'rien à Sydney');
    });
    await t('moteur : 22 mai 1724 totale dans le nord-ouest de la France ; 17 avril 1912 presque totale à Paris', () => {
        const e = L.solarEclipses(1724).find(x => x.id === 's1724-05-22');
        const seen = [[49.18, -0.37], [48.80, 2.13], [48.43, 0.09]].map(p => L.solarAt(e, ...p)); // Caen, Versailles, Alençon
        assert.ok(seen.some(r => r && r.type === 'total'), 'totale quelque part'); seen.forEach(r => assert.ok(r.mag > 0.97 && r.sunAlt > 0));
        const c = L.localClock(seen[1].jd, 48.80, 2.13); assert.ok(c.hour === 18 && !c.legal, c.text); // en fin d'après-midi, heure solaire
        assert.ok(L.solarAt(e, 43.6, 1.44).type === 'partial', 'partielle à Toulouse');
        const f = L.solarEclipses(1912).find(x => x.id === 's1912-04-17'), pa = L.solarAt(f, ...PARIS);
        assert.ok(pa.mag > 0.99, 'grandeur ' + pa.mag); near(pa.obscuration, 99, 1.5, '% caché à Paris'); assert.strictEqual(L.localClock(pa.jd, ...PARIS).hour, 12);
    });
    await t('moteur : éclipse totale de Lune du 27 juillet 2018 vue de France (au lever de la Lune)', () => {
        const e = L.lunarEclipses(2018).find(x => x.id === 'l2018-07-27');
        const r = L.lunarAt(e, ...PARIS); assert.strictEqual(r.type, 'total');
        const a = L.localClock(r.total.from, ...PARIS), b = L.localClock(r.total.to, ...PARIS);
        assert.ok(a.hour === 21 && a.min >= 15, 'la Lune se lève déjà éclipsée : ' + a.text); assert.ok(b.hour === 23 && b.min >= 10 && b.min <= 16, b.text);
        assert.strictEqual(L.lunarAt(e, 45, -100), null, 'pas vue d’Amérique du Nord');
        assert.strictEqual(L.lunarAt(L.lunarEclipses(2000).find(x => x.id === 'l2000-01-21'), ...PARIS).type, 'total');
    });
    await t('moteur : lever et coucher, heure légale, dates écrites', () => {
        const s = L.riseSet('sun', 1999, 8, 11, ...PARIS, 2);
        assert.strictEqual(L.localClock(s.rise, ...PARIS).text, '6 h 37'); assert.ok(/^21 h 1[2-6]$/.test(L.localClock(s.set, ...PARIS).text));
        const w = L.riseSet('sun', 2020, 12, 21, ...PARIS, 1); near(minutes(w.rise, 2020, 12, 21, 7, 42), 0, 3, 'lever du 21 décembre 2020 à Paris (8 h 42)');
        const m = L.riseSet('moon', 2018, 7, 27, ...PARIS, 2); near(minutes(m.rise, 2018, 7, 27, 19, 29), 0, 5, 'lever de la Lune 21 h 29');
        assert.strictEqual(L.legalOffset(L.jd(1999, 8, 11), ...PARIS).h, 2); assert.strictEqual(L.legalOffset(L.jd(1999, 1, 11), ...PARIS).h, 1);
        assert.strictEqual(L.legalOffset(L.jd(1960, 8, 11), ...PARIS).h, 1); near(L.legalOffset(L.jd(1900, 8, 11), ...PARIS).h, 0.156, 0.001, 'heure de Paris');
        near(L.legalOffset(L.jd(1850, 8, 11), 45.267, 1.77).h, 0.118, 0.001, 'heure solaire de Tulle'); assert.strictEqual(L.legalOffset(L.jd(1999, 8, 11), 40.7, -74, 'États-Unis').legal, false);
        assert.deepStrictEqual(L.dayOf('11 août 1999'), {y: 1999, m: 8, d: 11}); assert.deepStrictEqual(L.dayOf('1er MAI 1724'), {y: 1724, m: 5, d: 1});
        assert.deepStrictEqual(L.dayOf('22 MAY 1724'), {y: 1724, m: 5, d: 22}); assert.deepStrictEqual(L.dayOf('17/04/1912'), {y: 1912, m: 4, d: 17});
        assert.strictEqual(L.dayOf('vers 1850'), null); assert.strictEqual(L.dayOf('ABT 12 JUN 1850'), null); assert.strictEqual(L.dayOf('1850'), null);
        assert.deepStrictEqual(L.dayOf('', '1999-08-11'), {y: 1999, m: 8, d: 11});
        const t0 = Date.now(); L.solarEclipses(1500, 2100); L.lunarEclipses(1500, 2100); assert.ok(Date.now() - t0 < 500, 'rapide');
    });
    if (process.argv.includes('--node')) { console.log(fails ? `${fails} échec(s)` : 'tout est bon'); process.exit(fails ? 1 : 0); }

    /* ─────────── l'écran ─────────── */
    let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
    const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-lune-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$tag = function ($t) use ($pdo) { $s = $pdo->prepare('SELECT id FROM event_types WHERE gedcom_tag=? ORDER BY id LIMIT 1'); $s->execute([$t]); return (int) $s->fetchColumn(); };
$pl = function ($name, $county, $lat, $lon) use ($pdo) { $pdo->prepare('INSERT INTO places(name, county, country, latitude, longitude) VALUES(?,?,?,?,?)')->execute([$name, $county, 'France', $lat, $lon]); return (int) $pdo->lastInsertId(); };
$reims = $pl('Reims', 'Marne', 49.258, 4.031); $tulle = $pl('Tulle', 'Corrèze', 45.267, 1.770);
$per = function ($f, $l, $g, $st, $evs) use ($pdo, $tag) { $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES(?,?,?,?)")->execute([$f, $l, $g, $st]); $id = (int) $pdo->lastInsertId();
    foreach ($evs as [$t, $txt, $iso, $p]) { $pdo->prepare('INSERT INTO events(scope, person_id, event_type_id, year, date_text, sort_date, place_id) VALUES(\'person\',?,?,?,?,?,?)')->execute([$id, $tag($t), (int) substr($iso, 0, 4), $txt, $iso, $p]); } return $id; };
$ids = [
  'paul' => $per('Paul', 'MAZAUD', 'male', 'living', [['BIRT', '11 août 1999', '1999-08-11', $reims]]),
  'marie' => $per('Marie', 'LACOMBE', 'female', 'deceased', [['BIRT', '3 mars 1990', '1990-03-03', $tulle], ['DEAT', '2 février 2005', '2005-02-02', $tulle]]),
];
echo json_encode($ids);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/paul/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const ID = JSON.parse(seed.stdout.trim().split('\n').pop());
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const p = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(base); await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_EXT?.world, null, {timeout: 30000});
        // tant que index.php ne charge pas encore les deux fichiers, l'essai les ajoute lui-même
        if (!(await p.evaluate(() => !!window.LCNDA_EXT?.lune))) { await p.addScriptTag({url: 'assets/js/app-lune-core.js'}); await p.addScriptTag({url: 'assets/js/heritage-lune.js'}); }
        await p.waitForFunction(() => window.LCNDA_EXT?.lune && window.LCNDA_LUNE, null, {timeout: 10000});
        await t('serveur : GET lune_family — les lieux datés de chacun', async () => {
            const d = await p.evaluate(() => window.LCNDA_APP.api('lune_family', {}));
            const paul = d.people.find(x => x.id === ID.paul); assert.ok(paul && paul.living && paul.name === 'Paul MAZAUD');
            assert.deepStrictEqual(paul.events[0].slice(0, 6), ['11 août 1999', '1999-08-11', 1999, 49.258, 4.031, 'Reims']);
        });
        await t('fiche : le bloc « 🌒 La Lune et le ciel » montre l’éclipse totale à Reims', async () => {
            await p.evaluate(id => { const A = window.LCNDA_APP; A.state.currentPersonId = id; A.setModule('personnes'); }, ID.paul);
            await p.waitForFunction(() => /Éclipse totale de soleil visible à Reims ce jour-là/.test(document.querySelector('[data-lune-host]')?.textContent || ''), null, {timeout: 20000});
            const txt = await p.textContent('[data-lune-host]');
            assert.match(txt, /nuit en plein jour à 12 h 2\d pendant 1 min \d\d s/); assert.match(txt, /Nuit de nouvelle lune/); assert.match(txt, /lever du soleil 6 h 2\d/);
            await p.click('[data-lune-rare]'); await sleep(300);
            assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('genealogie-lune-prefs')).rare), true, 'le choix est gardé');
            assert.match(await p.textContent('[data-lune-host]'), /Éclipse totale de soleil/, 'une éclipse sort de l’ordinaire');
            await p.click('[data-lune-rare]'); await sleep(200);
        });
        await t('Listes → Histoire → « 🌒 Éclipses vues par la famille »', async () => {
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'lune_eclipses'; A.setModule('listes'); });
            await p.waitForSelector('[data-lune-ecl="s1999-08-11"]', {timeout: 60000});
            const c = await p.textContent('[data-lune-ecl="s1999-08-11"]');
            assert.match(c, /Éclipse totale de soleil — 11 août 1999/); assert.match(c, /Paul MAZAUD.*à Reims.*nuit en plein jour à 12 h 2\d/s); assert.match(c, /Marie LACOMBE.*à Tulle.*\d\d % du soleil caché/s);
            assert.ok(!(await p.$('[data-lune-ecl="l2018-07-27"]')) || /Paul MAZAUD/.test(await p.textContent('[data-lune-ecl="l2018-07-27"]')));
            assert.ok(!/Marie LACOMBE/.test(await p.textContent('[data-lune-ecl="l2018-07-27"]')), 'Marie était morte en 2018');
            assert.ok(await p.evaluate(() => /Éclipses vues par la famille/.test(document.querySelector('#workspace h1, #workspace h2')?.textContent || '')));
            await p.click('[data-lune-ecl="s1999-08-11"] [data-lune-open]');
            await p.waitForSelector('[data-lune-host]', {timeout: 20000});
        });
        assert.deepStrictEqual(errs, [], 'erreurs JS : ' + errs.join(' | '));
    } catch (e) { fails++; console.log('✗ ' + (e.stack || e)); } finally { await browser.close(); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} échec(s)` : 'tout est bon'); process.exit(fails ? 1 : 0);
})();
