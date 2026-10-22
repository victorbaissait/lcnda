/* LCNDA — 📤 visionneuse de la copie « Partager avec la famille » (lib/family_share.php la recopie dans index.html).
 * Fichier autonome : aucune bibliothèque, aucune requête, rien n'est écrit. Les données sont lues dans #fs-data (JSON) et
 * tout le texte est posé avec textContent (jamais innerHTML avec une donnée). Pages : accueil, personnes (index + recherche),
 * fiche d'une personne, arbre des ascendants ; adresse #p/N, #arbre/N, #personnes (le bouton Retour du navigateur marche).
 */
(function () {
    'use strict';
    var D;
    try { D = JSON.parse(document.getElementById('fs-data').textContent || '{}'); } catch (e) { D = {people: [], fams: [], media: []}; }
    var people = D.people || [], fams = D.fams || [], media = D.media || [];
    var byI = {};
    people.forEach(function (p) { byI[p.i] = p; });
    var app = document.getElementById('fs-app');

    function el(tag, attrs, kids) {
        var n = document.createElement(tag);
        if (attrs) Object.keys(attrs).forEach(function (k) {
            var v = attrs[k];
            if (v === null || v === undefined || v === false) return;
            if (k === 'text') n.textContent = String(v);
            else if (k === 'class') n.className = v;
            else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
            else n.setAttribute(k, v === true ? '' : String(v));
        });
        (kids || []).forEach(function (c) { if (c === null || c === undefined || c === false) return; n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
        return n;
    }
    var fold = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
    var plural = function (n, one, many) { return n + ' ' + (n > 1 ? (many || one + 's') : one); };
    function name(p) { return p ? (p.lv ? p.f : [p.f, p.l].filter(Boolean).join(' ')) || 'Sans nom' : ''; }
    function years(p) {
        if (!p || p.lv) return p && p.lv ? 'vivant' + (p.s === 'f' ? 'e' : '') : '';
        if (!p.by && !p.dy) return '';
        return (p.by || '?') + ' – ' + (p.dy || (p.by && p.by < new Date().getFullYear() - 110 ? '?' : ''));
    }
    function initials(p) { return ((p.f || '?').charAt(0) + (p.l || '').charAt(0)).toUpperCase(); }
    function parentsOf(p) { var f = (p.par || []).map(function (k) { return fams[k]; }).filter(Boolean)[0]; return f ? [byI[f.a], byI[f.b]] : [null, null]; }
    function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

    function avatar(p, size) {
        var m = p && p.ph !== undefined && media[p.ph] && !media[p.ph].gone ? media[p.ph] : null;
        var box = el('span', {class: 'fs-av fs-av-' + (p && p.s || 'u') + (size ? ' is-' + size : ''), 'aria-hidden': 'true'});
        if (m) box.appendChild(el('img', {src: m.th, alt: '', loading: 'lazy'}));
        else box.textContent = p ? (p.lv ? '🙂' : initials(p)) : '?';
        return box;
    }
    function personLink(p, extra) {
        if (!p) return el('span', {class: 'fs-muted', text: 'Inconnu'});
        return el('a', {class: 'fs-plink' + (p.lv ? ' is-living' : ''), href: '#p/' + p.i}, [avatar(p, 's'), el('span', {}, [el('b', {text: name(p)}), years(p) ? el('small', {text: ' ' + years(p)}) : null, extra ? el('small', {class: 'fs-extra', text: ' · ' + extra}) : null])]);
    }

    /* ─── la page autour ─── */
    var q = '';
    function shell(main, current) {
        app.textContent = '';
        var search = el('input', {type: 'search', id: 'fs-q', placeholder: 'Chercher quelqu’un… (nom, prénom, lieu, année)', 'aria-label': 'Chercher une personne', value: q, autocomplete: 'off'});
        search.addEventListener('input', function () { q = search.value; if (!/^#personnes/.test(location.hash)) { history.replaceState(null, '', '#personnes'); } renderIndex(true); });
        var nav = el('nav', {class: 'fs-nav', 'aria-label': 'Pages'}, [
            el('a', {href: '#', class: current === 'home' ? 'is-active' : ''}, ['🏠 Accueil']),
            el('a', {href: '#personnes', class: current === 'index' ? 'is-active' : ''}, ['👥 Les personnes']),
            el('a', {href: '#arbre/' + (D.root || (people[0] && people[0].i) || ''), class: current === 'tree' ? 'is-active' : ''}, ['🌳 L’arbre'])]);
        app.appendChild(el('header', {class: 'fs-top'}, [el('div', {class: 'fs-brand'}, [el('h1', {text: D.title || 'L’arbre de la famille'}),
            el('p', {text: 'Copie en lecture seule du ' + frDate(D.made) + ' · ' + plural(people.length, 'personne')})]), el('div', {class: 'fs-search'}, [search]), nav]));
        app.appendChild(el('main', {class: 'fs-main', id: 'fs-main'}, [main]));
        app.appendChild(el('footer', {class: 'fs-foot'}, [el('p', {text: 'Cette copie ne peut pas être modifiée. ' + (D.living === 'first' ? 'Les personnes vivantes n’y apparaissent que par leur prénom' : 'Les personnes vivantes n’y figurent pas') + ', ni les fiches confidentielles. Fait avec LCNDA — Le Carnet numérique des ancêtres.'})]));
        return search;
    }
    function frDate(iso) { var m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(iso || ''); if (!m) return ''; var mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']; return Number(m[3]) + ' ' + mois[Number(m[2]) - 1] + ' ' + m[1]; }

    /* ─── accueil ─── */
    function renderHome() {
        var root = byI[D.root];
        var counts = {}; people.forEach(function (p) { if (!p.lv && p.l) { var k = p.l.toUpperCase(); counts[k] = (counts[k] || 0) + 1; } });
        var names = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b, 'fr'); }).slice(0, 40);
        var photos = media.filter(function (m) { return m.k === 'photo' && !m.gone; }).length, docs = media.filter(function (m) { return m.k === 'doc' && !m.gone; }).length;
        var box = el('section', {class: 'fs-home'}, [
            el('div', {class: 'fs-card fs-welcome'}, [el('h2', {text: 'Bienvenue'}), el('p', {text: 'Voici l’arbre de la famille : ' + plural(people.length, 'personne') + (photos ? ', ' + plural(photos, 'photo') : '') + (docs ? ', ' + plural(docs, 'document') : '') + '. Clique sur un nom pour ouvrir sa fiche, ou cherche quelqu’un en haut.'}),
                root ? el('div', {class: 'fs-root'}, [personLink(root), el('a', {class: 'fs-btn', href: '#arbre/' + root.i, text: '🌳 Voir ses ancêtres'})]) : null]),
            names.length ? el('div', {class: 'fs-card'}, [el('h2', {text: 'Les noms de famille'}), el('div', {class: 'fs-names'}, names.map(function (n) {
                return el('button', {type: 'button', class: 'fs-chip', onclick: function () { q = n; history.replaceState(null, '', '#personnes'); renderIndex(); }}, [n + ' ', el('small', {text: String(counts[n])})]);
            }))]) : null]);
        shell(box, 'home');
    }

    /* ─── les personnes (et la recherche) ─── */
    function hay(p) {
        if (p._h) return p._h;
        return (p._h = fold([p.f, p.l, p.l + ' ' + p.f, p.by, p.dy].concat((p.ev || []).map(function (e) { return e.p + ' ' + e.d; })).join(' ')));
    }
    function renderIndex(keepFocus) {
        var words = fold(q).split(/\s+/).filter(Boolean);
        var list = people.filter(function (p) { return words.every(function (w) { return hay(p).indexOf(w) >= 0; }); })
            .sort(function (a, b) { return (a.l || '~').localeCompare(b.l || '~', 'fr', {sensitivity: 'base'}) || (a.f || '').localeCompare(b.f || '', 'fr') || (a.by || 0) - (b.by || 0); });
        var groups = {}, order = [];
        list.forEach(function (p) { var k = p.lv ? '…' : (p.l || '?').charAt(0).toUpperCase(); if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(p); });
        var shown = list.slice(0, 600);
        var box = el('section', {class: 'fs-index'}, [el('h2', {text: words.length ? plural(list.length, 'personne trouvée', 'personnes trouvées') : 'Toutes les personnes (' + list.length + ')'}),
            list.length ? null : el('p', {class: 'fs-empty', text: 'Personne ne correspond. Vérifie l’orthographe, ou cherche seulement le nom de famille.'})]);
        var seen = {};
        shown.forEach(function (p) {
            var k = p.lv ? '…' : (p.l || '?').charAt(0).toUpperCase();
            if (!seen[k]) { seen[k] = el('div', {class: 'fs-group'}, [el('h3', {text: k === '…' ? 'Personnes vivantes (prénom seulement)' : k})]); box.appendChild(seen[k]); }
            var birth = (p.ev || []).filter(function (e) { return e.p; })[0];
            seen[k].appendChild(personLink(p, birth ? birth.p.split(',')[0] : ''));
        });
        if (list.length > shown.length) box.appendChild(el('p', {class: 'fs-muted', text: '… et ' + (list.length - shown.length) + ' autres : précise la recherche.'}));
        var input = shell(box, 'index');
        if (keepFocus) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    }

    /* ─── la fiche ─── */
    function section(title, kids) { return el('section', {class: 'fs-card'}, [el('h2', {text: title})].concat(kids)); }
    function renderPerson(p) {
        if (!p) return renderHome();
        var head = el('div', {class: 'fs-hero'}, [avatar(p, 'l'), el('div', {}, [el('h2', {text: name(p)}), el('p', {class: 'fs-muted', text: p.lv ? 'Personne vivante : seulement son prénom.' : years(p)}),
            p.lv ? null : el('a', {class: 'fs-btn', href: '#arbre/' + p.i, text: '🌳 Ses ancêtres'})])]);
        var kids = [head];
        if (!p.lv && (p.ev || []).length) kids.push(section('📅 Sa vie', [el('ul', {class: 'fs-events'}, p.ev.map(function (e) {
            return el('li', {}, [el('b', {text: e.t}), e.d ? el('span', {text: ' ' + e.d}) : null, e.p ? el('span', {class: 'fs-muted', text: ' · ' + e.p}) : null, e.x ? el('p', {class: 'fs-note', text: e.x}) : null]);
        }))]));
        var par = parentsOf(p);
        if (par[0] || par[1]) kids.push(section('👪 Ses parents', [el('div', {class: 'fs-people'}, [par[0] ? personLink(par[0], 'père') : null, par[1] ? personLink(par[1], 'mère') : null])]));
        (p.fam || []).forEach(function (k) {
            var f = fams[k]; if (!f) return;
            var other = byI[f.a === p.i ? f.b : f.a];
            var ev = (f.ev || []).map(function (e) { return e.t + (e.d ? ' ' + e.d : '') + (e.p ? ' · ' + e.p : ''); }).join(' ; ');
            var children = (f.c || []).map(function (c) { return byI[c]; }).filter(Boolean);
            kids.push(section(other ? '💍 Avec ' + name(other) : '👶 Ses enfants', [other ? el('div', {class: 'fs-people'}, [personLink(other, ev)]) : null,
                children.length ? el('h3', {text: plural(children.length, 'enfant')}) : null, children.length ? el('div', {class: 'fs-people'}, children.map(function (c) { return personLink(c); })) : null]));
        });
        var mine = (p.md || []).map(function (k) { return media[k]; }).filter(Boolean);
        var ph = mine.filter(function (m) { return m.k === 'photo'; }), docs = mine.filter(function (m) { return m.k === 'doc'; });
        if (ph.length) kids.push(section('📷 Photos', [gallery(ph)]));
        if (docs.length) kids.push(section('📄 Documents', [gallery(docs)]));
        if ((p.no || []).length) kids.push(section('📝 Notes', p.no.map(function (t) { return el('p', {class: 'fs-note', text: t}); })));
        shell(el('article', {class: 'fs-person'}, kids), 'person');
        document.title = name(p) + ' — ' + (D.title || 'Arbre');
    }
    function gallery(list) {
        return el('div', {class: 'fs-gallery'}, list.map(function (m) {
            if (m.gone) return el('div', {class: 'fs-tile is-gone'}, [el('span', {text: '🖼'}), el('small', {text: m.t + ' (image absente)'})]);
            return el('button', {type: 'button', class: 'fs-tile', onclick: function () { lightbox(list.filter(function (x) { return !x.gone; }), m); }}, [el('img', {src: m.th, alt: m.t, loading: 'lazy'}), el('small', {text: m.t + (m.y ? ' · ' + m.y : '')})]);
        }));
    }
    function lightbox(list, cur) {
        var i = Math.max(0, list.indexOf(cur));
        var img = el('img', {alt: ''}), cap = el('p', {}), tr = el('p', {class: 'fs-note'});
        var close = function () { box.remove(); document.removeEventListener('keydown', key); };
        var show = function () { var m = list[i]; img.src = m.f; img.alt = m.t; cap.textContent = m.t + (m.y ? ' · ' + m.y : '') + (m.c ? ' · ' + m.c : ''); tr.textContent = m.tr || ''; tr.hidden = !m.tr; };
        var step = function (d) { i = (i + d + list.length) % list.length; show(); };
        var key = function (e) { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); };
        var box = el('div', {class: 'fs-lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Image en grand', onclick: function (e) { if (e.target === box) close(); }}, [
            el('button', {type: 'button', class: 'fs-x', 'aria-label': 'Fermer', onclick: close, text: '×'}),
            list.length > 1 ? el('button', {type: 'button', class: 'fs-prev', 'aria-label': 'Image précédente', onclick: function () { step(-1); }, text: '‹'}) : null,
            el('figure', {}, [img, el('figcaption', {}, [cap, tr])]),
            list.length > 1 ? el('button', {type: 'button', class: 'fs-next', 'aria-label': 'Image suivante', onclick: function () { step(1); }, text: '›'}) : null]);
        document.body.appendChild(box); document.addEventListener('keydown', key); show(); box.querySelector('.fs-x').focus();
    }

    /* ─── l'arbre des ascendants (4 générations) ─── */
    function renderTree(p) {
        if (!p) return renderHome();
        var gens = [[p]];
        for (var g = 1; g < 4; g++) { var row = []; gens[g - 1].forEach(function (x) { var pr = x ? parentsOf(x) : [null, null]; row.push(pr[0] || null, pr[1] || null); }); gens.push(row); }
        var cols = gens.map(function (row, g) {
            return el('div', {class: 'fs-tcol'}, row.map(function (x, k) {
                if (!x) return el('div', {class: 'fs-tbox is-empty'}, [el('span', {text: g ? (k % 2 ? 'Mère inconnue' : 'Père inconnu') : ''})]);
                return el('a', {class: 'fs-tbox fs-sex-' + x.s, href: g ? '#arbre/' + x.i : '#p/' + x.i, title: g ? 'Voir ses ancêtres' : 'Ouvrir sa fiche'}, [el('b', {text: name(x)}), el('small', {text: years(x)})]);
            }));
        });
        var heads = ['', 'Parents', 'Grands-parents', 'Arrière-grands-parents'].map(function (t) { return el('h3', {class: 'fs-thead', text: t}); });
        var main = el('section', {class: 'fs-tree-page'}, [el('div', {class: 'fs-tree-head'}, [el('h2', {text: 'Les ancêtres de ' + name(p)}), el('a', {class: 'fs-btn', href: '#p/' + p.i, text: '👤 Sa fiche'})]),
            el('p', {class: 'fs-muted', text: 'Clique sur un ancêtre pour remonter plus haut.'}), el('div', {class: 'fs-tree'}, heads.concat(cols))]);
        shell(main, 'tree');
    }

    function render() {
        var h = decodeURIComponent(location.hash.replace(/^#/, ''));
        var m = /^(p|arbre)\/(\d+)$/.exec(h);
        document.title = D.title || 'Arbre de la famille';
        if (m) { var p = byI[Number(m[2])]; if (m[1] === 'p') renderPerson(p); else renderTree(p && !p.lv ? p : null); }
        else if (h === 'personnes') renderIndex();
        else renderHome();
        window.scrollTo(0, 0);
    }
    window.addEventListener('hashchange', render);
    document.addEventListener('keydown', function (e) { if (e.key === '/' && document.activeElement && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); var s = document.getElementById('fs-q'); if (s) s.focus(); } });
    render();
})();
