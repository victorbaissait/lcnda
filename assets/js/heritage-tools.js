/**
 * Outils de LCNDA (serveur : lib/heritage_tools.php, structure n°10) :
 *  📥 dossier « Scans » surveillé · ⛪ paroisses d'Ancien Régime · 📅 fêtes religieuses en date exacte
 *  🔎 index des noms cités (le cercle autour des ancêtres) · 🔎 voyages impossibles (homonymes confondus)
 *  🤝 travail à deux par paquets de modifications · 🔒 mode consultation
 * Chargé après app.js et heritage.js (mêmes points d'accroche : window.LCNDA_APP, window.LCNDA_EXT).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const key of ['personBlocks', 'dashboard', 'lists', 'graphStats']) ext[key] = ext[key] || {};
    for (const key of ['calendarPanels', 'afterCalendar']) ext[key] = ext[key] || [];
    const esc = value => A().escapeHtml(value ?? '');
    const nl = value => esc(value).replace(/\n/g, '<br>');
    const api = (...args) => A().api(...args);
    const LP = (type, labels) => window.LCNDA_EXT?.labelsPicker?.(type, labels) || ''; // étiquettes (heritage-more.js)
    const LC = labels => window.LCNDA_EXT?.labelChips?.(labels) || '';
    const toast = (...args) => A().toast(...args);
    const empty = (text, o) => A().empty(text, o);
    const card = (...args) => A().card(...args);
    const S = () => A().state;
    const fmt = (n, d = 0) => Number(n || 0).toLocaleString('fr-FR', {maximumFractionDigits: d});
    const plural = (n, one, many) => `${fmt(n)} ${n > 1 ? many : one}`;
    const isCurrent = token => token === S().workspaceToken && ['listes', 'maintenance'].includes(S().module);
    /** Redessine l'écran ouvert (une liste, ou un onglet de Maintenance). */
    const rerender = () => S().module === 'maintenance' ? A().renderMaintenance() : A().renderList(); // (corrigé : s'appelait elle-même à l'infini)
    ext.maintenance = ext.maintenance || {};
    document.addEventListener('click', event => {
        const b = event.target.closest?.('[data-h-open-maint]');
        if (!b) return;
        event.preventDefault();
        S().maintenanceTab = b.dataset.hOpenMaint;
        A().setModule('maintenance');
    });
    const personLink = (id, name, extra = '') => id ? `<button type="button" class="table-link" data-h-person="${Number(id)}">${esc(name || 'Personne')}</button>${extra ? ` <small>${esc(extra)}</small>` : ''}` : esc(name || '');
    const header = (eyebrow, title, intro, actions = '') => `<header class="page-header"><div><span class="eyebrow">${esc(eyebrow)}</span><h2>${esc(title)}</h2>${intro ? `<p>${intro}</p>` : ''}</div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</header>`;
    const fold = text => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, "'");

    /* ═══════════════════════ 🔒 MODE CONSULTATION ═══════════════════════ */

    let kiosk = {on: false};
    function applyKiosk() {
        document.body.classList.toggle('is-kiosk', !!kiosk.on);
        let banner = document.getElementById('kiosk-banner');
        if (kiosk.on && !banner) {
            banner = document.createElement('div');
            banner.id = 'kiosk-banner';
            banner.innerHTML = '<span>🔒 <strong>Mode consultation</strong> : parcours la généalogie librement, rien ne peut être modifié ni supprimé.</span><button type="button" class="button small" data-kiosk-exit>Quitter la consultation</button>';
            document.body.prepend(banner);
        } else if (!kiosk.on && banner) banner.remove();
        const t = document.getElementById('kiosk-toggle');
        if (t) { t.classList.toggle('is-active', !!kiosk.on); t.title = kiosk.on ? 'Quitter le mode consultation (mot de passe)' : 'Mode consultation : la famille peut tout parcourir sans rien modifier'; }
    }
    function passwordDialog(title, text, confirmTwice, onOk) {
        const dialog = document.createElement('dialog');
        dialog.className = 'modal h-modal';
        dialog.innerHTML = `<form method="dialog" class="h-dialog-form"><div class="modal-head"><div><span class="eyebrow">CONSULTATION</span><h2>${esc(title)}</h2></div><button class="icon-button" type="button" data-close>×</button></div>
            <div class="h-dialog-body"><p>${text}</p><label class="h-block-label">Mot de passe<input type="password" name="p1" autocomplete="new-password" required></label>${confirmTwice ? '<label class="h-block-label">Encore une fois<input type="password" name="p2" autocomplete="new-password" required></label>' : ''}</div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-close>Annuler</button><button type="submit" class="button">Valider</button></div></form>`;
        document.body.appendChild(dialog);
        dialog.addEventListener('close', () => dialog.remove());
        dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
        dialog.querySelector('form').addEventListener('submit', async event => {
            event.preventDefault();
            const f = event.currentTarget;
            if (confirmTwice && f.p1.value !== f.p2.value) { toast('Les deux mots de passe sont différents.', 'error'); return; }
            try { await onOk(f.p1.value); dialog.close(); } catch (error) { toast(error.message, 'error'); f.p1.select(); }
        });
        dialog.showModal();
        dialog.querySelector('input').focus();
    }
    async function exitKiosk() {
        passwordDialog('Quitter la consultation', 'Donne le mot de passe choisi en entrant dans ce mode.', false, async password => {
            const r = await fetch('api.php?action=kiosk_exit', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': S().csrf}, body: JSON.stringify({password, csrf: S().csrf})});
            const data = await r.json().catch(() => ({}));
            if (!r.ok || data.error) throw new Error(data.error || 'Mot de passe incorrect.');
            toast('Mode consultation terminé.');
            location.reload();
        });
    }
    document.addEventListener('click', event => {
        if (event.target.closest?.('[data-kiosk-exit]')) { exitKiosk(); return; }
        if (!event.target.closest?.('#kiosk-toggle')) return;
        if (kiosk.on) { exitKiosk(); return; }
        passwordDialog('Passer en mode consultation', 'La famille pourra parcourir ta généalogie sur cet ordinateur sans rien pouvoir modifier ni supprimer. <b>Choisis un mot de passe</b> : il sera demandé pour sortir de ce mode. (Oublié ? Supprime le fichier <code>consultation.json</code> du dossier des données.)', true, async password => {
            await api('kiosk_enter', {}, {method: 'POST', body: {password}});
            toast('Mode consultation activé.');
            location.reload();
        });
    });
    // Erreurs « 423 » renvoyées par le serveur en mode consultation : le message est déjà affiché par l'application.
    setTimeout(async () => { try { kiosk = await api('kiosk_state'); applyKiosk(); } catch (_) {} }, 300);

    /* ═══════════════════════ 📅 FÊTES RELIGIEUSES EN DATE EXACTE ═══════════════════════ */

    const jdnFromGregorian = (y, m, d) => { const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3; return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045; };
    const jdnFromJulian = (y, m, d) => { const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3; return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - 32083; };
    const gregorianFromJdn = j => { const a = j + 32044, b = Math.floor((4 * a + 3) / 146097), c = a - Math.floor(146097 * b / 4), d = Math.floor((4 * c + 3) / 1461), e = c - Math.floor(1461 * d / 4), m = Math.floor((5 * e + 2) / 153); return [100 * b + d - 4800 + Math.floor(m / 10), m + 3 - 12 * Math.floor(m / 10), e - Math.floor((153 * m + 2) / 5) + 1]; };
    const julianFromJdn = j => { const c = j + 32082, d = Math.floor((4 * c + 3) / 1461), e = c - Math.floor(1461 * d / 4), m = Math.floor((5 * e + 2) / 153); return [d - 4800 + Math.floor(m / 10), m + 3 - 12 * Math.floor(m / 10), e - Math.floor((153 * m + 2) / 5) + 1]; };
    /** En France, le calendrier grégorien remplace le julien en décembre 1582 (le 9 est suivi du 20). */
    const usesJulian = year => year < 1583;
    /** Jour de Pâques (numéro de jour julien) : comput julien avant 1583, grégorien ensuite. */
    function easterJdn(year) {
        if (usesJulian(year)) {
            const a = year % 4, b = year % 7, c = year % 19, d = (19 * c + 15) % 30, e = (2 * a + 4 * b - d + 34) % 7;
            const month = Math.floor((d + e + 114) / 31), day = ((d + e + 114) % 31) + 1;
            return jdnFromJulian(year, month, day);
        }
        const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
        const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
        return jdnFromGregorian(year, month, day);
    }
    // Fêtes mobiles : nombre de jours après Pâques (les plus longues d'abord, pour « lundi de Pâques » avant « Pâques »)
    const MOVABLE = [
        ['lundi de la pentecote', 50, 'lundi de Pentecôte'], ['lundi de pentecote', 50, 'lundi de Pentecôte'], ['lundi de paques', 1, 'lundi de Pâques'], ['mardi de paques', 2, 'mardi de Pâques'],
        ['dimanche des rameaux', -7, 'dimanche des Rameaux'], ['rameaux', -7, 'Rameaux'], ['jeudi saint', -3, 'jeudi saint'], ['vendredi saint', -2, 'vendredi saint'], ['samedi saint', -1, 'samedi saint'],
        ['mercredi des cendres', -46, 'mercredi des Cendres'], ['les cendres', -46, 'mercredi des Cendres'], ['mardi gras', -47, 'mardi gras'], ['septuagesime', -63, 'dimanche de la Septuagésime'], ['sexagesime', -56, 'dimanche de la Sexagésime'], ['quinquagesime', -49, 'dimanche de la Quinquagésime'],
        ['dimanche de la passion', -14, 'dimanche de la Passion'], ['quasimodo', 7, 'dimanche de Quasimodo'], ['ascension', 39, 'Ascension'], ['rogations', 36, 'lundi des Rogations'],
        ['dimanche de la trinite', 56, 'dimanche de la Trinité'], ['trinite', 56, 'dimanche de la Trinité'], ['fete-dieu', 60, 'Fête-Dieu'], ['fete dieu', 60, 'Fête-Dieu'], ['saint-sacrement', 60, 'Fête-Dieu'], ['corpus christi', 60, 'Fête-Dieu'], ['sacre-coeur', 68, 'Sacré-Cœur'],
        ['pentecote', 49, 'Pentecôte'], ['paques', 0, 'Pâques'], ['pasques', 0, 'Pâques'],
    ];
    const FIXED = [
        ['saint jean l\'evangeliste', 12, 27], ['saints innocents', 12, 28], ['nativite de la vierge', 9, 8], ['notre-dame de septembre', 9, 8], ['nativite de saint jean', 6, 24], ['saint jean-baptiste', 6, 24], ['saint jean baptiste', 6, 24],
        ['noel', 12, 25], ['nativite de notre seigneur', 12, 25], ['circoncision', 1, 1], ['jour de l\'an', 1, 1], ['epiphanie', 1, 6], ['les rois', 1, 6], ['chandeleur', 2, 2], ['purification', 2, 2], ['annonciation', 3, 25], ['notre-dame de mars', 3, 25],
        ['assomption', 8, 15], ['notre-dame d\'aout', 8, 15], ['mi-aout', 8, 15], ['toussaint', 11, 1], ['jour des morts', 11, 2], ['trepasses', 11, 2], ['conception', 12, 8],
        ['saint antoine', 1, 17], ['saint sebastien', 1, 20], ['saint vincent', 1, 22], ['saint hilaire', 1, 14], ['saint blaise', 2, 3], ['saint mathias', 2, 24], ['saint joseph', 3, 19], ['saint georges', 4, 23], ['saint marc', 4, 25],
        ['saint philippe', 5, 1], ['sainte croix', 5, 3], ['saint medard', 6, 8], ['saint barnabe', 6, 11], ['saint pierre', 6, 29], ['saint martial', 6, 30], ['sainte madeleine', 7, 22], ['marie-madeleine', 7, 22], ['saint jacques', 7, 25], ['sainte anne', 7, 26],
        ['saint laurent', 8, 10], ['saint roch', 8, 16], ['saint barthelemy', 8, 24], ['saint louis', 8, 25], ['saint gilles', 9, 1], ['saint maurice', 9, 22], ['saint michel', 9, 29], ['saint remi', 10, 1], ['saint leger', 10, 2], ['saint denis', 10, 9], ['saint luc', 10, 18],
        ['saint simon', 10, 28], ['saint martin', 11, 11], ['sainte catherine', 11, 25], ['saint andre', 11, 30], ['saint eloi', 12, 1], ['saint nicolas', 12, 6], ['sainte lucie', 12, 13], ['saint thomas', 12, 21], ['saint etienne', 12, 26], ['saint sylvestre', 12, 31],
        ['saint jean', 6, 24],
    ];
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
    const dateText = ([y, m, d]) => `${d === 1 ? '1er' : d} ${MONTHS[m - 1]} ${y}`;
    /**
     * « le jour de la Pentecôte 1754 », « lundi de Pâques 1690 », « le lendemain de la Saint-Martin 1702 » → date exacte.
     * Renvoie null si aucune fête ou aucune année n'est reconnue.
     */
    function feastDate(text) {
        const t = fold(text).replace(/\s+/g, ' ').replace(/st\.? /g, 'saint ').replace(/ste\.? /g, 'sainte ').replace(/saint-/g, 'saint ').replace(/sainte-/g, 'sainte ');
        const year = Number(t.match(/(?<!\d)(1[0-9]{3})(?!\d)/)?.[1] || 0);
        if (!year) return null;
        let jdn = null, label = '';
        for (const [key, offset, name] of MOVABLE) { if (t.includes(key)) { jdn = easterJdn(year) + offset; label = name; break; } }
        if (jdn === null) {
            for (const [key, m, d] of FIXED) { if (t.includes(key.replace(/saint-/g, 'saint '))) { jdn = usesJulian(year) ? jdnFromJulian(year, m, d) : jdnFromGregorian(year, m, d); label = key.replace(/\b\w/g, c => c.toUpperCase()).replace(/^Saint /, 'Saint-').replace(/^Sainte /, 'Sainte-'); break; } }
        }
        if (jdn === null) return null;
        let shift = 0, how = '';
        // « le lundi après la Saint-Martin », « le 2e dimanche après Pâques », « 3 jours avant Pâques », « huit jours après la Toussaint »
        const wd = t.match(/(?:\b(premier|1er|second|deuxieme|2e|2eme|troisieme|3e|3eme|quatrieme|4e|4eme)\s+)?\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+(?:d'\s*|qui\s+)?(avant|apres|suivant|suit|precedant|precede|devant)\b/);
        const nd = t.match(/(?:^|\s)(\d{1,3}|une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|quinze|vingt|trente|quarante)\s+(jours?|semaines?)\s+(avant|apres|devant|suivant)\b/);
        const before = w => /avant|precedant|precede|devant/.test(w);
        if (wd) {
            const nth = ({premier: 1, '1er': 1, second: 2, deuxieme: 2, '2e': 2, '2eme': 2, troisieme: 3, '3e': 3, '3eme': 3, quatrieme: 4, '4e': 4, '4eme': 4})[wd[1]] || 1;
            const target = WEEKDAYS.indexOf(wd[2]), w = ((jdn % 7) + 7) % 7;
            shift = before(wd[3]) ? -(((w - target + 7) % 7) || 7) - 7 * (nth - 1) : (((target - w + 7) % 7) || 7) + 7 * (nth - 1);
            how = `${nth > 1 ? (nth === 2 ? '2e' : nth + 'e') + ' ' : ''}${wd[2]} ${before(wd[3]) ? 'avant' : 'après'} `;
        } else if (nd) {
            const words = {un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, quinze: 15, vingt: 20, trente: 30, quarante: 40};
            const n = Number(nd[1]) || words[nd[1]] || 0, days = n * (/semaine/.test(nd[2]) ? 7 : 1);
            shift = before(nd[3]) ? -days : days;
            how = `${n} ${/semaine/.test(nd[2]) ? (n > 1 ? 'semaines' : 'semaine') : (n > 1 ? 'jours' : 'jour')} ${before(nd[3]) ? 'avant' : 'après'} `;
        }
        else if (/surlendemain/.test(t)) { shift = 2; how = 'surlendemain de '; }
        else if (/lendemain/.test(t)) { shift = 1; how = 'lendemain de '; }
        else if (/veille|vigile/.test(t)) { shift = -1; how = 'veille de '; }
        else if (/octave/.test(t)) { shift = 7; how = 'octave de '; }
        jdn += shift;
        if (how && /^Sainte?-/.test(label)) how += 'la ';
        const julian = usesJulian(year);
        const civil = julian ? julianFromJdn(jdn) : gregorianFromJdn(jdn);
        const greg = gregorianFromJdn(jdn);
        const weekday = WEEKDAYS[((jdn % 7) + 7) % 7];
        return {date: dateText(civil), iso: civil.map((v, i) => String(v).padStart(i ? 2 : 4, '0')).join('-'), weekday, julian, gregorian: dateText(greg), label: how + label,
            easter: dateText(usesJulian(year) ? julianFromJdn(easterJdn(year)) : gregorianFromJdn(easterJdn(year)))};
    }
    ext.feastDate = feastDate;
    function feastResultHtml(r, original) {
        if (!r) return '<p class="muted">Aucune fête reconnue (il faut le nom de la fête et l’année, ex. « le jour de la Pentecôte 1754 »).</p>';
        return `<p class="h-feast-result"><strong>${esc(r.weekday)} ${esc(r.date)}</strong> — ${esc(r.label)}${r.julian ? ` <small>(calendrier julien, en usage en France avant décembre 1582 ; soit le ${esc(r.gregorian)} dans le calendrier grégorien)</small>` : ''}<br><small class="muted">Pâques ${esc(r.date.slice(-4))} : ${esc(r.easter)}.${original ? ` Écrit : « ${esc(original)} ».` : ''}</small></p>`;
    }
    ext.calendarPanels.push(() => `<section class="maintenance-panel" id="h-feast-panel"><h3>Fêtes religieuses → date exacte</h3>
        <p>Les curés écrivaient souvent « le jour de la Pentecôte 1754 », « le lendemain de la Saint-Martin », « le lundi après la Saint-Martin 1650 » ou « trois jours avant Pâques 1702 ». Écris la mention : l’app calcule la vraie date (Pâques selon le comput julien avant 1583, grégorien ensuite).</p>
        <form class="form-grid" style="padding:0" id="h-feast-form"><label class="span-2">Mention de l’acte<input name="text" placeholder="le jour de la Pentecôte 1754" autocomplete="off"></label></form><div id="h-feast-out"></div>
        <p class="muted">Toutes les fêtes mobiles d’une année (Septuagésime, Cendres, Pâques, Pentecôte, Fête-Dieu…) : cadre « Saint du jour et fêtes mobiles ».</p></section>`);
    ext.afterCalendar.push(() => {
        const form = document.getElementById('h-feast-form');
        if (!form) return;
        const out = document.getElementById('h-feast-out');
        form.addEventListener('input', () => { out.innerHTML = form.text.value.trim() ? feastResultHtml(feastDate(form.text.value)) : ''; });
        form.addEventListener('submit', e => e.preventDefault());
    });
    // Fenêtre d'événement : si la date écrite est une fête, l'app propose la date exacte
    document.addEventListener('input', event => {
        const input = event.target.closest?.('#event-form [name=date_text]');
        if (!input) return;
        let hint = input.parentElement.querySelector('.h-feast-hint');
        const r = /p[aâ]que|pentec|ascension|rameaux|cendres|tous?saint|no[eë]l|saint|sainte|st[e]? |trinit|f[eê]te|chandeleur|assomption|[ée]piphanie|rois|quasimodo|vigile|lendemain|veille/i.test(input.value) ? feastDate(input.value) : null;
        if (!r) { hint?.remove(); return; }
        if (!hint) { hint = document.createElement('div'); hint.className = 'h-feast-hint'; input.insertAdjacentElement('afterend', hint); }
        hint.innerHTML = `📅 ${esc(r.label)} = <strong>${esc(r.weekday)} ${esc(r.date)}</strong>${r.julian ? ' <small>(julien)</small>' : ''} <button type="button" class="button small secondary" data-h-feast-use="${esc(r.date)}">Utiliser cette date</button>`;
        hint.dataset.original = input.value;
    });
    document.addEventListener('click', event => {
        const b = event.target.closest?.('[data-h-feast-use]');
        if (!b) return;
        const hint = b.closest('.h-feast-hint'), form = b.closest('form'), input = form.querySelector('[name=date_text]');
        const original = hint.dataset.original;
        input.value = b.dataset.hFeastUse;
        input.dispatchEvent(new Event('change', {bubbles: true}));
        const note = form.querySelector('[name=description]') || form.querySelector('[name=title]');
        if (note && !note.value.trim()) note.value = `Date écrite dans l’acte : « ${original} »`;
        hint.innerHTML = `<small class="muted">Date calculée d’après « ${esc(original)} »${note ? ' (mention gardée dans la description)' : ''}.</small>`;
    });

    /* ═══════════════════════ 📥 DOSSIER « SCANS » SURVEILLÉ ═══════════════════════ */

    let scanState = null, scanTimer = 0, scanBusy = false;
    async function scanTick() {
        if (scanBusy || !scanState?.enabled || document.hidden || kiosk.on) return;
        scanBusy = true;
        try {
            const r = await api('scan_inbox_run', {}, {method: 'POST', body: {}});
            if (r.imported?.length) {
                toast(`📥 ${plural(r.imported.length, 'fichier arrivé', 'fichiers arrivés')} par le dossier Scans : à identifier dans les médias.`);
                if (S().module === 'maintenance' && S().maintenanceTab === 'scan_inbox') rerender();
            }
            (r.skipped || []).slice(0, 3).forEach(s => toast(`${s.name} : ${s.reason}`, 'error'));
        } catch (_) {} finally { scanBusy = false; }
    }
    async function loadScanState() {
        try { scanState = await api('scan_inbox_status'); } catch (_) { scanState = null; }
        clearInterval(scanTimer);
        if (scanState?.enabled) { scanTimer = setInterval(scanTick, 20000); setTimeout(scanTick, 1500); }
    }
    setTimeout(loadScanState, 2500);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) scanTick(); });

    ext.maintenance.scan_inbox = async token => {
        const s = await api('scan_inbox_status');
        if (!isCurrent(token)) return;
        scanState = s;
        A().$('#workspace').innerHTML = `<section class="page collection-page">${header('MAINTENANCE', 'Dossier « Scans » surveillé', 'Choisis un dossier sur ton ordinateur. Chaque fichier qui y arrive (depuis le scanner, le téléphone ou AirDrop) entre tout seul dans l’app, dans les médias à identifier. Plus besoin d’importer tes photos d’archives une par une.')}
            <form class="maintenance-panel" id="h-scan-form"><div class="form-grid"><label class="span-2">Dossier surveillé<input name="dir" value="${esc(s.dir)}" placeholder="~/Documents/Scans généalogie" list="h-scan-suggest"><datalist id="h-scan-suggest"><option value="~/Documents/Scans généalogie"><option value="~/Desktop/Scans"><option value="~/Downloads"><option value="~/Library/Mobile Documents/com~apple~CloudDocs/Scans"></datalist></label>
                <label class="checkbox-line"><input type="checkbox" name="enabled" ${s.enabled ? 'checked' : ''}> Surveiller ce dossier (toutes les 20 secondes, tant que l’app est ouverte)</label>
                <label class="checkbox-line"><input type="checkbox" name="move_imported" ${s.move_imported ? 'checked' : ''}> Ranger les fichiers importés dans le sous-dossier « Importés dans LCNDA »</label></div>
                <p class="muted">Formats : JPEG, PNG, WebP, GIF, PDF${s.can_convert ? ', et HEIC (iPhone) ou TIFF, convertis en JPEG' : ' (les photos HEIC de l’iPhone et les TIFF ne sont pas convertibles sur cet ordinateur : règle l’iPhone sur « Le plus compatible »)'}. Conseil : un dossier réservé aux scans (AirDrop dépose dans « Téléchargements », où il y a de tout). Un même fichier n’est jamais importé deux fois.</p>
                <div class="page-actions"><button class="button" type="submit">Enregistrer</button>${s.dir ? '<button class="button secondary" type="button" data-h-scan-now>Vérifier maintenant</button>' : ''}<span class="muted">${s.dir ? (s.reachable ? `${s.pending ? `${plural(s.pending, 'fichier en attente', 'fichiers en attente')}` : 'Rien en attente'} · ${plural(s.total, 'fichier importé', 'fichiers importés')} en tout` : '⚠ dossier introuvable (disque débranché ?)') : ''}</span></div></form>
            <h3>Derniers arrivés</h3>${s.recent?.length ? `<div class="collection-media-edit">${s.recent.map(r => `<span class="collection-media-item" title="${esc(r.filename)} — ${esc(r.imported_at)}">${r.media_file ? A().mediaThumbHtml({media_type: r.media_type, filename: r.media_file, title: r.title}) : esc(r.filename)}</span>`).join('')}</div><p><button type="button" class="button small secondary" data-h-scan-identify>Voir les médias à identifier</button></p>` : empty('Rien d’arrivé pour l’instant', {icon: '📥'})}</section>`;
        const form = A().$('#h-scan-form');
        form.addEventListener('submit', async event => {
            event.preventDefault();
            try { await api('save_scan_inbox_settings', {}, {method: 'POST', body: {dir: form.dir.value, enabled: form.enabled.checked, move_imported: form.move_imported.checked}}); toast(form.enabled.checked ? 'Dossier surveillé.' : 'Réglages enregistrés.'); await loadScanState(); rerender(); }
            catch (error) { toast(error.message, 'error'); }
        });
        A().$('[data-h-scan-now]')?.addEventListener('click', async () => { const before = scanState?.enabled; scanState = {...scanState, enabled: true}; await scanTick(); scanState.enabled = before; rerender(); });
        A().$('[data-h-scan-identify]')?.addEventListener('click', () => { S().listType = 'media'; A().setModule('listes'); });
    };
    ext.dashboard.scan_inbox_widget = {load: () => api('scan_inbox_status'), render: (index, widget, span, s) => card(index, 'Dossier Scans', s?.total || '', !s?.dir ? `${empty('Aucun dossier surveillé pour l’instant', {icon: '📂'})}<div class="page-actions"><button type="button" class="button small secondary" data-h-open-maint="scan_inbox">Choisir un dossier</button></div>`
        : `<p>${s.enabled ? '📥 Surveillé' : '⏸ Pas surveillé'} : <code>${esc(s.dir)}</code>${s.pending ? ` · ${plural(s.pending, 'fichier en attente', 'fichiers en attente')}` : ''}</p>${s.recent?.length ? `<div class="collection-media-edit">${s.recent.slice(0, 6).map(r => `<span class="collection-media-item">${r.media_file ? A().mediaThumbHtml({media_type: r.media_type, filename: r.media_file, title: r.title}) : esc(r.filename)}</span>`).join('')}</div>` : ''}<div class="page-actions"><button type="button" class="button small secondary" data-h-open-maint="scan_inbox">Réglages</button></div>`, span)};

    /* ═══════════════════════ ⛪ PAROISSES D'ANCIEN RÉGIME ═══════════════════════ */

    let parishMap = null;
    async function loadParishMap() { try { parishMap = await api('parish_map'); } catch (_) { parishMap = null; } }
    setTimeout(loadParishMap, 3000);
    ext.parishHint = insee => {
        const list = parishMap?.by_insee?.[insee];
        return list?.length ? `<div class="h-parish-hint">${list.map(p => `⛪ Avant ${esc(p.until)}, chercher dans les registres de la paroisse de <strong>${esc(p.parish)}</strong>`).join('<br>')}</div>` : '';
    };
    /** Lieu d'un rattachement : le menu de choix unique (docs/PICKER.md). Le formulaire envoie toujours
     *  le numéro du lieu (name) et, à côté, son texte (data-h-pp) : un nom sans fiche reste gardé tel quel. */
    function placePicker(name, id, label) {
        id = Number(id) || 0;
        return `<span class="h-place-pk"><input type="hidden" name="${name}" value="${id || ''}"><input type="hidden" data-h-pp="${name}" value="${esc(label || '')}">${window.LCNDA_PICKER.pickerField({name: name + '_pk', kind: 'place', allowFree: true, value: id ? id : (label ? 'txt:' + label : null)})}</span>`;
    }
    document.addEventListener('picker-change', event => {
        const wrap = event.target.closest?.('.h-place-pk'); if (!wrap) return;
        const it = event.detail.item, id = wrap.querySelector(':scope > input[name]'), txt = wrap.querySelector(':scope > [data-h-pp]');
        id.value = it && !it.free && it.id ? it.id : '';
        txt.value = it ? (it.free ? it.title : [it.name || it.title, it.county || it.state_name].filter(Boolean).join(', ')) : '';
    });
    ext.lists.parishes = async (token, edit = null) => {
        const q = S().hParishQ || '';
        const data = await api('parishes', {q});
        if (!isCurrent(token)) return;
        const rows = data.parishes || [];
        const e = edit ? (edit.id ? rows.find(r => Number(r.id) === Number(edit.id)) : {id: 0, until_year: 1790}) : null;
        A().$('#workspace').innerHTML = `<section class="page collection-page">${header('LISTES', 'Paroisses d’Ancien Régime', 'Beaucoup de hameaux et de villages dépendaient de la paroisse d’à côté : les baptêmes, mariages et sépultures d’avant la Révolution sont alors dans les registres d’une autre commune. Note ces rattachements au fil de tes trouvailles : l’app l’indique sur les événements des fiches, dans les battues et dans les registres en ligne.')}
            <div class="collection-toolbar"><input type="search" id="h-parish-q" value="${esc(q)}" placeholder="Chercher un lieu ou une paroisse…"><button type="button" class="button" data-h-parish-new>+ Rattachement</button></div>
            ${e ? `<form class="maintenance-panel collection-form" id="h-parish-form"><h3>${e.id ? 'Modifier le rattachement' : 'Nouveau rattachement'}</h3><div class="form-grid">
                <div><span class="pk-lab">Lieu (hameau, village, commune actuelle)</span>${placePicker('place_id', e.place_id, e.place_name || e.place_text)}</div>
                <div><span class="pk-lab">Dépendait de la paroisse de</span>${placePicker('parish_place_id', e.parish_place_id, e.parish_place_name || '')}</div>
                <label>Nom de la paroisse (tel que dans les registres)<input name="parish_name" value="${esc(e.parish_name || '')}" placeholder="Saint-Martin de Brive"></label>
                <label>Jusqu’en<input type="number" name="until_year" value="${esc(e.until_year || 1790)}" min="1000" max="1900"></label><label>Depuis (si connu)<input type="number" name="from_year" value="${esc(e.from_year || '')}" placeholder="—"></label>
                <label class="span-2">Note, source<input name="note" value="${esc(e.note || '')}" placeholder="Paroisse érigée en 1792 ; voir aussi la chapelle de…"></label></div>
                ${LP('parish', e.labels)}<div class="page-actions action-zone"><button class="button" type="submit">Enregistrer</button><button class="button secondary" type="button" data-h-parish-cancel>Annuler</button>${e.id ? '<button class="button secondary danger" type="button" data-h-parish-delete>Supprimer</button>' : ''}</div></form>` : ''}
            ${rows.length ? `<table class="data-table"><thead><tr><th>Lieu</th><th>Avant</th><th>Paroisse</th><th>Événements concernés</th><th>Note</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td><strong>${esc(r.place_name || r.place_text)}</strong>${LC(r.labels)}${r.place_county ? `<br><small>${esc(r.place_county)}</small>` : ''}</td><td>${r.from_year ? `${esc(r.from_year)}–` : ''}${esc(r.until_year)}</td><td>⛪ ${esc(r.parish_name)}</td><td>${r.old_event_count ? plural(Number(r.old_event_count), 'événement', 'événements') : '—'}</td><td><small>${esc(r.note)}</small></td><td><span class="inline-actions h-tools">${A().actionButton('edit', 'Modifier ce rattachement', `data-h-parish-edit="${r.id}"`)}${A().actionButton('delete', 'Supprimer ce rattachement', `data-h-parish-del="${r.id}"`)}</span></td></tr>`).join('')}</tbody></table>` : (e ? '' : A().emptyState({icon: '⛪', text: 'Aucun rattachement pour l’instant', hint: 'Note de quelle paroisse dépendait chaque hameau ou village avant la Révolution.', action: {label: '＋ Rattachement', attrs: 'data-h-parish-new'}}))}</section>`;
        const ws = A().$('#workspace');
        ws.querySelector('#h-parish-q').addEventListener('change', ev => { S().hParishQ = ev.target.value.trim(); rerender(); });
        ws.querySelectorAll('[data-h-parish-new]').forEach(b => b.addEventListener('click', () => ext.lists.parishes(++S().workspaceToken, {id: 0})));
        ws.querySelectorAll('[data-h-parish-del]').forEach(b => b.addEventListener('click', async () => { if (!await A().confirmBox('Supprimer ce rattachement ?', {title: 'Supprimer le rattachement', okLabel: 'Supprimer le rattachement'})) return; await api('delete_parish', {}, {method: 'POST', body: {id: b.dataset.hParishDel}}); await loadParishMap(); rerender(); }));
        ws.querySelectorAll('[data-h-parish-edit]').forEach(b => b.addEventListener('click', () => ext.lists.parishes(++S().workspaceToken, {id: Number(b.dataset.hParishEdit)})));
        const form = ws.querySelector('#h-parish-form');
        if (!form) return;
        form.querySelectorAll('.h-place-pk .pk > input[type=hidden]').forEach(h => h.removeAttribute('name')); // seuls place_id / parish_place_id partent, comme avant
        form.querySelector('[data-h-parish-cancel]').addEventListener('click', () => rerender());
        form.querySelector('[data-h-parish-delete]')?.addEventListener('click', async () => { if (!await A().confirmBox('Supprimer ce rattachement ?', {title: 'Supprimer le rattachement', okLabel: 'Supprimer le rattachement'})) return; await api('delete_parish', {}, {method: 'POST', body: {id: e.id}}); await loadParishMap(); rerender(); });
        form.addEventListener('submit', async ev => {
            ev.preventDefault();
            const v = A().formObject(form);
            try {
                await api('save_parish', {}, {method: 'POST', body: {...v, id: e.id, place_text: form.querySelector('[data-h-pp=place_id]').value, parish_name: v.parish_name || (Number(v.parish_place_id) ? '' : form.querySelector('[data-h-pp=parish_place_id]').value)}});
                toast('Rattachement enregistré.'); await loadParishMap(); rerender();
            } catch (error) { toast(error.message, 'error'); }
        });
    };

    /* ═══════════════════════ 🔎 LE CERCLE : NOMS CITÉS ═══════════════════════ */

    ext.lists.cited_names = async (token, view = null) => {
        const st = S();
        if (view?.media) st.hCiteMedia = view.media;
        if (view?.index) st.hCiteMedia = 0;
        if (st.hCiteMedia) return renderTranscriptionMarking(token, st.hCiteMedia);
        const tab = st.hCiteTab === 'transcriptions' ? 'transcriptions' : 'index';
        const q = st.hCiteQ || '';
        const data = tab === 'index' ? await api('cited_names', {q}) : await api('transcriptions_list', {q});
        if (!isCurrent(token)) return;
        const tabs = `<div class="segmented-filter">${[['index', 'Index des noms'], ['transcriptions', 'Marquer dans les transcriptions']].map(([k, l]) => `<button type="button" class="button small ${tab === k ? '' : 'secondary'}" data-h-cite-tab="${k}">${esc(l)}</button>`).join('')}</div>`;
        let body;
        if (tab === 'index') {
            const groups = data.groups || [];
            body = groups.length ? `<div class="h-cite-groups">${groups.map(g => `<article class="h-record"><header><div><strong>${esc(g.name)}</strong>${g.occupations.length ? `, ${esc(g.occupations.join(', '))}` : ''} — apparaît dans <strong>${plural(g.acts, 'acte', 'actes')}</strong>${g.from ? ` ${g.from === g.to ? `en ${g.from}` : `entre ${g.from} et ${g.to}`}` : ''}
                ${g.roles.length ? `<div class="muted">${esc(g.roles.join(', '))}${g.places.length ? ' · ' + esc(g.places.join(', ')) : ''}</div>` : ''}${g.person_id ? `<div>Fiche : ${personLink(g.person_id, g.person_name)}</div>` : ''}</div></header>
                <details><summary>Les ${g.items.length} mentions</summary><ul class="h-cite-items">${g.items.map(i => `<li>${LC(i.labels)}${esc(i.date_text || i.year || '')} ${i.role ? `<em>${esc(i.role)}</em>` : ''} ${i.media_id ? `<button type="button" class="link-button" data-h-cite-open="${i.media_id}">${esc(i.media_title || 'transcription')}</button>` : ''}${i.snippet ? `<br><small class="h-transcription">… ${esc(i.snippet)} …</small>` : ''} <button type="button" class="link-button" data-h-cite-del="${i.id}">retirer</button></li>`).join('')}</ul></details></article>`).join('')}</div>`
                : empty('Aucun nom indexé pour l’instant', {icon: '🏷️', hint: 'Ouvre « Marquer dans les transcriptions » : sélectionne un nom dans le texte d’un acte, ou accepte les noms repérés par l’app.'});
        } else {
            const media = data.media || [];
            body = media.length ? `<table class="data-table"><thead><tr><th>Document</th><th>Début de la transcription</th><th>Noms marqués</th><th></th></tr></thead><tbody>${media.map(m => `<tr><td><strong>${esc(m.title || 'Sans titre')}</strong>${m.document_reference ? `<br><small>${esc(m.document_reference)}</small>` : ''}${m.date_text ? `<br><small>${esc(m.date_text)}</small>` : ''}</td><td><small>${esc(m.excerpt)}…</small></td><td>${Number(m.marked) || '—'}</td><td><button type="button" class="button small" data-h-cite-open="${m.id}">Ouvrir</button></td></tr>`).join('')}</tbody></table>`
                : empty('Aucune transcription : transcris d’abord un acte (visionneuse des médias → transcription).');
        }
        A().$('#workspace').innerHTML = `<section class="page collection-page">${header('LISTES', 'Le cercle autour des ancêtres', 'Les témoins, voisins, curés, parrains qui n’ont pas de fiche. Par exemple : « Pierre Martin, tisserand, apparaît dans 7 actes entre 1781 et 1803 ». Ce cercle (famille, amis, voisins) débloque souvent une recherche.')}
            <div class="collection-toolbar">${tabs}<input type="search" id="h-cite-q" value="${esc(q)}" placeholder="${tab === 'index' ? 'Chercher un nom, un métier, un lieu…' : 'Chercher dans les transcriptions…'}"></div>${body}</section>`;
        const ws = A().$('#workspace');
        A().bindTableLinks();
        ws.querySelectorAll('[data-h-cite-tab]').forEach(b => b.addEventListener('click', () => { st.hCiteTab = b.dataset.hCiteTab; rerender(); }));
        ws.querySelector('#h-cite-q').addEventListener('change', ev => { st.hCiteQ = ev.target.value.trim(); rerender(); });
        ws.querySelectorAll('[data-h-cite-open]').forEach(b => b.addEventListener('click', () => ext.lists.cited_names(++st.workspaceToken, {media: Number(b.dataset.hCiteOpen)})));
        ws.querySelectorAll('[data-h-cite-del]').forEach(b => b.addEventListener('click', async () => { await api('delete_cited_name', {}, {method: 'POST', body: {id: b.dataset.hCiteDel}}); rerender(); }));
    };
    async function renderTranscriptionMarking(token, mediaId) {
        let data;
        try { data = await api('media_transcription', {id: mediaId}); } catch (error) { S().hCiteMedia = 0; toast(error.message, 'error'); return rerender(); }
        if (!isCurrent(token)) return;
        const m = data.media, roles = data.roles || [];
        const year = Number(String(m.date_text || '').match(/\b(1[0-9]{3})\b/)?.[1] || m.events?.[0]?.year || 0) || '';
        // Texte avec les noms déjà marqués surlignés
        let html = esc(m.transcription);
        [...new Set(m.marks.map(k => k.name))].sort((a, b) => b.length - a.length).forEach(name => { const n = esc(name); if (n) html = html.split(n).join(`<mark>${n}</mark>`); });
        A().$('#workspace').innerHTML = `<section class="page collection-page h-cite-page">${header('NOMS CITÉS', m.title || 'Transcription', esc([m.document_reference, m.date_text].filter(Boolean).join(' · ')), '<button type="button" class="button secondary" data-h-cite-back>← Retour</button>')}
            <div class="h-cite-layout"><div><div class="maintenance-panel"><p class="muted">Sélectionne un nom dans le texte avec la souris : un bouton « Ajouter » apparaît.</p><div class="h-cite-text" id="h-cite-text">${html.replace(/\n/g, '<br>')}</div></div>
                ${m.media_type === 'image' ? `<p><img src="media/${encodeURIComponent(m.filename)}" alt="" class="h-cite-image"></p>` : ''}</div>
            <aside><div class="maintenance-panel"><h4>Noms marqués (${m.marks.length})</h4><ul class="h-cite-marks">${m.marks.map(k => `<li><strong>${esc(k.name)}</strong>${k.role ? ` — ${esc(k.role)}` : ''}${k.occupation ? `, ${esc(k.occupation)}` : ''}${k.person_id ? ` · ${personLink(k.person_id, k.person_name)}` : ''} <button type="button" class="link-button" data-h-cite-del="${k.id}">retirer</button></li>`).join('') || '<li class="muted">Aucun.</li>'}</ul></div>
                ${m.suggestions.length ? `<div class="maintenance-panel"><h4>Noms repérés par l’app</h4><p class="muted">À vérifier : la détection automatique n’est pas parfaite.</p><ul class="h-cite-marks">${m.suggestions.map((sg, i) => `<li><strong>${esc(sg.name)}</strong>${sg.role ? ` — ${esc(sg.role)}` : ''}${sg.occupation ? `, ${esc(sg.occupation)}` : ''} <button type="button" class="button small secondary" data-h-cite-sugg="${i}">Ajouter…</button></li>`).join('')}</ul></div>` : ''}</aside></div>
            <button type="button" class="button small h-cite-float" id="h-cite-float" hidden>+ Ajouter ce nom</button></section>`;
        const ws = A().$('#workspace');
        A().bindTableLinks();
        const back = () => ext.lists.cited_names(++S().workspaceToken, {index: true});
        ws.querySelector('[data-h-cite-back]').addEventListener('click', () => { S().hCiteTab = 'transcriptions'; back(); });
        ws.querySelectorAll('[data-h-cite-del]').forEach(b => b.addEventListener('click', async () => { await api('delete_cited_name', {}, {method: 'POST', body: {id: b.dataset.hCiteDel}}); renderTranscriptionMarking(++S().workspaceToken, mediaId); }));
        const openForm = (preset) => {
            const dialog = document.createElement('dialog');
            dialog.className = 'modal h-modal';
            dialog.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">NOM CITÉ</span><h2>Ajouter au cercle</h2></div><button class="icon-button" type="button" data-close>×</button></div>
                <div class="h-dialog-body"><div class="form-grid"><label class="span-2">Nom<input name="name" required value="${esc(preset.name)}"></label>
                <label>Rôle dans l’acte<input name="role" value="${esc(preset.role || '')}" list="h-cite-roles"><datalist id="h-cite-roles">${roles.map(r => `<option>${esc(r)}</option>`).join('')}</datalist></label><label>Métier<input name="occupation" value="${esc(preset.occupation || '')}"></label>
                <label>Année<input type="number" name="year" value="${esc(year)}"></label><label>Lieu<input name="place_text" placeholder="Demeurant à…"></label>
                <div class="span-2"><span class="pk-lab">C’est quelqu’un de la base ? <small>(facultatif)</small></span>${window.LCNDA_PICKER.pickerField({name: 'person_id', kind: 'person'})}</div></div>${LP('cited_name', [])}${preset.snippet ? `<p class="h-transcription">… ${esc(preset.snippet)} …</p>` : ''}</div>
                <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-close>Annuler</button><button type="submit" class="button">Ajouter</button></div></form>`;
            document.body.appendChild(dialog);
            dialog.addEventListener('close', () => dialog.remove());
            dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
            dialog.querySelector('form').addEventListener('submit', async ev => {
                ev.preventDefault();
                const v = A().formObject(ev.currentTarget);
                try { await api('save_cited_name', {}, {method: 'POST', body: {...v, media_id: mediaId, event_id: m.events?.[0]?.id || 0, date_text: m.date_text || m.events?.[0]?.date_text || '', snippet: preset.snippet || ''}}); dialog.close(); toast('Nom ajouté au cercle.'); renderTranscriptionMarking(++S().workspaceToken, mediaId); }
                catch (error) { toast(error.message, 'error'); }
            });
            dialog.showModal();
        };
        ws.querySelectorAll('[data-h-cite-sugg]').forEach(b => b.addEventListener('click', () => openForm(m.suggestions[Number(b.dataset.hCiteSugg)])));
        const text = ws.querySelector('#h-cite-text'), float = ws.querySelector('#h-cite-float');
        const onSelect = () => {
            const sel = window.getSelection(), value = sel?.toString().trim() || '';
            if (!value || value.length > 80 || !text.contains(sel.anchorNode)) { float.hidden = true; return; }
            const r = sel.getRangeAt(0).getBoundingClientRect();
            float.style.left = `${r.left + window.scrollX}px`; float.style.top = `${r.bottom + window.scrollY + 6}px`;
            float.hidden = false;
            const full = m.transcription, pos = full.indexOf(value);
            float.dataset.snippet = pos >= 0 ? full.slice(Math.max(0, pos - 50), pos + value.length + 80) : '';
            float.dataset.value = value.replace(/\s+/g, ' ');
        };
        text.addEventListener('mouseup', () => setTimeout(onSelect, 0));
        text.addEventListener('keyup', onSelect);
        float.addEventListener('click', () => { float.hidden = true; const after = m.transcription.slice(m.transcription.indexOf(float.dataset.value) + float.dataset.value.length, m.transcription.indexOf(float.dataset.value) + float.dataset.value.length + 40); openForm({name: float.dataset.value, snippet: float.dataset.snippet, occupation: (after.match(/^\s*,\s*([a-zà-ÿ][a-zà-ÿ’' -]{2,25}?)[,.;]/) || [])[1] || ''}); });
    }
    ext.dashboard.cited_names_widget = {load: () => api('cited_names'), render: (index, widget, span, data) => {
        const groups = (data?.groups || []).filter(g => !g.person_id).slice(0, 8);
        return card(index, 'Le cercle des ancêtres', groups.length || '', groups.length ? `<ul class="h-widget-list">${groups.map(g => `<li><strong>${esc(g.name)}</strong>${g.occupations.length ? `, ${esc(g.occupations[0])}` : ''} — ${plural(g.acts, 'acte', 'actes')}${g.from ? ` (${g.from === g.to ? g.from : `${g.from}–${g.to}`})` : ''}</li>`).join('')}</ul>` : empty('Aucun nom indexé dans les transcriptions.'), span);
    }};

    /* ═══════════════════════ 🔎 VOYAGES IMPOSSIBLES ═══════════════════════ */

    const journeyEvent = e => `${esc(e.type_label)}${e.role ? ` <em>(${esc(e.role)})</em>` : ''}${e.owner_name && e.role ? ` de ${esc(e.owner_name)}` : ''} — <strong>${esc(e.date_text)}</strong> à ${esc(e.place_name || '?')}`;
    function journeysTable(alerts) {
        return `<table class="data-table h-journeys"><thead><tr><th>Fiche</th><th>D’abord</th><th>Puis</th><th>Écart</th></tr></thead><tbody>${alerts.map(a => `<tr><td>${a.person ? personLink(a.person.id, A().personName(a.person), A().years(a.person)) : '?'}</td><td>${journeyEvent(a.a)}</td><td>${journeyEvent(a.b)}</td><td><strong>${fmt(a.km)} km</strong> en ${a.days ? plural(a.days, 'jour', 'jours') : 'moins d’un jour'}<br><small class="muted">au plus ≈ ${fmt(a.speed_limit)} km par jour à cette époque</small></td></tr>`).join('')}</tbody></table>`;
    }
    ext.maintenance.journeys = async token => {
        const data = await api('impossible_journeys');
        if (!isCurrent(token)) return;
        const alerts = data.alerts || [];
        A().$('#workspace').innerHTML = `<section class="page collection-page">${header('MAINTENANCE', 'Voyages impossibles', 'Une même fiche se trouve à deux endroits trop éloignés en trop peu de temps (« parrain à Lille le 3 mars, témoin à Marseille le 4 mars 1790 ») : c’est le signe classique de deux homonymes confondus dans une seule fiche. Seuls les événements avec une date exacte et un lieu placé sur la carte sont comparés (y compris comme témoin).')}
            ${alerts.length ? `<p class="muted">${plural(alerts.length, 'alerte', 'alertes')}, les plus nettes d’abord.</p>${journeysTable(alerts)}` : empty('Aucun voyage impossible repéré.', {icon: '✅'})}</section>`;
        A().bindTableLinks();
    };
    ext.dashboard.journeys_widget = {load: () => api('impossible_journeys'), render: (index, widget, span, data) => {
        const alerts = (data?.alerts || []).slice(0, 5);
        return card(index, 'Voyages impossibles', (data?.alerts || []).length || '', alerts.length ? `${journeysTable(alerts)}<div class="page-actions"><button type="button" class="button small secondary" data-h-open-maint="journeys">Tout voir</button></div>` : empty('Aucun voyage impossible repéré.', {icon: '✅'}), span);
    }};

    /* ═══════════════════════ 🤝 TRAVAIL À DEUX ═══════════════════════ */

    const opLabel = {create: 'Ajout', update: 'Modification', delete: 'Suppression'};
    const stateLabel = {new: 'nouveau', ok: 'à appliquer', conflict: '⚠ tu as aussi modifié', same: 'déjà identique', missing: 'absent chez toi'};
    ext.maintenance.sync = async (token, preview = null) => {
        const s = await api('sync_status');
        if (!isCurrent(token)) return;
        const intro = 'Toi et un cousin, chacun sur son ordinateur, sur la même généalogie. L’app échange des « paquets de modifications » : tu reçois les siens, tu acceptes ou refuses chaque changement. On ne partage jamais la base elle-même par iCloud ou Dropbox (risque de fichier abîmé).';
        let body;
        if (!s.active) {
            body = `<div class="maintenance-panel"><h3>Comment ça marche</h3><ol class="h-steps"><li><b>Commencer</b> ici : chaque fiche reçoit un identifiant commun.</li><li>Donner <b>une copie de ta base</b> à ton cousin (bouton ci-dessous) : il l’ouvre dans son LCNDA (Maintenance → Import → ouvrir une base .db).</li><li>Ensuite, chacun travaille de son côté et envoie de temps en temps <b>un paquet de ses modifications</b> (un petit fichier, par e-mail par exemple).</li><li>À la réception, tu <b>acceptes ou refuses</b> chaque changement. Une copie de sécurité est faite avant.</li></ol>
                <form id="h-sync-start" class="page-actions"><input name="author" placeholder="Ton prénom (ex. Victor)" required><button class="button" type="submit">Commencer le travail à deux</button></form>
                <p class="muted">Ce qui est échangé : fiches, unions, liens parents-enfants, événements, lieux, notes. Les médias (photos, scans) ne sont pas échangés.</p></div>`;
        } else {
            body = `<div class="h-sync-grid"><section class="maintenance-panel"><h3>Envoyer mes modifications</h3><p>${s.pending ? `<strong>${plural(s.pending, 'modification', 'modifications')}</strong> depuis le dernier paquet.` : 'Aucune modification depuis le dernier paquet.'}${s.last_export_at ? ` <small class="muted">Dernier envoi : ${esc(new Date(s.last_export_at).toLocaleString('fr-FR'))}</small>` : ''}</p>
                <div class="page-actions"><button type="button" class="button" data-h-sync-export ${s.pending ? '' : 'disabled'}>Préparer le paquet</button><a class="button secondary" href="api.php?action=export_sqlite" download>Copie de la base pour un cousin</a></div>
                <p class="muted">Le paquet est un fichier « .lcnda-changes.json » à envoyer à ton cousin. Une fois préparé, ces modifications ne seront plus remises dans le paquet suivant : garde-le jusqu’à ce qu’il l’ait reçu.</p>
                <form id="h-sync-author" class="page-actions"><label class="h-inline">Je signe mes paquets <input name="author" value="${esc(s.author)}"></label><button class="button small secondary" type="submit">Changer</button></form></section>
                <section class="maintenance-panel"><h3>Recevoir un paquet</h3><form id="h-sync-receive" class="page-actions"><input type="file" name="file" accept=".json,application/json" required><button class="button" type="submit">Lire le paquet</button></form></section></div>
                ${preview ? syncPreviewHtml(preview) : ''}
                ${s.log?.length ? `<h3>Paquets échangés</h3><table class="data-table"><thead><tr><th>Date</th><th>Sens</th><th>De</th><th>Contenu</th></tr></thead><tbody>${s.log.map(l => `<tr><td>${esc(l.created_at)}</td><td>${l.direction === 'sent' ? '📤 envoyé' : '📥 reçu'}</td><td>${esc(l.author)}</td><td>${esc(l.summary)}${l.direction === 'received' ? ` <small>(${l.accepted_count}/${l.change_count} acceptés)</small>` : ''}</td></tr>`).join('')}</tbody></table>` : ''}`;
        }
        A().$('#workspace').innerHTML = `<section class="page collection-page">${header('MAINTENANCE', 'Travail à deux', intro)}${body}</section>`;
        const ws = A().$('#workspace');
        ws.querySelector('#h-sync-start')?.addEventListener('submit', async ev => { ev.preventDefault(); try { await api('sync_start', {}, {method: 'POST', body: {author: ev.currentTarget.author.value}}); toast('Travail à deux commencé. Donne maintenant une copie de ta base à ton cousin.'); rerender(); } catch (error) { toast(error.message, 'error'); } });
        ws.querySelector('#h-sync-author')?.addEventListener('submit', async ev => { ev.preventDefault(); await api('sync_set_author', {}, {method: 'POST', body: {author: ev.currentTarget.author.value}}); toast('Enregistré.'); });
        ws.querySelector('[data-h-sync-export]')?.addEventListener('click', () => { location.assign('api.php?action=sync_export'); setTimeout(() => rerender(), 2500); });
        ws.querySelector('#h-sync-receive')?.addEventListener('submit', async ev => {
            ev.preventDefault();
            const fd = new FormData(ev.currentTarget); fd.append('csrf', S().csrf);
            try {
                const r = await fetch('api.php?action=sync_preview', {method: 'POST', body: fd, headers: {'X-CSRF-Token': S().csrf}});
                const data = await r.json();
                if (!r.ok || data.error) throw new Error(data.error || 'Paquet illisible');
                ext.maintenance.sync(++S().workspaceToken, data);
            } catch (error) { toast(error.message, 'error'); }
        });
        const apply = ws.querySelector('#h-sync-apply');
        if (apply) {
            ws.querySelector('[data-h-sync-all]')?.addEventListener('change', ev => apply.querySelectorAll('[name=accept]').forEach(c => { if (!c.disabled) c.checked = ev.target.checked; }));
            apply.addEventListener('submit', async ev => {
                ev.preventDefault();
                const accepted = [...apply.querySelectorAll('[name=accept]:checked')].map(c => Number(c.value));
                if (!accepted.length) return toast('Aucun changement coché.', 'error');
                if (!await A().confirmBox(`Appliquer ${plural(accepted.length, 'changement', 'changements')} ? Une copie de sécurité de ta base est faite avant.`, {title: 'Appliquer les changements', okLabel: 'Appliquer'})) return;
                try {
                    const r = await api('sync_apply', {}, {method: 'POST', body: {token: preview.token, accepted}});
                    toast(`${plural(r.applied, 'changement appliqué', 'changements appliqués')}${r.locked_skipped ? ` ; ${plural(r.locked_skipped, 'changement ignoré', 'changements ignorés')} (fiche verrouillée)` : ''}.`);
                    (r.errors || []).slice(0, 5).forEach(e => toast(e, 'error'));
                    ext.maintenance.sync(++S().workspaceToken);
                } catch (error) { toast(error.message, 'error'); }
            });
        }
    };
    function syncPreviewHtml(p) {
        const items = p.items || [];
        const shown = items.filter(i => i.state !== 'same');
        return `<form class="maintenance-panel" id="h-sync-apply"><h3>Paquet de ${esc(p.author || '?')} <small class="muted">(${esc(p.created_at ? new Date(p.created_at).toLocaleString('fr-FR') : '')})</small></h3>
            ${p.already_received ? '<p class="h-offsite-sentence is-warn">⚠ Ce paquet a déjà été reçu une fois.</p>' : ''}
            <p>${plural(items.length, 'changement', 'changements')}${items.length - shown.length ? `, dont ${items.length - shown.length} déjà identiques chez toi (ignorés)` : ''}. Coche ce que tu acceptes. Les conflits (tu as aussi modifié la même chose) sont décochés : regarde-les.</p>
            <label class="checkbox-line"><input type="checkbox" data-h-sync-all checked> Tout cocher / décocher</label>
            <table class="data-table h-sync-table"><thead><tr><th></th><th>Changement</th><th>Détail</th></tr></thead><tbody>${shown.map(i => `<tr class="is-${esc(i.state)}"><td><input type="checkbox" name="accept" value="${Number(i.index)}" ${i.state === 'conflict' || i.state === 'missing' ? '' : 'checked'}></td><td><strong>${esc(opLabel[i.op])}</strong> — ${esc(i.label)}<br><small class="muted">${esc(stateLabel[i.state] || i.state)}</small></td><td>${i.fields?.length ? `<ul class="h-sync-fields">${i.fields.map(f => `<li><code>${esc(f.field)}</code> : <s>${esc(f.mine ?? '—')}</s> → <strong>${esc(f.theirs ?? '—')}</strong></li>`).join('')}</ul>` : ''}</td></tr>`).join('') || '<tr><td colspan="3">Rien de nouveau.</td></tr>'}</tbody></table>
            <div class="page-actions action-zone"><button class="button" type="submit">Appliquer les changements cochés</button></div></form>`;
    }
})();
