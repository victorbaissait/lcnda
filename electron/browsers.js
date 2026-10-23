'use strict';
/**
 * 🌐 « Ouvrir dans un navigateur précis » (Mon site web → aperçu en direct) : les navigateurs installés et leur lancement.
 * Sans Electron (testable avec Node) : main.js s'en sert, la page n'en voit que la liste [{id, name, installed}].
 *  - détection : macOS (/Applications/…app, ~/Applications), Windows (Program Files, Program Files (x86), LocalAppData),
 *    Linux (programmes trouvés dans le PATH, sans shell) ;
 *  - lancement : execFile en tableau d'arguments (jamais de shell) ; seulement une adresse http de l'app elle-même
 *    (127.0.0.1 ou localhost, même port) : la page ne peut pas faire ouvrir un site quelconque.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');

const BROWSERS = [
  { id: 'safari', name: 'Safari', mac: ['Safari'], win: [], linux: [] },
  { id: 'chrome', name: 'Google Chrome', mac: ['Google Chrome'], win: ['PF/Google/Chrome/Application/chrome.exe', 'PF86/Google/Chrome/Application/chrome.exe', 'LAD/Google/Chrome/Application/chrome.exe'], linux: ['google-chrome', 'google-chrome-stable'] },
  { id: 'firefox', name: 'Firefox', mac: ['Firefox'], win: ['PF/Mozilla Firefox/firefox.exe', 'PF86/Mozilla Firefox/firefox.exe', 'LAD/Mozilla Firefox/firefox.exe'], linux: ['firefox', 'firefox-esr'] },
  { id: 'edge', name: 'Microsoft Edge', mac: ['Microsoft Edge'], win: ['PF86/Microsoft/Edge/Application/msedge.exe', 'PF/Microsoft/Edge/Application/msedge.exe'], linux: ['microsoft-edge', 'microsoft-edge-stable'] },
  { id: 'brave', name: 'Brave', mac: ['Brave Browser'], win: ['PF/BraveSoftware/Brave-Browser/Application/brave.exe', 'PF86/BraveSoftware/Brave-Browser/Application/brave.exe', 'LAD/BraveSoftware/Brave-Browser/Application/brave.exe'], linux: ['brave-browser', 'brave'] },
  { id: 'opera', name: 'Opera', mac: ['Opera'], win: ['LAD/Programs/Opera/opera.exe', 'LAD/Programs/Opera/launcher.exe', 'PF/Opera/launcher.exe', 'PF86/Opera/launcher.exe'], linux: ['opera'] },
  { id: 'chromium', name: 'Chromium', mac: ['Chromium'], win: ['LAD/Chromium/Application/chrome.exe', 'PF/Chromium/Application/chrome.exe'], linux: ['chromium', 'chromium-browser'] },
];
const IDS = BROWSERS.map((b) => b.id);

const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

/** Le programme (Windows, Linux) ou l'application .app (macOS) d'un navigateur, ou null */
function locate(b, platform = process.platform, env = process.env) {
  if (platform === 'darwin') {
    for (const app of b.mac) for (const dir of ['/Applications', path.join(os.homedir(), 'Applications'), '/System/Applications', '/System/Volumes/Preboot/Cryptexes/App/System/Applications']) {
      const p = path.join(dir, app + '.app');
      if (isDir(p)) return p;
    }
    return null;
  }
  if (platform === 'win32') {
    const roots = { PF: env.ProgramFiles || 'C:\\Program Files', PF86: env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', LAD: env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local') };
    for (const rel of b.win) {
      const [root, ...rest] = rel.split('/');
      const p = path.win32.join(roots[root], ...rest);
      if (isFile(p)) return p;
    }
    return null;
  }
  for (const exe of b.linux) for (const dir of String(env.PATH || '').split(path.delimiter)) {
    const p = dir && path.join(dir, exe);
    if (p && isFile(p)) { try { fs.accessSync(p, fs.constants.X_OK); return p; } catch { /* pas exécutable */ } }
  }
  return null;
}

/** [{id, name, installed}] pour la page (jamais de chemin) */
function listBrowsers(platform = process.platform, env = process.env) {
  return BROWSERS.map((b) => ({ id: b.id, name: b.name, installed: Boolean(locate(b, platform, env)) }));
}

/** Une adresse de l'app : http://127.0.0.1:PORT/… ou http://localhost:PORT/… (même port que le serveur), sans identifiants */
function isAppUrl(url, origin) {
  try {
    const u = new URL(String(url)), o = new URL(String(origin));
    return u.protocol === 'http:' && o.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname) && u.port === o.port && !u.username && !u.password;
  } catch { return false; }
}

/** [programme, arguments] pour ouvrir l'adresse dans ce navigateur, ou null s'il n'est pas installé */
function launchCommand(id, url, platform = process.platform, env = process.env) {
  const b = BROWSERS.find((x) => x.id === id);
  const where = b && locate(b, platform, env);
  if (!where) return null;
  if (platform === 'darwin') return ['/usr/bin/open', ['-a', where, url]];
  return [where, [url]];
}

/** Ouvre l'adresse ; 'default' = le navigateur par défaut (shell.openExternal, fourni par main.js) */
function openInBrowser(id, url, origin, openExternal) {
  if (!isAppUrl(url, origin)) return Promise.resolve({ ok: false, error: 'Adresse refusée : seulement une page de l’application.' });
  const href = new URL(url).href;
  if (id === 'default') return Promise.resolve(openExternal(href)).then(() => ({ ok: true }), (e) => ({ ok: false, error: String(e && e.message || e) }));
  if (!IDS.includes(id)) return Promise.resolve({ ok: false, error: 'Navigateur inconnu.' });
  const cmd = launchCommand(id, href);
  if (!cmd) return Promise.resolve({ ok: false, error: 'Ce navigateur n’est pas installé sur cet ordinateur.' });
  return new Promise((resolve) => {
    // macOS : « open » rend la main tout de suite
    if (process.platform === 'darwin') { execFile(cmd[0], cmd[1], { timeout: 15000 }, (err) => resolve(err ? { ok: false, error: 'Ouverture impossible : ' + err.message } : { ok: true })); return; }
    // Windows, Linux : le navigateur lui-même, détaché (il reste ouvert après l'app), sans shell
    const child = spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore', windowsHide: false, shell: false });
    child.once('error', (err) => resolve({ ok: false, error: 'Ouverture impossible : ' + err.message }));
    child.once('spawn', () => { child.unref(); resolve({ ok: true }); });
  });
}

module.exports = { BROWSERS, IDS, locate, listBrowsers, isAppUrl, launchCommand, openInBrowser };
