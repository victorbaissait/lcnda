/* LCNDA — 🎨 Catalogues d'artistes : les TYPES DE CHAMPS du moteur (noyau : heritage-artist.js).
 * Chaque type sait s'écrire dans le formulaire (edit), se relire (get / collect), s'afficher (read), se dire en texte
 * (text : listes, export, recherche). Les 12 types proposés dans « ＋ Ajouter un champ » (texte, texte long, nombre, date,
 * lien, personne, lieu, image/son, liste, note sur 5, montant, oui/non) + ceux des sortes intégrées (personnes avec rôles,
 * autre fiche, photos, tableau, dimensions, identifiant, choix fixe).
 * Personnes, lieux, fiches : le menu de choix unique (pickerField) ; images et sons : la fenêtre unique (openMediaPicker).
 */
(() => {
    'use strict';
    const ART = window.LCNDA_ART; if (!ART) return;
    const A = () => window.LCNDA_APP, P = () => window.LCNDA_PICKER || window.LCNDA_APP, ext = window.LCNDA_EXT || {};
    const U = ART.util, esc = U.esc;
    const ch = f => (f.choices || []).map(c => Array.isArray(c) ? c : [c, c]);
    const lab = (f, v) => (ch(f).find(c => String(c[0]) === String(v)) || [, v])[1];
    const inp = (v, extra = '') => `<input class="ar-in" data-v value="${esc(v ?? '')}" ${extra}>`;
    const val = el => el.querySelector('[data-v]')?.value ?? '';
    const pkItems = el => { const pk = el.querySelector('.pk'); if (!pk) return []; try { const v = JSON.parse(pk.dataset.pkValue || '[]'); return Array.isArray(v) ? v : v ? [v] : []; } catch (_) { return []; } };
    const nl2br = s => esc(s).replace(/\n/g, '<br>');
    const T = ART.ft;

    /* ── simples ── */
    T.text = {label: 'Texte', badge: 'texte', tile: 'Aa Texte', edit: (f, v) => inp(v, f.ph ? `placeholder="${esc(f.ph)}"` : ''), get: val, read: (f, v) => esc(v) + (f.unit ? ` <small class="ar-g">${esc(f.unit)}</small>` : ''), text: (f, v) => String(v)};
    T.longtext = {label: 'Texte long', badge: '¶', tile: '¶ Texte long', wide: true, edit: (f, v) => `<textarea class="ar-in" data-v rows="${f.rows || 4}">${esc(v ?? '')}</textarea>`, get: val, read: (f, v) => `<div class="ar-long">${nl2br(v)}</div>`, text: (f, v) => String(v)};
    T.number = {label: 'Nombre', badge: '123', tile: '123 Nombre', edit: (f, v) => inp(v, `inputmode="decimal" autocomplete="off"${f.unit ? ` data-unit="${esc(f.unit)}"` : ''}`), get: el => val(el).trim(), // K17 : l'unité dans la case ; texte : la virgule française reste (« 46,5 »)
        read: (f, v) => `${esc(String(v).replace('.', ','))}${f.unit ? ` ${esc(f.unit)}` : ''}`, text: (f, v) => `${String(v).replace('.', ',')}${f.unit ? ` ${f.unit}` : ''}`};
    T.date = {label: 'Date', badge: '📅', tile: '📅 Date', edit: (f, v) => inp(v, `data-ui-date placeholder="${esc(f.ph || '7 mai 1925, vers 1784, mars 1958…')}"`), get: val, read: (f, v) => esc(v), text: (f, v) => String(v)};
    const safeUrl = u => /^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '';
    T.url = {label: 'Lien', badge: '🔗', tile: '🔗 Lien', edit: (f, v) => inp(v, 'placeholder="https://…" inputmode="url"'), get: el => val(el).trim(),
        read: (f, v) => { const u = safeUrl(v); return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60))}</a>` : esc(v); }, text: (f, v) => String(v)};
    /** un identifiant (Discogs r4012233, MusicBrainz…) : l'adresse est fabriquée par la définition (f.href) */
    T.ident = {label: 'Identifiant', badge: 'n°', edit: (f, v) => inp(v, f.ph ? `placeholder="${esc(f.ph)}"` : ''), get: el => val(el).trim(),
        read: (f, v) => { const u = safeUrl(f.href ? f.href(String(v).trim()) : v); return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer" class="ar-ident">${esc(String(v).length > 14 ? `${String(v).slice(0, 12)}…` : v)}</a>` : esc(v); }, text: (f, v) => String(v)};
    T.select = {label: 'Choix fixe', badge: 'choix', edit: (f, v) => `<select class="ar-in" data-v>${ch(f).map(([k, l]) => `<option value="${esc(k)}" ${String(v ?? ch(f)[0]?.[0]) === String(k) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`, get: val,
        read: (f, v) => esc(lab(f, v)), text: (f, v) => String(lab(f, v)), empty: v => v == null || v === ''};
    T.list = {label: 'Liste de choix', badge: 'liste', tile: '☑ Liste de choix', edit: (f, v) => { const sel = Array.isArray(v) ? v.map(String) : v ? [String(v)] : []; return `<div class="ar-checks">${ch(f).map(([k, l]) => `<label class="checkbox-line"><input type="checkbox" value="${esc(k)}" ${sel.includes(String(k)) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>`; },
        get: el => [...el.querySelectorAll('.ar-checks input:checked')].map(i => i.value), read: (f, v) => { const l = Array.isArray(v) ? v : [v]; return ch(f).map(([k, x]) => `<span class="ar-tick ${l.map(String).includes(String(k)) ? 'on' : ''}">${l.map(String).includes(String(k)) ? '☑' : '☐'} ${esc(x)}</span>`).join(' '); },
        text: (f, v) => (Array.isArray(v) ? v : [v]).map(x => lab(f, x)).join(', '), empty: v => !v || (Array.isArray(v) && !v.length)};
    T.rating = {label: 'Note /5', badge: '⭐', tile: '⭐ Note /5', edit: (f, v) => `<span class="ar-stars" data-stars="${Number(v) || 0}">${[1, 2, 3, 4, 5].map(n => `<button type="button" class="${n <= (Number(v) || 0) ? 'on' : ''}" data-star="${n}" aria-label="${n} sur 5">★</button>`).join('')}<button type="button" class="ar-linkbtn" data-star="0">effacer</button></span>`,
        get: el => Number(el.querySelector('[data-stars]').dataset.stars) || 0, read: (f, v) => `<span class="ar-starsr">${'★'.repeat(Number(v) || 0)}${'☆'.repeat(5 - (Number(v) || 0))}</span>`, text: (f, v) => `${v}/5`, empty: v => !Number(v)};
    T.money = {label: 'Montant', badge: '💶', tile: '💶 Montant', edit: (f, v) => inp(v, 'inputmode="decimal" placeholder="12, 25 – 40, 8 500 F…"'), get: el => val(el).trim(), read: (f, v) => esc(U.money(v)), text: (f, v) => U.money(v)};
    T.bool = {label: 'Oui / non', badge: 'oui/non', tile: '☐ Oui / non', edit: (f, v) => `<label class="ui-toggle"><input type="checkbox" data-v ${v ? 'checked' : ''}><i></i>${esc(f.on || 'Oui')}</label>`, get: el => !!el.querySelector('[data-v]')?.checked,
        read: (f, v) => v ? esc(f.on || 'Oui') : 'Non', text: (f, v) => v ? 'Oui' : 'Non', empty: v => v !== true && v !== false};

    /* ── personnes, lieux, autres fiches : le menu de choix unique ── */
    const pkVal = (v, kind) => { if (kind === 'person') { const p = U.person(v); return p ? (p.pid ? {id: p.pid, title: p.title || ''} : `txt:${p.txt}`) : null; }
        if (kind === 'place') { const p = U.place(v); return p ? (p.plid ? {id: p.plid, title: p.title || ''} : `txt:${p.txt}`) : null; }
        const r = U.ref(v); return r ? (r.iid ? {id: r.iid, title: r.title || '', kind: 'artwork', art_kind: r.kind} : `txt:${r.txt}`) : null; };
    const fromItem = (it, kind) => { if (!it) return null; if (it.free || !it.id) return it.title ? (kind === 'person' ? {pname: String(it.title)} : {txt: String(it.title)}) : null;
        if (kind === 'person') return {pid: Number(it.id), title: it.title || ''}; if (kind === 'place') return {plid: Number(it.id), title: it.title || ''};
        return {iid: Number(it.id), title: it.title || '', kind: it.art_kind || ''}; };
    ART.pkVal = pkVal; ART.fromItem = fromItem;
    const pk = (o) => P().pickerField({hiddenName: false, name: '', inline: false, ...o});
    T.person = {label: 'Personne', badge: '👤', tile: '👤 Personne', edit: (f, v) => pk({kind: 'person', allowFree: f.free !== false, value: pkVal(v, 'person')}),
        get: el => fromItem(pkItems(el)[0], 'person'), read: (f, v, ctx) => U.personChip(v, '', ctx), text: (f, v) => U.nameOf(v), empty: v => !U.person(v)};
    T.place = {label: 'Lieu', badge: '📍', tile: '📍 Lieu', edit: (f, v) => pk({kind: 'place', allowFree: f.free !== false, value: pkVal(v, 'place')}),
        get: el => fromItem(pkItems(el)[0], 'place'), read: (f, v) => U.placeChip(v), text: (f, v) => U.placeTitle(v), empty: v => !U.place(v)};
    /** une autre fiche du catalogue (f.kinds : les sortes permises ; « ＋ Créer » en crée une tout de suite) */
    const itemPk = (f, v, multiple = false) => `<div data-art-create="${esc((f.kinds || [])[0] || '')}">${pk({kind: 'artwork', allowFree: f.free !== false, allowCreate: !!(f.kinds || []).length, multiple, value: multiple ? (Array.isArray(v) ? v : []).map(x => pkVal(x, 'artwork')).filter(Boolean) : pkVal(v, 'artwork'), filter: {art_kind: (f.kinds || []).join(',')}})}</div>`;
    T.item = {label: 'Autre fiche', badge: '🔗', edit: (f, v) => itemPk(f, v), get: el => fromItem(pkItems(el)[0], 'artwork'),
        read: (f, v, ctx) => U.refChip(v, (f.kinds || []).length === 1 ? ART.defs[f.kinds[0]]?.icon : '') + (f.count ? ` <small class="ar-g">${esc(f.count(ctx, v) || '')}</small>` : ''), text: (f, v) => U.refTitle(v), empty: v => !U.ref(v)};
    T.items = {label: 'Autres fiches', badge: '🔗+', wide: true, edit: (f, v) => itemPk(f, v, true), get: el => pkItems(el).map(x => fromItem(x, 'artwork')).filter(Boolean),
        read: (f, v) => (Array.isArray(v) ? v : []).map(x => U.refChip(x)).join(' '), text: (f, v) => (Array.isArray(v) ? v : []).map(U.refTitle).join(', '), empty: v => !Array.isArray(v) || !v.length};

    /* ── des personnes avec un rôle (crédits, distribution, membres…) : rôle libre + personne (ou nom sans fiche) ── */
    const normPeople = v => (Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? v.split(/\s*[,;]\s*/).map(n => ({txt: n})) : []).map(r => { if (typeof r === 'string') return {pname: r, txt: r, role: ''}; const p = U.person(r.pid ? r : (r.pname || r.txt || r.name || r.title) ? r : null); if (!p) return null; const o = p.pid ? {pid: p.pid, title: p.title} : {pname: p.pname}; return {...o, txt: p.txt, role: r.role || '', tracks: r.tracks || ''}; }).filter(Boolean);
    ART.normPeople = normPeople;
    const pplRow = (f, r, i) => `<div class="ar-prow" data-i="${i}"><span class="ar-grip" title="Glisser pour ranger" draggable="true">⠿</span><input class="ar-in ar-role-in" data-c="role" value="${esc(r.role || '')}" placeholder="${esc(f.rolePh || 'rôle (chant, accordéon…)')}">
        <span class="ar-pk">${pk({kind: 'person', allowFree: true, value: pkVal(r, 'person')})}</span>${f.scope ? `<input class="ar-in ar-tracks-in" data-c="tracks" value="${esc(r.tracks || '')}" placeholder="${esc(f.scope)}" title="${esc(f.scopeHelp || 'Seulement sur certaines pistes (A1, B2…) ; vide = tout le disque')}">` : ''}
        <span class="ar-ract"><button type="button" class="icon-button small" data-r-up title="Monter">↑</button><button type="button" class="icon-button small" data-r-down title="Descendre">↓</button><button type="button" class="icon-button small" data-r-del title="Retirer">✕</button></span></div>`;
    T.people = {label: 'Personnes et rôles', badge: '👤 rôles', wide: true, block: true,
        edit: (f, v) => { const l = normPeople(v); return `<div class="ar-people" data-ar-rows="people">${l.map((r, i) => pplRow(f, r, i)).join('')}</div><button type="button" class="button small secondary" data-r-add="people">＋ ${esc(f.addLabel || 'Une personne')}</button>`; },
        get: el => [...el.querySelectorAll('.ar-prow')].map(row => { const p = fromItem(pkItems(row)[0], 'person'); if (!p) return null; return {...p, role: row.querySelector('[data-c="role"]').value.trim(), ...(row.querySelector('[data-c="tracks"]')?.value.trim() ? {tracks: row.querySelector('[data-c="tracks"]').value.trim()} : {})}; }).filter(Boolean),
        read: (f, v, ctx) => { const l = normPeople(v); if (f.view && ART.views[f.view]) return ''; return `<div class="ar-credits ${l.length > 3 ? 'is-cols' : ''}">${l.map(r => `<div>${r.role ? `${esc(r.role)} – ` : ''}${U.personChip(r, '', ctx)}${r.tracks ? ` <small class="ar-g">(${esc(r.tracks)})</small>` : ''}</div>`).join('')}</div>`; },
        text: (f, v) => normPeople(v).map(r => `${r.role ? `${r.role} : ` : ''}${r.title || r.txt}`).join(' · '), empty: v => !normPeople(v).length,
        blank: () => ({role: ''})};

    /* ── un média (son, image) : la fenêtre unique ── */
    const mediaOf = v => v && typeof v === 'object' && Number(v.mid || v.m || v.id) > 0 ? {mid: Number(v.mid || v.m || v.id), f: v.f || v.filename || '', title: v.title || '', dur: v.dur || v.duration || '', type: v.type || v.media_type || ''} : null;
    ART.mediaOf = mediaOf;
    T.media = {label: 'Image / son', badge: '🖼', tile: '🖼 Image / son', edit: (f, v, ctx) => { const m = mediaOf(v); return P().mediaField({name: '', types: f.media || ['image', 'audio', 'video'], person: ctx.pid, value: m ? {id: m.mid, title: m.title, filename: m.f, thumb: /\.(jpe?g|png|webp|gif)$/i.test(m.f) ? `media/${m.f}` : ''} : null, title: f.label}); },
        get: el => { const mf = el.querySelector('[data-media-field]'); let it = null; try { it = JSON.parse(mf?.dataset.mfValue || '[]')[0]; } catch (_) {} return it?.id ? {mid: Number(it.id), f: it.filename || '', title: it.title || '', dur: it.duration ? U.hms(Math.round(it.duration)) : '', type: it.media_type || ''} : null; },
        read: (f, v) => { const m = mediaOf(v); if (!m) return ''; const src = m.f ? `media/${encodeURIComponent(m.f)}` : ''; if (/\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(m.f) || m.type === 'audio') return ART.player(src, m.dur, m.title || m.f); if (/\.(jpe?g|png|webp|gif)$/i.test(m.f)) return `<img class="ar-mimg" src="${esc(src)}" alt="" data-ar-img>`; return `<span class="ar-ochip"><i>🎞</i>${esc(m.title || m.f)}</span>`; },
        text: (f, v) => mediaOf(v)?.title || mediaOf(v)?.f || '', empty: v => !mediaOf(v)};
    /** un petit lecteur ▶ (le son de la base) */
    ART.player = (src, dur = '', title = '') => src ? `<span class="ar-player" data-ar-player="${esc(src)}" title="${esc(title)}"><button type="button" class="ar-pl" data-ar-play aria-label="Écouter">▶</button><span class="ar-wave" aria-hidden="true"></span><span class="ar-dur">${esc(dur || '')}</span></span>` : '';
    let AUDIO = null;
    document.addEventListener('click', e => {
        const b = e.target.closest('[data-ar-play]'); if (!b) return; e.preventDefault();
        const box = b.closest('[data-ar-player]'), src = box.dataset.arPlayer;
        if (AUDIO && AUDIO._box === box && !AUDIO.paused) { AUDIO.pause(); b.textContent = '▶'; return; }
        if (AUDIO) { AUDIO.pause(); if (AUDIO._box) AUDIO._box.querySelector('[data-ar-play]').textContent = '▶'; }
        AUDIO = new Audio(src); AUDIO._box = box; b.textContent = '⏸'; AUDIO.play().catch(() => { b.textContent = '▶'; A().toast('Ce son ne se lit pas (fichier introuvable ?).', 'error'); });
        AUDIO.addEventListener('ended', () => { b.textContent = '▶'; });
        AUDIO.addEventListener('timeupdate', () => { const w = box.querySelector('.ar-wave'); if (w && AUDIO.duration) w.style.setProperty('--p', `${Math.round(AUDIO.currentTime / AUDIO.duration * 100)}%`); });
    });

    /* ── des photos avec leur étiquette (RECTO, VERSO, MATRICE, DOS, SIGNATURE…) : la fenêtre unique, avec import ── */
    const normPhotos = v => (Array.isArray(v) ? v : []).map(p => p && (p.f || p.u || p.m || p.mid) ? {mid: Number(p.mid || p.m) || 0, f: p.f || '', u: p.u || '', k: p.k || '', c: p.c || ''} : null).filter(Boolean);
    ART.normPhotos = normPhotos;
    const kindsOf = f => (f.labels || [['recto', 'Recto'], ['verso', 'Verso'], ['autre', 'Autre']]);
    T.photos = {label: 'Photos', badge: '🖼+', wide: true, block: true,
        edit: (f, v) => { const l = normPhotos(v); return `<div class="ar-phedit" data-ar-photos>${l.map((p, i) => `<figure data-i="${i}" data-ph="${esc(JSON.stringify(p))}"><img src="${esc(U.photoSrc(p))}" alt="" data-ar-img><select class="ar-in" data-pk-k>${kindsOf(f).map(([k, x]) => `<option value="${esc(k)}" ${p.k === k ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select><input class="ar-in" data-pk-c value="${esc(p.c)}" placeholder="légende">${p.u && !p.f ? `<button type="button" class="button small secondary" data-ph-fetch="${i}" title="L’image n’a pas été rapatriée : réessayer">↻ Réessayer de rapatrier</button>` : ''}<span class="ar-ract"><button type="button" class="icon-button small" data-ph-left title="Avant">←</button><button type="button" class="icon-button small" data-ph-right title="Après">→</button><button type="button" class="icon-button small" data-ph-del title="Retirer">✕</button></span></figure>`).join('')}
            <button type="button" class="ar-phadd" data-ph-add title="La fenêtre des images : choisir dans la base, ou glisser, coller, importer depuis l’ordinateur">＋ Ajouter des photos…<small>de la base, ou importées (glisser, coller ⌘V)</small></button></div>`; },
        get: el => [...el.querySelectorAll('[data-ar-photos] figure')].map(fg => { let p = {}; try { p = JSON.parse(fg.dataset.ph); } catch (_) {} return {...p, k: fg.querySelector('[data-pk-k]').value, c: fg.querySelector('[data-pk-c]').value.trim()}; }),
        read: (f, v) => { const l = normPhotos(v); if (!l.length) return ''; const lab2 = k => (kindsOf(f).find(x => x[0] === k) || [, k])[1];
            return `<div class="ar-photos"><button type="button" class="ar-bigcov" data-ar-zoom="0">${U.photoSrc(l[0]) ? `<img src="${esc(U.photoSrc(l[0]))}" alt="" data-ar-img>` : '<span class="ar-cov is-empty">🖼</span>'}</button>${l.length > 1 ? `<div class="ar-thumbs">${l.map((p, i) => `<button type="button" data-ar-zoom="${i}" title="${esc(p.c || lab2(p.k) || '')}"><img src="${esc(U.photoSrc(p))}" alt="" loading="lazy" data-ar-img>${p.k ? `<small>${esc(String(lab2(p.k)).toLocaleUpperCase('fr-FR'))}</small>` : ''}</button>`).join('')}</div>` : ''}</div>${f.note ? `<p class="ar-note">${esc(f.note)}</p>` : ''}`; },
        text: (f, v) => plural(normPhotos(v).length, 'photo'), empty: v => !normPhotos(v).length};
    const plural = (n, w) => U.plural(n, w);

    /* ── un tableau (pistes, étapes de provenance, expositions, éditions…) : colonnes typées, ⠿ ↑ ↓ ✕ ── */
    /* cellules d'autres sortes (employeur, revue, source…) : ART.cellTypes[type] = {edit, get, read, text} (ex. heritage-sciences.js) */
    ART.cellTypes = ART.cellTypes || {}; ART.cellHook = true;
    const cellEdit = (c, v) => { const t = c.type || 'text'; if (ART.cellTypes?.[t]) return ART.cellTypes[t].edit(c, v);
        if (t === 'select') return `<select class="ar-in" data-c="${esc(c.key)}">${ch(c).map(([k, l]) => `<option value="${esc(k)}" ${String(v ?? '') === String(k) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
        if (t === 'person' || t === 'place' || t === 'item') return `<span class="ar-pk" data-c="${esc(c.key)}" data-ct="${t}" ${t === 'item' ? `data-art-create="${esc((c.kinds || [])[0] || '')}"` : ''}>${pk({kind: t === 'item' ? 'artwork' : t, allowFree: c.free !== false, allowCreate: t !== 'item' || !!(c.kinds || []).length, value: pkVal(v, t === 'item' ? 'artwork' : t), filter: t === 'item' ? {art_kind: (c.kinds || []).join(',')} : undefined})}</span>`;
        if (t === 'longtext') return `<textarea class="ar-in" data-c="${esc(c.key)}" rows="2" placeholder="${esc(c.label)}">${esc(v ?? '')}</textarea>`;
        if (t === 'bool') return `<label class="checkbox-line"><input type="checkbox" data-c="${esc(c.key)}" ${v ? 'checked' : ''}> ${esc(c.label)}</label>`;
        return `<input class="ar-in" data-c="${esc(c.key)}" value="${esc(v ?? '')}" placeholder="${esc(c.ph || c.label)}" ${['number', 'money'].includes(t) ? 'inputmode="decimal"' : ''} ${t === 'date' ? 'data-ui-date="nocal"' : ''}>`; };
    const cellGet = (cell, c) => { const t = c.type || 'text'; if (ART.cellTypes?.[t]) return ART.cellTypes[t].get(cell, c); if (t === 'person' || t === 'place' || t === 'item') return fromItem(pkItems(cell)[0], t === 'item' ? 'artwork' : t); if (t === 'bool') return !!cell.checked; return (cell.value ?? '').trim(); };
    const cellRead = (c, v, ctx) => { const t = c.type || 'text'; if (v == null || v === '') return ''; if (ART.cellTypes?.[t]) return ART.cellTypes[t].read(c, v, ctx);
        if (t === 'person') return U.personChip(v, '', ctx); if (t === 'place') return U.placeChip(v); if (t === 'item') return U.refChip(v, (c.kinds || []).length === 1 ? ART.defs[c.kinds[0]]?.icon : '');
        if (t === 'select') return esc(lab(c, v)); if (t === 'money') return `<span class="ar-price">${esc(U.money(v))}</span>`; if (t === 'url') return T.url.read(c, v); if (t === 'bool') return v ? '✓' : ''; return esc(v); };
    const cellText = (c, v) => { const t = c.type || 'text'; if (ART.cellTypes?.[t]) return ART.cellTypes[t].text(c, v); if (t === 'person') return U.nameOf(v); if (t === 'place') return U.placeTitle(v); if (t === 'item') return U.refTitle(v); if (t === 'select') return lab(c, v); if (t === 'money') return U.money(v); if (t === 'bool') return v ? 'oui' : ''; return String(v ?? ''); };
    ART.cellRead = cellRead; ART.cellText = cellText;
    const rowHtml = (f, r, i) => `<div class="ar-row-e" data-i="${i}"><span class="ar-grip" title="Glisser pour ranger" draggable="true">⠿</span><div class="ar-cells">${(f.cols || []).map(c => `<span class="ar-cell ${c.w ? `w-${c.w}` : ''}" title="${esc(c.label)}">${cellEdit(c, r[c.key])}</span>`).join('')}</div>
        <span class="ar-ract">${f.more ? `<button type="button" class="icon-button small ${f.more.some(m => r[m.key]) ? 'is-on' : ''}" data-r-more title="${esc(f.moreLabel || 'Plus')}">📝</button>` : ''}<button type="button" class="icon-button small" data-r-up title="Monter">↑</button><button type="button" class="icon-button small" data-r-down title="Descendre">↓</button><button type="button" class="icon-button small" data-r-del title="Retirer">✕</button></span>
        ${f.more ? `<div class="ar-more" hidden>${f.more.map(c => `<label class="ar-mlab"><span>${esc(c.label)}</span>${c.type === 'people' ? `<div data-more-people="${esc(c.key)}">${T.people.edit({...c, addLabel: 'Une personne'}, r[c.key])}</div>` : cellEdit({...c, type: c.type || 'longtext'}, r[c.key])}</label>`).join('')}</div>` : ''}</div>`;
    T.rows = {label: 'Tableau', badge: 'tableau', wide: true, block: true,
        edit: (f, v) => `<div class="ar-rows" data-ar-rows="rows">${(Array.isArray(v) ? v : []).map((r, i) => rowHtml(f, r || {}, i)).join('')}</div><div class="ar-row"><button type="button" class="button small secondary" data-r-add="rows">＋ ${esc(f.addLabel || 'Une ligne')}</button>${f.paste ? `<button type="button" class="button small secondary" data-r-paste>📋 ${esc(f.paste)}</button>` : ''}</div>`,
        get: (el, f) => [...el.querySelectorAll(':scope .ar-rows > .ar-row-e')].map(row => { const o = {}; (f.cols || []).forEach(c => { const cell = row.querySelector(`:scope > .ar-cells [data-c="${CSS.escape(c.key)}"]`); if (cell) o[c.key] = cellGet(cell, c); });
            (f.more || []).forEach(c => { if (c.type === 'people') { const box = row.querySelector(`[data-more-people="${CSS.escape(c.key)}"]`); o[c.key] = box ? T.people.get(box) : []; } else { const cell = row.querySelector(`:scope > .ar-more [data-c="${CSS.escape(c.key)}"]`); if (cell) o[c.key] = cellGet(cell, c); } });
            let keep = {}; try { keep = JSON.parse(row.dataset.keep || '{}'); } catch (_) {}
            return {...keep, ...o}; }).filter(r => Object.entries(r).some(([k, x]) => k !== 'pos' && x !== '' && x != null && x !== false && !(Array.isArray(x) && !x.length))),
        read: (f, v, ctx) => { const l = Array.isArray(v) ? v : []; if (!l.length) return ''; const cols = (f.cols || []).filter(c => !c.hideRead && l.some(r => r[c.key] !== '' && r[c.key] != null));
            return `<div class="ar-scroll"><table class="ar-t"><thead><tr>${cols.map(c => `<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${l.map(r => `<tr>${cols.map(c => `<td>${cellRead(c, r[c.key], ctx)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; },
        text: (f, v) => (Array.isArray(v) ? v : []).map(r => (f.cols || []).map(c => cellText(c, r[c.key])).filter(Boolean).join(' ')).join(' | '), empty: v => !Array.isArray(v) || !v.length,
        meta: (f, v) => (Array.isArray(v) && v.length > 1 ? plural(v.length, f.unitWord || 'ligne') : '')};
    ART.rowHtml = rowHtml;

    /* ── dimensions (h × l × p, avec une note) : rangées à part dans le JSON (h, w, d) pour les anciennes fiches ── */
    T.dims = {label: 'Dimensions', badge: '↔', value: (d, f) => { if (f && f.key !== 'dims') { const v = d[f.key] || {}; return {h: v.h ?? '', w: v.w ?? '', d: v.d ?? '', note: v.note ?? '', framed: v.framed ?? ''}; } return {h: d.h ?? '', w: d.w ?? '', d: d.d ?? '', note: d.dims_note ?? '', framed: d.framed ?? ''}; },
        edit: (f, v) => `<div class="ar-dims"><input class="ar-in" data-d="h" value="${esc(v.h)}" inputmode="decimal" placeholder="haut."> × <input class="ar-in" data-d="w" value="${esc(v.w)}" inputmode="decimal" placeholder="larg."> × <input class="ar-in" data-d="d" value="${esc(v.d)}" inputmode="decimal" placeholder="prof."> <span>${esc(f.unit || 'cm')}</span><input class="ar-in" data-d="note" value="${esc(v.note)}" placeholder="précision (toile 10 F paysage…)"><input class="ar-in" data-d="framed" value="${esc(v.framed)}" placeholder="encadré (62 × 71 cm)"></div>`,
        collect: (el, f, draft) => { const g = k => el.querySelector(`[data-d="${k}"]`).value.trim(); if (f.key !== 'dims') { draft[f.key] = {h: g('h'), w: g('w'), d: g('d'), note: g('note'), framed: g('framed')}; return; } draft.h = g('h'); draft.w = g('w'); draft.d = g('d'); draft.dims_note = g('note'); draft.framed = g('framed'); },
        read: (f, v) => { const n = [v.h, v.w, v.d].filter(x => x !== '' && x != null).map(x => String(x).replace('.', ',')); return `${n.length ? `${esc(n.join(' × '))} ${esc(f.unit || 'cm')}` : ''}${v.note ? ` <small class="ar-g">(${esc(v.note)})</small>` : ''}${v.framed ? ` · encadré ${esc(v.framed)}` : ''}`; },
        text: (f, v) => { const n = [v.h, v.w, v.d].filter(x => x !== '' && x != null).map(x => String(x).replace('.', ',')); return n.length ? `${n.join(' × ')} ${f.unit || 'cm'}` : ''; },
        empty: v => ![v.h, v.w, v.d, v.note, v.framed].some(x => x !== '' && x != null)};
    T.computed = {label: 'Calculé', badge: 'auto', edit: () => '', read: () => ''};

    /* ── les autres sortes de champs du moteur (types créés par l'utilisateur, maquette L) ── */
    T.period = {label: 'Période', badge: '⟷', tile: '🕑 Période', value: (d, f) => { const v = d[f.key]; return v && typeof v === 'object' ? {from: v.from || '', to: v.to || ''} : {from: v || '', to: ''}; },
        edit: (f, v) => `<div class="ar-period">${inp(v.from, 'data-p="from" data-ui-date="nocal" placeholder="début"')} – ${inp(v.to, 'data-p="to" data-ui-date="nocal" placeholder="fin"')}</div>`,
        get: el => ({from: el.querySelector('[data-p="from"]').value.trim(), to: el.querySelector('[data-p="to"]').value.trim()}),
        read: (f, v) => esc([v.from, v.to].filter(Boolean).join(' – ')), text: (f, v) => [v.from, v.to].filter(Boolean).join(' – '), empty: v => !v || (!v.from && !v.to)};
    T.duration = {...T.text, label: 'Durée', badge: '⏱', tile: '⏱ Durée', edit: (f, v) => inp(v, 'placeholder="2:58, 3 h, 2 jours…" data-ui-duration-hint="s"')}; // K17 : « ✓ Compris : 2 min 58 s » dessous (le texte reste libre)
    T.measure = {label: 'Mesure + unité', badge: '⚖', tile: '⚖ Mesure + unité', value: (d, f) => { const v = d[f.key]; return v && typeof v === 'object' ? {n: v.n ?? '', unit: v.unit || f.unit || ''} : {n: v ?? '', unit: f.unit || ''}; },
        edit: (f, v) => `<div class="ar-measure">${inp(v.n, 'data-m="n" inputmode="decimal"')}${inp(v.unit, 'data-m="unit" placeholder="m, kg, km…" class="ar-in ar-unit"')}</div>`,
        get: el => ({n: el.querySelector('[data-m="n"]').value.trim(), unit: el.querySelector('[data-m="unit"]').value.trim()}),
        read: (f, v) => esc(`${String(v.n).replace('.', ',')} ${v.unit}`.trim()), text: (f, v) => `${String(v.n).replace('.', ',')} ${v.unit}`.trim(), empty: v => !v || v.n === '' || v.n == null};
    T.tags = {label: 'Étiquettes', badge: '🏷', tile: '🏷 Étiquettes', wide: true, edit: (f, v) => pk({kind: 'label', multiple: true, allowFree: false, value: (Array.isArray(v) ? v : []).map(x => ({id: x.lid, title: x.title}))}),
        get: el => pkItems(el).filter(x => x.id).map(x => ({lid: Number(x.id), title: x.title || ''})), read: (f, v) => (v || []).map(x => `<span class="ar-tag">${esc(x.title)}</span>`).join(' '), text: (f, v) => (v || []).map(x => x.title).join(', '), empty: v => !Array.isArray(v) || !v.length};
    T.code = {...T.ident, label: 'Code · n°', tile: '🔢 Code · n°'};
    T.document = {...T.media, label: 'Document', badge: '📄', tile: '📄 Document', edit: (f, v, ctx) => T.media.edit({...f, media: ['document', 'image']}, v, ctx)};
    T.color = {label: 'Couleur', badge: '🎨', tile: '🎨 Couleur (C2)', edit: (f, v) => `<input type="color" data-v value="${esc(/^#[0-9a-f]{6}$/i.test(v || '') ? v : '#7a2a2a')}">`, get: val,
        read: (f, v) => `<span class="ar-swatch" style="background:${esc(/^#[0-9a-f]{3,8}$/i.test(v) ? v : 'transparent')}"></span> ${esc(v)}`, text: (f, v) => String(v)};
    T.note = {...T.longtext, label: 'Note libre', badge: '📝', tile: '📝 Note'};
    T.media.tile = '🖼 Image · son · vidéo';

    /* Les types proposés dans « ＋ Ajouter un champ » (maquettes D et L), dans l'ordre */
    ART.CUSTOM_TYPES = ['text', 'longtext', 'number', 'date', 'period', 'duration', 'dims', 'measure', 'money', 'list', 'tags', 'bool', 'rating', 'url', 'code', 'person', 'place', 'item', 'media', 'document', 'color', 'note'];
    T.dims.tile = '📐 Dimensions'; T.item.tile = '📎 Fiche liée'; T.person.tile = '👤 Personne';

    /* ═════════ Le comportement du formulaire (lignes, photos, étoiles, création depuis le menu de choix) ═════════ */
    const fieldOf = (C, fk) => { const L = ART.layout(C.store, C.S.kind, 'fiche'); return L.groups.flatMap(g => g.fields).find(f => f.key === fk); };
    const renum = box => [...box.children].forEach((r, i) => { r.dataset.i = i; });
    document.addEventListener('click', async e => {
        const dlg = e.target.closest('.ar-dlg'); if (!dlg) return; const C = ART.open && window.LCNDA_EXT?.artistCatalog && (dlg._C || null);
        const b = e.target.closest('button'); if (!b || b.closest('.pk, .mf')) return;
        const d = b.dataset, fld = b.closest('[data-fk]');
        if (d.star !== undefined) { const st = b.closest('[data-stars]'); st.dataset.stars = d.star; st.querySelectorAll('[data-star]').forEach(x => x.classList.toggle('on', Number(x.dataset.star) <= Number(d.star) && Number(x.dataset.star) > 0)); st.dispatchEvent(new Event('change', {bubbles: true})); return; }
        const row = b.closest('.ar-row-e, .ar-prow');
        if (d.rUp !== undefined || d.rDown !== undefined) { const sib = d.rUp !== undefined ? row.previousElementSibling : row.nextElementSibling; if (!sib) return; if (d.rUp !== undefined) sib.before(row); else sib.after(row); renum(row.parentElement); b.focus(); row.parentElement.dispatchEvent(new Event('change', {bubbles: true})); return; }
        if (d.rDel !== undefined) { const box = row.parentElement; row.remove(); renum(box); box.dispatchEvent(new Event('change', {bubbles: true})); return; }
        if (d.rMore !== undefined) { const m = row.querySelector('.ar-more'); m.hidden = !m.hidden; return; }
        if (d.rAdd) {
            const C0 = dlg._C; const f = fieldOf(C0, fld?.dataset.fk) || {}; const add = d.rAdd === 'people' ? b.previousElementSibling : fld.querySelector('.ar-rows');
            if (d.rAdd === 'people') { const tmp = document.createElement('div'); const sub = b.closest('[data-more-people]'); tmp.innerHTML = pplRow(sub ? {} : f, {role: ''}, add.children.length); add.appendChild(tmp.firstElementChild); add.lastElementChild.querySelector('[data-c="role"]')?.focus(); }
            else { const tmp = document.createElement('div'); const blank = f.blank ? f.blank(add.children.length) : {}; tmp.innerHTML = rowHtml(f, blank, add.children.length); add.appendChild(tmp.firstElementChild); const first = f.focus ? add.lastElementChild.querySelector(`[data-c="${f.focus}"]`) : add.lastElementChild.querySelector('input:not([type=hidden]), select'); first?.focus(); }
            add.dispatchEvent(new Event('change', {bubbles: true})); return;
        }
        if (d.rPaste !== undefined) { const C0 = dlg._C, f = fieldOf(C0, fld.dataset.fk); f?.onPaste?.(C0, fld, f); return; }
        // photos
        const fig = b.closest('[data-ar-photos] figure');
        if (d.phDel !== undefined) { const box = fig.parentElement; fig.remove(); renum(box); box.dispatchEvent(new Event('change', {bubbles: true})); return; }
        if (d.phLeft !== undefined) { if (fig.previousElementSibling?.matches('figure')) fig.previousElementSibling.before(fig); return; }
        if (d.phRight !== undefined) { if (fig.nextElementSibling?.matches('figure')) fig.nextElementSibling.after(fig); return; }
        if (d.phFetch !== undefined) { const C0 = dlg._C; let p = {}; try { p = JSON.parse(fig.dataset.ph); } catch (_) {} b.disabled = true; b.textContent = 'Rapatriement…';
            try { const r = (await A().api('artist_fetch_image', {}, {method: 'POST', body: {person_id: C0.pid, url: p.u, title: C0.S.draft?.title || ''}})).result; p = {...p, mid: r.id, f: r.filename}; fig.dataset.ph = JSON.stringify(p); fig.querySelector('img').src = U.photoSrc(p); b.remove(); fig.parentElement.dispatchEvent(new Event('change', {bubbles: true})); }
            catch (er) { b.disabled = false; b.textContent = '↻ Réessayer de rapatrier'; A().toast(er.message, 'error'); } return; }
        if (d.phAdd !== undefined) {
            const C0 = dlg._C, f = fieldOf(C0, fld.dataset.fk) || {}, box = b.closest('[data-ar-photos]');
            const list = await P().openMediaPicker({multiple: true, types: ['image'], person: C0.pid, eyebrow: 'CATALOGUE', title: f.pickTitle || 'Photos de la fiche', okLabel: 'Ajouter ces photos', allowImport: true});
            if (!list?.length) return;
            const kinds = kindsOf(f), n0 = box.querySelectorAll('figure').length;
            list.forEach((m, j) => { const p = {mid: Number(m.id), f: m.filename, k: (kinds[n0 + j] || kinds[kinds.length - 1])[0], c: ''}; const tmp = document.createElement('div');
                tmp.innerHTML = `<figure data-i="${n0 + j}" data-ph="${esc(JSON.stringify(p))}"><img src="${esc(U.photoSrc(p))}" alt="" data-ar-img><select class="ar-in" data-pk-k>${kinds.map(([k, x]) => `<option value="${esc(k)}" ${p.k === k ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select><input class="ar-in" data-pk-c value="" placeholder="légende"><span class="ar-ract"><button type="button" class="icon-button small" data-ph-left title="Avant">←</button><button type="button" class="icon-button small" data-ph-right title="Après">→</button><button type="button" class="icon-button small" data-ph-del title="Retirer">✕</button></span></figure>`;
                b.before(tmp.firstElementChild); });
            box.dispatchEvent(new Event('change', {bubbles: true}));
        }
    });
    // ⠿ glisser une ligne pour la ranger (pistes, crédits, étapes…)
    let dragRow = null;
    document.addEventListener('dragstart', e => { const g = e.target.closest?.('.ar-dlg .ar-grip'); if (!g) return; dragRow = g.closest('.ar-row-e, .ar-prow'); dragRow.classList.add('is-drag'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', 'ar-row'); } catch (_) {} });
    document.addEventListener('dragover', e => { if (!dragRow) return; const over = e.target.closest?.('.ar-row-e, .ar-prow'); if (!over || over === dragRow || over.parentElement !== dragRow.parentElement) return; e.preventDefault(); const r = over.getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) over.before(dragRow); else over.after(dragRow); });
    document.addEventListener('dragend', () => { if (!dragRow) return; dragRow.classList.remove('is-drag'); renum(dragRow.parentElement); dragRow.parentElement.dispatchEvent(new Event('change', {bubbles: true})); dragRow = null; });
    // « ＋ Créer la fiche « … » » dans un champ qui choisit une autre fiche : elle est créée tout de suite (titre seul), puis choisie
    document.addEventListener('picker-create', async e => {
        const host = e.target.closest?.('[data-art-create]'), dlg = e.target.closest?.('.ar-dlg'); if (!host || !dlg || e.detail.kind !== 'artwork') return;
        const kind = host.dataset.artCreate; if (!kind || !ART.defs[kind]) return; e.preventDefault();
        const C0 = dlg._C, def = ART.defs[kind];
        try { const data = {title: e.detail.text, ...(def.newData ? def.newData(C0.store) : {})}; const id = await ART.saveItem(C0.store, kind, 0, data); await C0.store.load(); e.detail.pick({id, title: e.detail.text, kind: 'artwork', art_kind: kind}); A().toast(`${def.fem ? 'Nouvelle' : 'Nouveau'} ${def.label.toLowerCase()} « ${e.detail.text} » ajouté${def.fem ? 'e' : ''} au catalogue.`); }
        catch (er) { if (er.message) A().toast(er.message, 'error'); }
    });
    // « ↗ Ouvrir » d'une fiche du catalogue, « ↗ Fiche » d'une personne : sans fermer brutalement le catalogue
    document.addEventListener('picker-open', async e => {
        const dlg = e.target.closest?.('.ar-dlg'); if (!dlg?._C) return; const C0 = dlg._C;
        if (e.detail.kind === 'artwork') { e.preventDefault(); C0.open(e.detail.id); return; }
        if (e.detail.kind === 'person' || e.detail.kind === 'animal') { e.preventDefault(); if (await C0.close()) A().openPersonById?.(e.detail.id); }
    });
    /* ═════════ « 🔗 Lié à » : toutes les fiches liées (dans les deux sens) et les personnes citées, sur chaque fiche ═════════ */
    ART.views.linked = {
        read: (ctx, it) => {
            const st = ctx.store, id = it.id; if (!id) return '';
            const def = ART.defs[it.kind] || {}, seen = new Set([id]), byKind = new Map();
            [...st.linksFrom(id), ...st.linksTo(id)].forEach(l => { const o = st.otherOf(l, id); if (!o || seen.has(o.id)) return; seen.add(o.id);
                const k = o.kind; if (!byKind.has(k)) byKind.set(k, []); byKind.get(k).push({o, l}); });
            const skip = new Set([...(def.linkedSkip || []), 'profile']);
            const extra = def.linkedExtra ? def.linkedExtra(ctx, it) : '';
            const chips = [...byKind.entries()].filter(([k]) => !skip.has(k)).map(([k, list]) => { const d = ART.defs[k] || {icon: '✦', label: 'fiche', many: 'fiches'};
                if (list.length > 3) return `<div><span class="ar-ochip is-link" title="${esc(list.map(x => x.o.title).join(', '))}"><i>${esc(d.icon)}</i>${esc(U.plural(list.length, d.label.toLowerCase(), d.many.toLowerCase()))}</span></div>`;
                return list.map(({o, l}) => { const bits = [l.data?.page && `p. ${l.data.page}`, l.data?.pos && `piste ${l.data.pos}`, l.data?.catno && (/^n°/i.test(l.data.catno) ? l.data.catno : `n° ${l.data.catno}`), l.data?.rel].filter(Boolean).join(', ');
                    return `<div><button type="button" class="ar-ochip" data-ar-open="${o.id}"><i>${esc(d.icon)}</i>${esc(o.title)}${o.year ? ` (${esc(o.year)})` : ''}${bits ? `, ${esc(bits)}` : ''}</button></div>`; }).join(''); }).join('');
            const roleWord = field => { const f = ART.fieldsOf(def, ctx.store.customFields(it.kind)).find(x => x.key === field); return f?.roleWord || (f ? f.label.toLowerCase() : ''); };
            // une pastille par personne de la généalogie (ses rôles ensemble) ; les noms sans fiche restent dans la fiche
            const byP = new Map();
            st.people.filter(p => p.item_id === id && p.person_id).forEach(p => { const r = p.role || roleWord(p.field); if (!byP.has(p.person_id)) byP.set(p.person_id, {name: p.name, roles: []}); const x = byP.get(p.person_id); if (r && !x.roles.includes(r.toLowerCase())) x.roles.push(r.toLowerCase()); });
            const ppl = [...byP.entries()].map(([pid, x]) => U.personChip({pid, title: x.name}, x.roles.join(', '), ctx));
            if (!chips && !ppl.length && !extra) return '';
            return `<div class="ar-linked">${extra}${chips}${ppl.length ? `<div class="ar-linked-ppl">${ppl.join('')}</div>` : ''}</div><p class="ar-note">Les liens se voient des deux côtés : chaque fiche liée, et la fiche de chaque personne, montrent celle-ci.</p>`;
        },
        text: (ctx, it) => [...ctx.store.linksFrom(it.id), ...ctx.store.linksTo(it.id)].length ? U.plural([...ctx.store.linksFrom(it.id), ...ctx.store.linksTo(it.id)].length, 'lien') : '',
    };
})();
