'use strict';
/**
 * Pont minimal entre la page et l'application de bureau (fenêtre isolée, sandbox). La page peut seulement :
 * ouvrir la fenêtre système de choix d'un fichier à importer, puis lancer l'import du fichier choisi ; télécharger les
 * communes d’un pays des battues (code pays seulement) ; poser, retirer ou régler un widget sur le bureau (sorte connue seulement) ;
 * lister les navigateurs installés et y ouvrir une page de l’application (aperçu en direct d’un site ; adresse vérifiée) ;
 * regarder s’il existe une nouvelle version, la télécharger (vérifiée par empreinte) et l’ouvrir.
 * Elle ne voit jamais de chemin et ne peut pas en désigner un elle-même.
 */
const { contextBridge, ipcRenderer } = require('electron');
const deskOpts = (o) => (o && typeof o === 'object' ? { onTop: o.onTop === true, label: String(o.label || '').slice(0, 60), date: String(o.date || '').slice(0, 10) } : {});

contextBridge.exposeInMainWorld('lcnda', {
  /** @returns {Promise<{canceled: true} | {token: string, name: string}>} */
  chooseImportFile: () => ipcRenderer.invoke('lcnda:choose-import-file'),
  /** @returns {Promise<{status: number, data: object}>} */
  importChosenFile: (token, password) => ipcRenderer.invoke('lcnda:import-chosen-file', String(token || ''), typeof password === 'string' ? password : ''),
  /** Télécharge les communes d'un pays des battues (adresse et empreinte : catalogue de l'application). */
  downloadReference: (country) => ipcRenderer.invoke('lcnda:download-reference', String(country || '')),
  /** Commandes du menu de l'application (« quick-search », « open-reminders ») ; la page ne reçoit que leur nom. */
  /** Recalcule le chiffre des rappels sur l'icône (après une modification). */
  refreshReminders: () => ipcRenderer.send('lcnda:refresh-reminders'),
  /** Raccourcis clavier choisis dans l'application, pour les afficher dans le menu ({id: {combo, label, register}}). */
  setShortcuts: (items) => ipcRenderer.send('lcnda:set-shortcuts', items && typeof items === 'object' ? JSON.parse(JSON.stringify(items)) : {}),
  onCommand: (callback) => ipcRenderer.on('lcnda:command', (_event, command) => callback(String(command || ''))),
  /** 🪟 Widgets sur le bureau : seulement une sorte connue et trois réglages (au-dessus, texte et date du compte à rebours). */
  desktopWidgets: {
    list: () => ipcRenderer.invoke('lcnda:desk-widgets', 'list', '', {}),
    open: (kind, opts) => ipcRenderer.invoke('lcnda:desk-widgets', 'open', String(kind || ''), deskOpts(opts)),
    set: (kind, opts) => ipcRenderer.invoke('lcnda:desk-widgets', 'set', String(kind || ''), deskOpts(opts)),
    close: (kind) => ipcRenderer.invoke('lcnda:desk-widgets', 'close', String(kind || ''), {}),
    autostart: (on) => ipcRenderer.invoke('lcnda:desk-widgets', 'autostart', '', { on: on === true }),
  },
  /** 🌐 Navigateurs installés : [{id: 'safari'|'chrome'|'firefox'|'edge'|'brave'|'opera'|'chromium', name, installed}] */
  listBrowsers: () => ipcRenderer.invoke('lcnda:browsers'),
  /** Ouvre une page de l'application (http://127.0.0.1:port/… : l'aperçu en direct) dans ce navigateur ('default' : celui du système).
   *  @returns {Promise<{ok: boolean, error?: string}>} */
  openInBrowser: (id, url) => ipcRenderer.invoke('lcnda:open-in-browser', String(id || ''), String(url || '')),
  /** 🔄 Mises à jour : regarder la dernière version (GitHub), télécharger l'installateur de cet ordinateur (vérifié par
   *  empreinte) puis l'ouvrir ; la page ne donne ni adresse ni chemin. */
  updates: {
    info: () => ipcRenderer.invoke('lcnda:updates', 'info', {}),
    check: (force) => ipcRenderer.invoke('lcnda:updates', 'check', { force: force === true }),
    setPrefs: (p) => ipcRenderer.invoke('lcnda:updates', 'prefs', p && typeof p === 'object' ? { ...(typeof p.auto === 'boolean' ? { auto: p.auto } : {}), ...(typeof p.skip === 'string' ? { skip: p.skip.slice(0, 40) } : {}), ...(typeof p.later === 'boolean' ? { later: p.later } : {}) } : {}),
    download: () => ipcRenderer.invoke('lcnda:updates', 'download', {}),
    cancel: () => ipcRenderer.invoke('lcnda:updates', 'cancel', {}),
    open: () => ipcRenderer.invoke('lcnda:updates', 'open', {}),
    show: () => ipcRenderer.invoke('lcnda:updates', 'show', {}),
    page: () => ipcRenderer.invoke('lcnda:updates', 'page', {}),
    onProgress: (callback) => ipcRenderer.on('lcnda:update-progress', (_event, p) => callback({ received: Number(p && p.received) || 0, total: Number(p && p.total) || 0 })),
  },
});
