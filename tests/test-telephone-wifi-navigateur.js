'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📱 Le téléphone par le wifi : le parcours dans un vrai navigateur (Playwright), d'après docs/design/telephone-wifi.html.
 *     node tests/test-telephone-wifi-navigateur.js      (TW_SHOTS=dossier pour garder des captures)
 * Le vrai PHP de l'app (electron/php-server.js) et la porte du wifi (electron/lan-gate.js, adresse de la maison simulée : le
 * navigateur du « téléphone » croit joindre 192.168.1.20, la porte écoute sur 127.0.0.1). La fenêtre de l'ordinateur reçoit
 * le pont de l'app de bureau (window.lcnda.reseau, comme electron/preload.js) branché sur la porte.
 *  1. Ordinateur : Réglages → Données → 🖧 Plusieurs ordinateurs → « ＋ Ajouter un téléphone de terrain » (QR code, /terrain#i=…) ;
 *  2. Téléphone (390 px, page mobile) : « Demander l'accès » (code d'invitation déjà là) → le code à 6 chiffres ;
 *  3. Ordinateur : la fenêtre de demande s'ouvre seule, 📱 Téléphone de terrain proposé, le même code → ✓ Autoriser ;
 *  4. Téléphone : mot de passe de la généalogie → 🖼 Choisir 2 photos, une ligne, « Pour qui ? » → Jean LACOMBE → ⤒ Envoyer ;
 *  5. Ordinateur : 📥 À trier (pastille, deux photos) → « 🔗 Relier à Jean LACOMBE » pour l'une, ⋯ → 🗑 Supprimer l'autre,
 *     « ↶ Annuler » (elle revient) ; aucune erreur JavaScript, pas de défilement de côté sur le téléphone.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs, PhpServer } = require('../electron/php-server');
const { LanGate } = require('../electron/lan-gate');

const appRoot = path.resolve(__dirname, '..');
let failed = 0, passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };
const PW = 'Mazaud-Terrain-2026-secret';
const HOME = { ip: '192.168.1.20', prefix: 24 };
const shots = process.env.TW_SHOTS || '';

(async () => {
    let chromium = null;
    try { ({ chromium } = require('playwright')); } catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (__) { chromium = null; } }
    const phpPath = findPhp([devBundledPhp()]);
    if (!chromium || !phpPath) { console.log('— Playwright ou PHP absent : essai sauté'); process.exit(0); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-tel-nav-'));
    const dataDir = path.join(tmp, 'data'), mediaDir = path.join(tmp, 'media');
    fs.mkdirSync(dataDir, { recursive: true }); fs.mkdirSync(mediaDir, { recursive: true });
    const env = { ...process.env, GENEALOGY_DATA_DIR: dataDir, GENEALOGY_MEDIA_DIR: mediaDir, GENEALOGY_SKIP_REFERENCE: '1' };
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$pdo->exec("INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(1,'Jean','LACOMBE','male','deceased'),(2,'Odette','LACOMBE','female','deceased'),(3,'Marie','LACOMBE','female','living')");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
    if (seed.status !== 0 || !String(seed.stdout).includes('ok')) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const sql = q => JSON.parse(spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `$p=new PDO('sqlite:'.$argv[1]);echo json_encode($p->query($argv[2])->fetchAll(PDO::FETCH_ASSOC));`, path.join(dataDir, 'genealogy.sqlite'), q], { encoding: 'utf8' }).stdout || '[]');
    const photo = (r, g, b) => { const f = path.join(tmp, `p${r}.jpg`); spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `$im=imagecreatetruecolor(320,240); imagefill($im,0,0,imagecolorallocate($im,${r},${g},${b})); imagestring($im,5,20,20,'LACOMBE',imagecolorallocate($im,0,0,0)); imagejpeg($im,$argv[1],88);`, f]); return f; };
    const p1 = photo(180, 120, 60), p2 = photo(60, 120, 180);

    for (const k of Object.keys(env)) process.env[k] = env[k];
    const server = new PhpServer({ phpPath, appRoot, pool: 2, dataDir, mediaDir, sessionDir: path.join(tmp, 'sessions'), logFile: path.join(tmp, 'logs', 'php.log') });
    server.on('error', () => {});
    await server.start();
    const gate = new LanGate({ server, dataDir, appRoot, test: { bind: '127.0.0.1', address: HOME, peer: () => '192.168.1.52' } });
    let browser = null;
    const errors = [];
    try {
        browser = await chromium.launch({ args: [`--host-resolver-rules=MAP 192.168.1.20 127.0.0.1`] });
        // ── l'ordinateur : la fenêtre de l'app, avec le secret de l'app et le pont window.lcnda.reseau ──
        const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { 'x-carnet-secret': server.secret } });
        const listeners = [];
        await desk.exposeBinding('__lanCall', async (_src, cmd, arg) => {
            const id = String((arg && arg.id) || '');
            switch (cmd) {
                case 'status': return gate.status();
                case 'open': return gate.open({ passwordOk: true });
                case 'close': await gate.close('main'); return { ok: true };
                case 'invite': return gate.newInvite();
                case 'accept': return gate.accept(id, arg.kind);
                case 'refuse': return gate.refuse(id);
                case 'remove': return gate.remove(id);
                case 'undo-remove': return gate.undoRemove(id);
                case 'remove-phones': return gate.removeKind('terrain');
                case 'settings': return { ok: true, settings: gate.setSettings(arg || {}) };
                default: return { ok: false };
            }
        });
        await desk.addInitScript(() => {
            const cbs = [];
            window.__lanEvent = e => cbs.forEach(cb => { try { cb(e); } catch (_) {} });
            const call = (c, a = {}) => window.__lanCall(c, a);
            window.lcnda = { reseau: { status: () => call('status'), open: () => call('open'), close: () => call('close'), newInvite: () => call('invite'),
                accept: (id, kind) => call('accept', { id, kind: kind === 'terrain' ? 'terrain' : 'lecture' }), refuse: id => call('refuse', { id }), remove: id => call('remove', { id }),
                undoRemove: id => call('undo-remove', { id }), removePhones: () => call('remove-phones'), setSettings: s => call('settings', s), onEvent: cb => cbs.push(cb) } };
        });
        const page = await desk.newPage();
        page.on('pageerror', e => errors.push('ordinateur : ' + e.message + ' ' + String(e.stack || '').split('\n').slice(1, 3).join(' ')));
        const emit = e => page.evaluate(x => window.__lanEvent && window.__lanEvent(x), e).catch(() => {});
        gate.on('request', r => emit({ type: 'request', ...r })); gate.on('change', () => emit({ type: 'change' })); gate.on('terrain-deposit', d => emit({ type: 'deposit', name: d.name }));
        void listeners;
        const base = `http://127.0.0.1:${server.port}`;
        await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
        // un mot de passe sur la généalogie (réglage conseillé « obligatoire » pour l'ouvrir au réseau)
        await page.evaluate(async pw => { const r = await fetch('api.php?action=glock_set', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.INSTALL_CSRF }, body: JSON.stringify({ password: pw, password2: pw, minutes: 15, ack: 1, csrf: window.INSTALL_CSRF }) }); if (!r.ok) throw new Error(await r.text()); }, PW);
        await page.reload({ waitUntil: 'domcontentloaded' });
        if (await page.locator('[data-glock-screen]').count()) { await page.fill('#glock-pw', PW); await page.click('[data-glock-open]'); await page.waitForLoadState('domcontentloaded'); }
        await page.waitForFunction(() => window.LCNDA_APP && window.LCNDA_EXT && window.LCNDA_EXT.openReseauLocal && window.LCNDA_EXT.aTrier, null, { timeout: 60000 })
            .catch(async e => { console.error(await page.evaluate(() => ({ url: location.href, glock: !!document.querySelector('[data-glock-screen]'), app: !!window.LCNDA_APP, ext: Object.keys(window.LCNDA_EXT || {}).length, rl: !!window.LCNDA_EXT?.openReseauLocal, at: !!window.LCNDA_EXT?.aTrier, body: document.body.innerText.slice(0, 300) }))); console.error(errors); throw e; });
        assert.equal((await gate.open({ passwordOk: true })).ok, true);

        let phoneUrl = '';
        await t('1. ordinateur : 🖧 Plusieurs ordinateurs → « ＋ Ajouter un téléphone de terrain » : le QR code mène à /terrain, le code d’invitation dedans', async () => {
            await page.evaluate(() => window.LCNDA_EXT.openReseauLocal());
            await page.waitForSelector('[data-rl-phone]', { timeout: 30000 });
            await page.click('[data-rl-phone]');
            const box = page.locator('[data-rl-phonebox]');
            assert.equal(await box.isVisible(), true);
            phoneUrl = (await box.locator('code').textContent()).trim();
            assert.match(phoneUrl, new RegExp(`^http://192\\.168\\.1\\.20:${gate.port}/terrain#i=[A-Z0-9]{6}$`));
            assert.equal(await box.locator('svg').count(), 1, 'un QR code');
            assert.ok(await page.locator('[data-rl-tw]').count(), 'les réglages des téléphones de terrain');
            if (shots) await page.screenshot({ path: path.join(shots, 'tel-1-ordinateur.png'), fullPage: true });
        });

        // ── le téléphone : un navigateur à part, vue mobile ──
        const tel = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
        const ph = await tel.newPage();
        ph.on('pageerror', e => errors.push('téléphone : ' + e.message + ' ' + String(e.stack || '').split('\n').slice(1, 3).join(' ')));
        const noSideScroll = () => ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
        let code = '';
        await t('2. téléphone : la page « Demander l’accès » (📱), code d’invitation déjà rempli → le code à 6 chiffres', async () => {
            await ph.goto(phoneUrl, { waitUntil: 'domcontentloaded' });
            await ph.waitForSelector('form.lan-form');
            assert.match(await ph.locator('h1').textContent(), /📱/);
            assert.match(await ph.inputValue('input[name="invite"]'), /^[A-Z0-9]{6}$/);
            await ph.fill('input[name="name"]', 'Téléphone de Marie');
            await ph.click('button[type="submit"]');
            await ph.waitForSelector('.lan-six');
            code = (await ph.locator('.lan-six').textContent()).replace(/\s/g, '');
            assert.match(code, /^\d{6}$/);
            assert.ok(await noSideScroll());
            if (shots) await ph.screenshot({ path: path.join(shots, 'tel-2-code.png') });
        });
        await t('3. ordinateur : la demande s’ouvre seule, 📱 Téléphone de terrain proposé, le même code → ✓ Autoriser', async () => {
            await page.waitForSelector('dialog.rl-dialog[open]', { timeout: 15000 });
            const dl = page.locator('dialog.rl-dialog[open]');
            assert.equal((await dl.locator('.rl-six').textContent()).replace(/\s/g, ''), code, 'le même code des deux côtés');
            assert.equal(await dl.locator('input[data-kind][value="terrain"]').isChecked(), true, 'la sorte proposée : téléphone de terrain');
            assert.match(await dl.locator('[data-kind-help]').textContent(), /ne voit pas l’arbre/);
            if (shots) await page.screenshot({ path: path.join(shots, 'tel-3-demande.png') });
            await dl.locator('[data-yes]').click();
            await page.waitForFunction(() => !document.querySelector('dialog.rl-dialog[open]'));
            const devs = gate.status().devices; assert.equal(devs.length, 1); assert.equal(devs[0].kind, 'terrain'); assert.equal(devs[0].name, 'Téléphone de Marie');
        });
        await t('4. téléphone : mot de passe → 2 photos, une ligne, « Pour qui ? » Jean LACOMBE (liste réduite, sans la vivante) → ⤒ Envoyer', async () => {
            await ph.waitForSelector('input[name="pw"]', { timeout: 20000 });
            assert.match(ph.url(), /\/terrain$/);
            await ph.fill('input[name="pw"]', 'faux-mot-de-passe');
            await ph.click('.tw-form button[type="submit"]');
            await ph.waitForSelector('.tw-msg.is-error');
            await ph.waitForTimeout(1300);
            await ph.fill('input[name="pw"]', PW);
            await ph.click('.tw-form button[type="submit"]');
            await ph.waitForSelector('[data-pick]', { state: 'attached', timeout: 15000 });
            await ph.setInputFiles('[data-pick]', [p1, p2]);
            await ph.waitForSelector('.tw-thumbs img');
            assert.equal(await ph.locator('.tw-thumbs .tw-th').count(), 2);
            await ph.fill('[data-note]', 'Tombe famille LACOMBE, allée 4 <b>x</b>');
            await ph.click('[data-for]');
            await ph.fill('[data-q]', 'lacombe');
            await ph.waitForSelector('[data-it]', { timeout: 10000 });
            await ph.waitForFunction(() => document.querySelectorAll('[data-it]').length >= 2 && [...document.querySelectorAll('[data-it]')].some(b => /Odette/.test(b.textContent)));
            const items = await ph.locator('[data-it]').allTextContents();
            assert.ok(items.some(x => /Jean LACOMBE/.test(x)) && !items.some(x => /Marie/.test(x)), items.join(' | '));
            await ph.locator('[data-it]', { hasText: 'Jean LACOMBE' }).click();
            await ph.click('[data-ok]');
            assert.match(await ph.locator('[data-for]').textContent(), /Jean LACOMBE/);
            assert.ok(await noSideScroll(), 'pas de défilement de côté à 390 px');
            if (shots) await ph.screenshot({ path: path.join(shots, 'tel-4-pret.png'), fullPage: true });
            await ph.click('[data-send]');
            await ph.waitForSelector('.tw-msg.is-ok', { timeout: 30000 });
            assert.match(await ph.locator('.tw-msg.is-ok').textContent(), /2/);
            assert.ok(await ph.locator('[data-undo]').count(), '↶ Annuler sur le téléphone');
            const rows = sql("SELECT note, for_kind, for_id, status, device_name FROM phone_inbox ORDER BY id");
            assert.equal(rows.length, 2); assert.ok(rows.every(r => r.status === 'box' && r.for_id === 1 && r.device_name === 'Téléphone de Marie' && r.note === 'Tombe famille LACOMBE, allée 4 <b>x</b>'));
            if (shots) await ph.screenshot({ path: path.join(shots, 'tel-5-envoye.png'), fullPage: true });
        });
        await t('5. ordinateur : 📥 pastille, 📥 À trier (2 photos, texte posé comme du texte) → « 🔗 Relier à Jean LACOMBE », ⋯ → 🗑 Supprimer, ↶ Annuler', async () => {
            await page.waitForFunction(() => /📥 2/.test(document.querySelector('#tw-pill')?.textContent || ''), null, { timeout: 15000 });
            await page.click('#tw-pill');
            await page.waitForSelector('[data-tw-row]', { timeout: 20000 });
            assert.equal(await page.locator('[data-tw-row]').count(), 2);
            assert.equal(await page.locator('[data-tw-page] b b').count(), 0, 'le <b> du téléphone n’est pas une balise');
            assert.ok((await page.locator('[data-tw-page]').textContent()).includes('<b>x</b>'));
            if (shots) await page.screenshot({ path: path.join(shots, 'tel-6-a-trier.png'), fullPage: true });
            const first = page.locator('[data-tw-row]').first();
            await first.locator('[data-tw-quick]').click();
            await page.waitForFunction(() => document.querySelectorAll('[data-tw-row]').length === 1, null, { timeout: 15000 });
            const linked = sql("SELECT i.status, i.media_id, l.entity_type, l.entity_id, m.description FROM phone_inbox i LEFT JOIN media_links l ON l.media_id=i.media_id LEFT JOIN media m ON m.id=i.media_id WHERE i.status='linked'");
            assert.equal(linked.length, 1); assert.equal(linked[0].entity_type, 'person'); assert.equal(linked[0].entity_id, 1); assert.equal(linked[0].description, 'Tombe famille LACOMBE, allée 4 <b>x</b>');
            assert.equal(fs.readdirSync(mediaDir).filter(f => /^[a-f0-9]{32}\.jpg$/.test(f)).length, 1, 'le fichier est entré dans les médias');
            // l'autre : ⋯ → 🗑 Supprimer
            await page.locator('[data-tw-row] [data-tw-more]').first().click();
            await page.locator('.ui-menu button, [role="menu"] button', { hasText: 'Supprimer' }).last().click();
            await page.waitForFunction(() => document.querySelectorAll('[data-tw-row]').length === 0, null, { timeout: 15000 });
            assert.equal(sql("SELECT count(*) n FROM phone_inbox WHERE status='deleted'")[0].n, 1);
            // ↶ Annuler dans le message
            const undo = page.locator('.toast button, [class*="toast"] button', { hasText: 'Annuler' }).last();
            await undo.click();
            await page.waitForFunction(() => document.querySelectorAll('[data-tw-row]').length === 1, null, { timeout: 15000 });
            assert.equal(sql("SELECT count(*) n FROM phone_inbox WHERE status='box'")[0].n, 1, 'revenue dans la boîte');
            const log = sql("SELECT kind, device FROM access_log WHERE kind IN ('tw_depot','tw_relie') ORDER BY id");
            assert.equal(log.filter(r => r.kind === 'tw_depot' && r.device === 'Téléphone de Marie').length, 2); assert.equal(log.filter(r => r.kind === 'tw_relie').length, 1);
            if (shots) await page.screenshot({ path: path.join(shots, 'tel-7-annule.png'), fullPage: true });
        });
        await t('6. aucune erreur JavaScript, ni sur l’ordinateur ni sur le téléphone', () => { assert.deepEqual(errors, []); });
    } finally {
        if (browser) await browser.close();
        try { await gate.close('quit'); } catch (_) {}
        await server.stop();
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    if (failed) { console.error(`\n${failed} essai(s) en échec, ${passed} réussi(s)`); process.exit(1); }
    console.log(`\nLe parcours du téléphone par le wifi passe dans le navigateur (${passed}).`);
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
