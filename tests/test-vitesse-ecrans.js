'use strict';
/**
 * 🐘 Écrans lents sur très grosse base : plus rapides, mêmes résultats.                 node tests/test-vitesse-ecrans.js
 * Base fictive (scripts/grosse-base.php, 3 000 personnes ; VITESSE_BASE=… pour plus), puis :
 *  1. Poser une question : qm_people() gardé = recalculé ; les noms des personnes citées ; run_saved_search() (événement
 *     cherché une fois) = l'ancienne requête (EXISTS par fiche), mêmes fiches dans le même ordre, pour plusieurs critères ;
 *  2. Listes → Métiers : 24 personnes par métier + people_total ; « les suivantes » (occ_name) mises bout à bout = toutes
 *     les personnes de l'ancienne requête, dans le même ordre, mêmes valeurs ;
 *  3. Calendrier de la famille : la réponse serrée, remise en forme par l'écran (geneaExpand), = l'ancienne réponse ;
 *     gardée tant que la base ne change pas (un événement ajouté y est) ;
 *  4. Doutes : « sans source » par l'index des familles = l'ancienne requête.
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
const N = Math.max(500, Number(process.env.VITESSE_BASE) || 3000);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-vitesse-'));
const env = { ...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
let passed = 0, failed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', (e && e.stack) || e); } };
const php = code => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'memory_limit=1024M', '-r', code], { cwd: appRoot, env, encoding: 'utf8', maxBuffer: 1 << 28 }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

(async () => {
    fs.mkdirSync(path.join(tmp, 'media'), { recursive: true });
    const g = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'memory_limit=1024M', path.join(appRoot, 'scripts/grosse-base.php'), String(N), '1789'], { cwd: appRoot, env, encoding: 'utf8' });
    if (g.status !== 0) throw new Error(g.stderr || g.stdout);

    /* ═════ 1. Poser une question ═════ */
    await t('question : qm_people() gardé = recalculé ; les mots des noms = ceux tirés de qm_people()', () => {
        const out = php(`require 'lib/bootstrap.php'; require_once 'lib/question_more.php'; $pdo = db();
            $a = qm_people($pdo); $b = qm_people_raw($pdo);
            $part = ['de', 'du', 'des', 'd', 'la', 'le', 'les', 'l', 'van', 'von', 'der'];
            $w = qm_name_words($pdo, $part); $people = []; $idx = []; $wf = []; $wl = [];
            foreach ($b as $id => $p) { $fi = $wf[$p['first']] ??= qm_words($p['first']); $la = $wl[$p['last']] ??= qm_words($p['last']);
                if ($fi && $la) { $k = count($people); $people[] = [$id, $fi, array_values(array_diff($la, $part))]; foreach (array_unique(array_merge($people[$k][1], $people[$k][2])) as $x) { $idx[$x][] = $k; } } }
            $byId = static fn(array $l) => array_column($l, null, 0); ksort($idx);
            $w1 = $w[1]; ksort($w1); $sortK = static function (array $ix, array $pp) { return array_map(static fn($ks) => array_map(static fn($k) => $pp[$k][0], $ks), $ix); };
            $i1 = array_map(static function ($l) { sort($l); return $l; }, $sortK($idx, $people)); $i2 = array_map(static function ($l) { sort($l); return $l; }, $sortK($w1, $w[0]));
            echo json_encode([count($a), $a === $b, $byId($people) == $byId($w[0]), $i1 === $i2]);`);
        const [n, same, names, idx] = JSON.parse(out);
        assert.ok(n >= N * 0.9, 'fiches : ' + n);
        assert.deepEqual([same, names, idx], [true, true, true]);
    });
    await t('question : run_saved_search() = l’ancienne requête (EXISTS fiche par fiche), mêmes fiches, même ordre', () => {
        const out = php(`require 'lib/bootstrap.php'; $pdo = db();
            $place = (string) $pdo->query('SELECT p.name FROM places p JOIN events e ON e.place_id=p.id GROUP BY p.id ORDER BY count(*) DESC LIMIT 1')->fetchColumn();
            $res = [];
            foreach ([['event' => 'MARR'], ['event' => 'birth', 'place' => $place], ['event' => 'death', 'year_from' => 1850, 'year_to' => 1900], ['place' => mb_substr($place, 0, 3)], ['gender' => 'female', 'year_from' => 1700, 'year_to' => 1760],
                      ['event' => 'birth', 'year_from' => 1850, 'year_to' => 1850], ['first_name' => 'Marie', 'event' => 'MARR'], ['occupation' => 'menuisier', 'year_to' => 1850]] as $crit) {
                $new = run_saved_search($pdo, $crit);
                // l'ancienne requête : un EXISTS par fiche (reprise de lib/heritage.php d'avant)
                $c = saved_search_criteria($crit); $where = []; $params = [];
                if ($c['first_name'] !== '') { $where[] = "(' '||p.first_name||' '||COALESCE(p.middle_name,'')||' ') LIKE ? COLLATE NOCASE"; $params[] = '% ' . $c['first_name'] . '%'; }
                if ($c['gender'] !== '') { $where[] = 'p.gender=?'; $params[] = $c['gender']; }
                if ($c['occupation'] !== '') { $where[] = "(p.occupation LIKE ? COLLATE NOCASE OR EXISTS(SELECT 1 FROM events oe JOIN event_types ot ON ot.id=oe.event_type_id WHERE oe.person_id=p.id AND ot.gedcom_tag='OCCU' AND (oe.title LIKE ? COLLATE NOCASE OR oe.description LIKE ? COLLATE NOCASE)))"; array_push($params, "%{$c['occupation']}%", "%{$c['occupation']}%", "%{$c['occupation']}%"); }
                $tags = match ($c['event']) { 'birth' => ['BIRT', 'CHR', 'BAPM'], 'death' => ['DEAT', 'BURI'], 'any' => [], default => [$c['event']] };
                $cond = ['(e.person_id=p.id OR e.family_id IN (SELECT id FROM families WHERE partner1_id=p.id OR partner2_id=p.id))']; $sub = [];
                if ($tags) { $cond[] = 't.gedcom_tag IN (' . implode(',', array_fill(0, count($tags), '?')) . ')'; array_push($sub, ...$tags); }
                if ($c['place'] !== '') { $cond[] = '(pl.name LIKE ? COLLATE NOCASE OR pl.county LIKE ? COLLATE NOCASE OR pl.state LIKE ? COLLATE NOCASE OR pl.country LIKE ? COLLATE NOCASE)'; array_push($sub, $c['place'] . '%', $c['place'] . '%', $c['place'] . '%', $c['place']); }
                if ($c['year_from']) { $cond[] = 'e.year >= ?'; $sub[] = $c['year_from']; }
                if ($c['year_to']) { $cond[] = 'e.year <= ?'; $sub[] = $c['year_to']; }
                $where[] = 'EXISTS(SELECT 1 FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN places pl ON pl.id=e.place_id WHERE ' . implode(' AND ', $cond) . ')'; array_push($params, ...$sub);
                $s = $pdo->prepare('SELECT p.id FROM persons p WHERE ' . implode(' AND ', $where) . ' ORDER BY p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE LIMIT 5000'); $s->execute($params);
                $old = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
                $res[] = [json_encode($crit, JSON_UNESCAPED_UNICODE), count($old), $old === $new];
            }
            echo json_encode($res);`);
        const res = JSON.parse(out);
        for (const [crit, n, same] of res) assert.ok(same, `${crit} (${n} fiches)`);
        assert.ok(res.some(([, n]) => n > 20), 'des critères qui trouvent des fiches');
    });

    /* ═════ 2 à 4 : par l'API ═════ */
    const port = await freePort();
    const srv = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-d', 'memory_limit=1024M', '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env: { ...env, PHP_CLI_SERVER_WORKERS: '2' }, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    try {
        for (let i = 0; i < 200; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
        const get = async q => { const r = await fetch(`${base}api.php?${new URLSearchParams(q)}`); assert.equal(r.status, 200, JSON.stringify(q)); return r.json(); };
        await t('Métiers : 24 personnes par métier, puis les suivantes à la demande = toutes, dans l’ordre d’avant, mêmes valeurs', async () => {
            const list = await get({ action: 'list', type: 'occupations', q: '', limit: 80 });
            assert.ok(list.rows.length >= 10, 'des métiers');
            const names = list.rows.map(r => r.name);
            // l'ancienne réponse : toutes les personnes de chaque métier (la requête d'avant, reprise ici)
            const old = JSON.parse(php(`require 'lib/bootstrap.php'; $pdo = db(); $names = json_decode(${JSON.stringify(JSON.stringify(names))}, true); $marks = implode(',', array_fill(0, count($names), '?'));
                $s = $pdo->prepare("SELECT LOWER(TRIM(val)) AS group_key, p.id, p.first_name, p.last_name, p.gender, p.living_status,
                    (SELECT e.date_text FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT' ORDER BY e.id LIMIT 1) AS birth_date,
                    (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='BIRT' ORDER BY e.id LIMIT 1) AS birth_year,
                    (SELECT e.date_text FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='DEAT' ORDER BY e.id LIMIT 1) AS death_date,
                    (SELECT e.year FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id=p.id AND t.gedcom_tag='DEAT' ORDER BY e.id LIMIT 1) AS death_year
                    FROM (SELECT p2.id AS pid, p2.occupation AS val FROM persons p2 WHERE p2.occupation IS NOT NULL AND TRIM(p2.occupation)!='' AND TRIM(p2.occupation) IN ($marks)
                    UNION SELECT e.person_id AS pid, COALESCE(NULLIF(TRIM(e.title),''),NULLIF(TRIM(e.description),''),t.label) AS val FROM events e JOIN event_types t ON t.id=e.event_type_id WHERE e.person_id IS NOT NULL
                      AND (t.gedcom_tag='OCCU' OR LOWER(t.label) LIKE '%profes%' OR LOWER(t.label) LIKE '%m%tier%' OR LOWER(t.label) LIKE '%activit%') AND COALESCE(NULLIF(TRIM(e.title),''),NULLIF(TRIM(e.description),''),NULLIF(t.label,'')) IN ($marks)
                    UNION SELECT cm.person_id AS pid, cm.occupation AS val FROM census_members cm WHERE cm.person_id IS NOT NULL AND cm.occupation IS NOT NULL AND TRIM(cm.occupation)!='' AND TRIM(cm.occupation) IN ($marks)
                    ) src JOIN persons p ON p.id=src.pid ORDER BY p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE");
                $s->execute(array_merge($names, $names, $names)); $by = [];
                foreach ($s->fetchAll() as $r) { $k = $r['group_key']; unset($r['group_key']); $r['labels'] = []; $by[$k][$r['id']] = $r; }
                echo json_encode(array_map('array_values', $by), JSON_UNESCAPED_UNICODE);`));
            let paged = 0;
            for (const row of list.rows) {
                const want = old[row.name.trim().toLowerCase()] || [];
                assert.equal(row.people_total, want.length, row.name);
                assert.ok(row.people.length <= 24);
                const all = [...row.people];
                while (all.length < row.people_total) { const r = await get({ action: 'list', type: 'occupations', occ_name: row.name, offset: all.length }); paged++; assert.equal(r.total, row.people_total); if (!r.people.length) break; all.push(...r.people); }
                assert.deepEqual(all.map(p => ({ ...p, labels: [] })), want, row.name);
            }
            assert.ok(paged > 0, 'des métiers de plus de 24 personnes');
        });
        await t('Calendrier de la famille : la réponse serrée remise en forme = l’ancienne ; gardée, puis refaite quand la base change', async () => {
            const src = fs.readFileSync(path.join(appRoot, 'assets/js/heritage-calendars.js'), 'utf8');
            const geneaExpand = new Function(src.slice(src.indexOf('const geneaExpand = data =>'), src.indexOf('const geneaPerson = () =>')) + 'return geneaExpand;')();
            // l'ancienne réponse : chaque événement de genea_calendar_events(), sans ses valeurs par défaut (comme le flux d'avant)
            const oldOf = () => JSON.parse(php(`require 'lib/bootstrap.php'; require_once 'lib/calendars.php'; $pdo = db(); $out = []; $r = genea_calendar_events($pdo, [], null, [], static function (array $e) use (&$out) {
                if (!$e['approx']) { unset($e['approx']); } if ($e['calendar'] === 'gregorian' || $e['calendar'] === '') { unset($e['calendar']); }
                foreach (['title', 'place', 'county', 'region', 'country'] as $k) { if ($e[$k] === '') { unset($e[$k]); } } if (!$e['place_id']) { unset($e['place_id']); } $out[] = $e; });
                echo json_encode(['events' => $out, 'undated' => $r['undated']], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);`));
            const a = await get({ action: 'genea_calendar' });
            assert.equal(a.compact, 1);
            const old = oldOf();
            assert.ok(old.events.length > N);
            assert.equal(JSON.stringify(geneaExpand(a)), JSON.stringify(old));
            const b = await get({ action: 'genea_calendar' }); // gardée
            assert.equal(JSON.stringify(b), JSON.stringify(a));
            php(`require 'lib/bootstrap.php'; $pdo = db(); $pdo->exec("INSERT INTO events(scope, person_id, event_type_id, date_text, year) SELECT 'person', (SELECT min(id) FROM persons), id, '3 juillet 1832', 1832 FROM event_types WHERE gedcom_tag='BIRT' LIMIT 1");`);
            const c = geneaExpand(await get({ action: 'genea_calendar' }));
            assert.equal(c.events.length, old.events.length + 1, 'l’événement ajouté est là');
            assert.equal(JSON.stringify(c), JSON.stringify(oldOf()));
            const one = await get({ action: 'genea_calendar', person_id: 1 });
            assert.ok(Array.isArray(geneaExpand(one).events));
        });
        await t('Doutes : « sans source » des ancêtres = l’ancienne requête ; la liste répond', async () => {
            const out = JSON.parse(php(`require 'lib/bootstrap.php'; $pdo = db(); $ids = array_map('intval', $pdo->query('SELECT id FROM persons ORDER BY id LIMIT 1200')->fetchAll(PDO::FETCH_COLUMN));
                $tags = "'BIRT','CHR','BAPM','MARR','DEAT','BURI'";
                $base = "SELECT e.id, e.date_text, e.place_id, t.gedcom_tag AS tag, e.person_id, e.family_id, f.partner1_id, f.partner2_id FROM events e JOIN event_types t ON t.id=e.event_type_id LEFT JOIN families f ON f.id=e.family_id WHERE t.gedcom_tag IN ($tags) AND NOT EXISTS (SELECT 1 FROM source_links sl WHERE sl.entity_type='event' AND sl.entity_id=e.id)";
                $res = [];
                foreach (array_chunk($ids, 400) as $ch) { $in = implode(',', $ch);
                    $a = $pdo->query($base . " AND (e.person_id IN ($in) OR f.partner1_id IN ($in) OR f.partner2_id IN ($in)) ORDER BY e.id")->fetchAll(PDO::FETCH_ASSOC);
                    $b = $pdo->query($base . " AND (e.person_id IN ($in) OR e.family_id IN (SELECT id FROM families WHERE partner1_id IN ($in) OR partner2_id IN ($in))) ORDER BY e.id")->fetchAll(PDO::FETCH_ASSOC);
                    $res[] = [count($a), $a === $b]; }
                echo json_encode($res);`));
            for (const [n, same] of out) assert.ok(same, `${n} lignes`);
            assert.ok(out.some(([n]) => n > 0));
            assert.ok(fs.readFileSync(path.join(appRoot, 'lib/doutes.php'), 'utf8').includes('OR e.family_id IN (SELECT id FROM families WHERE partner1_id IN ($in) OR partner2_id IN ($in))'));
            const d = await get({ action: 'compl', op: 'doutes' });
            assert.ok(Array.isArray(d.rows) && d.total === d.rows.length);
        });
    } finally {
        srv.kill();
    }
})().catch(e => { failed++; console.error(e); }).finally(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`\n${passed} réussi(s), ${failed} échoué(s)`);
    process.exit(failed ? 1 : 0);
});
