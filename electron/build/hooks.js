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
      if (entry.isFile() && MEDIA.test(entry.name)) problems.push('média : ' + full);
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
