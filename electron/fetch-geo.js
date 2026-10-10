'use strict';
/**
 * Fabrique le répertoire mondial des lieux livré avec l'app :   npm run fetch:geo
 *
 * data/reference/geo-world.sqlite.gz (~140 Mo, ~5 millions de lieux habités hors France) dépasse la limite de taille
 * de GitHub : il n'est pas dans le dépôt. Ce script télécharge la source officielle (GeoNames allCountries.zip,
 * CC BY 4.0, ~420 Mo, gardée 30 jours dans vendor/geo/.cache) puis lance scripts/build-reference-world.php.
 * La France (data/reference/geo-fr.sqlite.gz) est, elle, dans le dépôt.
 *
 * L'application le lance toute seule au premier démarrage s'il manque (electron/main.js, option --auto) :
 * l'archive source (~420 Mo) est alors effacée une fois le répertoire fabriqué.
 */
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { spawnSync } = require('node:child_process');
const { findPhp, devBundledPhp, phpRuntimeArgs } = require('./php-server');

const ROOT = path.resolve(__dirname, '..');
const AUTO = process.argv.includes('--auto');
const CACHE = process.env.LCNDA_GEO_CACHE || path.join(ROOT, 'vendor', 'geo', '.cache');
const URL_ALL = 'https://download.geonames.org/export/dump/allCountries.zip';
const OUT = process.env.LCNDA_GEO_OUT || path.join(ROOT, 'data', 'reference', 'geo-world.sqlite.gz');

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  const archive = path.join(CACHE, 'allCountries.zip');
  const fresh = fs.existsSync(archive) && Date.now() - fs.statSync(archive).mtimeMs < 30 * 86400e3;
  if (fresh) {
    console.log('Source déjà présente : ' + archive);
  } else {
    console.log('Téléchargement de GeoNames allCountries.zip (~420 Mo)…');
    const res = await fetch(URL_ALL, { redirect: 'follow' });
    if (!res.ok || !res.body) throw new Error(`téléchargement impossible (${res.status}) : ${URL_ALL}`);
    const part = archive + '.' + process.pid + '.part'; // propre à ce lancement
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(part));
    fs.renameSync(part, archive);
  }
  if (fs.statSync(archive).size < 100 * 1024 * 1024) throw new Error('archive GeoNames trop petite : téléchargement incomplet ?');
  const php = process.env.LCNDA_PHP || findPhp([devBundledPhp()]);
  if (!php) throw new Error('PHP introuvable : lance d’abord « npm run fetch:php »');
  console.log('Fabrication du répertoire mondial (environ 1 minute)…');
  const r = spawnSync(php, [...phpRuntimeArgs(php), '-d', 'memory_limit=2G', path.join(ROOT, 'scripts', 'build-reference-world.php'), archive, OUT], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('fabrication du répertoire mondial impossible');
  console.log('  ✓ ' + path.relative(ROOT, OUT) + ' (' + (fs.statSync(OUT).size / 1048576).toFixed(1) + ' Mo)');
  if (AUTO) fs.rmSync(archive, { force: true }); // place libérée : la source n'est plus utile
}

main().catch((err) => { console.error('✗ ' + err.message); process.exit(1); });
