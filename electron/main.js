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

/**
 * Raccourcis clavier choisis dans l'application (Maintenance → Raccourcis) : la page les envoie au démarrage et après
 * chaque changement ; le menu est refait pour les afficher. Un clic sur l'élément du menu (ou sa touche) renvoie la
 * commande « shortcut:<id> » à la fenêtre active, qui applique les mêmes règles que la touche lue dans la page.
 */
let menuPaths = null;
let shortcutItems = {};
const ACCEL_KEYS = { ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', Enter: 'Return', Escape: 'Esc', '+': 'Plus' };
function toAccelerator(combo) {
  if (!combo || typeof combo !== 'string' || combo.length > 40) return '';
  const raw = combo === '+' ? ['+'] : combo.endsWith('++') ? [...combo.slice(0, -2).split('+').filter(Boolean), '+'] : combo.split('+');
  const key = raw.pop();
  const mods = raw.map((m) => ({ Mod: 'CmdOrCtrl', Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Meta: 'Super' }[m]));
  if (mods.some((m) => !m)) return '';
  const k = ACCEL_KEYS[key] || key;
  if (!/^([A-Z0-9]|F[1-9]|F1[0-9]|F2[0-4]|Left|Right|Up|Down|Return|Esc|Space|Tab|Backspace|Delete|Plus|[,\-=.;/`])$/.test(k)) return '';
  return [...mods, k].join('+');
}
function sendShortcut(id) {
  const target = BrowserWindow.getFocusedWindow() || win;
  if (!target || !server) return;
  target.webContents.send('lcnda:command', 'shortcut:' + id);
}
function buildMenu(p) {
  if (p) menuPaths = p; else p = menuPaths;
  const isMac = process.platform === 'darwin';
  const open = (dir) => () => { fs.mkdirSync(dir, { recursive: true }); shell.openPath(dir); };
  /** Élément de menu d'un raccourci de l'application. */
  const sk = (id, label) => {
    const item = shortcutItems[id] || {};
    const accel = toAccelerator(item.combo);
    const entry = { label: item.label || label, click: () => sendShortcut(id) };
    if (accel && item.register) entry.accelerator = accel;
    // Raccourci affiché sans être « pris » par le menu (lettre seule, ⌘← dans une case de texte…) : Windows et Linux
    else if (accel && !isMac) { entry.accelerator = accel; entry.registerAccelerator = false; }
    return entry;
  };
  const go = Array.from({ length: 9 }, (_, i) => shortcutItems[`go_${i + 1}`]?.label ? sk(`go_${i + 1}`, '') : null).filter(Boolean);
  const template = [
    ...(isMac ? [{
      label: 'LCNDA',
      submenu: [
        { role: 'about', label: 'À propos de LCNDA' }, { type: 'separator' },
        sk('settings', 'Réglages…'), { type: 'separator' },
        { role: 'hide', label: 'Masquer LCNDA' }, { role: 'hideOthers', label: 'Masquer les autres' },
        { role: 'unhide', label: 'Tout afficher' }, { type: 'separator' },
        { role: 'quit', label: 'Quitter LCNDA' },
      ],
    }] : []),
    {
      label: 'Fichier',
      submenu: [
        sk('new_window', 'Nouvelle fenêtre'), sk('new_person', 'Nouvelle personne…'), { type: 'separator' },
        sk('quick_search', 'Recherche rapide…'), sk('find', 'Chercher dans l’écran…'), { type: 'separator' },
        sk('backup_now', 'Sauvegarder maintenant'), sk('print', 'Imprimer…'), { type: 'separator' },
        ...(isMac ? [] : [sk('settings', 'Réglages (Apparence)'), { type: 'separator' }]),
        { label: 'Ouvrir le dossier des données', click: open(p.dataDir) },
        { label: 'Ouvrir le dossier des médias', click: open(p.mediaDir) },
        { label: 'Afficher le journal technique (PHP)', click: () => shell.showItemInFolder(p.logFile) },
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
        // Mac : Annuler / Rétablir passent par la page (dans une case de texte : annuler la frappe ; ailleurs : annuler la
        // dernière modification d'une fiche grâce au journal, avec confirmation). Windows / Linux : comportement standard.
        ...(isMac
          ? [{ label: 'Annuler', accelerator: 'Cmd+Z', click: () => sendShortcut('edit_undo') }, { label: 'Rétablir', accelerator: 'Shift+Cmd+Z', click: () => sendShortcut('edit_redo') }]
          : [{ role: 'undo', label: 'Annuler' }, { role: 'redo', label: 'Rétablir' }]),
        { type: 'separator' },
        { role: 'cut', label: 'Couper' }, { role: 'copy', label: 'Copier' }, { role: 'paste', label: 'Coller' },
        { role: 'selectAll', label: 'Tout sélectionner' },
        ...(isMac ? [] : [{ type: 'separator' }, { label: 'Annuler la dernière modification d’une fiche…', click: () => sendShortcut('undo') }]),
      ],
    },
    {
      label: 'Affichage',
      submenu: [
        sk('split', 'Diviser l’écran en deux'), sk('split_orientation', 'Écran divisé : côte à côte / haut et bas'), sk('switch_half', 'Passer à l’autre moitié de l’écran'), { type: 'separator' },
        { role: 'reload', label: 'Recharger' }, { role: 'forceReload', label: 'Forcer le rechargement' }, { type: 'separator' },
        // ⌘ + / ⌘ − / ⌘ 0 (Ctrl sur PC et Linux) : la frise du montage, l'onde du son ou la photo retouchée si l'une est ouverte, sinon toute la page
        ...[['Taille réelle', 'CommandOrControl+0', 0, true], ['Zoom avant', 'CommandOrControl+=', 1, true], ['Zoom avant', 'CommandOrControl+Plus', 1, false], ['Zoom avant', 'CommandOrControl+numadd', 1, false],
          ['Zoom arrière', 'CommandOrControl+-', -1, true], ['Zoom arrière', 'CommandOrControl+numsub', -1, false]].map(([label, accelerator, dir, visible]) => ({label, accelerator, visible, acceleratorWorksWhenHidden: true,
          click: async (_item, w) => {
            const wc = (w || win)?.webContents; if (!wc) return;
            let done = false; try { done = await wc.executeJavaScript(`!!(window.LCNDA_EXT && window.LCNDA_EXT.editorZoom && window.LCNDA_EXT.editorZoom(${dir}))`); } catch (_) {}
            if (!done) wc.setZoomLevel(dir === 0 ? 0 : Math.max(-3, Math.min(4, wc.getZoomLevel() + dir * 0.5)));
          }})), { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein écran' },
        ...(app.isPackaged ? [] : [{ type: 'separator' }, { role: 'toggleDevTools', label: 'Outils de développement' }]),
      ],
    },
    {
      label: 'Aller',
      submenu: [
        sk('back', 'Écran précédent'), sk('forward', 'Écran suivant'), { type: 'separator' },
        ...go, ...(go.length ? [{ type: 'separator' }] : []),
        sk('go_root', 'De cujus (personne de départ)'),
      ],
    },
    {
      label: 'Fiche',
      submenu: [
        sk('edit_person', 'Modifier la fiche'), sk('bookmark', 'Ajouter aux signets / retirer'), sk('copy_ref', 'Copier la référence'), { type: 'separator' },
        sk('add_event', 'Ajouter un événement…'), sk('add_media', 'Ajouter un média…'), sk('add_source', 'Ajouter une source…'), sk('add_reminder', 'Créer un rappel…'),
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
    {
      role: 'help',
      label: 'Aide',
      submenu: [
        sk('help', 'Raccourcis clavier'),
        { label: 'Personnaliser les raccourcis…', click: () => sendShortcut('customize_shortcuts') },
      ],
    },
  ];
  try { Menu.setApplicationMenu(Menu.buildFromTemplate(template)); }
  catch (error) { console.error('Menu :', error.message); shortcutItems = {}; if (template.length) Menu.setApplicationMenu(Menu.buildFromTemplate(template.map((m) => ({ ...m, submenu: (m.submenu || []).map(({ accelerator, registerAccelerator, ...rest }) => rest) })))); }
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
  return Boolean(server && win && event.sender === win.webContents && sameOrigin(event.senderFrame?.url || '', server.origin));
}
/** Raccourcis envoyés par une fenêtre de l'application (principale ou détachée) : seulement des noms et des touches. */
ipcMain.on('lcnda:set-shortcuts', (event, items) => {
  const fromWindow = server && BrowserWindow.getAllWindows().some((w) => w.webContents === event.sender) && sameOrigin(event.senderFrame?.url || '', server.origin);
  if (!fromWindow || !items || typeof items !== 'object') return;
  const clean = {};
  for (const [id, item] of Object.entries(items).slice(0, 100)) {
    if (!/^[a-z0-9_]{1,40}$/.test(id) || !item || typeof item !== 'object') continue;
    clean[id] = { combo: typeof item.combo === 'string' ? item.combo.slice(0, 40) : '', label: typeof item.label === 'string' ? item.label.slice(0, 60) : '', register: item.register === true };
  }
  shortcutItems = clean;
  buildMenu();
});
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

/** Même origine que le serveur de l'application (pas « http://127.0.0.1:port@autre-site/ », qui commence pareil). */
function sameOrigin(url, origin) {
  try { return new URL(String(url)).origin === new URL(origin).origin; } catch { return false; }
}
const LOADING_URL = require('url').pathToFileURL(path.join(__dirname, 'loading.html')).href;

/**
 * Fenêtre « à côté » pour consulter un site (Geneanet, Filae… depuis une fiche en ligne) : une page web ordinaire,
 * isolée (pas de pont vers l'application, session à part), où l'on peut naviguer. Une seule, réutilisée.
 */
const sideWindows = new WeakSet();
const SIDE_FRAME = 'lcnda-side';
let sideWindow = null;

/** Ouvre (ou réutilise) la fenêtre « à côté ». Créée par l'application : sans lien vers elle (pas d'opener), session à part. */
function openSideWindow(url) {
  if (sideWindow && !sideWindow.isDestroyed()) { sideWindow.webContents.loadURL(url); sideWindow.show(); sideWindow.focus(); return; }
  sideWindow = new BrowserWindow({ width: 1100, height: 900, autoHideMenuBar: true, title: 'Recherche',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, partition: 'persist:lcnda-web' } });
  sideWindows.add(sideWindow.webContents);
  sideWindow.on('closed', () => { sideWindow = null; });
  sideWindow.loadURL(url);
}

/** La fenêtre ne peut afficher que l'application ; tout lien externe s'ouvre dans le navigateur. */
function lockNavigation(webContents, origin) {
  const external = (url) => { if (/^https?:/i.test(url)) shell.openExternal(url); };
  const sideSafe = (url) => /^https?:/i.test(url) && !sameOrigin(url, origin);
  webContents.setWindowOpenHandler(({ url, frameName }) => {
    // dans la fenêtre « à côté » : un lien « nouvel onglet » s'ouvre dans cette même fenêtre (jamais l'app, jamais d'onglets en rafale)
    if (sideWindows.has(webContents)) { if (sideSafe(url)) webContents.loadURL(url); return { action: 'deny' }; }
    if (frameName === SIDE_FRAME && sideSafe(url)) { openSideWindow(url); return { action: 'deny' }; }
    // Deuxième écran détaché (« Fenêtre ↗ » du panneau À côté) : vraie fenêtre de l'application, même pont et même sécurité
    if (sameOrigin(url, origin)) {
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
  // fenêtre « à côté » : redirections et cadres aussi, pour qu'elle ne charge jamais l'application ni autre chose que le web
  const sideGuard = (event, url) => { if (sideWindows.has(webContents) && !sideSafe(url)) event.preventDefault(); };
  webContents.on('will-redirect', sideGuard);
  webContents.on('will-frame-navigate', (event) => { if (sideWindows.has(webContents) && !sideSafe(event.url)) event.preventDefault(); });
  webContents.on('will-navigate', (event, url) => {
    if (sideWindows.has(webContents)) { if (!sideSafe(url)) event.preventDefault(); return; } // le site consulté navigue librement, sans jamais charger l'application
    if (sameOrigin(url, origin) || url.split('#')[0] === LOADING_URL) return;
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
  // Permissions : l'application n'obtient que ce dont elle se sert (micro et caméra pour enregistrer et dicter,
  // notifications, presse-papiers pour coller une image, plein écran, souris capturée pendant la visite de la maison,
  // liste des polices de l'ordinateur pour la fenêtre « Toutes les polices » : 'local-fonts', API queryLocalFonts),
  // et seulement pour ses propres pages. Les sites ouverts dans la fenêtre « à côté » n'obtiennent rien.
  const APP_PERMISSIONS = new Set(['media', 'notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'pointerLock', 'local-fonts']);
  const appAsks = (wc, permission, url) => APP_PERMISSIONS.has(permission) && sameOrigin(url || wc?.getURL?.() || '', server.origin);
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => callback(appAsks(wc, permission, details?.requestingUrl)));
  session.defaultSession.setPermissionCheckHandler((wc, permission, requestingOrigin) => appAsks(wc, permission, requestingOrigin));
  const webSession = session.fromPartition('persist:lcnda-web');
  webSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  webSession.setPermissionCheckHandler(() => false);
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
  if (!selfTestFile) ensureWorldPlaces(p, phpPath);
}

/**
 * Toutes les localités du monde (~5 millions, GeoNames) : data/reference/geo-world.sqlite.gz est livré dans l'application
 * construite, mais il n'est pas dans le dépôt Git (trop gros). En développement (git pull + npm start), il est donc
 * téléchargé et fabriqué tout seul, une fois, en arrière-plan (electron/fetch-geo.js --auto). En attendant, la recherche
 * de lieux utilise le répertoire de secours tiré des fichiers des pays (lib/reference.php). Un échec (pas d'Internet)
 * est retenté au lancement suivant, au plus une fois par jour.
 */
let worldFetch = null;
function ensureWorldPlaces(p, phpPath) {
  if (app.isPackaged || process.env.LCNDA_NO_WORLD_FETCH) return;
  const out = path.join(APP_ROOT, 'data', 'reference', 'geo-world.sqlite.gz');
  if (fs.existsSync(out)) return;
  const marker = path.join(p.dataDir, 'cache', 'geo-world-essai.json');
  try { if (Date.now() - JSON.parse(fs.readFileSync(marker, 'utf8')).at < 86400e3) return; } catch (_) {}
  try { fs.mkdirSync(path.dirname(marker), { recursive: true }); fs.writeFileSync(marker, JSON.stringify({ at: Date.now() })); } catch (_) {}
  const toast = (text) => { if (win && !win.isDestroyed()) win.webContents.executeJavaScript(`window.LCNDA_APP?.toast(${JSON.stringify(text)})`).catch(() => {}); };
  const log = fs.openSync(path.join(path.dirname(p.logFile), 'geo-world.log'), 'a');
  const { spawn } = require('node:child_process');
  setTimeout(() => toast('Préparation de toutes les villes du monde (une seule fois, quelques minutes en arrière-plan)…'), 4000);
  worldFetch = spawn(process.execPath, [path.join(__dirname, 'fetch-geo.js'), '--auto'], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', LCNDA_GEO_OUT: out, LCNDA_PHP: phpPath },
    stdio: ['ignore', log, log],
  });
  worldFetch.marker = marker;
  worldFetch.on('exit', (code) => {
    worldFetch = null;
    try { fs.closeSync(log); } catch (_) {}
    if (code === 0 && fs.existsSync(out)) { try { fs.rmSync(marker, { force: true }); } catch (_) {} toast('Toutes les villes du monde sont prêtes : la recherche de lieux les propose maintenant.'); }
  });
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
  // Menu avec les raccourcis envoyés par la page (Maintenance → Raccourcis)
  report.menu = (Menu.getApplicationMenu()?.items || []).map((m) => ({ label: m.label, items: (m.submenu?.items || []).filter((i) => i.type !== 'separator').map((i) => i.label + (i.accelerator ? ' [' + i.accelerator + (i.registerAccelerator === false ? ' affiché' : '') + ']' : '')) }));
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
  app.on('will-quit', () => { if (worldFetch) { try { worldFetch.kill(); fs.rmSync(worldFetch.marker, { force: true }); } catch (_) {} } }); // repris au prochain lancement
  app.on('before-quit', (event) => {
    if (quitting || !server) return;
    event.preventDefault();
    quitting = true;
    clearInterval(reminderTimer);
    try { app.setBadgeCount(0); } catch { /* ignore */ }
    server.stop().finally(() => app.quit());
  });
}
