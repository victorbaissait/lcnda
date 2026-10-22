/**
 * ❝ Citation des sources toute prête (F4) — sur ce qui existait : les sources et leurs citations (fenêtre « Source », références
 * détaillées de heritage-links.js). Le texte est rédigé par le serveur (lib/citation_styles.php, GET source_citations) en
 * 4 styles : classique à la française, Evidence Explained, Chicago, Généanet / forum — chacun en note et en bibliographie.
 *  - « ❝ » sur chaque source d'une fiche (et d'un événement) : la fenêtre « Citer » avec « 📋 Copier » pour chaque style ;
 *  - « ❝ » en tête du bloc « Sources & citations » : toutes les citations de la fiche dans un style, « 📋 Copier tout »,
 *    « ⤓ Exporter en texte », « 🖨 Imprimer » (fenêtre Imprimer unique) ;
 *  - mise en page (heritage-layout.js, « 📚 Citer une source ») : menu « Style » qui écrit la note et la bibliographie ;
 *  - ext.citations : {STYLES, load(params), preferred(), setPreferred(k), copy(text)}.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => A().escapeHtml(v ?? '');
    const STYLES = {fr: 'Classique (à la française)', ee: 'Evidence Explained', chicago: 'Chicago', forum: 'Généanet / forum'};
    const PREF = 'lcnda-cite-style';
    const preferred = () => { try { const v = localStorage.getItem(PREF); return STYLES[v] ? v : 'fr'; } catch (_) { return 'fr'; } };
    const setPreferred = k => { try { if (STYLES[k]) localStorage.setItem(PREF, k); } catch (_) {} };
    const load = params => A().api('source_citations', params);

    async function copy(text, what = 'Citation copiée.') {
        const t = String(text || '');
        try { await navigator.clipboard.writeText(t); A().toast(what, 'success'); return true; }
        catch (_) {
            const ta = Object.assign(document.createElement('textarea'), {value: t}); ta.style.cssText = 'position:fixed;left:-9999px'; document.body.appendChild(ta); ta.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (__) {} ta.remove();
            A().toast(ok ? what : 'Copie impossible : sélectionne le texte à la main.', ok ? 'success' : 'error'); return ok;
        }
    }

    /** Un style : nom, note, bibliographie, chacun avec « 📋 Copier ». */
    const styleBlock = (key, st, pref) => `<section class="h-cite-style${key === pref ? ' is-pref' : ''}" data-cite-style="${key}"><header><strong>${esc(st.label || STYLES[key])}</strong>${key === pref ? ` ${UI().badge('Mon style', 'blue')}` : `<button type="button" class="button small secondary" data-cite-pref="${key}" title="Le mettre en premier partout (mise en page, exports)">⭐ Mon style</button>`}</header>
        <div class="h-cite-line"><span class="h-cite-k">Note</span><p class="h-cite-text" data-cite-text>${esc(st.note)}</p><button type="button" class="button small secondary" data-cite-copy="${esc(st.note)}">📋 Copier</button></div>
        ${st.biblio && st.biblio !== st.note ? `<div class="h-cite-line"><span class="h-cite-k">Bibliographie</span><p class="h-cite-text">${esc(st.biblio)}</p><button type="button" class="button small secondary" data-cite-copy="${esc(st.biblio)}" data-cite-msg="Entrée de bibliographie copiée.">📋 Copier</button></div>` : ''}</section>`;

    /** La fenêtre « ❝ Citer » d'une source (ou d'une citation précise). */
    async function openCite({sourceId = 0, linkId = 0} = {}) {
        let data;
        try { data = await load(linkId ? {link_id: linkId} : {source_id: sourceId, only: 1}); } catch (e) { A().toast(e.message || 'Citation impossible.', 'error'); return; }
        const it = data.items?.[0]; if (!it) return;
        const draw = dlg => {
            const pref = preferred();
            const order = [pref, ...Object.keys(STYLES).filter(k => k !== pref)];
            dlg.querySelector('[data-cite-body]').innerHTML = order.map(k => styleBlock(k, it.styles[k] || {}, pref)).join('');
        };
        ext.openDialog({eyebrow: 'CITATION TOUTE PRÊTE', title: `❝ Citer « ${it.title} »`, wide: true,
            body: `${it.where ? `<p class="muted">Pour : ${esc(it.where)}</p>` : ''}<p class="muted">La même source écrite dans quatre styles : copie celui qu’il te faut (un livre, un article, un message sur Geneanet ou un forum).</p><div class="h-cite-styles" data-cite-body></div>`,
            onOpen: dlg => {
                draw(dlg);
                dlg.addEventListener('click', e => {
                    const p = e.target.closest('[data-cite-pref]'); if (p) { setPreferred(p.dataset.citePref); draw(dlg); A().toast(`« ${STYLES[p.dataset.citePref]} » est maintenant ton style.`, 'success'); }
                });
            }});
    }

    /** Toutes les citations d'une fiche dans un style : copier, exporter, imprimer. */
    async function openAll(personId) {
        let data;
        try { data = await load({person_id: personId}); } catch (e) { A().toast(e.message || 'Chargement impossible.', 'error'); return; }
        const items = data.items || [];
        const name = A().$('.person-page .person-hero h2')?.textContent?.trim() || A().state.currentPerson?.person?.first_name || 'cette fiche';
        let style = preferred(), what = 'note';
        const lines = () => {
            const seen = new Set();
            const list = items.map(it => (it.styles[style] || {})[what] || '').filter(t => t && !seen.has(t) && seen.add(t));
            return what === 'biblio' ? list.sort((a, b) => a.localeCompare(b, 'fr', {sensitivity: 'base'})) : list;
        };
        const textAll = () => lines().map((t, i) => (what === 'note' ? `${i + 1}. ${t}` : t)).join('\n');
        ext.openDialog({eyebrow: 'SOURCES DE LA FICHE', title: `❝ Les citations de ${name}`, wide: true,
            body: `<div class="h-cite-bar"><label>Style<select data-cite-all-style>${Object.entries(STYLES).map(([k, l]) => `<option value="${k}"${k === style ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <div class="ui-filters" role="group" aria-label="Forme"><button type="button" class="is-active" data-cite-what="note">Notes (${items.length})</button><button type="button" data-cite-what="biblio">Bibliographie</button></div>
                <span class="h-cite-sp"></span><button type="button" class="button small secondary" data-cite-all-copy>📋 Copier tout</button><button type="button" class="button small secondary" data-cite-all-txt>⤓ Exporter en texte</button><button type="button" class="button small secondary" data-cite-all-print>🖨 Imprimer</button></div>
                <ol class="h-cite-all" data-cite-all></ol>`,
            onOpen: dlg => {
                const paint = () => {
                    const l = lines(); const box = dlg.querySelector('[data-cite-all]');
                    box.classList.toggle('is-biblio', what === 'biblio');
                    box.innerHTML = l.length ? l.map(t => `<li><span>${esc(t)}</span><button type="button" class="icon-button small" data-cite-copy="${esc(t)}" title="📋 Copier" aria-label="Copier">📋</button></li>`).join('') : `<li class="empty-line"><span class="empty-line-ico" aria-hidden="true">📚</span><span class="empty-line-text">Aucune source citée sur cette fiche.</span></li>`;
                };
                paint();
                dlg.querySelector('[data-cite-all-style]').addEventListener('change', e => { style = e.target.value; setPreferred(style); paint(); });
                dlg.querySelectorAll('[data-cite-what]').forEach(b => b.addEventListener('click', () => { what = b.dataset.citeWhat; dlg.querySelectorAll('[data-cite-what]').forEach(x => x.classList.toggle('is-active', x === b)); paint(); }));
                dlg.querySelector('[data-cite-all-copy]').addEventListener('click', () => copy(textAll(), 'Citations copiées.'));
                dlg.querySelector('[data-cite-all-txt]').addEventListener('click', () => {
                    const blob = new Blob([textAll() + '\n'], {type: 'text/plain;charset=utf-8'});
                    const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(blob), download: `${A().safeExportFilename ? A().safeExportFilename(`sources-${name}`) : 'sources'}.txt`});
                    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
                    A().toast('Citations exportées en texte.');
                });
                dlg.querySelector('[data-cite-all-print]').addEventListener('click', () => {
                    const l = lines();
                    const html = `<h1>${esc(what === 'biblio' ? 'Bibliographie' : 'Sources')} — ${esc(name)}</h1><p style="color:#555">${esc(STYLES[style])}</p>${what === 'biblio' ? l.map(t => `<p style="padding-left:1.5em;text-indent:-1.5em;margin:.3em 0">${esc(t)}</p>`).join('') : `<ol>${l.map(t => `<li style="margin:.3em 0">${esc(t)}</li>`).join('')}</ol>`}`;
                    if (UI()?.openPrintDialog) UI().openPrintDialog({title: `Sources — ${name}`, html}); else A().toast('Impression indisponible.', 'error');
                });
            }});
    }

    document.addEventListener('click', e => {
        const c = e.target.closest?.('[data-cite-copy]');
        if (c) { e.preventDefault(); copy(c.dataset.citeCopy, c.dataset.citeMsg || 'Citation copiée.'); return; }
        const s = e.target.closest?.('[data-cite-source]');
        if (s) { e.preventDefault(); openCite({sourceId: Number(s.dataset.citeSource) || 0, linkId: Number(s.dataset.citeLink) || 0}); return; }
        const p = e.target.closest?.('[data-cite-person]');
        if (p) { e.preventDefault(); openAll(Number(p.dataset.citePerson)); }
    });

    ext.citations = {STYLES, load, preferred, setPreferred, copy, open: openCite, openAll};
})();
