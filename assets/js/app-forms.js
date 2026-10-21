/* LCNDA — K1 Erreurs dans les formulaires (validé ; mode d'emploi : docs/UI.md « K1 »).
 * Une seule façon de dire qu'il manque quelque chose : le champ fautif est encadré de rouge, la phrase juste dessous,
 * le curseur va dans le premier champ à corriger, la fenêtre reste ouverte, en haut « N choses à corriger » s'il y en a
 * plusieurs, et l'erreur s'efface dès qu'on corrige. La bulle du navigateur n'est plus jamais montrée : les champs
 * « required », « min », « type=email »… gardent leur règle mais s'affichent de la même façon (événement « invalid »).
 * Le message en bas à gauche (toast) reste pour ce qui échoue APRÈS l'envoi (base verrouillée, réseau…).
 *
 * API (window.LCNDA_UI, aussi window.LCNDA_APP.ui) :
 *   UI.fieldError(champ, 'Donne un titre.')    marque le champ (élément, ou nom / sélecteur dans le formulaire en cours)
 *   UI.fail(champ, 'Donne un titre.')          idem + curseur dans le premier champ fautif ; renvoie false
 *                                              (dans un onSubmit : « return UI.fail(f.elements.title, '…') » garde la fenêtre)
 *   throw UI.invalid(champ, '…')               une erreur que openDialog montre sous le champ (pas de toast)
 *   UI.validateForm(form)                      règles du navigateur + data-required ; affiche tout ; true si tout va bien
 *   UI.formErrors(form, [[champ, '…'], …])     plusieurs erreurs d'un coup ; true s'il n'y en a aucune
 *   UI.clearFieldError(champ) / UI.clearFormErrors(form)
 */
(() => {
    'use strict';
    const UI = window.LCNDA_UI = window.LCNDA_UI || {};
    const A = () => window.LCNDA_APP || {};
    const plural = (n, one, many) => (A().plural ? A().plural(n, one, many) : `${n} ${Math.abs(n) < 2 ? one : (many || one + 's')}`);
    const toast = (m, k) => (A().toast ? A().toast(m, k) : console.warn(m));
    const ERR = 'ui-field-error', BAD = 'is-invalid', SUM = 'ui-form-errors';
    let seq = 0, current = null; // le formulaire en cours d'envoi (pour UI.fail('nom', …))

    const visible = el => !!el && el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const WRAPS = '.pk, .h-place, .mpk-field, .ui-color, .ui-date-box, .ui-search, .ui-num, .ui-range-pair, .file-pick, .ui-font, .ui-toggle';
    const FOCUSABLE = 'input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable=""], [contenteditable=true]';

    /** Le champ désigné : un élément, un nom (form.elements) ou un sélecteur, cherché dans le formulaire en cours. */
    function resolve(field, scope) {
        if (field instanceof Element) return field;
        if (field && typeof field === 'object' && field[0] instanceof Element) return field[0]; // RadioNodeList
        if (typeof field !== 'string' || !field) return null;
        const root = scope || current || topDialog() || document;
        const byName = root.elements?.namedItem?.(field) || root.querySelector?.(`[name="${CSS.escape(field)}"]`);
        if (byName) return byName instanceof Element ? byName : byName[0] || null;
        try { return root.querySelector(field); } catch (_) { return null; }
    }
    function topDialog() { const ds = [...document.querySelectorAll('dialog[open]')]; return ds.at(-1) || null; }
    const formOf = el => el?.form || el?.closest?.('form') || el?.closest?.('dialog') || null;

    /** L'élément qu'on encadre : la case elle-même, ou l'habillage autour (menu de choix, couleur, date, fichier…). */
    function boxOf(el) {
        const wrap = el.closest(WRAPS);
        if (wrap) return wrap;
        if (/^(checkbox|radio)$/.test(el.type || '')) return el.closest('label, .checkbox-line, fieldset') || el;
        if (el.type === 'hidden' || !visible(el)) {
            // champ caché : la zone visible qui le suit (un composant posé à côté) ou son parent
            const sib = el.nextElementSibling;
            if (sib && visible(sib)) return sib;
            let p = el.parentElement; while (p && !visible(p)) p = p.parentElement;
            return p || el;
        }
        return el;
    }
    /** Où poser la phrase : juste sous l'encadré (dans un label « en colonne », sinon après le label en ligne). */
    function anchorOf(box) {
        const lab = box.parentElement;
        if (lab && lab.tagName === 'LABEL') {
            const d = getComputedStyle(lab).display;
            if (!/grid|block/.test(d) || d === 'inline-block') return lab;
        }
        return box;
    }

    function clearFieldError(field) {
        const el = resolve(field); if (!el) return;
        const box = el.classList?.contains(BAD) ? el : (el._uiErrBox || el.closest?.('.' + BAD) || null);
        if (!box) return;
        const form = box._uiErrForm;
        box.classList.remove(BAD);
        box._uiErrMsg?.remove(); box._uiErrMsg = null;
        (box._uiErrFields || []).forEach(f => { f.removeAttribute('aria-invalid'); f.removeAttribute('aria-errormessage'); f._uiErrBox = null; });
        box._uiErrFields = null;
        if (form) summary(form);
    }
    function clearFormErrors(form) {
        if (!form) return;
        form.querySelectorAll('.' + BAD).forEach(b => clearFieldError(b));
        const host = summaryHost(form); host?.querySelector(':scope > .' + SUM)?.remove();
        form.querySelectorAll('.' + ERR).forEach(m => m.remove());
    }

    /** Marque un champ ; renvoie l'encadré (ou null si le champ est introuvable : le message part alors en toast). */
    function fieldError(field, message, {scope = null, toastIfMissing = true} = {}) {
        const el = resolve(field, scope);
        const text = String(message ?? '').trim() || 'À corriger.';
        if (!el) { if (toastIfMissing) toast(text, 'error'); return null; }
        const box = boxOf(el), form = formOf(el) || formOf(box);
        if (box.classList.contains(BAD) && box._uiErrMsg) { box._uiErrMsg.querySelector('span').textContent = text; }
        else {
            box.classList.add(BAD);
            const msg = document.createElement('span');
            msg.className = ERR; msg.id = `ui-err-${++seq}`; msg.setAttribute('role', 'alert');
            msg.innerHTML = '<b aria-hidden="true">⛔</b> <span></span>';
            msg.querySelector('span').textContent = text;
            anchorOf(box).after(msg);
            box._uiErrMsg = msg; box._uiErrFields = [];
        }
        if (!box._uiErrFields.includes(el)) box._uiErrFields.push(el);
        el._uiErrBox = box; box._uiErrForm = form;
        el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-errormessage', box._uiErrMsg.id);
        if (form) summary(form);
        return box;
    }

    /** « ⛔ N choses à corriger avant d'enregistrer. » en haut de la fenêtre, s'il y en a plusieurs. */
    function summaryHost(form) {
        return form.querySelector?.(':scope > .h-dialog-body') || form;
    }
    function summary(form) {
        const host = summaryHost(form); if (!host) return;
        const n = form.querySelectorAll('.' + BAD).length;
        let s = host.querySelector(':scope > .' + SUM);
        if (n < 2) { s?.remove(); return; }
        if (!s) {
            s = document.createElement('div');
            s.className = `ui-notice ui-notice-error ${SUM}`; s.setAttribute('role', 'alert');
            const head = host.querySelector(':scope > .modal-head');
            if (head) head.after(s); else host.prepend(s);
        }
        s.innerHTML = `<span class="ui-notice-ico" aria-hidden="true">⛔</span><span><b>${plural(n, 'chose', 'choses')} à corriger</b> avant d’enregistrer.</span>`;
    }

    /** Curseur dans le premier champ fautif du formulaire (ordre de la page). */
    function focusFirst(form) {
        const box = form?.querySelector?.('.' + BAD); if (!box) return;
        const f = (box._uiErrFields || []).find(x => visible(x) && x.matches(FOCUSABLE)) || (box.matches(FOCUSABLE) && visible(box) ? box : [...box.querySelectorAll(FOCUSABLE)].find(visible));
        // un onglet ou un <details> fermé : on l'ouvre pour montrer le champ
        let d = box.closest('details:not([open])'); while (d) { d.open = true; d = d.parentElement?.closest('details:not([open])'); }
        try { (f || box).focus({preventScroll: true}); } catch (_) {}
        try { box.scrollIntoView({block: 'center', behavior: 'smooth'}); } catch (_) {}
    }

    /** Marque + curseur ; renvoie false (à renvoyer tel quel par un onSubmit pour garder la fenêtre ouverte). */
    function fail(field, message, opts = {}) {
        const box = fieldError(field, message, opts);
        if (box) focusFirst(box._uiErrForm || formOf(box));
        return false;
    }
    /** Une erreur à lancer dans un onSubmit d'openDialog : montrée sous le champ, pas en toast. */
    function invalid(field, message) {
        const e = new Error(String(message ?? '')); e.uiField = field; return e;
    }
    /** Pour openDialog et les fenêtres faites à la main : une erreur attrapée → sous le champ si elle en désigne un. */
    function showError(error, form) {
        if (!error) return false;
        if (error.uiShown) return true;
        if (error.uiField != null) { const box = fieldError(error.uiField, error.message, {scope: form, toastIfMissing: false}); if (box) { focusFirst(box._uiErrForm || form); return true; } }
        return false;
    }

    /* ── règles du navigateur, dites en français simple ── */
    function nativeMessage(el) {
        if (el.dataset?.error) return el.dataset.error;
        const v = el.validity; if (!v) return 'À corriger.';
        const t = (el.type || '').toLowerCase(), n = x => String(x).replace('.', ',');
        if (v.customError && el.validationMessage) return el.validationMessage;
        if (v.valueMissing) {
            if (t === 'checkbox') return 'Coche cette case pour continuer.';
            if (t === 'radio') return 'Choisis une des possibilités.';
            if (t === 'file') return 'Choisis un fichier.';
            if (el.tagName === 'SELECT' || t === 'hidden') return 'Choisis dans la liste.';
            return 'Ce champ est à remplir.';
        }
        if (v.badInput) return t === 'number' ? 'Écris un nombre (par exemple 12 ou 3,5).' : 'Ce n’est pas compris : vérifie ce qui est écrit.';
        if (v.typeMismatch) return t === 'email' ? 'Écris une adresse e-mail complète (nom@exemple.fr).' : t === 'url' ? 'Écris une adresse web complète (https://…).' : 'Ce n’est pas au bon format.';
        if (v.rangeUnderflow) return `Au moins ${n(el.min)}.`;
        if (v.rangeOverflow) return `Au plus ${n(el.max)}.`;
        if (v.stepMismatch) return 'Cette valeur n’est pas permise ici : prends un nombre rond.';
        if (v.tooShort) return `Au moins ${plural(Number(el.minLength), 'caractère', 'caractères')} (là : ${String(el.value).length}).`;
        if (v.tooLong) return `Au plus ${plural(Number(el.maxLength), 'caractère', 'caractères')}.`;
        if (v.patternMismatch) return el.title ? el.title : 'Ce n’est pas au bon format.';
        return el.validationMessage || 'À corriger.';
    }
    const emptyHidden = el => el.type === 'hidden' && el.hasAttribute('data-required') && !String(el.value || '').trim();

    function validateForm(form, {focus = true} = {}) {
        if (!form) return true;
        clearFormErrors(form);
        const seen = new Set(); let bad = 0;
        for (const el of form.elements || form.querySelectorAll('input, select, textarea')) {
            if (el.closest('[data-ui-off]')) continue;
            let msg = '';
            if (emptyHidden(el)) msg = el.dataset.error || 'Choisis dans la liste.';
            else if (el.willValidate && !el.validity.valid) msg = nativeMessage(el);
            if (!msg) continue;
            if (el.type === 'radio' && seen.has(el.name)) continue; seen.add(el.name);
            fieldError(el, msg, {scope: form}); bad++;
        }
        if (bad && focus) focusFirst(form);
        return !bad;
    }
    function formErrors(form, list, {focus = true} = {}) {
        if (form) clearFormErrors(form);
        const rows = Array.isArray(list) ? list : Object.entries(list || {});
        let n = 0;
        rows.forEach(([f, m]) => { if (m && fieldError(f, m, {scope: form})) n++; });
        if (n && focus) focusFirst(form);
        return !n;
    }

    /* ── la bulle du navigateur remplacée : même rendu, pour les 100 et quelques champs « required »… ── */
    const pending = new Map();
    document.addEventListener('invalid', e => {
        const el = e.target, form = el.form;
        if (!form || el.closest('[data-ui-off]')) return;
        e.preventDefault(); // pas de bulle
        if (!pending.has(form)) {
            pending.set(form, []);
            setTimeout(() => { // (pas de microtâche : elle passerait entre deux événements « invalid » du même envoi)
                const list = pending.get(form) || []; pending.delete(form);
                clearFormErrors(form);
                const seen = new Set();
                list.forEach(x => { if (x.type === 'radio') { if (seen.has(x.name)) return; seen.add(x.name); } fieldError(x, nativeMessage(x), {scope: form}); });
                focusFirst(form);
            });
        }
        pending.get(form).push(el);
    }, true);
    // à chaque envoi : on repart de zéro (le formulaire refait ses vérifications) ; « current » sert à UI.fail('nom', …)
    document.addEventListener('submit', e => {
        const form = e.target; if (!(form instanceof HTMLFormElement)) return;
        clearFormErrors(form); current = form;
        setTimeout(() => { if (current === form) current = null; }, 0);
    }, true);
    // l'erreur s'efface dès qu'on corrige
    const fixed = e => {
        const t = e.target; if (!(t instanceof Element)) return;
        const box = t._uiErrBox || t.closest('.' + BAD);
        if (box) clearFieldError(box);
    };
    ['input', 'change', 'picker-change'].forEach(type => document.addEventListener(type, fixed, true));

    /* ── K6 : le bas de fenêtre toujours là. Filet de sécurité : une fenêtre ouverte sans bas (.modal-actions) reçoit
     *    « Fermer » (qui passe par son propre ×). Les éditeurs et grands espaces de travail (barre du haut E1, ⛶) n'en ont pas.
     *    data-no-foot sur la fenêtre : pas de bas ajouté. ── */
    const NO_FOOT = '.is-full, .vx-dlg, .h-hs-dlg, .h-tx-dlg, .h-ar-dlg, .ar-dlg, .bl-dlg, .oe-dlg, .kn-dlg, .ly-editor, .h-museum-editor, .h-retouch, .h-retouch-simple, .h-rt2, .h-ss-dlg, .h-avx, .h-as, .h-dg-dlg, .mpk-dialog, [data-no-foot]';
    const HAS_FOOT = ':scope > .modal-actions, :scope > form > .modal-actions, .modal-actions:last-child, .mpk-foot, .ui-topbar, .ar-top, [data-full-toggle]';
    function ensureFoot(dlg) {
        if (!dlg.classList?.contains('modal') || dlg.matches(NO_FOOT) || dlg.querySelector(HAS_FOOT)) return;
        const host = dlg.querySelector(':scope > form') || dlg;
        const foot = document.createElement('div');
        foot.className = 'modal-actions'; foot.dataset.k6Auto = '';
        foot.innerHTML = '<span class="spacer"></span><button type="button" class="button secondary">Fermer</button>';
        foot.querySelector('button').addEventListener('click', () => {
            const x = dlg.querySelector('.modal-head [data-close], .modal-head [data-x], .modal-head [data-h-close], .modal-head .icon-button[aria-label="Fermer"], .modal-head button.icon-button:last-of-type');
            const shut = () => { if (dlg.open && dlg.dispatchEvent(new Event('cancel', {cancelable: true}))) dlg.close(); };
            if (x) { x.click(); setTimeout(shut, 0); } else shut(); // le × de la fenêtre d'abord (ses propres gestes), sinon on ferme
        });
        host.appendChild(foot);
    }
    const nativeShow = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal = function (...args) { const r = nativeShow.apply(this, args); try { ensureFoot(this); } catch (_) {} return r; };

    Object.assign(UI, {ensureDialogFoot: ensureFoot, fieldError: (f, m, o) => { const b = fieldError(f, m, o); return !!b; }, fail, invalid, showFormError: showError, validateForm, formErrors, clearFieldError, clearFormErrors, focusFirstError: focusFirst});
    const hook = () => { const app = window.LCNDA_APP; if (app) { app.ui = app.ui || UI; Object.assign(app, {fieldError: UI.fieldError, failField: fail}); } };
    hook(); document.addEventListener('DOMContentLoaded', hook);
})();
