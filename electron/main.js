'use strict';
/**
 * Application de bureau « Carnet numérique des ancêtres ».
 * Electron lance PHP en arrière-plan (php-server.js) et affiche l'application dans une fenêtre.
 *
 *   npm start               données dans le dossier utilisateur du système
 *   npm run start:local     données = dossiers data/ et media/ du projet (pour tester avec tes copies)
 *   GENEALOGY_DATA_DIR=… GENEALOGY_MEDIA_DIR=… npm start     dossiers de ton choix
 */
const { app, BrowserWindow, Menu, Notification, dialog, ipcMain, session, shell } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { PhpServer, findPhp, checkPhp, devBundledPhp, SECRET_HEADER } = require('./php-server');

const APP_TITLE = 'Carnet numérique des ancêtres';
app.setName(APP_TITLE);
// Dossier des données de l'utilisateur : volontairement SANS accents ni espaces (PHP, SQLite et Windows
// s'entendent mieux ainsi). Mac : ~/Library/Application Support/CarnetNumeriqueAncetres
app.setPath('userData', process.env.CARNET_USER_DATA_DIR
  // Tests : dossier utilisateur séparé (permet aussi de lancer un test pendant qu'une autre fenêtre est ouverte).
  ? path.resolve(process.env.CARNET_USER_DATA_DIR)
  : path.join(app.getPath('appData'), 'CarnetNumeriqueAncetres'));

// Application empaquetée : le code PHP et PHP lui-même sont dans les « resources » (étape 5).
// En développement : le PHP embarqué de vendor/php/ (npm run fetch:php), sinon celui du système.
const APP_ROOT = app.isPackaged ? path.join(process.resourcesPath, 'php-app') : path.resolve(__dirname, '..');
const BUNDLED_PHP = app.isPackaged
  ? [path.join(process.resourcesPath, 'php', process.platform === 'win32' ? 'php.exe' : 'php')]
  : [devBundledPhp()];

const useProjectData = process.argv.includes('--use-project-data');
const selfTestFile = process.env.CARNET_SELFTEST || ''; // chemin d'une capture d'écran : test automatique puis fermeture

let server = null;
let win = null;
let quitting = false;

function paths() {
  const userData = app.getPath('userData');
  return {
    userData,
    dataDir: process.env.GENEALOGY_DATA_DIR || (useProjectData ? path.join(APP_ROOT, 'data') : path.join(userData, 'data')),
    mediaDir: process.env.GENEALOGY_MEDIA_DIR || (useProjectData ? path.join(APP_ROOT, 'media') : path.join(userData, 'media')),
    sessionDir: path.join(userData, 'sessions'),
    logFile: path.join(userData, 'logs', 'php.log'),
    configFile: path.join(userData, 'config.json'),
  };
}

function readConfig(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}
function writeConfig(file, config) {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(config, null, 2)); } catch { /* ignore */ }
}

async function fatal(title, message) {
  dialog.showErrorBox(title, message);
  quitting = true;
  try { if (server) await server.stop(); } catch { /* ignore */ }
  app.exit(1);
}

function buildMenu(p) {
  const isMac = process.platform === 'darwin';
  const open = (dir) => () => { fs.mkdirSync(dir, { recursive: true }); shell.openPath(dir); };
  const template = [
    ...(isMac ? [{
      label: 'LCNDA',
      submenu: [
        { role: 'about', label: 'À propos de LCNDA' }, { type: 'separator' },
        { role: 'hide', label: 'Masquer LCNDA' }, { role: 'hideOthers', label: 'Masquer les autres' },
        { role: 'unhide', label: 'Tout afficher' }, { type: 'separator' },
        { role: 'quit', label: 'Quitter LCNDA' },
      ],
    }] : []),
    {
      label: 'Fichier',
      submenu: [
        { label: 'Ouvrir le dossier des données', click: open(p.dataDir) },
        { label: 'Ouvrir le dossier des médias', click: open(p.mediaDir) },
        { label: 'Afficher le journal technique (PHP)', click: () => shell.showItemInFolder(p.logFile) },
        { type: 'separator' },
        { label: 'Recherche rapide…', accelerator: 'CmdOrCtrl+K', click: () => sendToPage('quick-search') },
        {
          label: 'Notifications des rappels', type: 'checkbox', checked: readConfig(p.configFile).reminderNotifications !== false,
          click: (item) => { writeConfig(p.configFile, { ...readConfig(p.configFile), reminderNotifications: item.checked }); checkReminders(); },
        },
        { type: 'separator' },
        isMac ? { role: 'close', label: 'Fermer la fenêtre' } : { role: 'quit', label: 'Quitter' },
      ],
    },
    {
      label: 'Édition',
      submenu: [
        { role: 'undo', label: 'Annuler' }, { role: 'redo', label: 'Rétablir' }, { type: 'separator' },
        { role: 'cut', label: 'Couper' }, { role: 'copy', label: 'Copier' }, { role: 'paste', label: 'Coller' },
        { role: 'selectAll', label: 'Tout sélectionner' },
      ],
    },
    {
      label: 'Affichage',
      submenu: [
        { role: 'reload', label: 'Recharger' }, { role: 'forceReload', label: 'Forcer le rechargement' }, { type: 'separator' },
        { role: 'resetZoom', label: 'Taille réelle' }, { role: 'zoomIn', label: 'Zoom avant' }, { role: 'zoomOut', label: 'Zoom arrière' }, { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein écran' },
        ...(app.isPackaged ? [] : [{ type: 'separator' }, { role: 'toggleDevTools', label: 'Outils de développement' }]),
      ],
    },
    {
      label: 'Fenêtre',
      submenu: [
        { role: 'minimize', label: 'Réduire' },
        ...(isMac ? [{ role: 'zoom', label: 'Agrandir' }, { type: 'separator' }, { role: 'front', label: 'Tout ramener au premier plan' }] : []),
        { role: 'close', label: 'Fermer la fenêtre' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    show: false, title: APP_TITLE, backgroundColor: '#fbfbfb',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, preload: path.join(__dirname, 'preload.js') },
  });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });
  // Si PHP est prêt avant que cette page ait fini de s'afficher, l'application la remplace aussitôt : ce
  // chargement interrompu (code -3, ERR_ABORTED) est normal, on ne le signale pas comme une erreur.
  win.loadFile(path.join(__dirname, 'loading.html')).catch(() => {});
  return win;
}

/** Commande envoyée à la page (menu de l'application) : la page l'écoute par window.lcnda.onCommand. */
function sendToPage(command) {
  if (!win || !server) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
  win.webContents.send('lcnda:command', command);
}

/**
 * Rappels arrivés à échéance : chiffre sur l'icône (Dock sur Mac, lanceur sous Linux) et notification du système,
 * une seule fois par rappel et par échéance (clés gardées dans reminders-notified.json). Vérifié au lancement puis
 * toutes les 15 minutes. Un clic sur la notification ouvre la liste des rappels.
 */
let reminderTimer = null;
async function checkReminders() {
  if (!server || quitting) return;
  const p = paths();
  const enabled = readConfig(p.configFile).reminderNotifications !== false;
  let data = { count: 0, due: [] };
  try {
    const r = await server.request('/api.php?action=due_reminders', { timeout: 30000 });
    if (r.status === 200) data = JSON.parse(r.body.toString());
  } catch { return; }
  try { app.setBadgeCount(enabled ? Number(data.count) || 0 : 0); } catch { /* système sans badge (Windows) */ }
  if (!enabled || !Notification.isSupported()) return;
  const file = path.join(p.userData, 'reminders-notified.json');
  const notified = new Set(readConfig(file).keys || []);
  const fresh = (data.due || []).filter((d) => !notified.has(d.key));
  if (!fresh.length) return;
  const first = fresh[0];
  const n = new Notification({
    title: fresh.length > 1 ? `${fresh.length} rappels à faire` : 'Rappel',
    body: fresh.length > 1 ? fresh.slice(0, 3).map((d) => '• ' + d.title).join('\n') + (fresh.length > 3 ? '\n…' : '') : `${first.title}\n${first.date_label} · ${first.origin}`,
  });
  n.on('click', () => sendToPage('open-reminders'));
  n.show();
  fresh.forEach((d) => notified.add(d.key));
  writeConfig(file, { keys: [...notified].slice(-500) });
}
ipcMain.on('lcnda:refresh-reminders', (event) => { if (fromApp(event)) checkReminders(); });

/**
 * Import d'un fichier choisi dans la fenêtre système (écran de démarrage). Un paquet MacFamilyTree (.mftpkg) est
 * un dossier : la page web ne peut pas l'envoyer (« Failed to fetch »). Le processus principal garde le chemin
 * choisi et ne donne à la page qu'un jeton à usage unique ; PHP lit ensuite le fichier sur place.
 */
const chosenFiles = new Map();
function fromApp(event) {
  return Boolean(server && win && event.sender === win.webContents && String(event.senderFrame?.url || '').startsWith(server.origin));
}
ipcMain.handle('lcnda:choose-import-file', async (event) => {
  if (!fromApp(event)) return { canceled: true };
  const result = await dialog.showOpenDialog(win, {
    title: 'Importer une généalogie',
    buttonLabel: 'Importer',
    // Sur Mac, un fichier Hérédis (.hmw) est un dossier : on autorise aussi le choix d'un dossier.
    properties: process.platform === 'darwin' ? ['openFile', 'openDirectory'] : ['openFile'],
    filters: [
      { name: 'Généalogies (GEDCOM, Hérédis, MacFamilyTree, sauvegarde LCNDA)', extensions: ['ged', 'gedcom', 'hmw', 'heredis', 'mftpkg', 'zip', 'gdz', 'db', 'sqlite'] },
      { name: 'Tous les fichiers', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const token = crypto.randomBytes(16).toString('hex');
  chosenFiles.clear();
  chosenFiles.set(token, result.filePaths[0]);
  return { token, name: path.basename(result.filePaths[0]) };
});
ipcMain.handle('lcnda:import-chosen-file', async (event, token, password) => {
  if (!fromApp(event)) return { status: 403, data: { error: 'Refusé' } };
  const filePath = chosenFiles.get(token);
  if (!filePath) return { status: 400, data: { error: 'Choisis d’abord un fichier.' } };
  try {
    const result = await server.importLocalFile(filePath, typeof password === 'string' ? password : '');
    // Sauvegarde protégée : on garde le fichier choisi le temps que la page demande le mot de passe
    if (!(result.status === 401 && result.data?.password_required)) chosenFiles.delete(token);
    return result;
  } catch (err) {
    chosenFiles.delete(token);
    return { status: 500, data: { error: 'Import impossible : ' + err.message } };
  }
});

/**
 * Pays des battues téléchargés à la demande : la page donne seulement un code pays ; l'adresse et l'empreinte sha256 viennent
 * du catalogue livré avec l'application ; le fichier n'est rangé (DATA_DIR/reference) que si l'empreinte est la bonne.
 */
const downloads = new Map();
ipcMain.handle('lcnda:download-reference', async (event, country) => {
  if (!fromApp(event)) return { ok: false, error: 'Refusé' };
  const cc = String(country || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return { ok: false, error: 'Pays inconnu.' };
  if (downloads.has(cc)) return downloads.get(cc);
  const job = (async () => {
    let catalogue;
    try { catalogue = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'data', 'reference', 'catalogue.json'), 'utf8')); }
    catch { return { ok: false, error: 'Catalogue des pays absent.' }; }
    const entry = catalogue.countries?.[cc];
    if (!entry || !/^geo-[a-z]{2}\.sqlite\.gz$/.test(entry.file || '') || !/^[0-9a-f]{64}$/.test(entry.sha256 || '')) return { ok: false, error: 'Pays inconnu du catalogue.' };
    const dir = path.join(paths().dataDir, 'reference');
    const target = path.join(dir, entry.file);
    if (fs.existsSync(target) || fs.existsSync(path.join(APP_ROOT, 'data', 'reference', entry.file))) return { ok: true, already: true };
    const base = process.env.LCNDA_REFERENCE_BASE_URL || catalogue.base_url || '';
    const partial = `${target}.${crypto.randomBytes(4).toString('hex')}.part`;
    try {
      fs.mkdirSync(dir, { recursive: true });
      const response = await fetch(base.replace(/\/+$/, '') + '/' + entry.file, { redirect: 'follow' });
      if (!response.ok) throw new Error(`le serveur répond ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (crypto.createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error('fichier abîmé (empreinte différente), rien n’a été installé');
      fs.writeFileSync(partial, bytes);
      fs.renameSync(partial, target);
      return { ok: true, size: bytes.length };
    } catch (err) {
      try { fs.unlinkSync(partial); } catch { /* rien à effacer */ }
      return { ok: false, error: 'Téléchargement impossible : ' + err.message + '. Vérifie la connexion à internet.' };
    } finally {
      downloads.delete(cc);
    }
  })();
  downloads.set(cc, job);
  return job;
});

/** La fenêtre ne peut afficher que l'application ; tout lien externe s'ouvre dans le navigateur. */
function lockNavigation(webContents, origin) {
  const external = (url) => { if (/^https?:/i.test(url)) shell.openExternal(url); };
  webContents.setWindowOpenHandler(({ url }) => {
    // Deuxième écran détaché (« Fenêtre ↗ » du panneau À côté) : vraie fenêtre de l'application, même pont et même sécurité
    if (url.startsWith(origin)) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 1280, height: 860, minWidth: 700, minHeight: 500, backgroundColor: '#fbfbfb',
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, preload: path.join(__dirname, 'preload.js') } } };
    }
    // Fenêtre vide que la page remplit elle-même pour une impression (graphique, feuille de mission aux archives,
    // bordereau de copies) : autorisée, isolée et sans accès au pont de l'application. Avant : bloquée (null).
    if (url === 'about:blank' || url === '') {
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: undefined } } };
    }
    external(url);
    return { action: 'deny' };
  });
  webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(origin) || url.startsWith('file:')) return;
    event.preventDefault();
    external(url);
  });
}

async function boot() {
  const p = paths();
  buildMenu(p);
  createWindow();

  const phpPath = findPhp(BUNDLED_PHP);
  if (!phpPath) {
    return fatal('PHP est introuvable',
      'L’application a besoin de PHP.\n\nEn développement : npm run fetch:php\n' +
      'Ou indique son chemin avec la variable GENEALOGY_PHP.');
  }
  const check = checkPhp(phpPath);
  if (!check.ok) {
    return fatal('PHP incomplet',
      `Le PHP trouvé (${phpPath}) ne convient pas.\n\n` +
      (check.error ? check.error : 'Extensions manquantes : ' + check.missing.join(', ')));
  }

  const config = readConfig(p.configFile);
  server = new PhpServer({
    phpPath, appRoot: APP_ROOT, dataDir: p.dataDir, mediaDir: p.mediaDir, sessionDir: p.sessionDir,
    logFile: p.logFile, preferredPort: config.port,
    workers: Number(process.env.CARNET_PHP_WORKERS) || 0,
    // Plusieurs PHP derrière un relais (php -S ne traite qu'une requête à la fois) : l'interface reste réactive
    // pendant une sauvegarde ou un export, et une page s'ouvre plus vite (mesuré : 994 → 659 ms).
    // CARNET_PHP_POOL=1 pour revenir à un seul PHP.
    pool: Number(process.env.CARNET_PHP_POOL) || 4,
  });
  server.on('error', (err) => fatal('PHP ne démarre pas', err.message + '\n\nJournal : ' + p.logFile));
  server.on('fatal', (err) => fatal('Le serveur de l’application s’est arrêté', err.message + '\n\nJournal : ' + p.logFile));

  try {
    await server.start();
  } catch (err) {
    return fatal('Démarrage impossible', err.message + '\n\nJournal : ' + p.logFile);
  }
  // Le même port d'un lancement à l'autre = la même « origine » web : le navigateur intégré conserve ainsi
  // les préférences d'affichage que l'interface range dans son localStorage.
  if (config.port !== server.port) writeConfig(p.configFile, { ...config, port: server.port });

  // Chaque requête de la fenêtre porte le secret ; router.php refuse tout le reste.
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [server.origin + '/*'] }, (details, callback) => {
    details.requestHeaders[SECRET_HEADER] = server.secret;
    callback({ requestHeaders: details.requestHeaders });
  });
  session.defaultSession.on('will-download', (event, item) => {
    item.setSaveDialogOptions({ defaultPath: path.join(app.getPath('downloads'), item.getFilename()) });
  });
  app.on('web-contents-created', (_event, contents) => lockNavigation(contents, server.origin));
  if (win) lockNavigation(win.webContents, server.origin);

  // Mise à jour éventuelle de la structure de la base, avant d'afficher l'interface.
  const slow = setTimeout(() => {
    if (win) win.webContents.executeJavaScript(
      "document.querySelector('p').textContent='Mise à jour de la base de données… (une copie de sécurité est faite d’abord)'",
    ).catch(() => {});
  }, 1500);
  let prepared;
  try {
    prepared = await server.prepareDatabase();
  } catch (err) {
    prepared = { ok: false, error: err.message };
  } finally {
    clearTimeout(slow);
  }
  if (!prepared.ok) {
    return fatal('La base de données n’a pas pu être ouverte', prepared.error + '\n\nJournal : ' + p.logFile);
  }

  if (win) {
    await win.loadURL(server.origin + (selfTestFile && process.env.CARNET_SELFTEST_PATH ? process.env.CARNET_SELFTEST_PATH : '/'));
    if (selfTestFile) await selfTest(selfTestFile);
  }
  if (!selfTestFile && !prepared.noDatabase) {
    setTimeout(() => checkReminders(), 8000);
    reminderTimer = setInterval(() => checkReminders(), 15 * 60 * 1000);
  }
}

/** Test automatique (CARNET_SELFTEST=chemin.png) : charge l'app, vérifie, prend une capture, quitte. */
async function selfTest(outFile) {
  await new Promise((r) => setTimeout(r, 2500));
  const report = await win.webContents.executeJavaScript(`({
    title: document.title,
    ready: window.GENEALOGY_READY,
    headings: [...document.querySelectorAll('h1,h2')].slice(0, 4).map(e => e.textContent.trim()),
    api: null
  })`);
  report.api = await win.webContents.executeJavaScript(
    "fetch('api.php?action=bootstrap').then(r => r.status).catch(e => String(e))");
  // Une image du dossier des médias se charge-t-elle dans la fenêtre (routeur + secret) ?
  const firstMedia = fs.existsSync(paths().mediaDir) ? fs.readdirSync(paths().mediaDir).find((f) => !f.startsWith('.')) : null;
  if (firstMedia) {
    report.imageLoad = await win.webContents.executeJavaScript(
      `new Promise((res) => { const i = new Image(); i.onload = () => res('ok ' + i.naturalWidth + 'x' + i.naturalHeight); i.onerror = () => res('ERREUR'); i.src = 'media/${firstMedia}'; })`);
  }
  const image = await win.webContents.capturePage();
  fs.writeFileSync(outFile, image.toPNG());
  fs.writeFileSync(outFile + '.json', JSON.stringify(report, null, 2));
  quitting = true;
  await server.stop();
  app.exit(0);
}

if (!app.requestSingleInstanceLock()) {
  app.quit(); // une seule fenêtre à la fois : deux instances se disputeraient la même base
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(boot);
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', (event) => {
    if (quitting || !server) return;
    event.preventDefault();
    quitting = true;
    clearInterval(reminderTimer);
    try { app.setBadgeCount(0); } catch { /* ignore */ }
    server.stop().finally(() => app.quit());
  });
}
