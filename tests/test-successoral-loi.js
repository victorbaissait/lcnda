'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * ⚖️ « Un doute sur la loi ? » (⚖️ Successions ; navigateur heritage-successoral.js, lawDialog ; adresses et contrôle des liens
 * heritage-successoral-core.js ; serveur lib/successoral.php, op « law_note ») :
 *     node tests/test-successoral-loi.js      (captures : /tmp/claude-0/sp/succ/loi-*.png)
 *  1. le moteur : les deux adresses exactes (accents, espaces, & et # encodés), rien d'autre que le texte tapé, rien si vide ;
 *     les liens officiels acceptés (https:// et hôte exact) ; la ligne du journal échappée, le lien cliquable seulement s'il est officiel ;
 *  2. le serveur : « Noter dans le dossier » (question, lien facultatif), liens refusés (javascript:, http://, autre hôte, hôte
 *     déguisé), question vide, mode consultation fermé ;
 *  3. le navigateur (Playwright) à 1440 px, 390 px et en sombre : bouton de la page et du dossier, boutons désactivés si vide,
 *     Entrée = Service-public, l'adresse ouverte = exactement la question (ni nom ni dossier), « ✍️ Noter » (journal, lien cliquable,
 *     lien refusé), texte piégé jamais exécuté, mode consultation : recherche oui, « Noter » non.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
const S = require('../assets/js/heritage-successoral-core.js');

const appRoot = path.resolve(__dirname, '..');
const UX = process.env.SHOTS || '/tmp/claude-0/sp/succ';
const XSS = '<img src=x onerror=window.__xss=1>';
const SP = 'https://www.service-public.gouv.fr/particuliers/recherche-generale?keyword=';
const LF = q => `https://www.legifrance.gouv.fr/search/code?tab_selection=code&searchField=ALL&query=${q}&page=1&init=true`;
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.error('✗', name, '\n ', e && e.stack || e); } };

(async () => {
    /* ═════ 1. le moteur ═════ */
    await t('adresses exactes : Service-public et Légifrance, accents et espaces encodés, rien d’autre que le texte tapé', () => {
        const q = 'délai pour renoncer à une succession';
        const enc = 'd%C3%A9lai%20pour%20renoncer%20%C3%A0%20une%20succession';
        assert.equal(S.lawSearchUrl('sp', q), SP + enc);
        assert.equal(S.lawSearchUrl('lf', q), LF(enc));
        assert.equal(S.lawSearchUrl('sp', '  un héritier refuse de répondre  '), SP + 'un%20h%C3%A9ritier%20refuse%20de%20r%C3%A9pondre', 'espaces autour retirés');
        assert.equal(S.lawSearchUrl('lf', 'art. 778 & recel #2'), LF('art.%20778%20%26%20recel%20%232'), '& et # encodés : ils ne cassent pas l’adresse');
        assert.equal(S.lawSearchUrl('sp', XSS), SP + encodeURIComponent(XSS));
        assert.equal(S.lawSearchUrl('sp', ''), ''); assert.equal(S.lawSearchUrl('lf', '   '), ''); assert.equal(S.lawSearchUrl('sp', null), '');
        assert.equal(S.lawSearchUrl('google', 'x'), '', 'seulement les deux sites');
        const u = new URL(S.lawSearchUrl('sp', q)); assert.equal(u.searchParams.get('keyword'), q); assert.deepEqual([...u.searchParams.keys()], ['keyword']);
        const l = new URL(S.lawSearchUrl('lf', q)); assert.equal(l.searchParams.get('query'), q); assert.deepEqual([...l.searchParams.keys()], ['tab_selection', 'searchField', 'query', 'page', 'init']);
    });
    await t('liens notés : https:// et hôte exact (Légifrance, Service-public, EUR-Lex), sinon refusés', () => {
        for (const ok of ['https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006430827', 'https://www.service-public.gouv.fr/particuliers/vosdroits/F1199', 'https://www.service-public.fr/particuliers/vosdroits/F1199',
            'https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32012R0650', 'https://www.legifrance.gouv.fr', '  https://www.legifrance.gouv.fr/x#y  ']) assert.ok(S.officialLink(ok), ok);
        for (const no of ['javascript:alert(1)', 'http://www.legifrance.gouv.fr/x', 'https://legifrance.gouv.fr/x', 'https://www.legifrance.gouv.fr.evil.com/x', 'https://www.legifrance.gouv.fr@evil.com/',
            'https://evil.com/?https://www.legifrance.gouv.fr', 'https://www.legifrance.gouv.fr:8443/x', 'https://WWW.LEGIFRANCE.GOUV.FR/x', 'https://www.legifrance.gouv.fr/x"onmouseover="a', 'https://www.legifrance.gouv.fr/<b>',
            'https://www.legifrance.gouv.fr/a b', 'https://www.legifrance.gouv.fr\\@evil.com', 'data:text/html,x', '', 'https://www.legifrance.gouv.fr/' + 'a'.repeat(500)]) assert.equal(S.officialLink(no), '', no);
        assert.deepEqual(S.LAW_HOSTS, ['www.legifrance.gouv.fr', 'www.service-public.gouv.fr', 'www.service-public.fr', 'eur-lex.europa.eu']);
    });
    await t('journal : tout échappé, le lien cliquable (navigateur, sans référent) seulement s’il est officiel', () => {
        const h = S.lawJournalHtml(`Doute sur la loi : « ${XSS} » — https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006430827`);
        assert.ok(!h.includes('<img'), h); assert.match(h, /&lt;img src=x onerror=window.__xss=1&gt;/);
        assert.match(h, /<a class="succ-law" href="https:\/\/www\.legifrance\.gouv\.fr\/codes\/article_lc\/LEGIARTI000006430827" target="_blank" rel="noopener noreferrer" title="https:\/\/www\.legifrance\.gouv\.fr\/codes\/article_lc\/LEGIARTI000006430827">↗ Légifrance<\/a>/); // harmonisation.md (Apparence 3) : « ↗ Nom du site », l’adresse en bulle
        for (const bad of ['javascript:alert(1)', 'https://evil.com/x', 'https://www.legifrance.gouv.fr@evil.com/']) {
            const x = S.lawJournalHtml(`Doute sur la loi : « q » — ${bad}`); assert.ok(!x.includes('<a'), x);
        }
        assert.ok(!S.lawJournalHtml('Doute sur la loi : « https://www.legifrance.gouv.fr/x »').includes('<a'), 'un lien dans la question n’est jamais un lien');
    });

    const phpPath = findPhp([devBundledPhp()]);
    if (!phpPath) { console.log('— PHP absent : partie serveur sautée'); return finish(); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-succ-loi-'));
    const dir = path.join(tmp, 'data');
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    const seed = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql')); $p = null;
require 'lib/bootstrap.php'; $pdo = db();
$ins = $pdo->prepare('INSERT INTO persons(id,first_name,last_name,gender,living_status) VALUES(?,?,?,?,?)');
foreach ([[10,'Marcel','MAZAUD','male','deceased'],[11,'Jeanne','LACOMBE','female','deceased'],[22,'Suzanne','MAZAUD','female','living'],[70,'<img src=x onerror=window.__xss=1>','PIÈGE','female','living']] as $r) { $ins->execute($r); }
$tag = fn($t) => (int) $pdo->query("SELECT id FROM event_types WHERE gedcom_tag='$t' ORDER BY id LIMIT 1")->fetchColumn();
$ev = $pdo->prepare("INSERT INTO events(scope,person_id,family_id,event_type_id,date_text,year) VALUES(?,?,?,?,?,?)");
$ev->execute(['person',10,null,$tag('BIRT'),'1938',1938]); $ev->execute(['person',10,null,$tag('DEAT'),'3 mars 2026',2026]);
$ev->execute(['person',11,null,$tag('DEAT'),'2019',2019]); $ev->execute(['person',22,null,$tag('BIRT'),'1962',1962]); $ev->execute(['person',70,null,$tag('BIRT'),'1965',1965]);
$pdo->exec("INSERT INTO families(id,partner1_id,partner2_id) VALUES(102,10,11)");
$pdo->exec("INSERT INTO family_children(family_id,child_id) VALUES(102,22),(102,70)");
echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
    if (seed.status !== 0 || !String(seed.stdout).includes('ok')) { console.error(seed.stderr || seed.stdout); process.exit(1); }
    const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    const port = Number(process.env.PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    let cookie = '';
    const html = await (await fetch(base).then(r => { cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r; })).text();
    const csrf = JSON.parse(html.match(/window\.INSTALL_CSRF = ("[^"]*")/)[1]);
    const api = async (action, q = {}) => { const r = await fetch(`${base}api.php?action=${action}&${new URLSearchParams(q)}`, { headers: { Cookie: cookie } }); return r.json(); };
    const get = async (op, q = {}) => api('successoral', { op, ...q });
    const post = async (body, action = 'successoral_write', headers = {}) => { const r = await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...headers }, body: JSON.stringify({ ...body, csrf }) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
    const w = async body => { const r = await post(body); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.result; };
    const php = code => spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', `require 'lib/paths.php'; require 'lib/bootstrap.php'; $pdo = db(); ${code}`], { cwd: appRoot, encoding: 'utf8', env });
    const lawLines = async id => (await get('get', { id })).journal.filter(j => j.kind === 'law');
    let A = 0;
    try {
        /* ═════ 2. le serveur ═════ */
        await t('serveur : « Noter dans le dossier » — la question telle quelle, le lien officiel facultatif ; liens refusés ; question vide ; CSRF', async () => {
            A = (await w({ op: 'save', deceased_id: 10, number: '2026-014', notary_text: 'Me ROUSSILHE' })).id;
            const r1 = await w({ op: 'law_note', case_id: A, question: '  délai pour renoncer à une succession  ' });
            assert.equal(r1.entry.text, 'Doute sur la loi : « délai pour renoncer à une succession »'); assert.equal(r1.entry.kind, 'law');
            const r2 = await w({ op: 'law_note', case_id: A, question: XSS, link: 'https://www.service-public.fr/particuliers/vosdroits/F1199' });
            assert.equal(r2.entry.text, `Doute sur la loi : « ${XSS} » — https://www.service-public.fr/particuliers/vosdroits/F1199`, 'gardé tel quel, échappé à l’affichage');
            const before = (await lawLines(A)).length; assert.equal(before, 2);
            for (const bad of ['javascript:alert(1)', 'http://www.legifrance.gouv.fr/x', 'https://evil.com/', 'https://www.legifrance.gouv.fr@evil.com/', 'https://www.legifrance.gouv.fr.evil.com/', 'https://www.legifrance.gouv.fr/x y', 'https://www.legifrance.gouv.fr/"><script>', 'https://www.legifrance.gouv.fr:444/']) {
                const r = await post({ op: 'law_note', case_id: A, question: 'q', link: bad });
                assert.equal(r.status, 422, bad); assert.match(r.body.error, /Lien refusé/);
            }
            assert.equal((await post({ op: 'law_note', case_id: A, question: '   ', link: '' })).status, 422, 'question vide');
            assert.equal((await post({ op: 'law_note', case_id: 99999, question: 'q' })).status, 422, 'dossier inconnu');
            const nocsrf = await fetch(`${base}api.php?action=successoral_write`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'law_note', case_id: A, question: 'q' }) });
            assert.notEqual(nocsrf.status, 200, 'sans jeton CSRF : refusé');
            assert.equal((await lawLines(A)).length, before, 'rien d’écrit par les refus');
            assert.match(php('echo json_encode(SUCC_JOURNAL_KINDS);').stdout, /"law"/);
        });
        await t('serveur : mode consultation — rien ne s’écrit', async () => {
            const act = async (action, body) => (await fetch(`${base}api.php?action=${action}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ ...body, csrf }) })).status;
            assert.equal(await act('kiosk_enter', { password: 'secret1' }), 200);
            try { const k = await post({ op: 'law_note', case_id: A, question: 'q' }); assert.ok([403, 423].includes(k.status), String(k.status)); }
            finally { assert.equal(await act('kiosk_exit', { password: 'secret1' }), 200); }
            assert.equal((await lawLines(A)).length, 2);
        });

        /* ═════ 3. le navigateur ═════ */
        let chromium = null;
        try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (_) { try { ({ chromium } = require('playwright')); } catch (__) { /* sauté */ } }
        if (!chromium) { console.log('— Playwright absent : partie navigateur sautée'); return; }
        // une ligne au journal avec un lien d'un autre site (écrite en base, à côté de l'app) : jamais un lien à l'affichage
        php(`$pdo->prepare("INSERT INTO succ_journal(case_id, at, kind, text) VALUES(?, '2026-01-01 10:00:00', 'law', ?)")->execute([${A}, 'Doute sur la loi : « vieux » — https://evil.example/x']);`);
        const browser = await chromium.launch();
        fs.mkdirSync(UX, { recursive: true });
        const open = async (w0, h0, dark, hash = '#successoral') => {
            await post({ set: dark ? { 'genealogie-design': JSON.stringify({ preset: 'dark' }) } : {}, remove: dark ? [] : ['genealogie-design'] }, 'save_settings');
            const ctx = await browser.newContext({ viewport: { width: w0, height: h0 }, deviceScaleFactor: 1, colorScheme: dark ? 'dark' : 'light' });
            await ctx.addInitScript(dk => { try { if (!sessionStorage.getItem('t-init')) { sessionStorage.setItem('t-init', '1'); if (dk) localStorage.setItem('genealogie-design', JSON.stringify({preset: 'dark'})); localStorage.setItem('genealogie-usage', JSON.stringify({usages: ['genealogie', 'successoral'], start: 'last'})); localStorage.setItem('genealogie-menu-successoral', '1'); localStorage.setItem('lcnda-succ-view', '"cases"'); } } catch (_) {} }, dark);
            // les sites officiels ne sont pas joints pendant l'essai : on regarde seulement l'adresse ouverte
            const opened = [];
            for (const host of ['https://www.service-public.gouv.fr/**', 'https://www.legifrance.gouv.fr/**']) await ctx.route(host, r => { opened.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'text/html', body: '<p>site officiel (essai)</p>' }); });
            const pg = await ctx.newPage(); const errs = [];
            pg.on('pageerror', e => errs.push('pageerror ' + e.message)); pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|tile\.openstreetmap|ERR_|net::/.test(m.text())) errs.push('console ' + m.text()); });
            await pg.goto(base + hash); await pg.waitForFunction(() => window.LCNDA_EXT?.successoral?.lawDialog && window.LCNDA_APP?.setModule && window.LCNDA_SUCC_CORE?.lawSearchUrl, null, { timeout: 20000 });
            return { ctx, pg, errs, opened };
        };
        const noSide = async pg => assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'pas de défilement de côté');
        const shot = async (pg, name) => { await pg.waitForFunction(() => !document.querySelector('dialog[open] [type=submit].is-busy')); await pg.waitForTimeout(400); return pg.screenshot({ path: path.join(UX, `loi-${name}.png`) }); };
        const xss = pg => pg.evaluate(() => window.__xss);
        const popupUrl = async (pg, ctx, act) => { const [p] = await Promise.all([ctx.waitForEvent('page', { timeout: 10000 }), act()]); await p.waitForLoadState('domcontentloaded').catch(() => {}); const u = p.url(); await p.close(); return u; };
        const toastHas = (pg, re) => pg.waitForFunction(src => new RegExp(src).test(document.querySelector('.toast-region')?.textContent || ''), re.source, { timeout: 10000 });
        try {
            await t('navigateur 1440 : bouton de la page, boutons désactivés si vide, adresses exactes, Entrée = Service-public, rien d’autre que le texte tapé', async () => {
                const { ctx, pg, errs, opened } = await open(1440, 900, false);
                await pg.waitForSelector('.succ-page [data-succ-loi]');
                assert.match(await pg.textContent('.succ-page [data-succ-loi]'), /⚖️ Un doute sur la loi \?/);
                await pg.click('.succ-page [data-succ-loi]'); await pg.waitForSelector('dialog[open] .succ-loi');
                const dlg = pg.locator('dialog[open]');
                assert.match(await dlg.textContent(), /L’app ne choisit aucun article : ta question est envoyée telle quelle au site officiel, qui s’ouvre dans ton navigateur\./);
                assert.match(await dlg.textContent(), /N’écris pas de nom : la question part sur internet\./);
                assert.match(await dlg.textContent(), /explique en français simple et donne le lien vers le bon article/);
                assert.match(await dlg.textContent(), /les articles des codes en vigueur/);
                assert.match(await dlg.locator('[data-succ-loi-q]').getAttribute('placeholder'), /un héritier refuse de répondre · délai pour renoncer à une succession/);
                assert.equal(await dlg.locator('.succ-loi-jr').count(), 0, 'sans dossier ouvert : pas de « Noter »');
                assert.equal(await dlg.locator('[data-succ-loi-go="sp"]').isDisabled(), true); assert.equal(await dlg.locator('[data-succ-loi-go="lf"]').isDisabled(), true);
                assert.match(await dlg.locator('[data-succ-loi-go="sp"]').getAttribute('class'), /^button$/, 'Service-public mis en avant');
                await dlg.locator('[data-succ-loi-q]').fill('   ');
                assert.equal(await dlg.locator('[data-succ-loi-go="sp"]').isDisabled(), true, 'des espaces seuls : toujours désactivé');
                await pg.keyboard.press('Enter'); await pg.waitForTimeout(300); assert.equal(opened.length, 0, 'Entrée sur un champ vide : rien');
                const q = 'délai pour renoncer à une succession';
                await dlg.locator('[data-succ-loi-q]').fill(q);
                assert.equal(await dlg.locator('[data-succ-loi-go="sp"]').isDisabled(), false);
                await shot(pg, 'fenetre-1440');
                const enc = 'd%C3%A9lai%20pour%20renoncer%20%C3%A0%20une%20succession';
                assert.equal(await popupUrl(pg, ctx, () => dlg.locator('[data-succ-loi-go="sp"]').click()), SP + enc);
                assert.equal(await popupUrl(pg, ctx, () => dlg.locator('[data-succ-loi-go="lf"]').click()), LF(enc));
                assert.equal(await popupUrl(pg, ctx, () => dlg.locator('[data-succ-loi-q]').press('Enter')), SP + enc, 'Entrée = Service-public');
                assert.equal(await pg.locator('dialog[open] .succ-loi').count(), 1, 'la fenêtre reste ouverte');
                assert.deepEqual(opened, [SP + enc, LF(enc), SP + enc]);
                await pg.keyboard.press('Escape');
                assert.deepEqual(errs, []); await ctx.close();
            });
            await t('navigateur 1440 : dans un dossier — « ⚖️ Un doute ? », l’adresse sans nom ni n° de dossier, « ✍️ Noter » (lien refusé, puis noté et cliquable au journal), texte piégé jamais exécuté', async () => {
                const { ctx, pg, errs, opened } = await open(1440, 900, false);
                await pg.evaluate(id => window.LCNDA_EXT.successoral.openCase(id, 'journal'), A);
                await pg.waitForSelector('[data-succ-tab="journal"].is-active');
                assert.match(await pg.textContent('.succ-page [data-succ-loi="case"]'), /⚖️ Un doute \?/);
                // le journal : la ligne piégée échappée, le lien officiel cliquable, l'autre site non
                const jl = pg.locator('.succ-journal');
                assert.ok((await jl.textContent()).includes(`Doute sur la loi : « ${XSS} »`), 'texte piégé montré tel quel');
                const links = await jl.locator('a').evaluateAll(as => as.map(a => [a.getAttribute('href'), a.target, a.rel]));
                assert.deepEqual(links, [['https://www.service-public.fr/particuliers/vosdroits/F1199', '_blank', 'noopener noreferrer']]);
                assert.match(await jl.textContent(), /vieux » — https:\/\/evil\.example\/x/, 'l’autre site reste du texte');
                await pg.click('.succ-page [data-succ-loi="case"]'); await pg.waitForSelector('dialog[open] .succ-loi-jr');
                const dlg = pg.locator('dialog[open]');
                assert.match(await dlg.locator('.succ-loi-jr legend').textContent(), /✍️ Noter dans le dossier 2026-014/);
                assert.equal(await dlg.locator('[type=submit]').isDisabled(), true, '« Noter » désactivé si vide');
                await dlg.locator('[data-succ-loi-q]').fill(XSS);
                const u = await popupUrl(pg, ctx, () => dlg.locator('[data-succ-loi-go="sp"]').click());
                assert.equal(u, SP + encodeURIComponent(XSS)); assert.doesNotMatch(u, /MAZAUD|Marcel|2026-014|ROUSSILHE/, 'rien du dossier dans l’adresse');
                assert.ok(opened.every(x => !/MAZAUD|Marcel|2026-014/.test(decodeURIComponent(x))));
                // un lien refusé (javascript:), puis un autre site : rien d'écrit
                for (const bad of ['javascript:window.__xss=2', 'https://evil.example/x']) {
                    await dlg.locator('[data-succ-loi-link]').fill(bad); await dlg.locator('[type=submit]').click();
                    await toastHas(pg, /Lien refusé/); assert.equal(await pg.locator('dialog[open] .succ-loi').count(), 1, 'la fenêtre reste ouverte');
                }
                assert.equal((await lawLines(A)).length, 3);
                await dlg.locator('[data-succ-loi-link]').fill('https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006430827');
                await shot(pg, 'noter-1440');
                await dlg.locator('[type=submit]').click();
                await toastHas(pg, /Noté au journal du dossier 2026-014\./);
                await pg.waitForFunction(() => !document.querySelector('dialog[open] .succ-loi'));
                const last = (await lawLines(A))[0];
                assert.equal(last.text, `Doute sur la loi : « ${XSS} » — https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006430827`);
                await pg.waitForFunction(() => document.querySelectorAll('.succ-journal a').length === 2);
                assert.equal(await jl.locator('a').first().getAttribute('href'), 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006430827');
                assert.equal(await pg.locator('.toast-region button:has-text("Annuler")').count(), 0, 'le journal ne s’efface pas : pas de ↶ Annuler');
                await pg.locator('.succ-journal').scrollIntoViewIfNeeded(); await shot(pg, 'journal-1440');
                assert.equal(await xss(pg), undefined, 'texte piégé jamais exécuté');
                assert.deepEqual(errs, []); await ctx.close();
            });
            await t('navigateur : mode consultation — la recherche marche, « Noter » est caché', async () => {
                const { ctx, pg, errs } = await open(1440, 900, false);
                await pg.evaluate(id => window.LCNDA_EXT.successoral.openCase(id), A); await pg.waitForSelector('[data-succ-loi="case"]');
                await pg.evaluate(() => { document.body.classList.add('is-kiosk'); window.LCNDA_EXT.successoral.render(); });
                await pg.waitForSelector('#workspace [data-succ-loi]');
                assert.match(await pg.textContent('#workspace'), /ne se montrent pas en mode consultation/);
                assert.equal(await pg.locator('#workspace [data-succ-loi="case"]').count(), 0);
                await pg.click('#workspace [data-succ-loi]'); await pg.waitForSelector('dialog[open] .succ-loi');
                assert.equal(await pg.locator('dialog[open] .succ-loi-jr').count(), 0, 'pas de « Noter »');
                assert.equal(await pg.locator('dialog[open] [type=submit]').textContent(), 'Fermer');
                await pg.fill('dialog[open] [data-succ-loi-q]', 'héritier qui ne répond pas');
                assert.equal(await popupUrl(pg, ctx, () => pg.click('dialog[open] [data-succ-loi-go="lf"]')), LF('h%C3%A9ritier%20qui%20ne%20r%C3%A9pond%20pas'));
                // même la fenêtre ouverte depuis un dossier n'offre pas « Noter » en consultation
                await pg.keyboard.press('Escape');
                await pg.evaluate(() => window.LCNDA_EXT.successoral.lawDialog(window.LCNDA_EXT.successoral.current() || {id: 1, number: 'x'}));
                await pg.waitForSelector('dialog[open] .succ-loi'); assert.equal(await pg.locator('dialog[open] .succ-loi-jr').count(), 0);
                await shot(pg, 'consultation-1440');
                assert.deepEqual(errs, []); await ctx.close();
            });
            for (const [w0, h0, dark, tag] of [[390, 844, false, '390'], [1440, 900, true, 'sombre']]) {
                await t(`navigateur ${tag} : page, fenêtre (dossier ouvert), journal, sans défilement de côté`, async () => {
                    const { ctx, pg, errs } = await open(w0, h0, dark);
                    await pg.waitForSelector('.succ-page [data-succ-loi]'); await noSide(pg); await shot(pg, `page-${tag}`);
                    await pg.evaluate(id => window.LCNDA_EXT.successoral.openCase(id, 'journal'), A); await pg.waitForSelector('.succ-journal a');
                    await noSide(pg); await pg.locator('.succ-journal').scrollIntoViewIfNeeded(); await shot(pg, `journal-${tag}`);
                    await pg.click('.succ-page [data-succ-loi="case"]'); await pg.waitForSelector('dialog[open] .succ-loi-jr');
                    await pg.fill('dialog[open] [data-succ-loi-q]', 'un héritier refuse de répondre');
                    await noSide(pg); await shot(pg, `fenetre-${tag}`);
                    assert.equal(await xss(pg), undefined); assert.deepEqual(errs, []); await ctx.close();
                });
            }
        } finally { await browser.close(); }
    } finally {
        proc.kill();
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
        finish();
    }
})();
function finish() { if (failed) { console.error(`✗ ${failed} échec(s)`); process.exitCode = 1; } else console.log('✓ tout est bon'); }
