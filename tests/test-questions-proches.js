'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 💬 Questions aux proches (lib/questions_proches.php, assets/js/heritage-questions.js) :   node tests/test-questions-proches.js
 * Un vrai « php -S » sur une base neuve, puis un navigateur (Playwright ; sinon la partie navigateur est sautée) :
 *  1. création d'un questionnaire (contact du Répertoire des vivants, personne, questions dont une photo), liste, états ;
 *  2. le fichier .html envoyé : autonome (aucune ressource extérieure, CSP stricte), photo intégrée, texte échappé ;
 *  3. le cousin le remplit dans son navigateur (fichier ouvert depuis le disque) : gardé au fur et à mesure,
 *     « ⤓ Enregistrer mes réponses » télécharge le .json signé (identifiant + somme de contrôle) ;
 *  4. import (analyse puis import) : témoignage sur la fiche + mémoire familiale, « D'où ça vient » rempli tout seul,
 *     état « répondu », ↶ Annuler ; réponse collée d'un e-mail ;
 *  5. imports piégés refusés : somme de contrôle fausse, questionnaire inconnu, données en plus, fichier trop gros,
 *     types forgés, JSON illisible, sans jeton CSRF ; texte piégé jamais exécuté dans l'app ;
 *  6. l'app : liste, fiche (bloc Témoignages / souvenirs), Répertoire des vivants, import par la fenêtre commune, sans erreur JS.
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-questions-'));
const dir = path.join(tmp, 'data');
fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
{
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Marie','Borie','female'),('Jean','Borie','male')");
$p->exec("INSERT INTO living_contacts(first_name,last_name,relationship,email,person_id) VALUES('Anne','Martin','cousine','anne@example.org',2)");
if (function_exists('imagecreatetruecolor')) { $im = imagecreatetruecolor(1600, 1000); imagefill($im, 0, 0, imagecolorallocate($im, 90, 120, 200)); imagejpeg($im, MEDIA_DIR . '/photo.jpg', 85); }
else { file_put_contents(MEDIA_DIR . '/photo.jpg', base64_decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=')); }
$p->exec("INSERT INTO media(title, filename, media_type) VALUES('Le mariage','photo.jpg','image')");
$p = null; require 'lib/bootstrap.php'; db(); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
}
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const XSS = '<img src=x onerror="window.__qpx=1">';

(async () => {
    const port = await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const page0 = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(page0.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const get = async (action, q = '') => { const r = await fetch(`${base}api.php?action=${action}${q ? '&' + q : ''}`, { headers: { Cookie: cookie } }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
    const post = async (body, token = csrf) => { const r = await fetch(base + 'api.php?action=qp_write', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ ...body, csrf: token }) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
    const out = {};
    const checks = [];
    let browser = null;
    try {
        /* ── 1. création ── */
        out.templates = await get('qp_templates');
        out.contactPicker = await get('picker_search', 'kind=contact&q=ann');
        out.save = await post({ op: 'save', title: `Souvenirs ${XSS}`, intro: 'Coucou\n<script>alert(1)</script>', recipient: '1', person_id: 1,
            questions: [{ text: 'Que te rappelles-tu de [Prénom] ?', kind: 'person', theme: 'personne' }, { text: 'Ta recette préférée ?', theme: 'recettes' }, { text: 'Qui est sur cette photo ?', kind: 'photo', media_id: 1 }, { text: '  ' }, { text: 'x', kind: '../evil', media_id: 999, person_id: 999 }] });
        const q = out.save.body.questionnaire;
        out.noTitle = await post({ op: 'save', title: '  ', questions: [] });
        out.badContact = await post({ op: 'save', title: 'X', recipient: '999' });
        out.tooMany = await post({ op: 'save', title: 'X', questions: Array.from({ length: 61 }, () => ({ text: 'a' })) });
        out.list1 = await get('qp_list');
        /* ── 2. le fichier ── */
        out.file = await post({ op: 'render', id: q.id, mode: 'file' });
        out.print = await post({ op: 'preview', id: q.id, title: q.title, questions: q.questions, mode: 'print' });
        const html = out.file.body.html || '';
        fs.writeFileSync(path.join(tmp, 'questionnaire.html'), html);
        checks.push(['création : contact choisi, [Prénom] remplacé, questions vides et sortes forgées remises d’aplomb', () => {
            assert.equal(out.templates.body.themes.length, 9); assert.ok(out.templates.body.themes.some(t => t.key === 'photos' && t.questions[0].kind === 'photo'));
            assert.equal(out.contactPicker.body.groups[0].items[0].title, 'Anne MARTIN');
            assert.equal(out.save.status, 200); assert.equal(q.greeting, 'Anne'); assert.equal(q.status, 'prepared'); assert.equal(q.questions.length, 4);
            assert.equal(q.questions[0].shown, 'Que te rappelles-tu de Marie ?'); assert.equal(q.questions[2].media.id, 1);
            assert.equal(q.questions[3].kind, 'text'); assert.equal(q.questions[3].media_id, 0); assert.equal(q.questions[3].person_id, 0);
            assert.match(q.uid, /^[a-f0-9]{32}$/); assert.match(q.email, /^Bonjour Anne,/);
            assert.equal(out.noTitle.status, 422); assert.equal(out.badContact.status, 422); assert.equal(out.tooMany.status, 422);
            assert.equal(out.list1.body.questionnaires.length, 1); assert.equal(out.list1.body.counts.prepared, 1);
        }]);
        checks.push(['fichier .html autonome : CSP stricte, aucune ressource extérieure, photo intégrée, texte échappé', () => {
            assert.equal(out.file.status, 200); assert.match(out.file.body.filename, /^questionnaire-souvenirs.*\.html$/);
            assert.ok(html.startsWith('<!doctype html>')); assert.match(html, /Content-Security-Policy" content="default-src 'none'; img-src data:/);
            assert.doesNotMatch(html, /<(script|img|link|iframe)[^>]+(src|href)="(https?:|\/\/)/i); assert.doesNotMatch(html, /<link /i);
            assert.match(html, /<img src="data:image\/jpeg;base64,/); assert.equal(out.file.body.photos, 1);
            assert.ok(!html.includes(XSS)); assert.ok(html.includes('&lt;img src=x onerror=')); assert.ok(!html.includes('<script>alert(1)'));
            assert.match(html, /Bonjour Anne,/); assert.match(html, /Que te rappelles-tu de Marie \?/);
            assert.match(html, /id="qp-data" type="application\/json">\{[^<]*\\u003Cimg/); // JSON intégré sans « < »
            assert.doesNotMatch(out.print.body.html, /<script/); assert.match(out.print.body.html, /qp-lines/);
        }]);
        /* ── 3. le cousin, dans son navigateur ── */
        let answers = null;
        if (chromium) {
            browser = await chromium.launch();
            const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 390, height: 844 } });
            const p = await ctx.newPage(); const cerr = [];
            p.on('pageerror', e => cerr.push(e.message)); p.on('console', m => { if (m.type() === 'error') cerr.push(m.text()); });
            p.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) cerr.push('requête ' + r.url()); });
            await p.goto('file://' + path.join(tmp, 'questionnaire.html'));
            const tas = await p.$$('textarea[data-q]');
            await tas[0].fill(`Elle chantait. ${XSS}`); await tas[1].fill('La tarte aux pommes.'); await tas[2].fill('Le mariage de Lucie.');
            await p.waitForTimeout(700);
            const kept = await p.textContent('#qp-state');
            await p.reload(); await p.waitForTimeout(200);
            const back = await p.$eval('textarea[data-q]', t => t.value);
            const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#qp-save')]);
            const jp = path.join(tmp, 'reponses.json'); await dl.saveAs(jp);
            answers = fs.readFileSync(jp, 'utf8');
            const big = await p.evaluate(() => document.querySelector('.qp-btn').getBoundingClientRect().height);
            const hs = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
            out.cousin = { kept, back, name: dl.suggestedFilename(), cerr, big, hs };
            await ctx.close();
            checks.push(['le cousin : réponses gardées dans son navigateur, gros boutons, fichier .json signé téléchargé, aucune requête', () => {
                assert.match(out.cousin.kept, /Gardé sur cet ordinateur/); assert.ok(out.cousin.back.startsWith('Elle chantait'));
                assert.match(out.cousin.name, /^reponses-souvenirs.*\.json$/); assert.ok(out.cousin.big >= 56); assert.equal(out.cousin.hs, false);
                const j = JSON.parse(answers); assert.equal(j.format, 'lcnda-reponses'); assert.equal(j.questionnaire, q.uid); assert.equal(j.checksum, out.file.body.checksum); assert.equal(j.answers.length, 3); assert.equal(j.from, 'Anne Martin');
                assert.deepEqual(out.cousin.cerr, []);
            }]);
        } else {
            console.log('— Playwright absent : partie navigateur sautée (réponses fabriquées)');
            answers = JSON.stringify({ format: 'lcnda-reponses', version: 1, questionnaire: q.uid, checksum: out.file.body.checksum, title: q.title, from: 'Anne Martin', saved_at: new Date().toISOString(),
                answers: [{ id: q.questions[0].id, question: '', answer: `Elle chantait. ${XSS}` }, { id: q.questions[1].id, question: '', answer: 'La tarte aux pommes.' }, { id: q.questions[2].id, question: '', answer: 'Le mariage de Lucie.' }], sum: '0' });
        }
        /* ── 4. import ── */
        out.analyze = await post({ op: 'analyze', file: answers });
        const a = out.analyze.body.answers || [];
        const choices = a.map(x => x.id === q.questions[0].id ? { id: x.id, dest: 'testimony', person_id: 1 } : x.id === q.questions[1].id ? { id: x.id, dest: 'memory', kind: 'recipe' } : { id: x.id, dest: 'memory', kind: 'story' });
        out.noPerson = await post({ op: 'import', file: answers, choices: [{ id: q.questions[0].id, dest: 'testimony', person_id: 0 }] });
        out.import = await post({ op: 'import', file: answers, choices });
        out.person = await get('person', 'id=1');
        out.after = await get('qp_get', `id=${q.id}`);
        out.undo = await post({ op: 'undo_import', id: q.id });
        out.personUndo = await get('person', 'id=1');
        out.afterUndo = await get('qp_get', `id=${q.id}`);
        out.import2 = await post({ op: 'import', file: answers, choices });
        out.paste = await post({ op: 'import', paste: { questionnaire_id: q.id, from: 'Anne', date: '2026-09-01', answers: [{ id: 'free', answer: 'Et aussi : la maison avait un puits.' }] }, choices: [{ id: 'free', dest: 'memory', kind: 'story' }] });
        out.status = await post({ op: 'status', id: q.id, status: 'filed' });
        checks.push(['import : témoignage sur la fiche, recette en mémoire familiale, « D’où ça vient » rempli tout seul, ↶ Annuler', () => {
            assert.equal(out.analyze.status, 200); assert.equal(a.length, 3); assert.equal(a[0].suggest.dest, 'testimony'); assert.equal(a[1].suggest.dest, 'memory'); assert.equal(a[1].suggest.kind, 'recipe');
            assert.equal(out.noPerson.status, 422);
            assert.equal(out.import.status, 200); assert.deepEqual(out.import.body.counts, { testimony: 1, memory: 2, skip: 0 });
            const mems = out.person.body.family_memories; const t = mems.find(m => m.kind === 'testimony');
            assert.ok(t); assert.equal(t.title, 'Que te rappelles-tu de Marie ?'); assert.ok(t.content.includes(XSS)); // gardé en texte, échappé à l'affichage
            assert.match(t.origin_text, /^Anne Martin, réponse au questionnaire « Souvenirs .* », le \d{1,2}(er)? \w+ 20\d\d$/u);
            assert.ok(t.people.some(l => l.role === 'about' && Number(l.person.id) === 1)); assert.ok(t.people.some(l => l.role === 'transmitted' && Number(l.person.id) === 2));
            assert.equal(out.after.body.questionnaire.status, 'answered'); assert.equal(out.after.body.questionnaire.memories.length, 3);
            assert.equal(out.undo.body.removed, 3); assert.equal(out.personUndo.body.family_memories.length, 0); assert.equal(out.afterUndo.body.questionnaire.status, 'prepared');
            assert.equal(out.import2.status, 200); assert.equal(out.paste.status, 200); assert.equal(out.status.body.questionnaire.status, 'filed');
        }]);
        /* ── 5. imports piégés ── */
        const j = JSON.parse(answers);
        const bad = async (o, raw = null) => (await post({ op: 'analyze', file: raw ?? JSON.stringify(o) })).status;
        out.traps = {
            checksum: await bad({ ...j, checksum: 'a'.repeat(32) }),
            unknown: await bad({ ...j, questionnaire: 'b'.repeat(32) }),
            uid: await bad({ ...j, questionnaire: '../../etc' }),
            extra: await bad({ ...j, evil: '<script>' }),
            extraAnswer: await bad({ ...j, answers: [{ ...j.answers[0], html: '<b>' }] }),
            arrayAnswer: await bad({ ...j, answers: [{ id: j.answers[0].id, answer: ['x'] }] }),
            answersObj: await bad({ ...j, answers: { a: 1 } }),
            fromObj: await bad({ ...j, from: { x: 1 } }),
            version: await bad({ ...j, version: 2 }),
            format: await bad({ ...j, format: 'autre' }),
            list: await bad([j]),
            notJson: await bad(null, '{pas du json'),
            huge: await bad(null, JSON.stringify({ ...j, answers: [{ id: j.answers[0].id, answer: 'x'.repeat(700 * 1024) }] })),
            noFile: (await post({ op: 'analyze', file: { a: 1 } })).status,
            badOp: (await post({ op: 'drop' })).status,
            noCsrf: (await post({ op: 'analyze', file: answers }, 'faux')).status,
        };
        out.memCount = (await get('family_memories')).body.memories.length;
        out.longAnswer = await post({ op: 'analyze', file: JSON.stringify({ ...j, answers: [{ id: j.answers[0].id, answer: 'é'.repeat(30000) }] }) });
        checks.push(['imports piégés refusés (somme de contrôle, questionnaire inconnu, données en plus, types forgés, trop gros, sans jeton)', () => {
            for (const [k, v] of Object.entries(out.traps)) assert.ok(k === 'noCsrf' ? v === 419 : v === 422, `${k} → ${v}`);
            assert.equal(out.memCount, 4); // 3 réponses + 1 collée : rien d'autre n'est entré
            assert.equal(out.longAnswer.status, 200); assert.equal(out.longAnswer.body.answers[0].answer.length, 20000);
        }]);
        /* ── 6. l'app ── */
        if (chromium) {
            const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 950 } });
            const p = await ctx.newPage(); const errs = [];
            p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|tile|ERR_/.test(m.text())) errs.push(m.text()); });
            await p.goto(base, { waitUntil: 'load' });
            await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_QUESTIONS);
            await p.evaluate(() => window.LCNDA_QUESTIONS.openListPage());
            await p.waitForSelector('[data-qp-open]');
            const listText = await p.textContent('.qp-list');
            // nouveau questionnaire depuis la fiche, réponses importées par la fenêtre commune
            await p.evaluate(() => window.LCNDA_APP.openPersonById(1));
            await p.waitForSelector('[data-qp-ask-person]');
            const ask = await p.textContent('[data-qp-ask-person]');
            const told = await p.$$eval('.memory-testimony', l => l.length);
            await p.click('[data-qp-ask-person]');
            await p.waitForSelector('.qp-grid [data-qp-qs] .qp-qrow');
            const rows = await p.$$eval('.qp-qrow', l => l.length);
            await p.click('[data-qp-recipient] .pk-input'); await p.keyboard.type('Ann'); await p.waitForSelector('[data-qp-recipient] .pk-row'); await p.keyboard.press('Enter');
            await p.click('[data-qp-rm]'); // ↶ Annuler proposé
            const afterRm = await p.$$eval('.qp-qrow', l => l.length);
            await p.click('[data-qp-save]');
            await p.waitForSelector('[data-qp-file]');
            await p.waitForFunction(() => /Bonjour Anne/.test(document.querySelector('[data-qp-frame]')?.srcdoc || ''), null, { timeout: 8000 });
            const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-qp-file]')]);
            const h2 = path.join(tmp, 'q2.html'); await dl.saveAs(h2);
            const c = await ctx.newPage(); await c.goto('file://' + h2); await (await c.$('textarea[data-q]')).fill(`Elle riait fort. ${XSS}`);
            const [dl2] = await Promise.all([c.waitForEvent('download'), c.click('#qp-save')]); const j2 = path.join(tmp, 'r2.json'); await dl2.saveAs(j2); await c.close();
            await p.click('[data-qp-import]');
            await p.setInputFiles('.k-import input[type=file]', j2);
            await p.waitForSelector('.k-import .qp-imp');
            const dest = await p.$eval('.k-import [data-qp-dest]', s => s.value);
            await p.click('.k-import [data-k-go]');
            await p.waitForSelector('.qp-mems li', { timeout: 8000 });
            const undoBtn = await p.$$eval('#toast-region button, .toast button', l => l.map(b => b.textContent).join('|'));
            await p.evaluate(() => window.LCNDA_APP.openPersonById(1));
            await p.waitForSelector('.memory-testimony');
            const shown = await p.$$eval('.memory-testimony', l => l.map(x => x.textContent).join('|'));
            const xss = await p.evaluate(() => window.__qpx || 0);
            // Répertoire des vivants : la case « Questionnaires » et le bouton
            await p.evaluate(() => { const A = window.LCNDA_APP; A.state.listType = 'living_contacts'; A.setModule('listes'); });
            await p.waitForSelector('[data-qp-contact-list]');
            const cell = await p.textContent('[data-qp-contact-list]');
            const hasBtn = !!(await p.$('[data-qp-new-contact]'));
            out.app = { listText, ask, told, rows, afterRm, dest, undoBtn, shown, xss, cell, hasBtn, errs };
            checks.push(['l’app : liste, « 💬 Poser des questions sur elle », aperçu, ↶ Annuler, import par la fenêtre commune, fiche, répertoire, sans erreur', () => {
                const A = out.app;
                assert.match(A.listText, /Rangé/i); assert.match(A.ask, /Poser des questions sur elle/); assert.equal(A.told, 1);
                assert.equal(A.rows, 4); assert.equal(A.afterRm, 3); assert.equal(A.dest, 'testimony'); assert.match(A.undoBtn, /Annuler/);
                assert.match(A.shown, /Elle riait fort/); assert.match(A.shown, /<img src=x onerror/); assert.equal(A.xss, 0);
                assert.equal(A.cell, '2 questionnaires'); assert.ok(A.hasBtn); assert.deepEqual(A.errs, []);
            }]);
            await ctx.close();
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
