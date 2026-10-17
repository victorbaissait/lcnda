/**
 * 🏢 Fiche d'un employeur, à la façon d'une fiche d'entreprise (Pappers, Annuaire des entreprises) :
 * identité juridique, siège, dirigeants, établissements, chronologie, notes et sources, et la famille qui y a travaillé.
 * S'ouvre depuis Listes → Employeurs (« 🏢 Fiche »), depuis un recensement (clic sur l'employeur) et depuis le champ
 * « Employeur » des formulaires. Serveur : lib/employers.php (employer_record, save_employer_record, employer_lookup).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => A().escapeHtml(v ?? '');
    const toast = (...a) => A().toast(...a);
    const api = (...a) => A().api(...a);
    const pname = p => [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Personne sans nom';
    const siren = v => String(v || '').replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{3})(\d*)$/, (m, a, b, c, d) => `${a} ${b} ${c}${d ? ' ' + d : ''}`);
    const dateFr = v => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${Number(m[3])}/${m[2]}/${m[1]}` : String(v || ''); };
    const yearOf = v => { const m = String(v || '').match(/(\d{4})/); return m ? Number(m[1]) : null; };
    const STATUS = {active: ['En activité', 'is-on'], closed: ['Fermé / disparu', 'is-off'], '': ['État inconnu', '']};
    const LISTS = {
        directors: {title: 'Dirigeants', icon: '👔', cols: [['name', 'Nom', 'Jean Dupont'], ['role', 'Qualité', 'Gérant, patron, directeur…'], ['from', 'De', '1890'], ['to', 'À', '1912']]},
        establishments: {title: 'Établissements', icon: '🏭', cols: [['name', 'Nom', 'Usine, atelier, magasin…'], ['kind', 'Sorte', 'siège, usine, dépôt…'], ['address', 'Adresse', ''], ['city', 'Ville', ''], ['from', 'De', ''], ['to', 'À', '']]},
        history: {title: 'Chronologie', icon: '🗓️', cols: [['date', 'Date', '1875'], ['text', 'Ce qui s’est passé', 'Fondation, rachat, grève, fermeture…']]},
        products: {title: 'Ce qu’on y faisait', icon: '⚙️', cols: [['text', 'Produit, service, savoir-faire', 'Tissage de lin, briques, transport…']]},
    };
    const IDENT = [['legal_name', 'Raison sociale complète'], ['aliases', 'Autres noms, enseigne'], ['legal_form', 'Forme juridique'], ['siren', 'SIREN'], ['siret', 'SIRET du siège'],
        ['naf', 'Code NAF / APE'], ['activity', 'Activité'], ['founded', 'Création'], ['closed', 'Fermeture'], ['capital', 'Capital'], ['workforce', 'Effectif']];
    const CONTACT = [['address', 'Adresse'], ['postcode', 'Code postal'], ['city', 'Ville'], ['country', 'Pays'], ['phone', 'Téléphone'], ['email', 'Courriel'], ['website', 'Site internet'], ['logo_url', 'Logo (adresse d’une image)']];

    /* ─── La fiche ─── */
    function ficheHtml(r) {
        const d = r.data || {}, [statusLabel, statusCls] = STATUS[d.status || ''] || STATUS[''];
        const ini = r.name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
        const kv = rows => rows.filter(([k]) => d[k]).map(([k, l]) => `<tr><th>${esc(l)}</th><td>${k === 'siren' || k === 'siret' ? `<span class="h-emp-mono">${esc(siren(d[k]))}</span>` : k === 'website' ? `<a href="${esc(d[k])}" target="_blank" rel="noopener noreferrer">${esc(d[k].replace(/^https?:\/\//, ''))}</a>` : k === 'email' ? `<a href="mailto:${esc(d[k])}">${esc(d[k])}</a>` : ['founded', 'closed'].includes(k) ? esc(dateFr(d[k])) : esc(d[k])}</td></tr>`).join('');
        const ident = kv(IDENT), contact = kv(CONTACT.filter(([k]) => k !== 'logo_url'));
        const list = (key, render) => (d[key] || []).length ? `<section class="h-emp-card"><h3>${LISTS[key].icon} ${LISTS[key].title} <small>${(d[key] || []).length}</small></h3>${render(d[key])}</section>` : '';
        const period = (a, b) => a || b ? `<small class="h-emp-period">${esc(a || '?')} → ${esc(b || '…')}</small>` : '';
        const directors = list('directors', xs => `<ul class="h-emp-people">${xs.map(x => `<li><span class="h-emp-ini">${esc((x.name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase())}</span><div>${x.person_id ? `<button type="button" class="table-link" data-h-person="${Number(x.person_id)}">${esc(x.name)}</button>` : `<strong>${esc(x.name)}</strong>`}<small>${esc(x.role)}</small>${period(x.from, x.to)}</div></li>`).join('')}</ul>`);
        const estab = list('establishments', xs => `<ul class="h-emp-estab">${xs.map(x => `<li><strong>${esc(x.name || x.kind || 'Établissement')}</strong>${x.kind && x.name ? ` <span class="h-emp-tag">${esc(x.kind)}</span>` : ''}<small>${esc([x.address, x.city].filter(Boolean).join(', '))}</small>${period(x.from, x.to)}</li>`).join('')}</ul>`);
        // chronologie : création, événements à soi, passages de la famille, fermeture
        const timeline = [...(d.history || []).map(h => ({y: yearOf(h.date), date: h.date, text: h.text}))];
        if (d.founded) timeline.push({y: yearOf(d.founded), date: dateFr(d.founded), text: 'Création'});
        if (d.closed) timeline.push({y: yearOf(d.closed), date: dateFr(d.closed), text: 'Fermeture'});
        timeline.sort((a, b) => (a.y ?? 9999) - (b.y ?? 9999));
        const chrono = timeline.length ? `<section class="h-emp-card"><h3>🗓️ Chronologie</h3><ol class="h-emp-timeline">${timeline.map(t => `<li><b>${esc(t.date || '?')}</b><span>${esc(t.text)}</span></li>`).join('')}</ol></section>` : '';
        const products = list('products', xs => `<p class="h-emp-chips">${xs.map(x => `<span>${esc(x.text)}</span>`).join('')}</p>`);
        const fam = r.people || [];
        const famHtml = `<section class="h-emp-card h-emp-wide"><h3>👪 La famille chez cet employeur <small>${fam.length}</small></h3>${fam.length ? `<ul class="h-emp-family">${fam.map(p => {
            const life = p.birth_year || p.death_year ? `${p.birth_year || '?'} – ${p.death_year || ''}` : '';
            const ms = (p.mentions || []).map(m => m.kind === 'census' ? `recensement ${m.year || ''}${m.occupation ? ' · ' + m.occupation : ''}${m.place ? ' · ' + m.place : ''}` : `${m.from || m.to ? `${m.from || '?'} → ${m.to || '…'}` : 'fiche'}${m.occupation ? ' · ' + m.occupation : ''}${m.place ? ' · ' + m.place : ''}`);
            return `<li class="gender-${esc(p.gender || 'unknown')}"><div>${p.id ? `<button type="button" class="table-link" data-h-person="${Number(p.id)}">${esc(pname(p))}</button>` : `<strong>${esc(pname(p))}</strong> <small class="muted">(non relié)</small>`}${life ? ` <small class="muted">${esc(life)}</small>` : ''}</div><small>${ms.map(esc).join('<br>')}</small></li>`; }).join('')}</ul>`
            : '<p class="muted">Personne de la base n’est encore rattaché à cet employeur : écris son nom dans le champ « Employeur » d’un recensement ou du bloc « Métiers » d’une fiche.</p>'}</section>`;
        const notes = d.notes ? `<section class="h-emp-card h-emp-wide"><h3>📝 Notes et histoire</h3><div class="h-emp-text">${esc(d.notes).replace(/\n/g, '<br>')}</div></section>` : '';
        const sources = d.sources ? `<section class="h-emp-card h-emp-wide"><h3>📚 Sources</h3><div class="h-emp-text">${esc(d.sources).replace(/\n/g, '<br>')}</div></section>` : '';
        const empty = !Object.values(d).some(v => Array.isArray(v) ? v.length : v);
        const q = encodeURIComponent(d.siren || r.name);
        return `<header class="h-emp-hero">
            ${d.logo_url ? `<img class="h-emp-logo" src="${esc(d.logo_url)}" alt="" referrerpolicy="no-referrer">` : `<span class="h-emp-logo is-ini" aria-hidden="true">${esc(ini || '🏢')}</span>`}
            <div class="h-emp-title"><span class="eyebrow">EMPLOYEUR</span><h2>${esc(r.name)}</h2>
                <p class="h-emp-sub"><span class="h-emp-status ${statusCls}">${esc(statusLabel)}</span>${d.legal_form ? `<span>${esc(d.legal_form)}</span>` : ''}${d.siren ? `<span class="h-emp-mono">SIREN ${esc(siren(d.siren))}</span>` : ''}${d.activity || d.naf ? `<span>${esc(d.activity || d.naf)}</span>` : ''}${d.city ? `<span>📍 ${esc(d.city)}</span>` : ''}${r.span ? `<span>👪 ${r.span[0]}${r.span[1] !== r.span[0] ? '–' + r.span[1] : ''}</span>` : ''}</p></div>
            <div class="h-emp-actions"><button type="button" class="button small" data-emp-edit>✎ ${empty ? 'Remplir la fiche' : 'Modifier'}</button><a class="button small secondary" href="https://www.pappers.fr/recherche?q=${q}" target="_blank" rel="noopener noreferrer">Pappers ↗</a><a class="button small secondary" href="https://annuaire-entreprises.data.gouv.fr/rechercher?terme=${q}" target="_blank" rel="noopener noreferrer">Annuaire ↗</a><button type="button" class="button small secondary" data-emp-print>🖨️ Imprimer</button></div>
        </header>
        ${empty ? `<p class="h-emp-hint">Cette fiche est vide. « Remplir la fiche » : tu peux chercher l’entreprise dans l’Annuaire des entreprises (si elle existe ou a existé depuis les années 1970) pour remplir l’identité, le siège et les dirigeants d’un clic, ou tout écrire à la main pour un patron, une ferme, une usine d’autrefois.</p>` : ''}
        <div class="h-emp-grid">
            ${ident ? `<section class="h-emp-card"><h3>🏛️ Informations juridiques</h3><table class="h-emp-kv">${ident}</table></section>` : ''}
            ${contact ? `<section class="h-emp-card"><h3>📍 Siège</h3><table class="h-emp-kv">${contact}</table></section>` : ''}
            ${directors}${estab}${chrono}${products}${famHtml}${notes}${sources}
        </div>`;
    }

    /* ─── Le formulaire ─── */
    function rowsHtml(key, items) {
        const L = LISTS[key];
        return `<div class="h-emp-rows" data-emp-list="${key}">${(items.length ? items : []).map((it, i) => `<div class="h-emp-row">${L.cols.map(([k, l, ph]) => `<label>${esc(l)}<input data-k="${k}" value="${esc(it[k] ?? '')}" placeholder="${esc(ph)}"></label>`).join('')}${key === 'directors' ? `<input type="hidden" data-k="person_id" value="${Number(it.person_id) || 0}">` : ''}<span class="h-emp-row-tools"><button type="button" class="icon-button small" data-emp-move="-1" aria-label="Monter">↑</button><button type="button" class="icon-button small" data-emp-move="1" aria-label="Descendre">↓</button><button type="button" class="icon-button small" data-emp-del aria-label="Retirer">✕</button></span></div>`).join('')}</div><button type="button" class="button small secondary" data-emp-add="${key}">+ ${esc(L.cols[0][1] === 'Nom' ? L.title.replace(/s$/, '').toLowerCase() : 'ligne')}</button>`;
    }
    function formHtml(r) {
        const d = r.data || {};
        const field = ([k, l], type = 'text') => `<label>${esc(l)}<input name="${k}" type="${type}" value="${esc(d[k] ?? '')}"${k === 'founded' || k === 'closed' ? ' placeholder="1875, ou 1875-03-12"' : ''}></label>`;
        return `<form class="h-emp-form" novalidate>
            <section class="h-emp-card h-emp-wide h-emp-lookup"><h3>🔎 Remplir depuis l’Annuaire des entreprises</h3><p class="muted">Pour une entreprise qui existe ou a existé depuis les années 1970 : identité, siège et dirigeants remplis d’un clic. Rien n’est enregistré avant « Enregistrer ».</p><div class="h-emp-lookup-bar"><input type="search" data-emp-q value="${esc(d.siren || r.name)}" placeholder="Nom ou SIREN"><button type="button" class="button small" data-emp-lookup>Chercher</button></div><div data-emp-results></div></section>
            <section class="h-emp-card h-emp-wide"><h3>Nom</h3><div class="form-grid"><label>Nom de l’employeur<input name="name" value="${esc(r.name)}" required></label><label>État<select name="status"><option value="">Inconnu</option><option value="active" ${d.status === 'active' ? 'selected' : ''}>En activité</option><option value="closed" ${d.status === 'closed' ? 'selected' : ''}>Fermé / disparu</option></select></label>${r.name ? `<label class="checkbox-line span-2"><input type="checkbox" name="rename_mentions" checked> <span>Si je change le nom, le changer aussi dans les recensements</span></label>` : ''}</div></section>
            <section class="h-emp-card"><h3>🏛️ Informations juridiques</h3><div class="form-grid one-column">${IDENT.map(f => field(f)).join('')}</div></section>
            <section class="h-emp-card"><h3>📍 Siège</h3><div class="form-grid one-column">${CONTACT.map(f => field(f, f[0] === 'email' ? 'email' : 'text')).join('')}</div></section>
            ${Object.keys(LISTS).map(k => `<section class="h-emp-card h-emp-wide"><h3>${LISTS[k].icon} ${LISTS[k].title}</h3>${rowsHtml(k, d[k] || [])}</section>`).join('')}
            <section class="h-emp-card h-emp-wide"><h3>📝 Notes et histoire</h3><textarea name="notes" rows="6" placeholder="L’histoire de l’entreprise, les conditions de travail, ce que la famille en racontait…">${esc(d.notes || '')}</textarea></section>
            <section class="h-emp-card h-emp-wide"><h3>📚 Sources</h3><textarea name="sources" rows="4" placeholder="Archives d’entreprise, presse, registres du commerce, livres…">${esc(d.sources || '')}</textarea></section>
            <div class="modal-actions"><button type="button" class="button secondary danger" data-emp-delete ${r.id ? '' : 'hidden'}>Supprimer la fiche</button><span class="spacer"></span><button type="button" class="button secondary" data-emp-cancel>Annuler</button><button type="submit" class="button">Enregistrer</button></div>
        </form>`;
    }
    function readForm(form) {
        const out = {};
        form.querySelectorAll('input[name], select[name], textarea[name]').forEach(el => { out[el.name] = el.type === 'checkbox' ? el.checked : el.value; });
        form.querySelectorAll('[data-emp-list]').forEach(list => { out[list.dataset.empList] = [...list.querySelectorAll('.h-emp-row')].map(row => Object.fromEntries([...row.querySelectorAll('[data-k]')].map(i => [i.dataset.k, i.value]))); });
        return out;
    }
    function fillFrom(form, hit, people) {
        const set = (k, v) => { const el = form.elements[k]; if (el && v) el.value = v; };
        ['legal_name', 'legal_form', 'siren', 'siret', 'naf', 'founded', 'closed', 'workforce', 'address', 'postcode', 'city', 'country'].forEach(k => set(k, hit[k]));
        set('status', hit.status);
        if (hit.directors?.length) {
            const list = form.querySelector('[data-emp-list="directors"]');
            const have = new Set([...list.querySelectorAll('[data-k="name"]')].map(i => i.value.toLowerCase()));
            const add = hit.directors.filter(x => !have.has(x.name.toLowerCase())).map(x => ({...x, person_id: people.find(p => pname(p).toLowerCase() === x.name.toLowerCase())?.id || 0}));
            list.insertAdjacentHTML('beforeend', rowsHtml('directors', add).replace(/^<div[^>]*>|<\/div><button[\s\S]*$/g, ''));
        }
        toast('Fiche remplie depuis l’Annuaire : vérifie, puis « Enregistrer ».');
    }

    async function open(name, startEditing = false) {
        let r;
        if (name) { try { r = await api('employer_record', {name}); } catch (error) { toast(error.message, 'error'); return; } }
        else { r = {key: '', id: 0, name: '', data: {}, people: []}; startEditing = true; }
        document.getElementById('h-emp-dialog')?.remove();
        const dlg = document.createElement('dialog');
        dlg.className = 'modal h-modal h-emp-dialog'; dlg.id = 'h-emp-dialog';
        document.body.appendChild(dlg);
        const show = () => {
            dlg.innerHTML = `<button type="button" class="icon-button h-emp-close" data-close aria-label="Fermer">×</button><div class="h-emp-body">${ficheHtml(r)}</div>`;
            dlg.querySelector('[data-emp-edit]').addEventListener('click', edit);
            dlg.querySelector('[data-emp-print]').addEventListener('click', () => {
                const w = window.open('', '_blank', 'width=1000,height=800'); if (!w) { toast('Fenêtre d’impression bloquée.', 'error'); return; }
                const css = [...document.styleSheets].map(s => { try { return [...s.cssRules].map(x => x.cssText).join('\n'); } catch (_) { return ''; } }).join('\n');
                w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.name)}</title><style>${css}body{background:#fff;padding:20px}.h-emp-actions{display:none}</style></head><body>${dlg.querySelector('.h-emp-body').innerHTML}<script>window.onload=()=>setTimeout(()=>window.print(),250);<\/script></body></html>`);
                w.document.close();
            });
            dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
            A().bindTableLinks?.();
        };
        const edit = () => {
            dlg.innerHTML = `<button type="button" class="icon-button h-emp-close" data-close aria-label="Fermer">×</button><div class="h-emp-body"><header class="h-emp-hero"><div class="h-emp-title"><span class="eyebrow">EMPLOYEUR</span><h2>${r.name ? `Modifier « ${esc(r.name)} »` : 'Nouvel employeur'}</h2></div></header>${formHtml(r)}</div>`;
            const form = dlg.querySelector('form');
            dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
            form.addEventListener('click', async e => {
                const add = e.target.closest('[data-emp-add]');
                if (add) { const list = form.querySelector(`[data-emp-list="${add.dataset.empAdd}"]`); list.insertAdjacentHTML('beforeend', rowsHtml(add.dataset.empAdd, [{}]).replace(/^<div[^>]*>|<\/div><button[\s\S]*$/g, '')); list.lastElementChild?.querySelector('input')?.focus(); return; }
                const row = e.target.closest('.h-emp-row');
                if (e.target.closest('[data-emp-del]') && row) { row.remove(); return; }
                const mv = e.target.closest('[data-emp-move]');
                if (mv && row) { if (mv.dataset.empMove === '-1' && row.previousElementSibling) row.parentElement.insertBefore(row, row.previousElementSibling); else if (mv.dataset.empMove === '1' && row.nextElementSibling) row.parentElement.insertBefore(row.nextElementSibling, row); return; }
                if (e.target.closest('[data-emp-cancel]')) { if (r.name) show(); else dlg.close(); return; }
                if (e.target.closest('[data-emp-delete]')) {
                    if (!await A().confirmBox(`Supprimer la fiche de « ${r.name} » ? Les recensements et les fiches des personnes ne changent pas.`, {title: 'Supprimer la fiche', okLabel: 'Supprimer la fiche'})) return;
                    try { await api('delete_employer_record', {}, {method: 'POST', body: {name: r.name}}); } catch (error) { toast(error.message, 'error'); return; }
                    toast('Fiche supprimée.'); dlg.close(); refreshList(); return;
                }
                const pick = e.target.closest('[data-emp-pick]');
                if (pick) { fillFrom(form, lookups[Number(pick.dataset.empPick)], r.people || []); return; }
                if (e.target.closest('[data-emp-lookup]')) await lookup();
            });
            let lookups = [];
            const lookup = async () => {
                const box = form.querySelector('[data-emp-results]'), q = form.querySelector('[data-emp-q]').value.trim();
                if (q.length < 3) { box.innerHTML = '<p class="muted">Au moins 3 lettres.</p>'; return; }
                box.innerHTML = '<p class="muted">Recherche…</p>';
                try { lookups = (await api('employer_lookup', {q})).results || []; } catch (error) { box.innerHTML = `<p class="h-offsite-sentence is-warn">${esc(error.message)}</p>`; return; }
                box.innerHTML = lookups.length ? `<ul class="h-emp-hits">${lookups.map((h, i) => `<li><button type="button" data-emp-pick="${i}"><strong>${esc(h.name)}</strong><small>${esc([h.siren && 'SIREN ' + siren(h.siren), h.legal_form, [h.postcode, h.city].filter(Boolean).join(' '), h.founded && 'créée le ' + dateFr(h.founded), h.status === 'closed' ? 'fermée' : 'active'].filter(Boolean).join(' · '))}</small></button></li>`).join('')}</ul>` : '<p class="muted">Rien trouvé : l’entreprise est peut-être trop ancienne. Remplis la fiche à la main.</p>';
            };
            form.querySelector('[data-emp-q]').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); lookup(); } });
            form.addEventListener('submit', async e => {
                e.preventDefault();
                const data = readForm(form);
                if (!String(data.name || '').trim()) { toast('Donne un nom à l’employeur.', 'error'); return; }
                data.old_name = r.name;
                let saved; try { saved = await api('save_employer_record', {}, {method: 'POST', body: data}); } catch (error) { toast(error.message, 'error'); return; }
                toast('Fiche de l’employeur enregistrée.');
                try { r = await api('employer_record', {name: saved.name}); } catch (_) {}
                show(); refreshList();
            });
        };
        dlg.addEventListener('close', () => dlg.remove());
        if (startEditing) edit(); else show();
        dlg.showModal();
    }
    const refreshList = () => { const S = A().state; if (S.module === 'listes' && S.listType === 'employers') A().setModule?.('listes'); };
    ext.openEmployer = open;

    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-employer-open]');
        if (b) { e.preventDefault(); open(b.dataset.employerOpen); return; }
        if (e.target.closest?.('[data-employer-new]')) { e.preventDefault(); open(''); }
    });
    // Champ « Employeur » d'un formulaire : propose les employeurs connus et un accès à leur fiche
    let known = null;
    document.addEventListener('focusin', async e => {
        const input = e.target;
        if (!input.matches?.('input[name="employer"], input[data-employer-field]')) return;
        if (!input.nextElementSibling?.matches?.('.h-emp-field-link')) {
            input.insertAdjacentHTML('afterend', '<button type="button" class="link-button h-emp-field-link">🏢 Fiche de cet employeur</button>');
            input.nextElementSibling.addEventListener('click', () => { const v = input.value.trim(); if (!v) { toast('Écris d’abord le nom de l’employeur.'); return; } open(v, false); });
        }
        if (!document.getElementById('h-emp-known')) {
            try { known = known || (await api('list', {type: 'employers', limit: 500})).rows || []; } catch (_) { known = []; }
            document.body.insertAdjacentHTML('beforeend', `<datalist id="h-emp-known">${known.map(k => `<option value="${esc(k.name)}">`).join('')}</datalist>`);
        }
        input.setAttribute('list', 'h-emp-known');
    });
})();
