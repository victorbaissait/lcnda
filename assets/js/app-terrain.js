/* LCNDA — 📱 Le téléphone par le wifi : la page du téléphone de terrain (maquette docs/design/telephone-wifi.html, parties 3 et 4).
 * Servie par la porte du wifi (electron/lan-gate.js) à un téléphone accepté avec la sorte « 📱 Téléphone de terrain ». Elle ne
 * lit RIEN de la généalogie : son état, la liste réduite « Pour qui ? » et les dépôts passent par /terrain.php (lib/telephone_wifi.php).
 *  - 📷 Prendre (appareil photo, champ « fichier » du navigateur : ça marche sans HTTPS) ou 🖼 Choisir dans la galerie, une ligne de
 *    texte (200 caractères, posée comme du texte, jamais comme du HTML), « Pour qui ? » (facultatif, réglage), ⤒ Envoyer ;
 *  - chaque photo part seule (barre d'avancement, refus expliqué photo par photo) ; « ↶ Annuler » retire cet envoi de la boîte
 *    tant qu'il n'est pas rangé (réglage) ;
 *  - sans le wifi de la maison : les photos attendent DANS CETTE PAGE (IndexedDB si le navigateur le permet, sinon en mémoire)
 *    et partent toutes seules au retour, nouvel essai toutes les 30 s tant que la page reste ouverte. Pas de « service worker » :
 *    les navigateurs ne le permettent qu'en HTTPS, et la porte n'en a pas. La page ne s'ouvre donc pas sans le wifi ;
 *  - 🔐 le mot de passe de la généalogie est demandé à l'ouverture et redemandé après 15 min sans geste (vérifié par
 *    l'ordinateur, jamais gardé ici) ; les photos attendent pendant ce temps. */
(() => {
    'use strict';
    const I = window.LCNDA_I18N;
    const t = (s, v) => (I ? I.t(s, v) : String(s).replace(/\{(\w+)\}/g, (_, k) => (v && k in v ? v[k] : `{${k}}`)));
    const pl = (n, one) => (I && I.plural ? I.plural(n, one) : `${n} ${one}${n > 1 ? 's' : ''}`);
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const root = document.getElementById('tw');
    const RETRY_MS = 30000;
    const S = {state: null, csrf: '', genealogy: '', photos: [], note: '', forItem: null, sending: false, online: true, history: [], lastBatch: null, timer: null, idb: null, sawGone: false};
    const set = () => (S.state && S.state.settings) || {};
    const lang = () => (document.documentElement.lang || 'fr');
    const hex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');

    /* ═════ l'ordinateur ═════ */
    async function call(action, {method = 'GET', body = null, q = ''} = {}) {
        const h = {'X-LCNDA-Lang': lang()};
        if (S.genealogy) h['X-Genealogy'] = S.genealogy;
        if (method === 'POST') { h['X-CSRF-Token'] = S.csrf; if (!(body instanceof FormData)) { h['Content-Type'] = 'application/json'; body = JSON.stringify({...(body || {}), csrf: S.csrf}); } }
        const r = await fetch(`/terrain.php?action=${encodeURIComponent(action)}${q ? `&q=${encodeURIComponent(q)}` : ''}`, {method, headers: h, body, credentials: 'same-origin', cache: 'no-store'});
        const j = await r.json().catch(() => ({}));
        return {status: r.status, ok: r.ok, j};
    }
    /** un dépôt : XMLHttpRequest pour l'avancement (fetch ne le donne pas) */
    function upload(item, onProgress) {
        return new Promise(resolve => {
            const fd = new FormData();
            fd.append('csrf', S.csrf); fd.append('batch', item.batch); fd.append('note', item.note || ''); fd.append('for', item.for || '');
            fd.append('photo', item.blob, 'photo');
            const x = new XMLHttpRequest();
            x.open('POST', '/terrain.php?action=deposit');
            x.setRequestHeader('X-CSRF-Token', S.csrf); x.setRequestHeader('X-LCNDA-Lang', lang());
            if (S.genealogy) x.setRequestHeader('X-Genealogy', S.genealogy);
            x.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
            x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch (_) {} resolve({status: x.status, j}); };
            x.onerror = () => resolve({status: 0, j: {}});
            x.ontimeout = () => resolve({status: 0, j: {}});
            x.timeout = 10 * 60 * 1000;
            x.send(fd);
        });
    }

    /* ═════ l'attente hors wifi : IndexedDB si possible (sans HTTPS, c'est permis), sinon la mémoire de la page ═════ */
    const mem = new Map();
    function idb() {
        if (S.idb !== null) return S.idb;
        S.idb = new Promise(resolve => {
            try {
                const o = indexedDB.open('lcnda-terrain', 1);
                o.onupgradeneeded = () => { o.result.createObjectStore('queue', {keyPath: 'id'}); };
                o.onsuccess = () => resolve(o.result); o.onerror = () => resolve(null); o.onblocked = () => resolve(null);
            } catch (_) { resolve(null); }
        });
        return S.idb;
    }
    async function qAll() {
        const db = await idb(); if (!db) return [...mem.values()];
        return new Promise(resolve => { try { const r = db.transaction('queue').objectStore('queue').getAll(); r.onsuccess = () => resolve(r.result || []); r.onerror = () => resolve([...mem.values()]); } catch (_) { resolve([...mem.values()]); } });
    }
    async function qPut(item) {
        mem.set(item.id, item);
        const db = await idb(); if (!db) return;
        await new Promise(resolve => { try { const tx = db.transaction('queue', 'readwrite'); tx.objectStore('queue').put(item); tx.oncomplete = resolve; tx.onerror = resolve; tx.onabort = resolve; } catch (_) { resolve(); } });
        try { localStorage.setItem('lcnda-terrain-n', String((await qAll()).length)); } catch (_) {}
    }
    async function qDel(id) {
        mem.delete(id);
        const db = await idb();
        if (db) await new Promise(resolve => { try { const tx = db.transaction('queue', 'readwrite'); tx.objectStore('queue').delete(id); tx.oncomplete = resolve; tx.onerror = resolve; } catch (_) { resolve(); } });
        try { localStorage.setItem('lcnda-terrain-n', String((await qAll()).length)); } catch (_) {}
    }

    /* ═════ petits morceaux ═════ */
    const head = () => `<header class="tw-head"><b data-i18n-off>📱 ${esc(S.state ? S.state.name : 'LCNDA')}</b><span class="tw-net ${S.online ? 'is-on' : 'is-off'}">${S.online ? esc(t('📶 relié')) : esc(t('⏸ hors wifi'))}</span></header>`;
    const msg = (kind, text) => `<p class="tw-msg is-${kind}" role="status">${esc(text)}</p>`;
    /** 📍 la photo contient-elle une position GPS ? (lu dans le navigateur, pour le dire ; c'est l'ordinateur qui la retire) */
    async function hasGps(blob) {
        try {
            const b = new Uint8Array(await blob.slice(0, 131072).arrayBuffer());
            if (b[0] !== 0xFF || b[1] !== 0xD8) return false;
            for (let i = 2; i + 4 < b.length;) {
                if (b[i] !== 0xFF) return false;
                const m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
                if (m === 0xE1 && String.fromCharCode(...b.slice(i + 4, i + 8)) === 'Exif') {
                    const s = i + 10, le = b[s] === 0x49;
                    const u16 = o => (le ? b[s + o] | (b[s + o + 1] << 8) : (b[s + o] << 8) | b[s + o + 1]);
                    const u32 = o => (le ? (b[s + o] | (b[s + o + 1] << 8) | (b[s + o + 2] << 16)) + b[s + o + 3] * 16777216 : b[s + o] * 16777216 + ((b[s + o + 1] << 16) | (b[s + o + 2] << 8) | b[s + o + 3]));
                    const ifd = u32(4), n = u16(ifd);
                    for (let k = 0; k < n && k < 200; k++) if (u16(ifd + 2 + k * 12) === 0x8825) return true;
                    return false;
                }
                if (m === 0xDA) return false;
                i += 2 + len;
            }
        } catch (_) {}
        return false;
    }

    /* ═════ les écrans ═════ */
    function screenPassword(text = '') {
        root.innerHTML = `${head()}<section class="tw-card"><h1>🔐 <span data-i18n-off>${esc(S.state.name)}</span></h1>
            <p class="tw-lead">${esc(t('Le mot de passe de la généalogie : vérifié par l’ordinateur, jamais gardé sur ce téléphone.'))}</p>
            <form class="tw-form" autocomplete="off" novalidate><label>${esc(t('Mot de passe'))}<input name="pw" type="password" autocomplete="current-password" required></label>
            <button type="submit" class="tw-big">${esc(t('Ouvrir'))}</button><p data-msg></p></form>
            <p class="tw-hint">${esc(t('Le navigateur écrit « Non sécurisé » : c’est vrai, la porte du wifi n’a pas de HTTPS. N’envoie que sur le wifi de la maison, protégé par sa clé.'))}</p>
            ${S.photos.length ? `<p class="tw-hint">${esc(t('Tes photos attendent dans cette page.'))}</p>` : ''}</section>`;
        if (text) root.querySelector('[data-msg]').outerHTML = msg('error', text);
        const f = root.querySelector('form');
        f.elements.pw.focus();
        f.addEventListener('submit', async e => {
            e.preventDefault();
            const b = f.querySelector('button'); b.disabled = true;
            let r; try { r = await call('unlock', {method: 'POST', body: {password: f.elements.pw.value}}); } catch (_) { r = {status: 0, j: {}}; }
            b.disabled = false;
            if (r.ok) { if (r.j.csrf) S.csrf = r.j.csrf; S.state.needs_pw = false; S.state.unlocked = true; screenReady(); flush(); return; }
            screenPassword(r.status === 0 ? t('L’ordinateur ne répond pas (en veille, éteint ou porte fermée).') : (r.j.error || t('Refusé.')));
        });
    }

    function screenReady(note = '') {
        const st = set();
        const offRefuse = !S.online && st.horswifi === 'refuser';
        const n = S.photos.length;
        const forBtn = st.pourqui === 'cache' || st.liste === 'rien' ? '' : `<div class="tw-field"><span>${esc(t('Pour qui ?'))} <small>${st.pourqui === 'obligatoire' ? '' : esc(t('(facultatif)'))}</small></span>
            <button type="button" class="tw-pick" data-for>${S.forItem ? `<span data-i18n-off>${esc(S.forItem.kind === 'visit' ? '🗄 ' : '👤 ')}${esc(S.forItem.name)}</span>` : esc(t('Choisir une personne ou une visite…'))}</button></div>`;
        const thumbs = S.photos.map((p, i) => `<figure class="tw-th"><img src="${p.url}" alt=""><button type="button" class="tw-x" data-rm="${i}" aria-label="${esc(t('Retirer'))}">×</button>${p.gps ? '<span class="tw-gps" aria-hidden="true">📍</span>' : ''}
            ${st.texte === 'photo' ? `<input class="tw-pnote" data-pnote="${i}" maxlength="200" value="${esc(p.note || '')}" placeholder="${esc(t('Une ligne (facultatif)'))}">` : ''}</figure>`).join('');
        const gps = S.photos.some(p => p.gps);
        root.innerHTML = `${head()}${note}<section class="tw-card">
            ${offRefuse ? msg('warn', t('Pas de wifi de la maison : les photos se prennent avec l’appareil photo du téléphone, puis « 🖼 Choisir » au retour.')) : `<label class="tw-big tw-file">📷 ${esc(t('Prendre une photo'))}<input type="file" accept="image/*" capture="environment" data-take hidden></label>
            <label class="tw-big tw-file is-2">🖼 ${esc(t('Choisir dans la galerie'))}<input type="file" accept="image/*" multiple data-pick hidden></label>`}
            ${n ? `<div class="tw-thumbs">${thumbs}</div><p class="tw-hint">${esc(pl(n, 'photo'))}${gps ? ' · ' + esc(t('📍 = la photo contient une position GPS (retirée à l’arrivée, réglage)')) : ''}</p>` : ''}
            ${st.texte === 'photo' ? '' : `<label class="tw-field"><span>${esc(t('Une ligne (facultatif)'))}</span><input data-note maxlength="200" value="${esc(S.note)}" placeholder="${esc(t('Tombe famille LACOMBE, allée 4'))}"></label>`}
            ${forBtn}
            <button type="button" class="tw-big tw-send" data-send${n && !S.sending ? '' : ' disabled'}>⤒ ${esc(n ? t('Envoyer : {n}', {n: pl(n, 'photo')}) : t('Envoyer'))}</button>
            <div data-progress></div></section>${historyHtml()}
            <p class="tw-hint">${esc(t('Sans wifi, garde cette page ouverte : les photos attendent ici et partent toutes seules au retour. Pour une journée entière aux archives, prends plutôt la visite par fichier.'))}</p>`;
        bindReady();
    }
    function historyHtml() {
        if (!S.history.length) return '';
        return `<section class="tw-card tw-hist"><h2>${esc(t('Aujourd’hui'))}</h2>${S.history.slice().reverse().map(h => `<div class="tw-hrow"><span>✓</span><span><b>${esc(pl(h.n, 'photo'))}</b>${h.label ? ` · <span data-i18n-off>${esc(h.label)}</span>` : ''}<br><small>${esc(h.time)}</small></span>${h.thumbs ? `<span class="tw-hth">${h.thumbs.map(u => `<img src="${u}" alt="">`).join('')}</span>` : ''}</div>`).join('')}
            <p class="tw-hint">${esc(t('Le téléphone ne sait pas si une photo a été rangée ni où : il ne lit rien de l’arbre.'))}</p></section>`;
    }
    function bindReady() {
        const add = async files => {
            for (const f of [...files].slice(0, 200)) {
                const gps = await hasGps(f);
                S.photos.push({blob: f, url: URL.createObjectURL(f), name: String(f.name || ''), gps, note: ''});
            }
            screenReady();
        };
        root.querySelector('[data-take]')?.addEventListener('change', e => add(e.target.files));
        root.querySelector('[data-pick]')?.addEventListener('change', e => add(e.target.files));
        root.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { const p = S.photos.splice(Number(b.dataset.rm), 1)[0]; if (p) URL.revokeObjectURL(p.url); screenReady(); }));
        root.querySelectorAll('[data-pnote]').forEach(x => x.addEventListener('input', () => { S.photos[Number(x.dataset.pnote)].note = x.value; }));
        root.querySelector('[data-note]')?.addEventListener('input', e => { S.note = e.target.value; });
        root.querySelector('[data-for]')?.addEventListener('click', screenPick);
        root.querySelector('[data-send]')?.addEventListener('click', send);
        root.querySelector('[data-undo]')?.addEventListener('click', undo);
        root.querySelector('[data-flush]')?.addEventListener('click', () => flush(true));
        root.querySelector('[data-forget]')?.addEventListener('click', forget);
    }

    /** « Pour qui ? » : un seul choix, cherché sur l'ordinateur (liste réduite, bornée) */
    function screenPick() {
        let pickT = null, chosen = S.forItem;
        root.innerHTML = `<section class="tw-card tw-pickscreen"><button type="button" class="tw-back" data-back>← ${esc(t('Pour qui ?'))}</button>
            <input type="search" class="tw-q" data-q placeholder="🔍 ${esc(t('Nom de la personne ou de la visite'))}" autocomplete="off" enterkeyhint="search">
            <div data-res></div><p class="tw-hint">${esc(t('Seulement les personnes décédées, sans les fiches confidentielles.'))}</p>
            <div class="tw-row"><button type="button" class="tw-big is-2" data-none>${esc(t('Je ne sais pas'))}</button><button type="button" class="tw-big" data-ok>✓ ${esc(t('Choisir'))}</button></div></section>`;
        const box = root.querySelector('[data-res]');
        const paint = d => {
            const all = [...(d.visits || []).map(v => ({...v, kind: 'visit'})), ...(d.people || []).map(p => ({...p, kind: 'person'}))];
            box.innerHTML = (d.visits || []).length || (d.people || []).length ? [
                d.visits?.length ? `<h3>${esc(t('Visites d’archives'))}</h3>` : '', ...(d.visits || []).map(v => row(v, 'visit')),
                d.people?.length ? `<h3>${esc(t('Personnes'))}</h3>` : '', ...(d.people || []).map(p => row(p, 'person'))].join('') : `<p class="tw-hint">${esc(t('Rien trouvé.'))}</p>`;
            box.querySelectorAll('[data-it]').forEach(b => b.addEventListener('click', () => { chosen = all[Number(b.dataset.it)]; box.querySelectorAll('[data-it]').forEach(x => x.classList.toggle('is-on', x === b)); }));
            function row(x, kind) { const i = all.findIndex(a => a.kind === kind && a.id === x.id); return `<button type="button" class="tw-it${chosen && chosen.kind === kind && chosen.id === x.id ? ' is-on' : ''}" data-it="${i}"><span>${kind === 'visit' ? '🗄' : '👤'}</span><span data-i18n-off><b>${esc(x.name)}</b>${x.years ? `<small>${esc(x.years)}</small>` : ''}</span></button>`; }
        };
        const load = async q => { const r = await call('list', {q}).catch(() => ({status: 0, j: {}})); if (r.status === 423) { screenPassword(); return; } if (r.ok) paint(r.j); else box.innerHTML = msg('error', r.status === 0 ? t('L’ordinateur ne répond pas (en veille, éteint ou porte fermée).') : (r.j.error || t('Refusé.'))); };
        const q = root.querySelector('[data-q]');
        q.addEventListener('input', () => { clearTimeout(pickT); pickT = setTimeout(() => load(q.value.trim()), 350); });
        root.querySelector('[data-back]').addEventListener('click', () => screenReady());
        root.querySelector('[data-none]').addEventListener('click', () => { S.forItem = null; screenReady(); });
        root.querySelector('[data-ok]').addEventListener('click', () => { S.forItem = chosen ? {kind: chosen.kind, id: chosen.id, name: chosen.name} : null; screenReady(); });
        q.focus();
        load('');
    }

    /* ═════ envoyer ═════ */
    async function send() {
        const st = set();
        if (!S.photos.length || S.sending) return;
        if (st.pourqui === 'obligatoire' && !S.forItem && st.liste !== 'rien') { screenReady(msg('warn', t('Choisis pour qui est cette photo.'))); return; }
        const batch = hex(12), at = Date.now();
        const forV = S.forItem ? `${S.forItem.kind}:${S.forItem.id}` : '';
        const label = S.forItem ? S.forItem.name : '';
        // chaque photo passe d'abord par la file d'attente : elle survit à une coupure du wifi tant que la page reste ouverte
        for (const p of S.photos) await qPut({id: hex(8), batch, at, blob: p.blob, note: st.texte === 'photo' ? p.note : S.note, for: forV, label, name: p.name});
        S.photos.forEach(p => URL.revokeObjectURL(p.url));
        S.photos = []; S.note = ''; S.forItem = null;
        flush(true);
    }
    async function flush(force = false) {
        if (S.sending) return;
        const items = (await qAll()).sort((a, b) => a.at - b.at);
        if (!items.length) { screenReady(); return; }
        if (!force && set().horswifi === 'demander') { screenWaiting(items); return; }
        S.sending = true;
        const done = new Map(), refused = [];
        let stop = '';
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            progress(i, items.length, 0, it);
            const r = await upload(it, f => progress(i, items.length, f, it));
            if (r.status === 200) {
                await qDel(it.id);
                const d = done.get(it.batch) || {n: 0, label: it.label, at: it.at, thumbs: []}; d.n++;
                if (set().apres === 'vignettes' && d.thumbs.length < 6) d.thumbs.push(URL.createObjectURL(it.blob));
                done.set(it.batch, d);
                continue;
            }
            if (r.status === 0 || r.status === 502 || r.status === 503) { stop = 'off'; break; }
            if (r.status === 423 && r.j.glock) { stop = 'pw'; break; }
            if (r.status === 409 || (r.status === 423 && r.j.kiosk) || r.status === 429) { stop = r.j.error || t('Refusé.'); break; }
            if (r.status === 401 || (r.status === 403 && r.j.lan_terrain)) { stop = 'gone'; break; }
            await qDel(it.id); // refusée par l'ordinateur (pas une photo, trop grosse…) : elle ne repartira pas
            refused.push(`${it.name || t('Photo')} : ${r.j.error || t('Refusé.')}`);
        }
        S.sending = false;
        for (const [batch, d] of done) { S.history.push({batch, n: d.n, label: d.label, time: new Date().toLocaleTimeString(lang(), {hour: '2-digit', minute: '2-digit'}), thumbs: d.thumbs.length ? d.thumbs : null}); S.lastBatch = {batch, n: d.n, at: Date.now()}; }
        S.online = stop !== 'off';
        clearTimeout(S.timer);
        if (stop === 'off') { S.timer = setTimeout(() => flush(), RETRY_MS); }
        if (stop === 'pw') { S.state.needs_pw = true; screenPassword(t('Verrouillée après 15 minutes sans geste : redonne le mot de passe. Tes photos attendent.')); return; }
        if (stop === 'gone') { root.innerHTML = `${head()}<section class="tw-card">${msg('error', t('Ce téléphone n’est plus autorisé sur l’ordinateur.'))}<a class="tw-big" href="/terrain">${esc(t('Demander l’accès'))}</a></section>`; return; }
        const left = (await qAll()).length;
        const notes = [];
        if (done.size) {
            const n = [...done.values()].reduce((a, d) => a + d.n, 0);
            const canUndo = set().annuler_tel !== 'jamais';
            notes.push(`<p class="tw-msg is-ok" role="status">✓ ${esc(t('Envoyées dans 📥 À trier : {n}', {n: pl(n, 'photo')}))}${canUndo ? ` <button type="button" class="tw-link" data-undo>${esc(t('↶ Annuler'))}</button>` : ''}</p>`);
            if (set().annuler_tel === '10s') setTimeout(() => root.querySelector('[data-undo]')?.remove(), 10000);
        }
        if (refused.length) notes.push(`<div class="tw-msg is-error" role="alert"><b>${esc(t('Refusé par l’ordinateur'))}</b>${refused.map(x => `<br>✕ <span data-i18n-off>${esc(x)}</span>`).join('')}</div>`);
        if (stop === 'off' && left) notes.push(`<div class="tw-msg is-warn" role="status">⏸ ${esc(t('L’ordinateur ne répond pas (en veille, éteint ou porte fermée). En attente : {n} ; nouvel essai toutes les 30 secondes tant que la page est ouverte.', {n: pl(left, 'photo')}))} <button type="button" class="tw-link" data-flush>${esc(t('↻ Réessayer'))}</button></div>`);
        else if (stop && left) notes.push(msg('warn', stop));
        screenReady(notes.join(''));
    }
    function progress(i, n, f, it) {
        const box = root.querySelector('[data-progress]'); if (!box) return;
        const pct = Math.round(((i + f) / n) * 100);
        box.innerHTML = `<div class="tw-prog"><b>⤒ ${esc(t('Envoi en cours : {i} sur {n}', {i: i + 1, n}))}</b> <small>${esc(t('Garde la page ouverte.'))}</small><div class="tw-bar"><i style="width:${pct}%"></i></div>${it.label ? `<small data-i18n-off>${esc(it.label)}</small>` : ''}</div>`;
    }
    function screenWaiting(items) {
        const first = Math.min(...items.map(x => x.at));
        const when = new Date(first).toLocaleString(lang(), {weekday: 'short', hour: '2-digit', minute: '2-digit'});
        screenReady(`<div class="tw-msg is-warn" role="status"><b>${esc(t('En attente depuis {when} : {n}', {when, n: pl(items.length, 'photo')}))}</b><br>${esc(t('Elles étaient gardées dans ce téléphone.'))}
            <div class="tw-row"><button type="button" class="tw-big" data-flush>⤒ ${esc(t('Les envoyer'))}</button><button type="button" class="tw-big is-2" data-forget>🗑 ${esc(t('Les oublier'))}</button></div></div>`);
    }
    async function forget() { for (const it of await qAll()) await qDel(it.id); screenReady(); }
    async function undo() {
        const b = S.lastBatch; if (!b) return;
        const r = await call('undo', {method: 'POST', body: {batch: b.batch}}).catch(() => ({status: 0, j: {}}));
        if (r.ok) { S.history = S.history.filter(h => h.batch !== b.batch); S.lastBatch = null; screenReady(msg('ok', t('Retirées de la boîte : {n}', {n: pl(r.j.removed || 0, 'photo')}))); }
        else screenReady(msg('error', r.j.error || t('Refusé.')));
    }

    /* ═════ départ ═════ */
    async function start() {
        let r;
        try { r = await call('state'); } catch (_) { r = {status: 0, j: {}}; }
        if (r.status === 0) { S.online = false; root.innerHTML = `${head()}<section class="tw-card">${msg('warn', t('L’ordinateur ne répond pas (en veille, éteint ou porte fermée).'))}</section>`; setTimeout(start, RETRY_MS); return; }
        if (r.status === 401 || r.status === 403) { location.replace('/terrain'); return; }
        if (r.status === 423 && r.j.lan_nopw) { root.innerHTML = `${head()}<section class="tw-card">${msg('error', r.j.error || '')}</section>`; return; }
        if (!r.ok) { root.innerHTML = `${head()}<section class="tw-card">${msg('error', r.j.error || t('Refusé.'))}</section>`; return; }
        const changed = S.genealogy && S.genealogy !== r.j.genealogy;
        S.state = r.j; S.csrf = r.j.csrf; S.genealogy = r.j.genealogy; S.online = true;
        document.title = `📱 ${r.j.name}`;
        if (changed) { screenReady(msg('warn', t('« {name} » n’est plus ouverte sur l’ordinateur : tes photos restent en attente ici.', {name: r.j.name}))); return; }
        if (r.j.needs_pw) { screenPassword(); return; }
        const waiting = await qAll();
        let gone = 0; try { gone = Number(localStorage.getItem('lcnda-terrain-n') || 0) - waiting.length; } catch (_) {}
        if (gone > 0 && !S.sawGone) { S.sawGone = true; try { localStorage.setItem('lcnda-terrain-n', String(waiting.length)); } catch (_) {} screenReady(msg('warn', t('Des photos étaient en attente, mais le téléphone a libéré la place. Retrouve-les dans ta galerie et « 🖼 Choisir ».'))); return; }
        if (waiting.length) { if (set().horswifi === 'attente') flush(); else screenWaiting(waiting); return; }
        screenReady();
    }
    window.addEventListener('online', () => { S.online = true; flush(); });
    window.addEventListener('offline', () => { S.online = false; if (!S.sending && document.querySelector('.tw-send')) screenReady(); });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
})();
