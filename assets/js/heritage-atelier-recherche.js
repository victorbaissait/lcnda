/* LCNDA — 📜 Atelier de transcription, idée 36 : 🔎 chercher dans toutes les transcriptions, avec la ligne sur l'image
 * (maquette approuvée docs/design/atelier-idees.html ; réponse 3 : « ≈ orthographes voisines » éteint au départ, retenu ensuite).
 * Pas de nouveau champ : la case « Chercher… » de Listes → « 📜 Transcriptions d'actes » montre aussi, au-dessus de la liste, les
 * LIGNES trouvées : le morceau d'image de la ligne (sa zone), le mot surligné, la date et la commune de l'acte ; un clic ouvre
 * l'Atelier sur cette ligne (curseur sur le mot, la bande de la ligne marquée, la 📏 règle si elle est allumée). Dans l'Atelier :
 * Édition → « 🔎 Chercher dans tous les actes… ». Les résultats exacts d'abord ; les variantes (Mazeaud, Mazaut…) à un clic,
 * dans un cadre pointillé. Avec 🔤 38, la recherche regarde aussi le texte modernisé. 🔮 « Bientôt » : les pages pas encore transcrites.
 * Réglage : genealogie-tx-search-near ('1' : orthographes voisines). Serveur : lib/atelier_idees.php (search, thumb).
 */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const NEAR_KEY = 'genealogie-tx-search-near';
    const near = () => { try { return localStorage.getItem(NEAR_KEY) === '1'; } catch (_) { return false; } };
    const setNear = v => { try { localStorage.setItem(NEAR_KEY, v ? '1' : '0'); } catch (_) {} };
    const KL = {apreciser: 'À préciser', bapteme: 'Baptême', naissance: 'Naissance', mariage: 'Mariage', deces: 'Décès', sepulture: 'Sépulture', notarial: 'Acte notarié', notoriete: 'Acte de notoriété', recensement: 'Recensement', militaire: 'Registre militaire', lettre: 'Lettre', autre: 'Autre'};
    const fold = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    /** la ligne, les mots trouvés surlignés */
    function markLine(text, words) {
        if (!words?.length) return esc(text);
        const ws = [...new Set(words)].sort((a, b) => b.length - a.length).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        return String(text).split(new RegExp(`(${ws.join('|')})`, 'gu')).map((p, i) => (i % 2 ? `<mark>${esc(p)}</mark>` : esc(p))).join('');
    }
    function hitHtml(h, i) {
        const meta = [KL[h.kind] ? i18n(KL[h.kind]) : '', h.date_text, h.place, i18n('ligne {n}', {n: h.line})].filter(Boolean).join(' · ');
        const th = h.zone?.id ? `<img src="api.php?action=atelier_idees&op=thumb&act=${h.act_id}&zone=${encodeURIComponent(h.zone.id)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'air-noimg',textContent:'📜'}))">` : '<span class="air-noimg" aria-hidden="true">📜</span>';
        return `<li><button type="button" class="air-hit${h.variant ? ' is-var' : ''}" data-air-hit="${i}">
            <span class="air-th">${th}</span><span class="air-txt"><b data-i18n-off>${esc(h.title || i18n('Acte'))}</b> <small class="muted" data-i18n-off>${esc(meta)}</small>
            <q data-i18n-off>${markLine(h.text, h.words)}</q>${h.variant ? ` <span class="air-var" title="${esc(i18n('Orthographe voisine'))}">≈ <span data-i18n-off>${esc(h.variant)}</span></span>` : ''}${h.layer === 'm' ? ` <span class="air-layer">🔤 ${esc(i18n('modernisé'))}</span>` : ''}</span></button></li>`;
    }
    /**
     * Le panneau des lignes trouvées : panel({onOpen(hit)}) → {el, search(q)} ; rien d'affiché tant qu'il n'y a pas 2 lettres.
     */
    function panel({onOpen, compact = false} = {}) {
        const el = document.createElement('section'); el.className = `air-panel${compact ? ' is-compact' : ''}`; el.hidden = true; el.setAttribute('aria-live', 'polite'); el.dataset.airPanel = '';
        let q = '', seq = 0, hits = [];
        async function search(nq = q) {
            q = String(nq || '').trim(); const n = ++seq;
            if (q.replace(/[^\p{L}\p{N}]/gu, '').length < 2) { el.hidden = true; el.innerHTML = ''; hits = []; return; }
            let r; try { r = await A().api('atelier_idees', {op: 'search', q, near: near() ? 1 : ''}); } catch (e) { if (n !== seq) return; el.hidden = false; el.innerHTML = `<div class="ui-msg is-error">⛔ ${esc(e.message)}</div>`; return; }
            if (n !== seq) return; hits = r.hits || [];
            const nv = hits.filter(h => h.variant).length;
            el.hidden = false;
            el.innerHTML = `<header class="air-head"><b>🔎 ${hits.length ? esc(i18n('{l} dans {a}', {l: A().plural ? A().plural(r.lines, 'ligne') : `${r.lines} lignes`, a: A().plural ? A().plural(r.acts, 'acte') : `${r.acts} actes`})) : esc(i18n('Aucune ligne transcrite ne contient « {q} ».', {q}))}</b>
                <label class="ui-toggle air-near" title="${esc(i18n('Montrer aussi les variantes : Mazaud, Mazeaud, Mazaut, Masaud… (dans un cadre pointillé)'))}"><input type="checkbox" data-air-near ${near() ? 'checked' : ''}><i></i>≈ ${esc(i18n('orthographes voisines'))}${near() && nv ? ` <small>(${nv})</small>` : ''}</label></header>
                ${hits.length ? `<ul class="air-list">${hits.map(hitHtml).join('')}</ul>` : ''}
                <p class="air-soon"><span>🔮 ${esc(i18n('Bientôt : chercher aussi dans les pages pas encore transcrites (repérage du mot sur l’image).'))}</span> <span class="ui-badge is-grey">${esc(i18n('bientôt'))}</span></p>`;
        }
        el.addEventListener('change', e => { if (e.target.matches('[data-air-near]')) { setNear(e.target.checked); search(); } });
        el.addEventListener('click', e => { const b = e.target.closest('[data-air-hit]'); if (b) onOpen?.(hits[Number(b.dataset.airHit)]); });
        return {el, search, get hits() { return hits; }};
    }
    ext.txSearch = {panel, markLine, fold};

    /* ─── Listes → 📜 Transcriptions d'actes : la même case « Chercher… » ─── */
    const KEY = 'act_transcriptions_list';
    function hookList() {
        const lists = ext.lists || {}, orig = lists[KEY]; if (!orig || orig._air) return false;
        const wrapped = async token => {
            await orig(token);
            const sec = document.querySelector('#workspace .h-atl'); if (!sec || sec.querySelector('[data-air-panel]')) return;
            const input = sec.querySelector('.ui-listbar input, input[type="search"]'); if (!input) return;
            const P = panel({onOpen: h => ext.openActTranscriber?.({id: h.act_id, goto: h.goto?.e > h.goto?.s ? h.goto : null, onClose: () => { if (P.el.isConnected) P.search(input.value); }})});
            const bar = input.closest('.ui-listbar') || sec.querySelector('[data-atl-bar]') || input.parentElement;
            bar.after(P.el);
            let tm = 0; input.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => P.search(input.value), 300); });
            if (input.value.trim()) P.search(input.value);
            // le haut de la page : « 128 actes · 3 410 lignes »
            A().api('atelier_idees', {op: 'stats'}).then(s => { const h = sec.querySelector('.page-header h2'); if (h && s?.lines && !sec.querySelector('.air-count')) h.insertAdjacentHTML('beforeend', ` <small class="air-count muted">${esc(i18n('{a} · {l}', {a: A().plural ? A().plural(s.acts, 'acte') : s.acts, l: A().plural ? A().plural(s.lines, 'ligne') : s.lines}))}</small>`); }).catch(() => {});
        };
        wrapped._air = true; lists[KEY] = wrapped; return true;
    }
    if (!hookList()) { let k = 0; const tm = setInterval(() => { if (hookList() || ++k > 120) clearInterval(tm); }, 250); }

    /* ─── dans l'Atelier : Édition → 🔎 Chercher dans tous les actes… ─── */
    function openInAtelier(plug) {
        const P = panel({compact: true, onOpen: h => { dg.close(); if (h.act_id === plug.t.id && h.goto?.e > h.goto?.s) return plug.gotoRange(h.goto.s, h.goto.e); plug.switchTo({id: h.act_id, goto: h.goto?.e > h.goto?.s ? h.goto : null}); }});
        const dg = document.createElement('dialog'); dg.className = 'modal air-dlg';
        dg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">📜 ${esc(i18n('ATELIER'))}</span><h2>🔎 ${esc(i18n('Chercher dans tous les actes'))}</h2></div><button type="button" class="icon-button" data-air-x aria-label="${esc(i18n('Fermer'))}">×</button></div>
            <input type="search" class="air-q" data-air-q placeholder="${esc(i18n('Un nom, un mot… (2 lettres suffisent)'))}" aria-label="${esc(i18n('Chercher dans tous les actes'))}" autocomplete="off" spellcheck="false">`;
        dg.appendChild(P.el); document.body.appendChild(dg); dg.showModal();
        dg.addEventListener('close', () => dg.remove());
        dg.addEventListener('click', e => { if (e.target.closest('[data-air-x]')) dg.close(); });
        const inp = dg.querySelector('[data-air-q]'); let tm = 0;
        const sel = plug.area.value.slice(plug.area.selectionStart, plug.area.selectionEnd).trim(); if (sel && sel.length < 60 && !sel.includes('\n')) { inp.value = sel; P.search(sel); }
        inp.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => P.search(inp.value), 250); });
        setTimeout(() => inp.focus(), 30);
        return dg;
    }
    ext.txMenus = ext.txMenus || [];
    ext.txMenus.push((menu, plug) => (menu === 'Édition' ? [{icon: '🔎', label: `${i18n('Chercher dans tous les actes')}…`, run: () => openInAtelier(plug)}] : []));
})();
