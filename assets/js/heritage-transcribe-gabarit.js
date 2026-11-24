/* LCNDA — 📜 Atelier de transcription, vague 3 (3b) : 🧩 les gabarits d'actes (maquette docs/design/atelier-gabarits.html, choix « tout A »).
 * Un gabarit, ce sont les cases qu'on relève pour une sorte d'acte (baptême : date, enfant, né le, père, mère, parrain, marraine…).
 * « 🧭 Repérer » les remplit à partir de ce que l'app a trouvé dans le texte (extractAct, heritage-transcribe-acte-core.js), sans
 * jamais écraser une case vérifiée (✓) ou écrite à la main. Chaque case garde son passage du texte (s, e) : un clic le montre.
 * Gardé avec l'acte : data.gabarit = {kind, fields: {clé: {v, s, e, ok, own}}} (vérifié côté serveur, lib/transcriptions.php).
 * Réglage « Modèle d'acte » : 'gabarit' (conseillé) ou 'texte' (le texte à trous d'avant). Essai : tests/test-atelier-gabarits.js.
 */
(() => {
    'use strict';
    const i18n = (s, v) => { const I = window.LCNDA_I18N; if (v) v = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x])); return I ? I.t(s, v) : (v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s); };
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

    const MODE_KEY = 'genealogie-transcribe-modele';
    const mode = () => { try { return localStorage.getItem(MODE_KEY) === 'texte' ? 'texte' : 'gabarit'; } catch (_) { return 'gabarit'; } };
    const setMode = v => { try { localStorage.setItem(MODE_KEY, v === 'texte' ? 'texte' : 'gabarit'); } catch (_) {} };

    /* ─── ce qu'on lit dans le texte ─── */
    const who = (ex, role) => (ex?.people || []).filter(p => p.role === role);
    const one = (ex, role) => who(ex, role)[0] || null;
    const yrs = n => i18n('{n} ans', {n});
    /** une personne en une ligne : « Pierre MAZAUD, laboureur, 40 ans, demeurant à Sancoins » (ce qu'on sait) */
    const line = (p, {job = true, age = true, home = false} = {}) => [p.name, job && p.job, age && p.age != null ? yrs(p.age) : '', home && p.residence].filter(Boolean).join(', ');
    const pv = (p, o) => (p ? {v: line(p, o), s: p.s, e: p.e} : null);
    const many = (list, o) => (list.length ? {v: list.map(p => line(p, o)).join(' ; '), s: list[0].s, e: list[list.length - 1].e} : null);
    const rx = (src, re, g = 0) => { const m = re.exec(src); if (!m) return null; const v = (m[g] ?? m[0]).replace(/\s+/g, ' ').trim(); if (!v) return null; const at = m.index + Math.max(0, m[0].indexOf(m[g] ?? m[0])); return {v: v.length > 140 ? v.slice(0, 139) + '…' : v, s: at, e: at + (m[g] ?? m[0]).length}; };
    const date = ex => (ex?.date?.label ? {v: ex.date.label, s: ex.date.s, e: ex.date.e} : null);
    const placeOf = ex => (ex?.place ? {v: ex.place, s: -1, e: -1} : null);
    const parents = (ex, of) => { const ps = (ex?.people || []).filter(p => p.relations?.some(r => r.type === 'parent_of' && r.of === of?.key)); return of && ps.length ? many(ps, {age: false}) : null; };
    const BORN = /\bn[ée]e?s?\s+(d['’]\s*hier|(?:le|du|ce)\s+[^,.;\n]{3,60}|aujourd['’]hui|cejourd['’]hui)/i;
    const DIED = /\bd[ée]c[ée]d[ée]e?s?\s+((?:le|ce|hier|aujourd['’]hui|cejourd['’]hui|en|à|au)\b[^,.;\n]{0,60})/i;
    const sig = ex => (ex?.signatures?.length ? {v: ex.signatures[0], s: -1, e: -1} : null);

    /* ─── les 9 gabarits : [clé, nom de la case, (ex, texte) → {v, s, e} | null] ─── */
    const G = {
        bapteme: [['date', 'Date du baptême', ex => date(ex)], ['enfant', 'Enfant', ex => pv(one(ex, 'sujet'), {age: false})], ['ne', 'Né le', (ex, s) => rx(s, BORN, 1)],
            ['pere', 'Père, métier', ex => pv(one(ex, 'pere'), {age: false})], ['mere', 'Mère', ex => pv(one(ex, 'mere'), {age: false})],
            ['parrain', 'Parrain', ex => pv(one(ex, 'parrain'))], ['marraine', 'Marraine', ex => pv(one(ex, 'marraine'))], ['cure', 'Curé', (ex, s) => rx(s, /(?:[A-ZÀ-Ý][\wÀ-ÿ'’-]+\s+)?\b(?:cur[ée]|vicaire|pr[êe]tre|desservant)(?![a-zà-ÿ])[^,.;\n]{0,50}/i)], ['sign', 'Signatures', ex => sig(ex)]],
        naissance: [['date', 'Date de l’acte', ex => date(ex)], ['heure', 'Heure', (ex, s) => rx(s, /\b(?:à|a)\s+((?:[\wÀ-ÿ-]+\s+){0,3}heures?(?:\s+(?:du|de l['’]\s*)\s*(?:matin|soir|après-midi|midi))?)/i, 1)],
            ['enfant', 'Enfant', ex => pv(one(ex, 'sujet'), {age: false})], ['sexe', 'Sexe', (ex, s) => rx(s, /\bsexe\s+(masculin|f[ée]minin)/i, 1)], ['ne', 'Né le', (ex, s) => rx(s, BORN, 1)], ['lieu', 'Lieu', ex => placeOf(ex)],
            ['pere', 'Père', ex => pv(one(ex, 'pere'), {home: true})], ['mere', 'Mère', ex => pv(one(ex, 'mere'), {home: true})], ['temoins', 'Témoins', ex => many(who(ex, 'temoin'))],
            ['officier', 'Officier de l’état civil', (ex, s) => rx(s, /\b(?:maire|adjoint|officier de l['’]\s*[ée]tat civil)\b[^.;\n]{0,60}/i)]],
        mariage: [['date', 'Date du mariage', ex => date(ex)], ['epoux', 'Époux', ex => pv(one(ex, 'epoux'), {home: true})], ['parents_epoux', 'Parents de l’époux', ex => parents(ex, one(ex, 'epoux'))],
            ['epouse', 'Épouse', ex => pv(one(ex, 'epouse'), {home: true})], ['parents_epouse', 'Parents de l’épouse', ex => parents(ex, one(ex, 'epouse'))],
            ['contrat', 'Contrat de mariage', (ex, s) => rx(s, /\bcontrat de mariage\b[^.;\n]{0,80}/i)], ['temoins', 'Témoins', ex => many(who(ex, 'temoin'))],
            ['publications', 'Publications', (ex, s) => rx(s, /\b(?:publications?|bans)\b[^.;\n]{0,80}/i)], ['sign', 'Signatures', ex => sig(ex)]],
        deces: [['date', 'Date de l’acte', ex => date(ex)], ['defunt', 'Défunt', ex => pv(one(ex, 'defunt'), {age: false})], ['age', 'Âge', ex => { const p = one(ex, 'defunt'); return p?.age != null ? {v: yrs(p.age), s: p.s, e: p.e} : null; }],
            ['decede', 'Décédé le', (ex, s) => rx(s, DIED, 1)], ['lieu', 'Lieu', ex => placeOf(ex)], ['domicile', 'Domicile', ex => { const p = one(ex, 'defunt'); return p?.residence ? {v: p.residence, s: p.s, e: p.e} : null; }],
            ['conjoint', 'Conjoint', ex => pv(one(ex, 'conjoint'), {age: false})], ['parents', 'Parents', ex => parents(ex, one(ex, 'defunt'))], ['declarants', 'Déclarants', ex => many([...who(ex, 'declarant'), ...who(ex, 'temoin')])]],
        sepulture: [['date', 'Date d’inhumation', ex => date(ex)], ['defunt', 'Défunt', ex => pv(one(ex, 'defunt'), {age: false})], ['age', 'Âge', ex => { const p = one(ex, 'defunt'); return p?.age != null ? {v: yrs(p.age), s: p.s, e: p.e} : null; }],
            ['decede', 'Décédé le', (ex, s) => rx(s, DIED, 1)], ['famille', 'Conjoint', ex => pv(one(ex, 'conjoint'), {age: false}) || parents(ex, one(ex, 'defunt'))], ['temoins', 'Témoins', ex => many(who(ex, 'temoin'))],
            ['cure', 'Curé', (ex, s) => rx(s, /(?:[A-ZÀ-Ý][\wÀ-ÿ'’-]+\s+)?\b(?:cur[ée]|vicaire|pr[êe]tre|desservant)(?![a-zà-ÿ])[^,.;\n]{0,50}/i)]],
        notarial: [['date', 'Date', ex => date(ex)], ['notaire', 'Notaire', (ex, s) => rx(s, /\b(?:par-?devant|devant)\s+(?:ma[iî]tre|Me|M\.?e)\s+([^,.;\n]{3,60})/i, 1) || rx(s, /\bnotaire\b[^,.;\n]{0,60}/i)], ['lieu', 'Lieu', ex => placeOf(ex)],
            ['sorte', 'Sorte d’acte', (ex, s) => rx(s, /\b(vente|contrat de mariage|testament|bail(?: à ferme)?|partage|inventaire|quittance|obligation|donation|procuration|cession|échange|transaction)\b/i, 1)],
            ['parties', 'Parties', ex => many((ex?.people || []).filter(p => !['temoin', 'officier'].includes(p.role)).slice(0, 6), {home: true})], ['objet', 'Objet', () => null],
            ['prix', 'Prix', (ex, s) => rx(s, /\b(?:moyennant|pour le prix de|au prix de)\s+(?:la somme de\s+)?([^,.;\n]{3,80})/i, 1)], ['temoins', 'Témoins', ex => many(who(ex, 'temoin'))]],
        notoriete: [['date', 'Date', ex => date(ex)], ['juge', 'Juge ou notaire', (ex, s) => rx(s, /\b(?:juge de paix|notaire|greffier)\b[^,.;\n]{0,60}/i)],
            ['personne', 'Personne concernée', ex => pv((ex?.people || []).find(p => !['temoin', 'officier', 'declarant'].includes(p.role)) || null, {home: true})],
            ['atteste', 'Ce qui est attesté', (ex, s) => rx(s, /[^.\n]*\b(?:attest|certifi|d[ée]clar(?:ent|ons|é)|affirm)[^.\n]*/i)], ['temoins', 'Témoins', ex => many(who(ex, 'temoin').length ? who(ex, 'temoin') : who(ex, 'declarant'), {home: true})]],
        recensement: [['commune', 'Commune', ex => placeOf(ex)], ['annee', 'Année', ex => (ex?.year ? {v: String(ex.year), s: ex.date?.s ?? -1, e: ex.date?.e ?? -1} : null)],
            ['maison', 'Rue ou maison', (ex, s) => rx(s, /\b(?:rue|maison|hameau|lieu-dit|n°)\s*[^,.;\n]{1,50}/i)], ['menage', 'Ménage', ex => many(ex?.people || [])]],
        militaire: [['nom', 'Nom', ex => pv((ex?.people || [])[0] || null, {job: false, age: false})], ['matricule', 'Matricule', (ex, s) => rx(s, /\bmatricule\s*(?:n[°o]\s*)?(\d[\d ]*)/i, 1)], ['classe', 'Classe', (ex, s) => rx(s, /\bclasse\s+(?:de\s+)?(1[789]\d\d|20\d\d)/i, 1)],
            ['ne', 'Né le', (ex, s) => rx(s, BORN, 1)], ['lieu', 'Lieu', ex => placeOf(ex)], ['signalement', 'Signalement', (ex, s) => rx(s, /\b(?:cheveux|yeux|taille)\b[^.\n]{0,100}/i)],
            ['regiment', 'Régiment', (ex, s) => rx(s, /\b\d+\s*(?:e|ème|eme|er)?\s*(?:régiment|regiment|bataillon|escadron|demi-brigade)\b[^,.;\n]{0,50}/i)],
            ['campagnes', 'Campagnes', (ex, s) => rx(s, /\bcampagnes?\b[^.\n]{0,100}/i)], ['blessures', 'Blessures', (ex, s) => rx(s, /\bbless[ée]e?s?(?![a-zà-ÿ])[^.\n]{0,80}/i)]],
    };
    const has = kind => !!G[kind];
    const KIND_NAME = {bapteme: 'Baptême', naissance: 'Naissance', mariage: 'Mariage', deces: 'Décès', sepulture: 'Sépulture', notarial: 'Acte notarié', notoriete: 'Acte de notoriété', recensement: 'Recensement', militaire: 'Registre militaire'};

    /** remplir le gabarit (rien d'écrasé : une case ✓ ou écrite à la main reste) ; renvoie le gabarit à garder */
    function fill(gab, kind, ex, text) {
        const out = {kind, fields: {...(gab && gab.kind === kind ? gab.fields || {} : {})}};
        if (!G[kind]) return out;
        G[kind].forEach(([k, , f]) => {
            const cur = out.fields[k]; if (cur && (cur.ok || cur.own)) return;
            let got = null; try { got = ex ? f(ex, String(text || '')) : null; } catch (_) { got = null; }
            if (got && got.v) out.fields[k] = {v: String(got.v).slice(0, 300), s: got.s ?? -1, e: got.e ?? -1}; else delete out.fields[k];
        });
        return out;
    }

    /**
     * le panneau : render(box, {gab, kind, guess, where(s) → « l. 3 » | « page 2, l. 3 »}) ; les actions sont des attributs
     * data-gab-* que l'Atelier écoute (écrire, ✓, montrer le passage, changer de sorte, menu ⋯).
     */
    function render(box, o) {
        const kind = o.kind, gab = o.gab && o.gab.kind === kind ? o.gab : {kind, fields: {}};
        if (!G[kind]) {
            const g = o.guess && G[o.guess] ? o.guess : '';
            box.innerHTML = `<div class="h-gab-empty"><p class="muted">${esc(i18n('Choisis la sorte d’acte (en haut) : chaque sorte a ses cases.'))}</p>${g ? `<button type="button" class="button small" data-gab-kind="${g}">🧩 ${esc(i18n('On dirait : {x}. Utiliser ce gabarit ?', {x: i18n(KIND_NAME[g])}))}</button>` : ''}</div>`;
            return;
        }
        const F = G[kind], filled = F.filter(([k]) => gab.fields[k]?.v).length, ok = F.filter(([k]) => gab.fields[k]?.ok).length;
        box.innerHTML = `<div class="h-gab-head"><b>${esc(i18n(KIND_NAME[kind]))}</b><small class="muted" data-gab-count>${esc(i18n('Cases remplies : {a}/{b} · vérifiées : {c}', {a: filled, b: F.length, c: ok}))}</small><span class="spacer"></span><button type="button" class="icon-button small" data-gab-menu aria-haspopup="menu" title="${esc(i18n('Gabarit'))}" aria-label="${esc(i18n('Gabarit'))}">⋯</button></div>
            <div class="h-gab-fields">${F.map(([k, label]) => { const f = gab.fields[k] || null, st = !f?.v ? 'is-empty' : f.ok ? 'is-ok' : f.own ? 'is-own' : 'is-auto', w = f && f.s >= 0 ? o.where?.(f.s) : '';
                return `<label class="h-gab-k" for="gab-${k}">${esc(i18n(label))}</label><input id="gab-${k}" class="h-gab-v ${st}" data-gab-field="${k}" value="${esc(f?.v || '')}" placeholder="${esc(i18n('à remplir'))}" spellcheck="false" autocomplete="off">
                    <span class="h-gab-a">${f?.ok ? '<span class="h-gab-ok" title="' + esc(i18n('Vérifié')) + '">✓</span>' : `<button type="button" class="icon-button small" data-gab-ok="${k}" ${f?.v ? '' : 'disabled'} title="${esc(i18n('Vérifié'))}" aria-label="${esc(i18n('Vérifié'))}">✓</button>`}${w ? ` <button type="button" class="link-button" data-tx-goto="${f.s}:${f.e}">${esc(w)}</button>` : ''}</span>`; }).join('')}</div>
            <p class="muted h-gab-hint">${esc(i18n('Vert : rempli par « 🧭 Repérer », à vérifier · Entrée : ✓ vérifié · un clic sur « l. 3 » montre le passage.'))}</p>`;
    }
    ext.txGabarit = {G, has, fill, render, mode, setMode, MODE_KEY, KIND_NAME};
})();
