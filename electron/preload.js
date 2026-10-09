'use strict';
/**
 * Pont minimal entre la page et l'application de bureau (fenêtre isolée, sandbox). La page peut seulement :
 * ouvrir la fenêtre système de choix d'un fichier à importer, puis lancer l'import du fichier choisi ; télécharger les
 * communes d'un pays des battues (code pays seulement).
 * Elle ne voit jamais de chemin et ne peut pas en désigner un elle-même.
 */
const { contextBridge, ipcRenderer } = require('electron');

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
});
