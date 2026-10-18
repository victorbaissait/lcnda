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
    const SPECIES_ICON0 = {chien: '🐕', chat: '🐈', cheval: '🐎', lapin: '🐇', rongeur: '🐹', oiseau: '🐦', poisson: '🐟', reptile: '🐢', ferme: '🐄', autre: '🐾'};
    const SPECIES0 = {chien: 'Chien', chat: 'Chat', cheval: 'Cheval, poney, âne', lapin: 'Lapin', rongeur: 'Rongeur (cochon d’Inde, hamster…)', oiseau: 'Oiseau', poisson: 'Poisson', reptile: 'Reptile, tortue', ferme: 'Animal de la ferme (vache, chèvre, mouton…)', autre: 'Autre'};
    /* Réglages des animaux (Maintenance → Réglages des animaux) : espèces (les siennes, ordre, cachées), parties et champs du formulaire, pour tous ou par espèce */
    const PREFS_KEY = 'genealogie-pet-prefs';
    const EDITOR_SECS = [['pe1', '🪪 Identité'], ['pe2', '🔖 Identification'], ['pe3', '🌳 Parents'], ['pe4', '🏠 Maîtres'], ['pe5', '🏆 Titres'], ['pe6', '🩺 Santé'], ['pe7', '📏 Mesures'], ['pe8', '📅 Vie'], ['pe9', '📖 Histoire'], ['pe10', '📷 Photos']];
    // tous les champs du formulaire, partie par partie, dans l'ordre de l'app (nom et espèce : toujours montrés)
    const FIELDS = [['pe1', 'name', 'Nom'], ['pe1', 'registered_name', 'Nom d’affixe / nom officiel'], ['pe1', 'call_name', 'Appelé'], ['pe1', 'species', 'Espèce'], ['pe1', 'breed', 'Race'], ['pe1', 'variety', 'Variété'], ['pe1', 'sex', 'Sexe'], ['pe1', 'neutered', 'Stérilisé(e)'], ['pe1', 'color', 'Robe, couleur'], ['pe1', 'markings', 'Marques particulières'], ['pe1', 'coat', 'Poil'], ['pe1', 'eyes', 'Yeux'], ['pe1', 'height', 'Taille'], ['pe1', 'weight', 'Poids'], ['pe1', 'birth', 'Naissance (date, lieu)'], ['pe1', 'death', 'Décès (date, lieu, cause, repose)'],
        ['pe2', 'microchip', 'Puce électronique'], ['pe2', 'tattoo', 'Tatouage'], ['pe2', 'passport', 'Passeport'], ['pe2', 'registry', 'Livre des origines'], ['pe2', 'registration', 'N° d’inscription'], ['pe2', 'pedigree_number', 'N° de pedigree'], ['pe2', 'ueln', 'UELN (chevaux)'], ['pe2', 'dna', 'ADN'], ['pe2', 'breeder', 'Éleveur'], ['pe2', 'affix', 'Affixe'], ['pe2', 'breeder_address', 'Adresse de l’élevage'], ['pe2', 'litter', 'Portée'],
        ['pe3', 'sire_id', 'Père (dans la base)'], ['pe3', 'sire_name', 'Nom du père'], ['pe3', 'sire_registration', 'Inscription du père'], ['pe3', 'dam_id', 'Mère (dans la base)'], ['pe3', 'dam_name', 'Nom de la mère'], ['pe3', 'dam_registration', 'Inscription de la mère'],
        ['pe4', 'owners', 'Ses maîtres (liste)'], ['pe5', 'titles', 'Titres et concours (liste)'],
        ['pe6', 'vet', 'Vétérinaire'], ['pe6', 'insurance', 'Assurance'], ['pe6', 'allergies', 'Allergies'], ['pe6', 'food', 'Alimentation'], ['pe6', 'medical', 'Santé (texte)'], ['pe6', 'vaccines', 'Vaccins et traitements'], ['pe6', 'tests', 'Tests de santé et ADN'],
        ['pe7', 'measures', 'Relevés de poids et taille'], ['pe8', 'events', 'Les moments de sa vie'], ['pe8', 'character', 'Caractère'], ['pe8', 'habits', 'Habitudes, jeux'],
        ['pe9', 'story', 'Son histoire'], ['pe9', 'memories', 'Souvenirs'], ['pe9', 'notes', 'Notes'], ['pe9', 'sources', 'Sources'], ['pe10', 'media', 'Photos et documents']];
    const LOCKED = ['name', 'species'];
    const FTYPES = [['text', 'Texte court'], ['textarea', 'Texte long'], ['date', 'Date'], ['number', 'Nombre'], ['check', 'Case oui / non'], ['select', 'Liste de choix']];
    const allSecs = pr => [...EDITOR_SECS, ...pr.customSecs.map(c => [c.k, `${c.icon} ${c.label}`])];
    const allFields = pr => [...FIELDS, ...pr.customFields.map(f => [f.sec, f.k, f.label])];
    const prefsDefault = () => ({species: [], speciesOrder: Object.keys(SPECIES0), speciesHidden: [], customSecs: [], customFields: [], cfg: {'*': {hidden: [], fields: ['ueln']}, cheval: {hidden: [], fields: []}}});
    // un réglage (ordre des parties, parties cachées, champs cachés, ordre des champs) remis d'aplomb
    function cleanCfg(c, pr) {
        const secs = allSecs(pr).map(x => x[0]), fl = allFields(pr), arr = v => Array.isArray(v) ? v : [];
        const order = [...arr(c?.order).filter(k => secs.includes(k)), ...secs.filter(k => !arr(c?.order).includes(k))];
        const forder = {}; secs.forEach(sk => { const keys = fl.filter(x => x[0] === sk).map(x => x[1]), saved = arr(c?.forder?.[sk]).filter(k => keys.includes(k)); forder[sk] = [...saved, ...keys.filter(k => !saved.includes(k))]; });
        return {order, hidden: arr(c?.hidden).filter(k => k !== 'pe1' && secs.includes(k)), fields: arr(c?.fields).filter(k => !LOCKED.includes(k) && fl.some(x => x[1] === k)), forder};
    }
    function petPrefs() {
        let v = null; try { v = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'); } catch (_) {}
        const d = prefsDefault(); if (!v || typeof v !== 'object') v = d;
        const str = (x, n, def) => String(x ?? def).replace(/[<>"`]/g, '').slice(0, n); // ni balise ni guillemet : ces noms sont écrits tels quels dans la page
        const species = (Array.isArray(v.species) ? v.species : []).filter(x => x && /^my_[a-z0-9_-]{1,30}$/.test(String(x.k))).map(x => ({k: String(x.k), label: str(x.label, 60, 'Espèce'), icon: str(x.icon || '🐾', 4)})).slice(0, 60);
        const customSecs = (Array.isArray(v.customSecs) ? v.customSecs : []).filter(x => x && /^cs_[a-z0-9]{1,30}$/.test(String(x.k))).map(x => ({k: String(x.k), label: str(x.label, 60, 'Catégorie'), icon: str(x.icon || '🗂️', 4)})).slice(0, 30);
        const secKeys = [...EDITOR_SECS.map(x => x[0]), ...customSecs.map(x => x.k)];
        const customFields = (Array.isArray(v.customFields) ? v.customFields : []).filter(x => x && /^cf_[a-z0-9_-]{1,30}$/.test(String(x.k)) && secKeys.includes(x.sec)).map(x => ({k: String(x.k), label: str(x.label, 80, 'Champ'), type: FTYPES.some(t => t[0] === x.type) ? x.type : 'text', options: str(x.options, 600, ''), sec: x.sec})).slice(0, 200);
        const pr = {species, customSecs, customFields};
        const keys = [...Object.keys(SPECIES0), ...species.map(x => x.k)];
        const cfg = {}; Object.entries(v.cfg && typeof v.cfg === 'object' ? v.cfg : d.cfg).forEach(([k, c]) => { if (k === '*' || keys.includes(k)) cfg[k] = cleanCfg(c, pr); }); if (!cfg['*']) cfg['*'] = cleanCfg(d.cfg['*'], pr);
        return {...pr, speciesOrder: [...(Array.isArray(v.speciesOrder) ? v.speciesOrder : []).filter(k => keys.includes(k)), ...keys.filter(k => !(v.speciesOrder || []).includes(k))], speciesHidden: (Array.isArray(v.speciesHidden) ? v.speciesHidden : []).filter(k => keys.includes(k)), cfg};
    }
    const savePetPrefs = pr => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(pr)); } catch (_) { toast('Réglages trop lourds pour être gardés.', 'error'); } refreshSpecies(); };
    // ensembles de réglages enregistrés (Maintenance → Réglages des animaux → 💾)
    const PRESETS_KEY = 'genealogie-pet-presets';
    const presets = () => { try { const v = JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]'); return Array.isArray(v) ? v.filter(x => x && typeof x.name === 'string' && x.prefs && typeof x.prefs === 'object').slice(0, 50) : []; } catch (_) { return []; } };
    const savePresets = list => { try { localStorage.setItem(PRESETS_KEY, JSON.stringify(list.slice(0, 50))); } catch (_) { toast('Ensembles trop lourds pour être gardés.', 'error'); } };
    const SPECIES = {}, SPECIES_ICON = {};
    function refreshSpecies() { const pr = petPrefs(); Object.keys(SPECIES).forEach(k => delete SPECIES[k]); Object.keys(SPECIES_ICON).forEach(k => delete SPECIES_ICON[k]); pr.speciesOrder.forEach(k => { const own = pr.species.find(x => x.k === k); SPECIES[k] = own ? own.label : SPECIES0[k]; SPECIES_ICON[k] = own ? own.icon : SPECIES_ICON0[k]; }); }
    refreshSpecies();
    window.addEventListener('storage', e => { if (e.key === PREFS_KEY) refreshSpecies(); });
    // le nom d'une espèce, même supprimée des réglages (elle compte alors comme « Autre »)
    const speciesLabel = k => SPECIES[k] || (k ? SPECIES0.autre : '');
    ext.speciesLabel = speciesLabel; ext.speciesIcon = k => SPECIES_ICON[k] || '🐾';
    const visibleSpecies = cur => Object.entries(SPECIES).filter(([k]) => !petPrefs().speciesHidden.includes(k) || k === cur);
    const cfgFor = sp => { const pr = petPrefs(); return pr.cfg[sp] || pr.cfg['*']; };

    const SEX = {M: '♂ mâle', F: '♀ femelle'};
    const REGISTRIES = ['LOF (chiens, France)', 'LOOF (chats, France)', 'SIRE / IFCE (chevaux, France)', 'Stud-book', 'FCI', 'Kennel Club', 'AKC', 'TICA', 'FIFe', 'Livre généalogique de la race', 'Autre'];
    const OWNER_ROLES = ['propriétaire', 'co-propriétaire', 'éleveur', 'gardien', 'famille d’accueil', 'autre'];
    const EVENT_KINDS = ['arrivée', 'adoption', 'déménagement', 'exposition', 'concours', 'saillie', 'mise bas / portée', 'naissance des petits', 'stérilisation', 'maladie', 'opération', 'accident', 'perte / fugue', 'retrouvé', 'départ', 'décès', 'souvenir', 'autre'];
    const photoHtml = (m, cls = '') => m ? `<span class="h-pet-photo ${cls}">${A().mediaThumbHtml(m)}</span>` : '';
    const iconOf = sp => SPECIES_ICON[sp] || '🐾';
    const baseMode = () => { try { return ['family', 'breeding', 'both'].includes(localStorage.getItem('genealogie-base-mode')) ? localStorage.getItem('genealogie-base-mode') : 'family'; } catch (_) { return 'family'; } };
    /* La fiche d'un animal (la liste) se range : ordre des parties, parties cachées */
    const LAYOUT_KEY = 'genealogie-pet-sections';
    const SECTIONS = [['identity', '🪪 Identité'], ['ident', '🔖 Identification et origines'], ['parents', '🌳 Parents et pedigree'], ['offspring', '🐾 Descendance'], ['siblings', '👥 Frères et sœurs'], ['owners', '🏠 Ses maîtres'], ['titles', '🏆 Titres'], ['health', '🩺 Santé'], ['measures', '📏 Poids et taille'], ['life', '📅 Sa vie'], ['story', '📖 Histoire et souvenirs'], ['notes', '🗒️ Notes et sources'], ['boards', '🧩 Tableaux'], ['photos', '📷 Photos et documents']];
    const secList = () => [...SECTIONS, ...petPrefs().customSecs.map(c => [c.k, `${c.icon} ${c.label}`])]; // + les catégories à soi
    const layout = () => { let v = {}; try { v = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}') || {}; } catch (_) {} const keys = secList().map(s => s[0]); const order = [...(Array.isArray(v.order) ? v.order.filter(k => keys.includes(k)) : []), ...keys.filter(k => !(v.order || []).includes(k))]; return {order, hidden: (Array.isArray(v.hidden) ? v.hidden : []).filter(k => keys.includes(k))}; };
    function applyLayout(body) {
        if (!body) return; const L = layout();
        L.order.forEach(k => { const s = body.querySelector(`:scope > [data-pet-sec="${k}"]`); if (s) { body.appendChild(s); s.hidden = L.hidden.includes(k); } });
    }
    function layoutDialog(done) {
        const L = layout();
        const rows = o => o.map(k => `<li class="h-pet-lrow" data-k="${k}"><input type="checkbox" ${L.hidden.includes(k) ? '' : 'checked'} title="Montrer"><span>${esc(secList().find(s => s[0] === k)[1])}</span><button type="button" class="h-bt" data-up title="Monter">↑</button><button type="button" class="h-bt" data-down title="Descendre">↓</button></li>`).join('');
        ext.openDialog({eyebrow: 'ANIMAL', title: '⚙️ Organiser la fiche d’un animal', submitLabel: 'Enregistrer',
            body: `<p class="muted">L’ordre des parties et celles qu’on montre, pour toutes les fiches d’animaux. Une partie vide ne s’affiche pas.</p><ol class="h-pet-layout" data-lay>${rows(L.order)}</ol><button type="button" class="button small secondary" data-reset>Remettre l’ordre de l’app</button>`,
            onOpen: d => d.addEventListener('click', e => {
                const li = e.target.closest('li'), box = d.querySelector('[data-lay]');
                if (e.target.closest('[data-up]') && li.previousElementSibling) box.insertBefore(li, li.previousElementSibling);
                if (e.target.closest('[data-down]') && li.nextElementSibling) box.insertBefore(li.nextElementSibling, li);
                if (e.target.closest('[data-reset]')) box.innerHTML = rows(secList().map(s => s[0]));
            }),
            onSubmit: form => {
                const lis = [...form.querySelectorAll('[data-lay] li')];
                try { localStorage.setItem(LAYOUT_KEY, JSON.stringify({order: lis.map(l => l.dataset.k), hidden: lis.filter(l => !l.querySelector('input').checked).map(l => l.dataset.k)})); } catch (_) {}
                toast('Fiche des animaux rangée.'); done?.();
            }});
    }
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
        // H10 : la barre commune (🔍 Chercher · Filtrer ▾ Espèce, État · Liste | Fiches · Trier), retenue pour cette liste
        const lbSaved = window.LCNDA_UI?.listBarState?.('listes:pets'); if (lbSaved) { st.hPetQ = lbSaved.q || ''; st.hPetSpecies = lbSaved.f?.species || ''; }
        if (st.hPetSpecies && !SPECIES[st.hPetSpecies]) st.hPetSpecies = '';
        let data; try { data = await api('pets', {q: st.hPetQ || '', species: st.hPetSpecies || ''}); } catch (error) { toast(error.message, 'error'); return; }
        if (!isCurrent(token)) return;
        // H10 : « N animaux · [Liste | Fiches] · Trier : … », retenus pour cette liste
        const UI = window.LCNDA_UI, KEY = 'listes:pets';
        const sort = lbSaved?.sort || (UI?.sortOf ? UI.sortOf(KEY, 'az') : 'az'), view = UI?.viewOf ? UI.viewOf(KEY, 'cards') : 'cards';
        const lifeF = lbSaved?.f?.life || [], all = data.pets || [];
        const rows = UI?.sortItems ? UI.sortItems(all.filter(r => !lifeF.length || lifeF.includes(r.deceased ? 'gone' : 'alive')), sort, {name: r => r.title, date: r => r.updated_at || r.created_at || ''}) : (data.pets || []);
        const alive = rows.filter(r => !r.deceased).length;
        const kind = r => [iconOf(r.species) + ' ' + (r.breed || String(speciesLabel(r.species) || r.species_label || '').split(/[ ,(]/)[0]), r.color].filter(Boolean).join(' · ');
        A().$('#workspace').innerHTML = `<section class="page h-pets"><header class="page-header"><div><span class="eyebrow">LISTES</span><h2>Animaux de compagnie</h2>
            <p>Les animaux de la famille, d’hier et d’aujourd’hui : une fiche pour chacun (photos, race, puce, éleveur, santé, souvenirs…), reliée à leurs maîtres. Avec leurs parents, on fait le pedigree d’un animal de race, sa descendance et son taux de consanguinité.<br>Deux façons de faire, au choix pour chaque animal : <strong>la fiche d’ici seulement</strong>, plus discrète, qui reste dans cette liste sans se mêler à tes fiches de personnes ; ou <strong>en plus une fiche complète</strong>, comme une personne (arbre, événements, sources…), avec la case en le créant ou « ＋ Fiche complète » plus tard.</p></div>
            <div class="page-actions"><label class="h-pet-mode" title="Famille : les animaux à côté des personnes. Élevage : une base d’animaux (la liste de gauche, le compteur et les statistiques partent des animaux). Les deux : tout mêlé.">Type de base <select data-pet-mode>${[['family', '👪 Famille'], ['breeding', '🐾 Élevage'], ['both', '👪🐾 Les deux']].map(([k, l]) => `<option value="${k}" ${baseMode() === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label><button type="button" class="button secondary" data-pet-prefs title="Espèces, parties et champs du formulaire">⚙️ Réglages</button><button type="button" class="button" data-pet-new>🐾 + Nouvel animal</button></div></header>
            <div data-pet-bar></div>
            ${rows.length ? `${view === 'list' && UI?.rowsHtml ? UI.rowsHtml(rows.map(r => ({thumb: r.media?.[0] ? A().mediaThumbHtml(r.media[0]) : `<span class="ui-card-ico">${iconOf(r.species)}</span>`, name: `${r.title}${r.sex ? (r.sex === 'M' ? ' ♂' : ' ♀') : ''}`, open: `data-pet-open="${r.id}"`, cls: r.deceased ? 'is-gone' : '', lines: [r.registered_name && r.registered_name !== r.title ? r.registered_name : '', kind(r), r.owners.length ? r.owners.slice(0, 2).join(', ') : ''], date: lifespan(r) || ''}))) : `<div class="h-pet-grid">${rows.map(r => `<button type="button" class="h-pet-card ${r.deceased ? 'is-gone' : ''}" data-pet-open="${r.id}">
                <span class="h-pet-cover">${r.media?.[0] ? A().mediaThumbHtml(r.media[0]) : `<span class="h-pet-icon">${iconOf(r.species)}</span>`}</span>
                <span class="h-pet-info"><strong>${esc(r.title)}${r.sex ? ` <span class="h-pet-sex is-${r.sex}">${r.sex === 'M' ? '♂' : '♀'}</span>` : ''}${r.person_id ? ' <span class="h-pet-full" title="A aussi une fiche complète">👤</span>' : ''}</strong>${r.registered_name && r.registered_name !== r.title ? `<small class="h-pet-reg">${esc(r.registered_name)}</small>` : ''}
                <small>${esc([iconOf(r.species) + ' ' + (r.breed || String(speciesLabel(r.species) || r.species_label || '').split(/[ ,(]/)[0]), r.color].filter(Boolean).join(' · '))}</small>
                <small class="muted">${esc(lifespan(r) || 'Dates à compléter')}${r.owners.length ? ' · ' + esc(r.owners.slice(0, 2).join(', ')) : ''}</small>
                <small class="muted">${r.offspring ? `${fmt(r.offspring)} petit${r.offspring > 1 ? 's' : ''} · ` : ''}${r.titles ? `🏆 ${fmt(r.titles)} · ` : ''}${fmt(r.media_count)} photo${r.media_count > 1 ? 's' : ''}</small></span></button>`).join('')}</div>`}`
                : (st.hPetQ || st.hPetSpecies || lifeF.length ? A().emptyState({icon: '🔍', text: 'Aucun animal ne correspond.'}) : A().emptyState({icon: '🐾', text: 'Aucun animal pour l’instant', hint: 'Son nom, sa photo, ses maîtres… et pour un animal de race, ses parents, pour faire son pedigree.', action: {label: '＋ Nouvel animal', attrs: 'data-pet-new'}}))}</section>`;
        const ws = A().$('#workspace');
        const slot = ws.querySelector('[data-pet-bar]');
        if (slot && UI?.listBar) { const bar = UI.listBar({key: KEY, search: {placeholder: 'Chercher… (nom, race, puce, éleveur, maître)', value: st.hPetQ || ''},
            filters: [{id: 'species', label: 'Espèce', type: 'radio', options: [['', 'Toutes'], ...visibleSpecies(st.hPetSpecies).map(([k, l]) => [k, `${iconOf(k)} ${l.split(/[ ,(]/)[0]}`, `${iconOf(k)} ${l.split(/[ ,(]/)[0]}`])], value: st.hPetSpecies || ''},
                {id: 'life', label: 'État', type: 'check', options: [['alive', 'En vie'], ['gone', 'Disparus']]}],
            view: {dflt: 'cards', what: 'animaux'}, sort: {options: [['recent', 'Les plus récents'], ['old', 'Les plus anciens'], ['az', 'A → Z'], ['za', 'Z → A']], value: sort},
            onChange: b => { st.hPetQ = b.q; st.hPetSpecies = b.filters.species || ''; UI.setSort(KEY, b.sort); ext.lists.pets(++st.workspaceToken); }});
            bar.setCount(`${fmt(rows.length)} animal${rows.length > 1 ? 'ux' : ''}${rows.length ? ` · ${fmt(alive)} en vie` : ''}`); slot.replaceWith(bar); }
        ws.querySelectorAll('[data-pet-new]').forEach(b => b.addEventListener('click', () => openEditor(null)));
        ws.querySelector('[data-pet-prefs]').addEventListener('click', () => { st.maintenanceTab = 'pet_prefs'; A().setModule('maintenance'); });
        ws.querySelector('[data-pet-mode]').addEventListener('change', e => { try { localStorage.setItem('genealogie-base-mode', e.target.value); } catch (_) {} toast({family: 'Base de famille.', breeding: 'Base d’élevage : la liste de gauche, le compteur et les statistiques partent des animaux.', both: 'Personnes et animaux mêlés.'}[e.target.value]); A().refreshBaseMode?.(); });
        ws.querySelectorAll('[data-pet-open]').forEach(b => b.addEventListener('click', () => openPet(Number(b.dataset.petOpen))));
    };
    function openPet(id, view = '') { const st = S(); st.hPet = id; st.hPetView = view; st.listType = 'pets'; if (st.module === 'listes') ext.lists.pets(++st.workspaceToken); else A().setModule('listes'); }
    ext.openPet = openPet;
    document.addEventListener('click', e => { const g = e.target.closest?.('[data-pet-goto]'); if (!g) return; e.preventDefault(); openPet(Number(g.dataset.petGoto)); });

    /* ═════════ La fiche d'un animal ═════════ */
    const dl = rows => { const h = rows.filter(([, v]) => v).map(([k, v, raw]) => `<div><dt>${esc(k)}</dt><dd>${raw ? v : esc(v)}</dd></div>`).join(''); return h ? `<dl class="h-pet-dl">${h}</dl>` : ''; };
    const table = (cols, rows) => rows.length ? `<div class="data-table-wrap"><table class="data-table h-pet-table"><thead><tr>${cols.map(c => `<th>${esc(c[1])}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${esc(r[c[0]] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
    const miniPet = (p, role = '') => p ? `<button type="button" class="h-pet-mini" data-pet-goto="${p.id}">${p.photo ? photoHtml(p.photo, 'is-mini') : `<span class="h-pet-mini-ic">${p.sex === 'F' ? '♀' : p.sex === 'M' ? '♂' : '🐾'}</span>`}<span><strong>${esc(p.title)}</strong>${role ? `<small>${esc(role)}</small>` : ''}<small class="muted">${esc([p.registered_name !== p.title && p.registered_name, p.color, lifespan(p)].filter(Boolean).join(' · '))}</small></span></button>` : '';

    /** Les parties de la fiche d'un animal (identité, origines, pedigree, petits…) : pour sa fiche d'animal et pour les blocs de sa fiche complète */
    function petSections(p) {
        const id = p.id;
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
        // les champs à soi (Réglages des animaux) : dans leur partie, ou dans leurs catégories
        const pr = petPrefs(), cus = d.custom || {};
        const customDl = sk => dl(pr.customFields.filter(cf => cf.sec === sk).map(cf => [cf.label, cus[cf.k] || '']));
        const PE = {identity: 'pe1', ident: 'pe2', parents: 'pe3', owners: 'pe4', titles: 'pe5', health: 'pe6', measures: 'pe7', life: 'pe8', story: 'pe9', photos: 'pe10'};
        const out = [], sec = (k, title, body, cls = '') => { const more = PE[k] ? customDl(PE[k]) : ''; body = (body || '') + more; if (body) out.push({k, title, body, cls}); return ''; };
        void `
            ${sec('identity', '🪪 Identité', dl([['Nom', d.name], ['Nom d’affixe / nom officiel', d.registered_name], ['Appelé', d.call_name], ['Espèce', speciesLabel(d.species)], ['Race', d.breed], ['Variété', d.variety], ['Sexe', SEX[d.sex]], ['Stérilisé', d.neutered ? 'oui' + (d.neutered_date ? ' (' + d.neutered_date + ')' : '') : ''],
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
`;
        pr.customSecs.forEach(cs => { const body = customDl(cs.k); if (body) out.push({k: cs.k, title: esc(`${cs.icon} ${cs.label}`), body, cls: ''}); });
        return {out, d, age};
    }
    const secHtml = s0 => `<section class="h-pet-sec ${s0.cls}" data-pet-sec="${s0.k}"><h3>${s0.title}</h3>${s0.body}</section>`;
    async function showPet(token, id) {
        const st = S();
        let p; try { p = await api('pet', {id}); } catch (error) { st.hPet = 0; toast(error.message, 'error'); return ext.lists.pets(++st.workspaceToken); }
        if (!isCurrent(token)) return;
        const {out: secs, d, age} = petSections(p);
        A().$('#workspace').innerHTML = `<section class="page h-pet">
            <header class="page-header h-pet-head"><div class="h-pet-hero">${p.media?.[0] ? photoHtml(p.media[0], 'is-hero') : `<span class="h-pet-hero-ic">${iconOf(d.species)}</span>`}
                <div><span class="eyebrow">${iconOf(d.species)} ${esc(speciesLabel(d.species) || 'Animal')}${d.breed ? ' · ' + esc(d.breed) : ''}</span><h2>${esc(p.title)}${d.sex ? ` <span class="h-pet-sex is-${d.sex}">${d.sex === 'M' ? '♂' : '♀'}</span>` : ''}${d.deceased ? ' <span class="h-pet-gone">†</span>' : ''}</h2>
                ${d.registered_name && d.registered_name !== p.title ? `<p class="h-pet-reg">${esc(d.registered_name)}</p>` : ''}<p>${esc([lifespan(d), age && (d.deceased ? 'mort à ' : '') + age, d.color].filter(Boolean).join(' · '))}</p></div></div>
                <div class="page-actions"><button type="button" class="button secondary" data-pet-back>← Tous les animaux</button><button type="button" class="button" data-pet-edit>✎ Modifier</button><button type="button" class="button secondary" data-pet-ped>🌳 Pedigree</button><button type="button" class="button secondary" data-pet-kid>＋ Un petit</button>${p.person_id ? `<button type="button" class="button secondary" data-h-person="${p.person_id}" title="Sa fiche comme une personne : arbre, événements, sources…">👤 Fiche complète</button>` : '<button type="button" class="button secondary" data-pet-mkperson title="Lui faire aussi une fiche comme une personne : arbre, événements, photos, sources…">＋ Fiche complète</button>'}<button type="button" class="button secondary" data-pet-layout title="Ranger, montrer ou cacher les parties de la fiche">⚙️ Organiser</button><button type="button" class="button secondary" data-pet-print>🖨️ Imprimer</button><button type="button" class="button secondary danger" data-pet-del>Supprimer</button></div></header>
            ${ext.labelChips ? ext.labelChips(p.labels) : ''}
            <div class="h-pet-body">
            ${secs.map(secHtml).join('')}
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
        applyLayout(ws.querySelector('.h-pet-body'));
        ws.querySelector('[data-pet-layout]').addEventListener('click', () => layoutDialog(again));
        ws.querySelector('[data-pet-mkperson]')?.addEventListener('click', async () => {
            if (!await A().confirmBox(`Faire aussi une fiche complète pour « ${p.title} » ? Elle apparaîtra avec les fiches (arbre, événements, photos, sources), reliée à ses parents et petits qui en ont une. Sa fiche d’animal reste comme elle est.`, {title: 'Fiche complète', okLabel: 'Faire la fiche complète'})) return;
            try { const r = await api('pet_make_person', {}, {method: 'POST', body: {id}}); toast('Fiche complète créée.'); S().currentPersonId = Number(r.result?.person_id || r.person_id); A().setModule('personnes'); } catch (error) { toast(error.message, 'error'); }
        });
        ws.querySelector('[data-pet-del]').addEventListener('click', async () => {
            if (!await A().confirmBox(`Supprimer la fiche de « ${p.title} » ? Ses photos restent dans les médias ; ses petits gardent leur fiche (son nom reste écrit comme parent).`, {title: 'Supprimer la fiche de l’animal', okLabel: 'Supprimer la fiche'})) return;
            const withPerson = p.person_id ? await A().confirmBox('Supprimer aussi sa fiche complète (arbre, événements…) ?', {title: 'Fiche complète', okLabel: 'Supprimer aussi la fiche complète', cancelLabel: 'Garder la fiche complète', danger: true}) : false;
            try { await api('delete_pet', {}, {method: 'POST', body: {id, with_person: withPerson}}); toast('Fiche supprimée.'); st.hPet = 0; ext.lists.pets(++st.workspaceToken); } catch (error) { toast(error.message, 'error'); }
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
            const q = v0 => { const v = (A().csvSafe || (x => String(x ?? '')))(v0); return /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }; // pas de formule glissée dans un tableur
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
            ? `<div class="h-pet-pf" data-pet-pname="${esc(r.name || '')}"><span class="pk-lab">${esc(l)}</span>${window.LCNDA_PICKER.pickerField({name: 'pp_' + n, kind: 'person', allowFree: true, value: Number(r.person_id) ? Number(r.person_id) : (r.name ? 'txt:' + r.name : null)})}</div>`
            : opts ? `<label>${esc(l)}<select data-k="${k}">${[...new Set(['', ...opts, r[k] || ''])].map(o => `<option ${o === (r[k] || '') ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`
            : `<label>${esc(l)}<input data-k="${k}" value="${esc(r[k] || '')}"></label>`).join('')}<button type="button" class="h-pet-x" data-pet-rowdel title="Retirer" aria-label="Retirer">×</button></div>`;
    }
    const readRows = (form, list) => [...form.querySelectorAll(`[data-pet-row="${list}"]`)].map(row => {
        const o = {}; row.querySelectorAll('[data-k]').forEach(x => { o[x.dataset.k] = x.value.trim(); });
        if (list === 'owners') { // menu de choix unique : une fiche (id) ou un nom sans fiche (« txt:… »)
            const raw = row.querySelector('.pk > input[type=hidden]')?.value || '';
            if (raw.startsWith('txt:')) { o.person_id = 0; o.name = raw.slice(4).trim(); } else { o.person_id = Number(raw) || 0; o.name = o.person_id ? (row.querySelector('[data-pet-pname]')?.dataset.petPname || '').trim() : ''; }
        }
        return o;
    });
    // les champs du formulaire, rangés par les réglages (un champ caché garde sa valeur)
    const PF_OF = {birth_date: 'birth', birth_place: 'birth', death_date: 'death', death_place: 'death', death_cause: 'death', burial: 'death', neutered_date: 'neutered'};
    function applyEditorCfg(root, species) {
        const c = cfgFor(species), ed = root.querySelector('.h-pet-editor'), nav = ed?.querySelector('.h-bk-nav'); if (!ed) return;
        c.order.forEach(k => { const sec = ed.querySelector(`:scope > section#${k}`); if (sec) { ed.appendChild(sec); sec.hidden = c.hidden.includes(k); } const a = nav?.querySelector(`[data-pet-jump="${k}"]`); if (a) { nav.appendChild(a); a.hidden = c.hidden.includes(k); } });
        ed.querySelectorAll('[data-pf]').forEach(el => { el.hidden = c.fields.includes(el.dataset.pf); });
        // l'ordre des champs dans chaque partie
        Object.entries(c.forder).forEach(([sk, keys]) => { const sec = ed.querySelector(`:scope > section#${sk}`); if (sec) keys.forEach(fk => sec.querySelectorAll(`[data-pf="${fk}"]`).forEach(el => el.parentNode.appendChild(el))); });
    }
    // un champ à soi dans le formulaire
    function customFieldHtml(cf, d) {
        const v = d.custom?.[cf.k] || '', n = 'cf__' + cf.k;
        if (cf.type === 'textarea') return `<label class="span-2" data-pf="${cf.k}">${esc(cf.label)}<textarea name="${n}" rows="3">${esc(v)}</textarea></label>`;
        if (cf.type === 'check') return `<label class="checkbox-line" data-pf="${cf.k}"><input type="checkbox" name="${n}" ${v ? 'checked' : ''}> <span>${esc(cf.label)}</span></label>`;
        if (cf.type === 'select') { const opts = [...new Set(['', ...cf.options.split(/[;\n]/).map(x => x.trim()).filter(Boolean), v])]; return `<label data-pf="${cf.k}">${esc(cf.label)}<select name="${n}">${opts.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`; }
        return `<label data-pf="${cf.k}">${esc(cf.label)}<input type="text" name="${n}" value="${esc(v)}" ${cf.type === 'number' ? 'inputmode="decimal"' : ''} placeholder="${cf.type === 'date' ? 'jj/mm/aaaa' : ''}"></label>`;
    }
    async function openEditor(p, done, preset = {}, opts = {}) {
        const d = p?.data || {species: 'chien', owners: [], titles: [], vaccines: [], tests: [], measures: [], events: [], ...preset};
        let all = []; try { all = (await api('pets', {})).pets || []; } catch (_) {}
        const others = all.filter(x => x.id !== p?.id);
        const parentSel = (k, sex) => `<select name="${k}"><option value="">— pas dans la base —</option>${others.filter(x => !x.sex || x.sex === sex || Number(d[k]) === x.id).map(x => `<option value="${x.id}" ${Number(d[k]) === x.id ? 'selected' : ''}>${esc(x.title)}${x.registered_name && x.registered_name !== x.title ? ' — ' + esc(x.registered_name) : ''}${x.breed ? ' (' + esc(x.breed) + ')' : ''}</option>`).join('')}</select>`;
        const f = (name, label, ph = '', type = 'text') => `<label data-pf="${PF_OF[name] || name}">${esc(label)}<input type="${type}" name="${name}" value="${esc(d[name] || '')}" placeholder="${esc(ph)}"></label>`;
        const area = (name, label, rows, ph = '') => `<label class="span-2" data-pf="${PF_OF[name] || name}">${esc(label)}<textarea name="${name}" rows="${rows}" placeholder="${esc(ph)}">${esc(d[name] || '')}</textarea></label>`;
        const pr = petPrefs(), mine = sk => pr.customFields.filter(cf => cf.sec === sk).map(cf => customFieldHtml(cf, d)).join('');
        const onFiche = !!(p?.person_id || opts.fromFiche); // a une fiche complète : photos → « Médias », notes → « Notes » de la fiche
        const listBox = list => `<div data-pet-list="${list}">${(d[list] || []).map(r => rowHtml(list, r)).join('')}</div><button type="button" class="button small secondary" data-pet-add="${list}">+ ${esc(LISTS[list].label)}</button>`;
        ext.openDialog({eyebrow: 'ANIMAL', title: p ? p.title : 'Nouvel animal', wide: true, labels: ['pet', p?.labels || []],
            body: `<div class="h-pet-editor">
                <nav class="h-bk-nav">${allSecs(pr).map(([k, l]) => `<a href="#${esc(k)}" data-pet-jump="${esc(k)}">${esc(l)}</a>`).join('')}</nav>
                <section id="pe1"><h3>🪪 Identité</h3>${p?.person_id ? '<p class="muted">Il a une fiche complète : le nom, le sexe, la naissance, le décès et les parents écrits ici y sont repris (et ce qui est corrigé sur la fiche complète revient ici).</p>' : opts.fromFiche ? '<input type="hidden" name="make_person" value="1"><p class="muted">Une fiche complète (comme une personne) est faite en même temps : elle s’ouvre après l’enregistrement.</p>' : `<label class="checkbox-line h-pet-mkp"><input type="checkbox" name="make_person" ${baseMode() !== 'family' && !p ? 'checked' : ''}> <span>👤 Lui faire aussi une fiche complète, comme une personne (arbre, événements, photos, sources…)</span></label>`}<div class="form-grid">${f('name', 'Nom', 'Médor')}${f('registered_name', 'Nom d’affixe / nom officiel (LOF, LOOF…)', 'Médor du Val de Loire')}${f('call_name', 'Appelé', 'Mémé')}
                    <label data-pf="species">Espèce <select name="species">${visibleSpecies(d.species).map(([k, l]) => `<option value="${k}" ${(SPECIES[d.species] ? d.species : 'autre') === k ? 'selected' : ''}>${iconOf(k)} ${esc(l)}</option>`).join('')}</select></label>${f('breed', 'Race', 'Berger allemand')}${f('variety', 'Variété', 'poil long')}
                    <label data-pf="sex">Sexe <select name="sex"><option value="">?</option><option value="M" ${d.sex === 'M' ? 'selected' : ''}>♂ mâle</option><option value="F" ${d.sex === 'F' ? 'selected' : ''}>♀ femelle</option></select></label>
                    <label class="checkbox-line" data-pf="neutered"><input type="checkbox" name="neutered" ${d.neutered ? 'checked' : ''}> <span>stérilisé(e)</span></label>${f('neutered_date', 'Stérilisé(e) le')}
                    ${f('color', 'Robe, couleur', 'noir et feu')}${f('markings', 'Marques particulières', 'liste blanche, oreille tachée…')}${f('coat', 'Poil', 'court, dur…')}${f('eyes', 'Yeux', 'marron')}${f('height', 'Taille (au garrot)', '62 cm')}${f('weight', 'Poids', '34 kg')}
                    ${f('birth_date', 'Né(e) le', '12/04/2015')}${f('birth_place', 'à', 'Tours, chez l’éleveur…')}<label class="checkbox-line" data-pf="death"><input type="checkbox" name="deceased" ${d.deceased ? 'checked' : ''}> <span>décédé(e)</span></label>${f('death_date', 'Mort(e) le')}${f('death_place', 'à')}${f('death_cause', 'Cause')}${f('burial', 'Repose (jardin, cimetière animalier, cendres…)')}${mine('pe1')}</div></section>
                <section id="pe2"><h3>🔖 Identification et origines</h3><div class="form-grid">${f('microchip', 'Puce électronique (15 chiffres)', '250268…')}${f('tattoo', 'Tatouage', '2ABC123')}${f('passport', 'Passeport')}
                    <label data-pf="registry">Livre des origines <input name="registry" list="pet-registries" value="${esc(d.registry || '')}"><datalist id="pet-registries">${REGISTRIES.map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>${f('registration', 'N° d’inscription', 'LOF 2 BA 12345/0')}${f('pedigree_number', 'N° de pedigree')}${f('ueln', 'UELN (chevaux)')}${f('dna', 'Profil ADN, tests de parenté')}
                    ${f('breeder', 'Éleveur')}${f('affix', 'Affixe (nom de l’élevage)', 'du Val de Loire')}${f('breeder_address', 'Adresse de l’élevage')}${f('litter', 'Portée (n°, lettre de l’année…)', 'portée « M » 2015')}${mine('pe2')}</div></section>
                <section id="pe3"><h3>🌳 Parents</h3><p class="muted">Choisis le père et la mère s’ils ont une fiche (pour le pedigree sur plusieurs générations) ; sinon écris leur nom.</p><div class="form-grid">
                    <label data-pf="sire_id">Père (dans la base) ${parentSel('sire_id', 'M')}</label>${f('sire_name', 'ou son nom', 'Rex des Grands Prés')}${f('sire_registration', 'Son inscription')}
                    <label data-pf="dam_id">Mère (dans la base) ${parentSel('dam_id', 'F')}</label>${f('dam_name', 'ou son nom', 'Flora du Moulin')}${f('dam_registration', 'Son inscription')}${mine('pe3')}</div></section>
                <section id="pe4"><h3>🏠 Ses maîtres</h3><p class="muted">Relie les fiches de la famille : l’animal apparaîtra sur leur fiche (bloc « Animaux de compagnie »).</p><div class="form-grid"><div class="span-2" data-pf="owners">${listBox('owners')}</div>${mine('pe4')}</div></section>
                <section id="pe5"><h3>🏆 Titres, expositions, concours</h3><div class="form-grid"><div class="span-2" data-pf="titles">${listBox('titles')}</div>${mine('pe5')}</div></section>
                <section id="pe6"><h3>🩺 Santé</h3><div class="form-grid">${f('vet', 'Vétérinaire')}${f('insurance', 'Assurance')}${f('allergies', 'Allergies, intolérances')}${f('food', 'Alimentation')}${area('medical', 'Santé : maladies, opérations, traitements', 3)}
                    <div class="span-2" data-pf="vaccines"><h4>Vaccins et traitements</h4>${listBox('vaccines')}</div><div class="span-2" data-pf="tests"><h4>Tests de santé et ADN</h4>${listBox('tests')}</div>${mine('pe6')}</div></section>
                <section id="pe7"><h3>📏 Poids et taille</h3><div class="form-grid"><div class="span-2" data-pf="measures">${listBox('measures')}</div>${mine('pe7')}</div></section>
                <section id="pe8"><h3>📅 Sa vie</h3><div class="form-grid"><div class="span-2" data-pf="events">${listBox('events')}</div>${area('character', 'Caractère', 3, 'joueur, peureux de l’orage…')}${area('habits', 'Habitudes, jeux, tours appris', 3)}${mine('pe8')}</div></section>
                <section id="pe9"><h3>📖 Son histoire et nos souvenirs</h3><div class="form-grid">${area('story', 'Son histoire', 6, 'Comment il est arrivé dans la famille…')}${area('memories', 'Souvenirs, anecdotes', 6)}${onFiche ? '<p class="muted span-2" data-pf="notes">🗒️ Ses notes et ses sources : dans le bloc « Notes » de sa fiche complète.</p>' : area('notes', 'Notes', 3) + area('sources', 'Sources (certificat, pedigree, carnet de santé…)', 2)}${mine('pe9')}</div></section>
                <section id="pe10"><h3>📷 Photos et documents</h3><div class="form-grid"><div class="span-2" data-pf="media">${onFiche ? '<p class="muted">📷 Ses photos et documents (pedigree papier, carnet de santé…) : dans le bloc « Médias » de sa fiche complète.</p>' : (ext.mediaEditorHtml ? ext.mediaEditorHtml('pet', p?.id || 0, p?.media || [], [['', 'Photos', 'image/*,video/*'], ['document', 'Documents (pedigree, carnet, certificat)', 'image/*,application/pdf']]) : '') + (p?.id ? '' : '<p class="muted">Les recueils se relient à l’animal une fois enregistré (en bas de sa fiche).</p>')}</div>${mine('pe10')}</div></section>
                ${pr.customSecs.map(cs => `<section id="${cs.k}"><h3>${esc(cs.icon + ' ' + cs.label)}</h3><div class="form-grid">${mine(cs.k) || '<p class="muted span-2">Pas encore de champ : Maintenance → Réglages des animaux → « ＋ Champ ».</p>'}</div></section>`).join('')}
            </div>`,
            onOpen: dlg => {
                const body = dlg.querySelector('.h-dialog-body') || dlg;
                body.addEventListener('picker-change', e => { const box = e.target.closest('[data-pet-pname]'); if (box) box.dataset.petPname = e.detail.item?.title || ''; });
                applyEditorCfg(body, body.querySelector('[name=species]')?.value || d.species);
                body.querySelector('[name=species]')?.addEventListener('change', e => applyEditorCfg(body, e.target.value));
                if (opts.jump) setTimeout(() => { const sec = dlg.querySelector('#' + opts.jump); if (sec) { sec.hidden = false; sec.scrollIntoView({block: 'start'}); } }, 60);
                body.addEventListener('click', e => {
                    const j = e.target.closest('[data-pet-jump]'); if (j) { e.preventDefault(); dlg.querySelector('#' + j.dataset.petJump)?.scrollIntoView({behavior: 'smooth', block: 'start'}); return; }
                    const add = e.target.closest('[data-pet-add]'); if (add) { const box = body.querySelector(`[data-pet-list="${add.dataset.petAdd}"]`); box.insertAdjacentHTML('beforeend', rowHtml(add.dataset.petAdd)); box.lastElementChild.querySelector('input, select')?.focus(); return; }
                    if (e.target.closest('[data-pet-rowdel]')) e.target.closest('.h-pet-row').remove();
                });
            },
            onSubmit: async form => {
                const val = A().formObject(form), data = {};
                for (const k of ['name', 'registered_name', 'call_name', 'species', 'breed', 'variety', 'sex', 'neutered_date', 'color', 'markings', 'coat', 'eyes', 'height', 'weight', 'birth_date', 'birth_place', 'death_date', 'death_place', 'death_cause', 'burial',
                    'microchip', 'tattoo', 'passport', 'registry', 'registration', 'pedigree_number', 'ueln', 'dna', 'breeder', 'affix', 'breeder_address', 'litter', 'sire_name', 'dam_name', 'sire_registration', 'dam_registration',
                    'vet', 'insurance', 'allergies', 'food', 'medical', 'character', 'habits', 'story', 'memories', 'notes', 'sources']) data[k] = form.elements[k]?.value?.trim?.() ?? (onFiche && (k === 'notes' || k === 'sources') ? d[k] || '' : '');
                // champs à soi : ceux du formulaire, et ceux qu'on a gardés (champ supprimé des réglages)
                data.custom = {...(d.custom || {})};
                pr.customFields.forEach(cf => { const el = form.elements['cf__' + cf.k]; if (!el) return; const v = el.type === 'checkbox' ? (el.checked ? 'oui' : '') : el.value.trim(); if (v) data.custom[cf.k] = v; else delete data.custom[cf.k]; });
                data.neutered = form.elements.neutered.checked; data.deceased = form.elements.deceased.checked;
                data.sire_id = Number(form.elements.sire_id.value) || 0; data.dam_id = Number(form.elements.dam_id.value) || 0;
                for (const list of Object.keys(LISTS)) data[list] = readRows(form, list);
                if (!data.name && !data.registered_name && !data.call_name) { toast('Donne au moins un nom à l’animal.', 'error'); return false; }
                const saved = await api('save_pet', {}, {method: 'POST', body: {id: p?.id || 0, data, pending_labels: val.pending_labels, make_person: !!(form.elements.make_person?.type === 'hidden' || form.elements.make_person?.checked)}});
                const id = Number(saved.result?.id || saved.id);
                if (ext.uploadMediaEditor && !onFiche) await ext.uploadMediaEditor(form, 'pet', id);
                // fiche complète faite à l'instant (case cochée) : ses photos et notes y passent
                const newPid = Number(saved.result?.person_id || saved.person_id); if (newPid && !p?.person_id && !opts.fromFiche) { try { await api('pet_for_person', {}, {method: 'POST', body: {person_id: newPid}}); } catch (_) {} }
                toast('Fiche de l’animal enregistrée.');
                if (opts.fromFiche && Number(saved.result?.person_id || saved.person_id)) { S().currentPersonId = Number(saved.result?.person_id || saved.person_id); A().setModule('personnes'); return; }
                if (done) done(); else openPet(id);
            },
        });
    }
    ext.openPetEditor = openEditor;

    /* ═════════ Maintenance → Réglages des animaux : espèces, parties et champs du formulaire (pour tous ou par espèce) ═════════ */
    ext.maintenance = ext.maintenance || {};
    ext.maintenance.pet_prefs = async token => {
        const st = S(); let pr = petPrefs(), scope = '*';
        const ws = A().$('#workspace');
        ext.maintenance.pet_prefs.ac?.abort(); const ac = ext.maintenance.pet_prefs.ac = new AbortController(), signal = ac.signal; // une seule écoute, même après plusieurs visites
        const cfgOf = k => pr.cfg[k] || null;
        const draw = () => {
            if (token !== st.workspaceToken) return;
            const own = scope !== '*' && !!cfgOf(scope), c = cleanCfg(cfgOf(scope) || pr.cfg['*'], pr);
            const spRow = k => { const mine = pr.species.find(x => x.k === k); return `<div class="h-pet-lrow" data-sp="${esc(k)}"><input type="checkbox" data-sp-show ${pr.speciesHidden.includes(k) ? '' : 'checked'} title="Proposer cette espèce">${mine ? `<input class="h-pp-icon" data-sp-icon value="${esc(mine.icon)}" readonly title="Choisir une icône" aria-label="Icône"><input data-sp-label value="${esc(mine.label)}" maxlength="60">` : `<span>${esc((SPECIES_ICON0[k] || '🐾') + ' ' + SPECIES0[k])}</span>`}<button type="button" class="h-bt" data-sp-up title="Monter">↑</button><button type="button" class="h-bt" data-sp-down title="Descendre">↓</button>${mine ? '<button type="button" class="h-bt" data-sp-del title="Supprimer cette espèce">🗑</button>' : ''}</div>`; };
            ws.innerHTML = `<section class="page h-pp"><header class="page-header"><div><span class="eyebrow">MAINTENANCE</span><h2>Réglages des animaux</h2><p>Les espèces proposées (et les tiennes), l’ordre des parties du formulaire d’un animal, et les champs montrés : pour tous les animaux, ou à part pour une espèce (ex. l’UELN seulement pour les chevaux). Un champ caché garde ce qui y était écrit.</p></div>
                <div class="page-actions"><button type="button" class="button" data-pp-save>Enregistrer</button></div></header>
                <div class="h-pp-presets maintenance-panel"><strong>💾 Réglages enregistrés</strong>${presets().length ? `<select data-ps-pick aria-label="Réglages enregistrés">${presets().map((x, i) => `<option value="${i}">${esc(x.name)}${x.date ? ' — ' + esc(x.date) : ''}</option>`).join('')}</select><button type="button" class="button small" data-ps-apply>Appliquer</button><button type="button" class="button small secondary" data-ps-one-export title="Enregistrer cet ensemble dans un fichier, pour le garder ou le donner">⤓ Exporter</button><button type="button" class="button small secondary" data-ps-del title="Supprimer ces réglages enregistrés">🗑</button>` : '<span class="muted">Aucun pour l’instant.</span>'}
                    <button type="button" class="button small secondary" data-ps-save title="Garder les réglages actuels sous un nom">💾 Enregistrer sous un nom…</button><button type="button" class="button small secondary" data-ps-one-import title="Reprendre un ensemble exporté (fichier .json)">⤒ Importer un réglage</button><span class="h-pp-sep"></span><button type="button" class="button small secondary" data-ps-export title="Un fichier .json avec les réglages (espèces, catégories, champs, formulaire) et tous les ensembles">⤓ Tout exporter</button><label class="button small secondary" title="Reprendre un fichier « Tout exporter »">⤒ Tout importer<input type="file" accept=".json,application/json" data-ps-import hidden></label></div>
                <div class="h-pp-cols"><section class="maintenance-panel"><h3>🐾 Espèces</h3><p class="muted">Coche celles qu’on propose ; range-les avec ↑ ↓.</p><div data-pp-species>${pr.speciesOrder.map(spRow).join('')}</div>
                    <div class="h-pp-add"><input class="h-pp-icon" data-sp-newicon value="🐾" readonly title="Choisir une icône" aria-label="Icône"><input data-sp-newlabel placeholder="Nouvelle espèce (ex. Furet, Alpaga)" maxlength="60"><button type="button" class="button small" data-sp-add>＋ Ajouter</button></div></section>
                <section class="maintenance-panel"><h3>📝 Formulaire « Nouvel animal »</h3>
                    <label>Réglages pour <select data-pp-scope><option value="*" ${scope === '*' ? 'selected' : ''}>tous les animaux</option>${pr.speciesOrder.map(k => { const mine = pr.species.find(x => x.k === k); return `<option value="${esc(k)}" ${scope === k ? 'selected' : ''}>${esc((mine ? mine.icon : SPECIES_ICON0[k] || '🐾') + ' ' + (mine ? mine.label : SPECIES0[k]))}${cfgOf(k) ? ' — réglage propre' : ''}</option>`; }).join('')}</select></label>
                    ${scope !== '*' ? `<label class="checkbox-line"><input type="checkbox" data-pp-own ${own ? 'checked' : ''}> <span>réglage propre à cette espèce (sinon, celui de tous les animaux)</span></label>` : ''}
                    <p class="muted">Coche ce qu’on montre, range avec ↑ ↓ les parties et les champs de chaque partie. Les catégories et les champs ajoutés valent pour tous les animaux (on peut les cacher pour une espèce).</p>
                    <div class="${scope !== '*' && !own ? 'block-editor-off' : ''}" data-pp-cfg ${scope !== '*' && !own ? 'inert' : ''}>${c.order.map(k => { const cs = pr.customSecs.find(x => x.k === k); return `<div class="h-pp-sec" data-sec="${k}"><div class="h-pet-lrow"><input type="checkbox" data-sec-show ${c.hidden.includes(k) ? '' : 'checked'} ${k === 'pe1' ? 'disabled title="L’identité est toujours montrée"' : 'title="Montrer cette partie"'}>${cs ? `<input class="h-pp-icon" data-cs-icon value="${esc(cs.icon)}" readonly title="Choisir une icône" aria-label="Icône"><input data-cs-label value="${esc(cs.label)}" maxlength="60" aria-label="Nom de la catégorie">` : `<strong>${esc(EDITOR_SECS.find(x => x[0] === k)[1])}</strong>`}<button type="button" class="h-bt" data-sec-up title="Monter">↑</button><button type="button" class="h-bt" data-sec-down title="Descendre">↓</button>${cs ? '<button type="button" class="h-bt" data-cs-del title="Supprimer cette catégorie (et ses champs)">🗑</button>' : ''}</div>
                        <div class="h-pp-fields" data-fields>${c.forder[k].map(fk => { const cf = pr.customFields.find(x => x.k === fk), lab = cf ? '' : (FIELDS.find(x => x[1] === fk) || [])[2]; return `<div class="h-pp-frow" data-field-row="${fk}"><input type="checkbox" data-field="${fk}" ${LOCKED.includes(fk) ? 'checked disabled title="Toujours montré"' : c.fields.includes(fk) ? '' : 'checked'} aria-label="Montrer">${cf ? `<input data-cf-label value="${esc(cf.label)}" maxlength="80" aria-label="Nom du champ"><small class="muted">${esc(FTYPES.find(t => t[0] === cf.type)[1])}</small>` : `<span>${esc(lab)}</span>`}<button type="button" class="h-bt" data-f-up title="Monter">↑</button><button type="button" class="h-bt" data-f-down title="Descendre">↓</button>${cf ? '<button type="button" class="h-bt" data-cf-del title="Supprimer ce champ">🗑</button>' : ''}</div>`; }).join('')}</div>
                        <div class="h-pp-addf"><input data-nf-label placeholder="Nouveau champ (ex. Groupe sanguin)" maxlength="80"><select data-nf-type>${FTYPES.map(([t, l]) => `<option value="${t}">${esc(l)}</option>`).join('')}</select><input data-nf-opts placeholder="choix séparés par ;" hidden maxlength="600"><button type="button" class="button small secondary" data-nf-add>＋ Champ</button></div></div>`; }).join('')}
                    <div class="h-pp-add"><input class="h-pp-icon" data-cs-newicon value="🗂️" readonly title="Choisir une icône" aria-label="Icône"><input data-cs-newlabel placeholder="Nouvelle catégorie (ex. Génétique, Dressage)" maxlength="60"><button type="button" class="button small" data-cs-add>＋ Catégorie</button></div></div></section></div></section>`;
        };
        // ce qui est à l'écran → pr
        const collect = () => {
            const rows = [...ws.querySelectorAll('[data-sp]')];
            pr.speciesOrder = rows.map(r => r.dataset.sp); pr.speciesHidden = rows.filter(r => !r.querySelector('[data-sp-show]').checked).map(r => r.dataset.sp);
            rows.forEach(r => { const mine = pr.species.find(x => x.k === r.dataset.sp); if (mine) { mine.icon = r.querySelector('[data-sp-icon]').value.trim() || '🐾'; mine.label = r.querySelector('[data-sp-label]').value.trim() || mine.label; } });
            const box = ws.querySelector('[data-pp-cfg]'), ownBox = ws.querySelector('[data-pp-own]');
            if (!box || (scope !== '*' && !ownBox?.checked)) return;
            box.querySelectorAll('[data-sec]').forEach(x => { const cs = pr.customSecs.find(c => c.k === x.dataset.sec); if (cs) { cs.icon = x.querySelector('[data-cs-icon]').value.trim() || '🗂️'; cs.label = x.querySelector('[data-cs-label]').value.trim() || cs.label; } });
            box.querySelectorAll('[data-field-row]').forEach(x => { const cf = pr.customFields.find(c => c.k === x.dataset.fieldRow); if (cf) cf.label = x.querySelector('[data-cf-label]').value.trim() || cf.label; });
            const secs = [...box.querySelectorAll('[data-sec]')];
            pr.cfg[scope] = cleanCfg({order: secs.map(x => x.dataset.sec), hidden: secs.filter(x => !x.querySelector('[data-sec-show]').checked).map(x => x.dataset.sec), fields: [...box.querySelectorAll('[data-field]')].filter(x => !x.checked).map(x => x.dataset.field),
                forder: Object.fromEntries(secs.map(x => [x.dataset.sec, [...x.querySelectorAll('[data-field-row]')].map(f => f.dataset.fieldRow)]))}, pr);
        };
        draw();
        const download = (name, obj) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], {type: 'application/json'})); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
        ws.addEventListener('click', async e => {
            // une icône : on clique et on choisit (les animaux d'abord pour une espèce)
            const ic = e.target.closest('.h-pp-icon'); if (ic && ext.pickEmoji) { ext.pickEmoji(ic, null, {first: ic.matches('[data-sp-icon],[data-sp-newicon]') ? 'Animaux' : ''}); return; }
            if (e.target.closest('[data-ps-save]')) { collect(); const name = ((await window.LCNDA_APP.askText({message: 'Nom de cet ensemble de réglages (ex. Élevage de chevaux) :'})) || '').trim().slice(0, 80); if (!name) return; const list = presets().filter(x => x.name !== name); list.push({name, date: new Date().toLocaleDateString('fr-FR'), prefs: JSON.parse(JSON.stringify(pr))}); savePresets(list); draw(); toast(`Ensemble « ${name} » enregistré.`); return; }
            if (e.target.closest('[data-ps-apply]')) { const x = presets()[Number(ws.querySelector('[data-ps-pick]').value)]; if (!x || !await A().confirmBox(`Remplacer les réglages actuels par l’ensemble « ${x.name} » ?`, {title: 'Appliquer l’ensemble', okLabel: 'Remplacer les réglages'})) return; savePetPrefs(x.prefs); pr = petPrefs(); savePetPrefs(pr); scope = '*'; draw(); toast(`Ensemble « ${x.name} » appliqué.`); return; }
            // un ensemble seul : ⤓ Exporter / ⤒ Importer un réglage (fichier lcnda-reglage-animaux-<nom>.json)
            if (e.target.closest('[data-ps-one-export]')) { const x = presets()[Number(ws.querySelector('[data-ps-pick]').value)]; if (x) A().exportSettingFile?.('animaux', x.name, {prefs: x.prefs}); return; }
            if (e.target.closest('[data-ps-one-import]')) {
                const got = await A().importSettingFile?.('animaux', {names: presets().map(x => x.name), check: d => d.prefs && typeof d.prefs === 'object' && !Array.isArray(d.prefs)});
                if (!got) return;
                collect(); // le contenu passe par le même nettoyage que les réglages (petPrefs), sans toucher aux réglages actuels
                let clean = null; const before = localStorage.getItem(PREFS_KEY);
                try { localStorage.setItem(PREFS_KEY, JSON.stringify(got.donnees.prefs)); clean = petPrefs(); } catch (_) {} finally { try { if (before === null) localStorage.removeItem(PREFS_KEY); else localStorage.setItem(PREFS_KEY, before); } catch (_) {} }
                if (!clean) { toast('Ce réglage n’a pas pu être lu.', 'error'); return; }
                const list = presets(); list.push({name: got.nom.slice(0, 80), date: new Date().toLocaleDateString('fr-FR'), prefs: clean}); savePresets(list); draw();
                const pick = ws.querySelector('[data-ps-pick]'); if (pick) pick.value = String(presets().length - 1);
                toast(`Ensemble « ${got.nom} » importé : « Appliquer » pour t’en servir.`); return;
            }
            if (e.target.closest('[data-ps-del]')) { const i = Number(ws.querySelector('[data-ps-pick]').value), x = presets()[i]; if (!x || !await A().confirmBox(`Supprimer l’ensemble « ${x.name} » ?`, {title: 'Supprimer l’ensemble', okLabel: 'Supprimer l’ensemble'})) return; savePresets(presets().filter((_, j) => j !== i)); draw(); return; }
            if (e.target.closest('[data-ps-export]')) { collect(); download(`reglages-animaux-${new Date().toISOString().slice(0, 10)}.json`, {type: 'lcnda-pet-prefs', version: 1, prefs: pr, presets: presets()}); return; }
            const mv = (sel, up) => { const r = e.target.closest(sel); if (!r) return false; if (up && r.previousElementSibling) r.parentNode.insertBefore(r, r.previousElementSibling); if (!up && r.nextElementSibling) r.parentNode.insertBefore(r.nextElementSibling, r); return true; };
            if (e.target.closest('[data-sp-up]')) { mv('[data-sp]', true); return; } if (e.target.closest('[data-sp-down]')) { mv('[data-sp]', false); return; }
            if (e.target.closest('[data-sec-up]')) { mv('[data-sec]', true); return; } if (e.target.closest('[data-sec-down]')) { mv('[data-sec]', false); return; }
            if (e.target.closest('[data-f-up]')) { mv('[data-field-row]', true); return; } if (e.target.closest('[data-f-down]')) { mv('[data-field-row]', false); return; }
            const uid = () => Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
            const nf = e.target.closest('[data-nf-add]'); if (nf) { const row = nf.closest('.h-pp-addf'), sk = nf.closest('[data-sec]').dataset.sec, label = row.querySelector('[data-nf-label]').value.trim(); if (!label) { toast('Écris le nom du champ.', 'error'); return; }
                const type = row.querySelector('[data-nf-type]').value, options = row.querySelector('[data-nf-opts]').value.trim(); collect(); pr.customFields.push({k: 'cf_' + uid(), label, type, options, sec: sk}); pr.cfg[scope] = cleanCfg(pr.cfg[scope], pr); draw(); toast(`Champ « ${label} » ajouté (n’oublie pas « Enregistrer »).`); return; }
            const cfd = e.target.closest('[data-cf-del]'); if (cfd) { if (!await A().confirmBox('Supprimer ce champ ? Ce qui y était écrit reste gardé dans les fiches, mais ne s’affiche plus.', {title: 'Supprimer le champ', okLabel: 'Supprimer le champ'})) return; const k = cfd.closest('[data-field-row]').dataset.fieldRow; collect(); pr.customFields = pr.customFields.filter(x => x.k !== k); draw(); return; }
            if (e.target.closest('[data-cs-add]')) { const label = ws.querySelector('[data-cs-newlabel]').value.trim(); if (!label) { toast('Écris le nom de la catégorie.', 'error'); return; } collect(); pr.customSecs.push({k: 'cs_' + uid(), label, icon: ws.querySelector('[data-cs-newicon]').value.trim() || '🗂️'}); Object.keys(pr.cfg).forEach(k => { pr.cfg[k] = cleanCfg(pr.cfg[k], pr); }); draw(); toast(`Catégorie « ${label} » ajoutée : ajoute-lui des champs avec « ＋ Champ ».`); return; }
            const csd = e.target.closest('[data-cs-del]'); if (csd) { if (!await A().confirmBox('Supprimer cette catégorie et ses champs ? Ce qui y était écrit reste gardé dans les fiches, mais ne s’affiche plus.', {title: 'Supprimer la catégorie', okLabel: 'Supprimer la catégorie'})) return; const k = csd.closest('[data-sec]').dataset.sec; collect(); pr.customSecs = pr.customSecs.filter(x => x.k !== k); pr.customFields = pr.customFields.filter(x => x.sec !== k); Object.keys(pr.cfg).forEach(c => { pr.cfg[c] = cleanCfg(pr.cfg[c], pr); }); draw(); return; }
            if (e.target.closest('[data-sp-add]')) { collect(); const label = ws.querySelector('[data-sp-newlabel]').value.trim(); if (!label) { toast('Écris le nom de l’espèce.', 'error'); return; } const k = 'my_' + Date.now().toString(36); pr.species.push({k, label, icon: ws.querySelector('[data-sp-newicon]').value.trim() || '🐾'}); pr.speciesOrder.push(k); draw(); toast(`Espèce « ${label} » ajoutée (n’oublie pas « Enregistrer »).`); return; }
            const del = e.target.closest('[data-sp-del]'); if (del) { const k = del.closest('[data-sp]').dataset.sp; if (!await A().confirmBox('Supprimer cette espèce ? Les animaux qui l’ont deviennent « Autre » à leur prochaine modification.', {title: 'Supprimer l’espèce', okLabel: 'Supprimer l’espèce'})) return; collect(); pr.species = pr.species.filter(x => x.k !== k); pr.speciesOrder = pr.speciesOrder.filter(x => x !== k); delete pr.cfg[k]; if (scope === k) scope = '*'; draw(); return; }
            if (e.target.closest('[data-pp-save]')) { collect(); savePetPrefs(pr); pr = petPrefs(); draw(); toast('Réglages des animaux enregistrés.'); }
        }, {signal});
        ws.addEventListener('change', async e => {
            if (e.target.matches('[data-ps-import]')) {
                const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
                let v; try { if (file.size > 2e6) throw new Error(); v = JSON.parse(await file.text()); } catch (_) { v = null; }
                if (v?.type !== 'lcnda-pet-prefs' || !v.prefs || typeof v.prefs !== 'object') { toast('Ce fichier n’est pas un fichier de réglages des animaux.', 'error'); return; }
                const add = (Array.isArray(v.presets) ? v.presets : []).filter(x => x && x.prefs && typeof x.prefs === 'object' && String(x.name || '').trim()).slice(0, 50);
                if (!await A().confirmBox(`Remplacer les réglages actuels par ceux du fichier${add.length ? ` (et ajouter ${add.length} ensemble${add.length > 1 ? 's' : ''})` : ''} ?`, {title: 'Importer des réglages', okLabel: 'Remplacer les réglages'})) return;
                savePetPrefs(v.prefs); const names = add.map(x => String(x.name).trim().slice(0, 80));
                savePresets([...presets().filter(x => !names.includes(x.name)), ...add.map((x, i) => ({name: names[i], date: String(x.date || '').slice(0, 20), prefs: x.prefs}))]);
                pr = petPrefs(); savePetPrefs(pr); scope = '*'; draw(); toast('Réglages des animaux importés.'); return;
            }
            if (e.target.matches('[data-pp-scope]')) { const next = e.target.value; e.target.value = scope; collect(); scope = next; draw(); return; }
            if (e.target.matches('[data-nf-type]')) { e.target.parentNode.querySelector('[data-nf-opts]').hidden = e.target.value !== 'select'; return; }
            if (e.target.matches('[data-pp-own]')) { if (e.target.checked) pr.cfg[scope] = cleanCfg(pr.cfg['*'], pr); else delete pr.cfg[scope]; draw(); }
        }, {signal});
    };

    /* ═════════ Les blocs propres aux animaux, sur leur fiche complète ═════════ */
    const secCache = new WeakMap();
    const secsOf = a => { if (!secCache.has(a)) secCache.set(a, petSections(a).out); return secCache.get(a); };
    const BLOCKS = {animal_ident: ['ident', 'pe2', '🔖 Identification et origines'], animal_parents: ['parents', 'pe3', '🌳 Parents et pedigree'], animal_offspring: ['offspring', 'pe3', '🐾 Descendance'], animal_siblings: ['siblings', 'pe3', '👥 Frères et sœurs'],
        animal_owners: ['owners', 'pe4', '🏠 Ses maîtres'], animal_titles: ['titles', 'pe5', '🏆 Titres, expositions, concours'], animal_health: ['health', 'pe6', '🩺 Santé'], animal_measures: ['measures', 'pe7', '📏 Poids et taille'],
        animal_life: ['life', 'pe8', '📅 Sa vie'], animal_story: ['story', 'pe9', '📖 Son histoire et nos souvenirs']};
    Object.entries(BLOCKS).forEach(([key, [sk, pe, title]]) => {
        ext.personBlocks[key] = (index, detail) => {
            const a = detail.heritage?.animal; if (detail.person?.kind !== 'animal' || !a) return '';
            const s0 = secsOf(a).find(x => x.k === sk);
            // le titre peut contenir du HTML déjà échappé (« consanguinité : 0 % ») ; span-12 : largeur réglable comme tout bloc
            return A().card(index, '\u0001', '', s0?.body || '<p class="muted">Rien pour l’instant.</p>', 'span-12', `<button type="button" class="button small secondary" data-pet-editfor="${a.id}" data-pet-jump="${pe}" title="Modifier">✎</button>`).replace('\u0001', s0?.title || esc(title));
        };
    });
    // les catégories à soi (Réglages des animaux), réunies dans un bloc
    ext.personBlocks.animal_custom = (index, detail) => {
        const a = detail.heritage?.animal; if (detail.person?.kind !== 'animal' || !a) return '';
        const cs = petPrefs().customSecs; if (!cs.length) return '';
        const parts = cs.map(c => secsOf(a).find(x => x.k === c.k)).filter(Boolean);
        return A().card(index, '🗂️ Mes catégories', '', parts.length ? parts.map(s0 => `<h4>${s0.title}</h4>${s0.body}`).join('') : '<p class="muted">Rien pour l’instant.</p>', 'span-12', `<button type="button" class="button small secondary" data-pet-editfor="${a.id}" data-pet-jump="${cs[0].k}" title="Modifier">✎</button>`);
    };
    // l'identité d'un animal sur sa fiche complète : celle de sa fiche d'animal
    ext.animalIdentityHtml = detail => { const a = detail?.heritage?.animal; if (!a) return ''; return secsOf(a).find(x => x.k === 'identity')?.body || ''; };
    // « Modifier » sur la fiche complète d'un animal : son formulaire d'animal (à la bonne partie)
    ext.editAnimalFiche = async (detail, jump = 'pe1') => {
        try {
            let petId = detail?.heritage?.animal?.id;
            if (!petId) petId = Number((await api('pet_for_person', {}, {method: 'POST', body: {person_id: Number(detail.person.id)}})).result?.id);
            const pet = await api('pet', {id: petId});
            openEditor(pet, () => { S().currentPersonId = Number(detail.person.id); A().setModule('personnes'); }, {}, {jump});
        } catch (error) { toast(error.message, 'error'); }
    };
    // « + Nouvel animal » depuis Personnes / Animaux : le formulaire d'un animal, avec sa fiche complète
    ext.newAnimalFiche = () => openEditor(null, null, {}, {fromFiche: true});

    /* ═════════ Bloc « Caractéristiques de l'animal » de sa fiche complète ═════════ */
    ext.personBlocks.animal = (index, detail) => {
        const a = detail.heritage?.animal; if (detail.person?.kind !== 'animal') return '';
        if (!a) return A().card(index, '🐾 Caractéristiques de l’animal', '', '<p class="muted">Pas encore de fiche d’animal (race, puce, éleveur, pedigree…).</p>', 'span-12', `<button type="button" class="button small" data-pet-createfor="${Number(detail.person.id)}">＋ Ses caractéristiques</button>`);
        const d = a.data || {}, anc = a.ancestors || {}, f = coi(a.id, anc), sire = d.sire_id && anc[d.sire_id], dam = d.dam_id && anc[d.dam_id];
        const dlA = rows => rows.filter(([, v]) => v).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
        const body = `<div class="h-pet-animalblock">${a.media?.[0] ? photoHtml(a.media[0], 'is-mini') : `<span class="h-pet-hero-ic">${iconOf(d.species)}</span>`}
            <dl class="h-pet-dl">${dlA([['Espèce', speciesLabel(d.species)], ['Race', [d.breed, d.variety].filter(Boolean).join(', ')], ['Nom officiel', d.registered_name !== a.title ? d.registered_name : ''], ['Robe', d.color], ['Marques', d.markings], ['Puce', d.microchip], ['Tatouage', d.tattoo],
                ['Livre des origines', [d.registry, d.registration].filter(Boolean).join(' · ')], ['Éleveur', [d.breeder, d.affix].filter(Boolean).join(' · ')], ['Père', sire ? sire.title : d.sire_name], ['Mère', dam ? dam.title : d.dam_name],
                ['Consanguinité', Object.keys(anc).length > 1 ? coiText(f) : ''], ['Petits', (a.offspring || []).length ? fmt(a.offspring.length) : ''], ['Titres', (d.titles || []).length ? d.titles.map(t => t.title).filter(Boolean).join(', ') : '']]) || '<div><dd class="muted">Ses caractéristiques (race, puce, éleveur, santé…) : « ✎ Caractéristiques ».</dd></div>'}</dl></div>`;
        return A().card(index, `${iconOf(d.species)} Caractéristiques de l’animal`, '', body, 'span-12',
            `<button type="button" class="button small" data-pet-editfor="${a.id}">✎ Caractéristiques</button><button type="button" class="button small secondary" data-pet-pedfor="${a.id}">🌳 Pedigree</button><button type="button" class="button small secondary" data-pet-goto="${a.id}">🐾 Fiche d’animal</button>`);
    };
    document.addEventListener('click', async e => {
        const cf = e.target.closest?.('[data-pet-createfor]');
        if (cf) { e.preventDefault(); try { const r = await api('pet_for_person', {}, {method: 'POST', body: {person_id: Number(cf.dataset.petCreatefor)}}); const pet = await api('pet', {id: Number(r.result?.id || r.id)}); openEditor(pet, () => A().setModule('personnes')); } catch (error) { toast(error.message, 'error'); } return; }
        const ed = e.target.closest?.('[data-pet-editfor]'), pd = e.target.closest?.('[data-pet-pedfor]');
        if (pd) { e.preventDefault(); openPet(Number(pd.dataset.petPedfor), 'pedigree'); return; }
        if (!ed) return; e.preventDefault();
        try { const pet = await api('pet', {id: Number(ed.dataset.petEditfor)}); openEditor(pet, () => A().setModule('personnes'), {}, {jump: ed.dataset.petJump || ''}); } catch (error) { toast(error.message, 'error'); }
    });

    /* ═════════ Bloc de la fiche d'une personne ═════════ */
    ext.personBlocks.pets = (index, detail) => {
        const list = detail.heritage?.pets || [];
        const pid = Number(detail.person?.id || detail.id || 0);
        return A().card(index, '🐾 Animaux de compagnie', list.length || '', list.length ? `<div class="h-pet-minis">${list.map(p => `<button type="button" class="h-pet-mini" data-pet-goto="${p.id}">${p.photo ? photoHtml(p.photo, 'is-mini') : `<span class="h-pet-mini-ic">🐾</span>`}<span><strong>${esc(p.title)}</strong><small>${esc([String(speciesLabel(p.species_key) || p.species || '').split(/[ ,(]/)[0], p.breed].filter(Boolean).join(' · '))}</small><small class="muted">${esc([p.role !== 'propriétaire' && p.role, lifespan(p), (p.from || p.to) && [p.from && 'depuis ' + p.from, p.to && 'jusqu’à ' + p.to].filter(Boolean).join(' ')].filter(Boolean).join(' · '))}</small></span></button>`).join('')}</div>`
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
            <div class="h-pet-wgrid">${shown.map(r => `<button type="button" class="h-pet-wcard ${r.deceased ? 'is-gone' : ''}" data-pet-goto="${r.id}">${r.media?.[0] ? A().mediaThumbHtml(r.media[0]) : `<span class="h-pet-icon">${iconOf(r.species)}</span>`}<strong>${esc(r.title)}</strong><small>${esc(r.breed || String(speciesLabel(r.species) || r.species_label || '').split(/[ ,(]/)[0])}</small></button>`).join('')}</div>
            ${alive.length < rows.length ? `<p class="muted">${fmt(rows.length - alive.length)} animal${rows.length - alive.length > 1 ? 'ux' : ''} disparu${rows.length - alive.length > 1 ? 's' : ''} dans la liste.</p>` : ''}`
            : '<p class="muted">Aucun animal. Listes → Animaux de compagnie → « + Nouvel animal ».</p>', span, '<button type="button" class="button small secondary" data-pet-all>Tous</button>');
    }};
    document.addEventListener('click', e => { if (e.target.closest?.('[data-pet-all]')) { const st = S(); st.hPet = 0; st.listType = 'pets'; A().setModule('listes'); } });
    ext.petsInternals = {coi, ageOf, parseDate}; // pour les essais
})();
