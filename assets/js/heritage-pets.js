/* LCNDA — 🐾 Animaux de compagnie : la liste (Listes → Animaux de compagnie), la fiche d'un animal (identité, race,
 * identification, éleveur, propriétaires, titres, santé, mesures, vie, photos, recueils), son pedigree sur plusieurs
 * générations avec le taux de consanguinité (méthode de Wright), sa descendance et ses frères et sœurs ;
 * le bloc « Animaux de compagnie » de la fiche d'une personne et le widget du tableau de bord.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const key of ['personBlocks', 'lists', 'dashboard']) ext[key] = ext[key] || {};
    const A = () => window.LCNDA_APP;
    const esc = v => A().escapeHtml(v ?? '');
    const nl = v => esc(v).replace(/\n/g, '<br>');
    const api = (...a) => A().api(...a);
    const toast = (...a) => A().toast(...a);
    const S = () => A().state;
    const fmt = n => Number(n || 0).toLocaleString('fr-FR');
    const isCurrent = token => token === S().workspaceToken && S().module === 'listes' && S().listType === 'pets';
    const personLink = (id, name) => id ? `<button type="button" class="table-link" data-h-person="${Number(id)}">${esc(name || 'Personne')}</button>` : esc(name || '');
    const SPECIES_ICON = {chien: '🐕', chat: '🐈', cheval: '🐎', lapin: '🐇', rongeur: '🐹', oiseau: '🐦', poisson: '🐟', reptile: '🐢', ferme: '🐄', autre: '🐾'};
    const SPECIES = {chien: 'Chien', chat: 'Chat', cheval: 'Cheval, poney, âne', lapin: 'Lapin', rongeur: 'Rongeur (cochon d’Inde, hamster…)', oiseau: 'Oiseau', poisson: 'Poisson', reptile: 'Reptile, tortue', ferme: 'Animal de la ferme (vache, chèvre, mouton…)', autre: 'Autre'};
    const SEX = {M: '♂ mâle', F: '♀ femelle'};
    const REGISTRIES = ['LOF (chiens, France)', 'LOOF (chats, France)', 'SIRE / IFCE (chevaux, France)', 'Stud-book', 'FCI', 'Kennel Club', 'AKC', 'TICA', 'FIFe', 'Livre généalogique de la race', 'Autre'];
    const OWNER_ROLES = ['propriétaire', 'co-propriétaire', 'éleveur', 'gardien', 'famille d’accueil', 'autre'];
    const EVENT_KINDS = ['arrivée', 'adoption', 'déménagement', 'exposition', 'concours', 'saillie', 'mise bas / portée', 'naissance des petits', 'stérilisation', 'maladie', 'opération', 'accident', 'perte / fugue', 'retrouvé', 'départ', 'décès', 'souvenir', 'autre'];
    const photoHtml = (m, cls = '') => m ? `<span class="h-pet-photo ${cls}">${A().mediaThumbHtml(m)}</span>` : '';
    const iconOf = sp => SPECIES_ICON[sp] || '🐾';
    const lifespan = p => [p.birth_date && '° ' + p.birth_date, (p.death_date || p.deceased) && '† ' + (p.death_date || '?')].filter(Boolean).join(' · ');

    /** L'âge (ou l'âge à la mort) d'après des dates jj/mm/aaaa, aaaa-mm-jj ou aaaa */
    const parseDate = s => { const t = String(s || '').trim(); let m; if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t))) return new Date(+m[1], +m[2] - 1, +m[3]); if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t))) return new Date(+m[3], +m[2] - 1, +m[1]); if ((m = /(\d{4})/.exec(t))) return new Date(+m[1], 6, 1); return null; };
    function ageOf(d) {
        const b = parseDate(d.birth_date); if (!b) return '';
        const e = d.death_date ? parseDate(d.death_date) : (d.deceased ? null : new Date()); if (!e) return '';
        let months = (e.getFullYear() - b.getFullYear()) * 12 + e.getMonth() - b.getMonth(); if (e.getDate() < b.getDate()) months--;
        if (months < 0) return '';
        const y = Math.floor(months / 12), mo = months % 12;
        return (y ? `${y} an${y > 1 ? 's' : ''}` : '') + (y && mo ? ' et ' : '') + (mo || !y ? `${mo} mois` : '');
    }

    /* ═════════ Consanguinité (Wright) : F = Σ (½)^(n1+n2+1) × (1 + F_A) sur les ancêtres communs au père et à la mère ═════════ */
    function coi(id, anc) { const contrib = {}; const f = coiOf(id, anc, new Map(), contrib); coi.last = contrib; return f; }
    function coiOf(id, anc, memo, record = null) {
        if (memo.has(id)) return memo.get(id);
        memo.set(id, 0);
        const me = anc[id]; if (!me || !me.sire_id || !me.dam_id) return 0;
        // tous les chemins d'un animal vers ses ancêtres : [ancêtre, longueur, ensemble des animaux traversés]
        const paths = start => { const out = []; const walk = (x, len, seen, depth) => { if (!x || depth > 14) return; const s2 = new Set(seen); s2.add(x); out.push([x, len, s2]); const a = anc[x]; if (!a) return; walk(a.sire_id, len + 1, s2, depth + 1); walk(a.dam_id, len + 1, s2, depth + 1); }; walk(start, 0, new Set(), 0); return out; };
        const ps = paths(me.sire_id), pd = paths(me.dam_id);
        let f = 0;
        for (const [a1, n1, s1] of ps) for (const [a2, n2, s2] of pd) {
            if (a1 !== a2) continue;
            let shared = false; for (const x of s1) if (x !== a1 && s2.has(x)) { shared = true; break; }
            if (shared) continue;
            const c = Math.pow(.5, n1 + n2 + 1) * (1 + coiOf(a1, anc, memo));
            f += c; if (record) record[a1] = (record[a1] || 0) + c;
        }
        memo.set(id, f);
        return f;
    }
    const coiText = f => f === 0 ? '0 %' : (f * 100).toLocaleString('fr-FR', {maximumFractionDigits: f < .01 ? 3 : 2}) + ' %';

    /* ═════════ La liste ═════════ */
    ext.lists.pets = async token => {
        const st = S();
        if (st.hPet && st.hPetView === 'pedigree') return showPedigree(token, st.hPet);
        if (st.hPet) return showPet(token, st.hPet);
        let data; try { data = await api('pets', {q: st.hPetQ || '', species: st.hPetSpecies || ''}); } catch (error) { toast(error.message, 'error'); return; }
        if (!isCurrent(token)) return;
        const rows = data.pets || [];
        const alive = rows.filter(r => !r.deceased).length;
        A().$('#workspace').innerHTML = `<section class="page h-pets"><header class="page-header"><div><span class="eyebrow">LISTES</span><h2>Animaux de compagnie</h2>
            <p>Les animaux de la famille, d’hier et d’aujourd’hui : une fiche complète pour chacun (photos, race, puce, éleveur, santé, souvenirs…), reliée à leurs maîtres. Avec leurs parents, on fait le pedigree d’un animal de race, sa descendance et son taux de consanguinité.</p></div>
            <div class="page-actions"><button type="button" class="button" data-pet-new>🐾 + Nouvel animal</button></div></header>
            <div class="list-toolbar h-pet-toolbar"><div class="search-box" style="position:static;max-width:420px"><div class="search-row"><input data-pet-q placeholder="Nom, race, puce, éleveur, maître…" value="${esc(st.hPetQ || '')}"><button aria-label="Rechercher">⌕</button></div></div>
                <div class="h-pet-chips"><button type="button" class="${!st.hPetSpecies ? 'is-on' : ''}" data-pet-sp="">Tous</button>${Object.entries(SPECIES).map(([k, l]) => `<button type="button" class="${st.hPetSpecies === k ? 'is-on' : ''}" data-pet-sp="${k}">${iconOf(k)} ${esc(l.split(/[ ,(]/)[0])}</button>`).join('')}</div>
                <span class="muted">${fmt(rows.length)} animal${rows.length > 1 ? 'ux' : ''}${rows.length ? ` · ${fmt(alive)} en vie` : ''}</span></div>
            ${rows.length ? `<div class="h-pet-grid">${rows.map(r => `<button type="button" class="h-pet-card ${r.deceased ? 'is-gone' : ''}" data-pet-open="${r.id}">
                <span class="h-pet-cover">${r.media?.[0] ? A().mediaThumbHtml(r.media[0]) : `<span class="h-pet-icon">${iconOf(r.species)}</span>`}</span>
                <span class="h-pet-info"><strong>${esc(r.title)}${r.sex ? ` <span class="h-pet-sex is-${r.sex}">${r.sex === 'M' ? '♂' : '♀'}</span>` : ''}</strong>${r.registered_name && r.registered_name !== r.title ? `<small class="h-pet-reg">${esc(r.registered_name)}</small>` : ''}
                <small>${esc([iconOf(r.species) + ' ' + (r.breed || r.species_label.split(/[ ,(]/)[0]), r.color].filter(Boolean).join(' · '))}</small>
                <small class="muted">${esc(lifespan(r) || 'Dates à compléter')}${r.owners.length ? ' · ' + esc(r.owners.slice(0, 2).join(', ')) : ''}</small>
                <small class="muted">${r.offspring ? `${fmt(r.offspring)} petit${r.offspring > 1 ? 's' : ''} · ` : ''}${r.titles ? `🏆 ${fmt(r.titles)} · ` : ''}${fmt(r.media_count)} photo${r.media_count > 1 ? 's' : ''}</small></span></button>`).join('')}</div>`
                : A().empty(st.hPetQ || st.hPetSpecies ? 'Aucun animal ne correspond.' : 'Aucun animal pour l’instant. « + Nouvel animal » : son nom, sa photo, ses maîtres… et pour un animal de race, ses parents, pour faire son pedigree.')}</section>`;
        const ws = A().$('#workspace');
        let t = 0; ws.querySelector('[data-pet-q]').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { st.hPetQ = e.target.value; ext.lists.pets(++st.workspaceToken); }, 300); });
        ws.querySelectorAll('[data-pet-sp]').forEach(b => b.addEventListener('click', () => { st.hPetSpecies = b.dataset.petSp; ext.lists.pets(++st.workspaceToken); }));
        ws.querySelector('[data-pet-new]').addEventListener('click', () => openEditor(null));
        ws.querySelectorAll('[data-pet-open]').forEach(b => b.addEventListener('click', () => openPet(Number(b.dataset.petOpen))));
    };
    function openPet(id, view = '') { const st = S(); st.hPet = id; st.hPetView = view; st.listType = 'pets'; if (st.module === 'listes') ext.lists.pets(++st.workspaceToken); else A().setModule('listes'); }
    ext.openPet = openPet;
    document.addEventListener('click', e => { const g = e.target.closest?.('[data-pet-goto]'); if (!g) return; e.preventDefault(); openPet(Number(g.dataset.petGoto)); });

    /* ═════════ La fiche d'un animal ═════════ */
    const dl = rows => { const h = rows.filter(([, v]) => v).map(([k, v, raw]) => `<div><dt>${esc(k)}</dt><dd>${raw ? v : esc(v)}</dd></div>`).join(''); return h ? `<dl class="h-pet-dl">${h}</dl>` : ''; };
    const table = (cols, rows) => rows.length ? `<div class="data-table-wrap"><table class="data-table h-pet-table"><thead><tr>${cols.map(c => `<th>${esc(c[1])}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${esc(r[c[0]] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
    const miniPet = (p, role = '') => p ? `<button type="button" class="h-pet-mini" data-pet-goto="${p.id}">${p.photo ? photoHtml(p.photo, 'is-mini') : `<span class="h-pet-mini-ic">${p.sex === 'F' ? '♀' : p.sex === 'M' ? '♂' : '🐾'}</span>`}<span><strong>${esc(p.title)}</strong>${role ? `<small>${esc(role)}</small>` : ''}<small class="muted">${esc([p.registered_name !== p.title && p.registered_name, p.color, lifespan(p)].filter(Boolean).join(' · '))}</small></span></button>` : '';

    async function showPet(token, id) {
        const st = S();
        let p; try { p = await api('pet', {id}); } catch (error) { st.hPet = 0; toast(error.message, 'error'); return ext.lists.pets(++st.workspaceToken); }
        if (!isCurrent(token)) return;
        const d = p.data, anc = p.ancestors || {}, people = p.people || {};
        const f = coi(id, anc), contrib = coi.last || {};
        const parentBox = (pid, name, reg, label) => pid && anc[pid] ? miniPet(anc[pid], label) : name ? `<div class="h-pet-mini is-text"><span class="h-pet-mini-ic">${label.startsWith('Père') ? '♂' : '♀'}</span><span><strong>${esc(name)}</strong><small>${esc(label)} · pas encore dans la base</small>${reg ? `<small class="muted">${esc(reg)}</small>` : ''}</span></div>` : `<div class="h-pet-mini is-empty"><span class="h-pet-mini-ic">?</span><span><small>${esc(label)} inconnu${label.startsWith('Mère') ? 'e' : ''}</small></span></div>`;
        const gp = (pid, which) => { const a = pid && anc[pid]; if (!a) return ''; return `<div class="h-pet-gp">${a.sire_id && anc[a.sire_id] ? miniPet(anc[a.sire_id], `Père de ${which}`) : a.sire_name ? `<div class="h-pet-mini is-text"><span><strong>${esc(a.sire_name)}</strong><small>Père de ${esc(which)}</small></span></div>` : ''}${a.dam_id && anc[a.dam_id] ? miniPet(anc[a.dam_id], `Mère de ${which}`) : a.dam_name ? `<div class="h-pet-mini is-text"><span><strong>${esc(a.dam_name)}</strong><small>Mère de ${esc(which)}</small></span></div>` : ''}</div>`; };
        // portées : les petits regroupés par autre parent et date de naissance
        const litters = {};
        for (const k of p.offspring || []) { const other = k.sire_id === id ? k.dam_id : k.sire_id; const key = other + '|' + (k.birth_date || '?'); (litters[key] = litters[key] || {other, date: k.birth_date, kids: []}).kids.push(k); }
        const mates = Object.fromEntries((p.mates || []).map(m => [m.id, m]));
        const full = (p.siblings || []).filter(s => d.sire_id && d.dam_id && s.sire_id === d.sire_id && s.dam_id === d.dam_id), half = (p.siblings || []).filter(s => !full.includes(s));
        const age = ageOf(d);
        const owners = d.owners.map(o => `<li>${o.person_id ? personLink(o.person_id, people[o.person_id]?.name || o.name) : esc(o.name)} <span class="h-pet-role">${esc(o.role || 'propriétaire')}</span>${o.from || o.to ? ` <small class="muted">${esc([o.from && 'depuis ' + o.from, o.to && 'jusqu’à ' + o.to].filter(Boolean).join(' '))}</small>` : ''}${o.note ? ` <small class="muted">— ${esc(o.note)}</small>` : ''}</li>`).join('');
        const sec = (k, title, body, cls = '') => body ? `<section class="h-pet-sec ${cls}" data-pet-sec="${k}"><h3>${title}</h3>${body}</section>` : '';
        A().$('#workspace').innerHTML = `<section class="page h-pet">
            <header class="page-header h-pet-head"><div class="h-pet-hero">${p.media?.[0] ? photoHtml(p.media[0], 'is-hero') : `<span class="h-pet-hero-ic">${iconOf(d.species)}</span>`}
                <div><span class="eyebrow">${iconOf(d.species)} ${esc(SPECIES[d.species] || 'Animal')}${d.breed ? ' · ' + esc(d.breed) : ''}</span><h2>${esc(p.title)}${d.sex ? ` <span class="h-pet-sex is-${d.sex}">${d.sex === 'M' ? '♂' : '♀'}</span>` : ''}${d.deceased ? ' <span class="h-pet-gone">†</span>' : ''}</h2>
                ${d.registered_name && d.registered_name !== p.title ? `<p class="h-pet-reg">${esc(d.registered_name)}</p>` : ''}<p>${esc([lifespan(d), age && (d.deceased ? 'mort à ' : '') + age, d.color].filter(Boolean).join(' · '))}</p></div></div>
                <div class="page-actions"><button type="button" class="button secondary" data-pet-back>← Tous les animaux</button><button type="button" class="button" data-pet-edit>✎ Modifier</button><button type="button" class="button secondary" data-pet-ped>🌳 Pedigree</button><button type="button" class="button secondary" data-pet-kid>＋ Un petit</button><button type="button" class="button secondary" data-pet-print>🖨️ Imprimer</button><button type="button" class="button secondary danger" data-pet-del>Supprimer</button></div></header>
            ${ext.labelChips ? ext.labelChips(p.labels) : ''}
            <div class="h-pet-body">
            ${sec('identity', '🪪 Identité', dl([['Nom', d.name], ['Nom d’affixe / nom officiel', d.registered_name], ['Appelé', d.call_name], ['Espèce', SPECIES[d.species]], ['Race', d.breed], ['Variété', d.variety], ['Sexe', SEX[d.sex]], ['Stérilisé', d.neutered ? 'oui' + (d.neutered_date ? ' (' + d.neutered_date + ')' : '') : ''],
                ['Robe, couleur', d.color], ['Marques particulières', d.markings], ['Poil', d.coat], ['Yeux', d.eyes], ['Taille', d.height], ['Poids', d.weight], ['Naissance', [d.birth_date, d.birth_place && 'à ' + d.birth_place].filter(Boolean).join(' ')], ['Âge', age],
                ['Décès', [d.death_date, d.death_place && 'à ' + d.death_place].filter(Boolean).join(' ')], ['Cause du décès', d.death_cause], ['Repose', d.burial]]) || '<p class="muted">À compléter avec « ✎ Modifier ».</p>')}
            ${sec('ident', '🔖 Identification et origines', dl([['Puce électronique', d.microchip], ['Tatouage', d.tattoo], ['Passeport', d.passport], ['Livre des origines', d.registry], ['N° d’inscription', d.registration], ['N° de pedigree', d.pedigree_number], ['UELN', d.ueln], ['ADN', d.dna],
                ['Éleveur', d.breeder], ['Affixe', d.affix], ['Adresse de l’élevage', d.breeder_address], ['Portée', d.litter]]))}
            ${sec('parents', `🌳 Parents et pedigree <small class="muted">consanguinité : <strong title="Coefficient de Wright, d’après les ancêtres connus">${coiText(f)}</strong></small>`, `<div class="h-pet-parents"><div>${parentBox(d.sire_id, d.sire_name, d.sire_registration, 'Père')}${gp(d.sire_id, 'son père')}</div><div>${parentBox(d.dam_id, d.dam_name, d.dam_registration, 'Mère')}${gp(d.dam_id, 'sa mère')}</div></div>
                ${Object.keys(contrib).length ? `<p class="muted">Ancêtres communs au père et à la mère : ${Object.entries(contrib).sort((a, b) => b[1] - a[1]).map(([aid, c]) => `<button type="button" class="table-link" data-pet-goto="${aid}">${esc(anc[aid]?.title || '#' + aid)}</button> (${coiText(c)})`).join(', ')}.</p>` : ''}
                <button type="button" class="button small secondary" data-pet-ped2>🌳 Voir le pedigree complet</button>`)}
            ${sec('offspring', `🐾 Descendance <small class="muted">${fmt((p.offspring || []).length)} petit${(p.offspring || []).length > 1 ? 's' : ''}</small>`, Object.keys(litters).length ? Object.values(litters).map(L => `<div class="h-pet-litter"><h4>Portée ${L.date ? 'du ' + esc(L.date) : '(date inconnue)'} ${L.other ? `avec ${mates[L.other] ? `<button type="button" class="table-link" data-pet-goto="${L.other}">${esc(mates[L.other].title)}</button>` : '?'}` : ''} <small class="muted">${L.kids.length} petit${L.kids.length > 1 ? 's' : ''}</small></h4><div class="h-pet-minis">${L.kids.map(k => miniPet(k)).join('')}</div></div>`).join('') : '<p class="muted">Aucun petit dans la base. « ＋ Un petit » crée sa fiche avec ce parent déjà rempli.</p>')}
            ${full.length || half.length ? sec('siblings', '👥 Frères et sœurs', `${full.length ? `<h4>Mêmes parents</h4><div class="h-pet-minis">${full.map(k => miniPet(k)).join('')}</div>` : ''}${half.length ? `<h4>Demi-frères et demi-sœurs</h4><div class="h-pet-minis">${half.map(k => miniPet(k, k.sire_id === d.sire_id ? 'même père' : 'même mère')).join('')}</div>` : ''}`) : ''}
            ${sec('owners', '🏠 Ses maîtres', owners ? `<ul class="h-pet-owners">${owners}</ul>` : '<p class="muted">Relie l’animal aux fiches de ses maîtres : il apparaîtra sur leur fiche.</p>')}
            ${sec('titles', '🏆 Titres, expositions, concours', table([['date', 'Date'], ['event', 'Exposition / concours'], ['place', 'Lieu'], ['title', 'Titre, qualificatif'], ['result', 'Classement'], ['judge', 'Juge']], d.titles))}
            ${sec('health', '🩺 Santé', `${dl([['Vétérinaire', d.vet], ['Assurance', d.insurance], ['Allergies', d.allergies], ['Alimentation', d.food]])}${d.medical ? `<p>${nl(d.medical)}</p>` : ''}${d.vaccines.length ? `<h4>Vaccins et traitements</h4>${table([['date', 'Date'], ['vaccine', 'Vaccin / traitement'], ['vet', 'Vétérinaire'], ['next', 'Rappel']], d.vaccines)}` : ''}${d.tests.length ? `<h4>Tests de santé et ADN</h4>${table([['date', 'Date'], ['test', 'Test'], ['result', 'Résultat'], ['lab', 'Laboratoire / lecteur']], d.tests)}` : ''}`.replace(/^\s*$/, ''))}
            ${sec('measures', '📏 Poids et taille', table([['date', 'Date'], ['weight', 'Poids'], ['height', 'Taille'], ['note', 'Note']], d.measures) + weightChart(d.measures))}
            ${sec('life', '📅 Sa vie', `${d.events.length ? `<ol class="h-pet-timeline">${d.events.map(e => `<li><span class="h-pet-when">${esc(e.date || '—')}</span><span><strong>${esc(e.kind || '')}</strong> ${esc(e.text)}${e.place ? ` <small class="muted">· ${esc(e.place)}</small>` : ''}</span></li>`).join('')}</ol>` : ''}${dl([['Caractère', d.character], ['Habitudes, jeux', d.habits]])}`)}
            ${sec('story', '📖 Son histoire et nos souvenirs', `${d.story ? `<div class="h-transcription">${nl(d.story)}</div>` : ''}${d.memories ? `<h4>Souvenirs</h4><div class="h-transcription">${nl(d.memories)}</div>` : ''}`)}
            ${sec('notes', '🗒️ Notes et sources', `${d.notes ? `<p>${nl(d.notes)}</p>` : ''}${d.sources ? `<p class="muted">${nl(d.sources)}</p>` : ''}`)}
            ${(p.boards || []).length ? sec('boards', `🧩 Tableaux <small class="muted">${fmt(p.boards.length)}</small>`, `<div class="h-pet-minis">${p.boards.map(bd => `<button type="button" class="h-pet-mini" data-bd-goto-board="${bd.id}"><span class="h-pet-mini-ic">🧩</span><span><strong>${esc(bd.title)}</strong>${(bd.parts || []).length ? `<small>${esc(bd.parts.join(' · '))}</small>` : ''}</span></button>`).join('')}</div>`) : ''}
            ${sec('photos', `📷 Photos et documents <small class="muted">${fmt((p.media || []).length)}</small>`, (p.media || []).length && ext.thumbs ? ext.thumbs('pet-' + id, p.media) : '<p class="muted">Ajoute ses photos, son pedigree papier, son carnet de santé… avec « ✎ Modifier ».</p>', 'is-wide')}
            </div>
            <div data-rc-host data-rc-type="pet" data-rc-key="${id}"></div>
        </section>`;
        A().bindTableLinks?.();
        const ws = A().$('#workspace'), again = () => showPet(++st.workspaceToken, id);
        ws.querySelector('[data-pet-back]').addEventListener('click', () => { st.hPet = 0; ext.lists.pets(++st.workspaceToken); });
        ws.querySelector('[data-pet-edit]').addEventListener('click', () => openEditor(p, again));
        ws.querySelectorAll('[data-pet-ped], [data-pet-ped2]').forEach(b => b.addEventListener('click', () => openPet(id, 'pedigree')));
        ws.querySelector('[data-pet-kid]').addEventListener('click', () => openEditor(null, null, {species: d.species, breed: d.breed, registry: d.registry, ...(d.sex === 'F' ? {dam_id: id} : {sire_id: id}), owners: d.owners.filter(o => o.role === 'éleveur' || o.role === 'propriétaire').map(o => ({...o, role: 'éleveur'})), breeder: d.breeder, affix: d.affix}));
        ws.querySelector('[data-pet-print]').addEventListener('click', () => window.print());
        ws.querySelector('[data-pet-del]').addEventListener('click', async () => {
            if (!confirm(`Supprimer la fiche de « ${p.title} » ? Ses photos restent dans les médias ; ses petits gardent leur fiche (son nom reste écrit comme parent).`)) return;
            try { await api('delete_pet', {}, {method: 'POST', body: {id}}); toast('Fiche supprimée.'); st.hPet = 0; ext.lists.pets(++st.workspaceToken); } catch (error) { toast(error.message, 'error'); }
        });
    }
    /** Une petite courbe du poids (si au moins deux mesures chiffrées) */
    function weightChart(rows) {
        const pts = rows.map(r => ({d: parseDate(r.date), w: parseFloat(String(r.weight || '').replace(',', '.'))})).filter(x => x.d && Number.isFinite(x.w)).sort((a, b) => a.d - b.d);
        if (pts.length < 2) return '';
        const W = 520, H = 140, P = 30, t0 = pts[0].d.getTime(), t1 = pts[pts.length - 1].d.getTime() || t0 + 1, w0 = Math.min(...pts.map(p => p.w)), w1 = Math.max(...pts.map(p => p.w)) || w0 + 1;
        const X = t => P + (t - t0) / Math.max(1, t1 - t0) * (W - 2 * P), Y = w => H - P - (w - w0) / Math.max(.001, w1 - w0) * (H - 2 * P);
        return `<svg class="h-pet-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Courbe du poids"><line x1="${P}" y1="${H - P}" x2="${W - P}" y2="${H - P}" stroke="currentColor" stroke-opacity=".25"/><polyline fill="none" stroke="#2a7de1" stroke-width="2.5" points="${pts.map(p => `${X(p.d.getTime()).toFixed(1)},${Y(p.w).toFixed(1)}`).join(' ')}"/>${pts.map(p => `<circle cx="${X(p.d.getTime()).toFixed(1)}" cy="${Y(p.w).toFixed(1)}" r="3.5" fill="#2a7de1"><title>${p.d.toLocaleDateString('fr-FR')} : ${p.w}</title></circle>`).join('')}<text x="${P}" y="${P - 10}" font-size="11" fill="currentColor" opacity=".6">${w1}</text><text x="${P}" y="${H - P + 14}" font-size="11" fill="currentColor" opacity=".6">${w0}</text></svg>`;
    }

    /* ═════════ Le pedigree : n générations, ancêtres communs en couleur ═════════ */
    async function showPedigree(token, id) {
        const st = S(), gens = Math.max(2, Math.min(8, Number(st.hPetGens) || 4));
        let r; try { r = await api('pet_pedigree', {id, gens: Math.max(gens, 8)}); } catch (error) { toast(error.message, 'error'); return; }
        if (!isCurrent(token)) return;
        const anc = r.ancestors || {}, me = anc[id];
        if (!me) { st.hPetView = ''; return showPet(token, id); }
        const f = coi(id, anc), contrib = coi.last || {};
        // les cases : génération g (1 = parents), position i ; un ancêtre présent plusieurs fois a sa couleur
        const slots = []; const walk = (x, g, i, name, reg) => { if (g > gens) return; slots.push({g, i, p: x && anc[x], name, reg}); const a = x && anc[x]; walk(a?.sire_id || 0, g + 1, i * 2, a?.sire_name || '', ''); walk(a?.dam_id || 0, g + 1, i * 2 + 1, a?.dam_name || '', ''); };
        walk(me.sire_id, 1, 0, me.sire_name, ''); walk(me.dam_id, 1, 1, me.dam_name, '');
        const count = {}; slots.forEach(s => { if (s.p) count[s.p.id] = (count[s.p.id] || 0) + 1; });
        const COLORS = ['#ffe08a', '#b9e6ff', '#ffc9de', '#c8f2c2', '#e3d1ff', '#ffd5b0', '#d0f0ef'];
        const colorOf = {}; Object.keys(count).filter(k => count[k] > 1).forEach((k, n) => { colorOf[k] = COLORS[n % COLORS.length]; });
        const rows = 2 ** gens;
        const cell = s => { const span = rows / 2 ** s.g, row = s.i * span + 1; const p = s.p;
            return `<div class="h-ped-cell g${s.g} ${s.i % 2 ? 'is-dam' : 'is-sire'} ${p ? '' : 'is-empty'}" style="grid-column:${s.g};grid-row:${row} / span ${span};${p && colorOf[p.id] ? `background:${colorOf[p.id]}` : ''}">${p ? `<button type="button" class="h-ped-name" data-pet-goto="${p.id}">${esc(p.title)}</button>${p.registered_name && p.registered_name !== p.title ? `<small class="h-ped-reg">${esc(p.registered_name)}</small>` : ''}${s.g <= 3 ? `<small>${esc([p.color, p.birth_date && '° ' + p.birth_date].filter(Boolean).join(' · '))}</small>` : ''}${p.registration && s.g <= 4 ? `<small class="muted">${esc(p.registration)}</small>` : ''}${p.titles.length && s.g <= 4 ? `<small class="h-ped-titles">🏆 ${esc(p.titles.slice(0, 3).join(', '))}</small>` : ''}`
                : s.name ? `<span class="h-ped-name is-text">${esc(s.name)}</span><small class="muted">pas dans la base</small>` : '<span class="muted">—</span>'}</div>`; };
        A().$('#workspace').innerHTML = `<section class="page h-pedigree"><header class="page-header"><div><span class="eyebrow">PEDIGREE</span><h2>${esc(me.title)}${me.sex ? ` <span class="h-pet-sex is-${me.sex}">${me.sex === 'M' ? '♂' : '♀'}</span>` : ''}</h2>
                <p>${esc([me.registered_name !== me.title && me.registered_name, me.breed, me.color, me.birth_date && 'né' + (me.sex === 'F' ? 'e' : '') + ' le ' + me.birth_date, me.registration].filter(Boolean).join(' · '))}</p>
                <p>Consanguinité (Wright, sur les ancêtres connus) : <strong>${coiText(f)}</strong>${Object.keys(contrib).length ? ` — ancêtres communs : ${Object.entries(contrib).sort((a, b) => b[1] - a[1]).map(([aid, c]) => `<span class="h-ped-common" style="background:${colorOf[aid] || '#eee'}">${esc(anc[aid]?.title || '#' + aid)} ${coiText(c)}</span>`).join(' ')}` : ''}</p></div>
                <div class="page-actions"><button type="button" class="button secondary" data-ped-back>← La fiche</button><label class="h-ped-gens">Générations <select data-ped-gens>${[2, 3, 4, 5, 6, 7, 8].map(n => `<option ${n === gens ? 'selected' : ''}>${n}</option>`).join('')}</select></label><button type="button" class="button secondary" data-ped-csv>⬇ Tableur (CSV)</button><button type="button" class="button" data-ped-print>🖨️ Imprimer</button></div></header>
            <div class="h-ped-wrap"><div class="h-ped" style="grid-template-columns:repeat(${gens},minmax(${gens > 5 ? 120 : 170}px,1fr));grid-template-rows:repeat(${rows},minmax(${gens > 5 ? 18 : 26}px,auto))">${slots.map(cell).join('')}</div></div>
            <p class="muted">Haut de chaque bloc : côté père ; bas : côté mère. Une couleur = un ancêtre qui revient plusieurs fois. Clique un nom pour ouvrir sa fiche.</p></section>`;
        const ws = A().$('#workspace');
        ws.querySelector('[data-ped-back]').addEventListener('click', () => openPet(id));
        ws.querySelector('[data-ped-gens]').addEventListener('change', e => { st.hPetGens = Number(e.target.value); showPedigree(++st.workspaceToken, id); });
        ws.querySelector('[data-ped-print]').addEventListener('click', () => window.print());
        ws.querySelector('[data-ped-csv]').addEventListener('click', () => {
            const lab = (g, i) => { let s = ''; let x = i; for (let k = g; k > 0; k--) { s = (x % 2 ? 'M' : 'P') + s; x = Math.floor(x / 2); } return s; };
            const q = v => /[";\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? '');
            const csv = '﻿' + [['Génération', 'Position (P = père, M = mère)', 'Nom', 'Nom officiel', 'Sexe', 'Race', 'Robe', 'Naissance', 'Inscription', 'Titres'].join(';'), ...slots.map(s => [s.g, lab(s.g, s.i), s.p?.title || s.name, s.p?.registered_name || '', s.p?.sex || '', s.p?.breed || '', s.p?.color || '', s.p?.birth_date || '', s.p?.registration || '', (s.p?.titles || []).join(', ')].map(q).join(';'))].join('\n');
            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'})); a.download = `Pedigree ${me.title}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        });
    }

    /* ═════════ L'éditeur ═════════ */
    const LISTS = {
        owners: {label: 'maître', cols: [['person', 'Fiche (ou nom)'], ['role', 'Rôle', OWNER_ROLES], ['from', 'Depuis'], ['to', 'Jusqu’à'], ['note', 'Note']]},
        titles: {label: 'titre', cols: [['date', 'Date'], ['event', 'Exposition, concours'], ['place', 'Lieu'], ['title', 'Titre, qualificatif'], ['result', 'Classement'], ['judge', 'Juge']]},
        vaccines: {label: 'vaccin ou traitement', cols: [['date', 'Date'], ['vaccine', 'Vaccin, traitement'], ['vet', 'Vétérinaire'], ['next', 'Rappel le']]},
        tests: {label: 'test', cols: [['date', 'Date'], ['test', 'Test (hanches, yeux, ADN…)'], ['result', 'Résultat'], ['lab', 'Laboratoire, lecteur']]},
        measures: {label: 'mesure', cols: [['date', 'Date'], ['weight', 'Poids (kg)'], ['height', 'Taille (cm)'], ['note', 'Note']]},
        events: {label: 'moment', cols: [['date', 'Date'], ['kind', 'Quoi', EVENT_KINDS], ['text', 'Ce qui s’est passé'], ['place', 'Lieu']]},
    };
    let rowSeq = 0;
    function rowHtml(list, r = {}) {
        const n = 'r' + (++rowSeq);
        return `<div class="h-pet-row" data-pet-row="${list}">${LISTS[list].cols.map(([k, l, opts]) => k === 'person'
            ? `<label class="h-pet-pf">${esc(l)}<span class="collection-person-field"><input type="text" data-cp-input="pp_${n}" value="${esc(r.name || '')}" placeholder="Tape un nom…" autocomplete="off"><input type="hidden" name="pp_${n}" value="${Number(r.person_id) || ''}" data-pet-pid><span class="collection-person-list" hidden></span></span></label>`
            : opts ? `<label>${esc(l)}<select data-k="${k}">${[...new Set(['', ...opts, r[k] || ''])].map(o => `<option ${o === (r[k] || '') ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`
            : `<label>${esc(l)}<input data-k="${k}" value="${esc(r[k] || '')}"></label>`).join('')}<button type="button" class="h-pet-x" data-pet-rowdel title="Retirer" aria-label="Retirer">×</button></div>`;
    }
    const readRows = (form, list) => [...form.querySelectorAll(`[data-pet-row="${list}"]`)].map(row => {
        const o = {}; row.querySelectorAll('[data-k]').forEach(x => { o[x.dataset.k] = x.value.trim(); });
        if (list === 'owners') { o.person_id = Number(row.querySelector('[data-pet-pid]').value) || 0; o.name = row.querySelector('[data-cp-input]').value.trim(); }
        return o;
    });
    async function openEditor(p, done, preset = {}) {
        const d = p?.data || {species: 'chien', owners: [], titles: [], vaccines: [], tests: [], measures: [], events: [], ...preset};
        let all = []; try { all = (await api('pets', {})).pets || []; } catch (_) {}
        const others = all.filter(x => x.id !== p?.id);
        const parentSel = (k, sex) => `<select name="${k}"><option value="">— pas dans la base —</option>${others.filter(x => !x.sex || x.sex === sex || Number(d[k]) === x.id).map(x => `<option value="${x.id}" ${Number(d[k]) === x.id ? 'selected' : ''}>${esc(x.title)}${x.registered_name && x.registered_name !== x.title ? ' — ' + esc(x.registered_name) : ''}${x.breed ? ' (' + esc(x.breed) + ')' : ''}</option>`).join('')}</select>`;
        const f = (name, label, ph = '', type = 'text') => `<label>${esc(label)}<input type="${type}" name="${name}" value="${esc(d[name] || '')}" placeholder="${esc(ph)}"></label>`;
        const area = (name, label, rows, ph = '') => `<label class="span-2">${esc(label)}<textarea name="${name}" rows="${rows}" placeholder="${esc(ph)}">${esc(d[name] || '')}</textarea></label>`;
        const listBox = list => `<div data-pet-list="${list}">${(d[list] || []).map(r => rowHtml(list, r)).join('')}</div><button type="button" class="button small secondary" data-pet-add="${list}">+ ${esc(LISTS[list].label)}</button>`;
        ext.openDialog({eyebrow: 'ANIMAL', title: p ? p.title : 'Nouvel animal', wide: true, labels: ['pet', p?.labels || []],
            body: `<div class="h-pet-editor">
                <nav class="h-bk-nav">${[['pe1', '🪪 Identité'], ['pe2', '🔖 Identification'], ['pe3', '🌳 Parents'], ['pe4', '🏠 Maîtres'], ['pe5', '🏆 Titres'], ['pe6', '🩺 Santé'], ['pe7', '📏 Mesures'], ['pe8', '📅 Vie'], ['pe9', '📖 Histoire'], ['pe10', '📷 Photos']].map(([k, l]) => `<a href="#${k}" data-pet-jump="${k}">${l}</a>`).join('')}</nav>
                <section id="pe1"><h3>🪪 Identité</h3><div class="form-grid">${f('name', 'Nom', 'Médor')}${f('registered_name', 'Nom d’affixe / nom officiel (LOF, LOOF…)', 'Médor du Val de Loire')}${f('call_name', 'Appelé', 'Mémé')}
                    <label>Espèce <select name="species">${Object.entries(SPECIES).map(([k, l]) => `<option value="${k}" ${d.species === k ? 'selected' : ''}>${iconOf(k)} ${esc(l)}</option>`).join('')}</select></label>${f('breed', 'Race', 'Berger allemand')}${f('variety', 'Variété', 'poil long')}
                    <label>Sexe <select name="sex"><option value="">?</option><option value="M" ${d.sex === 'M' ? 'selected' : ''}>♂ mâle</option><option value="F" ${d.sex === 'F' ? 'selected' : ''}>♀ femelle</option></select></label>
                    <label class="checkbox-line"><input type="checkbox" name="neutered" ${d.neutered ? 'checked' : ''}> <span>stérilisé(e)</span></label>${f('neutered_date', 'Stérilisé(e) le')}
                    ${f('color', 'Robe, couleur', 'noir et feu')}${f('markings', 'Marques particulières', 'liste blanche, oreille tachée…')}${f('coat', 'Poil', 'court, dur…')}${f('eyes', 'Yeux', 'marron')}${f('height', 'Taille (au garrot)', '62 cm')}${f('weight', 'Poids', '34 kg')}
                    ${f('birth_date', 'Né(e) le', '12/04/2015')}${f('birth_place', 'à', 'Tours, chez l’éleveur…')}<label class="checkbox-line"><input type="checkbox" name="deceased" ${d.deceased ? 'checked' : ''}> <span>décédé(e)</span></label>${f('death_date', 'Mort(e) le')}${f('death_place', 'à')}${f('death_cause', 'Cause')}${f('burial', 'Repose (jardin, cimetière animalier, cendres…)')}</div></section>
                <section id="pe2"><h3>🔖 Identification et origines</h3><div class="form-grid">${f('microchip', 'Puce électronique (15 chiffres)', '250268…')}${f('tattoo', 'Tatouage', '2ABC123')}${f('passport', 'Passeport')}
                    <label>Livre des origines <input name="registry" list="pet-registries" value="${esc(d.registry || '')}"><datalist id="pet-registries">${REGISTRIES.map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>${f('registration', 'N° d’inscription', 'LOF 2 BA 12345/0')}${f('pedigree_number', 'N° de pedigree')}${f('ueln', 'UELN (chevaux)')}${f('dna', 'Profil ADN, tests de parenté')}
                    ${f('breeder', 'Éleveur')}${f('affix', 'Affixe (nom de l’élevage)', 'du Val de Loire')}${f('breeder_address', 'Adresse de l’élevage')}${f('litter', 'Portée (n°, lettre de l’année…)', 'portée « M » 2015')}</div></section>
                <section id="pe3"><h3>🌳 Parents</h3><p class="muted">Choisis le père et la mère s’ils ont une fiche (pour le pedigree sur plusieurs générations) ; sinon écris leur nom.</p><div class="form-grid">
                    <label>Père (dans la base) ${parentSel('sire_id', 'M')}</label>${f('sire_name', 'ou son nom', 'Rex des Grands Prés')}${f('sire_registration', 'Son inscription')}
                    <label>Mère (dans la base) ${parentSel('dam_id', 'F')}</label>${f('dam_name', 'ou son nom', 'Flora du Moulin')}${f('dam_registration', 'Son inscription')}</div></section>
                <section id="pe4"><h3>🏠 Ses maîtres</h3><p class="muted">Relie les fiches de la famille : l’animal apparaîtra sur leur fiche (bloc « Animaux de compagnie »).</p>${listBox('owners')}</section>
                <section id="pe5"><h3>🏆 Titres, expositions, concours</h3>${listBox('titles')}</section>
                <section id="pe6"><h3>🩺 Santé</h3><div class="form-grid">${f('vet', 'Vétérinaire')}${f('insurance', 'Assurance')}${f('allergies', 'Allergies, intolérances')}${f('food', 'Alimentation')}${area('medical', 'Santé : maladies, opérations, traitements', 3)}</div>
                    <h4>Vaccins et traitements</h4>${listBox('vaccines')}<h4>Tests de santé et ADN</h4>${listBox('tests')}</section>
                <section id="pe7"><h3>📏 Poids et taille</h3>${listBox('measures')}</section>
                <section id="pe8"><h3>📅 Sa vie</h3>${listBox('events')}<div class="form-grid">${area('character', 'Caractère', 3, 'joueur, peureux de l’orage…')}${area('habits', 'Habitudes, jeux, tours appris', 3)}</div></section>
                <section id="pe9"><h3>📖 Son histoire et nos souvenirs</h3><div class="form-grid">${area('story', 'Son histoire', 6, 'Comment il est arrivé dans la famille…')}${area('memories', 'Souvenirs, anecdotes', 6)}${area('notes', 'Notes', 3)}${area('sources', 'Sources (certificat, pedigree, carnet de santé…)', 2)}</div></section>
                <section id="pe10"><h3>📷 Photos et documents</h3>${ext.mediaEditorHtml ? ext.mediaEditorHtml('pet', p?.id || 0, p?.media || [], [['', 'Photos', 'image/*,video/*'], ['document', 'Documents (pedigree, carnet, certificat)', 'image/*,application/pdf']]) : ''}${p?.id ? '' : '<p class="muted">Les recueils se relient à l’animal une fois enregistré (en bas de sa fiche).</p>'}</section>
            </div>`,
            onOpen: dlg => {
                const body = dlg.querySelector('.h-dialog-body') || dlg;
                A().bindCollectionPersonFields(body);
                body.addEventListener('click', e => {
                    const j = e.target.closest('[data-pet-jump]'); if (j) { e.preventDefault(); dlg.querySelector('#' + j.dataset.petJump)?.scrollIntoView({behavior: 'smooth', block: 'start'}); return; }
                    const add = e.target.closest('[data-pet-add]'); if (add) { const box = body.querySelector(`[data-pet-list="${add.dataset.petAdd}"]`); box.insertAdjacentHTML('beforeend', rowHtml(add.dataset.petAdd)); A().bindCollectionPersonFields(box.lastElementChild); box.lastElementChild.querySelector('input, select')?.focus(); return; }
                    if (e.target.closest('[data-pet-rowdel]')) e.target.closest('.h-pet-row').remove();
                });
            },
            onSubmit: async form => {
                const val = A().formObject(form), data = {};
                for (const k of ['name', 'registered_name', 'call_name', 'species', 'breed', 'variety', 'sex', 'neutered_date', 'color', 'markings', 'coat', 'eyes', 'height', 'weight', 'birth_date', 'birth_place', 'death_date', 'death_place', 'death_cause', 'burial',
                    'microchip', 'tattoo', 'passport', 'registry', 'registration', 'pedigree_number', 'ueln', 'dna', 'breeder', 'affix', 'breeder_address', 'litter', 'sire_name', 'dam_name', 'sire_registration', 'dam_registration',
                    'vet', 'insurance', 'allergies', 'food', 'medical', 'character', 'habits', 'story', 'memories', 'notes', 'sources']) data[k] = form.elements[k]?.value?.trim?.() ?? '';
                data.neutered = form.elements.neutered.checked; data.deceased = form.elements.deceased.checked;
                data.sire_id = Number(form.elements.sire_id.value) || 0; data.dam_id = Number(form.elements.dam_id.value) || 0;
                for (const list of Object.keys(LISTS)) data[list] = readRows(form, list);
                if (!data.name && !data.registered_name && !data.call_name) { toast('Donne au moins un nom à l’animal.', 'error'); return false; }
                const saved = await api('save_pet', {}, {method: 'POST', body: {id: p?.id || 0, data, pending_labels: val.pending_labels}});
                const id = Number(saved.result?.id || saved.id);
                if (ext.uploadMediaEditor) await ext.uploadMediaEditor(form, 'pet', id);
                toast('Fiche de l’animal enregistrée.');
                if (done) done(); else openPet(id);
            },
        });
    }
    ext.openPetEditor = openEditor;

    /* ═════════ Bloc de la fiche d'une personne ═════════ */
    ext.personBlocks.pets = (index, detail) => {
        const list = detail.heritage?.pets || [];
        const pid = Number(detail.person?.id || detail.id || 0);
        return A().card(index, '🐾 Animaux de compagnie', list.length || '', list.length ? `<div class="h-pet-minis">${list.map(p => `<button type="button" class="h-pet-mini" data-pet-goto="${p.id}">${p.photo ? photoHtml(p.photo, 'is-mini') : `<span class="h-pet-mini-ic">🐾</span>`}<span><strong>${esc(p.title)}</strong><small>${esc([p.species.split(/[ ,(]/)[0], p.breed].filter(Boolean).join(' · '))}</small><small class="muted">${esc([p.role !== 'propriétaire' && p.role, lifespan(p), (p.from || p.to) && [p.from && 'depuis ' + p.from, p.to && 'jusqu’à ' + p.to].filter(Boolean).join(' ')].filter(Boolean).join(' · '))}</small></span></button>`).join('')}</div>`
            : '<p class="muted">Aucun animal relié à cette fiche.</p>', 'span-12', pid ? `<button type="button" class="button small secondary" data-pet-newfor="${pid}">+ Un animal</button>` : '');
    };
    document.addEventListener('click', async e => {
        const b = e.target.closest?.('[data-pet-newfor]'); if (!b) return;
        const pid = Number(b.dataset.petNewfor); let name = '';
        try { const d = await api('person', {id: pid}); name = A().personName(d.person); } catch (_) {}
        openEditor(null, () => { A().setModule('personnes'); }, {owners: [{person_id: pid, name, role: 'propriétaire'}]});
    });

    /* ═════════ Widget du tableau de bord ═════════ */
    ext.dashboard.pets_widget = {load: () => api('pets', {}), render: (index, widget, span, data) => {
        const rows = data?.pets || [], alive = rows.filter(r => !r.deceased);
        // anniversaires des 30 prochains jours
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const soon = rows.filter(r => !r.deceased).map(r => { const b = parseDate(r.birth_date); if (!b || !/\d{1,2}[/.-]\d{1,2}[/.-]\d{4}|\d{4}-\d{1,2}-\d{1,2}/.test(r.birth_date)) return null; const n = new Date(today.getFullYear(), b.getMonth(), b.getDate()); if (n < today) n.setFullYear(n.getFullYear() + 1); const days = Math.round((n - today) / 864e5); return days <= 30 ? {r, days, age: n.getFullYear() - b.getFullYear()} : null; }).filter(Boolean).sort((a, b) => a.days - b.days);
        const shown = (alive.length ? alive : rows).slice(0, 12);
        return A().card(index, 'Animaux de compagnie', rows.length || '', rows.length ? `${soon.length ? `<p class="h-pet-bday">🎂 ${soon.map(s => `<button type="button" class="table-link" data-pet-goto="${s.r.id}">${esc(s.r.title)}</button> ${s.days ? `dans ${s.days} jour${s.days > 1 ? 's' : ''}` : 'aujourd’hui'} (${s.age} an${s.age > 1 ? 's' : ''})`).join(' · ')}</p>` : ''}
            <div class="h-pet-wgrid">${shown.map(r => `<button type="button" class="h-pet-wcard ${r.deceased ? 'is-gone' : ''}" data-pet-goto="${r.id}">${r.media?.[0] ? A().mediaThumbHtml(r.media[0]) : `<span class="h-pet-icon">${iconOf(r.species)}</span>`}<strong>${esc(r.title)}</strong><small>${esc(r.breed || r.species_label.split(/[ ,(]/)[0])}</small></button>`).join('')}</div>
            ${alive.length < rows.length ? `<p class="muted">${fmt(rows.length - alive.length)} animal${rows.length - alive.length > 1 ? 'ux' : ''} disparu${rows.length - alive.length > 1 ? 's' : ''} dans la liste.</p>` : ''}`
            : '<p class="muted">Aucun animal. Listes → Animaux de compagnie → « + Nouvel animal ».</p>', span, '<button type="button" class="button small secondary" data-pet-all>Tous</button>');
    }};
    document.addEventListener('click', e => { if (e.target.closest?.('[data-pet-all]')) { const st = S(); st.hPet = 0; st.listType = 'pets'; A().setModule('listes'); } });
    ext.petsInternals = {coi, ageOf, parseDate}; // pour les essais
})();
