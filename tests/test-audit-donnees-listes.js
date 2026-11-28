#!/usr/bin/env node
/* 🔍 Audit du 2026-11-26 : moteur et écrans des listes de données, 📊 Données en plus, partage sur le site familial.
 * Un essai par vrai problème trouvé (et corrigé) :
 *  1. 🔗 partage (lib/donnees_plus.php dplus_share) : une ligne qui nomme une personne vivante ou confidentielle est retirée même écrite
 *     autrement (« FONTAINE (de la), Hélène-Marie », sans accents, capitales, trait d'union, 1er prénom seul) ; le titre, les filtres,
 *     les colonnes et les sources ne la nomment pas non plus ; un lien de source autre que http(s) est retiré ;
 *  2. famille.php (dplus_guest_lists) : une ligne glissée directement dans la table est filtrée à la lecture ; un compte limité à une
 *     branche ne lit jamais le nom d'une personne hors de sa branche ; 5 000 personnes cachées × 2 000 lignes : rapide ;
 *  3. mode consultation : ld_famille ne donne pas les vivants probables (sans « vivant » coché, né il y a 30 ans) ; 🕳 dplus_missing ne
 *     compte pas les lieux des vivants ;
 *     🧭 ha_life (lib/histoire_autour.php) : la vie d'une personne vivante ou confidentielle refusée (un invité du réseau pouvait la lire par son numéro) ;
 *  4. app-paniers-core.js parseData : un mot de thème plein de signes (« c++ », « (x ») ne casse plus la question ;
 *  5. liens : app-inserer.js, app-listes-donnees.js (source d'une liste), heritage-histoire-autour.js (À propos) : http(s) seulement ;
 *  6. (vérifié, rien à corriger) dans l'app : une liste dont les valeurs, le nom, la source sont piégés (<img onerror>, javascript:), une note,
 *     une ligne ajoutée, une ligne douteuse et une question piégées : rien ne s'exécute, aucun lien autre que http(s) ; une liste de
 *     5 000 lignes s'ouvre sans geler la page plus de 200 ms d'affilée (hors chargement) ;
 *     → c'était la colonne de gauche de Listes : orderedListTypes() (O(n²) dans savedOrder) refait pour CHAQUE carte, et chaque
 *       listShown relisait le menu et l'index des thèmes : 11 s de gel à chaque dessin (app.js savedOrder / orderedListTypes,
 *       app-listes.js listLabels, app-listes-themes.js index, app-donnees-accueil.js inListes) ;
 *  7. 🎞 diaporama (app-donnees-plus-outils.js) : refusé pour une personne vivante, comme le livret (il part dans 🎤 Présentation, PDF, vidéo).
 *     node tests/test-audit-donnees-listes.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');
const root = path.join(__dirname, '..');
let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 8).join('\n  ')); } };
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');
const php = findPhp([devBundledPhp()]) || 'php';

/** une base neuve dans un dossier à part, puis le code PHP donné ; renvoie le JSON qu'il écrit en dernier */
function runPhp(code, {kiosk = false} = {}) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-adl-'));
    try {
        const r = spawnSync(php, [...phpRuntimeArgs(php), '-r', String.raw`
error_reporting(E_ALL);
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$B = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT'")->fetchColumn();
$pdo->exec("INSERT INTO places(id,name,country,latitude,longitude) VALUES(1,'Treignac','France',45.53,1.79),(2,'Bourg-Perdu','France',NULL,NULL)");
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES
    (1,'Jean','MAZAUD','male','deceased',1),(2,'Hélène Marie','DE LA FONTAINE','female','living',0),(3,'Paul','SECRET','male','deceased',0),
    (4,'Lucas','RECENT','male','unknown',0),(5,'Louis','AUTREBRANCHE','male','deceased',0)");
$pdo->exec("UPDATE persons SET is_private=1 WHERE id=3");
$ev = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES('person',?,?,?,?,?)");
foreach ([[1,'1850',1850,1],[4,'1996',1996,1],[5,'1860',1860,1],[2,'1990',1990,2]] as $e) { $ev->execute([$e[0], $B, $e[1], $e[2], $e[3]]); }
if (getenv('ADL_KIOSK') === '1') { file_put_contents(kiosk_path(), json_encode(['hash' => password_hash('xxxx', PASSWORD_DEFAULT), 'since' => date('c')])); }
require_once 'lib/donnees_plus.php'; require_once 'lib/comptes_famille.php'; dplus_schema($pdo);
` + code], {cwd: root, encoding: 'utf8', env: {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', GENEALOGY_TEST: '1', ADL_KIOSK: kiosk ? '1' : '0'}});
        const line = String(r.stdout || '').trim().split('\n').filter(l => l.startsWith('{')).pop();
        assert.ok(line, `PHP sans réponse : ${r.stdout}\n${r.stderr}`);
        return JSON.parse(line);
    } finally { fs.rmSync(tmp, {recursive: true, force: true}); }
}

(async () => {
    await t('🔗 partage : une personne vivante ou confidentielle n’est jamais nommée, même écrite autrement, ni dans le titre, les colonnes, les filtres ou les sources', async () => {
        const r = runPhp(String.raw`
$r = dplus_share($pdo, ['name' => 'Les séismes vus par Hélène de la Fontaine', 'audience' => 'membres', 'cols' => ['Quoi', 'Qui', 'Hélène DE LA FONTAINE'],
    'rows' => [['Séisme de 1909', 'Jean MAZAUD, 59 ans'], ['Crue', 'FONTAINE (de la), Hélène-Marie'], ['Gel', 'helene de la fontaine'], ['Grêle', 'Paul Secret +2'],
               ['Orage', 'personne'], ['Neige', ['tableau' => 'Hélène DE LA FONTAINE']]],
    'filters' => 'Qui : Paul SECRET', 'sources' => [['source' => 'NOAA', 'licence' => 'CC0', 'url' => 'javascript:alert(1)'], ['source' => 'Carnet de Hélène De La Fontaine', 'url' => 'https://example.org/x']]]);
echo json_encode(['r' => $r, 'body' => json_decode((string) $pdo->query('SELECT body FROM dplus_shares')->fetchColumn(), true), 'name' => $pdo->query('SELECT name FROM dplus_shares')->fetchColumn()], JSON_UNESCAPED_UNICODE), "\n";`);
        assert.strictEqual(r.r.dropped, 3, JSON.stringify(r));
        const all = JSON.stringify(r.body) + r.name;
        assert.ok(!/fontaine|secret/i.test(all), 'un nom caché reste : ' + all);
        assert.deepStrictEqual(r.body.rows.map(x => x[0]), ['Séisme de 1909', 'Orage', 'Neige']);
        assert.ok(r.body.sources.every(s => s.url === '' || /^https?:\/\//.test(s.url)), JSON.stringify(r.body.sources));
        assert.strictEqual(r.body.sources.length, 1, 'la source qui nomme la personne cachée est retirée');
    });

    await t('famille.php : une ligne glissée dans la table est filtrée à la lecture ; un compte d’une branche ne lit pas les noms hors de sa branche', async () => {
        const r = runPhp(String.raw`
fc_schema($pdo);
$pdo->prepare('INSERT INTO dplus_shares(name, audience, body) VALUES(?,?,?)')->execute(['Lucas RECENT', 'membres', json_encode(['kind' => 'liste', 'name' => 'Lucas RECENT', 'cols' => ['Qui'], 'filters' => 'pour Lucas Recent',
    'rows' => [['Lucas RECENT, né en 1996'], ['Louis AUTREBRANCHE, 1870'], ['Jean MAZAUD, 1870'], ['rien']], 'sources' => [['source' => 's', 'url' => 'javascript:x']]])]);
$all = dplus_guest_lists($pdo, ['role' => 'lire', 'scope_kind' => 'tout', 'scope_person' => 0]);
$branch = dplus_guest_lists($pdo, ['role' => 'lire', 'scope_kind' => 'ascendants', 'scope_person' => 1]);
echo json_encode(['all' => $all, 'branch' => $branch], JSON_UNESCAPED_UNICODE), "\n";`);
        const a = r.all.lists[0], b = r.branch.lists[0];
        assert.ok(!/recent/i.test(JSON.stringify(a)), 'le vivant probable (né en 1996) est nommé : ' + JSON.stringify(a));
        assert.deepStrictEqual(a.rows.map(x => x[0]), ['Louis AUTREBRANCHE, 1870', 'Jean MAZAUD, 1870', 'rien']);
        assert.strictEqual(a.sources[0].url, '', 'lien javascript: retiré à la lecture');
        assert.deepStrictEqual(b.rows.map(x => x[0]), ['Jean MAZAUD, 1870', 'rien'], 'hors de sa branche : ' + JSON.stringify(b.rows));
    });

    await t('famille.php : 5 000 personnes cachées et 2 000 lignes partagées se lisent vite (pas de O(lignes × noms))', async () => {
        const r = runPhp(String.raw`
$pdo->beginTransaction();
$ins = $pdo->prepare("INSERT INTO persons(first_name,last_name,gender,living_status) VALUES(?,?,'male','living')");
for ($i = 0; $i < 5000; $i++) { $ins->execute(['Prenom' . $i, 'NOM' . $i]); }
$pdo->commit();
$rows = [['Prenom4999 NOM4999 était là', 'x']]; for ($i = 0; $i < 2000; $i++) { $rows[] = ['Ligne ' . $i . ' à Treignac, un texte assez long pour compter', 'Jean MAZAUD, ' . (20 + $i % 50) . ' ans']; }
$t0 = microtime(true); $s = dplus_share($pdo, ['name' => 'Grand', 'cols' => ['A', 'B'], 'rows' => $rows]); $t1 = microtime(true);
$g = dplus_guest_lists($pdo, ['role' => 'lire', 'scope_kind' => 'tout', 'scope_person' => 0]); $t2 = microtime(true);
echo json_encode(['dropped' => $s['dropped'], 'rows' => count($g['lists'][0]['rows']), 'share' => $t1 - $t0, 'read' => $t2 - $t1]), "\n";`);
        assert.strictEqual(r.dropped, 1); assert.strictEqual(r.rows, 1999); // 2 000 lignes au plus, dont celle qui nomme une personne vivante
        assert.ok(r.share < 3 && r.read < 3, `trop lent : partage ${r.share.toFixed(2)} s, lecture ${r.read.toFixed(2)} s`);
    });

    await t('mode consultation : « Dans la famille » (ld_famille) sans les vivants probables ; 🕳 lieux sans coordonnées sans ceux des vivants', async () => {
        const off = runPhp(String.raw`require_once 'lib/listes_famille.php'; echo json_encode(['f' => ld_famille($pdo), 'm' => dplus_missing($pdo)], JSON_UNESCAPED_UNICODE), "\n";`);
        assert.ok(off.f.people.some(p => /RECENT/.test(p[0])), 'hors consultation : sur ton ordinateur, la personne est là');
        assert.ok(off.m.places.some(p => p.name === 'Bourg-Perdu'), 'hors consultation : le lieu de la personne vivante est à placer');
        const on = runPhp(String.raw`require_once 'lib/listes_famille.php'; echo json_encode(['f' => ld_famille($pdo), 'm' => dplus_missing($pdo)], JSON_UNESCAPED_UNICODE), "\n";`, {kiosk: true});
        assert.strictEqual(on.f.kiosk, true);
        assert.ok(!on.f.people.some(p => /RECENT|FONTAINE|SECRET/.test(p[0])), JSON.stringify(on.f.people));
        assert.ok(on.f.people.some(p => /MAZAUD/.test(p[0])));
        assert.ok(!on.m.places.some(p => p.name === 'Bourg-Perdu'), 'en consultation, le lieu d’une personne vivante : ' + JSON.stringify(on.m.places));
    });

    await t('mode consultation : 🧭 Histoire autour (ha_life) ne lit pas la vie d’une personne vivante, probable ou confidentielle', async () => {
        const code = String.raw`require_once 'lib/histoire_autour.php'; $o = []; foreach ([1, 2, 3, 4] as $i) { try { $o[$i] = count(ha_life($pdo, $i)['events'] ?? []); } catch (Throwable $e) { $o[$i] = 'refus'; } } echo json_encode($o), "\n";`;
        const off = runPhp(code), on = runPhp(code, {kiosk: true});
        assert.deepStrictEqual(off, {1: 1, 2: 1, 3: 0, 4: 1}, 'hors consultation, sur ton ordinateur : tout se lit');
        assert.deepStrictEqual(on, {1: 1, 2: 'refus', 3: 'refus', 4: 'refus'});
    });

    await t('parseData : un mot de thème plein de signes (« c++ », « (x », « a[b ») ne casse plus la question', async () => {
        const C = require('../assets/js/app-paniers-core.js');
        const u = C.parseData('les séismes près de Treignac en 1909', {themes: [{id: 'x', words: ['c++', '(x', 'a[b', '*']}, {id: 'seismes', words: ['seisme']}]});
        assert.strictEqual(u.themes[0]?.id, 'seismes');
        const v = C.parseData('du c++ et (x partout', {themes: [{id: 'x', words: ['c++', '(x']}]});
        assert.strictEqual(v.themes[0]?.id, 'x');
    });

    await t('liens : http(s) seulement dans ce qui est inséré (📎), la source d’une liste et « À propos » d’Histoire autour', async () => {
        const ins = fs.readFileSync(path.join(root, 'assets/js/app-inserer.js'), 'utf8');
        const hrefs = ins.match(/href="\$\{[^}]*\}/g) || [];
        assert.ok(hrefs.length >= 5 && hrefs.every(h => /href="\$\{esc\(hu\(/.test(h)), 'app-inserer.js : ' + hrefs.join(' | '));
        const hu = eval(ins.match(/const hu = (u => [^;]*);/)[1]);
        for (const bad of ['javascript:alert(1)', ' JAVASCRIPT:x', 'data:text/html,x', 'vbscript:x', 'https://a" onmouseover="x']) assert.strictEqual(hu(bad), '', bad);
        assert.strictEqual(hu('https://example.org/a?b=1'), 'https://example.org/a?b=1');
        const ld = fs.readFileSync(path.join(root, 'assets/js/app-listes-donnees.js'), 'utf8');
        assert.ok(/sourceLine = d => .*\/\^https\?:/.test(ld), 'app-listes-donnees.js : la source d’une liste');
        const ha = fs.readFileSync(path.join(root, 'assets/js/heritage-histoire-autour.js'), 'utf8');
        assert.ok(/const link = \(url, label\) => \(\/\^https\?:/.test(ha), 'heritage-histoire-autour.js : link()');
    });

    await t('dans l’app : valeurs, note, ligne ajoutée, douteuse et question piégées ne s’exécutent pas ; 5 000 lignes sans gel', async () => {
        const B = await require('./prendre-depuis-seed.js').start();
        const p = B.page, sleep = ms => new Promise(r => setTimeout(r, ms));
        try {
            const X = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';
            await p.evaluate(X => {
                const E = window.LCNDA_EXT, rows = [];
                rows.push({name: 'Combat ' + X, d: '1760-05-02', y: 1760, lat: 45.585, lon: 1.72, lieu: X, u: 'javascript:window.__xss=1'});
                for (let i = 0; i < 5000; i++) rows.push({name: 'Combat n° ' + i, d: `${1600 + i % 300}-01-01`, y: 1600 + i % 300, lat: 45 + (i % 100) / 100, lon: 1 + (i % 70) / 100, lieu: 'Lieu ' + (i % 40), u: ''});
                E.dataLists.push({id: 'test_piege', icon: '⚔️', label: 'Piège ' + X, group: 'Le monde', theme: 'guerres', source: 'Source ' + X, sourceUrl: 'javascript:window.__xss=1', load: async () => rows,
                    fields: [{key: 'name', label: 'Combat ' + X, type: 'text'}, {key: 'd', label: 'Date', type: 'date'}, {key: 'lieu', label: 'Lieu', type: 'place'}, {key: 'u', label: 'Lien', type: 'url'}],
                    period: r => [r.y, r.y], geo: r => [r.lat, r.lon], rowKey: r => r.name, familyColumn: true});
                E.donneesPlus?.resetCache?.();
                const k = 'Combat ' + X;
                localStorage.setItem('genealogie-donnees-lignes', JSON.stringify({test_piege: [{id: 'm1', what: X, when: '1771', where: X, src: X, y: 1771}]}));
                localStorage.setItem('genealogie-donnees-douteuses', JSON.stringify({['test_piege|' + k]: {why: X, at: 1}, ['test_piege\u0001' + k]: {why: X, at: 1}}));
            }, X);
            await p.evaluate(X => window.LCNDA_APP.api('dplus_note', {}, {method: 'POST', body: {list: 'test_piege', key: 'Combat ' + X, title: X, note: 'note ' + X}}), X);
            // le gel le plus long pendant qu'on ouvre la liste
            await p.evaluate(() => { window.__long = 0; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long = Math.max(window.__long, e.duration); }).observe({type: 'longtask', buffered: false}); } catch (_) {} });
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'data_test_piege'; A.setModule('listes'); });
            await p.waitForSelector('[data-ld-page="test_piege"] [data-ld-results] tbody tr[data-ld-row]', {timeout: 30000}); await sleep(1500);
            const long1 = await p.evaluate(() => window.__long);
            // la recherche dans la liste, puis la question du récap
            await p.evaluate(() => { window.__long = 0; });
            const q = await p.$('[data-ld-page="test_piege"] input[type="search"]');
            if (q) { await q.fill('Combat n° 49'); await sleep(1200); }
            const long2 = await p.evaluate(() => window.__long);
            await p.evaluate(() => { const H = window.LCNDA_EXT.dataHome._st; H.view = 'recap'; H.q = ''; H.res = null; const A = window.LCNDA_APP; A.state.listType = 'donnees'; A.setModule('listes'); });
            await p.waitForSelector('[data-dr-q]', {timeout: 30000});
            await p.fill('[data-dr-q]', `les séismes près de ${X} quand ${X} avait 30 ans`); await p.press('[data-dr-q]', 'Enter'); await sleep(2500);
            const bad = await p.evaluate(() => ({xss: window.__xss || 0, on: document.querySelectorAll('[onerror], [onload], [onmouseover]').length,
                js: [...document.querySelectorAll('a[href]')].filter(a => !/^(https?:|mailto:|tel:|#|$|blob:|api\.php|media\/|index\.php|\.?\/?[a-z0-9_-]*\.php)/i.test(a.getAttribute('href').trim())).map(a => a.getAttribute('href')).slice(0, 5)}));
            assert.deepStrictEqual(bad, {xss: 0, on: 0, js: []});
            assert.ok(long1 < 400, `ouvrir 5 000 lignes : la page gèle ${Math.round(long1)} ms (avant la correction : 11 s, la colonne de gauche)`); // 150 ms mesurés ; de la marge pour une machine chargée
            assert.ok(long2 < 200 || !q, `chercher dans 5 000 lignes : la page gèle ${Math.round(long2)} ms`);
            console.log(`  (gel le plus long : ouverture ${Math.round(long1)} ms, recherche ${Math.round(long2)} ms)`);
            // 🎞 le diaporama (qui part ensuite dans 🎤 Présentation, PDF, vidéo, .pptx) : jamais pour une personne vivante, comme le livret
            const sq = spawnSync(php, [...phpRuntimeArgs(php), '-r', `$p = new PDO('sqlite:' . getenv('DBF')); $b = (int) $p->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT'")->fetchColumn();
                $p->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(901,'Claire','VIVANTE','female','living')"); $p->exec("INSERT INTO events(scope,person_id,event_type_id,date_text,year,place_id) VALUES('person',901,$b,'1990',1990,1)"); echo 'ok';`], {encoding: 'utf8', env: {...process.env, DBF: path.join(B.tmp, 'genealogy.sqlite')}});
            assert.strictEqual(sq.stdout.trim(), 'ok', sq.stderr);
            await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
            await p.evaluate(() => window.LCNDA_EXT.donneesPlusOutils.slideshow(901)); await sleep(1500);
            assert.strictEqual(await p.$('dialog[open] [data-dp-slide]'), null, 'un diaporama s’ouvre pour une personne vivante');
            assert.deepStrictEqual(B.errs.filter(e => !/Failed to load resource|net::/.test(e)), []);
        } finally { await B.stop(); }
    });

    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
