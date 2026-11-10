/* LCNDA — 🗓 Sauvegarde automatique, 🔄 Deux ordinateurs et 🔒 verrou d'ouverture (mode d'emploi : docs/UI.md).
 * - Réglages → 🗓 Sauvegarde automatique : quand (heures, jour, semaine, à la fermeture), où (un dossier : clé, iCloud Drive,
 *   Dropbox, OneDrive…), quoi (N copies, médias, toutes les généalogies) ; K2 (réglages gardés sur le serveur, ↶ Annuler),
 *   « Dernière sauvegarde : … » (K4), les copies vérifiées (K8) et « ↺ Revenir à cette copie » (confirmBox : on écrase).
 *   La page ouverte demande chaque minute « c'est l'heure ? » (autobackup_tick) ; à la fermeture : autobackup_close.
 * - Widget « 🗓 Sauvegarde automatique ».
 * - Réglages → Travail à deux : section « 🔄 Deux ordinateurs » (dossier partagé, Synchroniser, conflits côte à côte,
 *   ↶ Annuler une fusion, paquets mis de côté → la revue du Travail à deux). Serveur : lib/sync_dossier.php, lib/sauvegarde_auto.php.
 * - 🔒 Base ouverte sur un autre ordinateur : fenêtre claire (réessayer, ouvrir quand même).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.maintenance = ext.maintenance || {};
    ext.dashboard = ext.dashboard || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const post = (action, body = {}) => api(action, {}, {method: 'POST', body});
    const toast = (...a) => A().toast(...a);
    const S = () => A().state;
    const plural = (n, one, many) => (A()?.plural ? A().plural(n, one, many) : `${n} ${n > 1 ? many || one + 's' : one}`);
    const when = (d, o) => (UI().when ? UI().when(d, o) : esc(d || ''));
    const whenText = (d, o) => (UI().whenText ? UI().whenText(d, o) : String(d || ''));
    const badge = (t, k) => (UI().badge ? UI().badge(t, k) : `<span class="ui-badge is-${k}">${esc(t)}</span>`);
    const size = n => { n = Number(n) || 0; return n >= 1073741824 ? `${(n / 1073741824).toFixed(1).replace('.', ',')} Go` : n >= 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} Mo` : n >= 1024 ? `${Math.round(n / 1024)} Ko` : `${n} o`; };
    const emptyLine = (ico, text, btn = '') => `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">${ico}</span><span class="empty-line-text">${esc(text)}</span>${btn}</p>`;
    const hint = t => `<p class="ui-hint">${t}</p>`;
    const msg = (kind, text) => `<p class="sa-msg is-${kind}">${{info: 'ℹ️', warn: '⚠️', error: '⛔', ok: '✓'}[kind] || ''} ${text}</p>`;
    const ls = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const SECONDARY = (() => { try { return !!new URLSearchParams(location.search).get('view') || window.self !== window.top; } catch (_) { return true; } })();
    const readOnlyMode = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('ms-open');
    const goPage = tab => { const st = S(); st.maintenanceTab = tab; A().setModule('maintenance'); };

    /* ═══════════ Onglet des Réglages ═══════════ */
    function registerTab() {
        const tabs = A()?.defaultMaintenanceTabs;
        if (tabs && !tabs.some(t => t[0] === 'sauvegarde')) tabs.push(['sauvegarde', '14b', 'Sauvegarde automatique']);
        const app = A();
        if (app?.defaultDashboardBlocks && !app.defaultDashboardBlocks.some(x => x[0] === 'autobackup_widget')) app.defaultDashboardBlocks.push(['autobackup_widget', '🗓 Sauvegarde automatique']);
        if (app?.defaultDashboardBlockSpans) app.defaultDashboardBlockSpans.autobackup_widget = '6';
        if (app?.dashboardWidgetInfo) app.dashboardWidgetInfo.autobackup_widget = 'Date de ta dernière sauvegarde automatique, vérifiée, et un bouton pour en faire une tout de suite.';
    }
    registerTab(); document.addEventListener('DOMContentLoaded', registerTab, {once: true});

    /* ═══════════ 🗓 Sauvegarde automatique : la page ═══════════ */
    const FREQ = [['off', 'Jamais tout seul (seulement à la main)'], ['hours', 'Toutes les … heures'], ['day', 'Chaque jour'], ['week', 'Chaque semaine']];
    const KIND = {auto: 'Automatique', fermeture: 'À la fermeture', manual: 'À la main', migration: 'Avant une mise à jour', avant: 'Avant une restauration ou une fusion', autre: 'Autre'};
    const FREQ_TEXT = s => s.freq === 'hours' ? `toutes les ${plural(s.every_hours, 'heure', 'heures')}` : s.freq === 'day' ? 'chaque jour' : s.freq === 'week' ? 'chaque semaine' : '';

    function lastLine(st) {
        const last = st.last, err = st.last_error;
        const t = st.last_ok_time;
        let line = t ? `Dernière sauvegarde : <b>${when(t)}</b>` : 'Dernière sauvegarde : <b>jamais</b>';
        let b = t ? badge('Vérifiée', 'green') : badge('Aucune', 'grey');
        if (st.missing) b = badge('Dossier absent', 'yellow');
        else if (err && (!t || new Date(err.time * 1000) > new Date(t))) b = badge('Échec', 'red');
        const files = last?.files || [];
        const extra = files.length ? ` · ${files.map(f => `${esc(f.genealogy)} (${size(f.size)}${f.media_copied ? `, + ${plural(f.media_copied, 'média', 'médias')}` : ''})`).join(', ')}` : last?.skipped?.length ? ' · rien n’avait changé' : '';
        return `${line} ${b}<small class="muted">${extra}</small>`;
    }
    function statusHtml(st) {
        const s = st.settings;
        const parts = [`<p class="sa-last" data-sa-last>${lastLine(st)}</p>`];
        if (s.freq !== 'off' && st.next) parts.push(`<p class="muted">Prochaine : ${new Date(st.next) <= new Date() ? 'dès maintenant' : when(st.next)} (${esc(FREQ_TEXT(s))}${s.on_close ? ', et à la fermeture' : ''}).</p>`);
        else if (s.on_close) parts.push('<p class="muted">Prochaine : à la fermeture de l’app (si quelque chose a changé).</p>');
        else parts.push(msg('info', 'La sauvegarde automatique est éteinte : choisis « Chaque jour » ci-dessous.'));
        if (st.missing) parts.push(msg('warn', `${esc(st.dir_error)} Rien n’est bloqué : continue à travailler.`));
        else if (st.dir_error) parts.push(msg('error', esc(st.dir_error)));
        else if (st.last_error && (!st.last_ok_time || st.last_error.time * 1000 > new Date(st.last_ok_time).getTime())) parts.push(msg('error', `Dernier essai raté : ${esc(st.last_error.error)}`));
        if (st.same_disk) parts.push(msg('warn', 'Ce dossier est sur le même disque que ta généalogie : il ne la protège pas d’une panne ou d’un vol. Prends plutôt une clé, un disque externe ou un dossier iCloud Drive, Dropbox, OneDrive…'));
        return parts.join('');
    }
    function copiesHtml(st) {
        const rows = st.copies || [];
        if (!rows.length) return emptyLine('🗓', 'Aucune copie dans ce dossier pour l’instant.', ' <button type="button" class="button small" data-sa-now>💾 Sauvegarder maintenant</button>');
        return `<div class="sa-table-wrap"><table class="data-table sa-copies"><thead><tr><th>Quand</th><th>Sorte</th><th>Taille</th><th>Contrôle</th><th></th></tr></thead><tbody>${rows.map(c => `<tr data-sa-copy="${esc(c.name)}">
            <td>${when(c.time)}${c.persons != null ? `<br><small class="muted">${plural(c.persons, 'personne', 'personnes')}</small>` : ''}</td><td>${esc(KIND[c.kind] || c.kind)}</td><td>${size(c.size)}</td>
            <td>${c.integrity === 'ok' ? badge('Vérifiée', 'green') : c.integrity ? badge('Abîmée', 'red') : badge('Pas vérifiée', 'grey')}</td>
            <td><button type="button" class="button small secondary" data-sa-restore="${esc(c.name)}" data-sa-when="${esc(whenText(c.time))}">↺ Revenir à cette copie</button></td></tr>`).join('')}</tbody></table></div>`;
    }
    function formHtml(st) {
        const s = st.settings;
        return `<section class="maintenance-panel"><h3>⏰ Quand</h3>
            <div class="sa-row"><label class="sa-field"><span>Sauvegarder</span><select data-sa-field="freq">${FREQ.map(([v, l]) => `<option value="${v}"${s.freq === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
            <label class="sa-field" data-sa-hours ${s.freq === 'hours' ? '' : 'hidden'}><span>Toutes les</span><input type="number" min="1" max="168" step="1" data-unit="h" data-sa-field="every_hours" value="${esc(s.every_hours)}"></label></div>
            <label class="ui-toggle"><input type="checkbox" data-sa-field="on_close"${s.on_close ? ' checked' : ''}><i></i>Aussi à la fermeture de l’app</label>
            ${hint('Une copie quand tu quittes l’app (ou fermes l’onglet), seulement si quelque chose a changé.')}
            ${hint('La copie se fait pendant que l’app est ouverte : si l’ordinateur était éteint à l’heure prévue, elle se fait dès la prochaine ouverture.')}</section>
            <section class="maintenance-panel"><h3>📁 Où</h3>
            <label class="sa-field sa-dir"><span>Dossier des copies</span><input type="text" data-sa-field="dir" value="${esc(s.dir)}" placeholder="/Volumes/MaCle/LCNDA  ou  ~/Dropbox/LCNDA" list="sa-suggest" autocomplete="off" spellcheck="false"></label>
            <datalist id="sa-suggest">${(st.suggestions || []).map(x => `<option value="${esc(x.path)}">${esc(x.label)}</option>`).join('')}</datalist>
            <p class="ui-hint" data-sa-dir-hint>${s.dir ? (st.missing ? '⚠️ Dossier introuvable pour l’instant (clé débranchée ?).' : `✓ ${st.cloud ? 'Dossier synchronisé en ligne' : 'Dossier trouvé'} : ${esc(st.folder)}`) : 'Vide : dans le dossier de l’app, sur le même disque. Mieux : une clé USB, un disque externe, ou un dossier iCloud Drive, Dropbox, OneDrive… (l’app n’utilise aucun service en ligne : c’est un simple dossier).'}</p></section>
            <section class="maintenance-panel"><h3>📦 Quoi</h3>
            <label class="sa-field"><span>Garder les dernières</span><input type="number" min="2" max="100" step="1" data-unit="copies" data-sa-field="keep" value="${esc(s.keep)}"></label>
            ${hint('Au-delà, la plus ancienne copie automatique est effacée. Les copies faites avant une mise à jour ou une restauration ne sont jamais effacées.')}
            <label class="ui-toggle"><input type="checkbox" data-sa-field="media"${s.media ? ' checked' : ''}><i></i>Avec les médias (photos, actes, sons…)</label>
            ${hint('Recopiés une seule fois dans « media » à côté des copies : ensuite, seulement les nouveaux.')}
            ${st.genealogies > 1 ? `<label class="ui-toggle"><input type="checkbox" data-sa-field="all"${s.all ? ' checked' : ''}><i></i>Toutes mes généalogies (${st.genealogies})</label>${hint('Chacune dans son sous-dossier, pour qu’elles ne s’effacent pas l’une l’autre.')}` : ''}</section>`;
    }
    function readForm(root) {
        const v = k => root.querySelector(`[data-sa-field="${k}"]`);
        const out = {};
        ['freq', 'dir'].forEach(k => { if (v(k)) out[k] = v(k).value.trim(); });
        ['every_hours', 'keep'].forEach(k => { if (v(k)) out[k] = Number(v(k).value) || 0; });
        ['on_close', 'media', 'all'].forEach(k => { if (v(k)) out[k] = v(k).checked; });
        return out;
    }
    const LABELS = {freq: 'Sauvegarder', every_hours: 'Toutes les … heures', on_close: 'Aussi à la fermeture', dir: 'Dossier des copies', keep: 'Garder les dernières', media: 'Avec les médias', all: 'Toutes mes généalogies'};
    async function saveSettings(next, prev, label) {
        UI().pageSaved?.('saving');
        try {
            const st = await post('autobackup_settings', next);
            UI().pageSaved?.('saved');
            if (prev) A().undoToast?.(`Réglage changé : « ${label} »`, {undo: async () => { await post('autobackup_settings', prev); refresh(); }, redo: async () => { await post('autobackup_settings', next); refresh(); }});
            return st;
        } catch (e) { UI().pageSaved?.('error'); toast(e.message, 'error', {retry: () => saveSettings(next, prev, label)}); return null; }
    }
    function refresh() { if (S().module === 'maintenance' && S().maintenanceTab === 'sauvegarde') ext.maintenance.sauvegarde(++S().workspaceToken); }

    ext.maintenance.sauvegarde = async token => {
        const ws = A().$('#workspace');
        let st;
        try { st = await api('autobackup_status'); } catch (e) { if (token === S().workspaceToken) ws.innerHTML = `<section class="page">${msg('error', esc(e.message))}</section>`; return; }
        if (token !== S().workspaceToken || S().module !== 'maintenance' || S().maintenanceTab !== 'sauvegarde') return;
        const head = UI().pageHeader ? UI().pageHeader({title: 'Sauvegarde automatique', saved: true,
            help: 'Une copie de ta généalogie, faite toute seule, vérifiée, rangée dans le dossier de ton choix.',
            primary: '<button type="button" class="button" data-sa-now data-shortcut="⇧⌘B">💾 Sauvegarder maintenant</button>',
            actions: ['<button type="button" class="button secondary" data-ui-reset data-sa-reset>↺ Remettre comme au départ</button>']}) : '<h2>Sauvegarde automatique</h2>';
        ws.innerHTML = `<section class="page sa-page" data-sa-page>${head}
            <section class="maintenance-panel sa-status" data-sa-status>${statusHtml(st)}</section>
            <div class="sa-grid">${formHtml(st)}</div>
            <section class="maintenance-panel"><h3>🗂 Les copies <small class="muted">${esc(st.folder || '')}</small></h3>${copiesHtml(st)}
            ${hint('« ↺ Revenir à cette copie » remplace ta généalogie par la copie choisie ; ta base actuelle est gardée d’abord (« avant restauration »).')}</section>
            <p class="muted sa-more">Autres protections : <button type="button" class="link-button" data-sa-go="export">🛟 Copie hors de cet ordinateur</button> · <button type="button" class="link-button" data-sa-go="sync">🔄 Deux ordinateurs</button> · <button type="button" class="link-button" data-sa-go="safety">Sécurité &amp; comparaison</button></p></section>`;
        const root = ws.querySelector('[data-sa-page]');
        let current = readForm(root);
        root.addEventListener('change', async e => {
            const f = e.target.closest('[data-sa-field]'); if (!f) return;
            const next = readForm(root), prev = {...st.settings};
            root.querySelector('[data-sa-hours]').hidden = next.freq !== 'hours';
            if (JSON.stringify(next) === JSON.stringify(current)) return;
            current = next;
            const r = await saveSettings(next, prev, LABELS[f.dataset.saField] || 'Sauvegarde');
            if (r) { st = r; root.querySelector('[data-sa-status]').innerHTML = statusHtml(st); }
        });
        let timer = 0;
        root.querySelector('[data-sa-field="dir"]')?.addEventListener('input', e => {
            clearTimeout(timer);
            timer = setTimeout(async () => {
                const h = root.querySelector('[data-sa-dir-hint]'); if (!h) return;
                const v = e.target.value.trim();
                if (!v) { h.textContent = 'Vide : dans le dossier de l’app, sur le même disque.'; h.classList.remove('is-error', 'is-ok'); return; }
                try { const d = await api('autobackup_check', {dir: v}); h.textContent = d.ok ? `✓ ${d.cloud ? 'Dossier synchronisé en ligne' : 'Dossier trouvé'} : ${d.dir}` : `⚠️ ${d.error}`; h.classList.toggle('is-ok', !!d.ok); h.classList.toggle('is-error', !d.ok); } catch (_) {}
            }, 400);
        });
        root.addEventListener('click', async e => {
            const go = e.target.closest('[data-sa-go]'); if (go) { goPage(go.dataset.saGo); return; }
            if (e.target.closest('[data-sa-reset]')) {
                const prev = {...st.settings}, next = {freq: 'off', every_hours: 6, on_close: false, dir: '', keep: 10, media: false, all: false};
                const r = await saveSettings(next, prev, 'Réglages remis comme au départ'); if (r) refresh(); return;
            }
            const rs = e.target.closest('[data-sa-restore]');
            if (rs) { restore(rs.dataset.saRestore, rs.dataset.saWhen); return; }
        });
    };
    async function restore(name, whenTxt) {
        const ok = await A().confirmBox(`Remettre ta généalogie comme dans la copie choisie${whenTxt ? ` (${whenTxt})` : ''} ? Tout ce que tu as fait depuis sera remplacé. Ta base actuelle est d’abord gardée dans les sauvegardes (« avant restauration »), pour pouvoir y revenir.`,
            {title: 'Revenir à cette copie', okLabel: '↺ Revenir à cette copie', danger: true});
        if (!ok) return;
        toast('Restauration en cours…');
        try {
            const r = await post('autobackup_restore', {name});
            toast(`✓ Généalogie remise comme dans la copie (${plural(Number(r.persons) || 0, 'personne', 'personnes')}). L’ancienne est gardée : ${r.safety}.`, 'success');
            setTimeout(() => location.reload(), 1500);
        } catch (e) { toast(e.message, 'error'); }
    }
    async function backupNow(btn) {
        if (readOnlyMode()) return toast('Mode consultation : rien ne peut être modifié.');
        if (btn) btn.disabled = true;
        toast('Sauvegarde en cours…');
        try {
            const r = await post('autobackup_now');
            const f = (r.files || [])[0];
            if (r.ok && f) toast(`✓ Sauvegarde faite et vérifiée${(r.files || []).length > 1 ? ` (${plural(r.files.length, 'généalogie', 'généalogies')})` : ''} : ${size(f.size)}.`, 'success');
            else toast(r.error || 'Sauvegarde impossible.', 'error', {retry: () => backupNow()});
        } catch (e) { toast(e.message, 'error', {retry: () => backupNow()}); }
        finally { if (btn) btn.disabled = false; }
        refresh();
        if (S().module === 'dashboard') A().setModule?.('dashboard', false);
    }
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-sa-now]'); if (b) { e.preventDefault(); backupNow(b); return; }
        if (e.target.closest?.('[data-sa-open]')) goPage('sauvegarde');
    });

    /* ═══════════ Widget ═══════════ */
    ext.dashboard.autobackup_widget = {load: () => api('autobackup_status'), render: (index, w, span, st) => {
        const card = A().card, emptyFn = A().empty;
        if (!st) return card(index, '🗓 Sauvegarde automatique', '', emptyFn('État indisponible.', {icon: '🗓'}), span);
        const s = st.settings || {};
        const body = `<div class="sa-widget"><p class="sa-last">${lastLine(st)}</p>
            ${st.missing ? msg('warn', 'Dossier introuvable (clé débranchée ?). Rien n’est bloqué.') : s.freq === 'off' && !s.on_close ? msg('info', 'Éteinte : rien ne se fait tout seul.') : `<p class="muted">${esc(FREQ_TEXT(s) ? `Tout seul ${FREQ_TEXT(s)}` : 'À la fermeture')}${s.dir ? ` · ${esc(s.dir)}` : ''}</p>`}
            <div class="page-actions"><button type="button" class="button small" data-sa-now>💾 Sauvegarder maintenant</button><button type="button" class="button small secondary" data-sa-open>⚙️ Régler</button></div></div>`;
        return card(index, '🗓 Sauvegarde automatique', '', body, span);
    }};

    /* ═══════════ Le planning : « c'est l'heure ? » chaque minute, la fermeture ═══════════ */
    let started = false, tickTimer = 0, onClose = false;
    async function migrateOld() {
        // l'ancienne « Sauvegarde automatique programmée » (gardée dans ce navigateur) passe une fois dans les réglages de l'app
        const old = ls('genealogie-auto-backup-settings', null);
        if (!old || !old.enabled || old.migratedTo) return;
        try {
            const st = await api('autobackup_status');
            if (st.fresh) {
                const hours = Math.max(1, Math.round((Number(old.intervalMinutes) || 60) / 60));
                const dir = String(old.dir || '').trim();
                await post('autobackup_settings', {freq: hours >= 24 ? 'day' : 'hours', every_hours: hours, keep: Number(old.maxFiles) || 10, dir: dir === 'data/backups' ? '' : dir});
            }
            lsSet('genealogie-auto-backup-settings', {...old, enabled: false, migratedTo: 'sauvegarde-auto'});
        } catch (_) {}
    }
    async function tick() {
        try {
            const r = await api('autobackup_tick');
            if (r.missing || (r.ran && !r.ok && r.error && !r.busy)) {
                const last = Number(ls('lcnda-sa-warned', 0)) || 0;
                if (Date.now() - last > 6 * 3600 * 1000) {
                    lsSet('lcnda-sa-warned', Date.now());
                    toast(`🗓 ${r.error || 'Sauvegarde automatique impossible.'}`, 'error', {action: {label: '⚙️ Régler', run: () => goPage('sauvegarde')}});
                }
            }
            if (r.ran && r.ok && (r.files || []).length) refresh();
        } catch (_) {}
    }
    async function start() {
        if (started || SECONDARY || !window.GENEALOGY_READY) return;
        started = true;
        await migrateOld();
        setTimeout(tick, 8000);
        tickTimer = setInterval(tick, 60000);
        try { onClose = !!(await api('autobackup_status')).settings?.on_close; } catch (_) {}
        setTimeout(autoSync, 12000);
        setInterval(autoSync, 15 * 60000);
        setInterval(() => { if (!document.hidden) api('open_lock_status').catch(() => {}); }, 60000);
    }
    ext.autoBackup = {start, now: () => backupNow(), tick};
    function beacon(action) {
        try {
            const csrf = S()?.csrf || window.INSTALL_CSRF || '';
            if (!csrf || !navigator.sendBeacon) return;
            navigator.sendBeacon(`api.php?action=${action}`, new Blob([JSON.stringify({csrf})], {type: 'application/json'}));
        } catch (_) {}
    }
    window.addEventListener('pagehide', () => {
        if (!started || SECONDARY || readOnlyMode()) return;
        if (onClose) beacon('autobackup_close');
        beacon('open_lock_release');
    });
    window.addEventListener('lcnda:data-changed', e => { if (e.detail?.action === 'autobackup_settings') api('autobackup_status').then(st => { onClose = !!st.settings?.on_close; }).catch(() => {}); });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 3000), {once: true}); else setTimeout(start, 3000);

    /* ═══════════ 🔄 Deux ordinateurs (section de « Travail à deux ») ═══════════ */
    const FIELD = {first_name: 'Prénom', last_name: 'Nom', middle_name: 'Autres prénoms', gender: 'Sexe', occupation: 'Métier', nickname: 'Surnom', title: 'Titre', body: 'Texte', date_text: 'Date', year: 'Année',
        place_id: 'Lieu', place_text: 'Lieu (texte)', description: 'Description', name: 'Nom', county: 'Département', country: 'Pays', author: 'Auteur', publication: 'Publication', url: 'Adresse',
        text: 'Texte', filename: 'Fichier', transcription: 'Transcription', note: 'Note', page: 'Page', quality: 'Qualité', notes: 'Notes', event_type_id: 'Sorte d’événement', is_living: 'Vivant',
        partner1_id: 'Partenaire 1', partner2_id: 'Partenaire 2', child_id: 'Enfant', entity_type: 'Posée sur', entity_id: 'Fiche', sex: 'Sexe', age: 'Âge', cause: 'Cause'};
    const shown = v => v === null || v === undefined || v === '' ? '<span class="muted">—</span>' : esc(typeof v === 'object' ? JSON.stringify(v) : v);
    function conflictHtml(c) {
        const other = c.machine_label || c.author || 'l’autre ordinateur';
        const rows = !c.mine_exists ? `<tr><td colspan="3">Supprimée sur cet ordinateur, modifiée sur « ${esc(other)} ».</td></tr>`
            : !c.theirs_exists ? `<tr><td colspan="3">Modifiée ici, supprimée sur « ${esc(other)} ».</td></tr>`
            : c.fields.map(f => `<tr><th scope="row">${esc(FIELD[f.field] || f.field)}</th><td class="sd-mine">${shown(f.mine)}</td><td class="sd-theirs">${shown(f.theirs)}</td></tr>`).join('');
        return `<article class="sd-conflict" data-sd-conflict="${c.id}"><header><strong>${esc(c.label || 'Fiche')}</strong> ${badge('À choisir', 'yellow')}<small class="muted"> · modifiée des deux côtés · ${when(c.created_at)}</small></header>
            <div class="sa-table-wrap"><table class="data-table sd-side"><thead><tr><th></th><th>Sur cet ordinateur</th><th>Sur « ${esc(other)} »${c.author && c.author !== other ? ` <small>(${esc(c.author)})</small>` : ''}</th></tr></thead><tbody>${rows}</tbody></table></div>
            <div class="page-actions"><button type="button" class="button small secondary" data-sd-choice="mine">Garder la mienne</button><button type="button" class="button small secondary" data-sd-choice="theirs">Prendre l’autre</button>${c.can_both ? '<button type="button" class="button small secondary" data-sd-choice="both">Garder les deux</button>' : ''}</div></article>`;
    }
    function panelHtml(st) {
        const ask = !st.folder;
        const sugg = `<datalist id="sd-suggest">${(st.suggestions || []).map(x => `<option value="${esc(x.path.replace(/\/LCNDA$/, ''))}">${esc(x.label)}</option>`).join('')}</datalist>`;
        if (ask) return `<h3>🔄 Deux ordinateurs</h3>
            <p>La même généalogie sur deux ordinateurs (le portable et celui du bureau…), par un <b>dossier partagé</b> : une clé USB, ou un dossier iCloud Drive, Dropbox, OneDrive… L’app n’utilise aucun service en ligne et n’a pas besoin de serveur : chaque ordinateur garde sa base et dépose ses changements dans ce dossier ; l’autre les reprend.</p>
            <form class="sd-setup" data-sd-setup><label class="sa-field sa-dir"><span>Dossier partagé</span><input name="folder" type="text" required placeholder="/Volumes/MaCle  ou  ~/Dropbox" list="sd-suggest" autocomplete="off" spellcheck="false"></label>
            ${st.active ? '' : `<label class="sa-field"><span>Ton prénom</span><input name="author" type="text" placeholder="Victor" value="${esc(st.author)}"></label>`}
            <button class="button" type="submit">🔗 Relier ce dossier</button></form>${sugg}
            <ol class="h-steps"><li>Ici : choisis le dossier. L’app y pose une copie de départ (<code>depart.db</code>).</li><li>Sur l’autre ordinateur : ouvre <code>depart.db</code> dans LCNDA (écran de démarrage → Importer un fichier, ou une nouvelle généalogie vide), puis ici même, choisis le même dossier.</li><li>Ensuite, « 🔄 Synchroniser » (ou tout seul à l’ouverture) : chacun reçoit les changements de l’autre. Si la même chose a été changée des deux côtés, tu choisis.</li></ol>
            ${hint('Ne range jamais le fichier de la base lui-même dans iCloud ou Dropbox pour l’ouvrir des deux côtés : l’app le refuse (verrou), car il pourrait s’abîmer.')}`;
        const other = (st.others || [])[0];
        const conf = st.conflicts || [];
        return `<h3>🔄 Deux ordinateurs ${st.reachable ? badge('Dossier branché', 'green') : badge('Dossier absent', 'yellow')}</h3>
            <p class="sd-line"><span>📁 <code>${esc(st.folder)}</code></span><span>💻 Cet ordinateur : <b>${esc(st.machine)}</b></span>${other ? `<span>💻 L’autre : <b>${esc(other.label)}</b>${other.seen_at ? ` · vu ${when(other.seen_at)}` : ''}</span>` : '<span class="muted">L’autre ordinateur n’est pas encore passé par ce dossier.</span>'}</p>
            ${st.reachable ? '' : msg('warn', 'Dossier introuvable pour l’instant (clé débranchée ?). Rien n’est perdu : tes changements partiront la prochaine fois.')}
            <p class="sd-line"><span>${st.pending ? `<b>${plural(st.pending, 'changement', 'changements')}</b> à envoyer` : 'Rien à envoyer'}</span><span>${st.incoming ? `<b>${plural(st.incoming, 'paquet', 'paquets')}</b> à recevoir` : 'Rien à recevoir'}</span><span>Dernière synchronisation : ${st.last_sync ? when(st.last_sync) : 'jamais'}</span></p>
            <div class="page-actions"><button type="button" class="button" data-sd-sync>🔄 Synchroniser</button><button type="button" class="button secondary" data-sd-forget>Changer de dossier</button></div>
            <label class="ui-toggle"><input type="checkbox" data-sd-auto${st.auto ? ' checked' : ''}><i></i>Synchroniser tout seul à l’ouverture (puis toutes les 15 minutes)</label>
            ${conf.length ? `<h4 class="sd-h">⚠️ ${plural(conf.length, 'chose changée des deux côtés', 'choses changées des deux côtés')} : choisis</h4>${hint('Ces fiches attendent ton choix ; tout le reste a déjà été fusionné. « Garder la mienne » renvoie ta version à l’autre ordinateur ; « Prendre l’autre » la remplace ici.')}<div class="sd-conflicts">${conf.map(conflictHtml).join('')}</div>` : ''}
            ${(st.held || []).length ? `<h4 class="sd-h">Paquets mis de côté</h4><ul class="sd-held">${st.held.map(h => `<li>${esc(h.machine_label || h.author)} · ${when(h.created_at)} · ${plural(h.count, 'changement', 'changements')} <button type="button" class="button small secondary" data-sd-review="${esc(h.package_uid)}">Revoir</button></li>`).join('')}</ul>${hint('Tu as annulé leur fusion : ils ne sont plus repris tout seuls. « Revoir » pour choisir changement par changement.')}` : ''}
            ${(st.merges || []).length ? `<details class="sd-merges"><summary>Dernières fusions</summary><ul>${st.merges.map(m => `<li>${when(m.created_at)} · ${m.applied ? esc(m.summary || plural(m.applied, 'changement', 'changements')) : 'rien de nouveau'}${m.undone_at ? ` ${badge('Annulée', 'grey')}` : m.applied ? ` <button type="button" class="button small secondary" data-sd-undo="${m.id}">↶ Annuler</button>` : ''}</li>`).join('')}</ul></details>` : ''}`;
    }
    function syncToast(r) {
        if (!r.ok) { toast(`🔄 ${r.error}`, 'error', {retry: () => doSync()}); return; }
        const from = (r.from || []).join(', ');
        const parts = [];
        if (r.applied) parts.push(`${plural(r.applied, 'changement reçu', 'changements reçus')}${from ? ` de « ${from} »` : ''}`);
        if (r.sent) parts.push(`${plural(r.sent, 'changement envoyé', 'changements envoyés')}`);
        const text = `🔄 ${parts.join(' · ') || 'Déjà à jour'}`;
        if (r.applied && r.merge_id) A().undoToast?.(text, {undo: async () => { await post('sd_undo', {merge_id: r.merge_id}); redrawSync(); }, redo: async () => { await post('sd_redo', {merge_id: r.merge_id}); redrawSync(); }});
        else toast(text, 'success');
        if (r.conflicts) toast(`⚠️ ${plural(r.conflicts, 'chose changée des deux côtés', 'choses changées des deux côtés')} : à toi de choisir.`, '', {action: {label: 'Voir', run: () => goPage('sync')}});
    }
    function redrawSync() { if (S().module === 'maintenance' && S().maintenanceTab === 'sync') ext.maintenance.sync?.(++S().workspaceToken); }
    async function doSync(btn) {
        if (btn) btn.disabled = true;
        try { const r = await post('sd_sync'); syncToast(r); } catch (e) { toast(e.message, 'error'); }
        finally { if (btn) btn.disabled = false; }
        redrawSync();
    }
    async function autoSync() {
        if (SECONDARY || readOnlyMode() || !window.GENEALOGY_READY) return;
        try {
            const st = await api('sd_auto');
            if (!st.folder || !st.auto) return;
            const r = await post('sd_sync');
            if (r.ok && (r.applied || r.conflicts)) syncToast(r);
            else if (!r.ok && r.missing) { const last = Number(ls('lcnda-sd-warned', 0)) || 0; if (Date.now() - last > 6 * 3600 * 1000) { lsSet('lcnda-sd-warned', Date.now()); toast(`🔄 ${r.error}`, 'error'); } }
            if (r.ok) redrawSync();
        } catch (_) {}
    }
    /** appelé par la page « Travail à deux » (heritage-tools.js) : la section 🔄 Deux ordinateurs dans el */
    ext.syncFolderPanel = async el => {
        if (!el) return;
        el.innerHTML = UI().spinner ? UI().spinner('Chargement…') : 'Chargement…';
        let st;
        try { st = await api('sd_status'); } catch (e) { el.innerHTML = msg('error', esc(e.message)); return; }
        if (!el.isConnected) return;
        el.innerHTML = panelHtml(st);
        el.querySelector('[data-sd-setup]')?.addEventListener('submit', async e => {
            e.preventDefault();
            const f = e.currentTarget;
            const folder = f.elements.folder.value.trim();
            if (!folder) return UI().fail ? UI().fail(f.elements.folder, 'Écris le chemin du dossier partagé.') : toast('Écris le chemin du dossier partagé.', 'error');
            try {
                await post('sd_setup', {folder, author: f.elements.author?.value || ''});
                toast('✓ Dossier relié. Sur l’autre ordinateur, ouvre « depart.db » qui s’y trouve, puis choisis ce même dossier.', 'success');
                redrawSync();
            } catch (err) { if (UI().fail) UI().fail(f.elements.folder, err.message); else toast(err.message, 'error'); }
        });
        el.querySelector('[data-sd-sync]')?.addEventListener('click', e => doSync(e.currentTarget));
        el.querySelector('[data-sd-auto]')?.addEventListener('change', async e => { try { await post('sd_settings', {auto: e.target.checked}); toast('Enregistré', 'success'); } catch (err) { toast(err.message, 'error'); } });
        el.querySelector('[data-sd-forget]')?.addEventListener('click', async () => {
            const prev = st.folder;
            try { await post('sd_settings', {forget_folder: 1}); A().undoToast?.('Dossier partagé retiré de cet ordinateur', {undo: async () => { await post('sd_setup', {folder: prev}); redrawSync(); }}); redrawSync(); } catch (err) { toast(err.message, 'error'); }
        });
        el.addEventListener('click', async e => {
            const ch = e.target.closest('[data-sd-choice]');
            if (ch) {
                const card = ch.closest('[data-sd-conflict]'), id = Number(card.dataset.sdConflict), choice = ch.dataset.sdChoice;
                const label = {mine: 'Ta version gardée', theirs: 'Version de l’autre ordinateur prise', both: 'Les deux notes gardées'}[choice];
                try {
                    await post('sd_resolve', {id, choice});
                    A().undoToast?.(label, {undo: async () => { await post('sd_reopen', {id}); redrawSync(); }, redo: async () => { await post('sd_resolve', {id, choice}); redrawSync(); }});
                    card.remove();
                    if (!el.querySelector('[data-sd-conflict]')) redrawSync();
                } catch (err) { toast(err.message, 'error'); }
                return;
            }
            const rv = e.target.closest('[data-sd-review]');
            if (rv) { try { const data = await post('sd_review', {package_uid: rv.dataset.sdReview}); ext.maintenance.sync?.(++S().workspaceToken, data); } catch (err) { toast(err.message, 'error'); } return; }
            const un = e.target.closest('[data-sd-undo]');
            if (un) {
                const mid = Number(un.dataset.sdUndo);
                try { await post('sd_undo', {merge_id: mid}); A().undoToast?.('Fusion annulée : ses paquets sont mis de côté', {undo: async () => { await post('sd_redo', {merge_id: mid}); redrawSync(); }}); redrawSync(); } catch (err) { toast(err.message, 'error'); }
            }
        });
    };

    /* ═══════════ 🔒 Base ouverte sur un autre ordinateur ═══════════ */
    let lockShown = false;
    function showLock(info) {
        if (lockShown || !info) return;
        lockShown = true;
        const box = document.createElement('div');
        box.className = 'sa-lock';
        box.setAttribute('data-open-lock', '');
        box.innerHTML = `<div class="sa-lock-card" role="alertdialog" aria-modal="true" aria-labelledby="sa-lock-title"><h2 id="sa-lock-title">🔒 Généalogie ouverte ailleurs</h2>
            <p>Cette généalogie est déjà ouverte sur l’ordinateur <b>« ${esc(info.label)} »</b>${info.since ? ` (depuis ${esc(whenText(info.since))})` : ''}.</p>
            <p>Ferme-la là-bas d’abord, puis « ↻ Réessayer ». Deux ordinateurs qui écrivent en même temps dans le même fichier peuvent l’abîmer.</p>
            ${hint('Pour travailler sur deux ordinateurs, utilise plutôt Réglages → Travail à deux → 🔄 Deux ordinateurs : chacun garde sa base, les changements passent par un dossier partagé.')}
            <div class="modal-actions"><button type="button" class="button danger" data-lock-force>Ouvrir quand même</button><button type="button" class="button" data-lock-retry>↻ Réessayer</button></div></div>`;
        document.body.appendChild(box);
        box.querySelector('[data-lock-retry]').focus();
        box.querySelector('[data-lock-retry]').addEventListener('click', () => location.reload());
        box.querySelector('[data-lock-force]').addEventListener('click', async () => {
            const ok = A()?.confirmBox ? await A().confirmBox(`Ouvrir quand même ? Fais-le seulement si « ${info.label} » est éteint ou si l’app y est fermée (sinon le fichier peut s’abîmer).`, {title: 'Ouvrir quand même', okLabel: 'Ouvrir quand même', danger: true}) : true;
            if (!ok) return;
            const csrf = S()?.csrf || window.INSTALL_CSRF || '';
            await fetch('api.php?action=open_lock_take', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrf}, body: JSON.stringify({csrf})}).catch(() => {});
            location.reload();
        });
    }
    window.addEventListener('lcnda:open-lock', e => showLock(e.detail?.open_lock));
    if (window.GENEALOGY_READY && !SECONDARY) {
        fetch('api.php?action=open_lock_status', {headers: {Accept: 'application/json'}}).then(r => r.json().then(d => { if (r.status === 423 && d.open_lock) { const go = () => showLock(d.open_lock); if (document.body) go(); else document.addEventListener('DOMContentLoaded', go, {once: true}); } })).catch(() => {});
    }
})();
