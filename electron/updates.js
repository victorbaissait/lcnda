'use strict';
/**
 * 🔄 Mises à jour de LCNDA (processus principal d'Electron ; aussi pour Node : tests/test-mises-a-jour.js).
 *
 * - Une seule requête : la dernière version publiée du dépôt GitHub victorbaissait/lcnda (API publique, sans clé,
 *   sans rien envoyer d'autre que la requête elle-même). Au plus une fois par jour (résultat gardé), sauf « Rechercher ».
 * - Plus récente que la version de l'app : l'installateur qui va avec l'ordinateur (mac arm64/x64 .dmg, Windows .exe,
 *   Linux AppImage ou .deb selon la façon dont l'app est installée), téléchargé dans « Téléchargements », puis vérifié
 *   avec l'empreinte du fichier SHA256SUMS.txt de la même version : un fichier abîmé est effacé. Rien n'est installé
 *   tout seul (les installateurs ne sont pas signés) : la personne l'ouvre elle-même.
 * - Adresses refusées si elles ne sont pas celles du dépôt (une réponse forgée ne peut pas faire télécharger ailleurs).
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const REPO = 'victorbaissait/lcnda';
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const DOWNLOAD_PREFIX = `https://github.com/${REPO}/releases/download/`;
const PAGE_PREFIX = `https://github.com/${REPO}/releases/`;
const SUMS_NAME = 'SHA256SUMS.txt';
const DAY = 24 * 3600 * 1000;
const MAX_SIZE = 1024 * 1024 * 1024; // 1 Go : un installateur fait ≈ 300 Mo

/** « v0.9.2 », « 0.9.2-beta.1 » → {nums: [0, 9, 2], pre: 'beta.1'} ; null si ce n'est pas une version */
function parseVersion(v) {
  const m = /^v?(\d{1,5})(?:\.(\d{1,5}))?(?:\.(\d{1,5}))?(?:-([0-9A-Za-z.-]{1,40}))?$/.exec(String(v || '').trim());
  if (!m) return null;
  return { nums: [Number(m[1]), Number(m[2] || 0), Number(m[3] || 0)], pre: m[4] || '' };
}
/** -1 si a < b, 0 si égales, 1 si a > b (une préversion passe avant la version finale : 0.9.2-beta < 0.9.2) */
function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x.nums[i] !== y.nums[i]) return x.nums[i] < y.nums[i] ? -1 : 1;
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  const pa = x.pre.split('.'), pb = y.pre.split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined) return -1;
    if (pb[i] === undefined) return 1;
    const na = /^\d+$/.test(pa[i]), nb = /^\d+$/.test(pb[i]);
    if (na && nb && Number(pa[i]) !== Number(pb[i])) return Number(pa[i]) < Number(pb[i]) ? -1 : 1;
    if (na !== nb) return na ? -1 : 1;
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

/** Façon dont l'app est installée : dmg (Mac), exe (Windows), AppImage ou deb (Linux) */
function currentFormat(platform = process.platform, env = process.env) {
  if (platform === 'darwin') return 'dmg';
  if (platform === 'win32') return 'exe';
  if (platform === 'linux') return env && env.APPIMAGE ? 'AppImage' : 'deb';
  return '';
}

/**
 * Le bon installateur parmi les fichiers de la version (noms de .github/workflows/build.yml et de package.json → build) :
 * LCNDA-0.9.2-mac-arm64.dmg, LCNDA-0.9.2-mac-x64.dmg, LCNDA-0.9.2-windows-x64.exe,
 * LCNDA-0.9.2-linux-x86_64.AppImage, LCNDA-0.9.2-linux-arm64.AppImage, LCNDA-0.9.2-linux-amd64.deb, LCNDA-0.9.2-linux-arm64.deb.
 */
function pickAsset(assets, { platform = process.platform, arch = process.arch, format = currentFormat(platform) } = {}) {
  const list = Array.isArray(assets) ? assets.filter((a) => a && typeof a.name === 'string') : [];
  const a64 = arch === 'arm64';
  let os, ext, arches;
  if (platform === 'darwin') { os = 'mac'; ext = 'dmg'; arches = a64 ? ['arm64'] : ['x64']; }
  else if (platform === 'win32') { os = 'windows'; ext = 'exe'; arches = a64 ? ['arm64', 'x64'] : ['x64']; } // Windows ARM fait tourner le x64
  else if (platform === 'linux') {
    os = 'linux'; ext = format === 'AppImage' ? 'AppImage' : 'deb';
    arches = ext === 'AppImage' ? (a64 ? ['arm64', 'aarch64'] : ['x86_64', 'x64']) : (a64 ? ['arm64'] : ['amd64', 'x64']);
  } else return null;
  for (const ar of arches) {
    const re = new RegExp(`^LCNDA-[0-9][0-9A-Za-z.-]*-${os}-${ar}\\.${ext}$`);
    const hit = list.find((a) => re.test(a.name));
    if (hit) return hit;
  }
  return null;
}

/** « <empreinte>  <nom> » (sha256sum, shasum -a 256, « *nom » en binaire) → Map nom → empreinte */
function parseSums(text) {
  const out = new Map();
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line);
    if (m) out.set(path.basename(m[2].replace(/\\/g, '/')), m[1].toLowerCase());
  }
  return out;
}

/** Une adresse de téléchargement du dépôt (pas d'ailleurs) */
const okDownload = (url, prefix = DOWNLOAD_PREFIX) => typeof url === 'string' && url.startsWith(prefix) && !/[\s#?]|\.\.\//.test(url.slice(prefix.length));
const okPage = (url, prefix = PAGE_PREFIX) => typeof url === 'string' && url.startsWith(prefix) && /^[\w./%-]*$/.test(url.slice(prefix.length));

/** Ce qu'on garde de la réponse de GitHub (petit, sans le texte des nouveautés en entier) */
function slimRelease(raw, { downloadPrefix = DOWNLOAD_PREFIX, pagePrefix = PAGE_PREFIX } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const tag = String(raw.tag_name || '');
  if (!parseVersion(tag) || raw.draft) return null;
  return {
    tag: tag.slice(0, 40),
    version: tag.replace(/^v/, '').slice(0, 40),
    page: okPage(raw.html_url, pagePrefix) ? raw.html_url : pagePrefix + 'latest',
    published: /^\d{4}-\d\d-\d\dT[\d:]+Z$/.test(raw.published_at || '') ? raw.published_at : '',
    notes: String(raw.body || '').slice(0, 4000),
    prerelease: !!raw.prerelease,
    assets: (Array.isArray(raw.assets) ? raw.assets : []).slice(0, 60)
      .filter((a) => a && typeof a.name === 'string' && /^[\w.+-]{1,120}$/.test(a.name) && okDownload(a.browser_download_url, downloadPrefix))
      .map((a) => ({ name: a.name, size: Math.max(0, Number(a.size) || 0), url: a.browser_download_url })),
  };
}

/** Résumé pour la page : version d'ici, dernière version, plus récente ?, le fichier pour cet ordinateur */
function summarize(release, current, sys = {}) {
  if (!release) return { ok: false, current, error: 'Réponse de GitHub incomprise.' };
  const asset = pickAsset(release.assets, sys);
  return {
    ok: true, current, latest: release.version, tag: release.tag, newer: compareVersions(release.version, current) > 0,
    page: release.page, published: release.published, notes: release.notes,
    asset: asset ? { name: asset.name, size: asset.size } : null,
    hasSums: release.assets.some((a) => a.name === SUMS_NAME),
  };
}

/** Prévenir ? (réglage « automatiquement », plus récente, pas « Ne plus me prévenir pour cette version », pas « Plus tard ») */
function shouldNotify(info, prefs = {}, now = Date.now()) {
  if (!info || !info.ok || !info.newer) return false;
  if (prefs.auto === false) return false;
  if (prefs.skip && compareVersions(prefs.skip, info.latest) === 0) return false;
  if (Number(prefs.laterUntil) > now) return false;
  return true;
}

/** Préférences propres (lues dans config.json) */
function cleanPrefs(p) {
  const o = p && typeof p === 'object' ? p : {};
  return {
    auto: o.auto !== false,
    skip: parseVersion(o.skip) ? String(o.skip).replace(/^v/, '') : '',
    laterUntil: Number.isFinite(Number(o.laterUntil)) ? Number(o.laterUntil) : 0,
    lastCheck: Number.isFinite(Number(o.lastCheck)) ? Number(o.lastCheck) : 0,
    release: o.release && typeof o.release === 'object' ? o.release : null,
  };
}

/**
 * Regarde la dernière version (ou reprend celle gardée depuis moins d'un jour, sauf force).
 * @returns {Promise<{info, prefs, fromCache: boolean}>} ; prefs mis à jour (lastCheck, release) à ranger par l'appelant
 */
async function check({ fetchImpl = globalThis.fetch, current, prefs = {}, force = false, now = Date.now(), apiUrl = API_URL, sys = {}, downloadPrefix, pagePrefix } = {}) {
  const p = cleanPrefs(prefs);
  if (!force && p.release && now - p.lastCheck < DAY && now >= p.lastCheck) {
    return { info: summarize(p.release, current, sys), prefs: p, fromCache: true };
  }
  let res;
  try {
    res = await fetchImpl(apiUrl, { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, redirect: 'follow', credentials: 'omit' });
  } catch (err) {
    return { info: { ok: false, current, error: 'Pas de réponse de GitHub : vérifie la connexion à internet.' }, prefs: p, fromCache: false };
  }
  if (res.status === 404) return { info: { ok: false, current, error: 'Aucune version publiée pour l’instant.' }, prefs: p, fromCache: false };
  if (res.status === 403 || res.status === 429) return { info: { ok: false, current, error: 'GitHub demande d’attendre un peu (trop de demandes). Réessaie dans une heure.' }, prefs: p, fromCache: false };
  if (!res.ok) return { info: { ok: false, current, error: `GitHub répond ${res.status}. Réessaie plus tard.` }, prefs: p, fromCache: false };
  let raw;
  try { const text = await res.text(); if (text.length > 2e6) throw new Error('trop long'); raw = JSON.parse(text); }
  catch { return { info: { ok: false, current, error: 'Réponse de GitHub incomprise.' }, prefs: p, fromCache: false }; }
  const release = slimRelease(raw, { downloadPrefix, pagePrefix });
  if (!release) return { info: { ok: false, current, error: 'Réponse de GitHub incomprise.' }, prefs: p, fromCache: false };
  const next = { ...p, release, lastCheck: now };
  return { info: summarize(release, current, sys), prefs: next, fromCache: false };
}

/** Empreinte sha256 d'un fichier */
function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file).on('error', reject).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex')));
  });
}

/** Nom libre dans le dossier : « LCNDA-0.9.2-mac-arm64 (1).dmg » si le premier existe déjà */
function freeName(dir, name) {
  const ext = path.extname(name), base = name.slice(0, name.length - ext.length);
  for (let i = 0; i < 1000; i++) {
    const f = path.join(dir, i ? `${base} (${i})${ext}` : name);
    if (!fs.existsSync(f)) return f;
  }
  return path.join(dir, `${base}-${Date.now()}${ext}`);
}

/**
 * Télécharge l'installateur de cette version dans dir, avec onProgress(reçu, total), puis vérifie son empreinte
 * dans SHA256SUMS.txt de la même version. Un fichier dont l'empreinte ne va pas est effacé.
 * @returns {Promise<{ok: true, file, name, sha256} | {ok: false, error}>}
 */
async function download({ fetchImpl = globalThis.fetch, release, sys = {}, dir, onProgress = () => {}, downloadPrefix = DOWNLOAD_PREFIX, signal } = {}) {
  if (!release || !Array.isArray(release.assets)) return { ok: false, error: 'Recherche d’abord la mise à jour.' };
  const asset = pickAsset(release.assets, sys);
  if (!asset) return { ok: false, error: 'Pas d’installateur pour cet ordinateur dans cette version.' };
  const sumsAsset = release.assets.find((a) => a.name === SUMS_NAME);
  if (!sumsAsset) return { ok: false, error: 'Cette version n’a pas de fichier d’empreintes (SHA256SUMS.txt) : téléchargement refusé par prudence.' };
  if (!okDownload(asset.url, downloadPrefix) || !okDownload(sumsAsset.url, downloadPrefix)) return { ok: false, error: 'Adresse de téléchargement inattendue : refusé.' };
  let expected;
  try {
    const r = await fetchImpl(sumsAsset.url, { redirect: 'follow', credentials: 'omit', signal });
    if (!r.ok) throw new Error(String(r.status));
    expected = parseSums((await r.text()).slice(0, 200000)).get(asset.name);
  } catch { return { ok: false, error: 'Le fichier d’empreintes n’a pas pu être lu. Vérifie la connexion à internet.' }; }
  if (!expected) return { ok: false, error: 'L’installateur n’est pas dans le fichier d’empreintes : téléchargement refusé par prudence.' };
  fs.mkdirSync(dir, { recursive: true });
  const target = freeName(dir, asset.name);
  const part = target + '.part';
  const hash = crypto.createHash('sha256');
  let received = 0;
  try {
    const r = await fetchImpl(asset.url, { redirect: 'follow', credentials: 'omit', signal });
    if (!r.ok || !r.body) throw new Error(`le serveur répond ${r.status}`);
    const total = Number(r.headers.get('content-length')) || asset.size || 0;
    if (total > MAX_SIZE) throw new Error('fichier trop gros');
    const out = fs.createWriteStream(part);
    const done = new Promise((resolve, reject) => { out.on('finish', resolve); out.on('error', reject); });
    let last = 0;
    for await (const chunk of r.body) {
      const buf = Buffer.from(chunk);
      received += buf.length;
      if (received > MAX_SIZE) throw new Error('fichier trop gros');
      hash.update(buf);
      if (!out.write(buf)) await new Promise((res) => out.once('drain', res));
      const t = Date.now();
      if (t - last > 120) { last = t; onProgress(received, total); }
    }
    out.end();
    await done;
    onProgress(received, total || received);
  } catch (err) {
    try { fs.unlinkSync(part); } catch { /* rien */ }
    if (signal && signal.aborted) return { ok: false, error: 'Téléchargement arrêté.', aborted: true };
    return { ok: false, error: 'Téléchargement impossible : ' + (err && err.message ? err.message : 'erreur') + '. Vérifie la connexion à internet.' };
  }
  const got = hash.digest('hex');
  if (got !== expected) {
    try { fs.unlinkSync(part); } catch { /* rien */ }
    return { ok: false, error: 'Le fichier téléchargé est abîmé (empreinte différente) : il a été effacé. Réessaie.' };
  }
  fs.renameSync(part, target);
  return { ok: true, file: target, name: path.basename(target), sha256: got, size: received };
}

module.exports = {
  REPO, API_URL, DOWNLOAD_PREFIX, PAGE_PREFIX, SUMS_NAME, DAY,
  parseVersion, compareVersions, currentFormat, pickAsset, parseSums, okDownload, okPage, slimRelease, summarize,
  shouldNotify, cleanPrefs, check, sha256File, freeName, download,
};
