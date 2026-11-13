'use strict';
/**
 * Étapes ajoutées à la fabrication des installateurs (electron-builder, voir « build » dans package.json).
 *
 *  afterPack : 1) copie le PHP embarqué du bon système dans resources/php ;
 *              2) GARDE-FOU : inspecte l'application fabriquée et ARRÊTE TOUT si elle contient une base de données,
 *                 un média, une sauvegarde ou un dossier de données. La généalogie de l'utilisateur ne doit jamais
 *                 se retrouver dans un logiciel distribué.
 */
const fs = require('node:fs');
const path = require('node:path');
const { phpRuntimeKey } = require('../php-server');

// electron-builder : Arch.x64 = 1, Arch.arm64 = 3 (voir builder-util).
const ARCH_NAMES = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' };

function resourcesDir(context) {
  if (context.electronPlatformName === 'darwin') {
    const app = fs.readdirSync(context.appOutDir).find((n) => n.endsWith('.app'));
    return path.join(context.appOutDir, app, 'Contents', 'Resources');
  }
  return path.join(context.appOutDir, 'resources');
}

function copyPhpRuntime(context) {
  const arch = ARCH_NAMES[context.arch] || String(context.arch);
  const key = phpRuntimeKey(context.electronPlatformName, arch);
  const from = path.resolve(__dirname, '..', '..', 'vendor', 'php', key);
  if (!fs.existsSync(path.join(from, 'runtime.json'))) {
    throw new Error(`PHP embarqué absent pour ${key} : lance d'abord « node electron/fetch-php.js ${key} »`);
  }
  const to = path.join(resourcesDir(context), 'php');
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true, verbatimSymlinks: true });
  console.log(`  • PHP embarqué : ${key} → resources/php`);
}

// ─── Garde-fou ────────────────────────────────────────────────────────────────────────────────
const FORBIDDEN_ANYWHERE = /\.(sqlite|sqlite-wal|sqlite-shm|sqlite-journal|db|db-wal|db-shm|mftpkg|ged|gedcom|zip)$/i;
const MEDIA = /\.(jpe?g|png|gif|webp|heic|tiff?|bmp|pdf|mp3|m4a|wav|aiff?|aifc|ogg|mp4|mov|webm)$/i;
const FORBIDDEN_DIRS = new Set(['media', 'backups', 'sessions', 'sess', 'Carnet']);

function walk(dir, visit) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    visit(full, entry);
    if (entry.isDirectory() && !entry.isSymbolicLink()) walk(full, visit);
  }
}

/**
 * data/reference/ : seulement les données publiques de référence (communes françaises), fabriquées par
 * scripts/build-reference.php. On vérifie qu'aucune table de généalogie ne s'y trouve.
 */
function checkReference(dir, problems) {
  const zlib = require('node:zlib');
  for (const needed of ['geo-fr.sqlite.gz', 'geo-world.sqlite.gz']) {
    if (!fs.existsSync(path.join(dir, needed))) problems.push(`référence absente : ${needed} (npm run fetch:geo pour geo-world)`);
  }
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name === 'catalogue.json') { // liste des pays téléchargeables : seulement des noms, tailles et empreintes
      try { const c = JSON.parse(fs.readFileSync(full, 'utf8')); if (typeof c.countries !== 'object') problems.push('catalogue illisible : ' + full); }
      catch { problems.push('catalogue illisible : ' + full); }
      continue;
    }
    if (name === 'frontieres' && fs.statSync(full).isDirectory()) { checkFrontieres(full, problems); continue; }
    if (!/^geo-[a-z]+\.sqlite\.gz$/.test(name)) { problems.push('fichier inattendu dans data/reference/ : ' + full); continue; }
    // Le schéma (sqlite_master) est au début du fichier : on ne décompresse que les 2 premiers Mo.
    const fd = fs.openSync(full, 'r'); const head = Buffer.alloc(Math.min(2 * 1024 * 1024, fs.fstatSync(fd).size)); fs.readSync(fd, head, 0, head.length, 0); fs.closeSync(fd);
    const raw = zlib.gunzipSync(head, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
    const text = raw.toString('latin1');
    if (!text.startsWith('SQLite format 3') || !text.includes('CREATE TABLE reference_info')) problems.push('référence illisible : ' + full);
    for (const table of ['persons', 'events', 'families', 'media', 'notes', 'sources']) {
      if (new RegExp('CREATE TABLE "?' + table + '"?\\s*\\(').test(text)) problems.push(`table « ${table} » dans la référence : ` + full);
    }
  }
}

/**
 * 🌦 data-meteo/meteo-socle.sqlite (Météo d'autrefois, scripts/meteo/build-meteo.py) : données publiques de météo, permises
 * seulement à cet endroit, sous ce nom, et si leur schéma est bien celui de la météo (aucune table de généalogie).
 */
function isMeteoData(full, problems) {
  if (!/[\\/]php-app[\\/]data-meteo[\\/]meteo-(socle|complet|europe)\.sqlite$/.test(full)) return false;
  const fd = fs.openSync(full, 'r'); const head = Buffer.alloc(Math.min(2 * 1024 * 1024, fs.fstatSync(fd).size)); fs.readSync(fd, head, 0, head.length, 0); fs.closeSync(fd);
  const text = head.toString('latin1');
  if (!text.startsWith('SQLite format 3') || !/CREATE TABLE (IF NOT EXISTS )?stations/.test(text) || !/CREATE TABLE (IF NOT EXISTS )?meta/.test(text)) { problems.push('données météo illisibles : ' + full); return true; }
  for (const table of ['persons', 'events', 'families', 'media', 'notes', 'sources_links']) {
    if (new RegExp('CREATE TABLE "?' + table + '"?\\s*\\(').test(text)) problems.push(`table « ${table} » dans les données météo : ` + full);
  }
  return true;
}

/**
 * 🧭 Images dessinées de la base d'exemple (famille imaginaire, assets/exemple/) : permises seulement à cet endroit,
 * sous ces noms et avec exactement ces empreintes — une vraie photo glissée là, ou une image modifiée, arrête la fabrication.
 */
const EXEMPLE_IMAGES = {
  'acte-mariage.jpg': 'd5c156145985bad7823c6df1c983a02b184924ac744c415393c9928d16a822b7',
  'atelier.jpg': '06470a84cd7ea95ae4ec3fbceca62b47098f46c4593c882056275ea5ecabb142',
  'bourg.jpg': '1a8ef08acc3a1fd9349f345442f9029701a5e923c62d00d1f3466910685b1f4c',
  'foins.jpg': 'a3ad0d6ef1ab82f7155aaef7c8183caae2d4ec7408a6dcb283d18234f5456afc',
  'livret-militaire.jpg': 'aa5243099ec8187bcef44bd6834aaa625bc1258313cfd445630648050b25a876',
  'maison.jpg': '77212787400d401746ce6eb3ebcec1ecb59eb57a387727d2077abb3657a57184',
  'mariage.jpg': '70616e6ab3d2ca92a75ad92884c3fcf2c7d0fe2cd43b17005890f9e58992ed87',
  'port.jpg': '197196d00b0eff9232b20042f9c6433e50521b6974614840a99e0a701007474a',
  'recensement.jpg': 'd1a3ef4ffb110a0e84cd58379e9a5140c545146930a2499d55f66677d858471b',
};
const sha256File = full => require('node:crypto').createHash('sha256').update(fs.readFileSync(full)).digest('hex');
function isExempleImage(full) {
  const m = full.match(/[\\/]php-app[\\/]assets[\\/]exemple[\\/]([^\\/]+)$/);
  return !!(m && EXEMPLE_IMAGES[m[1]] && sha256File(full) === EXEMPLE_IMAGES[m[1]]);
}

/**
 * 🏛 data/reference/frontieres/ : fichiers officiels de l'INSEE (COG, Licence Ouverte) — seulement ces quatre fichiers,
 * et les deux CSV doivent avoir l'empreinte écrite dans SHA256SUMS.
 */
function checkFrontieres(dir, problems) {
  const allowed = new Set(['mvt.csv', 'com.csv', 'LICENCE.txt', 'SHA256SUMS']);
  for (const name of fs.readdirSync(dir)) if (!allowed.has(name)) problems.push('fichier inattendu dans data/reference/frontieres/ : ' + path.join(dir, name));
  let sums = {};
  try { for (const line of fs.readFileSync(path.join(dir, 'SHA256SUMS'), 'utf8').split('\n')) { const m = line.match(/^([0-9a-f]{64})\s+(\S+)$/); if (m) sums[m[2]] = m[1]; } }
  catch { problems.push('SHA256SUMS absent : ' + dir); return; }
  for (const csv of ['mvt.csv', 'com.csv']) {
    const full = path.join(dir, csv);
    if (!fs.existsSync(full)) { problems.push('frontières : fichier absent ' + full); continue; }
    if (sums[csv] !== sha256File(full)) problems.push('frontières : empreinte différente de SHA256SUMS : ' + full);
  }
}

function verifyPackage(context) {
  const problems = [];
  walk(context.appOutDir, (full, entry) => {
    if (entry.isFile() && FORBIDDEN_ANYWHERE.test(entry.name) && !isMeteoData(full, problems)) problems.push('fichier de données : ' + full);
  });
  const phpApp = path.join(resourcesDir(context), 'php-app');
  if (!fs.existsSync(path.join(phpApp, 'api.php'))) problems.push('code de l’application absent : ' + phpApp);
  if (fs.existsSync(phpApp)) {
    walk(phpApp, (full, entry) => {
      if (entry.isDirectory() && FORBIDDEN_DIRS.has(entry.name)) problems.push('dossier interdit : ' + full);
      if (entry.isFile() && MEDIA.test(entry.name) && !isExempleImage(full)) problems.push('média : ' + full);
    });
    const dataDir = path.join(phpApp, 'data');
    const dataFiles = fs.existsSync(dataDir) ? fs.readdirSync(dataDir) : [];
    for (const name of dataFiles) {
      if (name === 'schema.sql') continue;
      if (name === 'reference') { checkReference(path.join(dataDir, name), problems); continue; }
      problems.push('fichier dans data/ : ' + path.join(dataDir, name));
    }
  }
  if (problems.length) {
    throw new Error('GARDE-FOU : l’application contient des données personnelles, fabrication arrêtée.\n  '
      + problems.slice(0, 20).join('\n  '));
  }
  console.log('  • garde-fou : aucune base, aucun média, aucune sauvegarde dans l’application ✓');
}

exports.afterPack = async (context) => {
  copyPhpRuntime(context);
  verifyPackage(context);
};
exports.verifyPackage = verifyPackage;
