/* LCNDA — 🏛 La vue des fonds (maquette docs/design/registres-etat-fonds.html, partie 6 ; serveur : recueils_fonds_data, lib/recueil_fiche.php).
 * Listes › Recueils › « 🏛 Par fonds » : tous les recueils rangés par service d'archives puis par fonds (chaque groupe se replie, retenu),
 * les chiffres d'ensemble (pages attendues, photographiées, transcrites, relues, absentes, lacunes), une ligne par recueil avec ce qui reste
 * à faire ; « Montrer » (reste à transcrire, à relire, pages absentes, pas en ligne, non communicables) ; « Colonnes » au choix (retenues) ;
 * ⤓ tableur ; 🖨 état des fonds. Et le widget du tableau de bord « 🗂 Registres : reste à faire ».
 *   ext.recueilFonds.paint(host, {q})  → la vue
 * Essai : tests/test-recueil-fonds.js.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const T = (k, v) => (window.LCNDA_I18N?.t ? window.LCNDA_I18N.t(k, v) : String(k).replace(/\{(\w+)\}/g, (_, x) => v?.[x] ?? ''));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const plural = (n, one, many) => (A()?.plural ? A().plural(n, one, many) : `${n} ${n > 1 ? many : one}`);
    const safeUrl = u => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');
    const PREF = 'genealogie-recueils-fonds';
    const pref = () => { try { const v = JSON.parse(localStorage.getItem(PREF) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } };
    const setPref = patch => { try { localStorage.setItem(PREF, JSON.stringify({...pref(), ...patch})); } catch (_) {} };
    // les colonnes : [clé, titre, montrée au départ]
    const COLS = [['cote', 'Cote', true], ['dates', 'Dates', true], ['pages', 'Pages', true], ['numerise', 'Photographié', true], ['transcrit', 'Transcrit · relu', true], ['online', 'En ligne', true],
        ['comm', 'Communicable', true], ['reste', 'Reste', true], ['series', 'Série', false], ['support', 'Support', false], ['state', 'État matériel', false], ['language', 'Langue', false], ['reuse', 'Réutilisation', false], ['numbering', 'Numérotation', false]];
    const archivesProfile = () => ext.recueilSens?.opt('profil') === 'archives'; // 🏛 profil « Centre d'archives » : plus de colonnes au départ
    const colsOn = () => { const p = pref().cols; return Array.isArray(p) ? COLS.filter(c => p.includes(c[0])).map(c => c[0]) : COLS.filter(c => c[2] || (archivesProfile() && ['support', 'state', 'language', 'reuse'].includes(c[0]))).map(c => c[0]); };
    const colTitle = k => (k === 'cote' ? T('Cote', {ctx: 'archives'}) : T(COLS.find(c => c[0] === k)[1]));
    const SHOW = [['', 'Tout'], ['todo', 'Reste à transcrire'], ['review', 'Reste à relire'], ['absent', 'Avec des pages absentes'], ['offline', 'Pas en ligne'], ['locked', 'Non communicables']];
    const LABELS = {support: {papier: 'Papier', parchemin: 'Parchemin', microfilm: 'Microfilm', numerique: 'Numérique', autre: 'Autre'}, material_state: {bon: 'Bon', abime: 'Abîmé', fragile: 'Fragile (ne pas manipuler)', a_restaurer: 'À restaurer', restaure: 'Restauré'},
        reuse: {etalab: 'Licence ouverte (Etalab)', 'cc-by': 'CC BY', 'cc-by-sa': 'CC BY-SA', 'cc-by-nc': 'CC BY-NC', public: 'Domaine public', reserve: 'Tous droits réservés', demander: 'À demander au service', autre: 'Autre'},
        numbering: {page: 'Paginé', folio: 'Folioté', liasse: 'Sans ordre (liasse, carton)', archives: 'Numérotation des archives'}};

    /* ─── les chiffres d'un recueil ─── */
    function nums(r) {
        const e = r.etat || {todo: 0, doing: 0, checked: 0, done: 0, absent: 0, blank: 0, review: 0, doubt: 0, photos: 0};
        const live = e.todo + e.doing + e.checked + e.done, exp = Math.max(r.expected || 0, r.pages);
        return {e, live, exp, photos: e.photos, tr: e.doing + e.checked + e.done, rel: e.checked + e.done, toRead: e.review + e.doubt,
            pPhoto: exp ? Math.round(e.photos / exp * 100) : 0, pTr: live ? Math.round((e.doing + e.checked + e.done) / live * 100) : 0, pRel: live ? Math.round((e.checked + e.done) / live * 100) : 0};
    }
    const bar = (pct, cls = '') => `<span class="rs-bar" aria-hidden="true"><i class="${cls}" style="width:${pct}%"></i></span>`;
    function reste(r) {
        const n = nums(r), bits = [];
        if (n.e.todo) bits.push(T('{n} à transcrire', {n: String(n.e.todo)}));
        if (n.toRead) bits.push(T('{n} à relire', {n: String(n.toRead)}));
        if (n.e.absent) bits.push(plural(n.e.absent, 'page absente', 'pages absentes'));
        if (n.exp > n.photos + n.e.absent + n.e.blank) bits.push(T('{n} à photographier', {n: String(n.exp - n.photos - n.e.absent - n.e.blank)}));
        return bits.join(' · ');
    }
    function comm(r) {
        const c = r.communicability || {};
        return c.state === 'free' ? `<span class="rf-c is-ok">✓ ${esc(T('Oui'))}</span>` : c.state === 'reserved' ? `<span class="rf-c is-lock">🔒 ${esc(c.until ? T('jusqu’en {y}', {y: c.until}) : T('Réservé'))}</span>` : c.state === 'authorization' ? `<span class="rf-c is-lock">🔐 ${esc(T('Sur autorisation'))}</span>` : '<span class="rf-c">❔</span>';
    }
    const commText = r => { const c = r.communicability || {}; return c.state === 'free' ? T('Oui') : c.state === 'reserved' ? (c.until ? T('jusqu’en {y}', {y: c.until}) : T('Réservé')) : c.state === 'authorization' ? T('Sur autorisation') : T('À vérifier'); };
    function cell(k, r) {
        const n = nums(r);
        switch (k) {
            case 'cote': return esc(r.reference);
            case 'dates': return esc(r.date_text);
            case 'pages': return `${n.e.photos !== r.pages || r.expected ? '' : ''}${r.pages}${r.expected ? ` / ${r.expected}` : ''}`;
            case 'numerise': return `${bar(n.pPhoto, 'is-ink')} ${n.pPhoto} %`;
            case 'transcrit': return `${bar(n.pRel, n.pRel === 100 ? 'is-full' : '')} ${n.pTr} % · ${n.pRel} %`;
            case 'online': return safeUrl(r.url) ? `<a href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener noreferrer" aria-label="${esc(T('En ligne'))}">↗</a>` : `<span class="muted">${esc(T('pas en ligne'))}</span>`;
            case 'comm': return comm(r);
            case 'reste': { const t = reste(r); return t ? `<button type="button" class="link-button rf-reste" data-rf-etat="${r.id}">${esc(t)}</button>` : `<span class="rf-c is-ok">✓ ${esc(T('rien'))}</span>`; }
            case 'series': return esc(r.series);
            case 'support': case 'state': case 'reuse': case 'numbering': { const key = k === 'state' ? 'material_state' : k; return esc(T(LABELS[key][r[key]] || '')); }
            case 'language': return esc(r.language);
        }
        return '';
    }
    const cellText = (k, r) => { const d = document.createElement('div'); d.innerHTML = cell(k, r); return d.textContent.trim(); };
    function matches(r, show) {
        const n = nums(r);
        if (show === 'todo') return n.e.todo > 0;
        if (show === 'review') return n.toRead > 0;
        if (show === 'absent') return n.e.absent > 0;
        if (show === 'offline') return !safeUrl(r.url);
        if (show === 'locked') return ['reserved', 'authorization'].includes(r.communicability?.state);
        return true;
    }

    /* ─── la vue ─── */
    let data = null;
    async function paint(host, {q = ''} = {}) {
        if (!host) return;
        host.innerHTML = UI().spinner ? UI().spinner(T('Chargement des fonds…')) : '…';
        try { data = await A().api('recueils_fonds'); } catch (e) { host.innerHTML = A().emptyState({icon: '⛔', text: T('La vue des fonds ne s’ouvre pas'), hint: e.message || ''}); return; }
        draw(host, q);
    }
    function draw(host, q) {
        if (!host.isConnected) return;
        const p = pref(), show = SHOW.some(s => s[0] === p.show) ? p.show : '', shut = new Set(Array.isArray(p.shut) ? p.shut : []), cols = colsOn();
        const words = fold(q).split(/\s+/).filter(Boolean);
        const all = data.recueils || [];
        const rows = all.filter(r => (!words.length || words.every(w => fold([r.title, r.reference, r.fonds, r.series, r.date_text, r.place_text, r.service?.name, r.service?.short_name].join(' ')).includes(w))) && matches(r, show));
        // service › fonds
        const groups = new Map();
        rows.forEach(r => {
            const sk = r.service ? `s${r.service.id}` : 's0', fk = `${sk}|${fold(r.fonds)}`;
            if (!groups.has(sk)) groups.set(sk, {key: sk, name: r.service ? r.service.name : T('Sans service d’archives'), id: r.service?.id || 0, fonds: new Map()});
            const g = groups.get(sk); if (!g.fonds.has(fk)) g.fonds.set(fk, {key: fk, name: r.fonds || T('Sans fonds'), rows: []}); g.fonds.get(fk).rows.push(r);
        });
        const sorted = [...groups.values()].sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || a.name.localeCompare(b.name, 'fr'));
        const sum = list => list.reduce((acc, r) => { const n = nums(r); acc.n++; acc.exp += n.exp; acc.photos += n.photos; acc.live += n.live; acc.tr += n.tr; acc.rel += n.rel; acc.absent += n.e.absent; acc.gaps += r.gaps || 0; return acc; }, {n: 0, exp: 0, photos: 0, live: 0, tr: 0, rel: 0, absent: 0, gaps: 0});
        const pc = (a, b) => (b ? Math.round(a / b * 100) : 0);
        const tot = sum(rows), services = new Set(rows.map(r => r.service?.id || 0)).size;
        const kpi = (big, small) => `<div class="re-kpi"><b>${big}</b><small>${small}</small></div>`;
        const groupLine = list => { const s = sum(list); return esc(T('{n} · {t} % transcrit · {r} % relu', {n: plural(s.n, 'recueil', 'recueils'), t: String(pc(s.tr, s.live)), r: String(pc(s.rel, s.live))})); };
        const foldBtn = key => `<button type="button" class="rs-tw" data-rf-fold="${esc(key)}" aria-expanded="${!shut.has(key)}" aria-label="${esc(shut.has(key) ? T('Ouvrir') : T('Fermer'))}">${shut.has(key) ? '▸' : '▾'}</button>`;
        const span = cols.length + 1;
        let body = '';
        sorted.forEach((g, gi) => {
            const list = [...g.fonds.values()].flatMap(f => f.rows);
            if (gi) body += `<tr class="rf-sep" aria-hidden="true"><td colspan="${span}"></td></tr>`; // un vrai espace entre deux services d'archives
            body += `<tr class="rf-grp"><td colspan="${span}">${foldBtn(g.key)} 🏛 ${g.id ? `<button type="button" class="link-button" data-rf-svc="${g.id}">${esc(g.name)}</button>` : esc(g.name)} <small class="muted">· ${groupLine(list)}</small></td></tr>`;
            if (shut.has(g.key)) return;
            [...g.fonds.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr')).forEach(f => {
                body += `<tr class="rf-fonds"><td colspan="${span}">${foldBtn(f.key)} ${esc(f.name)} <small class="muted">· ${groupLine(f.rows)}</small></td></tr>`;
                if (shut.has(f.key)) return;
                f.rows.sort((x, y) => (x.reference ? 0 : 1) - (y.reference ? 0 : 1) || String(x.reference).localeCompare(String(y.reference), 'fr', {numeric: true, sensitivity: 'base'}) || x.title.localeCompare(y.title, 'fr')); // l'ordre d'un inventaire : par cote
                f.rows.forEach(r => { body += `<tr><td><button type="button" class="table-link" data-open-recueil="${r.id}">${esc(r.icon || '📚')} ${esc(r.title)}</button></td>${cols.map(k => `<td class="rf-col-${k}">${cell(k, r)}</td>`).join('')}</tr>`; });
            });
        });
        host.innerHTML = `<div class="rf-fonds-view">
            <div class="re-kpis">${kpi(String(tot.n), esc(T('recueils · {s}', {s: plural(services, 'service', 'services')})))}${kpi(String(tot.exp), esc(T('pages attendues')))}${kpi(`${pc(tot.photos, tot.exp)} %`, esc(T('photographiées')))}${kpi(`${pc(tot.tr, tot.live)} %`, esc(T('transcrites · {r} % relues', {r: String(pc(tot.rel, tot.live))})))}${kpi(String(tot.absent), esc(T('pages absentes · {g}', {g: plural(tot.gaps, 'lacune', 'lacunes')})))}</div>
            <div class="rf-tools"><label class="rf-show">${esc(T('Montrer :'))} <select data-rf-show>${SHOW.map(([k, l]) => `<option value="${k}" ${show === k ? 'selected' : ''}>${esc(T(l))}</option>`).join('')}</select></label><span class="spacer"></span>
                <button type="button" class="button small secondary" data-rf-cols>☰ ${esc(T('Colonnes…'))}</button><button type="button" class="button small secondary" data-rf-csv>⤓ ${esc(T('Tableur'))}</button>${ext.recueilPlus ? `<button type="button" class="button small secondary" data-rf-ead title="${esc(T('Le format des inventaires d’archives (EAD), pour un centre d’archives'))}">⤓ EAD</button>` : ''}<button type="button" class="button small secondary" data-rf-print>🖨 ${esc(T('État des fonds'))}</button></div>
            ${rows.length ? `<div class="data-table-wrap"><table class="data-table rf-table" data-cols-off><thead><tr><th>${esc(T('Recueil'))}</th>${cols.map(k => `<th class="rf-col-${k}">${esc(colTitle(k))}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`
                : A().emptyState({icon: '🏛', text: all.length ? T('Aucun recueil ne correspond') : T('Aucun recueil pour l’instant'), hint: all.length ? T('Change « Montrer » ou les mots cherchés.') : T('Crée un recueil, puis dis où il est : « Modifier » → « 🏛 Où il est ».')})}
            <p class="muted rf-note">${esc(T('Chaque groupe se replie. Un clic sur « Reste » ouvre l’état du recueil. Un recueil sans service d’archives va dans « Sans service d’archives » : « Modifier » → « 🏛 Où il est ».'))}</p></div>`;
        host.querySelector('[data-rf-show]').addEventListener('change', e => { setPref({show: e.target.value}); draw(host, q); });
        host.querySelectorAll('[data-rf-fold]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.rfFold, s = new Set(pref().shut || []); if (s.has(k)) s.delete(k); else s.add(k); setPref({shut: [...s].slice(-500)}); draw(host, q); host.querySelector(`[data-rf-fold="${CSS.escape(k)}"]`)?.focus(); }));
        host.querySelectorAll('[data-rf-svc]').forEach(b => b.addEventListener('click', () => ext.archiveServices?.open?.(Number(b.dataset.rfSvc))));
        host.querySelectorAll('[data-rf-etat]').forEach(b => b.addEventListener('click', () => { const A2 = A(); A2.state.hRecueil = {id: Number(b.dataset.rfEtat), tab: 'etat', page: 0, view: 'grid', q: ''}; A2.state.listType = 'recueils'; A2.setModule('listes'); }));
        host.querySelector('[data-rf-cols]').addEventListener('click', () => colsDialog(() => draw(host, q)));
        host.querySelector('[data-rf-csv]').addEventListener('click', () => csv(rows));
        host.querySelector('[data-rf-ead]')?.addEventListener('click', () => ext.recueilPlus.ead()); // 📤
        host.querySelector('[data-rf-print]').addEventListener('click', () => (UI().printPage ? UI().printPage(T('État des fonds')) : window.print()));
    }
    function colsDialog(after) {
        const on = new Set(colsOn());
        ext.openDialog({eyebrow: T('🏛 VUE DES FONDS'), title: T('Les colonnes'), submitLabel: T('Enregistrer'),
            body: `<p class="muted">${esc(T('Coche les colonnes à montrer (le recueil est toujours là).'))}</p><div class="rf-colpick">${COLS.map(([k]) => `<label class="re-check"><input type="checkbox" name="c" value="${k}" ${on.has(k) ? 'checked' : ''}> ${esc(colTitle(k))}</label>`).join('')}</div>
                <p><button type="button" class="link-button" data-rf-reset>↺ ${esc(T('Remettre comme au départ'))}</button></p>`,
            onOpen: d => d.querySelector('[data-rf-reset]').addEventListener('click', () => d.querySelectorAll('[name=c]').forEach(c => { c.checked = !!COLS.find(x => x[0] === c.value)?.[2] || (archivesProfile() && ['support', 'state', 'language', 'reuse'].includes(c.value)); })),
            onSubmit: async form => { setPref({cols: [...form.querySelectorAll('[name=c]:checked')].map(c => c.value)}); after(); return true; }});
    }
    function csv(rows) {
        const q = v => `"${(A().csvSafe || (x => String(x ?? '')))(v).replace(/"/g, '""')}"`; // pas de formule glissée dans un tableur
        const head = [T('Service d’archives'), T('Fonds'), T('Recueil'), ...COLS.map(c => colTitle(c[0]))];
        const lines = rows.map(r => [r.service?.name || '', r.fonds, r.title, ...COLS.map(c => (c[0] === 'reste' ? reste(r) : c[0] === 'comm' ? commText(r) : c[0] === 'online' ? (safeUrl(r.url) || '') : cellText(c[0], r)))]);
        if (window.LCNDA_UI?.exportRows) return window.LCNDA_UI.exportRows({title: T('État des fonds'), name: T('État des fonds'), rows: () => [head, ...lines]}); // ⤓ la fenêtre d'export commune
        const blob = new Blob(['﻿' + [head, ...lines].map(l => l.map(q).join(';')).join('\r\n')], {type: 'text/csv;charset=utf-8'});
        const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(blob), download: (A().safeExportFilename ? A().safeExportFilename(T('État des fonds')) : 'etat-des-fonds') + '.csv'});
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }

    /* ─── le widget du tableau de bord ─── */
    ext.dashboard = ext.dashboard || {};
    ext.dashboard.recueils_todo = {
        load: () => A().api('recueils_fonds').catch(() => null),
        render: (index, widget, span, d) => {
            const list = (d?.recueils || []).map(r => ({r, t: reste(r), n: nums(r)})).filter(x => x.t).sort((a, b) => (b.n.e.todo + b.n.toRead) - (a.n.e.todo + a.n.toRead)).slice(0, Number(widget?.limit) || 6);
            const body = !d ? A().empty(T('Les recueils n’ont pas pu être lus.'), {icon: '⛔'}) : list.length ? `<ul class="rf-w">${list.map(x => `<li><button type="button" class="link-button" data-rf-etat-w="${x.r.id}">${esc(x.r.icon || '📚')} ${esc(x.r.title)}</button><small class="muted">${esc(x.t)}</small>${bar(x.n.pRel, x.n.pRel === 100 ? 'is-full' : '')}</li>`).join('')}</ul>` : A().empty(T('Rien ne reste à faire dans tes recueils.'), {icon: '✓'});
            return A().card(index, `🗂 ${T('Registres : reste à faire')}`, list.length || '', `<div class="rf-widget">${body}</div>`, span, `<button type="button" class="button small secondary" data-rf-fonds-go>${esc(T('Vue des fonds'))}</button>`);
        },
    };
    document.addEventListener('click', e => {
        const w = e.target.closest?.('[data-rf-etat-w]');
        if (w) { e.preventDefault(); const A2 = A(); A2.state.hRecueil = {id: Number(w.dataset.rfEtatW), tab: 'etat', page: 0, view: 'grid', q: ''}; A2.state.listType = 'recueils'; A2.setModule('listes'); return; }
        if (e.target.closest?.('[data-rf-fonds-go]')) { e.preventDefault(); setMode('fonds'); const A2 = A(); A2.state.hRecueil = {id: 0}; A2.state.listType = 'recueils'; A2.setModule('listes'); }
    });
    const MODE_KEY = 'genealogie-recueils-vue';
    const mode = () => { try { const v = localStorage.getItem(MODE_KEY); return v ? (v === 'fonds' ? 'fonds' : 'list') : (ext.recueilSens?.opt('profil') === 'archives' ? 'fonds' : 'list'); } catch (_) { return 'list'; } }; // pas encore choisi : selon le profil
    const setMode = m => { try { localStorage.setItem(MODE_KEY, m === 'fonds' ? 'fonds' : 'list'); } catch (_) {} };
    ext.recueilFonds = {paint, mode, setMode, nums, reste};
})();
