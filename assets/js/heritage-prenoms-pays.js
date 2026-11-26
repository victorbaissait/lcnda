/* LCNDA — 📊 Prénoms d'ici et d'ailleurs (serveur : lib/prenoms_pays.php ; pack fabriqué par scripts/prenoms/build-prenoms.py).
 *  · Sur la fiche (bloc Identité) : « 📊 En 1912 dans le Cantal, 1 fille sur 4 s’appelait Marie (rang 1) · voir la courbe ».
 *    Jamais pour une personne en vie, probablement en vie ou confidentielle (même règle que « 👶 Prénom reçu de… »).
 *  · « voir la courbe » : le prénom année par année, pour mille enfants du même sexe, le département à côté du pays.
 *  · Statistiques → Prénoms : la famille et la France : le bloc « ⤓ Installer / 🗑 Supprimer (↶) / À propos des données »
 *    (ext.prenomsPays.panel, appelé par assets/js/heritage.js).
 * Réglages de l'écran : localStorage['genealogie-prenoms-pays'] ({fiche: true|false}) ; téléchargement en cours :
 * localStorage['genealogie-prenoms-pays-dl'] (reprise après fermeture). Rien n'est écrit dans la généalogie.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    // ⚠ la vérification « installé ? » a échoué (serveur) : on le DIT (pas « pas installé » en silence), une fois toutes les 30 s au plus
    const statusErr = e => { const now = Date.now(); if (now - (statusErr.at || 0) < 30000) return; statusErr.at = now; A().toast?.(i18n('Impossible de vérifier si ces données sont installées : {e}', {e: e?.message || String(e)}), 'error'); };
    const UI = () => window.LCNDA_UI || {};
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const post = (a, b) => api(a, {}, {method: 'POST', body: b}).then(r => r.result || r);
    const KEY = 'genealogie-prenoms-pays', DL_KEY = 'genealogie-prenoms-pays-dl';
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const fmtSize = b => (b >= 1e9 ? `${(b / 1e9).toFixed(1).replace('.', ',')} Go` : `${Math.max(1, Math.round(b / 1e6))} Mo`);
    const ro = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('ms-open');
    function settings() { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {fiche: s.fiche !== false}; }
    function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} }

    /* ═════════ la phrase de la fiche ═════════ */
    function phrase(l) {
        const who = l.sex === 2 ? ['fille'] : ['garçon'];
        const name = `<b>${esc(l.name)}</b>`, rank = l.rank ? ` ${i18n('(rang {n})', {n: String(l.rank)})}` : '';
        if (l.living_pop) { // Suisse : les personnes vivant en Suisse fin 2025, pas les naissances
            const f = l.sex === 2;
            if (!l.n) return f ? i18n('Parmi les femmes nées en {year} qui vivent en Suisse, {name} est un prénom rare', {year: String(l.year), name}) : i18n('Parmi les hommes nés en {year} qui vivent en Suisse, {name} est un prénom rare', {year: String(l.year), name});
            return (f ? i18n('Parmi les femmes nées en {year} qui vivent en Suisse, 1 sur {k} s’appelle {name}', {year: String(l.year), k: nf(l.one_in), name}) : i18n('Parmi les hommes nés en {year} qui vivent en Suisse, 1 sur {k} s’appelle {name}', {year: String(l.year), k: nf(l.one_in), name})) + rank;
        }
        if (!l.n) return i18n('En {year} {where}, {name} était un prénom rare', {year: String(l.year), where: esc(l.where), name});
        return i18n('En {year} {where}, 1 {who} sur {k} s’appelait {name}', {year: String(l.year), where: esc(l.where), who: who[0], k: nf(l.one_in), name}) + rank;
    }
    const lines = new Map();
    (ext.afterPerson = ext.afterPerson || []).push(detail => {
        const p = detail?.person; if (!p?.id || p.kind === 'animal' || !String(p.first_name || '').trim() || !settings().fiche) return;
        const id = Number(p.id);
        api('prenoms_pays_person', {id}).then(info => {
            const st = A().state || {};
            if (Number(st.currentPersonId) !== id && Number(st.currentPerson?.person?.id) !== id) return;
            const cardBody = [...document.querySelectorAll('#workspace .person-page .card')].find(c => /^Identité/.test(c.querySelector('.card-title h3')?.textContent?.trim() || ''))?.querySelector('.card-body');
            if (!cardBody) return;
            cardBody.querySelector('.ppx-line')?.remove();
            const l = info?.line; if (!l) return;
            lines.set(id, l);
            const line = document.createElement('div'); line.className = 'ppx-line'; line.dataset.ppxPerson = String(id);
            line.innerHTML = `<span class="ppx-ico" aria-hidden="true">📊</span><span class="ppx-text">${phrase(l)} · <button type="button" class="link-button" data-ppx-curve>${esc(i18n('voir la courbe'))}</button>${l.source ? `<small class="ui-hint">${esc(l.source.mention || l.source.nom)}</small>` : ''}</span>`;
            const after = cardBody.querySelector('.pf-line') || cardBody.querySelector('.person-saint') || cardBody.querySelector('.data-list');
            if (after) after.insertAdjacentElement('afterend', line); else cardBody.prepend(line);
        }).catch(() => {});
    });
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-ppx-curve]'); if (!b) return;
        const l = lines.get(Number(b.closest('[data-ppx-person]')?.dataset.ppxPerson)); if (!l) return;
        openCurve({name: l.name, key: l.key, sex: l.sex, zones: [l.zone.id, l.country_zone].filter((v, i, a) => a.indexOf(v) === i), year: l.year});
    });

    /* ═════════ « voir la courbe » ═════════ */
    const COLORS = ['var(--ppx-c1, #cc4700)', 'var(--ppx-c2, #2a6fdb)', 'var(--ppx-c3, #2e8b57)', 'var(--ppx-c4, #8e44ad)'];
    function chart(series, year) {
        const all = series.flatMap(s => s.points);
        if (!all.length) return '';
        const W = 640, H = 240, L = 44, R = 12, T = 12, B = 26;
        const y0 = Math.min(...all.map(p => p.y)), y1 = Math.max(...all.map(p => p.y));
        const max = Math.max(0.001, ...all.map(p => p.per1000));
        const x = y => L + (y - y0) / Math.max(1, y1 - y0) * (W - L - R), yy = v => T + (1 - v / max) * (H - T - B);
        const step = [1, 2, 5, 10, 20, 50, 100, 200, 500].find(s => max / s <= 5) || 1000;
        let g = '';
        for (let v = 0; v <= max + 1e-9; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${yy(v).toFixed(1)}" y2="${yy(v).toFixed(1)}" class="ppx-grid"/><text x="${L - 6}" y="${(yy(v) + 4).toFixed(1)}" text-anchor="end" class="ppx-ax">${nf(v)}</text>`;
        const dec = (y1 - y0) > 60 ? 20 : 10;
        for (let y = Math.ceil(y0 / dec) * dec; y <= y1; y += dec) g += `<text x="${x(y).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="ppx-ax">${y}</text>`;
        if (year >= y0 && year <= y1) g += `<line x1="${x(year).toFixed(1)}" x2="${x(year).toFixed(1)}" y1="${T}" y2="${H - B}" class="ppx-year"/><text x="${(x(year) + 4).toFixed(1)}" y="${T + 10}" class="ppx-ax">${year}</text>`;
        series.forEach((s, i) => {
            const pts = s.points.map(p => `${x(p.y).toFixed(1)},${yy(p.per1000).toFixed(1)}`).join(' ');
            g += `<polyline points="${pts}" fill="none" stroke="${COLORS[i]}" stroke-width="${i ? 1.6 : 2.2}" ${i ? 'stroke-dasharray="5 3"' : ''}/>`;
            const hit = s.points.find(p => p.y === year);
            if (hit) g += `<circle cx="${x(year).toFixed(1)}" cy="${yy(hit.per1000).toFixed(1)}" r="4" fill="${COLORS[i]}"><title>${esc(`${s.zone.name}, ${year} : ${nf(hit.n)} / ${nf(hit.total)}`)}</title></circle>`;
        });
        return `<svg class="ppx-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(i18n('Courbe du prénom, pour mille enfants'))}">${g}</svg>`;
    }
    async function openCurve({name, key, sex, zones, year}) {
        let d;
        try { d = await api('prenoms_pays_curve', {name: key || name, sex, zones: zones.join(',')}); } catch (x) { return A().toast?.(x.message, 'error'); }
        const series = (d.series || []).filter(s => s.points.length);
        const legend = series.map((s, i) => { const hit = s.points.find(p => p.y === year);
            return `<li><span class="ppx-key" style="background:${COLORS[i]}"></span><b>${esc(s.zone.name)}</b>${hit ? ` — ${esc(i18n('en {year} : {n} sur {t} ({p} pour mille)', {year: String(year), n: nf(hit.n), t: nf(hit.total), p: nf(Math.round(hit.per1000 * 10) / 10)}))}${hit.rank ? ` · ${esc(i18n('rang {n}', {n: String(hit.rank)}))}` : ''}` : ''}</li>`; }).join('');
        const srcs = [...new Map(series.filter(s => s.source).map(s => [s.source.nom, s.source])).values()];
        const body = series.length ? `<p class="ppx-sub">${esc(i18n('Combien d’enfants sur mille ({sex}) recevaient ce prénom chaque année.', {sex: sex === 2 ? i18n('filles') : i18n('garçons')}))}</p>${chart(series, year)}<ul class="ppx-legend">${legend}</ul>
            <div class="ppx-src">${srcs.map(s => `<p><small>${esc(s.mention)} ${esc(s.licence)}${s.url ? ` · <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(i18n('la source en ligne'))} ↗</a>` : ''}<br>${esc(s.quoi || '')}</small></p>`).join('')}</div>`
            : (A().empty ? A().empty(i18n('Pas de chiffres pour ce prénom.'), {icon: '📊'}) : '');
        const title = i18n('{name} au fil des années', {name});
        if (ext.openDialog) return ext.openDialog({eyebrow: '📊 ' + i18n('PRÉNOMS'), title, body, wide: true});
        const dlg = document.createElement('dialog'); dlg.className = 'modal modal-l ppx-dialog';
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">📊 ${esc(i18n('PRÉNOMS'))}</span><h2>${esc(title)}</h2></div><button class="icon-button" aria-label="Fermer">×</button></div><div class="ppx-body">${body}</div><div class="modal-actions"><span class="spacer"></span><button class="button secondary">${esc(i18n('Fermer'))}</button></div></form>`;
        document.body.appendChild(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
    }

    /* ═════════ « À propos des données » ═════════ */
    async function openAbout() {
        let d = {sources: [], missing: []};
        try { d = await api('prenoms_pays_about'); } catch (_) {}
        const KNOWN = [['FR', 'Insee — Fichier des prénoms', 'Licence Ouverte 2.0 (Etalab)', 'https://www.insee.fr/fr/statistiques/8205621'], ['CH', 'OFS — Prénoms de la population selon l’année de naissance (STATPOP)', 'OFS : libre, source obligatoire', 'https://www.bfs.admin.ch/asset/fr/36752511'], ['QC', 'Retraite Québec — Banque de prénoms', 'CC BY 4.0', 'https://www.donneesquebec.ca/recherche/dataset/banque-de-prenoms-filles'], ['US', 'Social Security Administration — Popular Baby Names (national data)', 'Domaine public', 'https://www.ssa.gov/oact/babynames/limits.html']];
        const rows = d.sources?.length ? d.sources.map(s => `<tr><td><b>${esc(s.nom)}</b><br><small>${esc(s.quoi)}</small></td><td>${esc(s.annees)}</td><td>${esc(s.licence)}<br><small>${esc(s.mention)}</small></td><td>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">↗</a>` : ''}</td></tr>`).join('')
            : KNOWN.map(k => `<tr><td><b>${esc(k[1])}</b></td><td>—</td><td>${esc(k[2])}</td><td><a href="${esc(k[3])}" target="_blank" rel="noopener noreferrer">↗</a></td></tr>`).join('');
        const body = `<p>${esc(i18n('Le pack réunit les fichiers publics des prénoms donnés chaque année. Les chiffres viennent tels quels de ces fichiers ; l’app calcule seulement la part (1 sur N) et le rang.'))}</p>
            <div class="data-table-wrap"><table class="data-table"><thead><tr><th>${esc(i18n('Source'))}</th><th>${esc(i18n('Années'))}</th><th>${esc(i18n('Licence'))}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
            <h3>${esc(i18n('Pas dans le pack'))}</h3><ul>${(d.missing || []).map(m => `<li><b>${esc(m.pays)}</b> : ${esc(m.why)}${m.url ? ` <a href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">↗</a>` : ''}</li>`).join('')}</ul>`;
        if (ext.openDialog) return ext.openDialog({eyebrow: '📊 ' + i18n('PRÉNOMS'), title: i18n('À propos des données'), body, wide: true});
        A().toast?.(i18n('À propos des données'));
    }

    /* ═════════ ⤓ Installer en un bouton (même chemin que la météo) ═════════ */
    const DL = {online: undefined, err: '', run: null, paused: null};
    const dlSaved = () => { try { return localStorage.getItem(DL_KEY) || ''; } catch (_) { return ''; } };
    const dlRemember = id => { try { localStorage.setItem(DL_KEY, id); } catch (_) {} };
    const dlForget = () => { try { localStorage.removeItem(DL_KEY); } catch (_) {} };
    const pct = (a, b) => (b ? Math.floor(a / b * 100) : 0);
    let host = null, st = {installed: false}, onChange = () => {};
    const redraw = () => { if (host && host.isConnected) draw(); };
    async function refresh(changed = true) { try { st = await api('prenoms_pays_status'); } catch (e) { statusErr(e); } redraw(); if (!st.installed && DL.online === undefined) loadInfo(); if (changed) onChange(st); }
    function loadInfo() {
        DL.online = undefined;
        api('prenoms_pays_dl_info').then(r => { DL.online = r.pack || null; DL.err = r.error || ''; }).catch(x => { DL.online = null; DL.err = x.message; }).finally(async () => {
            const id = dlSaved(); if (id && !DL.run) { try { const r = await api('prenoms_pays_dl_resume', {id}); if (r.exists) DL.paused = {id, received: r.received, size: r.size}; else dlForget(); } catch (_) {} }
            redraw(); });
    }
    function acts() {
        if (st.installed) return ro() ? '' : `<button type="button" class="button small secondary" data-ppx-remove>🗑 ${esc(i18n('Supprimer'))}</button>`;
        if (ro()) return '';
        if (DL.run) return `<span class="ppx-dl" data-ppx-dl-box><span class="ppx-prog"><i style="width:${pct(DL.run.received, DL.run.size)}%"></i></span><small data-ppx-dl-txt>${esc(`${pct(DL.run.received, DL.run.size)} % · ${fmtSize(DL.run.received)} ${i18n('sur')} ${fmtSize(DL.run.size)}`)}</small><button type="button" class="button small secondary" data-ppx-pause>⏸ ${esc(i18n('Pause'))}</button></span>`;
        if (DL.paused) return `<span class="ppx-dl"><span class="ppx-prog"><i style="width:${pct(DL.paused.received, DL.paused.size)}%"></i></span><small>${esc(i18n('En pause : {p} %', {p: String(pct(DL.paused.received, DL.paused.size))}))}</small><button type="button" class="button small" data-ppx-dl>▶ ${esc(i18n('Reprendre'))}</button><button type="button" class="button small secondary" data-ppx-cancel>✕ ${esc(i18n('Abandonner'))}</button></span>`;
        if (DL.online === undefined) return `<small class="muted">${esc(i18n('Recherche des données en ligne…'))}</small>`;
        if (!DL.online) return `<small class="muted" title="${esc(DL.err)}">${esc(DL.err ? i18n('Pas de connexion aux données en ligne.') : i18n('Pas encore en ligne.'))}</small>`;
        return `<button type="button" class="button small" data-ppx-dl>⤓ ${esc(i18n('Installer ({s})', {s: fmtSize(DL.online.size)}))}</button>`;
    }
    function draw() {
        const countries = st.installed ? [...new Set((st.zones || []).map(z => z.country))] : [];
        const range = c => { const z = (st.zones || []).find(x => x.country === c && x.code === ''); return z ? `${z.from}–${z.to}` : ''; };
        const NAMES = {FR: i18n('France et départements'), CH: i18n('Suisse'), QC: i18n('Québec'), US: i18n('États-Unis')};
        const desc = st.installed ? `${countries.map(c => `${NAMES[c] || c} (${range(c)})`).join(' · ')} · ${fmtSize(st.size || 0)}${st.built ? ` · ${i18n('fabriqué le {d}', {d: st.built})}` : ''}${st.fixture ? ` · ${i18n('petit pack d’essai')}` : ''}`
            : i18n('France par département (Insee, 1900–2023), Suisse (OFS), Québec (Retraite Québec, 1980–2025). Un seul téléchargement, ensuite plus besoin d’Internet.');
        const s = settings();
        host.innerHTML = `<div class="ppx-panel"><div class="ppx-row"><span><b>${esc(i18n('Prénoms d’ici et d’ailleurs'))}</b> ${UI().badge ? UI().badge(i18n(st.installed ? 'Installé' : 'Pas installé'), st.installed ? 'green' : 'grey') : ''}<br><small>${esc(desc)}</small></span><span class="ppx-acts">${acts()}<button type="button" class="link-button" data-ppx-about>${esc(i18n('À propos des données'))}</button></span></div>
            ${st.installed ? `<label class="ppx-opt"><input type="checkbox" data-ppx-fiche ${s.fiche ? 'checked' : ''}> ${esc(i18n('Montrer la petite ligne « 📊 » sur les fiches (année et lieu de naissance)'))}</label>` : ''}</div>`;
    }
    function paint() { const box = host?.querySelector('[data-ppx-dl-box]'); if (!DL.run || !box) return; box.querySelector('.ppx-prog i').style.width = `${pct(DL.run.received, DL.run.size)}%`; box.querySelector('[data-ppx-dl-txt]').textContent = `${pct(DL.run.received, DL.run.size)} % · ${fmtSize(DL.run.received)} ${i18n('sur')} ${fmtSize(DL.run.size)}`; }
    async function dlRun() {
        if (DL.run) return;
        let id = DL.paused?.id || dlSaved(), run;
        try {
            if (id) { const r = await api('prenoms_pays_dl_resume', {id}); if (!r.exists) id = ''; else run = {id, received: r.received, size: r.size}; }
            if (!id) { const r = await post('prenoms_pays_dl_start', {}); id = r.id; run = {id, received: 0, size: r.size}; }
        } catch (x) { return A().toast?.(x.message, 'error'); }
        dlRemember(id); DL.paused = null; DL.run = {...run, stop: false}; redraw();
        let fails = 0;
        while (!DL.run.stop) {
            try { const r = await post('prenoms_pays_dl_step', {id}); DL.run.received = r.received; fails = 0; paint(); if (r.done) break; }
            catch (x) { if (++fails >= 3) { A().toast?.(i18n('Téléchargement arrêté : {e}', {e: x.message}), 'error'); DL.paused = {id, received: DL.run.received, size: DL.run.size}; DL.run = null; return redraw(); } await new Promise(r => setTimeout(r, 1500 * fails)); }
        }
        if (DL.run.stop) { DL.paused = {id, received: DL.run.received, size: DL.run.size}; DL.run = null; return redraw(); }
        const t = host?.querySelector('[data-ppx-dl-txt]'); if (t) t.textContent = i18n('Vérification et installation…');
        try {
            await post('prenoms_pays_dl_finish', {id}); dlForget(); DL.run = null;
            await refresh();
            const undo = async () => { await post('prenoms_pays_pack_undo', {}); await refresh(); };
            A().undoToast ? A().undoToast(i18n('📊 Données des prénoms installées.'), {undo}) : A().toast?.(i18n('📊 Données des prénoms installées.'));
        } catch (x) { dlForget(); DL.run = null; redraw(); A().toast?.(x.message, 'error'); }
    }
    async function dlCancel() { const id = DL.paused?.id || dlSaved(); DL.paused = null; dlForget(); if (id) { try { await post('prenoms_pays_dl_cancel', {id}); } catch (_) {} } redraw(); }
    async function remove() {
        try { await post('prenoms_pays_pack_remove', {}); } catch (x) { return A().toast?.(x.message, 'error'); }
        await refresh();
        const undo = async () => { await post('prenoms_pays_pack_restore', {}); await refresh(); };
        A().undoToast ? A().undoToast(i18n('🗑 Données des prénoms supprimées.'), {undo}) : A().toast?.(i18n('🗑 Données des prénoms supprimées.'));
    }
    /** le bloc « ⤓ Installer » dans une page : panel(élément, (status) => …) → le statut */
    async function panel(el, cb) {
        host = el; onChange = typeof cb === 'function' ? cb : () => {};
        if (!el.__ppxBound) {
            el.__ppxBound = true;
            el.addEventListener('click', e => {
                if (e.target.closest('[data-ppx-dl]')) return dlRun();
                if (e.target.closest('[data-ppx-pause]')) { if (DL.run) DL.run.stop = true; return; }
                if (e.target.closest('[data-ppx-cancel]')) return dlCancel();
                if (e.target.closest('[data-ppx-remove]')) return remove();
                if (e.target.closest('[data-ppx-about]')) return openAbout();
            });
            el.addEventListener('change', e => {
                const t = e.target.closest('[data-ppx-fiche]'); if (!t) return;
                const before = settings(), after = {...before, fiche: !!t.checked};
                save(after);
                A().undoToast?.(after.fiche ? i18n('📊 La petite ligne des prénoms est montrée sur les fiches.') : i18n('📊 La petite ligne des prénoms est cachée sur les fiches.'), {undo: () => { save(before); redraw(); }, redo: () => { save(after); redraw(); }});
            });
        }
        await refresh(false);
        return st;
    }
    ext.prenomsPays = {panel, openCurve, openAbout, phrase, settings};
})();
