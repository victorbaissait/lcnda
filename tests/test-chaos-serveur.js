'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Test « utilisateur qui fait n'importe quoi » (côté serveur, 28/10) :   node tests/test-chaos-serveur.js
 *  1. une personne et un animal du même nom ne sont pas proposés comme doublons, et la fusion est refusée ;
 *  2. un animal ne peut pas être parent ou conjoint d'une personne ;
 *  3. « Enregistrer quand même » ne réécrit que les cases changées dans cette fenêtre (le métier changé ailleurs reste) ;
 *  4. un lien de téléchargement venu d'une fenêtre restée sur une autre généalogie (?g=) est refusé.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PhpServer, findPhp, devBundledPhp } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
let passed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.log('  ✗ ' + name + '\n      ' + (e && e.message ? e.message : e)); process.exitCode = 1; } }

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-chaos-'));
  const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir, { recursive: true });
  const s = new PhpServer({ phpPath: findPhp([devBundledPhp()]), appRoot, pool: 1, dataDir, mediaDir: path.join(tmp, 'media'), sessionDir: path.join(dataDir, 'sessions'), logFile: path.join(dataDir, 'php.log') });
  s.on('error', () => {}); await s.start();
  const base = `http://127.0.0.1:${s.port}`;
  try {
    const home = await fetch(base + '/', { headers: { 'x-carnet-secret': s.secret } });
    const cookie = (home.headers.get('set-cookie') || '').split(';')[0];
    const csrf = JSON.parse(((await home.text()).match(/window\.INSTALL_CSRF = ("[^"]*")/) || [])[1] || '""');
    const headers = { 'x-carnet-secret': s.secret, 'X-CSRF-Token': csrf, cookie };
    const ged = '0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME Paul /Martin/\n1 SEX M\n0 @I2@ INDI\n1 NAME Paul /Martin/\n1 SEX M\n1 _KIND animal\n2 _PET {"name":"Paul","species":"chien"}\n0 @I3@ INDI\n1 NAME Jean /Durand/\n1 SEX M\n0 TRLR\n';
    const fd = new FormData(); fd.append('file', new Blob([ged]), 'a.ged'); fd.append('csrf', csrf);
    assert.equal((await fetch(base + '/api.php?action=import_package', { method: 'POST', headers, body: fd })).status, 200);
    const get = async (action, q = '') => (await fetch(`${base}/api.php?action=${action}${q}`, { headers })).json();
    const post = async (action, body) => { const r = await fetch(`${base}/api.php?action=${action}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, csrf }) }); return { status: r.status, data: await r.json().catch(() => ({})) }; };
    const people = (await get('people')).people || (await get('people')).items || [];
    const byName = (f, l, kind) => people.find(p => p.first_name === f && p.last_name === l && (kind ? (p.kind || 'human') === kind : true));
    const human = byName('Paul', 'Martin', 'human'), animal = byName('Paul', 'Martin', 'animal'), jean = byName('Jean', 'Durand');
    await step('personne et animal du même nom : pas des doublons, fusion refusée', async () => {
      assert.ok(human && animal, JSON.stringify(people.map(p => [p.id, p.first_name, p.kind])));
      const c = (await get('duplicate_candidates')).candidates || [];
      assert.ok(!c.some(x => [x.id1, x.id2].sort().join() === [human.id, animal.id].sort().join()), 'paire proposée');
      const r = await post('merge_people', { target_id: human.id, source_id: animal.id });
      assert.notEqual(r.status, 200); assert.match(String(r.data.error || ''), /animal/);
    });
    await step('un animal ne devient pas parent ou conjoint d’une personne', async () => {
      for (const t of ['parent', 'spouse']) { const r = await post('add_relation', { person_id: jean.id, related_id: animal.id, relation_type: t }); assert.notEqual(r.status, 200, t); assert.match(String(r.data.error || ''), /animal/); }
    });
    await step('« Enregistrer quand même » garde le métier changé dans l’autre fenêtre', async () => {
      const baseRow = { first_name: 'Jean', last_name: 'Durand', occupation: '' };
      assert.equal((await post('save_person', { id: jean.id, first_name: 'Jean', last_name: 'Durand', occupation: 'Meunier' })).status, 200); // fenêtre B
      const r = await post('save_person', { id: jean.id, first_name: 'Jean-Marie', last_name: 'Durand', occupation: '', _base: baseRow, _force: 1 }); // fenêtre A
      assert.equal(r.status, 200, JSON.stringify(r.data));
      const p = (await get('person', '&id=' + jean.id)).person;
      assert.equal(p.first_name, 'Jean-Marie'); assert.equal(p.occupation, 'Meunier');
    });
    await step('lien d’export d’une autre généalogie (?g=) refusé', async () => {
      const r = await fetch(`${base}/api.php?action=export_json&g=une-autre`, { headers }); assert.equal(r.status, 409);
      const ok = await fetch(`${base}/api.php?action=export_json&g=main`, { headers }); assert.equal(ok.status, 200);
    });
  } finally { await s.stop(); fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log(process.exitCode ? 'Échec' : `✓ test « n'importe quoi » côté serveur : ${passed} vérifications`);
})().catch(e => { console.error(e); process.exitCode = 1; });
