/**
 * ✨ Trésors — papiers et outils (lot 6) :
 *  - 🛂 Les passeports intérieurs (Garder la mémoire) : le passeport qu'il fallait pour voyager en France (1792-1860 environ), avec son
 *    signalement (taille, cheveux, yeux, nez, menton, teint, signes particuliers…) ; un portrait-robot dessiné d'après le signalement ;
 *    un bloc sur la fiche ; l'import d'un relevé (XML, tableur XML ou CSV — par exemple les passeports intérieurs de Saint-Brieuc
 *    1830-1839, Archives municipales, data.gouv.fr, licence CC BY-SA) et le rapprochement avec les fiches de l'arbre.
 *  - 👵 Grand-parent raconte (Outils) : un récit (dicté ou collé) ; l'application y repère naissances, mariages, décès, métiers,
 *    domiciles, les compare à l'arbre (« le récit dit 1878, l'arbre 1877 ») et propose d'ajouter ce qui manque, après accord.
 *  - ⚠️ La cohérence en direct (dans la fenêtre d'un événement) : en plus des vérifications de dates déjà faites par l'application,
 *    les frères et sœurs nés à moins de neuf mois d'écart, le mariage après la mort du conjoint, un lieu à plus de 300 km la même année.
 *  - 🔗 Le partage temporaire d'une branche (Outils) : un fichier HTML autonome (sans les vivants), protégé par un mot de passe
 *    (chiffrement AES) et qui refuse de s'ouvrir après la date choisie.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const F = ext.tresorFeatures = ext.tresorFeatures || [];
    const A = () => window.LCNDA_APP;
    const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

    /* ── 🛂 Les passeports intérieurs ── */
    const SIG = [['age', 'Âge'], ['taille', 'Taille'], ['cheveux', 'Cheveux'], ['sourcils', 'Sourcils'], ['front', 'Front'], ['yeux', 'Yeux'], ['nez', 'Nez'], ['bouche', 'Bouche'], ['barbe', 'Barbe'], ['menton', 'Menton'], ['visage', 'Visage'], ['teint', 'Teint'], ['signes', 'Signes particuliers']];
    const PAPER = [['date', 'Date de délivrance'], ['commune', 'Délivré à'], ['destination', 'Destination'], ['motif', 'Motif du voyage'], ['profession', 'Profession'], ['domicile', 'Domicile'], ['naissance', 'Lieu de naissance'], ['cote', 'Source, cote']];
    /** la taille en centimètres : « 1 m 65 », « 1,65 », « 1 mètre 650 millimètres », « 5 pieds 2 pouces » */
    function heightCm(s) {
        const t = fold(s).replace(',', '.'); let m;
        if ((m = t.match(/(\d)\s*pieds?\s*(\d{1,2})?\s*(?:pouces?)?\s*(\d{1,2})?/))) return Math.round(Number(m[1]) * 32.48 + Number(m[2] || 0) * 2.707 + Number(m[3] || 0) * 0.2256);
        if ((m = t.match(/(\d)\s*(?:m|metres?|mètres?)\.?\s*(\d{1,3})/))) { const r = m[2]; return Math.round(Number(m[1]) * 100 + (r.length === 3 ? Number(r) / 10 : r.length === 1 ? Number(r) * 10 : Number(r))); }
        if ((m = t.match(/\b(1[.]\d{1,2})\b/))) return Math.round(Number(m[1]) * 100);
        if ((m = t.match(/\b(1[3-9]\d)\b/))) return Number(m[1]);
        return null;
    }
    const pickCol = (t, map, def) => { for (const [re, v] of map) if (re.test(t)) return v; return def; };
    /** le portrait-robot d'après le signalement (un dessin, pas une ressemblance) */
    function robotSvg(d = {}) {
        const f = k => fold(d[k]);
        const hair = pickCol(f('cheveux'), [[/blanc/, '#e8e8e8'], [/gris/, '#9a9a9a'], [/roux|rouge/, '#b5532a'], [/blond/, '#d9b65c'], [/chatain clair/, '#8a6239'], [/chatain/, '#6b4626'], [/brun/, '#3f2a1a'], [/noir/, '#1a1a1a']], '#5a3d25');
        const brow = d.sourcils ? pickCol(f('sourcils'), [[/blanc/, '#d0d0d0'], [/gris/, '#888'], [/roux/, '#a0471f'], [/blond/, '#c9a650'], [/chatain/, '#5c3b20'], [/brun|noir/, '#1f150d']], hair) : hair;
        const eye = pickCol(f('yeux'), [[/bleu/, '#4a7fc0'], [/gris/, '#8a96a0'], [/vert/, '#5f8a4f'], [/roux|fauve/, '#8a5a2b'], [/brun|marron|chatain/, '#5a3a20'], [/noir/, '#1d1410']], '#6a5040');
        const skin = pickCol(f('teint'), [[/pale|blanc/, '#f6e2d2'], [/colore|rouge/, '#eab69c'], [/brun|basane|bistre/, '#c8946c'], [/clair/, '#f2d6c0']], '#ecc7ac');
        const vis = f('visage'), rx = /rond|plein/.test(vis) ? 62 : /long|maigre/.test(vis) ? 48 : /carre/.test(vis) ? 58 : 54, ry = /long/.test(vis) ? 80 : /rond/.test(vis) ? 66 : 72;
        const chin = f('menton'), chinPath = /pointu/.test(chin) ? `M${100 - rx * 0.5} 160 Q100 ${110 + ry + 12} ${100 + rx * 0.5} 160` : /carre/.test(chin) ? `M${100 - rx * 0.7} 150 L${100 - rx * 0.45} ${100 + ry} L${100 + rx * 0.45} ${100 + ry} L${100 + rx * 0.7} 150` : '';
        const nose = f('nez'), nosePath = /aquilin|busque/.test(nose) ? 'M100 92 Q110 112 104 124 Q100 128 95 125' : /retrousse/.test(nose) ? 'M99 96 Q102 116 108 120 Q101 126 94 122' : /gros|epate|large/.test(nose) ? 'M100 94 L101 116 Q112 124 100 128 Q88 124 99 116' : /long/.test(nose) ? 'M100 90 L102 128 Q100 132 95 129' : 'M100 96 L101 118 Q100 124 95 121';
        const mouth = f('bouche'), mw = /grande/.test(mouth) ? 22 : /petite/.test(mouth) ? 11 : 16;
        const beard = f('barbe'), hasBeard = beard && !/(^|\s)(sans|naissante|nulle|rase|imberbe|-)/.test(beard) && beard !== 'non', beardCol = hasBeard ? pickCol(beard, [[/blanc/, '#e0e0e0'], [/gris/, '#999'], [/roux/, '#a0471f'], [/blond/, '#c9a650'], [/chatain/, '#5c3b20'], [/brun|noir/, '#22170e']], hair) : null;
        const front = f('front'), top = /haut|decouvert|degarni/.test(front) ? 46 : /bas/.test(front) ? 60 : 52;
        const marks = f('signes'), scar = /cicatrice|balafre/.test(marks), mole = /grain|tache|verrue|signe/.test(marks), pox = /variol|petite verole|grele/.test(marks);
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 230" class="h-tr-robot"><rect width="200" height="230" fill="#f4ecd8"/>
            <path d="M${100 - rx - 6} 120 Q${100 - rx - 10} ${top - 30} 100 ${top - 34} Q${100 + rx + 10} ${top - 30} ${100 + rx + 6} 120 L${100 + rx} 96 Q100 ${top - 4} ${100 - rx} 96Z" fill="${hair}"/>
            <ellipse cx="100" cy="112" rx="${rx}" ry="${ry}" fill="${skin}" stroke="#7a5a40" stroke-width="1.2"/>${chinPath ? `<path d="${chinPath}" fill="none" stroke="#7a5a40" stroke-width="1.2"/>` : ''}
            <path d="M${100 - rx + 4} ${top + 18} Q100 ${top - 8} ${100 + rx - 4} ${top + 18} L${100 + rx + 2} ${top - 4} Q100 ${top - 36} ${100 - rx - 2} ${top - 4}Z" fill="${hair}"/>
            <path d="M74 86 q10 -6 20 0 M106 86 q10 -6 20 0" stroke="${brow}" stroke-width="4" fill="none" stroke-linecap="round"/>
            ${[84, 116].map(x => `<ellipse cx="${x}" cy="98" rx="9" ry="5.5" fill="#fff"/><circle cx="${x}" cy="98" r="3.8" fill="${eye}"/><circle cx="${x}" cy="98" r="1.5" fill="#111"/>`).join('')}
            <path d="${nosePath}" fill="none" stroke="#7a5a40" stroke-width="1.6" stroke-linecap="round"/>
            ${hasBeard ? `<path d="M${100 - rx + 2} 120 Q${100 - rx + 6} ${100 + ry + 18} 100 ${100 + ry + 22} Q${100 + rx - 6} ${100 + ry + 18} ${100 + rx - 2} 120 Q${100 + rx - 14} 150 ${100 + mw + 8} 136 Q100 132 ${100 - mw - 8} 136 Q${100 - rx + 14} 150 ${100 - rx + 2} 120Z" fill="${beardCol}" opacity=".92"/>` : ''}
            <path d="M${100 - mw} 142 Q100 ${148 + mw / 6} ${100 + mw} 142" fill="none" stroke="#9a4a3a" stroke-width="2.4" stroke-linecap="round"/>
            ${scar ? '<path d="M120 112 l14 14" stroke="#8a3a2a" stroke-width="2"/>' : ''}${mole ? '<circle cx="78" cy="128" r="2.6" fill="#4a2a1a"/>' : ''}${pox ? [[80, 116], [118, 124], [90, 132], [112, 108], [76, 106]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="#b88870"/>`).join('') : ''}</svg>`;
    }
    const passportFields = (T, d = {}) => `<div class="form-grid">${PAPER.map(([k, l]) => `<label${k === 'cote' ? ' class="span-2"' : ''}>${T.esc(l)}<input name="${k}" maxlength="200" value="${T.esc(d[k] || '')}"></label>`).join('')}
        <h4 class="span-2" style="margin:8px 0 0">Le signalement</h4>${SIG.map(([k, l]) => `<label${k === 'signes' ? ' class="span-2"' : ''}>${T.esc(l)}<input name="${k}" maxlength="200" value="${T.esc(d[k] || '')}" placeholder="${{taille: '1 m 65', cheveux: 'châtains', yeux: 'gris', nez: 'aquilin', menton: 'rond', visage: 'ovale', teint: 'coloré', barbe: 'brune', signes: 'cicatrice au front'}[k] || ''}"></label>`).join('')}</div>`;
    function editPassport(T, it, pid, after) {
        ext.openDialog({eyebrow: 'PASSEPORT INTÉRIEUR', title: it ? '🛂 Le passeport' : '🛂 Nouveau passeport', wide: true, submitLabel: 'Enregistrer',
            body: `<div class="h-tr-pp-edit"><div><div><span class="pk-lab">Le voyageur</span>${T.personField('who', it?.person_id || pid || null)}</div>${passportFields(T, it?.data)}</div><div data-pp-robot>${robotSvg(it?.data)}</div></div>`,
            onOpen: d => d.addEventListener('input', () => { const f = d.querySelector('form') || d, data = Object.fromEntries([...SIG, ...PAPER].map(([k]) => [k, f.querySelector(`[name=${k}]`)?.value || ''])); d.querySelector('[data-pp-robot]').innerHTML = robotSvg(data); }),
            onSubmit: async form => { const pidv = Number(form.elements.who.value) || 0; if (!pidv) { T.toast('Choisis le voyageur.', 'error'); return false; }
                const data = {...(it?.data || {}), ...Object.fromEntries([...SIG, ...PAPER].map(([k]) => [k, form.elements[k].value.trim()]))}, tr = await T.tree();
                await T.save({id: it?.id, kind: 'passport', person_id: pidv, title: `Passeport de ${T.name(tr.byId.get(pidv))}${data.date ? ` (${data.date})` : ''}`, body: '', data}); T.toast('Passeport enregistré.', 'success'); after?.(); }});
    }
    const passportCard = (T, tr, x) => { const d = x.data || {}, p = tr.byId.get(x.person_id), cm = heightCm(d.taille);
        return `<article class="h-tr-pp"><div class="h-tr-pp-robot">${robotSvg(d)}${cm ? `<small>${cm} cm</small>` : ''}</div><div class="h-tr-pp-txt"><b>🛂 ${T.esc(p ? T.name(p) : x.title)}</b>${d.date || d.commune ? `<small>Délivré${d.commune ? ` à ${T.esc(d.commune)}` : ''}${d.date ? ` le ${T.esc(d.date)}` : ''}</small>` : ''}
            ${d.destination || d.motif ? `<p>${d.destination ? `pour <b>${T.esc(d.destination)}</b>` : ''}${d.motif ? ` — ${T.esc(d.motif)}` : ''}</p>` : ''}<dl>${[...SIG, ['profession', 'Profession'], ['domicile', 'Domicile'], ['naissance', 'Né à']].filter(([k]) => d[k]).map(([k, l]) => `<dt>${T.esc(l)}</dt><dd>${T.esc(d[k])}</dd>`).join('')}</dl>${d.cote ? `<small class="h-tr-muted">${T.esc(d.cote)}</small>` : ''}</div></article>`; };

    /* l'import d'un relevé : XML (enregistrements répétés), tableur XML (Excel 2003) ou CSV */
    const COLS = [['nom', /^(nom|name|patronyme|surname)/], ['prenom', /^(pre ?noms?|first|given)/], ['age', /^age/], ['taille', /taille|stature/], ['cheveux', /cheveu/], ['sourcils', /sourcil/], ['front', /^front/], ['yeux', /^yeux|oeil|eye/], ['nez', /^nez/], ['bouche', /bouche/], ['barbe', /barbe/], ['menton', /menton/], ['visage', /visage|figure/], ['teint', /teint/],
        ['signes', /signe|marque|particul/], ['profession', /profess|metier|qualite|etat/], ['domicile', /domicil|demeur|resid/], ['naissance', /naissance|natif|ne a|origine|lieu ?de ?nais/], ['destination', /destin|allant|se rendant|pour aller/], ['motif', /motif|objet|raison/], ['date', /^date|delivr/], ['cote', /cote|numero|^n[o°]|^id$|reference/]];
    const colOf = h => { const t = fold(h).replace(/[_\-.]/g, ' '); const c = COLS.find(([, re]) => re.test(t)); return c ? c[0] : null; };
    function parseRecords(text, name = '') {
        const rows = [];
        if (/^\s*</.test(text)) {
            const doc = new DOMParser().parseFromString(text, 'application/xml'); if (doc.querySelector('parsererror')) throw new Error('le fichier XML est abîmé');
            const xRows = [...doc.getElementsByTagNameNS('*', 'Row')];
            if (xRows.length > 1) { const cells = r => [...r.getElementsByTagNameNS('*', 'Cell')].map(c => c.textContent.trim()), head = cells(xRows[0]); xRows.slice(1).forEach(r => { const c = cells(r); rows.push(Object.fromEntries(head.map((h, i) => [h, c[i] || '']))); }); }
            else { const count = new Map(); doc.querySelectorAll('*').forEach(el => { if ([...el.children].length >= 3 && [...el.children].every(c => !c.children.length)) count.set(el.tagName, (count.get(el.tagName) || 0) + 1); });
                const tag = [...count].sort((a, b) => b[1] - a[1])[0]?.[0]; if (!tag) throw new Error('je ne trouve pas d’enregistrements répétés dans ce XML');
                doc.querySelectorAll(tag).forEach(el => { const o = {}; [...el.attributes].forEach(a => { o[a.name] = a.value; }); [...el.children].forEach(c => { o[c.tagName] = (o[c.tagName] ? o[c.tagName] + ' ; ' : '') + c.textContent.trim(); }); rows.push(o); }); }
        } else {
            const lines = text.split(/\r?\n/).filter(l => l.trim()), sep = [';', '\t', ','].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
            const split = l => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === sep && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(s => s.trim()); };
            const head = split(lines[0]); lines.slice(1).forEach(l => { const c = split(l); rows.push(Object.fromEntries(head.map((h, i) => [h, c[i] || '']))); });
        }
        const keys = [...new Set(rows.flatMap(r => Object.keys(r)))], map = Object.fromEntries(keys.map(k => [k, colOf(k)]));
        return {source: name, keys, map, records: rows.map(r => { const o = {autres: {}}; Object.entries(r).forEach(([k, v]) => { const c = map[k]; if (!v) return; if (c) o[c] = o[c] ? `${o[c]} ${v}` : v; else o.autres[k] = v; }); return o; }).filter(o => o.nom || o.prenom)};
    }
    /** les fiches de l'arbre qui peuvent correspondre à un relevé : même nom, même premier prénom, âge cohérent */
    function matches(T, tr, r) {
        const ln = fold(r.nom), fn = fold(r.prenom).split(/[\s,]+/)[0], yr = Number((String(r.date).match(/(1[6-9]\d\d)/) || [])[1]) || null, age = parseInt(r.age, 10) || null;
        return tr.people.filter(p => fold(p.last) === ln && (!fn || fold(p.first).split(/[\s,-]+/)[0] === fn)).map(p => ({p, ok: !(yr && age && p.by) || Math.abs(yr - age - p.by) <= 3})).sort((a, b) => b.ok - a.ok);
    }
    async function renderPassports(host, T) {
        const tr = await T.tree(); let imported = null, q = '';
        const draw = async () => {
            const list = await T.items('passport');
            host.innerHTML = `<div class="h-tr-row h-tr-noprint"><button type="button" class="button" data-pp-new>🛂 Ajouter un passeport</button><button type="button" class="button secondary" data-pp-imp>⤓ Importer un relevé (XML, CSV)…</button><span class="h-tr-muted">${list.length} passeport${list.length > 1 ? 's' : ''} rattaché${list.length > 1 ? 's' : ''}</span></div>
                <p class="h-tr-muted">De la Révolution au Second Empire, il fallait un passeport pour aller d’un département à l’autre ; il portait le <b>signalement</b> du voyageur, une description qui remplace souvent la photo qu’on n’a pas. Les relevés publiés (par exemple les passeports intérieurs de Saint-Brieuc, 1830-1839, sur data.gouv.fr) s’importent ici : télécharge le fichier, puis « Importer un relevé ».</p>
                ${imported ? `<div class="h-tr-panel"><div class="h-tr-row" style="justify-content:space-between"><b>📄 ${T.esc(imported.source)} : ${imported.records.length} passeports</b><button type="button" class="h-tr-link" data-pp-close>Fermer le relevé</button></div>
                    <p class="h-tr-muted">Colonnes reconnues : ${Object.entries(imported.map).filter(([, v]) => v).map(([k, v]) => `${T.esc(k)} → ${T.esc(v)}`).join(', ') || 'aucune'}${Object.values(imported.map).some(v => !v) ? ` · gardées telles quelles : ${Object.entries(imported.map).filter(([, v]) => !v).map(([k]) => T.esc(k)).join(', ')}` : ''}</p>
                    <label class="h-tr-row">Chercher<input type="search" data-pp-q value="${T.esc(q)}" placeholder="un nom, une commune, un métier…"></label>${importTable(T, tr, imported, q)}</div>` : ''}
                <div class="h-tr-body">${list.map(x => `<div class="h-tr-panel">${passportCard(T, tr, x)}<p class="h-tr-noprint"><button type="button" class="h-tr-link" data-pp-edit="${x.id}">Modifier</button> · <button type="button" class="h-tr-link" data-pp-del="${x.id}">Supprimer</button></p></div>`).join('')}</div>`;
            host.querySelector('[data-pp-q]')?.addEventListener('input', e => { q = e.target.value; const box = host.querySelector('[data-pp-table]'); if (box) box.outerHTML = importTable(T, tr, imported, q); });
        };
        host.addEventListener('click', async e => {
            if (e.target.closest('[data-pp-new]')) return editPassport(T, null, null, draw);
            if (e.target.closest('[data-pp-close]')) { imported = null; return draw(); }
            if (e.target.closest('[data-pp-imp]')) { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xml,.csv,.tsv,.txt'; inp.onchange = async () => { const f = inp.files[0]; if (!f) return; try { imported = parseRecords(await f.text(), f.name); ext.tresorPassports.last = imported; T.toast(`${imported.records.length} passeports lus.`, 'success'); } catch (err) { T.toast('Import impossible : ' + err.message, 'error'); } draw(); }; inp.click(); return; }
            const ed = e.target.closest('[data-pp-edit]'); if (ed) { const it = (await T.items('passport')).find(x => x.id === Number(ed.dataset.ppEdit)); return editPassport(T, it, null, draw); }
            const del = e.target.closest('[data-pp-del]'); if (del && await A().confirmBox('Le passeport sera effacé.', {title: 'Supprimer ?', okLabel: 'Supprimer', danger: true})) { await T.remove(Number(del.dataset.ppDel)); return draw(); }
            const at = e.target.closest('[data-pp-attach]'); if (at) { const [ri, pid] = at.dataset.ppAttach.split(':').map(Number), r = imported.records[ri], p = tr.byId.get(pid), {nom, prenom, autres, ...rest} = r;
                await T.save({kind: 'passport', person_id: pid, title: `Passeport de ${T.name(p)}${r.date ? ` (${r.date})` : ''}`, body: '', data: {...rest, cote: [r.cote, imported.source].filter(Boolean).join(' · '), releve: `${nom || ''} ${prenom || ''}`.trim(), autres}});
                T.toast(`Rattaché à ${T.name(p)}.`, 'success'); return draw(); }
        });
        await draw();
    }
    function importTable(T, tr, imp, q) {
        const s = fold(q), rows = imp.records.map((r, i) => ({r, i, m: matches(T, tr, r)})).filter(x => !s || fold(Object.values(x.r).join(' ')).includes(s)).sort((a, b) => b.m.length - a.m.length).slice(0, 200);
        return `<div data-pp-table><p class="h-tr-muted">${rows.filter(x => x.m.length).length} correspondance${rows.filter(x => x.m.length).length > 1 ? 's' : ''} possible${rows.filter(x => x.m.length).length > 1 ? 's' : ''} avec l’arbre (en tête) · ${rows.length} affiché${rows.length > 1 ? 's' : ''}</p><div class="h-tr-pp-table"><table><thead><tr><th>Nom</th><th>Âge</th><th>Profession</th><th>Signalement</th><th>Pour</th><th>Dans l’arbre</th></tr></thead><tbody>
            ${rows.map(({r, i, m}) => `<tr><td><b>${T.esc(r.nom || '')}</b> ${T.esc(r.prenom || '')}${r.date ? `<br><small>${T.esc(r.date)}</small>` : ''}</td><td>${T.esc(r.age || '')}</td><td>${T.esc(r.profession || '')}</td><td><small>${SIG.filter(([k]) => r[k] && k !== 'age').map(([k, l]) => `${l.toLowerCase()} ${T.esc(r[k])}`).join(', ')}</small></td><td>${T.esc(r.destination || '')}</td>
                <td>${m.map(x => `<button type="button" class="button small ${x.ok ? '' : 'secondary'}" data-pp-attach="${i}:${x.p.id}" title="${x.ok ? 'Le nom et l’âge concordent' : 'Le nom concorde, l’âge moins'}">→ ${T.esc(T.name(x.p))}${x.p.by ? ` (${x.p.by})` : ''}</button>`).join(' ') || '<small class="h-tr-muted">—</small>'}</td></tr>`).join('')}</tbody></table></div></div>`;
    }
    F.push({key: 'passeports', group: 'memoire', icon: '🛂', title: 'Les passeports intérieurs', desc: 'Le passeport et le signalement d’un ancêtre voyageur, son portrait-robot, et l’import des relevés publiés (Saint-Brieuc…).', render: renderPassports});
    ext.tresorPassports = {heightCm, robotSvg, parseRecords, matches};
    ext.personBlocks = ext.personBlocks || {};
    const readOnly = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('base-readonly');
    ext.personBlocks.passports = (index, detail, opts = {}) => { const pid = Number(detail?.person?.id); if (!pid || detail.person.kind === 'animal') return ''; return A().card(index, '🛂 Passeports intérieurs', '', `<div data-pp-block="${pid}"></div>`, 'span-12', readOnly() || opts.isLocked ? '' : `<button type="button" class="button small secondary" data-pp-add="${pid}">＋ Passeport</button>`); };
    const fillPP = async detail => { const pid = Number(detail?.person?.id), el = document.querySelector(`#workspace [data-pp-block="${pid}"]`); if (!el || !ext.tresors) return; const T = ext.tresors.T, [tr, list] = await Promise.all([T.tree(), T.items('passport', pid)]).catch(() => [null, []]);
        el.innerHTML = list.length ? list.map(x => passportCard(T, tr, x)).join('') : '<p class="muted">Aucun passeport. Avant 1860, pour voyager en France, il fallait un passeport intérieur avec son signalement : s’il en existe un, ajoute-le ici.</p>'; };
    ext.afterPerson = ext.afterPerson || []; ext.afterPerson.push(detail => { fillPP(detail); });
    document.addEventListener('click', e => { const b = e.target.closest('[data-pp-add]'); if (b && ext.tresors) editPassport(ext.tresors.T, null, Number(b.dataset.ppAdd), () => { const d = {person: {id: Number(b.dataset.ppAdd)}}; fillPP(d); }); });

    /* ── 👵 Grand-parent raconte ── */
    const MONTHS_RE = 'janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre';
    const MONTHS_L = MONTHS_RE.split('|');
    function dateIn(s) { const t = fold(s); let m;
        if ((m = t.match(new RegExp(`\\b(\\d{1,2})(?:er)? (${MONTHS_RE}) (\\d{4})\\b`)))) return {y: Number(m[3]), d: `${m[3]}-${String(MONTHS_L.indexOf(m[2]) + 1).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`, text: `${m[1]} ${m[2]} ${m[3]}`};
        if ((m = t.match(/\b(?:en|vers|annee|l'an) (\d{4})\b/) || t.match(/\b(1[6-9]\d\d|20[0-2]\d)\b/))) return {y: Number(m[1]), d: null, text: (t.includes('vers ' + m[1]) ? 'vers ' : '') + m[1]};
        return null; }
    const placeIn = s => { const m = s.match(/(?:^|\s)(?:à|a|au|en|de|dans) ((?:[A-ZÉÈÂÎ][\p{L}'’-]+)(?:[ -](?:sur|sous|en|la|le|les|de|du|des|d’|d')?[ -]?[A-ZÉÈ][\p{L}'’-]+)*)/u); return m && !/^(Noël|Pâques|Dieu|Monsieur|Madame)$/.test(m[1]) ? m[1].trim() : null; };
    /** les faits d'un récit : [{who: [ids], kin, tag, date, place, what, sentence}] */
    function storyFacts(T, tr, narratorId, text) {
        const me = tr.byId.get(narratorId), out = []; if (!me) return out;
        const gps = (g) => T.ancestors(tr, me.id, 2).filter(a => a.gen === 2).map(a => tr.byId.get(a.id)).filter(p => p && (!g || p.gender === g));
        const sib = () => [...new Set([me.father, me.mother].filter(Boolean).flatMap(x => tr.kids.get(x) || []))].filter(x => x !== me.id).map(x => tr.byId.get(x)).filter(Boolean);
        const spouses = () => (tr.fams.get(me.id) || []).map(f => tr.byId.get(f.a === me.id ? f.b : f.a)).filter(Boolean), kids = () => [...new Set(tr.kids.get(me.id) || [])].map(x => tr.byId.get(x)).filter(Boolean);
        const KIN = [[/\bmon (?:grand-pere|grand pere|pepe|papi)/, () => gps('male'), 'son grand-père'], [/\bma (?:grand-mere|grand mere|meme|mamie|memee)/, () => gps('female'), 'sa grand-mère'], [/\bmon pere|\bpapa\b/, () => [tr.byId.get(me.father)].filter(Boolean), 'son père'], [/\bma mere|\bmaman\b/, () => [tr.byId.get(me.mother)].filter(Boolean), 'sa mère'],
            [/\bmon (?:mari|epoux)|\bma (?:femme|epouse)/, spouses, 'son conjoint'], [/\bmon frere|\bma soeur/, sib, 'un frère ou une sœur'], [/\bmon fils|\bma fille/, kids, 'un enfant'], [/(^|\s)(je|j'|moi|on s'est|nous nous sommes)\b/, () => [me], 'le narrateur']];
        const family = [me, ...T.ancestors(tr, me.id, 4).map(a => tr.byId.get(a.id)), ...sib(), ...spouses(), ...kids()].filter(Boolean);
        text.split(/(?<=[.!?;\n])\s*/).map(s => s.trim()).filter(s => s.length > 6).forEach(sent => {
            const f = fold(sent).replace(/[’]/g, "'"); let who = null, kin = '';
            for (const [re, get, label] of KIN) if (re.test(f)) { who = get(); kin = label; break; }
            const named = family.filter(p => p.first && new RegExp(`\\b${fold(p.first).split(/[\s-]/)[0]}\\b`).test(f)); if (named.length && (!who || who.length > 1)) { who = who?.length ? who.filter(p => named.includes(p)) : named; if (!who.length) who = named; if (!kin) kin = 'nommé'; }
            if (!who?.length) return; const date = dateIn(sent), place = placeIn(sent), push = (tag, extra = {}) => out.push({who: who.map(p => p.id), kin, tag, date, place, sentence: sent, ...extra});
            if (/\b(ne|nee|naquit|suis ne|est ne)\b/.test(f) && !/\bne (pas|plus|jamais)\b/.test(f)) push('BIRT');
            if (/\b(mort|morte|decede|decedee|deces|disparu|disparue|parti trop tot)\b/.test(f)) push('DEAT');
            if (/\b(marie|mariee|maries|mariees|epouse|epouser|noces|mariage)\b/.test(f)) push('MARR');
            const occ = f.match(/\b(?:etait|travaillait comme|faisait le metier de|metier de|profession de|est devenu|etait devenue?)\s+(?:un |une |le |la )?([a-z][a-z' -]{2,28}?)(?=[,.;!?]| a | au | chez | dans | en | et | pendant | toute|$)/);
            if (occ && !/^(ne|nee|mort|morte|marie|mariee|tres|plus|toujours|la|tres|content|contente|malade|petit|petite|jeune|vieux|vieille|seul|seule|fier|fiere)\b/.test(occ[1])) push('OCCU', {what: sent.substr(f.indexOf(occ[1], occ.index), occ[1].length).trim()}); // le texte d'origine, avec ses accents (fold garde les longueurs)
            if (/\b(habitait|habitions|habitaient|vivait|vivions|vivaient|demeurait|on vivait|on habitait|a vecu|avons vecu)\b/.test(f) && place) push('RESI');
        });
        return out;
    }
    /** ce que dit l'arbre sur un fait : {state: 'ok'|'diff'|'new', note} */
    function compare(T, tr, fact) {
        const p = tr.byId.get(fact.who[0]); if (!p) return {state: 'new', note: ''};
        if (fact.tag === 'BIRT' || fact.tag === 'DEAT') { const y = fact.tag === 'BIRT' ? p.by : p.dy, pl = T.place(tr, fact.tag === 'BIRT' ? p.bplace : p.dplace);
            if (!y) return {state: 'new', note: 'pas encore dans l’arbre'}; const dy = fact.date && fact.date.y !== y, dp = fact.place && pl && !fold(pl).includes(fold(fact.place)) && !fold(fact.place).includes(fold(pl));
            return dy || dp ? {state: 'diff', note: `l’arbre dit ${[dy ? y : '', dp ? pl : ''].filter(Boolean).join(', à ')}${dy && dp ? '' : ''}`} : {state: 'ok', note: `concorde avec l’arbre (${y}${pl ? `, ${pl}` : ''})`}; }
        if (fact.tag === 'MARR') { const fams = (tr.fams.get(p.id) || []).filter(f => f.my); if (!fams.length) return {state: 'new', note: 'mariage pas encore daté dans l’arbre'}; const hit = fams.find(f => !fact.date || f.my === fact.date.y); return hit ? {state: 'ok', note: `concorde (${hit.my})`} : {state: 'diff', note: `l’arbre dit ${fams.map(f => f.my).join(' ou ')}`}; }
        if (fact.tag === 'OCCU') return p.occ ? (fold(p.occ).includes(fold(fact.what)) || fold(fact.what).includes(fold(p.occ)) ? {state: 'ok', note: `concorde (${p.occ})`} : {state: 'diff', note: `l’arbre dit ${p.occ}`}) : {state: 'new', note: 'pas de métier dans l’arbre'};
        if (fact.tag === 'RESI') { const known = (tr.evBy.get('p' + p.id) || []).some(e => e.place && fold(T.place(tr, e.place)).includes(fold(fact.place))); return known ? {state: 'ok', note: 'ce lieu est déjà dans l’arbre'} : {state: 'new', note: 'ce lieu n’est pas encore sur la fiche'}; }
        return {state: 'new', note: ''};
    }
    const TAG_LABEL = {BIRT: '👶 Naissance', DEAT: '🕯️ Décès', MARR: '💍 Mariage', OCCU: '🔨 Métier', RESI: '🏠 Domicile'};
    async function addFromStory(T, tr, fact, narrator) {
        const types = A().state?.bootstrap?.eventTypes || [], type = types.find(t => t.gedcom_tag === fact.tag); if (!type) throw new Error('sorte d’événement introuvable');
        if (fact.tag === 'MARR') throw new Error('un mariage s’ajoute depuis la fiche du couple');
        await T.post('add_event', {person_id: fact.who[0], event_type_id: type.id, date_text: fact.date ? fact.date.text : '', place_name: fact.place || '', title: fact.what || '', description: `D’après le récit de ${T.name(narrator)} : « ${fact.sentence} »`});
        await T.tree(true);
    }
    async function renderRaconte(host, T) {
        let tr = await T.tree(); const st = T.start(tr), older = tr.people.filter(p => p.living && p.by && p.by < 1960).sort((a, b) => a.by - b.by)[0] || st;
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        host.innerHTML = `<div class="h-tr-panel"><div class="h-tr-row"><div style="min-width:260px"><span class="pk-lab">Qui raconte</span>${T.personField('who', older?.id)}</div>${SR ? '<button type="button" class="button secondary" data-rc-mic>🎤 Dicter</button>' : ''}<button type="button" class="button" data-rc-go>🔍 Repérer les faits</button><button type="button" class="button secondary" data-rc-keep>💾 Garder le récit</button></div>
            <label style="display:grid;margin-top:8px">Le récit (dicté, collé, ou recopié d’un enregistrement)<textarea data-rc-txt rows="8" placeholder="Mon père était cheminot, il est né le 12 mars 1877 à Naves. On s’est mariés en 1960 à Tulle. Ma grand-mère Louise était institutrice…"></textarea></label></div><div data-rc-out></div>`;
        const txt = host.querySelector('[data-rc-txt]'), out = host.querySelector('[data-rc-out]'); let facts = [], rec = null;
        const draw = () => { const nid = Number(host.querySelector('[name=who]').value); facts = storyFacts(T, tr, nid, txt.value);
            out.innerHTML = facts.length ? `<h3>${facts.length} fait${facts.length > 1 ? 's' : ''} repéré${facts.length > 1 ? 's' : ''}</h3><ul class="h-tr-list">${facts.map((f, i) => { const c = compare(T, tr, f), ps = f.who.map(id => tr.byId.get(id));
                return `<li class="h-tr-item h-tr-rc-${c.state}"><span class="h-tr-ic">${c.state === 'ok' ? '✅' : c.state === 'diff' ? '⚠️' : '✨'}</span><div class="h-tr-grow"><b>${TAG_LABEL[f.tag]}</b> — ${T.esc(ps.map(p => T.name(p)).join(' ou '))} <small>(${T.esc(f.kin)})</small>${f.what ? ` : <b>${T.esc(f.what)}</b>` : ''}${f.date ? ` · ${T.esc(f.date.text)}` : ''}${f.place ? ` · ${T.esc(f.place)}` : ''}<br><small>${T.esc(c.note)}</small><br><small class="h-tr-muted">« ${T.esc(f.sentence)} »</small></div>
                    ${c.state !== 'ok' && f.who.length === 1 && f.tag !== 'MARR' && !readOnly() ? `<button type="button" class="button small secondary" data-rc-add="${i}">＋ Ajouter à la fiche</button>` : ''}</li>`; }).join('')}</ul><p class="h-tr-muted">Rien n’est changé sans ton accord : « Ajouter à la fiche » crée un événement avec la phrase du récit comme source.</p>` : txt.value.trim() ? '<p class="h-tr-muted">Aucun fait repéré : essaie des phrases comme « Mon père était boulanger », « Ma mère est née en 1932 à Tulle ».</p>' : ''; };
        host.addEventListener('click', async e => {
            if (e.target.closest('[data-rc-go]')) return draw();
            if (e.target.closest('[data-rc-keep]')) { const nid = Number(host.querySelector('[name=who]').value); if (!txt.value.trim()) return T.toast('Le récit est vide.', 'error'); await T.save({kind: 'story', person_id: nid || null, title: `Le récit de ${T.name(tr.byId.get(nid))} (${new Date().toLocaleDateString('fr-FR')})`, body: txt.value, data: {facts: facts.length}}); return T.toast('Récit gardé (bloc ✨ Trésors de la fiche).', 'success'); }
            const ad = e.target.closest('[data-rc-add]'); if (ad) { try { await addFromStory(T, tr, facts[Number(ad.dataset.rcAdd)], tr.byId.get(Number(host.querySelector('[name=who]').value))); tr = await T.tree(); T.toast('Ajouté à la fiche.', 'success'); draw(); } catch (err) { T.toast('Ajout impossible : ' + err.message, 'error'); } return; }
            if (e.target.closest('[data-rc-mic]')) { if (rec) { rec.stop(); rec = null; e.target.closest('[data-rc-mic]').textContent = '🎤 Dicter'; return; }
                rec = new SR(); rec.lang = 'fr-FR'; rec.continuous = true; rec.interimResults = false; rec.onresult = ev => { for (let k = ev.resultIndex; k < ev.results.length; k++) if (ev.results[k].isFinal) txt.value += (txt.value && !/\s$/.test(txt.value) ? ' ' : '') + ev.results[k][0].transcript.trim() + '. '; };
                rec.onerror = ev => T.toast('Dictée : ' + ev.error, 'error'); rec.onend = () => { if (rec) { try { rec.start(); } catch (_) {} } }; rec.start(); e.target.closest('[data-rc-mic]').textContent = '⏹ Arrêter la dictée'; }
        });
        txt.addEventListener('input', () => { clearTimeout(txt._t); txt._t = setTimeout(draw, 500); }); host.querySelector('[name=who]').addEventListener('change', draw);
    }
    F.push({key: 'raconte', group: 'outils', icon: '👵', title: 'Grand-parent raconte', desc: 'Un récit dicté ou collé : les naissances, mariages, métiers et domiciles repérés, comparés à l’arbre, à ajouter en un clic.', render: renderRaconte});
    ext.tresorStory = {storyFacts, compare, dateIn, placeIn};

    /* ── ⚠️ La cohérence en direct : un complément dans la fenêtre d'un événement ── */
    const kmBetween = (a, b) => { const r = Math.PI / 180, h = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lng - a.lng) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
    /** les vérifications de plus : [texte] */
    function extraChecks(T, tr, {personId, familyId, tag, iso, year, placeId, eventId}) {
        const out = [], p = tr.byId.get(personId), md = s => (s ? new Date(s + 'T12:00:00Z') : null);
        if (tag === 'BIRT' && p && iso) [...new Set([p.father, p.mother].filter(Boolean).flatMap(x => tr.kids.get(x) || []))].filter(x => x !== p.id).map(x => tr.byId.get(x)).forEach(s => { if (!s?.bd || s.bd === iso) return; const days = Math.abs(md(s.bd) - md(iso)) / 86400000; if (days < 270) out.push(`${s.first || T.name(s)}, ${s.gender === 'female' ? 'sa sœur' : 'son frère'}, est né${s.gender === 'female' ? 'e' : ''} le ${T.dateFr(s.bd)} : moins de neuf mois d’écart (des jumeaux auraient la même date).`); });
        if (['MARR', 'MRCI', 'MRRE', 'ENGA'].includes(tag) && year) { const f = tr.families.find(x => x.id === familyId), who = f ? [f.a, f.b] : (tr.fams.get(personId) || []).map(x => (x.a === personId ? x.b : x.a)); who.map(x => tr.byId.get(x)).filter(Boolean).forEach(q => { if (q.dy && q.dy < year) out.push(`${T.name(q)} est mort${q.gender === 'female' ? 'e' : ''} en ${q.dy}, avant ce mariage.`); }); }
        const g = placeId && tr.places[placeId]; if (p && g?.lat != null && year) (tr.evBy.get('p' + p.id) || []).forEach(e => { if (!e.y || Math.abs(e.y - year) > 0 || e.place === placeId) return; const h = tr.places[e.place]; if (h?.lat == null) return; const k = kmBetween(g, h); if (k > 300) out.push(`La même année, ${e.label.toLowerCase()} à ${h.name}, à ${Math.round(k)} km : possible, mais à vérifier.`); });
        if (tag === 'OCCU' && p?.by && year && year - p.by < 10) out.push(`Un métier à ${year - p.by} ans : c’est jeune.`);
        void eventId; return out;
    }
    ext.tresorChecks = {extraChecks};
    document.addEventListener('input', e => liveCheck(e), true); document.addEventListener('change', e => liveCheck(e), true);
    function liveCheck(e) {
        const form = e.target?.closest?.('#event-form'); if (!form || !e.target.matches('[name="date_text"],[name="event_type_id"],[name="place_id"],[name="place_name"],.date-picker-hidden') || !ext.tresors) return;
        clearTimeout(form._trChk); form._trChk = setTimeout(async () => {
            const T = ext.tresors.T, tr = await T.tree().catch(() => null); if (!tr) return;
            const el = n => form.elements[n]?.value || '', type = (A().state?.bootstrap?.eventTypes || []).find(t => Number(t.id) === Number(el('event_type_id'))), iso = A().freeDateToIso ? A().freeDateToIso(el('date_text')) : '';
            const y = Number((String(iso || el('date_text')).match(/(\d{4})/) || [])[1]) || null;
            const w = extraChecks(T, tr, {personId: Number(el('person_id')), familyId: Number(el('family_id')), tag: type?.gedcom_tag || '', iso: /^\d{4}-\d\d-\d\d$/.test(iso || '') ? iso : null, year: y, placeId: Number(el('place_id')) || null});
            let box = form.querySelector('#event-check-plus'); if (!box) { box = document.createElement('div'); box.id = 'event-check-plus'; box.className = 'span-2 event-date-check'; box.setAttribute('role', 'status'); const at = form.querySelector('#event-date-check') || form.elements.date_text?.closest('label, .date-text-wrap'); if (at) at.after(box); else form.appendChild(box); }
            box.hidden = !w.length; box.innerHTML = w.length ? `<strong>🔎 À regarder aussi</strong><ul>${w.map(x => `<li>${T.esc(x)}</li>`).join('')}</ul>` : '';
        }, 250);
    }

    /* ── 🔗 Le partage temporaire d'une branche ── */
    const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))), unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    async function encrypt(json, password) {
        const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
        const key = await crypto.subtle.deriveKey({name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256'}, base, {name: 'AES-GCM', length: 256}, false, ['encrypt']);
        return {salt: b64(salt), iv: b64(iv), data: b64(await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, new TextEncoder().encode(json)))};
    }
    /** la branche à partager, sans les vivants (ni ceux nés il y a moins de cent ans sans date de décès) */
    function branchData(T, tr, rootId, scope, gens) {
        const now = new Date().getFullYear(), ids = new Set([rootId, ...(scope !== 'desc' ? T.ancestors(tr, rootId, gens).map(a => a.id) : []), ...(scope !== 'asc' ? T.descendants(tr, [rootId], gens).map(a => a.id) : [])]);
        const keep = p => p && !p.living && !p.priv && !(p.by && now - p.by < 100 && !p.dy), people = [...ids].map(i => tr.byId.get(i)).filter(keep), kept = new Set(people.map(p => p.id));
        // une phrase qui nomme une personne retirée (conjoint vivant, fiche confidentielle) ne part pas non plus
        const banned = tr.people.filter(q => !keep(q)).map(q => T.name(q)).filter(n => n && n !== 'Sans nom'), clean = list => list.filter(x => !banned.some(n => x.includes(n)));
        return {people: people.sort((a, b) => (a.by || 9999) - (b.by || 9999)).map(p => ({id: p.id, n: T.name(p), l: T.life(p), o: p.occ || '', s: clean(T.story(tr, p).filter(x => !/a eu \d+ enfants? :|a eu un enfant :/.test(x))), par: [p.father, p.mother].filter(x => kept.has(x)), kids: [...new Set(tr.kids.get(p.id) || [])].filter(x => kept.has(x))})), hidden: ids.size - people.length};
    }
    function shareHtml(title, exp, payload, locked) {
        const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
        return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{margin:0;font-family:Georgia,serif;background:#f6f1e3;color:#2a2016}main{max-width:760px;margin:0 auto;padding:24px 16px}h1{font-weight:normal;font-style:italic}input,button{font:inherit;padding:8px 12px;border-radius:8px;border:1px solid #b9a77f}button{background:#8a6b3a;color:#fff;border:0;cursor:pointer}.p{background:#fffaf0;border:1px solid #e3d6b8;border-radius:10px;padding:12px 16px;margin:10px 0}.p small{color:#7a6a50}.p a{color:#8a4b1a;cursor:pointer}.muted{color:#7a6a50}</style></head><body><main id="m"><h1>${esc(title)}</h1><p class="muted">Partage valable jusqu’au ${esc(new Date(exp).toLocaleDateString('fr-FR'))}. Les personnes vivantes ne sont pas incluses.</p><div id="z"></div></main>
<script>const EXP=${Number(exp)},LOCKED=${locked ? 'true' : 'false'},PAYLOAD=${JSON.stringify(payload).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')};
const z=document.getElementById('z'),esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function show(d){if(Date.now()>d.exp){z.innerHTML='<p>⏳ Ce partage a expiré.</p>';return;}const by=new Map(d.people.map(p=>[p.id,p]));const card=p=>'<div class="p" id="p'+p.id+'"><b>'+esc(p.n)+'</b> <small>'+esc(p.l)+(p.o?' · '+esc(p.o):'')+'</small><p>'+esc(p.s.join(' '))+'</p>'+(p.par.length?'<small>Parents : '+p.par.map(i=>'<a href="#p'+i+'">'+esc(by.get(i).n)+'</a>').join(', ')+'</small><br>':'')+(p.kids.length?'<small>Enfants : '+p.kids.map(i=>'<a href="#p'+i+'">'+esc(by.get(i).n)+'</a>').join(', ')+'</small>':'')+'</div>';
z.innerHTML='<input id="q" placeholder="Chercher un nom…" style="width:100%;box-sizing:border-box"><p class="muted">'+d.people.length+' personnes</p><div id="l"></div>';const draw=()=>{const s=document.getElementById('q').value.toLowerCase();document.getElementById('l').innerHTML=d.people.filter(p=>!s||p.n.toLowerCase().includes(s)).map(card).join('');};document.getElementById('q').oninput=draw;draw();}
async function open(pw){const u=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveKey']);const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:u(PAYLOAD.salt),iterations:150000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['decrypt']);return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:u(PAYLOAD.iv)},key,u(PAYLOAD.data))));}
if(Date.now()>EXP)z.innerHTML='<p>⏳ Ce partage a expiré.</p>';else if(!LOCKED)show(PAYLOAD);else{z.innerHTML='<p>🔒 Ce partage est protégé.</p><form id="f"><input type="password" id="pw" placeholder="Mot de passe" autofocus> <button>Ouvrir</button></form><p id="e" class="muted"></p>';document.getElementById('f').onsubmit=async e=>{e.preventDefault();try{show(await open(document.getElementById('pw').value));}catch(_){document.getElementById('e').textContent='Mot de passe incorrect.';}};}
<\/script></body></html>`;
    }
    async function renderShare(host, T) {
        const tr = await T.tree(), st = T.start(tr), inDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
        host.innerHTML = `<form class="h-tr-panel" data-sh><div class="form-grid"><div><span class="pk-lab">La branche de</span>${T.personField('root', st?.id)}</div><label>Qui<select name="scope"><option value="asc">ses ancêtres</option><option value="desc">ses descendants</option><option value="both">les deux</option></select></label>
            <label>Générations<input type="number" name="gens" min="1" max="15" value="6"></label><label>Valable jusqu’au<input type="date" name="exp" value="${inDays(7)}" min="${inDays(1)}"></label>
            <label class="span-2">Mot de passe (conseillé : le fichier est chiffré, illisible sans lui)<input type="text" name="pw" autocomplete="off" placeholder="à donner à part, par téléphone par exemple"></label></div>
            <p class="h-tr-row"><button class="button" type="submit">🔗 Fabriquer le fichier à partager</button><span class="h-tr-muted" data-sh-n></span></p>
            <p class="h-tr-muted">Un seul fichier HTML, qui s’ouvre dans n’importe quel navigateur, sans l’application : à envoyer par courriel ou à déposer sur un nuage. Les personnes vivantes, les fiches confidentielles et celles nées il y a moins de cent ans sans date de décès sont retirées (et les phrases qui les nomment). La date limite est vérifiée à l’ouverture (quelqu’un qui recule l’horloge de son ordinateur pourrait la contourner : le mot de passe, lui, protège vraiment).</p></form>`;
        const form = host.querySelector('[data-sh]'), count = () => { const d = branchData(T, tr, Number(form.elements.root.value) || st.id, form.elements.scope.value, Number(form.elements.gens.value) || 6); host.querySelector('[data-sh-n]').textContent = `${d.people.length} personne${d.people.length > 1 ? 's' : ''} partagée${d.people.length > 1 ? 's' : ''}${d.hidden ? ` · ${d.hidden} retirée${d.hidden > 1 ? 's' : ''} (vivantes ou récentes)` : ''}`; return d; };
        form.addEventListener('change', count); count();
        form.addEventListener('submit', async e => { e.preventDefault(); const d = count(); if (!d.people.length) return T.toast('Personne à partager dans cette branche.', 'error');
            const exp = new Date(form.elements.exp.value + 'T23:59:59').getTime(), root = tr.byId.get(Number(form.elements.root.value)), title = `La branche ${root?.last || T.name(root)} — partagée par la famille`, pw = form.elements.pw.value;
            const body = {exp, people: d.people}, html = shareHtml(title, exp, pw ? await encrypt(JSON.stringify(body), pw) : body, !!pw);
            T.download(`partage-${(root?.last || 'branche').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}-jusqu-au-${form.elements.exp.value}.html`, new Blob([html], {type: 'text/html'})); ext.tresorShare.last = html;
            await T.save({kind: 'share', person_id: root?.id || null, title, open_at: form.elements.exp.value, data: {people: d.people.length, locked: !!pw}}); T.toast('Fichier prêt : envoie-le, et donne le mot de passe à part.', 'success'); });
    }
    F.push({key: 'partage', group: 'outils', icon: '🔗', title: 'Partager une branche (pour un temps)', desc: 'Un fichier à envoyer à un cousin : la branche sans les vivants, protégée par un mot de passe, qui expire à la date choisie.', render: renderShare});
    ext.tresorShare = {branchData, shareHtml, encrypt};
})();
