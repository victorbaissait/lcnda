/**
 * 🛠️ Fiche d'un métier ancien : ce que faisait un « tisserand » ou un « sabotier », ses outils, ses mots anciens, les ancêtres
 * qui l'exerçaient (liste, carte, frise) et les images de la base qui en parlent ; on peut la compléter (texte, images,
 * Fiche 📒 reliée). Serveur : lib/metiers_anciens.php (GET old_trade, old_trades ; POST save_old_trade), dictionnaire
 * assets/data/metiers-anciens.json (CC BY-SA 4.0, sources dans le fichier).
 *  - sur la fiche d'une personne : son métier (Identité → « Métier / activité ») devient un lien « 🛠️ » ;
 *  - Listes → Personnes et familles → « 🛠️ Métiers anciens » : tout le dictionnaire, ceux de ta famille d'abord ;
 *  - ext.oldTrade.open('sabotier') ailleurs (Listes → Métiers, Glossaire…).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.lists = ext.lists || {};
    const esc = v => A().escapeHtml(v ?? '');
    const api = (...a) => A().api(...a);
    const post = async (action, body) => { const r = await A().api(action, {}, {method: 'POST', body}); return r?.result ?? r ?? {}; };
    const toast = (...a) => A().toast(...a);
    const S = () => A().state;
    const ls = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const life = p => p.birth_year || p.death_year ? `${p.birth_year || '?'}–${p.death_year || ''}` : '';
    const pname = p => [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Sans nom';

    function avatar(p) {
        if (UI().avatarOn?.() && UI().avatar) return UI().avatar({...p, name: pname(p), photo: p.photo}, 34);
        const ini = ((p.first_name || '')[0] || '') + ((p.last_name || '')[0] || '');
        return p.photo ? `<img class="h-tr-ava" src="${esc(p.photo)}" alt="">` : `<span class="h-tr-ava is-${p.gender === 'female' ? 'f' : p.gender === 'male' ? 'm' : 'u'}" aria-hidden="true">${esc(ini.toUpperCase())}</span>`;
    }

    function frise(people) {
        const ys = people.flatMap(p => [p.birth_year, p.death_year, p.job_from, p.job_to]).filter(Boolean);
        if (!ys.length) return A().empty('Aucune date sur ces fiches : la frise viendra avec les naissances et les décès.', {icon: '🗓'});
        const a = Math.floor(Math.min(...ys) / 10) * 10, b = Math.ceil(Math.max(...ys) / 10) * 10 + 10, W = 1000, row = 22, H = people.length * row + 26, x = y => 150 + (y - a) / Math.max(1, b - a) * (W - 170);
        const ticks = []; for (let y = a; y <= b; y += (b - a > 200 ? 50 : 20)) ticks.push(`<line x1="${x(y)}" y1="0" x2="${x(y)}" y2="${H - 18}" stroke="currentColor" opacity=".12"/><text x="${x(y)}" y="${H - 4}" font-size="11" text-anchor="middle" fill="currentColor" opacity=".6">${y}</text>`);
        const rows = people.map((p, i) => { const y0 = i * row + 4, s = p.birth_year || p.job_from, e = p.death_year || p.job_to || s;
            return `<g><text x="0" y="${y0 + 12}" font-size="12" fill="currentColor">${esc(pname(p).slice(0, 22))}</text>${s ? `<rect x="${x(s)}" y="${y0 + 3}" width="${Math.max(3, x(e) - x(s))}" height="10" rx="3" fill="currentColor" opacity=".25"/>` : ''}${p.job_from ? `<rect x="${x(p.job_from)}" y="${y0 + 3}" width="${Math.max(5, x(p.job_to || p.job_from) - x(p.job_from))}" height="10" rx="3" fill="#c27c0e"><title>Métier noté : ${p.job_from}${p.job_to && p.job_to !== p.job_from ? '–' + p.job_to : ''}</title></rect>` : ''}</g>`; }).join('');
        return `<svg class="h-tr-frise" viewBox="0 0 ${W} ${H}" role="img" aria-label="Frise des vies des ancêtres qui exerçaient ce métier">${ticks.join('')}${rows}</svg><p class="muted"><small>Gris : la vie (naissance → décès). Orange : les années où le métier est noté (événements, recensements).</small></p>`;
    }

    async function open(textOrKey, {key = ''} = {}) {
        let d; try { d = await api('old_trade', key ? {key} : {text: textOrKey}); } catch (e) { toast(e.message, 'error'); return; }
        const t = d.trade, n = d.notes || {}, ppl = d.people || [];
        const tab = ls('genealogie-trade-tab', 'list');
        const variants = t ? [t.fem, ...(t.variants || [])].filter(Boolean) : [];
        const body = `<div class="h-tr">
            <div class="h-tr-head">${d.domain ? `<span class="h-tr-dom">${d.domain.icon} ${esc(d.domain.label)}</span>` : ''}${UI().badge ? UI().badge(A().plural(ppl.length, 'ancêtre'), ppl.length ? 'blue' : 'grey') : ''}</div>
            ${t ? `<p class="h-tr-desc">${esc(t.desc)}</p>` : (UI().notice ? UI().notice('info', `« ${d.name} » n’est pas encore dans le dictionnaire des métiers anciens. Tu peux écrire toi-même ce qu’il faisait avec « ✎ Compléter la fiche ».`) : '')}
            ${variants.length ? `<p class="muted"><small>Écrit aussi : ${variants.map(esc).join(', ')}</small></p>` : ''}
            ${d.art ? (UI().notice ? UI().notice('ok', `C’est aussi un métier d’art d’aujourd’hui (liste officielle de 2015, domaine « ${d.art.domain} »).`) : '') : ''}
            ${n.notes ? `<section class="h-tr-sec"><h4>📝 Ce que tu as ajouté</h4><div class="h-tr-notes">${esc(n.notes).replace(/\n/g, '<br>')}</div></section>` : ''}
            <div class="h-tr-cols">${t?.tools?.length ? `<section class="h-tr-sec"><h4>🔧 Ses outils</h4><ul class="h-tr-chips">${t.tools.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>` : ''}
            ${t?.words?.length ? `<section class="h-tr-sec"><h4>📜 Les mots anciens</h4><dl class="h-tr-words">${t.words.map(([w, m]) => `<div><dt>${esc(w)}</dt><dd>${esc(m)}</dd></div>`).join('')}</dl></section>` : ''}</div>
            <section class="h-tr-sec"><h4>👥 Les ancêtres qui l’exerçaient</h4>
                ${ppl.length ? `<div class="ui-tabs" role="tablist">${[['list', 'Liste'], ['map', 'Carte'], ['frise', 'Frise']].map(([k, l]) => `<button type="button" role="tab" data-tr-tab="${k}" class="${tab === k ? 'is-active' : ''}" aria-selected="${tab === k}">${l}</button>`).join('')}</div>
                <div data-tr-pane="list" ${tab === 'list' ? '' : 'hidden'}><ul class="h-tr-people">${ppl.map(p => `<li><button type="button" class="h-tr-person" data-tr-person="${p.id}">${avatar(p)}<span><strong>${esc(pname(p))}</strong><small>${esc([life(p), p.as.join(', '), p.place].filter(Boolean).join(' · '))}</small></span></button></li>`).join('')}</ul></div>
                <div data-tr-pane="map" ${tab === 'map' ? '' : 'hidden'}>${d.points.length && ext.miniMap ? ext.miniMap(d.points.map(p => ({lat: p.lat, lon: p.lon, label: p.label, color: '#c27c0e'})), [], {height: 320}) : A().empty('Aucun de ces lieux n’est placé sur la carte.', {icon: '🗺'})}</div>
                <div data-tr-pane="frise" ${tab === 'frise' ? '' : 'hidden'}>${frise(ppl)}</div>`
                : A().empty('Personne dans ta base n’a ce métier pour l’instant.', {icon: '👥'})}</section>
            <section class="h-tr-sec"><h4>🖼 Images de la base</h4>${d.media.length ? `<div class="h-tr-media">${d.media.map((m, i) => `<button type="button" class="h-tr-thumb" data-tr-media="${i}" title="${esc(m.title || 'Média')}">${m.thumb && /\.(jpe?g|png|gif|webp)$/i.test(m.thumb) ? `<img src="${esc(m.thumb)}" alt="" loading="lazy">` : '<span aria-hidden="true">📄</span>'}<small>${esc(m.title || 'Sans titre')}</small></button>`).join('')}</div>` : A().empty('Aucune image ne cite ce métier. Ajoute une photo d’atelier, d’outil ou une carte postale.', {icon: '🖼'})}</section>
            <div class="h-tr-actions"><button type="button" class="button small secondary" data-tr-edit>✎ Compléter la fiche</button><button type="button" class="button small secondary" data-tr-pics>＋ Ajouter des images</button>
                ${n.sheet_id ? `<button type="button" class="button small secondary" data-tr-sheet="${n.sheet_id}">↗ Fiche « ${esc(n.sheet_title || 'Un métier')} »</button>` : '<button type="button" class="button small secondary" data-tr-mksheet>📒 En faire une Fiche</button>'}
                <a class="button small secondary" href="https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(d.name)}" target="_blank" rel="noopener noreferrer" title="Photos et gravures libres de droits sur Wikimedia Commons">🔍 Images libres ↗</a></div>
            ${d.related?.length ? `<p class="h-tr-rel"><small>Du même domaine : ${d.related.map(r => `<button type="button" class="table-link" data-tr-key="${esc(r.key)}">${esc(r.name)}</button>`).join(' · ')}</small></p>` : ''}
            <p class="muted h-tr-src"><small>${esc(d.source.credit)} Licence <a href="${esc(d.source.licence_url)}" target="_blank" rel="noopener noreferrer">${esc(d.source.licence)}</a>. Sources : ${(d.source.sources || []).map(([l, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(l)}</a>`).join(' ; ')}.</small></p></div>`;
        const dlg = ext.openDialog({eyebrow: 'MÉTIER ANCIEN', title: `🛠️ ${d.name}`, wide: true, body});
        const save = async change => { await post('save_old_trade', {key: d.key, notes: n.notes || '', sheet_id: n.sheet_id || 0, media_ids: n.media_ids || [], ...change}); };
        const reopen = () => { dlg.close(); open('', {key: d.key}); };
        dlg.addEventListener('click', async e => {
            const b = e.target.closest('button, a'); if (!b) return;
            if (b.dataset.trTab) { lsSet('genealogie-trade-tab', b.dataset.trTab); dlg.querySelectorAll('[data-tr-tab]').forEach(x => { x.classList.toggle('is-active', x === b); x.setAttribute('aria-selected', String(x === b)); }); dlg.querySelectorAll('[data-tr-pane]').forEach(p => { p.hidden = p.dataset.trPane !== b.dataset.trTab; }); }
            else if (b.dataset.trPerson) { dlg.close(); A().openPersonById?.(Number(b.dataset.trPerson)); }
            else if (b.dataset.trMedia) { const list = d.media.filter(m => m.filename); const m = d.media[Number(b.dataset.trMedia)]; const i = list.indexOf(m); if (i >= 0) A().openLightbox?.(list, i, true); }
            else if (b.dataset.trKey) { dlg.close(); open('', {key: b.dataset.trKey}); }
            else if (b.dataset.trSheet) { dlg.close(); S().ficheId = Number(b.dataset.trSheet); A().setModule('fiches'); }
            else if (b.matches('[data-tr-edit]')) {
                ext.openDialog({eyebrow: 'MÉTIER ANCIEN', title: `Compléter « ${d.name} »`, body: `<label>Ce que tu sais de ce métier dans ta famille, ta région…<textarea name="notes" rows="9" maxlength="20000">${esc(n.notes || '')}</textarea></label><p class="muted">Le texte du dictionnaire reste au-dessus ; le tien s’affiche juste après.</p>`,
                    onSubmit: async f => { await save({notes: f.elements.notes.value}); toast('Enregistré', 'success'); reopen(); }});
            } else if (b.matches('[data-tr-pics]')) {
                const P = window.LCNDA_PICKER || A(); if (!P.openMediaPicker) return toast('La fenêtre des images n’est pas encore prête.', 'error');
                const list = await P.openMediaPicker({types: ['image'], multiple: true, eyebrow: 'MÉTIER ANCIEN', title: `Les images de « ${d.name} »`, okLabel: 'Prendre ces images', value: n.media_ids || []});
                if (!list) return; await save({media_ids: list.map(m => Number(m.id)).filter(Boolean)}); toast('Enregistré', 'success'); reopen();
            } else if (b.matches('[data-tr-mksheet]')) {
                try {
                    const r = await post('save_topic_sheet', {title: d.name, icon: '🛠️', subtitle: 'Un métier d’autrefois', blocks: [
                        {type: 'text', title: 'Le métier', width: '8', text: [t?.desc || '', n.notes || '', t?.tools?.length ? `**Ses outils** : ${t.tools.join(', ')}.` : '', ...(t?.words || []).map(([w, m]) => `- **${w}** : ${m}`)].filter(Boolean).join('\n\n')},
                        {type: 'quote', title: 'Témoignage', width: '4', text: '', source: ''},
                        {type: 'people', title: 'Mes ancêtres qui l’ont exercé', width: '12', ids: ppl.map(p => p.id)}, {type: 'images', title: 'Images', width: '12', layout: 'strip'}]});
                    await save({sheet_id: Number(r.id)});
                    toast('Fiche créée', '', {action: {label: '↗ Ouvrir', run: () => { dlg.close(); S().ficheId = Number(r.id); A().setModule('fiches'); }}}); reopen();
                } catch (err) { toast(err.message, 'error'); }
            }
        });
    }
    ext.oldTrade = {open};

    /* ─────────── Listes → 🛠️ Métiers anciens ─────────── */
    ext.lists.old_trades = async token => {
        const st = ls('genealogie-trades-list', {q: '', dom: '', mine: false});
        let d; try { d = await api('old_trades', {}); } catch (e) { A().$('#workspace').innerHTML = A().emptyState({icon: '⛔', text: e.message}); return; }
        if (token !== S().workspaceToken || S().module !== 'listes') return;
        const ws = A().$('#workspace'), doms = d.domains || {};
        const mineN = d.trades.filter(r => r.people).length;
        ws.innerHTML = `<section class="page collection-page h-tr-page">${UI().pageHeader({title: '🛠️ Métiers anciens', help: `Ce que faisaient le tisserand, le sabotier, le brassier… ${A().plural(d.total, 'métier')}, avec leurs variantes d’orthographe, leurs outils et leurs mots anciens. Un clic ouvre la fiche du métier et les ancêtres qui l’exerçaient.`})}
            <div class="h-world-listbar"><label class="h-world-q"><span aria-hidden="true">🔍</span><input type="search" data-tr-q value="${esc(st.q)}" placeholder="Chercher… (sabotier, toile, cuir)" aria-label="Chercher un métier"></label>
                <select data-tr-dom aria-label="Domaine"><option value="">Tous les domaines</option>${Object.entries(doms).map(([k, v]) => `<option value="${k}" ${st.dom === k ? 'selected' : ''}>${v.icon} ${esc(v.label)}</option>`).join('')}<option value="perso" ${st.dom === 'perso' ? 'selected' : ''}>✎ Pas dans le dictionnaire</option></select>
                <label class="ui-toggle"><input type="checkbox" data-tr-mine ${st.mine ? 'checked' : ''}><i></i>Ceux de ma famille (${mineN})</label><span class="spacer"></span><span class="muted" data-tr-count></span></div>
            <ul class="h-tr-list" data-tr-rows></ul>
            <section class="maintenance-panel"><h3>D’où vient ce dictionnaire ?</h3><p>${esc(d.credit)} Licence ${esc(d.licence)}.</p><ul>${(d.sources || []).map(([l, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(l)} ↗</a></li>`).join('')}</ul></section></section>`;
        const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        const paint = () => {
            const q = fold(st.q);
            const rows = d.trades.filter(r => (!st.mine || r.people) && (!st.dom || r.domain === st.dom) && (!q || fold(`${r.name} ${r.fem} ${r.variants.join(' ')} ${r.desc}`).includes(q)))
                .sort((a, b) => (b.people > 0) - (a.people > 0) || a.name.localeCompare(b.name, 'fr'));
            ws.querySelector('[data-tr-count]').textContent = A().plural(rows.length, 'métier');
            ws.querySelector('[data-tr-rows]').innerHTML = rows.length ? rows.map(r => `<li><button type="button" class="h-tr-row" data-tr-key="${esc(r.key)}"><span class="h-tr-ico" aria-hidden="true">${(doms[r.domain] || {icon: '✎'}).icon}</span><span class="h-tr-main"><strong>${esc(r.name)}</strong>${r.fem ? ` <small>· ${esc(r.fem)}</small>` : ''}<small class="h-tr-line">${esc(r.desc)}</small></span>${r.people ? (UI().badge ? UI().badge(A().plural(r.people, 'ancêtre'), 'blue') : '') : ''}</button></li>`).join('')
                : A().emptyState({icon: '🛠️', text: `Aucun métier pour « ${st.q} »`, hint: 'Vérifie l’orthographe, ou cherche un mot du métier (toile, bois, cuir…).'});
            lsSet('genealogie-trades-list', st);
        };
        paint();
        ws.querySelector('[data-tr-q]').addEventListener('input', e => { st.q = e.target.value; paint(); });
        ws.querySelector('[data-tr-dom]').addEventListener('change', e => { st.dom = e.target.value; paint(); });
        ws.querySelector('[data-tr-mine]').addEventListener('change', e => { st.mine = e.target.checked; paint(); });
        ws.addEventListener('click', e => { const b = e.target.closest('[data-tr-key]'); if (b) open('', {key: b.dataset.trKey}); });
    };

    /* ─────────── sur la fiche : le métier devient un lien ─────────── */
    const LABELS = /^(Métier \/ activité|Rôle \/ travail)$/;
    function enhance() {
        document.querySelectorAll('#workspace .person-page .data-row:not([data-tr-done])').forEach(row => {
            row.dataset.trDone = '1';
            const dt = row.querySelector('dt'), dd = row.querySelector('dd');
            if (!dt || !dd || !LABELS.test(dt.textContent.trim())) return;
            const job = dd.textContent.trim(); if (!job || job === '—') return;
            dd.innerHTML = `<button type="button" class="table-link h-tr-link" data-trade-open="${esc(job)}" title="Ce que faisait un « ${esc(job)} », ses outils, et les ancêtres qui l’exerçaient">${esc(job)} <span aria-hidden="true">🛠️</span></button>`;
        });
    }
    new MutationObserver(enhance).observe(document.documentElement, {childList: true, subtree: true});
    document.addEventListener('click', e => { if (e.target.closest?.('[data-trades-list]')) { e.preventDefault(); S().listType = 'old_trades'; A().setModule('listes'); } });
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-trade-open]'); if (!b) return; e.preventDefault(); open(b.dataset.tradeOpen); });
    const boot = () => { const L = A()?.defaultListTypes; if (Array.isArray(L) && !L.some(x => x[0] === 'old_trades')) { const i = L.findIndex(x => x[0] === 'occupations'); L.splice(i < 0 ? L.length : i + 1, 0, ['old_trades', '06a', '🛠️ Métiers anciens']); } };
    boot(); document.addEventListener('DOMContentLoaded', boot, {once: true});
})();
