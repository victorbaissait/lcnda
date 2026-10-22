/**
 * 📖 Biographie écrite par l'app — le bloc « 📖 Biographie » de la fiche (remplace l'ancienne « Biographie automatique »).
 * Le texte vient du générateur commun lib/biographie.php (GET biography, POST save_biography), le même que celui du livre
 * de famille, de la mise en page ({biographie}), d'une Fiche 📒 et du ✨ Récit d'une vie.
 *  - réglages : longueur (courte, normale, détaillée), ton (neutre, chaleureux), ce qu'on inclut (métiers, témoins,
 *    recensements, sources entre parenthèses ou en notes) — gardés avec la fiche, tout de suite (K2) ;
 *  - ✎ Modifier → « 💾 Garder ma version » ; « ↺ Remettre le texte de l'app » (avec ↶ Annuler) ;
 *  - ↻ Regénérer : montre ce qui a changé (mots ajoutés en vert, retirés en rouge barré) entre ta version et le nouveau texte ;
 *  - « Poser dans ▾ » : une Fiche 📒, un livre (mise en page, gabarit « Biographie d'un ancêtre »), une présentation (✨), copier.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.personBlocks = ext.personBlocks || {};
    const esc = v => A().escapeHtml(v ?? '');
    const api = (...a) => A().api(...a);
    const post = async (action, body) => { const r = await A().api(action, {}, {method: 'POST', body}); return r?.result ?? r ?? {}; };
    const toast = (...a) => A().toast(...a);

    const LENGTHS = [['short', 'Courte'], ['normal', 'Normale'], ['long', 'Détaillée']];
    const TONES = [['neutral', 'Neutre'], ['warm', 'Chaleureux']];
    const SOURCES = [['none', 'Sans les sources'], ['inline', 'Sources entre parenthèses'], ['notes', 'Sources en notes [1]']];
    const cache = new Map(); // id → dernière réponse (pour « ↻ Regénérer »)

    /** Le texte en paragraphes, les notes en liste */
    function textHtml(text) {
        const [body, notes] = String(text || '').split(/\n\s*Notes :\n/);
        const paras = body.split(/\n{2,}/).map(p => p.trim()).filter(Boolean).map(p => `<p>${esc(p).replace(/\[(\d+(?:,\d+)*)\]/g, '<sup>[$1]</sup>').replace(/\n/g, '<br>')}</p>`).join('');
        const list = notes ? `<ol class="h-bio-notes">${notes.split('\n').map(l => l.replace(/^\[\d+\]\s*/, '').trim()).filter(Boolean).map(l => `<li>${esc(l)}</li>`).join('')}</ol>` : '';
        return paras + list;
    }

    /** Ce qui a changé, mot à mot (plus longue sous-suite commune) */
    function diffHtml(a, b) {
        const tok = s => String(s || '').split(/(\s+)/).filter(x => x !== '');
        const x = tok(a), y = tok(b);
        if (x.length * y.length > 4e6) return `<del>${esc(a)}</del> <ins>${esc(b)}</ins>`;
        const n = x.length, m = y.length, L = Array.from({length: n + 1}, () => new Uint16Array(m + 1));
        for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
        const out = []; let i = 0, j = 0;
        const push = (k, t) => { const last = out[out.length - 1]; if (last && last[0] === k) last[1] += t; else out.push([k, t]); };
        while (i < n && j < m) { if (x[i] === y[j]) { push('=', x[i]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) { push('-', x[i++]); } else { push('+', y[j++]); } }
        while (i < n) push('-', x[i++]); while (j < m) push('+', y[j++]);
        const html = out.map(([k, t]) => k === '=' ? esc(t) : k === '-' ? (t.trim() ? `<del>${esc(t)}</del>` : esc(t)) : (t.trim() ? `<ins>${esc(t)}</ins>` : esc(t))).join('');
        return {html: html.replace(/\n/g, '<br>'), added: out.filter(o => o[0] === '+' && o[1].trim()).length, removed: out.filter(o => o[0] === '-' && o[1].trim()).length};
    }

    ext.personBlocks.bio = (index, detail, o = {}) => {
        const pid = Number(detail.person?.id) || 0;
        if (!pid || detail.person?.kind === 'animal') return '';
        const locked = Number(detail.person?.is_locked) === 1;
        return A().card(index, '📖 Biographie', '', `<div class="h-bio" data-bio-host="${pid}" data-bio-locked="${locked ? 1 : 0}">${UI().spinner ? UI().spinner('La biographie s’écrit…') : ''}</div>`, 'span-12');
    };

    async function load(host, params = {}) {
        const pid = Number(host.dataset.bioHost);
        let d; try { d = await api('biography', {id: pid, ...params}); } catch (e) { host.innerHTML = A().empty(e.message || 'Chargement impossible.', {icon: '⛔'}); return null; }
        cache.set(pid, d);
        if (host.isConnected && !host.querySelector('.h-bio-edit')) paint(host, d); // pendant « ✎ Modifier », le texte tapé n'est pas effacé
        return d;
    }

    function paint(host, d, editing = false) {
        const locked = host.dataset.bioLocked === '1', o = d.options || {};
        const own = !!d.own;
        const status = `${UI().badge ? UI().badge(own ? 'Ta version' : 'Texte de l’app', own ? 'green' : 'blue') : ''}${own && d.updated_at && UI().when ? ` <small class="muted">${UI().when(d.updated_at, {label: 'Modifié'})}</small>` : ''}`;
        const tabs = (name, list, cur) => `<div class="ui-tabs h-bio-tabs" role="tablist" aria-label="${name === 'length' ? 'Longueur' : 'Ton'}">${list.map(([k, l]) => `<button type="button" role="tab" class="${k === cur ? 'is-active' : ''}" aria-selected="${k === cur}" data-bio-opt="${name}" data-v="${k}" ${own ? 'title="Change le texte de l’app ; ta version reste gardée"' : ''}>${l}</button>`).join('')}</div>`;
        const tog = (k, l) => `<label class="ui-toggle"><input type="checkbox" data-bio-flag="${k}" ${o[k] ? 'checked' : ''}><i></i>${l}</label>`;
        const tools = `<div class="h-bio-bar">${tabs('length', LENGTHS, o.length)}${tabs('tone', TONES, o.tone)}
            <details class="h-bio-inc"><summary class="button small secondary">⚙️ Ce qu’on inclut ▾</summary><div class="h-bio-incbox">${tog('jobs', 'Les métiers')}${tog('witnesses', 'Les témoins, parrains et marraines')}${tog('census', 'Les recensements')}
                <label>Sources <select data-bio-sources>${SOURCES.map(([k, l]) => `<option value="${k}" ${o.sources === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div></details>
            <span class="h-bio-status">${status}</span></div>`;
        const notice = own && d.changed ? (UI().notice ? UI().notice('info', 'La fiche a changé depuis que tu as gardé ta version. « ↻ Regénérer » montre ce qui a changé.') : '') : '';
        const body = editing
            ? `<textarea class="h-bio-edit" rows="12" aria-label="Texte de la biographie">${esc(d.text)}</textarea><div class="h-bio-actions"><span class="spacer"></span><button type="button" class="button secondary" data-bio-cancel>Annuler</button><button type="button" class="button" data-bio-keep>💾 Garder ma version</button></div>`
            : `<div class="h-bio-text">${d.text.trim() ? textHtml(d.text) : A().empty('Pas encore assez d’informations sur la fiche pour écrire sa vie.', {icon: '📖'})}</div>`;
        const actions = editing ? '' : `<div class="h-bio-actions">${locked ? '' : `<button type="button" class="button small secondary" data-bio-edit>✎ Modifier</button><button type="button" class="button small secondary" data-bio-regen title="Réécrire le texte d’après la fiche et voir ce qui a changé">↻ Regénérer</button>`}
            <button type="button" class="button small secondary" data-bio-put>Poser dans ▾</button>${own && !locked ? '<span class="spacer"></span><button type="button" class="button small secondary" data-bio-reset>↺ Remettre le texte de l’app</button>' : ''}</div>`;
        host.innerHTML = (locked ? '' : tools) + notice + body + actions;
        if (editing) { const t = host.querySelector('textarea'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
    }

    const optsOf = host => { const d = cache.get(Number(host.dataset.bioHost)); return {...(d?.options || {})}; };
    async function setOptions(host, change) {
        const pid = Number(host.dataset.bioHost), options = {...optsOf(host), ...change};
        try { await post('save_biography', {person_id: pid, options}); } catch (e) { toast(e.message, 'error'); }
        await load(host, options);
    }

    async function keep(host, text) {
        const pid = Number(host.dataset.bioHost), before = cache.get(pid);
        try {
            const d = await post('save_biography', {person_id: pid, text, options: optsOf(host)});
            cache.set(pid, d); paint(host, d);
            const undo = async () => { const r = await post('save_biography', {person_id: pid, text: before?.own || '', options: before?.options}); cache.set(pid, r); if (host.isConnected) paint(host, r); };
            if (A().undoToast) A().undoToast(text ? 'Ta version de la biographie est gardée' : 'Le texte de l’app est remis', {undo, redo: () => keep(host, text)});
            else toast('Enregistré', 'success');
        } catch (e) { toast(e.message, 'error', {retry: () => keep(host, text)}); }
    }

    async function regen(host) {
        const pid = Number(host.dataset.bioHost), before = cache.get(pid);
        const d = await load(host, optsOf(host)); if (!d) return;
        const old = d.own ? d.own : (before?.generated || '');
        if (old.trim() === d.generated.trim()) { toast(d.own ? 'Ta version et le texte de l’app sont pareils : rien à changer.' : 'Rien n’a changé : la fiche donne le même texte.'); return; }
        const df = diffHtml(old, d.generated);
        ext.openDialog({eyebrow: 'BIOGRAPHIE', title: '↻ Ce qui a changé', wide: true, submitLabel: d.own ? 'Prendre le nouveau texte' : 'Fermer',
            body: `<p class="muted">${d.own ? 'À gauche de chaque mot : en <ins>vert</ins> ce que le nouveau texte ajoute, en <del>rouge barré</del> ce qu’il retire par rapport à ta version.' : 'Le texte de l’app a été réécrit d’après la fiche : en <ins>vert</ins> ce qui est nouveau, en <del>rouge barré</del> ce qui n’y est plus.'}</p>
                <p><small>${A().plural(df.added, 'passage ajouté', 'passages ajoutés')} · ${A().plural(df.removed, 'passage retiré', 'passages retirés')}</small></p>
                <div class="h-bio-diff">${df.html}</div>${d.own ? '<p class="muted">« Annuler » garde ta version telle quelle.</p>' : ''}`,
            onSubmit: async () => { if (d.own) await keep(host, ''); }});
    }

    function putMenu(btn, host) {
        const pid = Number(host.dataset.bioHost), d = cache.get(pid); if (!d) return;
        const name = document.querySelector('#workspace .person-hero h2')?.textContent?.trim() || 'cette personne';
        const items = [
            {icon: '📒', label: 'Dans une nouvelle Fiche', run: async () => {
                try { const r = await post('save_topic_sheet', {title: `Biographie de ${name}`.slice(0, 200), icon: '📖', subtitle: 'Écrite d’après la fiche, à compléter', blocks: [
                    {type: 'text', title: 'Sa vie', width: '8', text: d.text}, {type: 'people', title: 'La personne', width: '4', ids: [pid]}]});
                    toast('Fiche créée', '', {action: {label: '↗ Ouvrir', run: () => { A().state.ficheId = Number(r.id); A().setModule('fiches'); }}});
                } catch (e) { toast(e.message, 'error'); } }},
            {icon: '📐', label: 'Dans un livre (mise en page)', run: () => { if (ext.layoutTemplates?.wizard) ext.layoutTemplates.wizard(() => {}, 'bio', pid); else toast('La mise en page n’est pas encore prête.', 'error'); }},
            {icon: '🎞️', label: 'Dans une présentation (✨ Récit d’une vie)', run: () => { const b = document.createElement('button'); b.hidden = true; b.dataset.ssStoryPerson = String(pid); document.body.appendChild(b); b.click(); b.remove(); }},
            '-',
            {icon: '📋', label: 'Copier le texte', run: async () => { try { await navigator.clipboard.writeText(d.text); toast('Texte copié : colle-le où tu veux.'); } catch (_) { toast('Copie impossible dans ce navigateur.', 'error'); } }},
        ];
        if (UI().menuAt) UI().menuAt(btn, items, {title: '« Biographie »'});
    }

    document.addEventListener('click', e => {
        const host = e.target.closest?.('[data-bio-host]'); if (!host) return;
        const pid = Number(host.dataset.bioHost), d = cache.get(pid);
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.bioOpt) { e.preventDefault(); setOptions(host, {[b.dataset.bioOpt]: b.dataset.v}); }
        else if (b.matches('[data-bio-edit]') && d) paint(host, d, true);
        else if (b.matches('[data-bio-cancel]') && d) paint(host, d);
        else if (b.matches('[data-bio-keep]')) { const t = host.querySelector('textarea').value.trim(); if (!t) { UI().fail?.(host.querySelector('textarea'), 'Écris le texte, ou « Annuler ».'); return; } keep(host, t); }
        else if (b.matches('[data-bio-regen]')) regen(host);
        else if (b.matches('[data-bio-reset]')) keep(host, '');
        else if (b.matches('[data-bio-put]')) putMenu(b, host);
    });
    document.addEventListener('change', e => {
        const host = e.target.closest?.('[data-bio-host]'); if (!host) return;
        if (e.target.dataset.bioFlag) setOptions(host, {[e.target.dataset.bioFlag]: e.target.checked ? 1 : 0});
        else if (e.target.matches('[data-bio-sources]')) setOptions(host, {sources: e.target.value});
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && e.target.matches?.('.h-bio-edit')) { const host = e.target.closest('[data-bio-host]'); const d = cache.get(Number(host.dataset.bioHost)); if (d) { e.stopPropagation(); paint(host, d); } } }, true);
    const scan = () => document.querySelectorAll('[data-bio-host]:not([data-bio-done])').forEach(h => { h.dataset.bioDone = '1'; load(h); });
    new MutationObserver(scan).observe(document.documentElement, {childList: true, subtree: true});
    // le nom du bloc dans « Maintenance → blocs des fiches » et le menu des widgets
    const rename = () => { const L = A()?.defaultPersonBlocks; const b = Array.isArray(L) && L.find(x => x[0] === 'bio'); if (b) b[1] = '📖 Biographie'; };
    const boot = () => { if (A()) rename(); };
    boot(); document.addEventListener('DOMContentLoaded', boot, {once: true});
    ext.biography = {textHtml, diffHtml};
})();
