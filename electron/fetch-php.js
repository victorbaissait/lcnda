'use strict';
/**
 * Télécharge et installe le PHP embarqué :   npm run fetch:php   (un autre système : node electron/fetch-php.js darwin-x64 ; tous : … all)
 *
 *  - lit l'adresse et l'empreinte sha256 dans php-runtimes.json ;
 *  - garde l'archive dans vendor/php/.cache (pas de nouveau téléchargement si elle est déjà là et intacte) ;
 *  - refuse un fichier dont l'empreinte ne correspond pas ;
 *  - installe dans vendor/php/<système>-<processeur>/ et vérifie les extensions (SQLite, FTS5, gd…).
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { checkPhp, phpRuntimeKey, devBundledPhp } = require('./php-server');

const ROOT = path.resolve(__dirname, '..');
const VENDOR = path.join(ROOT, 'vendor', 'php');
const CACHE = path.join(VENDOR, '.cache');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`téléchargement impossible (${res.status}) : ${url}`);
  const tmp = dest + '.part';
  fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  fs.renameSync(tmp, dest);
}

async function main() {
  const all = JSON.parse(fs.readFileSync(path.join(__dirname, 'php-runtimes.json'), 'utf8'));
  const wanted = process.argv[2] || phpRuntimeKey();
  // « all » : tous les systèmes (pour préparer les installateurs des autres plateformes).
  const keys = wanted === 'all' ? Object.keys(all).filter((k) => !k.startsWith('_')) : [wanted];
  for (const key of keys) await install(key, all[key]);
}

async function install(key, rt) {
  if (!rt) throw new Error(`pas de PHP prévu pour « ${key} » dans php-runtimes.json`);

  fs.mkdirSync(CACHE, { recursive: true });
  const archive = path.join(CACHE, path.basename(new URL(rt.url).pathname));
  if (fs.existsSync(archive) && sha256(archive) === rt.sha256) {
    console.log('Archive déjà présente : ' + path.basename(archive));
  } else {
    console.log('Téléchargement de PHP ' + rt.version + ' (' + key + ')…');
    await download(rt.url, archive);
  }
  const got = sha256(archive);
  if (got !== rt.sha256) {
    fs.rmSync(archive, { force: true });
    throw new Error(`empreinte incorrecte : fichier refusé et supprimé.\n  attendue : ${rt.sha256}\n  obtenue  : ${got}`);
  }
  console.log('  ✓ empreinte sha256 vérifiée');

  const dir = path.join(VENDOR, key);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  // .tar.gz (Mac, Linux) ou .zip (Windows). Le « tar » de Mac et de Windows 10+ lit aussi les .zip ; pas celui de Linux.
  const isZip = archive.endsWith('.zip');
  const t = isZip && process.platform === 'linux'
    ? spawnSync('unzip', ['-q', archive, '-d', dir], { stdio: 'inherit' })
    : spawnSync('tar', [isZip ? '-xf' : '-xzf', archive, '-C', dir], { stdio: 'inherit' });
  if (t.status !== 0) throw new Error('décompression impossible');
  const bin = path.join(dir, rt.binary);
  if (!fs.existsSync(bin)) throw new Error('exécutable absent de l’archive : ' + rt.binary);
  fs.chmodSync(bin, 0o755);
  if (process.platform === 'darwin') {
    // Fichier venu d'internet : macOS le met en quarantaine ; on retire la marque pour qu'il se lance.
    spawnSync('xattr', ['-d', 'com.apple.quarantine', bin]);
  }
  // Lu par php-server.js : extensions à charger depuis ext/ (Windows) ; sa présence signale un PHP embarqué.
  const info = { version: rt.version, url: rt.url, sha256: rt.sha256, extensions: rt.extensions || [] };
  fs.writeFileSync(path.join(dir, 'runtime.json'), JSON.stringify(info, null, 2) + '\n');

  if (key === phpRuntimeKey()) {
    const c = checkPhp(bin);
    if (!c.ok) throw new Error('PHP installé mais incomplet : ' + (c.error || c.missing.join(', ')));
    console.log(`  ✓ PHP ${c.version} fonctionne, extensions complètes (SQLite + FTS5, gd, zip…)`);
    if (devBundledPhp() !== bin) throw new Error('chemin inattendu : ' + bin);
  } else {
    console.log('  (autre système : vérification des extensions à faire sur ce système)');
  }
  console.log('Installé : ' + path.relative(ROOT, bin));
}

main().catch((e) => { console.error('✗ ' + e.message); process.exitCode = 1; });
