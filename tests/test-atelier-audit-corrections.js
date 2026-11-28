#!/usr/bin/env node
/* 📜 Atelier de transcription : les corrections de l'audit du 25/11/2026 (scratchpad audit-atelier.md).
 * Chaque 🔴 bug est d'abord reproduit (l'essai échouait avant la correction), puis vérifié corrigé :
 *  1. ce qu'on tape pendant un enregistrement reste (et part au prochain enregistrement) ;
 *  2. une zone supprimée (sans rien taper) : la page demande avant de se fermer ; après « Enregistrer », plus rien à demander ;
 *  3. « Ajouter à la généalogie » : une fiche du même nom n'est pas créée en double par défaut ; « Jean, fils de Pierre MAZAUD » → Jean MAZAUD ;
 *  4. Entrée à la fin du texte : la nouvelle ligne n'entre pas dans la zone de la ligne d'avant ;
 *  5. un document de 3 pages : le texte tapé va dans le morceau de la page affichée (et un repère « — page 2 — » ne s'efface pas) ;
 *  6. mode sombre : la barre de l'image n'est pas blanche, « Cadres » se lit ;
 *  7. « Mieux voir » : la description de la recette choisie se lit ;
 *  8. deux ouvertures rapprochées : un seul Atelier, « Ouverture… » tout de suite ;
 *  9. la lecture approfondie lancée depuis le menu : la colonne de gauche s'appelle « ✍ Ton texte actuel » ;
 * 10. deux onglets sur le même acte : le second enregistrement est prévenu (conflit), « Recharger » garde son texte dans 🕘 Versions.
 * Et : 12 (enregistrement automatique, brouillon local), 16 (⌘Z dans le texte = l'historique de l'Atelier), 20 (mots qui diffèrent),
 * 21, 22, 26, 27, 31 (limites), 32 (versions des actes supprimés), 34 (liste traduite).
 *   node tests/test-atelier-audit-corrections.js
 * Personnes et lieux fictifs. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const http = require('http');
const {spawn, spawnSync} = require('child_process');
let chromium; try { ({chromium} = require('playwright')); } catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const root = path.join(__dirname, '..');
const {findPhp, phpRuntimeArgs, devBundledPhp} = require('../electron/php-server.js');

let fails = 0;
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const t = async (name, fn) => { if (ONLY && !ONLY.test(name)) return; try { await fn(); console.log('✓ ' + name); } catch (e) { fails++; console.log('✗ ' + name + '\n  ' + String(e && e.stack || e).split('\n').slice(0, 14).join('\n  ')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const LINES = ['L’an mil sept cent quatre vingt dix, le vingt trois', 'mars, a été baptisé Jean, né d’hier, fils légitime', 'de Pierre MAZAUD, laboureur, et de Marie LACOMBE,', 'son épouse, de cette paroisse de Saint Martin.', 'Le parrain a été Jean DURAND, la marraine', 'Anne MAZAUD, qui ont déclaré ne savoir signer.'];
const BODY = LINES.join('\n');
let at0 = 0; const ZONES = LINES.map((l, i) => { const z = {id: 'z' + (i + 1), x: 40, y: 40 + i * 70, w: 520, h: 50, s: at0, e: at0 + l.length}; at0 += l.length + 1; return z; });
const DEEP = ['L’an mil sept cent quatre vingt dix, le vingt trois', 'mars, a été baptisé Jean, né d’hier, fils légitime', 'de Pierre MAZAUD, laboureur, et de Marie LACOMBE,', 'son épouse, de cette paroise de Saint Martin.', 'Le parain a été Jean DURAND, la marraine', 'Anne MAZAUD, qui ont déclaré ne savoir signer.'];

(async () => {
    const phpPath = findPhp([devBundledPhp()]) || 'php';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcnda-atelier-audit-'));
    fs.mkdirSync(path.join(tmp, 'media'));
    const env = {...process.env, GENEALOGY_DATA_DIR: tmp, GENEALOGY_MEDIA_DIR: path.join(tmp, 'media'), GENEALOGY_SKIP_REFERENCE: '1', PHP_CLI_SERVER_WORKERS: '4'};
    const php = (code, extra = {}) => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code], {cwd: root, encoding: 'utf8', env: {...env, ...extra}});
    const seed = php(String.raw`
require 'lib/paths.php';
$p0 = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p0->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p0 = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status,is_start) VALUES(1,'Jean','MAZAUD','male','deceased',1),(2,'Pierre','MAZAUD','male','deceased',0),(3,'Marie','LACOMBE','female','deceased',0)");
function page($f,$n,$col){ $im = imagecreatetruecolor(600,500); imagefill($im,0,0,imagecolorallocate($im,$col[0],$col[1],$col[2])); $ink=imagecolorallocate($im,60,45,30);
 for($l=0;$l<$n;$l++) for($x=50;$x<550;$x+=9) imagefilledrectangle($im,$x,30+$l*70,$x+5,60+$l*70,$ink); imagepng($im, MEDIA_DIR.'/'.$f); imagedestroy($im); }
page('acte.png',6,[230,215,180]); page('acte2.png',6,[226,216,186]); page('acte3.png',6,[222,214,190]); page('p1.png',6,[220,226,200]); page('p2.png',6,[214,214,232]); page('p3.png',6,[236,206,206]);
$m = $pdo->prepare("INSERT INTO media(id,title,filename,thumbnail,media_type) VALUES(?,?,?,?,'image')");
foreach ([[1,'Baptême','acte.png'],[2,'Baptême bis','acte2.png'],[3,'Baptême ter','acte3.png'],[4,'Contrat f1','p1.png'],[5,'Contrat f2','p2.png'],[6,'Contrat f3','p3.png']] as $r) $m->execute([$r[0],$r[1],$r[2],$r[2]]);
act_transcriptions_ensure($pdo);
$a = $pdo->prepare("INSERT INTO act_transcriptions(id,title,kind,media_id,body,data_json,updated_at) VALUES(?,?,?,?,?,?,?)");
foreach ([1,2,3] as $i) $a->execute([$i, "Baptême de Jean MAZAUD ($i)", 'bapteme', $i, getenv('TX_BODY'), getenv('TX_DATA'), '2026-01-0'.$i.' 10:00:00']);
$a->execute([4, 'Acte vide sans image', 'apreciser', null, '', '{}', '2026-01-04 10:00:00']);
echo json_encode(['ok' => 1]);`, {TX_BODY: BODY, TX_DATA: JSON.stringify({zones: ZONES, people: [], status: 'doing'})});
    if (seed.status !== 0 || !/"ok"/.test(seed.stdout)) { console.error(seed.stderr || seed.stdout); process.exit(1); }

    // un faux Ollama (lecture approfondie) : les deux modèles conseillés déjà téléchargés
    const fake = http.createServer((req, res) => { let body = ''; req.on('data', c => { body += c; }); req.on('end', async () => {
        if (req.url === '/api/version') return void res.end(JSON.stringify({version: '0.12.0'}));
        if (req.url === '/api/tags') return void res.end(JSON.stringify({models: ['qwen3-vl:8b-instruct', 'qwen3-vl:4b-instruct'].map(name => ({name, size: 1}))}));
        if (req.url === '/api/chat') { res.setHeader('Content-Type', 'application/x-ndjson'); for (const l of DEEP) res.write(JSON.stringify({message: {role: 'assistant', content: l + '\n'}, done: false}) + '\n');
            return void res.end(JSON.stringify({message: {role: 'assistant', content: ''}, done: true}) + '\n'); }
        res.statusCode = 404; res.end('{}'); }); });
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const oport = await freePort(); await new Promise(r => fake.listen(oport, '127.0.0.1', r));
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'router.php')], {cwd: root, env: {...env, LCNDA_OLLAMA_URL: `http://127.0.0.1:${oport}`}, stdio: 'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await sleep(100); } }
    const browser = await chromium.launch();
    const errs = [];
    try {
        const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
        const newPage = async () => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept().catch(() => {}));
            await pg.goto(base); await pg.waitForFunction(() => window.LCNDA_EXT?.openActTranscriber && window.LCNDA_EXT?.txView && window.LCNDA_APP?.state?.bootstrap, null, {timeout: 30000}); return pg; };
        const p = await newPage();
        const D = 'dialog.h-tx-dlg';
        const ev = (f, a) => p.evaluate(f, a);
        const closeAll = async (pg = p) => { await pg.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => { d.dataset.dirty = ''; try { d.close(); } catch (_) {} if (d.classList.contains('h-tx-dlg') || d.classList.contains('modal')) d.remove(); }); document.querySelectorAll('.ui-toast').forEach(x => x.remove()); document.querySelectorAll('[data-tx-opening]').forEach(x => x.remove()); }); await sleep(150); };
        const openTx = async (o, pg = p) => { await closeAll(pg); await pg.evaluate(o => window.LCNDA_EXT.openActTranscriber(o), o); await pg.waitForSelector(`${D} [data-tx-body]`, {timeout: 15000}); await sleep(900); };
        const body = (pg = p) => pg.evaluate(() => document.querySelector('dialog.h-tx-dlg [data-tx-body]').value);
        const api = (action, q = {}) => p.evaluate(([a, q]) => window.LCNDA_APP.api(a, q), [action, q]);
        const post = (action, b) => p.evaluate(([a, b]) => window.LCNDA_APP.api(a, {}, {method: 'POST', body: b}), [action, b]);
        const caretEnd = (pg = p) => pg.evaluate(() => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.focus(); a.setSelectionRange(a.value.length, a.value.length); });
        const toastText = (re, pg = p) => pg.evaluate(src => [...document.querySelectorAll('.ui-toast')].map(x => x.textContent).filter(x => new RegExp(src).test(x)).join(' | '), re);
        const lum = c => { const m = String(c).match(/[\d.]+/g).map(Number); const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]); };
        const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
        const bgOf = (sel, pg = p) => pg.evaluate(s => { let el = document.querySelector(s); while (el) { const c = getComputedStyle(el).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; el = el.parentElement; } return 'rgb(255, 255, 255)'; }, sel);

        /* ═════ 🔴 1 ═════ */
        await t('🔴 1. ce qu’on tape pendant l’enregistrement reste dans la case, puis part au serveur', async () => {
            await p.route('**/api.php?action=save_act_transcription', async r => { await sleep(1500); await r.continue(); });
            await openTx({id: 1});
            await caretEnd(); await p.keyboard.type(' A');
            await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="save"]').click()); await sleep(200);
            await p.keyboard.type(' tapé pendant');
            await sleep(2200);
            assert.ok((await body()).endsWith(' A tapé pendant'), 'la frappe reste : ' + JSON.stringify((await body()).slice(-30)));
            assert.equal(await toastText('gardé sous le tien'), '', 'pas de message trompeur');
            await p.unroute('**/api.php?action=save_act_transcription');
            await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="save"]').click()); await sleep(1500);
            const r = await api('act_transcription', {id: 1}); assert.ok(r.body.endsWith(' A tapé pendant'), 'enregistré : ' + r.body.slice(-30));
        });

        /* ═════ 🔴 2 ═════ */
        await t('🔴 2. une zone supprimée sans rien taper : « Quitter la page ? » ; après Enregistrer : plus rien à demander', async () => {
            await openTx({id: 2});
            assert.equal(await ev(() => document.querySelector('dialog.h-tx-dlg').dataset.dirty || ''), '', 'rien de changé à l’ouverture');
            await p.locator(`${D} rect[data-tx-zone="z2"]`).click(); await sleep(200);
            await p.keyboard.press('Delete'); await sleep(200);
            assert.equal(await ev(() => document.querySelectorAll('dialog.h-tx-dlg rect[data-tx-zone="z2"]').length), 0, 'zone supprimée');
            assert.equal(await ev(() => !!document.querySelector('dialog[open][data-dirty="1"]:not(#lightbox)')), true, 'la fermeture de la page demande');
            await p.keyboard.press('Control+s'); await sleep(1200);
            assert.equal(await ev(() => document.querySelector('dialog.h-tx-dlg').dataset.dirty || ''), '', 'enregistré : plus rien à demander');
            const r = await api('act_transcription', {id: 2}); assert.ok(!r.data.zones.some(z => z.id === 'z2'));
        });

        /* ═════ 🔴 3 ═════ */
        await t('🔴 3. « Ajouter à la généalogie » : pas de « ＋ Créer » par défaut pour un nom déjà dans la base ; Jean → Jean MAZAUD', async () => {
            await openTx({id: 3});
            await ev(() => [...document.querySelectorAll('dialog.h-tx-dlg [data-tx-cmd="found"]')][0].click());
            await p.waitForSelector('dialog.h-txa-dlg [data-txa-p]', {timeout: 15000}); await sleep(400);
            const rows = await ev(() => [...document.querySelectorAll('dialog.h-txa-dlg [data-txa-p]')].map(r => ({name: r.querySelector('b').textContent, on: r.querySelector('.h-txa-seg button.is-on')?.dataset.txaAct.split(':')[1] || '', match: r.querySelector('.h-txa-match').textContent})));
            const pierre = rows.find(r => /Pierre MAZAUD/.test(r.name)), marie = rows.find(r => /Marie LACOMBE/.test(r.name)), jean = rows.find(r => /^Jean\b/.test(r.name) && !/DURAND/.test(r.name));
            assert.ok(pierre && marie && jean, JSON.stringify(rows));
            assert.notEqual(pierre.on, 'create', 'Pierre MAZAUD (déjà dans la base) n’est pas « ＋ Créer » par défaut : ' + JSON.stringify(pierre));
            assert.notEqual(marie.on, 'create', 'Marie LACOMBE non plus');
            assert.match(jean.name, /Jean MAZAUD/, 'l’enfant prend le nom de son père');
            assert.match(jean.match, /Jean MAZAUD/, 'la fiche « Jean MAZAUD » est proposée : ' + jean.match);
            const recap = await ev(() => document.querySelector('dialog.h-txa-dlg [data-txa-recap]').textContent);
            assert.ok(!/3 fiches créées/.test(recap), recap);
            // tant que ce n'est pas tranché, le bouton ✓ Ajouter ne crée rien
            const sub = await ev(() => { const b = document.querySelector('dialog.h-txa-dlg .modal-actions [type="submit"]'); return {dis: b.disabled, txt: document.querySelector('dialog.h-txa-dlg [data-txa-recap]').textContent}; });
            assert.ok(sub.dis, 'à trancher : ✓ Ajouter grisé');
            assert.match(sub.txt, /à trancher|Relier ou/i);
            // « 🔗 Relier » pour chacun : le bouton revient
            for (const k of await ev(() => [...document.querySelectorAll('dialog.h-txa-dlg [data-txa-p]')].filter(r => r.querySelector('.h-txa-seg button.is-on')?.dataset.txaAct.endsWith(':compare')).map(r => r.dataset.txaP)))
                await ev(k => document.querySelector(`dialog.h-txa-dlg [data-txa-act="${k}:link"]`).click(), k);
            await sleep(150);
            assert.equal(await ev(() => document.querySelector('dialog.h-txa-dlg .modal-actions [type="submit"]').disabled), false);
            await ev(() => { const d = document.querySelector('dialog.h-txa-dlg'); d.close(); d.remove(); });
        });

        /* ═════ 🔴 4 ═════ */
        await t('🔴 4. Entrée puis une ligne à la fin du texte : la nouvelle ligne n’entre pas dans la zone d’avant', async () => {
            await openTx({id: 3});
            await caretEnd(); await p.keyboard.press('Enter'); await p.keyboard.type('Nouvelle ligne');
            await sleep(700);
            const r = await ev(() => { const d = document.querySelector('dialog.h-tx-dlg'), z = d.txApi.get().data.zones.find(q => q.id === 'z6'); return {z, prog: JSON.parse(d.dataset.txProg || '{}')}; });
            assert.equal(r.z.e, BODY.length, 'la zone de la dernière ligne garde sa fin');
            assert.equal(r.prog.linked, 6); assert.equal(r.prog.total, 7);
        });

        /* ═════ 🔴 5 ═════ */
        await t('🔴 5. document de 3 pages : le texte tapé va dans le morceau de la page affichée ; un repère ne s’efface pas', async () => {
            await closeAll();
            await post('media_pages_save', {media_id: 4, pages: [{media_id: 4, label: 'page'}, {media_id: 5, label: 'page'}, {media_id: 6, label: 'page'}]});
            await openTx({mediaId: 4, filename: 'p1.png', title: ''}); await sleep(600);
            const segOf = s => ev(s => { const v = document.querySelector('dialog.h-tx-dlg [data-tx-body]').value; return window.LCNDA_EXT.txPages.segAt(v, v.indexOf(s)); }, s);
            await p.focus(`${D} [data-tx-body]`); await p.keyboard.type('Bonjour');
            assert.equal(await segOf('Bonjour'), 0, 'tapé dans la page 1 : ' + JSON.stringify(await body()));
            // un clic dans le blanc sous le texte : toujours la page affichée
            const box = await p.locator(`${D} [data-tx-body]`).boundingBox();
            await p.mouse.click(box.x + box.width / 2, box.y + box.height - 20); await p.keyboard.type(' Salut');
            assert.equal(await segOf('Salut'), 0, 'clic sous le texte : page 1');
            // page 2 : le curseur va dans son morceau
            await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-page="1"]').click()); await sleep(800);
            await p.focus(`${D} [data-tx-body]`); await p.keyboard.type('Deux');
            assert.equal(await segOf('Deux'), 1, 'page 2 : ' + JSON.stringify(await body()));
            // Retour arrière au début du morceau : le repère « — page 2 — » reste
            const before = await body();
            await ev(() => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'), sg = window.LCNDA_EXT.txPages.segments(a.value)[1]; a.focus(); a.setSelectionRange(sg.s, sg.s); });
            await p.keyboard.press('Backspace'); await sleep(100);
            assert.equal(await body(), before, 'le repère est protégé');
            assert.match(await toastText('repère|page'), /page/);
        });

        /* ═════ 🔴 6 ═════ */
        await t('🔴 6. mode sombre : la barre de l’image n’est pas blanche, « Cadres » se lit', async () => {
            await openTx({id: 1});
            await ev(() => { document.documentElement.dataset.theme = 'dark'; }); await sleep(200);
            const bg = await bgOf(`${D} .h-tx-barwrap`), col = await ev(() => getComputedStyle(document.querySelector('dialog.h-tx-dlg .h-tx-zop')).color);
            assert.notEqual(bg, 'rgb(255, 255, 255)', 'fond blanc en sombre');
            assert.ok(contrast(bg, col) >= 4.5, `« Cadres » peu lisible : ${col} sur ${bg}`);
            await ev(() => { delete document.documentElement.dataset.theme; });
        });

        /* ═════ 🔴 7 ═════ */
        await t('🔴 7. « Mieux voir » : la description de la recette choisie se lit', async () => {
            await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="better"]').click()); await sleep(250);
            await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-recipe]').click()); await sleep(250);
            const sel = `${D} [data-tx-recipe][aria-pressed="true"] small`;
            assert.ok(await p.$(sel), 'une recette choisie');
            const col = await ev(s => getComputedStyle(document.querySelector(s)).color, sel), bg = await bgOf(sel);
            assert.ok(contrast(bg, col) >= 3, `description illisible : ${col} sur ${bg}`);
            await ev(() => { document.documentElement.dataset.theme = "dark"; }); await sleep(150);
            const col2 = await ev(s => getComputedStyle(document.querySelector(s)).color, sel), bg2 = await bgOf(sel);
            await ev(() => { delete document.documentElement.dataset.theme; });
            assert.ok(contrast(bg2, col2) >= 3, `sombre : description illisible : ${col2} sur ${bg2}`)
        });

        /* ═════ 🔴 8 ═════ */
        await t('🔴 8. deux ouvertures rapprochées : un seul Atelier, « Ouverture… » tout de suite', async () => {
            await closeAll();
            const shown = await ev(() => { window.LCNDA_EXT.openActTranscriber({id: 1}); const now = !!document.querySelector('[data-tx-opening]'); window.LCNDA_EXT.openActTranscriber({id: 2}); return now; });
            await sleep(3500);
            assert.equal(await ev(() => document.querySelectorAll('dialog.h-tx-dlg').length), 1, 'un seul Atelier');
            assert.ok(shown, '« Ouverture… » montré tout de suite');
            assert.equal(await ev(() => document.querySelectorAll('[data-tx-opening]').length), 0, 'et retiré ensuite');
        });

        /* ═════ 🔴 9 ═════ */
        await t('🔴 9. lecture approfondie lancée depuis le menu : la colonne de gauche est « ✍ Ton texte actuel »', async () => {
            await openTx({id: 1});
            await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-readpanel] [data-tx-cmd="deep"]').click());
            await p.waitForSelector('dialog [data-txa-read]', {timeout: 15000});
            await ev(() => document.querySelector('dialog [data-txa-read]').click());
            await p.waitForSelector('dialog [data-txa-t="deep"]', {timeout: 20000}); await sleep(300);
            const cols = await ev(() => [...document.querySelectorAll('dialog .h-txa-cmp2 > div > b')].map(b => b.textContent));
            assert.match(cols[0], /Ton texte actuel/, JSON.stringify(cols));
            assert.ok(!cols.some(c => /Écriture à la main/.test(c)), JSON.stringify(cols));
            // 20 : les mots qui diffèrent sont surlignés, un clic prend l'autre mot
            const diffs = await ev(() => [...document.querySelectorAll('dialog [data-txa-wdiff] [data-txa-pick]')].map(b => b.textContent));
            assert.ok(diffs.some(d => /paroisse/.test(d)) && diffs.some(d => /paroise/.test(d)), JSON.stringify(diffs));
            await ev(() => [...document.querySelectorAll('dialog [data-txa-wdiff] [data-txa-pick]')].find(b => /^paroisse/.test(b.textContent.trim())).click()); await sleep(100);
            assert.match(await ev(() => document.querySelector('dialog [data-txa-t="deep"]').value), /de cette paroisse de/);
            // 19 : les réglages techniques repliés, le bouton « Lire » en haut
            assert.ok(await ev(() => { const d = document.querySelector('dialog [data-txa-deep]'); const det = d.querySelector('details.h-txa-settings'); return !!det && !det.open; }), 'réglages repliés');
            await ev(() => { const d = [...document.querySelectorAll('dialog[open]')].find(x => x.querySelector('[data-txa-deep]')); d.close(); d.remove(); });
        });

        /* ═════ 🔴 10 ═════ */
        await t('🔴 10. deux onglets sur le même acte : conflit annoncé, « Recharger » garde mon texte dans 🕘 Versions', async () => {
            await openTx({id: 2});
            const q = await newPage(); await openTx({id: 2}, q);
            await caretEnd(); await p.keyboard.type(' (onglet A)'); await p.keyboard.press('Control+s'); await sleep(1200);
            await caretEnd(q); await q.keyboard.type(' (onglet B)'); await q.keyboard.press('Control+s');
            await q.waitForSelector('dialog.lc-conflict-dialog', {timeout: 8000});
            await q.evaluate(() => document.querySelector('dialog.lc-conflict-dialog [data-cf="reload"]').click()); await sleep(1500);
            const bq = await body(q); assert.ok(bq.includes('(onglet A)') && !bq.includes('(onglet B)'), 'B montre le texte de A : ' + bq.slice(-40));
            const vs = (await api('act_transcription_versions', {act_id: 2})).items || [];
            const mine = []; for (const v of vs) { const x = await api('act_transcription_version', {id: v.id}); if (x.body.includes('(onglet B)')) mine.push(v.label); }
            assert.ok(mine.length, 'le texte de B est gardé dans 🕘 Versions');
            const r = await api('act_transcription', {id: 2}); assert.ok(r.body.includes('(onglet A)') && !r.body.includes('(onglet B)'));
            await q.close();
        });

        /* ═════ 12 ═════ */
        await t('12. enregistrement automatique quelques secondes après la dernière modification', async () => {
            await openTx({id: 3});
            await caretEnd(); await p.keyboard.type(' auto');
            await sleep(6000);
            const r = await api('act_transcription', {id: 3}); assert.ok(r.body.endsWith(' auto'), r.body.slice(-20));
            assert.equal(await ev(() => document.querySelector('dialog.h-tx-dlg').dataset.dirty || ''), '');
        });
        await t('12b. brouillon local : un texte pas enregistré (serveur injoignable) est proposé à la réouverture', async () => {
            await openTx({id: 3});
            await p.route('**/api.php?action=save_act_transcription', r => r.abort());
            await caretEnd(); await p.keyboard.type(' brouillon');
            await sleep(1500);
            assert.ok(await ev(() => { try { return !!localStorage.getItem('genealogie-tx-draft-3'); } catch (_) { return false; } }), 'brouillon gardé');
            await closeAll(); await p.unroute('**/api.php?action=save_act_transcription');
            await openTx({id: 3});
            const btn = await p.waitForSelector('[data-tx-draft="use"]', {timeout: 5000});
            await btn.click(); await sleep(400);
            assert.ok((await body()).endsWith(' brouillon'));
            await p.keyboard.press('Control+s'); await sleep(1200);
            assert.equal(await ev(() => { try { return localStorage.getItem('genealogie-tx-draft-3'); } catch (_) { return 'x'; } }), null, 'brouillon effacé une fois enregistré');
        });

        /* ═════ 16 ═════ */
        await t('16. ⌘Z dans le texte : l’historique de l’Atelier (par mot), les zones reviennent exactement', async () => {
            await openTx({id: 1});
            const z0 = await ev(() => JSON.stringify(document.querySelector('dialog.h-tx-dlg').txApi.get().data.zones));
            await caretEnd(); await p.keyboard.type(' alpha beta'); await sleep(100);
            await p.keyboard.press('Control+z'); await sleep(200);
            const b1 = await body(); assert.ok(/ alpha ?$/.test(b1), 'un mot annulé : ' + JSON.stringify(b1.slice(-20)));
            await p.keyboard.press('Control+z'); await sleep(200);
            assert.equal(await body(), (await api('act_transcription', {id: 1})).body, 'deux pas : le texte d’avant');
            // une zone supprimée puis ⌘Z dans la case : elle revient à l'identique
            await p.locator(`${D} rect[data-tx-zone="z3"]`).click(); await sleep(150); await p.keyboard.press('Delete'); await sleep(150);
            await caretEnd(); await p.keyboard.press('Control+z'); await sleep(200);
            assert.equal(await ev(() => JSON.stringify(document.querySelector('dialog.h-tx-dlg').txApi.get().data.zones)), z0);
            await p.keyboard.press('Control+Shift+z'); await sleep(200);
            assert.equal(await ev(() => document.querySelector('dialog.h-tx-dlg').txApi.get().data.zones.some(z => z.id === 'z3')), false, '⇧⌘Z rétablit');
        });

        /* ═════ 21, 22, 26, 27 ═════ */
        await t('21. un acte sans image : un vrai bouton « 🖼️ Choisir l’image » ; « 🧭 Repérer » sur un texte vide le dit', async () => {
            await ev(() => { window.LCNDA_EXT.pickImage = async () => null; });
            await openTx({id: 4});
            assert.ok(await ev(() => !!document.querySelector('dialog.h-tx-dlg [data-tx-empty] button[data-tx-cmd="image"]')));
            await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="detect"]').click()); await sleep(300);
            assert.match(await toastText('Le texte est vide'), /Le texte est vide/);
        });
        await t('22. une lecture pas installée : un bouton pour l’installer', async () => {
            await openTx({id: 1});
            await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-cmd="htrzone"]')?.click() || document.querySelector('dialog.h-tx-dlg [data-tx-readpanel] [data-tx-cmd="htr"]').click()); await sleep(1500);
            assert.ok(await ev(() => [...document.querySelectorAll('.ui-toast')].some(x => /pas encore installée/.test(x.textContent) && [...x.querySelectorAll('button')].some(b => /Installer/.test(b.textContent)))), 'bouton « Installer » dans le message');
        });
        await t('26. [?] garde le mot choisi (« mot[?] ») ; 27. le raccourci du zoom avant', async () => {
            await openTx({id: 1});
            await ev(() => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.focus(); const i = a.value.indexOf('Pierre'); a.setSelectionRange(i, i + 6); });
            await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-char="[?]"]').click()); await sleep(100);
            assert.match(await body(), /Pierre\[\?\] MAZAUD/);
            await ev(() => { const a = document.querySelector('dialog.h-tx-dlg [data-tx-body]'); a.focus(); const i = a.value.indexOf('LACOMBE'); a.setSelectionRange(i, i + 7); });
            await ev(() => document.querySelector('dialog.h-tx-dlg [data-tx-char="["]').click()); await sleep(100);
            assert.match(await body(), /\[LACOMBE\]/);
            await p.click(`${D} [data-ui-menu="Affichage"]`); await sleep(200);
            const sc = await ev(() => [...document.querySelectorAll('.ui-actmenu .ui-actmenu-i')].find(x => /Zoom avant/.test(x.textContent))?.textContent || '');
            assert.match(sc, /(Ctrl|⌘)\s*\+/, sc);
            await p.keyboard.press('Escape');
        });

        /* ═════ 31, 32 (serveur) ═════ */
        await t('31. au-delà des limites : les zones en trop sont annoncées, un texte trop long est refusé clairement', async () => {
            const many = Array.from({length: 10050}, (_, i) => ({id: 'm' + i, x: 1, y: i, w: 5, h: 1, s: 0, e: 0}));
            const r = await post('save_act_transcription', {id: 0, title: 'Limites', kind: 'autre', media_id: 0, body: 'x', data: {zones: many, people: []}});
            const res = r.result || r; assert.equal(res.dropped?.zones, 50, JSON.stringify(res.dropped));
            const err = await p.evaluate(() => window.LCNDA_APP.api('save_act_transcription', {}, {method: 'POST', body: {id: 0, title: 'Trop long', kind: 'autre', media_id: 0, body: 'x'.repeat(1000001), data: {}}}).then(() => '', e => e.message));
            assert.match(err, /trop long/i);
        });
        await t('32. les versions d’un acte supprimé partent quand « ↶ Annuler » n’est plus possible ; ménage des versions orphelines de plus de 30 jours', async () => {
            const r = php(String.raw`require 'lib/bootstrap.php'; $pdo = db(); act_transcriptions_ensure($pdo);
                $id = save_act_transcription($pdo, ['title' => 'À supprimer', 'kind' => 'autre', 'body' => 'un', 'data' => []])['id'];
                save_act_transcription($pdo, ['id' => $id, 'title' => 'À supprimer', 'kind' => 'autre', 'body' => 'deux', 'data' => []]);
                $n0 = (int) $pdo->query("SELECT count(*) FROM act_transcription_versions WHERE act_id=$id")->fetchColumn();
                delete_act_transcription($pdo, ['id' => $id]);
                $n1 = (int) $pdo->query("SELECT count(*) FROM act_transcription_versions WHERE act_id=$id")->fetchColumn(); // ↶ Annuler encore possible : gardées
                $pdo->exec("UPDATE act_transcription_deleted SET deleted_at=datetime('now','-20 minutes') WHERE act_id=$id");
                $pdo->exec("INSERT INTO act_transcription_versions(act_id,label,body,created_at) VALUES(99901,'vieille','x',datetime('now','-40 days')),(99902,'récente','y',datetime('now','-2 days'))");
                act_versions_cleanup($pdo, true);
                $n2 = (int) $pdo->query("SELECT count(*) FROM act_transcription_versions WHERE act_id=$id")->fetchColumn();
                $old = (int) $pdo->query("SELECT count(*) FROM act_transcription_versions WHERE act_id=99901")->fetchColumn();
                $new = (int) $pdo->query("SELECT count(*) FROM act_transcription_versions WHERE act_id=99902")->fetchColumn();
                echo json_encode([$n0, $n1, $n2, $old, $new]);`);
            assert.equal(r.status, 0, r.stderr + r.stdout);
            assert.deepEqual(JSON.parse(r.stdout.trim().split('\n').pop()), [2, 2, 0, 0, 1]);
        });

        /* ═════ 34 ═════ */
        await t('34. la liste des transcriptions passe par i18n()', async () => {
            const src = fs.readFileSync(path.join(root, 'assets/js/heritage-transcribe-list.js'), 'utf8');
            ['Supprimer cette transcription', 'Chercher… (titre, texte, personne, lieu, cote)', 'Pas encore de texte', 'Les plus récentes'].forEach(s => assert.ok(src.includes(`i18n('${s}`), s));
        });

        await closeAll();
        assert.deepEqual(errs, [], 'erreurs de la page : ' + errs.join(' | '));
    } catch (e) { fails++; console.log('✗ ' + (e.stack || e)); }
    finally { await browser.close(); proc.kill(); fake.close(); fs.rmSync(tmp, {recursive: true, force: true}); }
    console.log(fails ? `${fails} échec(s)` : 'tout est bon'); process.exit(fails ? 1 : 0);
})();
