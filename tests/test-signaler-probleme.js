'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * 🐞 Signaler un problème :   node tests/test-signaler-probleme.js
 *  1. le nettoyage du journal des erreurs (assets/js/app-journal.js) : noms, prénoms, dates, années, mois, lieux, textes
 *     entre guillemets, e-mails, numéros, chemins de fichiers (Mac, Windows, Linux) et adresses web enlevés ; ce qui sert
 *     à corriger gardé (TypeError, fichier:ligne:colonne de l'app, action d'api.php, SQLSTATE) ; 50 erreurs au plus ;
 *  2. le serveur (GET report_info, lib/signaler.php) ne rend que des nombres et des versions : ni nom, ni lieu, ni chemin ;
 *  3. navigateur (Playwright, sinon sauté) : erreurs JS, promesse refusée, console.error et réponse du serveur en erreur,
 *     toutes avec des données de généalogie → ni le journal gardé (localStorage) ni la pièce jointe ni l'adresse GitHub
 *     n'en contiennent ; boutons Copier / GitHub ; « ✉️ Écrire un e-mail » seulement si une adresse est réglée.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const J = require('../assets/js/app-journal.js');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-signaler-'));
let failed = 0;
const okA = async (name, fn) => { try { await fn(); console.log('  ✓ ' + name); } catch (e) { failed++; console.error('  ✗ ' + name + '\n    ' + (e && e.stack || e)); } };

/* données de généalogie qui ne doivent JAMAIS sortir */
const SECRETS = ['Joséphine', 'Jean', 'DUPONT', 'Dupont', 'Lefèvre', 'Marie-Thérèse', 'Saint-Martin', 'Agen', 'Ré', 'Toulouse', 'Bordeaux', 'Pierre', 'Martin', 'marie', 'paul.durand',
  '1890', '1925', '1784', '1960', 'mars', 'mai', 'décembre', '12/03', '08/12', '1925-05-07', '47000', '06 12 34 56 78', '/Users', 'C:\\', '/home/victor', 'Documents', 'Desktop', 'genealogie', 'arbre.ged', 'base.sqlite', 'mariage-1925', 'Kerjean', 'Le Goff', 'GOFF'];
/** le secret est-il dans le texte (un mot entier pour un mot : « mai » n'est pas dans « [e-mail] ») */
const has = (text, sec) => (/^[\p{L}-]+$/u.test(sec) ? new RegExp(`(^|[^\\p{L}])${sec}($|[^\\p{L}])`, 'u').test(text) : text.includes(sec));
const CORPUS = [
  'Impossible d’ouvrir la fiche de Jean DUPONT née le 12 mars 1890 à Saint-Martin-de-Ré (/Users/marie/Documents/genealogie/base.sqlite)',
  'La fiche « Marie-Thérèse Lefèvre » est verrouillée.',
  'Erreur C:\\Users\\Paul\\Desktop\\arbre.ged ligne 12 : 08/12/1960 Pierre Martin, paul.durand@gmail.com, 47000 Agen, 06 12 34 56 78',
  'Fichier introuvable : /home/victor/photos/mariage-1925.jpg',
  'Mariage de Joséphine Kerjean et Yann Le Goff le 7 mai 1925 à Toulouse',
  "Lieu 'Bordeaux' inconnu ; date \"1925-05-07\" ; vers 1784",
  'Uncaught TypeError: Cannot read properties of undefined (reading \'name\') at http://127.0.0.1:8123/assets/js/app.js?v=521:1234:56',
  'GOFF Yann (° décembre 1784) introuvable dans file:///home/victor/lcnda/data/genealogy.sqlite',
];

(async () => {
  console.log('1. Nettoyage du journal');
  await okA('aucune donnée de généalogie ne reste', async () => {
    for (const c of CORPUS) {
      const out = J.scrub(c);
      for (const s of SECRETS) assert.ok(!has(out, s), `« ${s} » est resté dans : ${out}`);
    }
  });
  await okA('ce qui sert à corriger est gardé', async () => {
    const out = J.scrub(CORPUS[6]);
    assert.match(out, /TypeError: Cannot read properties of undefined \(reading 'name'\)/);
    assert.match(out, /assets\/js\/app\.js:1234:56/);
    assert.doesNotMatch(out, /127\.0\.0\.1|8123|v=521/);
    assert.equal(J.scrub('SQLSTATE[HY000]: General error: 5 database is locked'), 'SQLSTATE[HY000]: [nom] error: 5 database is locked');
    assert.equal(J.scrub('http://localhost:9/api.php?action=save_person&id=12&name=Jean'), 'api.php?action=save_person');
    assert.equal(J.scrub('NetworkError when attempting to fetch resource.'), 'NetworkError when attempting to fetch resource.');
  });
  await okA('50 erreurs au plus, les doublons comptés', async () => {
    J.clear();
    for (let i = 0; i < 70; i++) J.add('js', `Erreur numéro ${i} chez Jean`);
    const l = J.list();
    assert.equal(l.length, 50);
    assert.ok(l.every((e) => !e.msg.includes('Jean')));
    J.clear();
    J.add('js', 'pareil'); J.add('js', 'pareil'); J.add('js', 'pareil');
    assert.equal(J.list().length, 1); assert.equal(J.list()[0].n, 3);
    J.clear();
  });

  console.log('2. Serveur (report_info)');
  const phpPath = findPhp([devBundledPhp()]);
  const dir = path.join(tmp, 'data'); fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
  const env = { ...process.env, GENEALOGY_DATA_DIR: dir, GENEALOGY_MEDIA_DIR: path.join(dir, 'media'), GENEALOGY_SKIP_REFERENCE: '1' };
  const mk = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', String.raw`require 'lib/paths.php'; $p = new PDO('sqlite:'.DATA_DIR.'/genealogy.sqlite'); $p->exec(file_get_contents(APP_ROOT.'/data/schema.sql'));
    $p->exec("INSERT INTO persons(first_name,last_name,gender) VALUES('Joséphine','Kerjean','female'),('Jean','Dupont','male')");
    $p->exec("INSERT INTO places(name) VALUES('Saint-Martin-de-Ré'),('Agen')"); echo 'ok';`], { cwd: appRoot, encoding: 'utf8', env });
  assert.match(mk.stdout, /ok$/, mk.stderr);
  const port = await new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
  const proc = spawn(phpPath, [...phpRuntimeArgs(phpPath), '-S', `127.0.0.1:${port}`, '-t', appRoot, path.join(appRoot, 'router.php')], { cwd: appRoot, env, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 100; i++) { try { await fetch(base + 'api.php?action=kiosk_state'); break; } catch (_) { await new Promise((r) => setTimeout(r, 100)); } }
  try {
    await okA('seulement des nombres et des versions', async () => {
      const r = await fetch(base + 'api.php?action=report_info');
      const text = await r.text();
      const j = JSON.parse(text);
      assert.equal(j.counts.persons, 2); assert.equal(j.counts.places, 2);
      assert.ok(j.db_bytes > 0); assert.match(j.php, /^\d+\.\d+/);
      for (const s of ['Joséphine', 'Kerjean', 'Jean', 'Dupont', 'Agen', 'Saint-Martin', tmp, 'genealogy.sqlite', os.homedir()]) assert.ok(!text.includes(s) && !text.includes(JSON.stringify(s).slice(1, -1)), `« ${s} » dans report_info`);
      for (const [k, v] of Object.entries(j.counts)) assert.equal(typeof v, 'number', k);
    });

    console.log('3. Navigateur');
    let pw = null;
    for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) { /* suivant */ } }
    if (!pw) console.log('  – sauté (Playwright absent)');
    else {
      const browser = await pw.chromium.launch();
      try {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
        // une réponse du serveur en erreur qui cite une fiche (comme « La fiche « Jean Dupont » est verrouillée. »)
        await ctx.route('**/api.php?action=test_echec*', (r) => r.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'La fiche « Jean Dupont » (° 12/03/1890 à Agen) est verrouillée : /Users/marie/Documents/base.sqlite' }) }));
        const p = await ctx.newPage();
        const pageErrors = [];
        p.on('pageerror', (e) => { if (!/Joséphine|Lefèvre|Kerjean/.test(e.message)) pageErrors.push(e.message); });
        await p.goto(base);
        await p.waitForFunction(() => window.LCNDA_APP?.api && window.LCNDA_EXT?.reportProblem && window.LCNDA_JOURNAL);
        await p.evaluate(async () => {
          console.error('Impossible d’ouvrir la fiche de Jean DUPONT née le 12 mars 1890 à Saint-Martin-de-Ré (/Users/marie/Documents/genealogie/base.sqlite)');
          setTimeout(() => { throw new Error('Fiche « Marie-Thérèse Lefèvre » 1925 introuvable'); });
          Promise.reject(new Error('Mariage de Joséphine Kerjean et Yann Le Goff le 7 mai 1925 à Toulouse'));
          await fetch('api.php?action=test_echec&id=3');
        });
        await p.waitForTimeout(900);
        const stored = await p.evaluate(() => localStorage.getItem('lcnda-journal-erreurs') || '');
        const list = await p.evaluate(() => window.LCNDA_JOURNAL.list());
        await okA('les erreurs sont captées (JS, promesse, console, serveur)', async () => {
          const kinds = new Set(list.map((e) => e.kind));
          for (const k of ['js', 'promise', 'console', 'server']) assert.ok(kinds.has(k), `sorte ${k} absente : ${JSON.stringify(list)}`);
          assert.ok(list.some((e) => e.kind === 'server' && /^409/.test(e.msg) && e.where === 'api.php?action=test_echec'), JSON.stringify(list));
        });
        await okA('rien de la généalogie dans le journal gardé', async () => {
          assert.ok(stored.length > 10);
          for (const s of SECRETS) assert.ok(!has(stored, s), `« ${s} » dans localStorage : ${stored}`);
        });
        await p.click('body'); // la page doit être prête
        await p.evaluate(() => window.LCNDA_EXT.reportProblem.open());
        await p.waitForSelector('.rp-dialog [data-rp-attach]');
        const att = await p.inputValue('.rp-dialog [data-rp-attach]');
        await okA('pièce jointe : version, système, base en nombres, erreurs — sans généalogie', async () => {
          assert.match(att, /^LCNDA \d/); assert.match(att, /Base : 2 fiches/); assert.match(att, /Erreurs captées \(\d+/);
          assert.match(att, /Navigateur : /); assert.match(att, /Affichage : thème/);
          for (const s of SECRETS) assert.ok(!has(att, s), `« ${s} » dans la pièce jointe :\n${att}`);
          assert.ok(!att.includes(tmp));
        });
        await okA('pas d’e-mail sans adresse réglée ; GitHub pré-rempli et sans généalogie', async () => {
          assert.equal(await p.$('.rp-dialog [data-rp-mail]'), null);
          await p.fill('.rp-dialog [data-rp-what]', '');
          await p.click('[data-rp-github]');
          assert.ok(await p.$('.rp-dialog .is-invalid'), 'K1 : « Ce qui s’est passé » à remplir');
          await p.fill('.rp-dialog [data-rp-what]', 'Le bouton Enregistrer ne répond pas.');
          await p.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return {}; }; });
          await p.click('[data-rp-github]');
          const url = (await p.evaluate(() => window.__opened))[0] || '';
          const target = url;
          assert.ok(target.startsWith('https://github.com/victorbaissait/lcnda/issues/new?title='), target.slice(0, 120));
          const body = decodeURIComponent(new URL(target).searchParams.get('body'));
          assert.match(body, /Ce qui s’est passé\nLe bouton Enregistrer ne répond pas\./);
          assert.match(body, /Rapport technique/);
          for (const s of SECRETS) assert.ok(!has(body, s), `« ${s} » dans la demande GitHub`);
          assert.ok(url.length < 9000);
        });
        await okA('« ✉️ Écrire un e-mail » quand une adresse est réglée ; « 📋 Copier »', async () => {
          await p.evaluate(() => { document.querySelectorAll('dialog').forEach((d) => d.close()); localStorage.setItem('lcnda-signaler', JSON.stringify({ email: 'aide@exemple.fr' })); window.LCNDA_EXT.reportProblem.open(); });
          await p.waitForSelector('.rp-dialog [data-rp-mail]');
          const m = await p.evaluate(() => { const r = window.LCNDA_EXT.reportProblem; const c = r.compose({ what: 'x', expected: 'y', attach: 'z' }); return r.mailUrl(r.email(), c.title, c.body); });
          assert.ok(m.url.startsWith('mailto:aide@exemple.fr?subject='), m.url);
          await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
          await p.click('[data-rp-copy]'); await p.waitForTimeout(200);
          const clip = await p.evaluate(() => navigator.clipboard.readText());
          assert.match(clip, /^Problème : /);
          for (const s of SECRETS) assert.ok(!has(clip, s), `« ${s} » copié`);
          await p.evaluate(() => localStorage.setItem('lcnda-signaler', JSON.stringify({ email: 'pas une adresse' })));
          assert.equal(await p.evaluate(() => window.LCNDA_EXT.reportProblem.email()), '', 'adresse fausse ignorée');
        });
        await okA('les entrées : FAQ, Infos, Réglages → 🔄 Mises à jour', async () => {
          await p.evaluate(() => { document.querySelectorAll('dialog').forEach((d) => d.close()); const A = window.LCNDA_APP; A.state.maintenanceTab = 'faq'; A.setModule('maintenance'); });
          await p.waitForSelector('#workspace [data-report-problem]');
          await p.click('#workspace [data-report-problem]');
          await p.waitForSelector('.rp-dialog');
          await p.evaluate(() => { document.querySelectorAll('dialog').forEach((d) => d.close()); const A = window.LCNDA_APP; A.state.maintenanceTab = 'infos'; A.setModule('maintenance'); });
          await p.waitForSelector('#workspace [data-report-problem]');
          await p.evaluate(() => { const A = window.LCNDA_APP; A.state.maintenanceTab = 'mises_a_jour'; A.setModule('maintenance'); });
          await p.waitForSelector('.mj-page [data-report-problem]');
        });
        assert.deepEqual(pageErrors, [], pageErrors.join(' | '));
      } finally { await browser.close(); }
    }
  } finally {
    proc.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (failed) { console.error(`\n✗ ${failed} test(s) en échec`); process.exit(1); }
  console.log('\n✓ Signaler un problème : rien de la généalogie ne sort');
})().catch((e) => { console.error(e); process.exit(1); });
