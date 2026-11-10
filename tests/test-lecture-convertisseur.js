'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 📜 Aide à la lecture des actes anciens et 🪙 Convertisseur d'autrefois :   node tests/test-lecture-convertisseur.js
 *  1. calculs, dans Node : conversions exactes connues (livres, sous, deniers ; franc germinal ; anciens / nouveaux francs ; euro ;
 *     exemple du convertisseur de l'INSEE), mesures anciennes (toise, arpent, setier, variantes régionales), calendrier républicain
 *     aller-retour sur toute sa durée, recherche dans le dictionnaire, exercice corrigé mot à mot.
 *  2. navigateur (Playwright ; sinon sauté), base neuve, 1440 px, 390 px et sombre : les deux fenêtres, la transcription d'actes,
 *     la recherche rapide, le ⋯ de la fiche, Réglages → Glossaire et Calendrier / mesures, « 🪙 Convertir » sous une date en an II,
 *     sans erreur de page. LCONV_SHOTS=dossier pour garder les captures.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const appRoot = path.resolve(__dirname, '..');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, `${m} : ${a} au lieu de ≈ ${b}`);

/* ═════════ 1. Les calculs, dans Node ═════════ */
global.window = {LCNDA_EXT: {}};
require('../assets/js/heritage-calendar-more.js');
const calendarMore = global.window.LCNDA_EXT.calendarMore;
delete global.window;
const S = require('../assets/js/app-tableur-engine.js');
const F = require('../assets/js/app-autrefois-engine.js');
const L = require('../assets/js/app-aide-lecture.js');
const opts = {calendarMore, sheet: S};

// — argent : parités exactes —
{
    const r = F.readSum('12 livres 10 sous 6 deniers'); eq([r.ok, r.kind, r.value], [true, 'deniers', 12 * 240 + 10 * 12 + 6], '12 l 10 s 6 d = 3 006 deniers');
    eq(F.readSum('12 l 10 s 6 d').value, 3006, 'abrégé l s d');
    eq(F.lsdText(3006), '12 livres 10 sous 6 deniers', 'deniers → livres, sous, deniers');
    eq(F.readSum('3 écus').value, 3 * 3 * 240, '1 écu = 3 livres'); eq(F.readSum('2 louis d’or').value, 2 * 24 * 240, '1 louis = 24 livres');
    eq([F.readSum('1 200 francs').kind, F.readSum('1 200 francs').value], ['franc', 1200], 'espace des milliers');
    eq(F.readSum('45 NF').kind, 'nf'); eq(F.readSum('5 000 anciens francs').kind, 'af'); eq(F.readSum('10 €').kind, 'euro');
    ok(!F.readSum('12 pommes').ok && /pommes/.test(F.readSum('12 pommes').text), 'unité inconnue expliquée');
    ok(!F.readSum('3 livres 2 francs').ok, 'deux monnaies : refusé');
    // 81 livres = 80 francs germinal (loi de l'an III)
    const w = F.worth(F.readSum('81 livres'), 1800); near(w.native, 80, 1e-9, '81 livres en 1800 = 80 francs');
    ok(w.steps.some(s => /81 livres = 80 francs/.test(s)), 'étape : franc germinal');
    // 1 € = 6,55957 F ; 1 NF = 100 AF
    near(F.worth(F.readSum('6,55957 francs'), 2010).native, 1, 1e-9, '6,55957 francs en 2010 = 1 €');
    near(F.worth(F.readSum('5 000 anciens francs'), 1965).native, 50, 1e-9, '5 000 AF en 1965 = 50 NF');
    near(F.worth(F.readSum('100 €'), 1990).native, 655.957, 1e-9, '100 € écrits en 1990 = 655,957 F');
    // pouvoir d'achat : le même calcul que le convertisseur de l'INSEE (son exemple : 3,80 francs de 1995 = 0,93 € en 2025)
    near(F.worth(F.readSum('3,80 francs'), 1995).euros, 0.93, 0.005, '3,80 F de 1995 (exemple INSEE)');
    near(F.worth(F.readSum('1 NF'), 1960).euros, 100 / (6.55957 * 7.96), 1e-9, '1 NF de 1960');
    near(F.worth(F.readSum('10 €'), 2025).euros, 10, 1e-9, '10 € de 2025');
    eq(F.worth(F.readSum('100 francs'), 1950).source, 'insee', 'INSEE à partir de 1901');
    const old = F.worth(F.readSum('100 livres'), 1780); eq(old.source, 'estimate', 'avant 1901 : ordre de grandeur'); ok(old.warn.some(t => /ordre de grandeur/.test(t)), 'prudence affichée avant 1901');
    ok(F.worth(F.readSum('100 livres'), 1793).warn.some(t => /assignats/.test(t)), 'assignats signalés');
    // continuité au raccord de 1901 (ordre de grandeur → INSEE)
    near(F.euroPerUnit(1900).k / F.euroPerUnit(1901).k, 1, 0.02, 'pas de saut en 1901');
    ok(/^≈ 1 9\d\d €$/.test(F.euroText(F.worth(F.readSum('1 000 NF'), 1960).euros).replace(/ /g, ' ')), '« ≈ … € »');
    ok(F.SOURCE_URL.includes('insee.fr') && /INSEE/.test(F.SOURCE), 'source citée');
}
// — mesures anciennes (régions de heritage-calendar-more.js) —
{
    const t = F.readMeasure('1 toise', 'paris', opts); near(t.base, 1.949036, 1e-6, '1 toise de Paris');
    const t2 = F.readMeasure('12 toises 3 pieds', 'paris', opts); near(t2.base, 12 * 1.949036 + 3 * 0.324839, 1e-6, '12 toises 3 pieds');
    ok(t.units.some(u => /pied du roi/.test(u.label) && Math.abs(u.value - 6) < 0.001), '1 toise = 6 pieds');
    near(F.readMeasure('1 arpent', 'paris', opts).base, 3418.86, 0.01, '1 arpent de Paris');
    near(F.readMeasure('1 setier', 'paris', opts).base, 156.10, 0.01, '1 setier = 12 boisseaux');
    ok(F.readMeasure('1 setier', 'paris', opts).units.some(u => /^boisseau$/.test(u.label) && Math.abs(u.value - 12) < 0.01), 'setier → 12 boisseaux');
    const ha = F.readMeasure('1,5 ha', 'paris', opts); ok(ha.ok && ha.units.some(u => /arpent de Paris/.test(u.label)), 'inverse : hectares → arpents');
    const bz = F.readMeasure('1 journal', 'bretagne', opts); near(bz.base, 4862.4, 0.1, 'journal de Bretagne'); ok(bz.elsewhere.some(e => /Bourgogne/.test(e.region)), 'la même mesure ailleurs');
    ok(F.readMeasure('1 aune', 'lyon', opts).approx, 'aune de Lyon : valeur approchée');
    ok(!F.readMeasure('3 bananes', 'paris', opts).ok, 'mesure inconnue expliquée');
    ok(F.regions(opts).length >= 9, 'variantes régionales');
}
// — calendrier républicain, aller-retour —
{
    const R = s => F.republican(s, opts);
    eq(R('9 thermidor an II').to, '27 juillet 1794', '9 thermidor an II'); eq(R('18 brumaire an VIII').to, '9 novembre 1799', '18 brumaire an VIII');
    eq(R('1er vendémiaire an I').to, '22 septembre 1792', 'premier jour'); eq(R('14 juillet 1794').to, '26 messidor an II', 'grégorien → républicain');
    eq(R('14/07/1794').to, '26 messidor an II', 'jj/mm/aaaa'); eq(R('quinze brumaire an dix').to, '6 novembre 1801', 'en toutes lettres');
    eq(R('31/12/1805').to, '10 nivôse an XIV', 'dernier jour');
    ok(!R('1 janvier 1806').ok && !R('11 nivôse an XIV').ok && !R('6e jour complémentaire an IV').ok && R('6e jour complémentaire an III').ok, 'bornes et années sextiles');
    eq(R('9 thermidor an II').weekday, 'dimanche', 'jour de la semaine'); eq(R('10 thermidor an II').decade, 'décadi', 'jour de la décade');
    // aller-retour sur toute la durée du calendrier, et accord avec les champs de date (LCNDA_SHEET, C4)
    let d = new Date(Date.UTC(1792, 8, 22)), count = 0;
    while (d <= new Date(Date.UTC(1805, 11, 31))) {
        const g = `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`, a = R(g); assert.ok(a.ok, g);
        const back = R(a.to); assert.ok(back.ok && back.greg.y === d.getUTCFullYear() && back.greg.m === d.getUTCMonth() + 1 && back.greg.d === d.getUTCDate(), `${g} → ${a.to} → ${back.to}`);
        count++; d = new Date(d.getTime() + 864e5);
    }
    ok(count === 4848, `${count} jours aller-retour`);
    eq(F.republicanYear(2).length, 13, 'les 13 mois de l’an II');
}
// — dictionnaire et lettres —
{
    const top = (q, o) => (L.search(q, o)[0] || {}).item || {};
    ok(/veuve/.test(top('vve').d), '« vve » → veuve'); ok(/veuve/.test(top('Vve.').d), '« Vve. » (avec le point)');
    ok(/cultivateur/.test(top('cult.').d), '« cult. » (SocFace)'); ok(/journalier/.test(top('jlier').d), '« jlier »');
    ok(/idem/.test(top('id.').d), '« id. »'); ok(/dito/.test(top('d°').d), '« d° »');
    ok(/fils/.test(top('filius').d), '« filius »'); ok(L.search('filius legitimus').some(r => /naturalis/.test(r.item.t || '')), 'formule latine');
    ok(L.search('dudit').some(r => r.item.t === 'dudit lieu'), '« dudit lieu »'); ok(L.search('feu').some(r => /^feu, feue/.test(r.item.t || '')), '« feu »');
    ok(L.search('veuf de').some(r => /veuf de/.test(r.item.t || '')), '« veuf de »');
    ok(L.search('', {acte: 'mariage'}).every(r => r.type !== 'entry' || r.item.a === 'mariage'), 'filtre par acte');
    ok(L.search('', {kind: 'latin'}).length >= 60, 'au moins 60 mots latins');
    ok(L.search('ſ').some(r => r.type === 'letter' && r.item.id === 'slong') || L.search('s long').some(r => r.item.id === 'slong'), 's long dans les lettres');
    ok(L.LETTERS.length >= 20 && L.LETTERS.every(l => /<svg[^>]*class="la-glyph"[\s\S]*<path d="M/.test(L.glyphSvg(l.seen))), 'chaque lettre est dessinée (SVG maison)');
    ok(!/https?:|<image|xlink/.test(L.LETTERS.map(l => L.glyphSvg(l.seen) + L.glyphSvg(l.cmp)).join('')), 'aucune image externe');
    const c = L.counts(''); ok(c.latin && c.formule && c.abrev && c.lettre && c.exercice, 'nombres par sorte');
}
// — exercices : corrigés mot à mot —
{
    ok(L.EXERCISES.length >= 5 && L.EXERCISES.every(x => x.year < 1950), 'exercices anciens');
    for (const x of L.EXERCISES) { const r = L.correct(x, L.parseExercise(x).answer); eq(r.score, 100, `${x.id} : la solution fait 100 %`); }
    const x = L.EXERCISES.find(e => e.id === 'bapt1742');
    const r = L.correct(x, 'Le vingt six de mai mil sept cent quarante deux a été baptisé Jean fils legitime de Pierre Martin laboureur et de Marie Durand sa femme de cette parroisse le parrain a esté Jean Bonnet et la marraine qui ont declaré ne savoir signer');
    const bad = r.words.filter(w => w.st !== 'ok');
    eq(bad.map(w => [w.st, w.exp]), [['faux', 'paroisse'], ['manque', 'Anne'], ['manque', 'Roux']], 'mot faux et mots oubliés repérés');
    ok(/abréviation de « paroisse »/.test(bad[0].hint), 'explication du mot faux'); ok(r.score > 85 && r.score < 100, `score ${r.score}`);
    const r2 = L.correct(x, 'Le vingt six de may mil sept cent quarante deux deux a esté baptisé'); ok(r2.words.some(w => w.st === 'trop'), 'mot en trop');
    const lat = L.correct(L.EXERCISES.find(e => e.id === 'bapt1695'), 'Anno Domini millesimo sexcentesimo nonagesimo quinto die decima mensis januarii baptizatus fuit Ioannes filius legitimus');
    ok(lat.words.slice(0, 15).every(w => w.st === 'ok'), 'majuscules, i/j confondus');
    const rec = L.correct(L.EXERCISES.find(e => e.id === 'rec1836'), 'Martin Jean cult. Durand'); ok(rec.words[2].st === 'faux' && /cultivateur/.test(rec.words[2].exp), 'abréviation non développée : à revoir');
}
// — sûreté : pas d'eval, pas de requête —
{
    const src = ['app-aide-lecture.js', 'app-autrefois-engine.js', 'heritage-lecture-autrefois.js'].map(f => fs.readFileSync(path.join(appRoot, 'assets/js', f), 'utf8')).join('\n');
    ok(!/\beval\s*\(|new\s+Function\b/.test(src), 'jamais eval ni Function'); ok(!/\bfetch\s*\(|XMLHttpRequest|api\(/.test(src), 'aucune requête');
    ok(!/\b(19[5-9]\d|20\d\d)\b/.test(L.EXERCISES.map(x => x.src).join(' ')), 'aucune date récente dans les exercices');
}
console.log(`✓ calculs : ${n} vérifications`);

/* ═════════ 2. Dans le navigateur ═════════ */
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
(async () => {
    let pw = null; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!pw) { console.log('  – navigateur : sauté (Playwright absent)'); console.log(`✓ lecture et convertisseur : ${n} vérifications`); return; }
    const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');
    const phpPath = findPhp([devBundledPhp()]);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-lecture-conv-'));
    const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`
require 'lib/paths.php';
$p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
$p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Jean','Martin','male')"); $p = null;
require 'lib/bootstrap.php'; db(); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
      if (r.status !== 0 || !/ok$/.test(r.stdout)) { console.error(r.stderr || r.stdout); process.exit(1); } }
    const port = Number(process.env.LCONV_PORT) || await freePort();
    const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); } }
    const SHOTS = process.env.LCONV_SHOTS || '';
    const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } };
    const browser = await pw.chromium.launch();
    const posts = [];
    const open = async (width, dark) => {
        const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, colorScheme: dark ? 'dark' : 'light' });
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base.replace(/\/$/, '') });
        const page = await ctx.newPage(); const errors = [];
        page.on('pageerror', e => errors.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console ' + m.text()); });
        page.on('request', r => { if (r.method() === 'POST' && /api\.php/.test(r.url()) && !/action=save_settings\b/.test(r.url()) && page.__watch) posts.push(r.url()); /* save_settings : la copie des réglages genealogie-* que l'app fait toute seule */ });
        await page.goto(base); await page.waitForFunction(() => window.LCNDA_EXT?.readingAid && window.LCNDA_EXT?.autrefois && window.LCNDA_EXT?.openDialog && window.LCNDA_APP?.state?.csrf);
        if (dark) await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
        return { ctx, page, errors };
    };
    try {
        /* — 1440 px — */
        const { ctx, page, errors } = await open(1440, false);
        page.__watch = true;
        // 📜 la fenêtre : dictionnaire, filtres, lettres, exercice corrigé
        await page.evaluate(() => window.LCNDA_EXT.readingAid.open({tab: 'dict', q: 'vve'}));
        await page.waitForSelector('dialog[open] .la-row');
        ok(/veuve/.test(await page.textContent('dialog[open] .la-dict')), 'fenêtre : « vve » trouvé');
        ok(await page.$('dialog[open] .la-row mark') !== null, 'lettres tapées surlignées');
        ok(/Tout \(\d+\)/.test(await page.textContent('dialog[open] .la-filters')), 'pastilles avec le nombre');
        await page.fill('dialog[open] .la-search input', ''); await page.type('dialog[open] .la-search input', 'filius'); await page.waitForFunction(() => /filius/.test(document.querySelector('dialog[open] .la-dict')?.textContent || ''), null, {timeout: 5000}).catch(() => {});
        { const t = await page.textContent('dialog[open] .la-body'); ok(/fils/.test(t), 'recherche C1 : filius — ' + t.slice(0, 120)); }
        await page.click('dialog[open] [data-la-lang="la"]'); ok(await page.$eval('dialog[open] [data-la-lang="la"]', b => b.classList.contains('is-active')), 'filtre Langue : Latin');
        await page.click('dialog[open] [data-la-lang=""]'); // le filtre « Langue » vaut pour les trois onglets : on revient à toutes les langues
        await page.keyboard.press('Enter'); ok(await page.$('dialog[open] .la') !== null, 'Entrée ne ferme pas la fenêtre');
        await shot(page, 'aide-dictionnaire-1440');
        await page.fill('dialog[open] .la-search input', ''); await page.click('dialog[open] [data-la-tab="lettres"]'); await page.waitForSelector('dialog[open] .la-letter svg.la-glyph');
        ok((await page.$$('dialog[open] .la-letter')).length >= 20, 'les lettres dessinées');
        await shot(page, 'aide-lettres-1440');
        await page.click('dialog[open] [data-la-tab="exos"]'); await page.click('dialog[open] [data-la-exo="bapt1742"]');
        await page.fill('dialog[open] [data-la-answer]', 'Le vingt six de mai mil sept cent quarante deux a été baptisé Jean fils legitime de Pierre Martin laboureur et de Marie Durand sa femme de cette parroisse');
        await page.click('dialog[open] [data-la-correct]'); await page.waitForSelector('dialog[open] .la-words .la-w.is-faux');
        ok(/paroisse/.test(await page.textContent('dialog[open] .la-words .la-w.is-faux')), 'exercice : le mot faux montre la bonne lecture');
        ok((await page.$$('dialog[open] .la-words .la-w.is-ok')).length >= 25, 'exercice : mots justes en vert');
        await shot(page, 'aide-exercice-1440');
        await page.click('dialog[open] .modal-actions [type=submit]'); await page.waitForFunction(() => !document.querySelector('dialog[open]'));
        // 🪙 le convertisseur : argent, mesures, calendrier ; copier
        await page.evaluate(() => window.LCNDA_EXT.autrefois.open({tab: 'argent'}));
        await page.waitForSelector('dialog[open] [data-af-sum]');
        await page.fill('dialog[open] [data-af-sum]', '12 livres 10 sous 6 deniers'); await page.fill('dialog[open] [data-af-year]', '1780');
        ok(/✓ Compris : 12 livres 10 sous 6 deniers/.test(await page.textContent('dialog[open] [data-af-sum-hint]')), 'argent : ✓ Compris');
        ok(/≈ [\d\s  ]+ €/.test(await page.textContent('dialog[open] .af-big strong')), 'argent : ≈ … €');
        ok(/Ordre de grandeur/i.test(await page.textContent('dialog[open] [data-af-out="argent"]')), 'argent : prudence');
        await page.click('dialog[open] .af-copy'); ok(/12 livres 10 sous 6 deniers en 1780 ≈/.test(await page.evaluate(() => navigator.clipboard.readText())), 'argent : résultat copié');
        await page.fill('dialog[open] [data-af-sum]', '12 pommes'); ok(/⚠️/.test(await page.textContent('dialog[open] [data-af-sum-hint]')), 'argent : somme incomprise');
        await page.click('dialog[open] [data-af-ex-sum="1 200 francs"]'); ok(/INSEE|Ordre/.test(await page.textContent('dialog[open] .af-big')), 'exemple cliquable');
        await shot(page, 'convertisseur-argent-1440');
        await page.click('dialog[open] [data-af-tab="mesures"]'); await page.selectOption('dialog[open] [data-af-region]', 'paris');
        await page.fill('dialog[open] [data-af-measure]', '3 arpents'); ok(/1,0257 ha/.test(await page.textContent('dialog[open] [data-af-out="mesures"] .af-big')), 'mesures : 3 arpents');
        await page.selectOption('dialog[open] [data-af-region]', 'bretagne'); await page.fill('dialog[open] [data-af-measure]', '2 journaux'); ok(/97,2\d a/.test(await page.textContent('dialog[open] [data-af-out="mesures"] .af-big')), 'mesures : région Bretagne (2 journaux)');
        await shot(page, 'convertisseur-mesures-1440');
        await page.click('dialog[open] [data-af-tab="calendrier"]'); await page.fill('dialog[open] [data-af-date]', '9 thermidor an II');
        ok(/27 juillet 1794/.test(await page.textContent('dialog[open] [data-af-out="calendrier"] .af-big')), 'calendrier : républicain → grégorien');
        await page.fill('dialog[open] [data-af-date]', '14 juillet 1794'); ok(/26 messidor an II/.test(await page.textContent('dialog[open] [data-af-out="calendrier"] .af-big')), 'calendrier : grégorien → républicain');
        await shot(page, 'convertisseur-calendrier-1440');
        await page.click('dialog[open] .modal-actions [type=submit]'); await page.waitForFunction(() => !document.querySelector('dialog[open]'));
        // C4 : une date d'acte en an II est comprise, « 🪙 Convertir » ouvre le convertisseur réglé dessus
        await page.evaluate(() => { const f = window.LCNDA_UI.dateField({name: 'x', value: '12 thermidor an II'}); f.id = 'test-date'; document.body.appendChild(f); f.input.dispatchEvent(new Event('input', {bubbles: true})); });
        ok(/Compris : 12 thermidor an II \(30 juillet 1794\)/.test(await page.textContent('#test-date .ui-date-help')), 'C4 : an II déjà compris');
        await page.click('#test-date .ui-date-more'); await page.waitForSelector('dialog[open] [data-af-date]');
        ok(/30 juillet 1794/.test(await page.textContent('dialog[open] [data-af-out="calendrier"] .af-big')), '« 🪙 Convertir » : la date de la case');
        await page.click('dialog[open] .modal-actions [type=submit]'); await page.evaluate(() => document.getElementById('test-date').remove());
        ok(posts.length === 0, `les deux fenêtres n’écrivent rien en base (${posts.join(', ')})`); page.__watch = false;
        // recherche rapide (⌘K)
        await page.evaluate(() => document.querySelector('#quick-search')?.remove());
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k'); await page.waitForSelector('#quick-search input');
        await page.type('#quick-search input', 'convertisseur'); await page.waitForTimeout(400);
        ok(/Convertisseur d’autrefois/.test(await page.textContent('#quick-search')), 'recherche rapide : l’outil');
        await page.fill('#quick-search input', ''); await page.type('#quick-search input', 'filius'); await page.waitForTimeout(500);
        ok(/📜 filius/.test(await page.textContent('#quick-search')), 'recherche rapide : un mot latin');
        await page.keyboard.press('Escape');
        // ⋯ de la fiche
        await page.evaluate(async () => { const A = window.LCNDA_APP; A.state.currentPersonId = 1; await A.setModule('personnes'); await A.selectPerson(1, false); }); await page.waitForSelector('#workspace [data-fsec-hero-more]', {timeout: 15000});
        await page.click('#workspace [data-fsec-hero-more]'); await page.waitForTimeout(200);
        const menu = await page.evaluate(() => document.body.innerText);
        ok(/Aide à la lecture des actes/.test(menu) && /Convertisseur d’autrefois/.test(menu), 'fiche : ⋯ → les deux outils');
        await page.keyboard.press('Escape');
        // transcription d'actes : « 📜 Aide à la lecture » avec le mot choisi
        await page.evaluate(() => window.LCNDA_EXT.openActTranscriber ? window.LCNDA_EXT.openActTranscriber({text: 'Marie Roux Vve de Pierre'}) : null);
        const txOpen = await page.waitForSelector('[data-tx-cmd="aide"]', {timeout: 5000}).then(() => true).catch(() => false);
        if (txOpen) {
            await page.waitForTimeout(400); await page.evaluate(() => document.querySelectorAll('dialog.mpk-dialog[open]').forEach(d => d.close())); // le choix de l'image s'ouvre tout seul
            await page.evaluate(() => { const a = document.querySelector('[data-tx-body]'); a.value = 'Marie Roux Vve de Pierre'; a.setSelectionRange(11, 14); });
            await page.click('[data-tx-cmd="aide"]'); await page.waitForSelector('.la-dialog .la-row');
            ok(/veuve/.test(await page.textContent('.la-dialog .la-dict')), 'transcription : le mot choisi est cherché');
            await page.click('.la-dialog .modal-actions [type=submit]');
        } else ok(/data-tx-cmd="aide"/.test(fs.readFileSync(path.join(appRoot, 'assets/js/heritage-transcribe.js'), 'utf8')), 'transcription : le bouton existe');
        // Réglages → Glossaire et Calendrier / mesures
        await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => { d.removeAttribute('data-dirty'); d.close(); })); await page.waitForTimeout(200);
        await page.evaluate(async () => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'help'; await A.setModule('maintenance'); });
        await page.waitForSelector('#reading-aids-host .la-tabs', {timeout: 15000}).catch(async e => { console.log(await page.evaluate(() => [window.LCNDA_APP.state.module, window.LCNDA_APP.state.maintenanceTab, document.querySelector('#workspace')?.textContent.slice(0, 300), [...document.querySelectorAll('dialog[open]')].map(d => d.className)])); throw e; }); ok(true, 'Glossaire : l’aide posée dans la page');
        await page.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'calendar_measures'; A.setModule('maintenance'); });
        await page.waitForSelector('#autrefois-host .la-tabs', {timeout: 15000}); ok(true, 'Calendrier / mesures : le convertisseur posé dans la page');
        ok(!(await page.$('#unit-converter-form')) && !(await page.$('#currency-converter-form')), 'plus d’anciens convertisseurs en double');
        await shot(page, 'reglages-calendrier-1440');
        eq(errors, [], 'aucune erreur à 1440 px');
        await ctx.close();

        /* — 390 px — */
        { const { ctx: c2, page: p2, errors: e2 } = await open(390, false);
            await p2.evaluate(() => window.LCNDA_EXT.readingAid.open({tab: 'dict', q: 'feu'})); await p2.waitForSelector('dialog[open] .la-row');
            const over = await p2.evaluate(() => { const d = document.querySelector('dialog[open]'); return d.scrollWidth - d.clientWidth; }); ok(over <= 2, `390 px : pas de défilement de côté (${over})`);
            await shot(p2, 'aide-dictionnaire-390');
            await p2.fill('dialog[open] .la-search input', ''); await p2.click('dialog[open] [data-la-tab="exos"]'); await p2.click('dialog[open] [data-la-exo="rec1836"]'); await p2.click('dialog[open] [data-la-solution]'); await p2.waitForSelector('dialog[open] .la-words .la-w.is-ok');
            await shot(p2, 'aide-exercice-390');
            await p2.click('dialog[open] .modal-actions [type=submit]');
            await p2.evaluate(() => window.LCNDA_EXT.autrefois.open({tab: 'argent', value: '1 200 francs', year: '1880'})); await p2.waitForSelector('dialog[open] .af-big');
            const over2 = await p2.evaluate(() => { const d = document.querySelector('dialog[open]'); return d.scrollWidth - d.clientWidth; }); ok(over2 <= 2, `390 px convertisseur (${over2})`);
            await shot(p2, 'convertisseur-argent-390');
            eq(e2, [], 'aucune erreur à 390 px'); await c2.close(); }

        /* — sombre — */
        { const { ctx: c3, page: p3, errors: e3 } = await open(1440, true);
            await p3.evaluate(() => window.LCNDA_EXT.readingAid.open({tab: 'lettres'})); await p3.waitForSelector('dialog[open] .la-letter');
            const col = await p3.$eval('dialog[open] .la-letter-draw', el => getComputedStyle(el).color); ok(col !== 'rgb(74, 50, 24)', `sombre : trait des lettres éclairci (${col})`);
            await shot(p3, 'aide-lettres-sombre');
            await p3.click('dialog[open] [data-la-tab="exos"]'); await p3.click('dialog[open] [data-la-exo="bapt1695"]');
            const bg = await p3.$eval('dialog[open] .la-old', el => getComputedStyle(el).backgroundColor); ok(bg !== 'rgb(246, 239, 220)', `sombre : parchemin assombri (${bg})`);
            await shot(p3, 'aide-exercice-sombre');
            await p3.click('dialog[open] .modal-actions [type=submit]');
            await p3.evaluate(() => window.LCNDA_EXT.autrefois.open({tab: 'calendrier', value: '18 brumaire an VIII'})); await p3.waitForSelector('dialog[open] [data-af-out="calendrier"] .af-big');
            await shot(p3, 'convertisseur-calendrier-sombre');
            eq(e3, [], 'aucune erreur en sombre'); await c3.close(); }
    } finally { await browser.close(); proc.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
    console.log(`✓ lecture et convertisseur : ${n} vérifications`);
})().catch(e => { console.error(e); process.exit(1); });
