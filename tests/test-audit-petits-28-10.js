'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Audit « usage réel » du 28/10 (petits problèmes) :   node tests/test-audit-petits-28-10.js
 *  1. réglage changé puis rechargement tout de suite : envoyé dès « beforeunload », et la page suivante ne le recouvre pas ;
 *  2. date impossible (« 31 février 1900 ») : l'événement s'enregistre, le message le dit (« ⚠️ … est impossible ») ;
 *  3. fusion de deux fiches qui ont chacune leurs parents : cadre ⚠️ jaune dans « ⚖️ Comparer » (compare_people → parent_families) ;
 *  4. tailles bornées : étiquette, lieu (picker_place_adopt, lieu d'un événement), source, média (phrase claire) ;
 *  5. généalogie neuve vide : my_lists, diagrams, scan_inbox_status, parish_map répondent 200 (pas de 500) ;
 *  6. mode consultation : « ＋ Nouveau dépouillement » et « ＋ Un animal » cachés ;
 *  7. petits écarts : ⠿ et K1 dans « Ranger les outils », « ⤒ Importer » des médias, signets en data-shortcut (K12),
 *     « Racine (n°1)… » et « Aucune personne racine » plus collés (liste d'Aboville).
 * Navigateur (Playwright ; sinon sauté) à 1440 px, 390 px et en sombre, sans erreur JavaScript.
 * Captures : SHOTS=dossier node tests/test-audit-petits-28-10.js
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-audit2810-'));
const envFor = d => ({ ...process.env, GENEALOGY_DATA_DIR: d, GENEALOGY_MEDIA_DIR: path.join(d, 'media'), GENEALOGY_SKIP_REFERENCE: '1' });
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const read = f => fs.readFileSync(path.join(appRoot, f), 'utf8');

const dirA = path.join(tmp, 'a'), dirEmpty = path.join(tmp, 'vide');
fs.mkdirSync(path.join(dirA, 'media'), { recursive: true }); fs.mkdirSync(path.join(dirEmpty, 'media'), { recursive: true });
{
    const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,is_start) VALUES (1,'Jean','FAURE','male',1),(2,'Jean','FAURE','male',0),(3,'Pierre','FAURE','male',0),(4,'Marie','LACHAUD','female',0),(5,'Paul','FAURE','male',0),(6,'Rose','MAZEL','female',0),(7,'Louis','FAURE','male',0)");
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(1,3,4),(2,5,6)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(1,1),(2,2),(1,7)");
$t = (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='BIRT' LIMIT 1")->fetchColumn();
$pdo->prepare("INSERT INTO events(scope,person_id,event_type_id,date_text,year) VALUES('person',1,?,'3 mai 1850',1850)")->execute([$t]);
$pdo->exec("INSERT INTO sources(id,source_type,title) VALUES(1,'internet','Registre')");
$pdo->exec("INSERT INTO media(id,title,media_type,filename) VALUES(1,'Photo','image','x.jpg')");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env: envFor(dirA), maxBuffer: 1 << 26 });
    if (r.status !== 0 || !String(r.stdout).includes('ok')) { console.error(r.stderr || r.stdout); process.exit(1); }
}

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
    const get = async (action, q = {}) => { const r = await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, { headers: { Cookie: cookie } }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
    const post = async (action, body) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ ...body, csrf }) }); const j = await r.json().catch(() => ({})); return { status: r.status, body: j }; };
    return { proc, base, get, post };
};

(async () => {
    /* ─── statique ─── */
    await t('statique : flush dès beforeunload, copie « non reçue » relue au démarrage (1)', async () => {
        const s = read('assets/js/app.js');
        assert.match(s, /addEventListener\('beforeunload',\(\)=>\{if\(timer\|\|Object\.keys\(pending\.set\)\.length\|\|pending\.remove\.size\)flush\(true\);\}\)/);
        assert.match(s, /const UNSENT='genealogie-settings-unsent'/);
        assert.match(s, /'genealogie-bg-photo',UNSENT\]/, 'la clé reste sur cet ordinateur');
    });
    await t('statique : petits écarts (7)', async () => {
        const idx = read('index.php'), et = read('assets/js/heritage-edittools.js'), app = read('assets/js/app.js'), css = read('assets/css/app.css');
        assert.ok(idx.includes('class="button">⤒ Importer</button>'), '« ⤒ Importer » dans la fenêtre des médias');
        assert.ok(!/toast\('Garde au moins un outil\.', 'error'\); return false;/.test(et), 'plus de toast pour un champ');
        assert.ok(et.includes("UI().fail(f.querySelector('[data-list]')"), 'K1');
        assert.ok(!/Ajouter aux signets'\}\$\{keys/.test(app) && app.includes('data-shortcut="${bookmarkShortcut()}"'), 'K12 data-shortcut');
        assert.match(css, /\.sosa-list-root-filter>div>strong,\.sosa-list-root-filter>div>span\{display:block\}/);
        assert.match(read('assets/css/heritage.css'), /body\.is-kiosk \[data-rj-new-digest\],body\.is-kiosk \[data-pet-newfor\]\{display:none !important\}/);
    });

    /* ─── 5. généalogie neuve vide ─── */
    const E = await startServer(dirEmpty);
    try {
        await t('vide : my_lists, diagrams, scan_inbox_status, parish_map → 200, rien dedans (5)', async () => {
            for (const a of ['my_lists', 'diagrams', 'scan_inbox_status', 'parish_map']) {
                const r = await E.get(a); assert.equal(r.status, 200, `${a} : ${r.status} ${JSON.stringify(r.body)}`); assert.equal(r.body.ready, false, a);
            }
            assert.deepEqual((await E.get('my_lists')).body.lists, []);
            assert.deepEqual((await E.get('diagrams')).body.diagrams, []);
        });
    } finally { E.proc.kill(); }

    const A = await startServer(dirA);
    const { get, post } = A;
    try {
        /* ─── 4. tailles ─── */
        const big = 'x'.repeat(5 * 1024 * 1024);
        await t('étiquette de 5 Mo refusée avec une phrase claire, une normale passe (4)', async () => {
            const r = await post('save_label', { name: big, color: '#0066cc' });
            assert.equal(r.status, 422, JSON.stringify(r.body).slice(0, 200));
            assert.match(r.body.error, /^Le nom de l’étiquette contient trop de texte \(5 242 880 caractères\) : 100 au plus\. Raccourcis-le\.$/);
            assert.match((await post('save_label', { name: 'x'.repeat(50000), description: 'ok' })).body.error, /trop de texte/);
            assert.equal((await post('save_label', { name: 'Branche paternelle', color: '#0066cc' })).status, 200);
            assert.match((await post('save_label', { name: 'Autre', description: 'd'.repeat(3000) })).body.error, /La description de l’étiquette/);
        });
        await t('lieu, source, média : bornés (4)', async () => {
            const pl = await post('picker_place_adopt', { name: 'L'.repeat(300) });
            assert.equal(pl.status, 422); assert.match(pl.body.error, /Le nom du lieu contient trop de texte .*200 au plus/);
            assert.equal((await post('picker_place_adopt', { name: 'Naves' })).status, 200);
            const ev = await post('add_event', { person_id: 1, event_type_id: 1, date_text: '1850', place_name: 'P'.repeat(600) });
            assert.equal(ev.status, 422); assert.match(ev.body.error, /Le lieu de l’événement/);
            const so = await post('save_source', { id: 1, title: 'T'.repeat(600) });
            assert.equal(so.status, 422); assert.match(so.body.error, /Le titre de la source contient trop de texte/);
            const so2 = await post('add_web_source', { person_id: 1, title: 'ok', text: 'z'.repeat(300000) });
            assert.equal(so2.status, 422); assert.match(so2.body.error, /Le texte de la source.*Coupe-le, ou range le document complet en média\./);
            assert.equal((await post('save_source', { id: 1, title: 'Registre paroissial' })).status, 200);
            const me = await post('save_media', { media_id: 1, title: 'M'.repeat(600) });
            assert.equal(me.status, 422); assert.match(me.body.error, /Le titre du média/);
            assert.equal((await post('save_media', { media_id: 1, title: 'Photo de mariage' })).status, 200);
        });
        /* ─── 3. parents différents ─── */
        await t('compare_people : familles de parents (3)', async () => {
            const r = await get('compare_people', { a: 1, b: 2 });
            assert.deepEqual(r.body.a.parent_families, [1]); assert.deepEqual(r.body.b.parent_families, [2]);
            const same = await get('compare_people', { a: 1, b: 7 });
            assert.deepEqual(same.body.a.parent_families, same.body.b.parent_families);
        });

        /* ─── le navigateur ─── */
        let pw = null;
        for (const m of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(m); break; } catch (_) {} }
        if (!pw) { console.log('— navigateur : Playwright absent, partie sautée'); return; }
        const browser = await pw.chromium.launch();
        const errors = [];
        const watch = (p, name) => {
            p.on('pageerror', e => errors.push(`${name} : ${e.message}`));
            p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(`${name} : ${m.text()}`); });
            p.on('dialog', d => { if (d.type() !== 'beforeunload') errors.push(`${name} : dialogue natif ${d.message()}`); d.dismiss().catch(() => {}); });
        };
        const shot = async (p, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name), fullPage: false }); };
        const boot = async (p, url = A.base) => { await p.goto(url); await p.waitForFunction(() => window.LCNDA_APP?.state && window.LCNDA_EXT?.openCompare && window.LCNDA_UI?.fail, null, { timeout: 20000 }); };
        const lastToast = p => p.evaluate(() => [...document.querySelectorAll('.ui-toast .ui-toast-text')].map(x => x.textContent).pop() || '');
        try {
            // 5. l'écran d'installation : aucune erreur 500
            await t('vide : l’écran d’installation sans erreur 500 (5)', async () => {
                const E2 = await startServer(dirEmpty);
                try {
                    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); watch(p, 'installation');
                    const bad = []; p.on('response', r => { if (r.status() >= 500) bad.push(`${r.status()} ${r.url()}`); });
                    await p.goto(E2.base); await p.waitForTimeout(2500);
                    assert.deepEqual(bad, []); await shot(p, 'installation-1440.png'); await ctx.close();
                } finally { E2.proc.kill(); }
            });
            for (const [name, vp, dark] of [['1440', { width: 1440, height: 900 }, false], ['390', { width: 390, height: 844 }, false], ['sombre', { width: 1440, height: 900 }, true]]) {
                const ctx = await browser.newContext({ viewport: vp, colorScheme: dark ? 'dark' : 'light' });
                const p = await ctx.newPage(); watch(p, name);
                await boot(p);
                if (dark) { await p.evaluate(() => { const A = window.LCNDA_APP; localStorage.setItem('genealogie-design', JSON.stringify({ ...A.readDesignSettings(), preset: 'dark' })); A.applyDesign(); }); }
                await t(`${name} : ⚖️ Comparer — cadre ⚠️ « parents différents » (3)`, async () => {
                    await p.evaluate(() => window.LCNDA_EXT.openCompare(1, 2));
                    await p.waitForSelector('dialog[open] .h-compare');
                    const txt = await p.$eval('dialog[open]', d => d.querySelector('.ui-notice-warn')?.textContent || '');
                    assert.match(txt, /Les deux fiches ont des parents différents : la fiche fusionnée aura deux familles de parents\. Le Contrôle de la base te le signalera\./);
                    await shot(p, `fusion-avertissement-${name}.png`);
                    await p.evaluate(() => document.querySelector('dialog[open]').close());
                    await p.evaluate(() => window.LCNDA_EXT.openCompare(1, 7)); await p.waitForSelector('dialog[open] .h-compare');
                    assert.equal(await p.$eval('dialog[open]', d => !!d.querySelector('.ui-notice-warn')), false, 'mêmes parents : pas de cadre');
                    await p.evaluate(() => document.querySelector('dialog[open]').close());
                    assert.match(await p.evaluate(() => window.LCNDA_EXT.mergeParentsWarning(1, 2)), /parents différents/);
                });
                await t(`${name} : « ⚙️ Ranger les outils » — poignée ⠿, K1 si tout est décoché (7)`, async () => {
                    await p.evaluate(() => window.LCNDA_EXT.arrangeEditTools());
                    await p.waitForSelector('dialog[open] [data-list] [data-k]'); await p.waitForTimeout(400);
                    assert.ok(await p.$('dialog[open] [data-list] .dnd-grip'), 'poignée ⠿');
                    if (vp.width > 800) assert.equal(await p.$eval('dialog[open] [data-list] [data-up]', b => getComputedStyle(b).display), 'none', 'flèches cachées à la souris');
                    await p.$$eval('dialog[open] [data-list] input[type=checkbox]', xs => xs.forEach(x => { x.checked = false; }));
                    await p.click('dialog[open] .modal-actions button[type=submit], dialog[open] .modal-actions .button:not(.secondary)');
                    await p.waitForTimeout(300);
                    const err = await p.$eval('dialog[open]', d => d.textContent);
                    assert.match(err, /Garde au moins un outil/);
                    assert.ok(await p.$('dialog[open] [aria-invalid="true"]'), 'champ fautif marqué');
                    await shot(p, `ranger-outils-${name}.png`);
                    await p.evaluate(() => document.querySelector('dialog[open]').close());
                });
                await t(`${name} : signets — data-shortcut, pas de touche écrite dans le titre (7)`, async () => {
                    await p.evaluate(() => window.LCNDA_APP.openPersonById(1)); await p.waitForSelector('[data-toggle-bookmark]', { timeout: 15000 });
                    const b = await p.$eval('[data-toggle-bookmark]', x => ({ title: x.title, sc: x.dataset.shortcut }));
                    assert.equal(b.title, 'Ajouter aux signets'); assert.match(b.sc || '', /^(Mod\+D|Ctrl\+D|⌘D)$/);
                });
                if (name === '1440') {
                    await t('fiche : date impossible enregistrée, le message prévient (2)', async () => {
                        await p.click('[data-edit-event]');
                        await p.waitForSelector('#event-dialog[open] [name=date_text]');
                        await p.fill('#event-dialog [name=date_text]', '31 février 1900');
                        await p.waitForTimeout(200);
                        assert.match(await p.$eval('#event-dialog .ui-date-help', x => x.textContent), /impossible/i);
                        await p.click('#event-dialog .modal-actions button[type=submit]:not([value=cancel])');
                        await p.waitForFunction(() => !document.querySelector('#event-dialog[open]'), null, { timeout: 8000 });
                        await p.waitForTimeout(300);
                        assert.equal(await lastToast(p), 'Événement modifié — ⚠️ la date « 31 février 1900 » est impossible, vérifie-la.');
                        await shot(p, 'date-impossible-1440.png');
                        const d = await get('person', { id: 1 });
                        assert.ok(JSON.stringify(d.body).includes('31 février 1900'), 'enregistré');
                    });
                    await t('mode consultation : « ＋ Nouveau dépouillement » et « ＋ Un animal » cachés (6)', async () => {
                        await p.evaluate(() => { document.body.insertAdjacentHTML('beforeend', '<div id="t-k"><button class="button" data-rj-new-digest>＋ Nouveau dépouillement</button><button class="button" data-pet-newfor="1">＋ Un animal</button></div>'); document.body.classList.add('is-kiosk'); });
                        assert.deepEqual(await p.$$eval('#t-k button', bs => bs.map(b => getComputedStyle(b).display)), ['none', 'none']);
                        await p.evaluate(() => { document.body.classList.remove('is-kiosk'); });
                        assert.deepEqual(await p.$$eval('#t-k button', bs => bs.map(b => getComputedStyle(b).display === 'none')), [false, false]);
                        await p.evaluate(() => document.getElementById('t-k').remove());
                    });
                    await t('liste d’Aboville : « Racine (n°1)… » et « Aucune personne racine » sur deux lignes (7)', async () => {
                        await p.evaluate(() => { document.body.insertAdjacentHTML('beforeend', '<div id="t-ab" class="list-gender-filter sosa-list-filters sosa-list-root-filter"><div><strong>Racine (n°1) de cette liste d’Aboville</strong><span>Aucune personne racine définie</span></div></div>'); });
                        const r = await p.$eval('#t-ab', el => { const [a, b] = el.querySelectorAll('strong, span'); return b.getBoundingClientRect().top >= a.getBoundingClientRect().bottom - 1; });
                        assert.ok(r); await p.evaluate(() => document.getElementById('t-ab').remove());
                    });
                    await t('réglage changé puis rechargement tout de suite : gardé (1)', async () => {
                        await p.evaluate(() => localStorage.setItem('genealogie-audit-essai', 'v' + 42));
                        await p.reload(); await p.waitForFunction(() => window.LCNDA_APP?.state, null, { timeout: 20000 });
                        assert.equal(await p.evaluate(() => localStorage.getItem('genealogie-audit-essai')), 'v42');
                        await p.waitForTimeout(1600);
                        const html = await (await fetch(A.base)).text();
                        assert.ok(html.includes('genealogie-audit-essai'), 'arrivé dans la base');
                        assert.equal(await p.evaluate(() => localStorage.getItem('genealogie-settings-unsent')), null, 'copie « non reçue » effacée');
                        // la page suivante ne recouvre pas un réglage « parti en partant » qui n'est pas encore arrivé
                        await p.evaluate(() => { localStorage.setItem('genealogie-settings-unsent', JSON.stringify({ set: { 'genealogie-audit-essai': 'v43' }, remove: [] })); });
                        await p.route('**/api.php?action=save_settings', r => r.abort());
                        await p.evaluate(() => { const proto = Object.getPrototypeOf(localStorage); proto.setItem.call(localStorage, 'genealogie-audit-essai', 'v43'); });
                        await p.unroute('**/api.php?action=save_settings');
                        await p.reload(); await p.waitForFunction(() => window.LCNDA_APP?.state, null, { timeout: 20000 });
                        assert.equal(await p.evaluate(() => localStorage.getItem('genealogie-audit-essai')), 'v43', 'pas recouvert par la base');
                        await p.waitForTimeout(1600);
                        assert.ok((await (await fetch(A.base)).text()).includes('"genealogie-audit-essai":"v43"'), 'renvoyé à la base');
                    });
                }
                await ctx.close();
            }
        } finally { await browser.close(); }
        await t('navigateur : aucune erreur JavaScript', async () => { assert.deepEqual(errors, []); });
    } finally { A.proc.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
    if (failed) { console.error(`\n${failed} échec(s)`); process.exit(1); }
    console.log('\nTout est bon.');
})();
