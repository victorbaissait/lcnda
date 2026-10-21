/* LCNDA — K3 Les mêmes mots pour les mêmes boutons, K11 Une action = un symbole (validés ; mode d'emploi : docs/UI.md « K3 et K11 »).
 *
 * K3 — un seul mot par geste :
 *   « Créer » + ce qu'on crée (« Créer le livre ») pour une chose nouvelle ; « Enregistrer » pour une chose qui existe ;
 *   « Ajouter » pour mettre une chose dans une autre ; « Relier » pour attacher deux fiches ;
 *   « ↺ Remettre comme au départ » pour revenir au départ ; « Fermer » seul pour une fenêtre qui ne fait que montrer.
 * K11 — le petit dictionnaire des symboles (UI.SYMBOLS) : ⤒ importer, ⤓ exporter / télécharger, 💾 enregistrer, 🖨 imprimer…
 *
 * API (window.LCNDA_UI, aussi window.LCNDA_APP.ui) :
 *   UI.createLabel('Nouvelle enquête')   → « Créer l’enquête » (null si le titre ne commence pas par Nouveau / Nouvelle / Nouvel)
 *   UI.WORDS, UI.SYMBOLS                 les mots et les symboles validés
 * Filet de sécurité : à l'ouverture d'une fenêtre dont le titre est « Nouveau… », le bouton principal qui dit seulement
 * « Enregistrer » ou « Créer » devient « Créer le … » ; il reprend son mot d'origine quand la même fenêtre s'ouvre pour
 * modifier (« Modifier l’enquête » → « Enregistrer »). data-k3-off sur la fenêtre ou le bouton : rien ne change.
 */
(() => {
    'use strict';
    const UI = window.LCNDA_UI = window.LCNDA_UI || {};
    const WORDS = Object.freeze({create: 'Créer', save: 'Enregistrer', add: 'Ajouter', link: 'Relier', reset: '↺ Remettre comme au départ',
        close: 'Fermer', cancel: 'Annuler', remove: 'Retirer', del: 'Supprimer', edit: 'Modifier'});
    const SYMBOLS = Object.freeze({import: '⤒', export: '⤓', download: '⤓', save: '💾', print: '🖨', edit: '✎', delete: '🗑', close: '×', remove: '×',
        open: '↗', undo: '↶', redo: '↷', settings: '⚙️', search: '🔍', add: '＋', create: '＋', copy: '📋', paste: '📋', duplicate: '⧉', more: '⋯',
        favorite: '⭐', file: '📁', link: '🔗', reset: '↺', fullscreen: '⛶', share: '📤'});
    const VOWEL = /^[aàâeéèêëiîïoôuùûyœæh]/i;
    /** « Nouvelle enquête » → « Créer l’enquête » ; « 📘 Nouveau livret » → « Créer le livret » ; « Nouveau » → « Créer » */
    function createLabel(title) {
        const t = String(title || '').replace(/^[^\p{L}]+/u, '').trim();
        const m = t.match(/^(nouveaux|nouvelles|nouveau|nouvelle|nouvel)(?:\s+(.*))?$/iu);
        if (!m) return null;
        let what = (m[2] || '').split(/\s+[—–:(«]|\s+-\s|…/)[0].replace(/[\s.!?]+$/, '').trim();
        if (!what) return WORDS.create;
        if (what.length > 32) return WORDS.create; // un long titre : le mot seul
        const w = m[1].toLowerCase();
        const art = /^nouve(aux|lles)$/.test(w) ? 'les ' : w === 'nouvel' || VOWEL.test(what) ? 'l’' : w === 'nouvelle' ? 'la ' : 'le ';
        return `${WORDS.create} ${art}${what}`;
    }
    const GENERIC = new Set(['enregistrer', 'créer', 'valider', 'ok']);
    function primaryOf(dlg) {
        const foot = dlg.querySelector('.modal-actions'); if (!foot) return null;
        return foot.querySelector('button[type=submit]:not(.secondary)') || [...foot.querySelectorAll('button.button:not(.secondary):not(.danger)')].pop() || null;
    }
    /** le filet K3 : à chaque ouverture, le bouton principal d'une fenêtre « Nouveau… » dit ce qu'il crée */
    function fixPrimary(dlg) {
        if (!dlg || dlg.hasAttribute('data-k3-off')) return;
        const b = primaryOf(dlg); if (!b || b.hasAttribute('data-k3-off') || b.children.length) return;
        if (b.dataset.k3Word !== undefined) { b.textContent = b.dataset.k3Word; delete b.dataset.k3Word; } // la même fenêtre, rouverte pour modifier
        const word = b.textContent.trim(); if (!GENERIC.has(word.toLowerCase())) return;
        const h = dlg.querySelector('.modal-head h2, h2'); const label = h && createLabel(h.textContent);
        if (!label || label === word) return;
        b.dataset.k3Word = b.textContent; b.textContent = label;
    }
    if (typeof HTMLDialogElement !== 'undefined') {
        const nativeShow = HTMLDialogElement.prototype.showModal;
        HTMLDialogElement.prototype.showModal = function (...args) { try { fixPrimary(this); } catch (_) {} return nativeShow.apply(this, args); };
    }
    Object.assign(UI, {WORDS, SYMBOLS, createLabel, fixPrimaryLabel: fixPrimary});
    const hook = () => { const app = window.LCNDA_APP; if (app) { app.ui = app.ui || UI; app.createLabel = createLabel; } };
    hook(); if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', hook);
})();
