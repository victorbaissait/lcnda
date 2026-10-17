/* LCNDA — 🖼️ La visionneuse d'images réglable (Maintenance → « Visionneuse d'images ») :
 *  - la colonne de droite est rangée en rubriques (rattaché à, intitulé, date, calendrier, correspondance, cote, note,
 *    transcription, étiquettes, personnes identifiées…) : on choisit leur ordre et celles qu'on montre ;
 *  - « Calendrier de cette date » (visionneuse, événements, médias) : on choisit les calendriers proposés et leur ordre.
 * Réglages : genealogie-lightbox-sections et genealogie-calendar-choices (gardés avec les autres réglages).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (...a) => A().toast(...a);
    const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof v === 'object' ? v : d; } catch (_) { return d; } };
    const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };

    // rubriques : [clé, nom, ce qui ouvre la rubrique dans la colonne]
    const SECTIONS = [
        ['attach', 'Rattaché à', '.lightbox-attachment-block'], ['person_photo', 'Photo de la personne', 'label.lightbox-checkbox:has(#lightbox-person-photo)'],
        ['title', 'Intitulé du média', 'label[for="lightbox-title"]'], ['date', 'Date du média', 'label[for="lightbox-date"]'], ['calendar', 'Calendrier de cette date', 'label[for="lightbox-date-calendar"]'],
        ['correspondence', 'Correspondance (lettres, cartes)', '.lightbox-correspondence-fields'], ['nature', 'Nature du média', 'label[for="lightbox-media-subject-type"]'],
        ['docref', 'Cote, registre, lien, pages', 'label[for="lightbox-doc-reference"]'], ['note', 'Note sur le média', 'label[for="lightbox-description"]'],
        ['transcription', 'Transcription (OCR, manuscrit, atelier)', 'label[for="lightbox-transcription"]'], ['labels', 'Étiquettes', '.lightbox-labels-block'],
        ['tags', 'Personnes identifiées', '#lightbox-tags-block'], ['signatures', 'Signatures identifiées', '#lightbox-signatures-block'],
        ['actions', 'Boutons (comparer, tourner, retoucher…)', '.lightbox-actions'], ['help', 'Aide des touches', '.keyboard-help'],
    ];
    const SKEY = 'genealogie-lightbox-sections', CKEY = 'genealogie-calendar-choices';
    const ordered = (all, pref) => { const order = (pref?.order || []).filter(k => all.includes(k)); all.forEach((k, i) => { if (!order.includes(k)) { const prev = all.slice(0, i).reverse().find(x => order.includes(x)); order.splice(prev ? order.indexOf(prev) + 1 : 0, 0, k); } }); return order; };

    /* ── la colonne de droite : rangée une fois en rubriques, puis ordonnée ── */
    function wrap() {
        const aside = document.querySelector('#lightbox .lightbox-details'); if (!aside || aside.dataset.lbWrapped) return aside;
        aside.dataset.lbWrapped = '1';
        let cur = null;
        [...aside.children].forEach(el => {
            const s = SECTIONS.find(([, , sel]) => { try { return el.matches(sel); } catch (_) { return false; } });
            if (s) { cur = document.createElement('div'); cur.className = 'lb-sec'; cur.dataset.lbSec = s[0]; el.before(cur); }
            if (cur) cur.appendChild(el);
        });
        return aside;
    }
    function applySections() {
        const aside = wrap(); if (!aside) return;
        const pref = read(SKEY, {}), hidden = pref.hidden || [];
        ordered(SECTIONS.map(s => s[0]), pref).forEach(k => { const box = aside.querySelector(`:scope > [data-lb-sec="${k}"]`); if (box) { aside.appendChild(box); box.classList.toggle('lb-sec-off', hidden.includes(k)); } });
    }

    /* ── les calendriers proposés ── */
    function applyCalendars(root = document) {
        const pref = read(CKEY, null); if (!pref) return;
        root.querySelectorAll('select[name="date_calendar"], #lightbox-date-calendar').forEach(sel => {
            const opts = [...sel.options]; if (!opts.length) return;
            const all = opts.map(o => o.value), order = ordered(all, pref), hidden = pref.hidden || [], val = sel.value;
            order.forEach(v => { const o = opts.find(x => x.value === v); o.hidden = hidden.includes(v) && v !== val && v !== 'gregorian'; sel.appendChild(o); });
        });
    }
    document.addEventListener('focusin', e => { if (e.target.matches?.('select[name="date_calendar"], #lightbox-date-calendar')) applyCalendars(e.target.parentElement || document); });
    document.addEventListener('pointerdown', e => { if (e.target.matches?.('select[name="date_calendar"], #lightbox-date-calendar')) applyCalendars(e.target.parentElement || document); }, true);
    const boot = () => { applySections(); applyCalendars(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0)); else setTimeout(boot, 0);

    /* ── Maintenance → Visionneuse d'images ── */
    const rows = (items, pref, fixed = []) => { const hidden = pref?.hidden || []; return ordered(items.map(i => i[0]), pref).map(k => { const it = items.find(i => i[0] === k); return `<div class="lb-row" data-k="${esc(k)}"><span class="lb-move"><button type="button" class="icon-button" data-up title="Monter">↑</button><button type="button" class="icon-button" data-down title="Descendre">↓</button></span><b>${esc(it[1])}</b><label class="lb-vis" title="Afficher"><input type="checkbox" ${hidden.includes(k) ? '' : 'checked'} ${fixed.includes(k) ? 'disabled' : ''}></label></div>`; }).join(''); };
    const collect = list => { const r = [...list.querySelectorAll('.lb-row')]; return {order: r.map(x => x.dataset.k), hidden: r.filter(x => !x.querySelector('input').checked).map(x => x.dataset.k)}; };
    ext.maintenance = ext.maintenance || {};
    ext.maintenance.viewer_prefs = async token => {
        const S = A().state; if (token !== S.workspaceToken) return;
        const cals = [...(document.querySelector('#lightbox-date-calendar')?.options || [])].map(o => [o.value, o.textContent]);
        const ws = document.getElementById('workspace');
        ws.innerHTML = `<section class="page"><header class="page-header"><div><span class="eyebrow">MAINTENANCE</span><h2>🖼️ Visionneuse d’images</h2><p>Ce qu’on voit à droite quand on ouvre une image, dans quel ordre, et les calendriers proposés pour une date.</p></div></header>
            <div class="lb-prefs"><section class="maintenance-panel"><h3>Colonne de droite</h3><p class="muted">↑ ↓ pour ranger ; décoche pour cacher la rubrique.</p><div class="order-list" data-lb-list="sec">${rows(SECTIONS, read(SKEY, {}))}</div>
                <div class="page-actions action-zone"><button type="button" class="button small" data-lb-save="sec">Enregistrer</button><button type="button" class="button small secondary" data-lb-reset="sec">Remettre comme au départ</button></div></section>
            <section class="maintenance-panel"><h3>« Calendrier de cette date »</h3><p class="muted">Les calendriers proposés dans la visionneuse, les événements et les médias. Le grégorien reste toujours proposé ; une date déjà notée dans un calendrier caché le garde.</p><div class="order-list" data-lb-list="cal">${rows(cals, read(CKEY, {}), ['gregorian'])}</div>
                <div class="page-actions action-zone"><button type="button" class="button small" data-lb-save="cal">Enregistrer</button><button type="button" class="button small secondary" data-lb-reset="cal">Tous, dans l’ordre d’origine</button></div></section></div></section>`;
        ws.querySelector('.page').addEventListener('click', e => {
            const up = e.target.closest('[data-up],[data-down]'); if (up) { const r = up.closest('.lb-row'); if (up.hasAttribute('data-up')) r.previousElementSibling?.before(r); else r.nextElementSibling?.after(r); return; }
            const sv = e.target.closest('[data-lb-save]'); if (sv) { const k = sv.dataset.lbSave, v = collect(ws.querySelector(`[data-lb-list="${k}"]`)); write(k === 'sec' ? SKEY : CKEY, v); if (k === 'sec') applySections(); else applyCalendars(); toast('Enregistré.'); return; }
            const rs = e.target.closest('[data-lb-reset]'); if (rs) { const k = rs.dataset.lbReset; try { localStorage.removeItem(k === 'sec' ? SKEY : CKEY); } catch (_) {} if (k === 'cal') document.querySelectorAll('select[name="date_calendar"] option, #lightbox-date-calendar option').forEach(o => { o.hidden = false; }); applySections(); ext.maintenance.viewer_prefs(S.workspaceToken); toast('Remis comme au départ.'); }
        });
    };
    ext.lightboxLayout = {applySections, applyCalendars, SECTIONS};
})();
