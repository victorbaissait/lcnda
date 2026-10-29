'use strict';
process.env.GENEALOGY_SKIP_REFERENCE = process.env.GENEALOGY_SKIP_REFERENCE || '1';
/**
 * Archives et GEDCOM reçus (relecture des imports du 28/10) :   node tests/test-import-archives.js
 *  1. un GedZip qui désigne un fichier du disque (« 2 FILE /chemin/absolu ») ne l'aspire pas dans les médias ;
 *  2. un GedZip piégé (bombe zip) est refusé avant d'être ouvert ;
 *  3. un fichier qui n'est pas un GEDCOM est refusé avec une phrase claire ;
 *  4. une fiche d'animal garde son espèce, sa race et sa puce (balise _PET), à l'import comme à l'export ;
 *  5. les espaces de fin d'une ligne CONC ne se perdent plus.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PhpServer, findPhp, checkPhp, devBundledPhp, phpRuntimeArgs } = require('../electron/php-server');

const appRoot = path.resolve(__dirname, '..');
const phpPath = findPhp([devBundledPhp()]);
let passed = 0;
async function step(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.log('  ✗ ' + name + '\n      ' + (e && e.message ? e.message : e)); process.exitCode = 1; }
}
const php = (code, ...args) => { const r = spawnSync(phpPath, [...phpRuntimeArgs(phpPath), '-r', code, ...args], { encoding: 'utf8' }); if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim()); return r.stdout; };
const rows = (dbFile, sql) => JSON.parse(php(`$d=new PDO('sqlite:'.$argv[1]);$d->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE,PDO::FETCH_ASSOC);echo json_encode($d->query($argv[2])->fetchAll(),JSON_UNESCAPED_UNICODE);`, dbFile, sql));
/** une archive .zip fabriquée par Python (fichiers : [nom, contenu | {zeros: n}]) */
function zipOf(file, entries) {
  const spec = JSON.stringify(entries);
  const r = spawnSync('python3', ['-I', '-c', `import json,sys,zipfile
z=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED)
for n,c in json.loads(sys.argv[2]):
    if isinstance(c,dict):
        with z.open(n,'w',force_zip64=True) as f:
            b=b'\\0'*1048576
            for _ in range(c['zeros']): f.write(b)
    else: z.writestr(n,c)
z.close()`, file, spec], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
}

async function withServer(dir, fn) {
  const dataDir = path.join(dir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const s = new PhpServer({ phpPath, appRoot, pool: 1, dataDir, mediaDir: path.join(dir, 'media'), sessionDir: path.join(dataDir, 'sessions'), logFile: path.join(dataDir, 'php.log') });
  s.on('error', () => {});
  await s.start();
  try { return await fn(s, `http://127.0.0.1:${s.port}`, dataDir); } finally { await s.stop(); }
}
async function upload(s, base, content, name) {
  const home = await fetch(base + '/', { headers: { 'x-carnet-secret': s.secret } });
  const cookie = (home.headers.get('set-cookie') || '').split(';')[0];
  const csrf = JSON.parse(((await home.text()).match(/window\.INSTALL_CSRF = ("[^"]*")/) || [])[1] || '""');
  const fd = new FormData(); fd.append('file', new Blob([content]), name); fd.append('csrf', csrf);
  const r = await fetch(base + '/api.php?action=import_package', { method: 'POST', headers: { 'x-carnet-secret': s.secret, 'X-CSRF-Token': csrf, cookie }, body: fd });
  return { status: r.status, data: await r.json().catch(() => ({})), cookie };
}
const dbOf = dataDir => fs.readdirSync(dataDir).filter(f => f.endsWith('.sqlite')).map(f => path.join(dataDir, f))[0];

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-archives-'));
  console.log('Archives et GEDCOM reçus (' + phpPath + ')');
  const check = checkPhp(phpPath);
  if (!check.ok) throw new Error(check.error || 'extensions manquantes');
  const secret = path.join(tmp, 'secret.png');
  fs.writeFileSync(secret, Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fe0def46b80000000049454e44ae426082', 'hex'));
  const head = '0 HEAD\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n';

  await step('GedZip : un « FILE » vers un fichier du disque n’est pas copié dans les médias', () => withServer(path.join(tmp, 'a'), async (s, base, dataDir) => {
    const z = path.join(tmp, 'piege.zip');
    zipOf(z, [['arbre.ged', `${head}0 @I1@ INDI\n1 NAME Jean /Piège/\n1 OBJE\n2 FILE ${secret}\n2 FORM png\n0 TRLR\n`]]);
    const r = await upload(s, base, fs.readFileSync(z), 'arbre.zip');
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const media = fs.existsSync(path.join(tmp, 'a', 'media')) ? fs.readdirSync(path.join(tmp, 'a', 'media'), { recursive: true }).filter(f => /\.png$/i.test(String(f))) : [];
    assert.deepEqual(media, [], 'aucune image du disque dans les médias');
    assert.equal(rows(dbOf(dataDir), "SELECT count(*) AS n FROM persons")[0].n, 1);
  }));

  await step('GedZip piégé (bombe zip) : refusé avant d’être ouvert', () => withServer(path.join(tmp, 'b'), async (s, base) => {
    const z = path.join(tmp, 'bombe.zip');
    zipOf(z, [['arbre.ged', `${head}0 @I1@ INDI\n1 NAME A /B/\n0 TRLR\n`], ['zero.bin', { zeros: 60 }]]);
    assert.ok(fs.statSync(z).size < 2e6, 'la bombe est petite');
    const r = await upload(s, base, fs.readFileSync(z), 'bombe.zip');
    assert.notEqual(r.status, 200);
    assert.match(String(r.data.error || ''), /anormal/);
    const left = fs.readdirSync(os.tmpdir()).filter(f => /^gedzip_/.test(f)).map(f => path.join(os.tmpdir(), f, 'zero.bin')).filter(f => fs.existsSync(f));
    assert.deepEqual(left, [], 'rien d’extrait');
  }));

  await step('un fichier qui n’est pas un GEDCOM : refusé avec une phrase claire', () => withServer(path.join(tmp, 'c'), async (s, base) => {
    const r = await upload(s, base, Buffer.from('Bonjour, ceci est une lettre.\nRien d’autre.\n'), 'lettre.ged');
    assert.notEqual(r.status, 200);
    assert.match(String(r.data.error || ''), /n’est pas un GEDCOM/);
  }));

  await step('animal : espèce, race et puce gardées (import et export GEDCOM, balise _PET)', () => withServer(path.join(tmp, 'd'), async (s, base, dataDir) => {
    const pet = JSON.stringify({ name: 'Minou', species: 'chat', breed: 'Siamois', microchip: '250269812345678', sex: 'F' });
    const r = await upload(s, base, Buffer.from(`${head}0 @I1@ INDI\n1 NAME Minou\n1 SEX F\n1 _KIND animal\n2 _PET ${pet}\n0 TRLR\n`), 'chat.ged');
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const d = JSON.parse(rows(dbOf(dataDir), 'SELECT data_json FROM pets LIMIT 1')[0].data_json);
    assert.equal(d.species, 'chat'); assert.equal(d.breed, 'Siamois'); assert.equal(d.microchip, '250269812345678');
    const ged = await (await fetch(`${base}/api.php?action=export_gedcom`, { headers: { 'x-carnet-secret': s.secret, cookie: r.cookie } })).text();
    assert.match(ged, /1 _KIND animal\r?\n2 _PET \{.*"species":"chat"/);
  }));

  await step('notes : l’espace avant une coupure CONC n’est plus perdue', () => withServer(path.join(tmp, 'e'), async (s, base, dataDir) => {
    const r = await upload(s, base, Buffer.from(`${head}0 @I1@ INDI\n1 NAME Ana /Note/\n1 NOTE Il était une \n2 CONC fois dans le village\n0 TRLR\n`), 'note.ged');
    assert.equal(r.status, 200, JSON.stringify(r.data));
    // le texte de la note, où qu'il soit rangé : on parcourt toutes les tables
    const all = php(`$d=new PDO('sqlite:'.$argv[1]);$o='';foreach($d->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN) as $t){foreach($d->query('SELECT * FROM "'.$t.'"')->fetchAll(PDO::FETCH_NUM) as $r){$o.=implode(' | ',array_map('strval',$r)).PHP_EOL;}}echo $o;`, dbOf(dataDir));
    assert.match(all, /Il était une fois dans le village/);
  }));

  console.log(process.exitCode ? 'Échec' : `✓ archives et GEDCOM reçus : ${passed} vérifications`);
})().catch(e => { console.error(e); process.exitCode = 1; });
