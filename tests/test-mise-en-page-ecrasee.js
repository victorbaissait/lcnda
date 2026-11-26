#!/usr/bin/env node
/* 📐 Mise en page écrasée : un ajout (case à cocher, 📎 🧺 au bout d'une ligne, cadre par personne, « ↗ source », bouton de carte,
 * barre de sélection, bloc de données, pastilles du choix…) ne doit pas pousser le texte dans une colonne étroite.
 * Le bug du 26/11 : `.date-result` est une grille à 2 colonnes (42 px | 1fr) ; la case `.rp-pick` ajoutée devant a pris la 1re,
 * l'avatar la 2e et le texte est tombé dans la colonne de 42 px : un mot par ligne, des fiches très hautes.
 * Le détecteur (squash, dans la page) signale, sur chaque écran :
 *   1. « écrasé » : un élément visible d'au moins 3 mots, qui passe à la ligne, large de moins de 80 px alors que son parent
 *      fait plus de 250 px ;
 *   2. « colonne étroite » : l'enfant d'une grille placé tout seul (grid-column auto) dans une colonne de moins de 60 px, avec
 *      un long texte ;
 *   3. « mot par ligne » : un texte de moins de 6 mots sur plus de 4 lignes.
 * Chaque trouvaille dit l'écran, le sélecteur, et une capture (le texte encadré de rouge) dans ECRASEE_SHOTS (sinon un dossier
 * temporaire). Base inventée d'une quarantaine de personnes (MAZAUD, LACOMBE, DURAND), lieux avec coordonnées, sources, médias,
 * actes, une enquête avec pistes et pièces, un dépouillement, des décès INSEE (⚰️ Décès possible), une fiche avec un bloc 📊 Données.
 * Écrans : tableau de bord, fiche (toutes les sections), Personnes, Listes (natives, données : tableau, cartes, carte, ☑), Données,
 * Recherche (chaque sorte, avec des résultats), Enquêtes (liste, détail, pistes, Atelier, tableaux), Fiches, Graphiques, Diagrammes,
 * Carte, Documents, Réglages, Comparaison, Trésors, Paniers, Contrôle de la base, Veille des décès, Ma semaine, et les fenêtres
 * « Prendre depuis… », « Ajouter au tableau », « Mettre dans… » ; à 1440 et 390 px, clair et sombre (en sombre, un écran sur deux).
 *   node tests/test-mise-en-page-ecrasee.js           ECRASEE_ALL=1 : en plus chaque entrée de la colonne de gauche (chasse large)
 *   ECRASEE_ONLY=motif : seulement les écrans dont le nom correspond. */
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
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ALL = process.env.ECRASEE_ALL === '1';
const ONLY = process.env.ECRASEE_ONLY ? new RegExp(process.env.ECRASEE_ONLY, 'i') : null;
const SHOTS = process.env.ECRASEE_SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-ecrasee-shots-'));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAEUlEQVR4nGM4saoCK2IYSAkA+7xb4bzwD28AAAAASUVORK5CYII=', 'base64');

/* ═════════ Le détecteur (dans la page) ═════════ */
function squash(opts) {
    const scope = (opts && opts.root && document.querySelector(opts.root)) || document.body;
    const SKIP = '.leaflet-container, .maplibregl-map, svg, canvas, iframe, .ui-toast, .toast, [data-no-squash-check], .CodeMirror, [aria-hidden="true"], script, style, noscript, template, .sr-only, .visually-hidden, select, option, textarea';
    const words = s => (String(s).match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) || []).length;
    const vis = el => !el.checkVisibility || el.checkVisibility({checkOpacity: true, checkVisibilityCSS: true});
    const describe = el => { const c = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.') : ''; return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (c ? '.' + c : ''); };
    const pathOf = el => { const p = []; for (let e = el, i = 0; e && e !== document.body && i < 4; e = e.parentElement, i++) p.unshift(describe(e)); return p.join(' > '); };
    const linesOf = node => { const rg = document.createRange(); rg.selectNodeContents(node); const tops = []; for (const r of rg.getClientRects()) { if (r.width < 0.5 || r.height < 0.5) continue; if (!tops.some(t => Math.abs(t - r.top) < r.height * 0.5)) tops.push(r.top); } return tops.length; };
    // un élément tourné, en colonne verticale, ou dans un cadre qui défile de côté (tableau large) : pas jugé
    const odd = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e); if (s.writingMode && !/horizontal/.test(s.writingMode)) return true; if (s.transform && s.transform !== 'none' && /matrix\((?!1, 0, 0, 1)/.test(s.transform)) return true; } return false; };
    const out = []; const seen = new Set();
    const add = (el, kind, why) => {
        const key = kind + '|' + pathOf(el); if (seen.has(key)) return; seen.add(key);
        const r = el.getBoundingClientRect(); const mark = 's' + out.length; el.setAttribute('data-squash', mark);
        out.push({mark, kind, why, sel: pathOf(el), text: (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60), rect: {x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height)}});
    };
    const all = [...scope.querySelectorAll('*')];
    for (const el of all) {
        if (el.closest(SKIP)) continue;
        const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.display === 'contents') continue;
        const grid = /grid/.test(s.display) && el.children.length > 1 && r.width > 250;
        if (r.width >= 80 && !grid) continue;
        const txt = r.width < 80 ? (el.innerText || '').trim() : ''; const n = txt ? words(txt) : 0;
        // 1. écrasé : ≥ 3 mots, < 80 px de large, sur plusieurs lignes, dans un parent de plus de 250 px
        const par = el.parentElement;
        if (n >= 3 && r.width < 80 && par && par.getBoundingClientRect().width > 250 && r.height > parseFloat(s.lineHeight || '0') * 1.6 + 2 && r.height > (parseFloat(s.fontSize) || 14) * 2.2 && vis(el) && !odd(el)) {
            if (!/^(INPUT|BUTTON)$/.test(el.tagName) || txt.length > 12) add(el, 'écrasé', `${n} mots dans ${Math.round(r.width)} px (parent ${Math.round(par.getBoundingClientRect().width)} px)`);
        }
        // 2. une grille : un enfant placé tout seul (auto) dans une colonne de moins de 60 px, avec un long texte
        if (grid) {
            for (const c of el.children) {
                const cs = getComputedStyle(c); if (cs.position === 'absolute' || cs.position === 'fixed') continue;
                if (cs.gridColumnStart !== 'auto' || !/auto|^$/.test(cs.gridColumnEnd) && !/^span 1$/.test(cs.gridColumnEnd)) continue;
                const cr = c.getBoundingClientRect(); const ct = (c.innerText || '').trim();
                if (cr.width > 0.5 && cr.width < 60 && ct.length >= 20 && words(ct) >= 3 && vis(c) && !c.closest(SKIP) && !odd(c)) add(c, 'colonne étroite', `enfant de grille (grid-column auto) dans ${Math.round(cr.width)} px : « ${ct.slice(0, 30)} »`);
            }
        }
    }
    // 3. un mot par ligne : un texte de moins de 6 mots sur plus de 4 lignes
    const tw = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {acceptNode: x => (x.nodeValue.trim().length > 3 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)});
    for (let t = tw.nextNode(); t; t = tw.nextNode()) {
        const pe = t.parentElement; if (!pe || pe.closest(SKIP)) continue;
        const n = words(t.nodeValue); if (n >= 6 || n < 1) continue;
        if (linesOf(t) > 4 && vis(pe) && !odd(pe)) add(pe, 'mot par ligne', `${n} mot(s) sur ${linesOf(t)} lignes dans ${Math.round(pe.getBoundingClientRect().width)} px`);
    }
    return out;
}

/* ═════════ La base inventée : une quarantaine de personnes (MAZAUD, LACOMBE, DURAND) ═════════ */
async function start() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-ecrasee-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    for (let i = 1; i <= 12; i++) fs.writeFileSync(path.join(tmp, 'media', `img${String(i).padStart(2, '0')}.png`), PNG);
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4', GENEALOGY_TEST: '1'};
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; require_once 'lib/transcriptions.php'; $pdo = db(); act_transcriptions_ensure($pdo);
$pdo->beginTransaction();
$t = fn($tag) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$tag' LIMIT 1")->fetchColumn();
$pl = $pdo->prepare("INSERT INTO places(id,name,county,country,latitude,longitude,admin4_code) VALUES(?,?,?,'France',?,?,?)");
foreach ([[1,'Treignac','Corrèze',45.5367,1.7958,'19269'],[2,'Chamberet','Corrèze',45.5847,1.7183,'19037'],[3,'Eymoutiers','Haute-Vienne',45.7381,1.7417,'87064'],[4,'Tulle','Corrèze',45.2675,1.7711,'19272'],[5,'Brive-la-Gaillarde','Corrèze',45.1589,1.5321,'19031'],[6,'Paris','Paris',48.8566,2.3522,'75056']] as $p) $pl->execute($p);
$per = $pdo->prepare("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start,occupation) VALUES(?,?,?,?,?,?,?)");
$ev = $pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year,sort_date,place_id,description) VALUES('person',?,?,?,?,?,?,?)");
$fe = $pdo->prepare("INSERT INTO events(scope,family_id,event_type_id,date_text,year,sort_date,place_id) VALUES('family',?,?,?,?,?,?)");
$mois = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
$d = function ($y, $i) use ($mois) { $m = 1 + $i % 12; $j = 1 + ($i * 7) % 27; return [$j . ' ' . $mois[$m - 1] . ' ' . $y, sprintf('%04d-%02d-%02d', $y, $m, $j)]; };
$B = $t('BIRT'); $D = $t('DEAT'); $M = $t('MARR'); $O = $t('OCCU'); $R = $t('RESI');
$men = ['Jean','Pierre','Léonard','François','Martial','Jacques','Antoine','Louis','Henri','Paul'];
$women = ['Marie','Anne','Catherine','Marguerite','Jeanne','Antoinette','Louise','Rose','Françoise','Jeanne-Marie'];
$last = ['MAZAUD','LACOMBE','DURAND'];
$jobs = ['cultivateur','meunier','tisserand','journalier','instituteur','sabotier','couturière','marchand de bestiaux'];
// 5 générations : couples (homme, femme), chaque couple a 2 à 3 enfants
$id = 0; $gen = [[]]; $fams = [];
$mk = function ($g, $sex, $ln, $y) use (&$id, $per, $ev, $d, $B, $D, $O, $R, $men, $women, $jobs) {
    $id++; $fn = $sex === 'male' ? $men[$id % count($men)] : $women[$id % count($women)];
    $living = $y > 1935 ? 'living' : 'deceased';
    $per->execute([$id, $fn, $ln, $sex, $living, 0, $jobs[$id % count($jobs)]]);
    $place = 1 + $id % 5; [$tx, $sd] = $d($y, $id); $ev->execute([$id, $B, $tx, $y, $sd, $place, '']);
    if ($living === 'deceased') { [$tx, $sd] = $d($y + 55 + $id % 20, $id + 3); $ev->execute([$id, $D, $tx, $y + 55 + $id % 20, $sd, 1 + ($id + 1) % 5, '']); }
    if ($id % 3 === 0) { $ev->execute([$id, $O, (string) ($y + 22), $y + 22, ($y + 22) . '-01-01', $place, $jobs[$id % count($jobs)] . ' au moulin du bourg, chez son oncle']); }
    if ($id % 4 === 0) { $ev->execute([$id, $R, (string) ($y + 30), $y + 30, ($y + 30) . '-01-01', 6, 'rue des Écoles, au troisième étage, chez la veuve LACOMBE']); }
    return $id;
};
$fam = $pdo->prepare('INSERT INTO families(id,partner1_id,partner2_id) VALUES(?,?,?)');
$kid = $pdo->prepare('INSERT INTO family_children(family_id,child_id,position) VALUES(?,?,?)');
$fid = 0; $couples = [];
foreach ([[1760,'MAZAUD','LACOMBE'],[1762,'DURAND','MAZAUD']] as [$y, $a, $b]) { $h = $mk(0, 'male', $a, $y); $w = $mk(0, 'female', $b, $y + 3); $couples[] = [$h, $w, $y]; }
$people = [];
for ($g = 1; $g <= 4 && $id < 40; $g++) {
    $next = [];
    foreach ($couples as $ci => [$h, $w, $y]) {
        $fid++; $fam->execute([$fid, $h, $w]); [$tx, $sd] = $d($y + 24, $fid); $fe->execute([$fid, $M, $tx, $y + 24, $sd, 1 + $fid % 3]);
        $ln = $pdo->query("SELECT last_name FROM persons WHERE id=$h")->fetchColumn();
        $kids = [];
        for ($k = 0; $k < 3 && $id < 40; $k++) { $c = $mk($g, $k % 2 ? 'female' : 'male', $ln, $y + 28 + $k * 3); $kid->execute([$fid, $c, $k]); $kids[] = $c; }
        $next[] = $kids;
    }
    // les fils épousent une fille d'une autre famille (ou une nouvelle venue)
    $couples = [];
    foreach ($next as $ki => $kids) { foreach ($kids as $c) { if ($pdo->query("SELECT gender FROM persons WHERE id=$c")->fetchColumn() !== 'male' || $id >= 40) continue;
        $y = (int) $pdo->query("SELECT year FROM events WHERE person_id=$c AND event_type_id=$B")->fetchColumn();
        $w = $mk($g, 'female', $last[($c + 1) % 3], $y + 2); $couples[] = [$c, $w, $y]; } }
}
$start = (int) $pdo->query("SELECT id FROM persons ORDER BY id DESC LIMIT 1")->fetchColumn();
$pdo->exec("UPDATE persons SET is_start=1 WHERE id=$start");
// une vivante née en 1938 à Tulle (⚰️ Décès possible : le fichier INSEE la dit décédée)
$per->execute([++$id, 'Jeanne', 'LACOMBE', 'female', 'living', 0, 'institutrice']); $jeanne = $id; $ev->execute([$jeanne, $B, '12 mars 1938', 1938, '1938-03-12', 4, '']);
$pdo->exec("INSERT INTO insee_deces_imports(id,filename,row_count,inserted_count,max_annee_deces,min_annee_deces) VALUES(1,'deces-2026-m09.csv',2,2,2026,2026)");
$i = $pdo->prepare("INSERT INTO insee_deces(nom,prenom,prenoms,sexe,date_naissance,annee_naissance,code_lieu_naissance,commune_naissance,pays_naissance,date_deces,annee_deces,code_lieu_deces,commune_deces,numero_acte_deces,source_file,source_import_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)");
$i->execute(['LACOMBE','JEANNE','JEANNE MARIE','2','19380312',1938,'19272','TULLE','','20260903',2026,'19031','BRIVE-LA-GAILLARDE','512','deces-2026-m09.csv']);
$i->execute(['MAZAUD','PIERRE','PIERRE LOUIS','1','19400602',1940,'19272','TULLE','','20260911',2026,'19272','TULLE','77','deces-2026-m09.csv']);
// sources et citations (sur la moitié des événements : les cadres « Sources » repliables de la fiche)
$src = $pdo->prepare("INSERT INTO sources(id,title,author,agency,publication) VALUES(?,?,?,?,?)");
$src->execute([1,'Registres paroissiaux de Treignac (1770–1800)','','AD Corrèze','3 E 271/2']); $src->execute([2,'Registres d’état civil de Chamberet (1793–1902)','','AD Corrèze','4 E 48/3']);
$src->execute([3,'Recensement d’Eymoutiers, 1836','','AD Haute-Vienne','6 M 412']); $src->execute([4,'« Familles du plateau de Millevaches » (livre, 2004)','DURAND','','']);
$sl = $pdo->prepare("INSERT INTO source_links(source_record_id,entity_type,entity_id,page) VALUES(?,?,?,?)");
foreach ($pdo->query("SELECT id FROM events WHERE id % 2 = 0")->fetchAll(PDO::FETCH_COLUMN) as $eid) { $sl->execute([1 + $eid % 4, 'event', $eid, 'vue ' . (10 + $eid % 40) . ', folio ' . (1 + $eid % 9)]); }
$sl->execute([2, 'event', (int) $pdo->query("SELECT id FROM events WHERE person_id=$start AND id % 2 = 0 LIMIT 1")->fetchColumn() ?: 2, 'acte n° 12']);
// médias (vignette) reliés aux personnes
$md = $pdo->prepare("INSERT INTO media(id,title,media_type,filename,thumbnail,date_text,document_reference) VALUES(?,?,?,?,?,?,?)");
$ml = $pdo->prepare("INSERT INTO media_links(media_id,entity_type,entity_id) VALUES(?,?,?)");
for ($m = 1; $m <= 12; $m++) { $f = sprintf('img%02d.png', $m); $md->execute([$m, $m === 1 ? 'Registre de Treignac, vue 14' : "Photo de famille n° $m, devant la maison du bourg", $m === 1 ? 'document' : 'image', $f, $f, 'vers ' . (1880 + $m), $m === 1 ? '3 E 271/2' : '']); $ml->execute([$m, 'person', $m === 2 ? $start : 1 + ($m * 3) % 40]); }
// actes (transcriptions)
$ac = $pdo->prepare("INSERT INTO act_transcriptions(id,title,kind,media_id,date_text,place,source,body,data_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)");
$ac->execute([1,'Acte de baptême · Jean MAZAUD','bapteme',1,'12 mars 1785','Treignac (19)','AD Corrèze 3 E 271/2, vue 14','Le douze mars mil sept cent quatre vingt cinq a été baptisé Jean MAZAUD, fils légitime de Pierre MAZAUD, meunier, et de Marie LACOMBE','{"status":"checked","people":[{"name":"Jean MAZAUD"},{"name":"Pierre MAZAUD"}]}','2026-01-10 10:00:00']);
$ac->execute([2,'Acte de mariage · Léonard DURAND et Anne MAZAUD','mariage',null,'8 février 1810','Chamberet (19)','AD Corrèze 4 E 48/3, vue 52','Le huit février mil huit cent dix, devant nous maire de Chamberet, ont comparu Léonard DURAND, cultivateur, et Anne MAZAUD','{"people":[{"name":"Léonard DURAND"}]}','2026-01-11 10:00:00']);
// notes
$nt = $pdo->prepare("INSERT INTO notes(entity_type,entity_id,title,body,created_at) VALUES('person',?,?,?,datetime('now'))");
$nt->execute([$start,'Souvenir de la grand-mère','Il tenait le moulin de Treignac avec son frère, jusqu’à la crue de 1960.']); $nt->execute([1,'Piste notaire','Voir les minutes de Me LACOMBE à Treignac, années 1780 à 1795.']);
// l'enquête : des pistes (avec pièces jointes), un média évalué
$pdo->exec("INSERT INTO investigations(id,person_id,title,status,question,known_facts,documents) VALUES(1,1,'Les origines des MAZAUD de Treignac','open','D’où venait le premier MAZAUD arrivé à Treignac vers 1780 ?','Un baptême en 1785, un mariage à Chamberet.','Registres paroissiaux, recensement de 1836')");
$ii = $pdo->prepare("INSERT INTO investigation_items(id,investigation_id,kind,title,url,notes,status) VALUES(?,1,?,?,?,?,?)");
$ii->execute([1,'lead','Les baptêmes de Treignac entre 1780 et 1790','https://archives.correze.fr/','Parcourir les registres paroissiaux, vue par vue, en notant chaque parrain MAZAUD','to_explore']);
$ii->execute([2,'source','Recensement d’Eymoutiers, 1836','','Le ménage n° 42 : un Léonard MAZAUD, meunier, avec sa femme et trois enfants','promising']);
$ii->execute([3,'note','Le moulin du bourg','','Acheté en 1792 par Pierre MAZAUD selon la tradition familiale','explored']);
$pdo->exec("INSERT INTO investigation_media(id,investigation_id,media_id,verdict,reason) VALUES(1,1,1,'interesting','On y lit le nom du parrain, Léonard MAZAUD, meunier au bourg')");
$pdo->exec("INSERT INTO investigation_media_items(investigation_media_id,investigation_item_id) VALUES(1,1)");
$pdo->commit();
echo json_encode(['ok' => 1, 'start' => $start, 'jeanne' => $jeanne, 'n' => $id]);`], {cwd: root, encoding: 'utf8', env});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { fs.rmSync(tmp, {recursive: true, force: true}); throw new Error(seed.stderr || seed.stdout); }
    const ID = JSON.parse(seed.stdout.trim().split('\n').pop());
    const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 300; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const stop = async () => { await browser.close().catch(() => {}); proc.kill(); fs.rmSync(tmp, {recursive: true, force: true}); };
    return {ID, base, browser, stop, proc};
}

/* une page prête : plus rien ne se charge et l'écran ne bouge plus pendant 300 ms */
async function settle(p, max = 12000) {
    await p.evaluate(async max => {
        const t0 = performance.now();
        await new Promise(res => {
            let last = performance.now();
            const mo = new MutationObserver(() => { last = performance.now(); });
            mo.observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden', 'open']});
            const tick = () => {
                const busy = (window.__sqFetches || 0) > 0 || document.querySelector('#workspace .loading-screen, #workspace .ui-spinner, [aria-busy="true"]');
                if ((!busy && performance.now() - last > 300) || performance.now() - t0 > max) { mo.disconnect(); res(); } else setTimeout(tick, 50);
            };
            setTimeout(tick, 50);
        });
    }, max);
}
const trackFetches = `(() => { if (window.__sqTrack) return; window.__sqTrack = 1; window.__sqFetches = 0; const f = window.fetch; window.fetch = function (...a) { window.__sqFetches++; return f.apply(this, a).finally(() => { window.__sqFetches--; }); }; })();`;

async function newPage(browser, base, {width = 1440, dark = false} = {}) {
    const ctx = await browser.newContext({viewport: {width, height: width > 500 ? 900 : 844}});
    await ctx.addInitScript(trackFetches);
    await ctx.addInitScript(dark => { try {
        localStorage.setItem('genealogie-premier-vu', '1'); localStorage.setItem('genealogie-veille-deces', '1');
        ['suivi', 'animaux', 'fiches', 'adn', 'tresors', 'documents', 'catalogue', 'paniers', 'comparaison', 'diagrammes', 'donnees'].forEach(k => localStorage.setItem('genealogie-menu-' + k, '1'));
        if (dark) { const cur = JSON.parse(localStorage.getItem('genealogie-design') || '{}'); localStorage.setItem('genealogie-design', JSON.stringify({...cur, preset: 'dark'})); }
    } catch (_) {} }, dark);
    await ctx.route(u => !u.toString().startsWith(base), rt => rt.abort());
    const p = await ctx.newPage();
    p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('dialog', d => d.dismiss().catch(() => {}));
    await p.goto(base + '#dashboard');
    await p.waitForFunction(() => window.LCNDA_APP?.state?.csrf && window.LCNDA_APP.defaultMaintenanceTabs, null, {timeout: 60000});
    if (dark) await p.evaluate(() => window.LCNDA_APP.applyDesign?.());
    await settle(p);
    return p;
}

const clean = p => p.evaluate(() => {
    document.querySelectorAll('.ui-actmenu, .cx-qi').forEach(x => x.remove());
    document.querySelectorAll('dialog[open]').forEach(d => { d.dataset.ownClose = '1'; delete d.dataset.dirty; try { d.close(); } catch (_) {} });
    document.querySelectorAll('.toast, .ui-toast').forEach(x => x.remove());
    document.querySelectorAll('[data-squash]').forEach(x => x.removeAttribute('data-squash'));
});
const setMod = (p, m, st = {}) => p.evaluate(async ([m, st]) => { const A = window.LCNDA_APP; Object.assign(A.state, st); await A.setModule(m); }, [m, st]);
const wait = (p, sel, timeout = 20000) => p.waitForSelector(sel, {timeout, state: 'attached'}).catch(() => {});
const post = (p, a, b) => p.evaluate(async ([x, y]) => { const r = await window.LCNDA_APP.api(x, {}, {method: 'POST', body: y}); return r?.result ?? r; }, [a, b]);

/* la liste de données FABRIQUÉE (moteur des listes) : des batailles autour de Tulle, chacune avec sa fiche ↗ */
const registerList = p => p.evaluate(() => {
    const E = window.LCNDA_EXT; if ((E.dataLists || []).some(d => d.id === 'sq_batailles')) return;
    const rows = [
        {nom: 'Bataille du Pont de Tulle, pendant la retraite', annee: 1814, lieu: 'Tulle', morts: 120, lat: 45.27, lon: 1.77, u: 'https://example.org/bataille/1'},
        {nom: 'Combat de Naves', annee: 1832, lieu: 'Naves', morts: 12, lat: 45.31, lon: 1.77, u: 'https://example.org/bataille/2'},
        {nom: 'Escarmouche de Treignac au gué du moulin', annee: 1795, lieu: 'Treignac', morts: 3, lat: 45.54, lon: 1.80, u: 'https://example.org/bataille/3'},
        {nom: 'Siège de Chamberet', annee: 1870, lieu: 'Chamberet', morts: 40, lat: 45.58, lon: 1.72, u: ''},
        {nom: 'Bataille d’Eymoutiers', annee: 1850, lieu: 'Eymoutiers', morts: 70, lat: 45.74, lon: 1.74, u: 'https://example.org/bataille/5'}];
    (E.dataLists = E.dataLists || []).push({id: 'sq_batailles', icon: '⚔️', label: 'Batailles inventées du plateau', group: 'Le monde', theme: 'guerres', source: 'Jeu d’essai (CC0)', sourceUrl: 'https://example.org/',
        fields: [{key: 'nom', label: 'Bataille'}, {key: 'annee', label: 'Année', type: 'year'}, {key: 'lieu', label: 'Lieu', type: 'place'}, {key: 'morts', label: 'Morts', type: 'number'}, {key: 'u', label: 'Fiche', type: 'url'}],
        load: async () => rows, period: r => [r.annee, r.annee], geo: r => [r.lat, r.lon], familyColumn: true});
});

/* une fois par base : ce que l'écran crée par l'API (panier, dépouillement, fiche avec bloc 📊, tableau, recherches enregistrées) */
async function prepare(p, ID) {
    const r = {};
    const w = (op, b) => post(p, 'cx_write', {op, ...b});
    const f = await w('folder_new', {name: 'Famille MAZAUD', basket_name: 'Témoins du mariage de Treignac'});
    r.basket = f.basket_id;
    await w('basket_add', {basket_id: f.basket_id, items: [{kind: 'datum', title: 'Date du mariage à Chamberet', value: '8 février 1810'}, {kind: 'row', title: 'Escarmouche de Treignac au gué du moulin, 1795', value: 'liste « Batailles inventées du plateau »', origin: {kind: 'list', label: 'Jeu d’essai', url: 'https://example.org/'}}, {kind: 'person', id: ID.start, title: 'Le de cujus'}]});
    await w('basket_add', {items: [{kind: 'datum', title: 'Naissance de Jeanne LACOMBE', value: '12 mars 1938 à Tulle'}]}).catch(() => {});
    r.digest = (await post(p, 'save_archive_digest', {city_name: 'Treignac', place_id: 1, record_type: 'autre', status: 'todo', year_text: '1780-1800', archive_service: 'AD Corrèze', archive_reference: '3 E 271/2', notes: 'Registres paroissiaux parcourus vue par vue, sans les tables décennales', searched: 'MAZAUD, LACOMBE', found: 'Trois baptêmes MAZAUD'}).catch(e => ({error: e.message})))?.id;
    const sheet = await post(p, 'save_topic_sheet', {title: 'Tulle', icon: '🏘️', subtitle: 'La ville et ses batailles', blocks: [
        {type: 'text', title: 'En bref', text: 'Tulle, préfecture de la Corrèze, où la famille MAZAUD s’installe vers 1850.', width: '12'},
        {id: 'b_sq1', type: 'data', title: 'Les batailles autour', mode: 'live', list: 'sq_batailles', near: '', limit: 10, view: 'table', width: '12'}]});
    r.sheet = sheet?.id;
    const b = await post(p, 'save_board', {title: 'Tableau d’enquête MAZAUD', data: {items: []}}).catch(() => ({}));
    r.board = b?.id;
    for (const [name, criteria] of [['Les MAZAUD', {last_name: 'MAZAUD'}], ['Les LACOMBE', {last_name: 'LACOMBE'}]]) await post(p, 'save_saved_search', {name, criteria}).catch(() => {});
    return r;
}

/* ═════════ Les écrans : [nom, aller(p) → la partie à vérifier] ═════════ */
function screens(ID, R) {
    const S = [];
    const add = (name, fn) => S.push([name, fn]);
    const mod = (m, st, sel) => async p => { await clean(p); await setMod(p, m, st || {}); if (sel) await wait(p, sel); await settle(p); return '#workspace'; };
    const research = (kind, st, sel) => async p => { await clean(p); await p.evaluate(([k, st]) => { const S = window.LCNDA_APP.state; S.researchKind = k; S.archiveDigestAdding = false; for (const [key, v] of Object.entries(st)) S[key] = v && typeof v === 'object' && !Array.isArray(v) ? {...(S[key] || {}), ...v} : v; S.researchDisplay = 'cards'; }, [kind, st || {}]); await setMod(p, 'recherche'); if (sel) await wait(p, sel); await settle(p); return '#workspace'; };
    add('Tableau de bord', mod('dashboard'));
    // la fiche de la personne de départ : chaque section, puis tout (sources repliables, bloc de données, ⚰️ Décès possible)
    for (const s of ['', 'identite', 'famille', 'vie', 'documents', 'tout']) add(`Fiche personne ${s || '(départ)'}`, async p => { await clean(p); await p.evaluate(h => { location.hash = h; }, `#personnes/${ID.start}${s ? '/' + s : ''}`); await wait(p, '.person-page h2'); await settle(p); return '#workspace'; });
    add('Fiche personne (⚰️ Décès possible)', async p => { await clean(p); await p.evaluate(h => { location.hash = h; }, `#personnes/${ID.jeanne}/tout`); await wait(p, '.person-page h2'); await settle(p); return '#workspace'; });
    add('Fiche personne (sources ouvertes)', async p => { await clean(p); await p.evaluate(h => { location.hash = h; }, `#personnes/${ID.start}/tout`); await wait(p, '.person-page h2'); await settle(p);
        await p.evaluate(() => document.querySelectorAll('#workspace [aria-expanded="false"].src-toggle, #workspace .source-item [aria-expanded="false"]').forEach(b => b.click())); await settle(p); return '#workspace'; });
    add('Personnes (liste)', mod('personnes', {currentPersonId: 0}));
    // Listes : natives, données (tableau, cartes, carte, ☑)
    add('Listes (accueil)', mod('listes', {listType: ''}));
    for (const k of ['persons', 'events', 'places', 'sources', 'media', 'occupations', 'sosa']) add(`Listes → ${k}`, mod('listes', {listType: k}));
    const ldList = view => async p => { await clean(p); await registerList(p); await setMod(p, 'listes', {listType: 'data_sq_batailles'}); await wait(p, '[data-ld-page]'); await settle(p);
        if (view === 'pick') { const b = await p.$('#workspace [data-ld-pickmode], #workspace [data-lc-toggle], #workspace [data-ld-select]'); if (b) { await b.click().catch(() => {}); await settle(p); } }
        else if (view) { const b = await p.$(`#workspace [data-ld-view="${view}"]`); if (b) { await b.click().catch(() => {}); await settle(p); } }
        return '#workspace'; };
    add('Listes de données (tableau)', ldList(''));
    add('Listes de données (cartes)', ldList('cards'));
    add('Listes de données (carte)', ldList('map'));
    add('Listes de données (☑ choix multiple)', ldList('pick'));
    // Données
    add('Données (récap)', async p => { await clean(p); await registerList(p); await p.evaluate(() => { const H = window.LCNDA_EXT.dataHome?._st; if (H) { H.view = 'recap'; H.q = ''; H.res = null; } }); await setMod(p, 'listes', {listType: 'donnees'}); await settle(p); return '#workspace'; });
    add('Données (thèmes)', async p => { await clean(p); await registerList(p); await p.evaluate(() => { const H = window.LCNDA_EXT.dataHome?._st; if (H) { H.view = 'themes'; H.q = ''; H.res = null; } }); await setMod(p, 'listes', {listType: 'donnees'}); await settle(p); return '#workspace'; });
    add('Données (onglet)', mod('donnees'));
    // Recherche : chaque sorte, avec des résultats
    const PROX = {proximitySearch: {placeId: 1, placeName: 'Treignac', dateMode: 'range', yearFrom: 1760, yearTo: 1900, radiusKm: 20}};
    add('Recherche → proximité', research('proximity', PROX, '#workspace .date-results'));
    add('Recherche → dates', research('dates', {dateSearch: {mode: 'range', yearFrom: 1760, yearTo: 1900, values: '', valueTo: '', eventTypeId: 0, placeId: 0, placeName: '', occupationId: '', dateWindowMode: 'exact', dateWindowDays: ''}, research: {q: '', category: 'all'}}, '#workspace .date-results'));
    add('Recherche → texte', research('text', {research: {q: 'MAZAUD', category: 'all'}}, '#workspace .research-person-card, #workspace .search-results'));
    add('Recherche → lieu joker', research('place_name', {placeNameSearch: {q: 'T*', country: '', division: ''}, research: {q: 'T*', category: 'all'}}));
    add('Recherche → multicritère', research('saved'));
    add('Recherche → question', research('question', {hQuestion: 'Qui est né à Treignac ?'}));
    add('Recherche → que manque-t-il', research('gaps'));
    add('Recherche → où chercher', research('ou_chercher'));
    add('Recherche → murs de brique', research('murs'));
    add('Recherche → dépouillements', research('archive_digest', {archiveDigestSearch: {q: '', city: '', placeId: 0, placeName: '', radiusKm: 0, dept: '', region: '', recordType: '', status: ''}}));
    add('Recherche → transcriptions', research('transcriptions', {transcriptionSearch: {q: 'MAZAUD', scope: 'all'}}));
    add('Recherche → INSEE', research('insee', {inseeSearch: {nom: 'LACOMBE', prenom: '', sexe: '', dateNaissance: '', dateDeces: '', birthYearFrom: '', birthYearTo: '', deathYearFrom: '', deathYearTo: '', communeNaissance: '', communeDeces: '', departement: '', region: ''}}));
    add('Recherche → SocFace', research('socface'));
    add('Recherche → journal', research('journal'));
    add('Recherche → parenté', async p => { await research('kinship', {currentPersonId: ID.start})(p); const f = await p.$('[data-rp-kin-form]'); if (f) { await p.selectOption('[data-rp-kin-form] [name=relation]', 'ancestors').catch(() => {}); await p.click('[data-rp-kin-form] button[type=submit]').catch(() => {}); await wait(p, '[data-rp-kin-out] [data-rp-pick]', 10000); await settle(p); } return '#workspace'; });
    add('Recherche → comparer', async p => { await research('compare')(p); const opts = await p.$$eval('[data-rp-cmp-form] [name=a] option', o => o.map(x => x.value).filter(Boolean)).catch(() => []);
        if (opts.length >= 2) { await p.selectOption('[data-rp-cmp-form] [name=a]', opts[0]); await p.selectOption('[data-rp-cmp-form] [name=b]', opts[1]); await p.click('[data-rp-cmp-form] button[type=submit]'); await settle(p); } return '#workspace'; });
    add('Recherche → sources', async p => { await research('sources')(p); if (await p.$('[data-rp-src-form]')) { await p.fill('[data-rp-src-form] [name=q]', 'folio'); await p.click('[data-rp-src-form] button[type=submit]'); await wait(p, '.rp-cit-table', 10000); await settle(p); } return '#workspace'; });
    add('Recherche → remplacer', research('replace'));
    // Enquêtes
    add('Enquêtes (liste)', mod('enquetes', {enquetesTab: 'enquetes', currentInvestigationId: 0, investigationFolderId: 0}));
    add('Enquêtes (détail, pistes)', mod('enquetes', {enquetesTab: 'enquetes', currentInvestigationId: 1, investigationFolderId: 0}, '#workspace .investigation-detail'));
    add('Enquêtes (pistes en colonnes)', async p => { await mod('enquetes', {enquetesTab: 'enquetes', currentInvestigationId: 1, investigationFolderId: 0}, '#workspace .investigation-detail')(p); const b = await p.$('[data-enq-pview="columns"]'); if (b) { await b.click(); await settle(p); } return '#workspace'; });
    add('Enquêtes (battues)', mod('enquetes', {enquetesTab: 'battue', currentInvestigationId: 0}));
    add('Enquêtes → Atelier', mod('enquetes', {enquetesTab: 'atelier', currentInvestigationId: 0}));
    add('Enquêtes → Tableaux', mod('enquetes', {enquetesTab: 'tableaux', currentInvestigationId: 0}));
    add('Tableau ouvert', async p => { await clean(p); if (R.board) { await p.evaluate(id => window.LCNDA_EXT.openBoardById?.(id), R.board); await wait(p, '[data-bd-add]'); } await settle(p); return '#workspace'; });
    add('« Ajouter au tableau »', async p => { await clean(p); if (!R.board) return null; await p.evaluate(id => window.LCNDA_EXT.openBoardById?.(id), R.board); await wait(p, '[data-bd-add]'); await settle(p); await p.click('[data-bd-add]').catch(() => {}); await wait(p, 'dialog[open] .h-bd-add', 10000); await settle(p); return 'dialog[open]'; });
    // Fiches
    add('Fiches (avec un bloc 📊 Données)', async p => { await clean(p); await registerList(p); await setMod(p, 'fiches', {ficheId: R.sheet || 0}); await wait(p, '#workspace .h-fi-grid'); await settle(p); return '#workspace'; });
    add('Fiches (liste)', mod('fiches', {ficheId: 0}));
    // Graphiques, Diagrammes, Carte, Documents
    add('Graphiques', mod('graphiques'));
    add('Diagrammes', mod('diagrammes'));
    add('Carte', mod('carte'));
    add('Carte (fiche d’un point)', async p => { await mod('carte')(p); const ok = await p.evaluate(() => { const g = [...document.querySelectorAll('#workspace .h-map-point, #workspace .map-point, #workspace .h-map-cluster')].find(x => x.getBoundingClientRect().width > 0); if (!g) return false; g.dispatchEvent(new MouseEvent('click', {bubbles: true})); return true; }); if (ok) await settle(p); return '#workspace'; });
    add('Documents', mod('documents'));
    // Réglages
    for (const tab of ['look_theme', 'design', 'donnees_plus', 'raccourcis', 'export', 'import', 'my_lists', 'mises_a_jour']) add(`Réglages → ${tab}`, mod('maintenance', {maintenanceTab: tab}));
    add('Contrôle de la base', mod('maintenance', {maintenanceTab: 'controle'}));
    add('Veille des décès', mod('maintenance', {maintenanceTab: 'veille_deces'}, '[data-vd-page]'));
    add('Comparaison', mod('comparaison'));
    add('Trésors', mod('tresors'));
    add('Paniers', async p => { await clean(p); await p.evaluate(id => { try { localStorage.setItem('genealogie-paniers-ouvert', JSON.stringify({t: 'b', id})); } catch (_) {} }, R.basket); await setMod(p, 'paniers'); await wait(p, '[data-pn] .pn-it'); await settle(p); return '#workspace'; });
    add('Pistes (Suivi)', mod('suivi'));
    add('Ma semaine', async p => { await mod('dashboard')(p); return '#workspace'; });
    // les fenêtres
    add('« Prendre depuis… »', async p => { await clean(p); await p.evaluate(() => window.LCNDA_EXT.connexions?.openTake({tab: 'event'})); await wait(p, 'dialog.cx-take [data-cx-res] .cx-rlist li, dialog.cx-take .cx-empty'); await settle(p); return 'dialog[open]'; });
    add('« Prendre depuis… » (De l’extérieur)', async p => { await clean(p); await p.evaluate(() => window.LCNDA_EXT.connexions?.openTake({tab: 'outside'})); await wait(p, 'dialog.cx-take .cx-card'); await settle(p); return 'dialog[open]'; });
    add('« Mettre dans… »', async p => { await clean(p); await p.evaluate(() => window.LCNDA_EXT.connexions?.putInto([{kind: 'datum', title: 'Naissance — date', value: '12 mars 1938'}])); await wait(p, 'dialog.cx-put .cx-dest'); await settle(p); return 'dialog[open]'; });
    add('🧺 Le panier en grand', async p => { await clean(p); await p.evaluate(() => window.LCNDA_EXT.connexions?.openBasketView()); await wait(p, 'dialog.cx-bview .cx-put-body'); await settle(p); return 'dialog[open]'; });
    return S;
}

/* toutes les entrées de la colonne de gauche d'un onglet (chasse large) */
async function sideEntries(p, m) {
    await clean(p); await setMod(p, m); await settle(p);
    return p.$$eval('#sidebar-content [data-side-value]', l => [...new Set(l.map(x => x.dataset.sideValue))]);
}

async function shoot(p, hit, file) {
    await p.evaluate(m => { const el = document.querySelector(`[data-squash="${m}"]`); if (el) { el.scrollIntoView({block: 'center', inline: 'center'}); el.style.outline = '3px solid red'; el.style.outlineOffset = '1px'; } }, hit.mark);
    await p.screenshot({path: file}).catch(() => {});
    await p.evaluate(m => { const el = document.querySelector(`[data-squash="${m}"]`); if (el) { el.style.outline = ''; el.style.outlineOffset = ''; } }, hit.mark);
}

module.exports = {squash, start, newPage, settle, screens, prepare};

/* ═════════ Le test ═════════ */
if (require.main === module) (async () => {
    let fails = 0;
    const t = async (name, fn) => { try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 30).join('\n  ')); } };
    const B = await start();
    const t0 = Date.now();
    try {
        await t('le détecteur voit un texte écrasé, un enfant de grille dans une colonne étroite et un mot par ligne (témoin du 26/11)', async () => {
            const p = await newPage(B.browser, B.base);
            const found = await p.evaluate(src => {
                const box = document.createElement('div'); box.id = 'sq-temoin'; box.style.cssText = 'width:600px;margin:20px';
                // le bug : grille 42 px | 1fr, une case devant → le texte tombe dans la colonne de 42 px
                box.innerHTML = '<article style="display:grid;grid-template-columns:42px 1fr;gap:8px"><input type="checkbox"><span style="width:42px;height:42px;background:#ccc"></span><div>Jean MAZAUD né à Treignac le 12 mars 1785, meunier</div></article>'
                    + '<div style="display:flex"><span style="width:60px">Registres paroissiaux de Treignac</span><span style="flex:1">x</span></div>'
                    + '<p style="width:30px;overflow-wrap:anywhere">Chamberet-Treignac</p>';
                document.querySelector('#workspace').prepend(box);
                const r = (0, eval)('(' + src + ')')({root: '#sq-temoin'}); box.remove(); return r;
            }, squash.toString());
            assert.ok(found.some(f => f.kind === 'colonne étroite' && /Jean MAZAUD/.test(f.text)), JSON.stringify(found));
            assert.ok(found.some(f => f.kind === 'écrasé' && /Registres paroissiaux/.test(f.text)), JSON.stringify(found));
            assert.ok(found.some(f => f.kind === 'mot par ligne' && /Chamberet/.test(f.text)), JSON.stringify(found));
            await p.context().close();
        });
        let R = null;
        { const p = await newPage(B.browser, B.base); await registerList(p); R = await prepare(p, B.ID); await p.context().close(); }
        const list = screens(B.ID, R).filter(([n]) => !ONLY || ONLY.test(n));
        const variants = [[1440, false], [390, false], [1440, true], [390, true]];
        const report = [];
        for (const [w, dark] of variants) {
            const p = await newPage(B.browser, B.base, {width: w, dark});
            const tag = `${w} px${dark ? ', sombre' : ''}`;
            // en sombre, un écran sur deux (la mise en page ne dépend pas des couleurs ; le temps reste raisonnable)
            const mine = dark && !ALL ? list.filter((_, i) => i % 2 === (w > 500 ? 0 : 1)) : list;
            const extra = [];
            if (ALL && !dark) for (const m of ['listes', 'graphiques', 'carte', 'enquetes', 'maintenance', 'recherche', 'fiches', 'diagrammes']) {
                for (const v of await sideEntries(p, m)) extra.push([`${m} / ${v}`, async p => { await clean(p); await setMod(p, m); await settle(p); await p.evaluate(v => { const el = [...document.querySelectorAll('#sidebar-content [data-side-value]')].find(x => x.dataset.sideValue === v); el?.click(); }, v); await settle(p); return '#workspace'; }]);
            }
            for (const [name, fn] of [...mine, ...extra]) {
                await t(`${name} — ${tag} : rien d’écrasé`, async () => {
                    let sel; try { sel = await fn(p); } catch (e) { sel = '#workspace'; }
                    if (!sel) return;
                    const hits = await p.evaluate(([src, rs]) => (0, eval)('(' + src + ')')({root: rs}), [squash.toString(), sel]).catch(e => [{kind: 'erreur', sel: String(e.message).slice(0, 200), why: '', text: ''}]);
                    const lines = [];
                    for (const h of hits.slice(0, 6)) {
                        const file = path.join(SHOTS, `${name}_${w}${dark ? 'd' : 'c'}_${h.mark || 'x'}`.replace(/[^\w.-]+/g, '_') + '.png');
                        if (h.mark) await shoot(p, h, file);
                        lines.push(`${h.kind} — ${h.sel} — ${h.why} — « ${h.text} » — ${file}`);
                        report.push(`[${name} · ${tag}] ${lines.at(-1)}`);
                    }
                    assert.deepStrictEqual(lines, []);
                });
            }
            await t(`${tag} : aucune erreur JavaScript`, async () => assert.deepStrictEqual(p.errs.filter(e => !/ResizeObserver/.test(e)), []));
            await p.context().close();
        }
        if (report.length) console.log('\nTrouvailles :\n' + report.join('\n'));
    } finally { await B.stop(); }
    console.log(`(${Math.round((Date.now() - t0) / 1000)} s ; captures : ${SHOTS})`);
    console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
