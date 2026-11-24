/* LCNDA — ➕ Recueils, les idées en plus (maquette docs/design/registres-etat-fonds.html, partie 9 ; serveur : lib/recueil_plus.php).
 *  - 👥 « Confier à… » : des pages confiées à quelqu'un (une association qui se répartit un registre) ; « Pages de : … » dans l'onglet État ;
 *  - 📈 l'avancement dans le temps : la courbe (transcrites, relues), l'estimation « au rythme des 30 derniers jours, fini vers… »,
 *    l'objectif (« fini pour le … » : en avance, en retard) ;
 *  - 📤 l'export EAD de la vue des fonds (le format des inventaires d'archives) ;
 *  - 🌍 « Page à partager » : un fichier HTML seul (fiche, état, sommaire qu'on ouvre et ferme, ce qu'on y trouve), à envoyer ou à poser sur un site.
 *   ext.recueilPlus.assign(ctx, pages) · progress(el, ctx) · ead(serviceId) · share(ctx)
 * Essai : tests/test-recueil-plus.js.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const T = (k, v) => (window.LCNDA_I18N?.t ? window.LCNDA_I18N.t(k, v) : String(k).replace(/\{(\w+)\}/g, (_, x) => v?.[x] ?? ''));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const plural = (n, one, many) => (A()?.plural ? A().plural(n, one, many) : `${n} ${n > 1 ? many : one}`);
    const fmtDate = iso => { try { return new Date(`${iso}T12:00:00`).toLocaleDateString(window.LCNDA_I18N?.lang || 'fr', {day: 'numeric', month: 'long', year: 'numeric'}); } catch (_) { return iso; } };
    const download = (text, name, type) => { const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(new Blob([text], {type})), download: name}); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
    const fname = s => (A().safeExportFilename ? A().safeExportFilename(s) : String(s).replace(/[^\w-]+/g, '-'));

    /* ─── 👥 confier des pages ─── */
    function assign(ctx, pages) {
        const D = ctx.D(), names = [...new Set(D.pages.map(p => p.assignee).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
        const cur = pages.length && pages.every(p => p.assignee === pages[0].assignee) ? pages[0].assignee : '';
        ext.openDialog({eyebrow: T('🗂 ÉTAT DU RECUEIL'), title: pages.length > 1 ? T('Confier {n} pages', {n: String(pages.length)}) : T('Confier la page'), submitLabel: T('Confier'),
            body: `<label class="re-field">${esc(T('À qui ? (vide : à personne)'))}<input name="assignee" list="rp-names" maxlength="80" value="${esc(cur)}" placeholder="${esc(T('ex. Marie'))}"></label>
                <datalist id="rp-names">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist><p class="muted">${esc(T('Pour se répartir un registre : chacun voit ses pages avec « Pages de : … » dans l’onglet État.'))}</p>`,
            onSubmit: async form => {
                const who = String(new FormData(form).get('assignee') || '').trim();
                await ext.recueilEtat.setPages(ctx, pages, {assignee: who}, {msg: who ? T('{p} confiées à {w}', {p: plural(pages.length, 'page', 'pages'), w: who}) : T('{p} confiées à personne', {p: plural(pages.length, 'page', 'pages')})});
                await ctx.reload(); return true;
            }});
    }

    /* ─── 📈 l'avancement dans le temps ─── */
    function estimate(points, goal) {
        const last = points.at(-1); if (!last) return {};
        const left = Math.max(0, last.live - last.rel);
        const day = d => new Date(`${d}T12:00:00`).getTime() / 864e5;
        const ref = [...points].reverse().find(p => day(last.day) - day(p.day) >= 30) || points[0];
        const days = day(last.day) - day(ref.day), done = last.rel - ref.rel;
        const rate = days >= 1 ? done / days : 0; // pages relues par jour
        const end = left === 0 ? null : rate > 0 ? new Date((day(last.day) + left / rate) * 864e5).toISOString().slice(0, 10) : '';
        let vs = '';
        if (goal && left > 0) vs = end && end <= goal ? 'ahead' : 'late';
        return {left, rate, end, days, vs};
    }
    async function progress(el, ctx) {
        if (!el) return;
        const D = ctx.D(); let pts = [];
        try { pts = (await A().api('recueil_progress', {id: D.recueil.id})).points || []; } catch (_) { el.hidden = true; return; }
        if (!el.isConnected) return;
        const goal = D.recueil.goal_date || '', e = estimate(pts, goal);
        const W = 320, H = 70, pad = 4, n = pts.length;
        const xy = (i, v, max) => `${pad + (n > 1 ? i / (n - 1) : 0) * (W - 2 * pad)},${H - pad - (max ? v / max : 0) * (H - 2 * pad)}`;
        const line = k => pts.map((p, i) => xy(i, p.live ? p[k] / p.live * 100 : 0, 100)).join(' ');
        const chart = n >= 2 ? `<svg class="rp-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T('Avancement du {a} au {b}', {a: fmtDate(pts[0].day), b: fmtDate(pts.at(-1).day)}))}"><polyline points="${line('tr')}" class="rp-tr"/><polyline points="${line('rel')}" class="rp-rel"/></svg>
            <div class="rp-legend"><span><i class="rp-tr"></i>${esc(T('transcrites'))}</span><span><i class="rp-rel"></i>${esc(T('relues ou finies'))}</span><span class="muted">${esc(fmtDate(pts[0].day))} → ${esc(fmtDate(pts.at(-1).day))}</span></div>` : '';
        const msg = e.left === 0 ? `✓ ${T('Tout est relu ou fini.')}`
            : e.end ? T('Au rythme actuel ({r} pages relues par semaine), fini vers le {d}.', {r: String(Math.round(e.rate * 7 * 10) / 10), d: fmtDate(e.end)})
            : n >= 2 ? T('Pas encore de pages relues sur la période : pas d’estimation.') : T('Pas assez de recul : l’app note l’avancement chaque jour où tu ouvres le recueil.');
        el.hidden = false;
        el.innerHTML = `<h3>📈 ${esc(T('Avancement'))}</h3>${chart}<p class="rp-msg">${esc(msg)}</p>
            ${goal ? `<p class="rp-goal ${e.vs === 'late' ? 'is-late' : e.vs === 'ahead' ? 'is-ok' : ''}">🎯 ${esc(T('Objectif : fini pour le {d}', {d: fmtDate(goal)}))}${e.vs === 'late' ? ` — ${esc(T('à ce rythme, en retard'))}` : e.vs === 'ahead' ? ` — ${esc(T('en avance'))}` : ''}</p>` : ''}`;
    }

    /* ─── 📤 EAD ─── */
    async function ead(serviceId = 0) {
        try {
            const r = await A().api('recueils_ead', serviceId ? {service: serviceId} : {});
            download(r.xml, fname(T('État des fonds')) + '.xml', 'application/xml;charset=utf-8');
            A().toast(T('Inventaire EAD : {n}', {n: plural(r.recueils, 'recueil', 'recueils')}));
        } catch (e) { A().toast(e.message, 'error'); }
    }

    /* ─── 🌍 la page à partager ─── */
    async function share(ctx) {
        const D = ctx.D(), r = D.recueil;
        let toc = [], sens = null;
        try { toc = (await A().api('recueil_toc', {id: r.id})).items || []; } catch (_) {}
        try { sens = await A().api('recueil_sens', {id: r.id}); } catch (_) {}
        const c = D.etat || {}, live = (c.todo || 0) + (c.doing || 0) + (c.checked || 0) + (c.done || 0);
        const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
        const cls = p => (p.absent === 'blanche' ? 'b' : p.absent ? 'x' : {done: 'f', checked: 'r', doing: 'c'}[p.state] || 't');
        const tip = p => `${p.label || p.num}${p.absent ? ' · ' + T('absente') : ''}`;
        const comm = r.communicability || {};
        const where = [r.service ? r.service.name : r.place_text, r.fonds, r.series, r.reference].filter(Boolean).join(' · ');
        // le sommaire en <details> : on l'ouvre et on le ferme sans programme
        let tree = '', depth = 0;
        toc.forEach((t, i) => {
            while (depth >= t.level) { tree += '</details>'; depth--; }
            const next = toc[i + 1], kids = next && next.level > t.level;
            const rng = t.from_num ? `${T('p.')} ${t.from_num}${t.to_num && t.to_num !== t.from_num ? '–' + t.to_num : ''}` : '';
            const head = `<span class="g">${esc(rng)}</span> ${t.kind === 'element' ? `<i>${esc(t.title)}</i>` : `<b>${esc(t.title)}</b>`}`;
            if (kids) { tree += `<details open><summary>${head}</summary>${t.note ? `<p class="n">${esc(t.note)}</p>` : ''}`; depth = t.level; }
            else tree += `<div class="l">${head}${t.note ? `<p class="n">${esc(t.note)}</p>` : ''}</div>`;
        });
        while (depth-- > 0) tree += '</details>';
        const found = sens && sens.acts ? `<h2>💡 ${esc(T('Ce qu’on y trouve'))}</h2><ul>${[
            [T('Actes transcrits'), sens.acts], [T('Années couvertes'), sens.years.length ? `${sens.years[0]}–${sens.years[1]}` : ''],
            [T('Sortes d’actes'), Object.entries(sens.kinds).map(([k, n]) => `${n} ${ext.actKindLabel ? ext.actKindLabel(k) : k}`).join(' · ')],
            [T('Noms les plus fréquents'), Object.entries(sens.names).slice(0, 8).map(([k, n]) => `${k} (${n})`).join(' · ')],
            [T('Lieux'), Object.entries(sens.places).slice(0, 8).map(([k, n]) => `${k} (${n})`).join(' · ')]].filter(x => x[1] !== '' && x[1] != null).map(([k, v]) => `<li><b>${esc(k)}</b> : ${esc(v)}</li>`).join('')}</ul>` : '';
        const html = `<!doctype html><html lang="${esc(window.LCNDA_I18N?.lang || 'fr')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(r.title)}</title>
<style>body{font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;max-width:900px;margin:0 auto;padding:20px;color:#111}h1{font-size:24px;margin:0}h2{font-size:18px;margin:26px 0 8px;border-top:2px solid #111;padding-top:10px}.m{color:#555}.k{display:flex;flex-wrap:wrap;gap:8px}.k div{border:2px solid #111;padding:6px 10px}.k b{display:block;font-size:20px}.g{color:#666;font-size:13px}.map{display:flex;flex-wrap:wrap;gap:3px}.map span{width:26px;height:32px;border:1.5px solid #c9ced8;font:700 10px system-ui;display:flex;align-items:flex-end;justify-content:center}.f{background:#eaf6ee;border-color:#1a7f37!important}.r{background:#e3eeff;border-color:#055dff!important}.c{background:#fff8d6;border-color:#d4a800!important}.x{background:repeating-linear-gradient(135deg,#fdecec 0 4px,#fff 4px 8px);border-style:dashed!important;border-color:#c62828!important}.b{border-style:dotted!important}details{margin-left:14px}summary{cursor:pointer;padding:3px 0}.l{margin-left:28px;padding:3px 0}.n{margin:0 0 4px 28px;font-size:13.5px;color:#333}footer{margin-top:30px;font-size:12px;color:#777}@media print{details{display:block}}</style></head><body>
<h1>${esc(r.icon || '📚')} ${esc(r.title)}</h1><p class="m">${esc([where, r.date_text].filter(Boolean).join(' · '))}</p>
${comm.state ? `<p>${comm.state === 'free' ? '✓ ' + esc(T('Communicable')) : comm.state === 'reserved' ? '🔒 ' + esc(comm.until ? T('Réservé jusqu’en {y}', {y: comm.until}) : T('Réservé')) : comm.state === 'authorization' ? '🔐 ' + esc(T('Sur autorisation')) : ''}</p>` : ''}
${r.url ? `<p><a href="${esc(r.url)}">${esc(T('Consulter en ligne'))} ↗</a></p>` : ''}
<h2>🗂 ${esc(T('État du recueil'))}</h2><div class="k"><div><b>${D.pages.length}</b>${esc(T('pages'))}</div><div><b>${pct((c.doing || 0) + (c.checked || 0) + (c.done || 0), live)} %</b>${esc(T('transcrites'))}</div><div><b>${pct((c.checked || 0) + (c.done || 0), live)} %</b>${esc(T('relues ou finies'))}</div><div><b>${c.absent || 0}</b>${esc(T('absentes'))}</div></div>
<p class="map">${D.pages.map(p => `<span class="${cls(p)}" title="${esc(tip(p))}">${p.num}</span>`).join('')}</p>
${toc.length ? `<h2>📑 ${esc(T('Sommaire'))}</h2>${tree}` : ''}${found}
<footer>${esc(T('Fait avec LCNDA le {d}.', {d: fmtDate(new Date().toISOString().slice(0, 10))}))}</footer></body></html>`;
        download(html, fname(r.title) + '.html', 'text/html;charset=utf-8');
        A().toast(T('Page à partager enregistrée : un seul fichier, qui s’ouvre dans n’importe quel navigateur.'));
    }
    ext.recueilPlus = {assign, progress, ead, share, estimate};
})();
