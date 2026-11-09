/* LCNDA — 🎲 Yams (Jeux de la famille, app-jeu-famille.js ; barre commune app-jeu-plateau.js ; moteur app-jeu-yams-moteur.js).
 * 5 dés, 3 lancers, feuille de marque française complète (prime de 35 à 63 points) ou américaine (Yahtzee),
 * 1 à 4 joueurs, chacun une personne ou un ordinateur (facile, moyen, difficile) ; record du meilleur score avec sa date.
 */
(() => {
    'use strict';
    const J = () => window.LCNDA_JEUX_FAMILLE, Y = () => window.LCNDA_YAMS, P = () => window.LCNDA_JEUX_PLATEAU;
    if (!J() || !P()) return;
    const FACE = {1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [0, 2], [2, 0], [2, 2]], 5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]], 6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]]};
    const dieSvg = v => `<svg viewBox="0 0 60 60" aria-hidden="true"><rect x="2" y="2" width="56" height="56" rx="11"/>${(FACE[v] || []).map(([y, x]) => `<circle cx="${14 + x * 16}" cy="${14 + y * 16}" r="5.6"/>`).join('')}</svg>`;
    const RULES = v => `<p>Chacun son tour, on lance <b>5 dés</b>. On peut relancer <b>deux fois</b> : avant chaque relance, on garde les dés qu’on veut (touche un dé pour le garder, il passe en bleu).</p>
        <p>Après le dernier lancer (ou avant, si on est content), on <b>inscrit son résultat dans une case libre</b> de sa colonne. Chaque case ne sert qu’une fois ; si rien ne va, on met 0 dans une case. La partie finit quand les 13 cases sont remplies : le plus gros total gagne.</p>
        <table class="jpy-rules"><tbody>${Y().BOXES.map(b => `<tr><th>${Y().LABELS[b]}</th><td>${Y().HELP[v][b]}</td></tr>`).join('')}</tbody></table>
        <p><b>Prime</b> : si les cases du haut (1 à 6) font <b>63 points ou plus</b> (par exemple trois dés de chaque chiffre), on gagne <b>35 points</b> de plus.</p>
        ${v === 'us' ? '<p><b>Yahtzee de plus</b> : si la case Yams contient déjà 50, chaque nouveau Yahtzee rapporte 100 points de prime ; il doit aller dans la case du haut de son chiffre si elle est libre, sinon il peut servir de Full, de Petite ou de Grande suite au maximum (« joker »).</p>' : ''}
        <p><b>Jouer</b> : « 🎲 Lancer » (ou la touche L), touche les dés à garder (ou les touches 1 à 5), puis touche une case de ta colonne. Clavier : flèches dans la feuille, Entrée. ↶ (⌘Z) défait la dernière case remplie, 💡 (H) un conseil, Échap pause.</p>`;
    J().register({
        key: 'yams', short: 'Yams', icon: '🎲', label: '🎲 Yams', title: 'Yams', eyebrow: 'YAMS',
        desc: 'Le Yams (Yahtzee) : 5 dés, 3 lancers et la feuille de marque complète avec la prime. Seul, à plusieurs sur le même écran ou contre l’ordinateur.',
        rulesHint: 'Lance, garde les dés qui t’intéressent, relance deux fois au plus, puis remplis une case. Les règles complètes sont dans le « ? » de la partie.',
        namePh: 'Ex : Le Yams de Noël', fieldsTitle: 'La feuille',
        scope: false, players: {min: 1, max: 4, def: 2},
        playerExtra: i => ({ai: i === 0 ? '' : 'moyen'}),
        defaults: () => ({variant: 'fr', names: true, hints: 3}),
        clean: c => { c.players.forEach(p => { p.ai = P().cleanAi(p.ai); }); return {...c, variant: c.variant === 'us' ? 'us' : 'fr', names: c.names !== false, hints: [0, 3, 5, 10].includes(Number(c.hints)) ? Number(c.hints) : 3}; },
        ready: [{k: 'fr', name: 'Yams à la française', hint: 'Brelan et carré : les dés pareils', cfg: {variant: 'fr'}}, {k: 'us', name: 'Yahtzee (américain)', hint: 'Brelan et carré : la somme des 5 dés, joker', cfg: {variant: 'us'}}],
        fieldsHtml: (c, h) => `<div class="jf-row"><span class="jf-lab">La feuille de marque</span>${h.seg('variant', [['fr', 'Française (Yams)'], ['us', 'Américaine (Yahtzee)']], c.variant)}</div>
            <div class="jf-row"><span class="jf-lab">💡 Conseils</span>${h.seg('hints', [[0, 'Aucun'], [3, '3'], [5, '5'], [10, '10']], c.hints)}</div>
            <div class="jf-checks">${h.toggle('data-jpy-names', c.names, '👪 Les ordinateurs portent le nom d’ancêtres')}</div>`,
        onSeg: (k, v, c) => { if (k === 'variant') c.variant = v; if (k === 'hints') c.hints = Number(v); },
        onChange(t, c) { if (t.matches('[data-jpy-names]')) c.names = t.checked; if (t.name === 'pai') c.players[Number(t.closest('[data-i]').dataset.i)].ai = P().cleanAi(t.value); },
        playerFields: p => P().levelSelect(p),
        async start(c, src, prev) {
            if (c.players.every(p => p.ai)) return {error: 'Il faut au moins une personne pour jouer.'};
            const aiNames = {};
            if (c.names) { const list = await P().ancestors(c.seed, 4); c.players.forEach((p, i) => { if (p.ai && list[i]) aiNames[i] = list[i].name; }); }
            const first = prev ? ((prev.first ?? 0) + 1) % c.players.length : 0;
            return {sheets: c.players.map(() => Y().emptySheet()), turn: first, first, dice: null, keep: [false, false, false, false, false], rolls: 0, n: 0, aiNames, hist: [], hintsLeft: c.hints, round: (prev?.round || 0) + 1, wins: prev?.wins?.length === c.players.length ? prev.wins : c.players.map(() => 0), ms: 0, finished: false, status: 'Partie en cours'};
        },
        mount(host, g, api) {
            const {esc} = api, c = g.cfg, Pl = P(), N = c.players.length, Lg = window.LCNDA_JEUX_LOGIQUE, V = c.variant;
            const nameOf = i => (c.players[i]?.ai && g.aiNames?.[i]) || c.players[i]?.name || `Joueur ${i + 1}`;
            const human = i => !c.players[i]?.ai;
            const humans = c.players.map((p, i) => (p.ai ? -1 : i)).filter(i => i >= 0);
            let hint = null, busy = false, token = 0, rolling = false, lastMsg = '', flash = '';
            const over = () => g.sheets.every(sh => Y().full(sh));
            const rand = () => Lg.rng(`${c.seed}:${g.round}:${g.n}:${g.rolls}:${(g.hist || []).length}`);
            const sh = Pl.shell(host, g, api, {
                game: 'yams', title: 'Yams', rulesHtml: () => RULES(V),
                canUndo: () => (g.hist || []).length > 0 && !busy && !rolling, hints: () => (c.hints ? g.hintsLeft : null), onUndo: undo, onHint: giveHint,
                onPause: () => { api.save(); draw(); },
                keys: e => {
                    if (sh.paused || busy || over() || !human(g.turn)) return false;
                    if (/^[1-5]$/.test(e.key) && g.dice && g.rolls < 3) { toggle(Number(e.key) - 1); return true; }
                    if (e.key.toLowerCase() === 'l' && !e.ctrlKey && !e.metaKey) { roll(); return true; }
                    return false;
                },
            });
            const snap = () => { g.hist = [...(g.hist || []), JSON.stringify({sheets: g.sheets, turn: g.turn, dice: g.dice, keep: g.keep, rolls: g.rolls, n: g.n})].slice(-40); };
            function undo() { const last = (g.hist || []).pop(); if (!last) return; token++; busy = false; Object.assign(g, JSON.parse(last)); g.finished = false; hint = null; g.status = 'Partie en cours'; api.save(); api.sidebar(); draw(); }
            function roll() {
                if (over() || g.rolls >= 3 || rolling || sh.paused) return;
                const R = rand(); g.dice = (g.dice || [0, 0, 0, 0, 0]).map((v, i) => (g.dice && g.keep[i] ? v : 1 + Math.floor(R() * 6))); g.rolls++; hint = null;
                if (g.rolls >= 3) g.keep = g.keep.map(() => false);
                api.save();
                if (Pl.calm()) { draw(); return; }
                rolling = true; draw(); setTimeout(() => { rolling = false; if (host.isConnected) draw(); }, 420);
            }
            function toggle(i) { if (!g.dice || g.rolls >= 3 || rolling) return; g.keep[i] = !g.keep[i]; hint = null; api.save(); draw(); host.querySelector(`[data-jpy-die="${i}"]`)?.focus(); }
            function write(box) {
                if (!g.dice || rolling || over()) return;
                const p = g.turn, sheet = g.sheets[p]; if (!Y().allowed(g.dice, box, V, sheet)) return;
                if (human(p)) snap();
                const r = Y().write(sheet, g.dice, box, V);
                flash = `${nameOf(p)} : ${Y().LABELS[box]} → ${api.plural(r.pts, 'point')}${r.bonus ? ` (+ ${r.bonus} de prime Yahtzee !)` : ''}`;
                g.n++; g.dice = null; g.keep = [false, false, false, false, false]; g.rolls = 0; hint = null;
                if (over()) finish(); else { g.turn = (p + 1) % N; g.status = `Tour ${Math.floor(g.n / N) + 1} sur 13`; }
                api.save(); draw();
            }
            function finish() {
                sh.settle(); g.finished = true;
                const tot = g.sheets.map(s => Y().totals(s).total), top = Math.max(...tot), w = tot.map((v, i) => (v === top ? i : -1)).filter(i => i >= 0);
                g.winners = w; if (w.length === 1) g.wins[w[0]]++;
                g.status = w.length === 1 ? `${nameOf(w[0])} gagne (${top})` : `Égalité (${top})`;
                humans.forEach(me => { const res = N === 1 ? '' : w.includes(me) ? (w.length > 1 ? 'd' : 'w') : 'l'; if (Pl.records.add('yams', V, res, {v: tot[me], label: `${tot[me]} points (${nameOf(me)})`}, {g, id: 'r' + me}).newBest) lastMsg = `🏆 Nouveau record : ${tot[me]} points !`; });
                api.sidebar();
            }
            function giveHint() {
                if (over() || busy || !(g.hintsLeft > 0) || !human(g.turn)) return;
                const sheet = g.sheets[g.turn];
                if (!g.dice) hint = {text: 'Lance les dés pour commencer ton tour.'};
                else {
                    const best = Y().bestBox(sheet, g.dice, V);
                    if (g.rolls < 3) { const k = Y().aiKeep(sheet, g.dice, 3 - g.rolls, 'difficile', V); if (k.every(Boolean)) hint = {box: best.box, text: `Garde tout : mets-le dans « ${Y().LABELS[best.box]} » (${api.plural(best.pts, 'point')}).`}; else hint = {keep: k, text: k.some(Boolean) ? `Garde ${g.dice.filter((_, i) => k[i]).join(', ')} et relance le reste.` : 'Relance tous les dés.'}; }
                    else hint = {box: best.box, text: `Mets-le dans « ${Y().LABELS[best.box]} » (${api.plural(best.pts, 'point')}).`};
                }
                g.hintsLeft--; api.save(); draw();
            }
            function maybeAI() {
                if (over() || sh.paused || human(g.turn) || busy) return;
                busy = true; const my = ++token, lvl = c.players[g.turn].ai, wait = Pl.calm() ? 80 : 650;
                const step = () => {
                    if (my !== token || !host.isConnected) return; if (sh.paused) { busy = false; draw(); return; }
                    const sheet = g.sheets[g.turn];
                    if (!g.dice) { rollQuiet(); return setTimeout(step, wait); }
                    if (g.rolls < 3) { const k = Y().aiKeep(sheet, g.dice, 3 - g.rolls, lvl, V, rand()); if (!k.every(Boolean)) { g.keep = k; draw(); return setTimeout(() => { if (my !== token) return; rollQuiet(); setTimeout(step, wait); }, wait); } }
                    const best = lvl === 'facile' ? Y().BOXES.filter(b => Y().allowed(g.dice, b, V, sheet)).map(b => ({box: b, pts: Y().score(g.dice, b, V, sheet)})).sort((a, b) => b.pts - a.pts)[0] : Y().bestBox(sheet, g.dice, V);
                    busy = false; write(best.box);
                };
                setTimeout(step, wait);
            }
            function rollQuiet() { const R = rand(); g.dice = (g.dice || [0, 0, 0, 0, 0]).map((v, i) => (g.dice && g.keep[i] ? v : 1 + Math.floor(R() * 6))); g.rolls++; if (g.rolls >= 3) g.keep = g.keep.map(() => false); api.save(); draw(); }
            function sheetHtml() {
                const cur = g.turn, can = !over() && human(cur) && g.dice && !rolling && !busy && !sh.paused;
                const cell = (p, b) => { const sv = g.sheets[p][b];
                    if (sv != null) return `<td class="is-done">${sv}</td>`;
                    if (p !== cur || !g.dice || over()) return '<td></td>';
                    const ok = Y().allowed(g.dice, b, V, g.sheets[p]), pts = Y().score(g.dice, b, V, g.sheets[p]);
                    return `<td>${ok && can ? `<button type="button" class="jpy-cell ${hint?.box === b ? 'is-hint' : ''} ${pts ? '' : 'is-zero'}" data-jpy-box="${b}" data-r="${Y().BOXES.indexOf(b)}" data-c="0" aria-label="${esc(Y().LABELS[b])} : ${api.plural(pts, 'point')}">${pts}</button>` : `<span class="jpy-pot">${ok ? pts : ''}</span>`}</td>`; };
                const tot = g.sheets.map(s => Y().totals(s));
                const row = (b, i) => `<tr><th scope="row" title="${esc(Y().HELP[V][b])}">${esc(Y().LABELS[b])}</th>${c.players.map((_, p) => cell(p, b)).join('')}</tr>`;
                return `<table class="jpy-sheet"><thead><tr><th scope="col"></th>${c.players.map((p, i) => `<th scope="col" class="${i === cur && !over() ? 'is-on' : ''}"><i style="--pc:${esc(p.color)}"></i>${esc(nameOf(i))}${p.ai ? ' 🤖' : ''}</th>`).join('')}</tr></thead><tbody>
                    ${Y().UPPER.map(row).join('')}
                    <tr class="is-sum"><th scope="row">Total du haut</th>${tot.map(t => `<td>${t.upper}</td>`).join('')}</tr>
                    <tr class="is-sum"><th scope="row">Prime (63 → 35)</th>${tot.map((t, p) => `<td>${t.prime ? '<b>35 ✓</b>' : Y().UPPER.every(b => g.sheets[p][b] != null) ? '0' : `<small>il manque ${t.need}</small>`}</td>`).join('')}</tr>
                    ${Y().LOWER.map(row).join('')}
                    ${V === 'us' ? `<tr class="is-sum"><th scope="row">Prime Yahtzee</th>${tot.map(t => `<td>${t.bonus || ''}</td>`).join('')}</tr>` : ''}
                    <tr class="is-total"><th scope="row">Total</th>${tot.map(t => `<td>${t.total}</td>`).join('')}</tr></tbody></table>`;
            }
            function draw() {
                const p = g.turn, me = !over() && human(p) && !busy && !sh.paused, done = over();
                api.sub(`Partie ${g.round} · feuille ${V === 'us' ? 'américaine (Yahtzee)' : 'française'} · ${api.plural(N, 'joueur')}`);
                const tot = g.sheets.map(s => Y().totals(s).total);
                const dice = g.dice ? g.dice.map((v, i) => `<button type="button" class="jpy-die ${g.keep[i] ? 'is-keep' : ''} ${rolling && !g.keep[i] ? 'is-rolling' : ''} ${hint?.keep?.[i] ? 'is-hint' : ''}" data-jpy-die="${i}" aria-pressed="${g.keep[i]}" aria-label="Dé ${i + 1} : ${v}${g.keep[i] ? ', gardé' : ''}" ${me && g.rolls < 3 ? '' : 'disabled'}>${dieSvg(v)}<small>${g.keep[i] ? 'gardé' : ''}</small></button>`).join('') : Array.from({length: 5}, () => '<span class="jpy-die is-empty" aria-hidden="true"></span>').join('');
                const msg = done ? `🏆 ${g.winners?.length === 1 ? `${esc(nameOf(g.winners[0]))} gagne avec ${api.plural(tot[g.winners[0]], 'point')} !` : `Égalité à ${api.plural(Math.max(...tot), 'point')} !`}`
                    : sh.paused ? '⏸ En pause' : me ? (g.dice ? (g.rolls < 3 ? `${esc(nameOf(p))} : garde des dés et relance (${api.plural(3 - g.rolls, 'lancer')} encore), ou remplis une case.` : `${esc(nameOf(p))} : remplis une case de ta colonne.`) : `À ${esc(nameOf(p))} : lance les dés.`) : `${esc(nameOf(p))} joue…`;
                host.innerHTML = `${sh.bar(c.players.map((pl, i) => ({name: nameOf(i), color: pl.color, ai: pl.ai, on: !done && i === p, score: tot[i], extra: g.round > 1 && N > 1 ? `<small>${api.plural(g.wins[i], 'partie gagnée', 'parties gagnées')}</small>` : ''})))}
                  <div class="goose-game-layout jpy"><div class="goose-board-wrap jp-wrap">${sh.pauseHtml()}
                    <div class="jpy-table ${sh.paused ? 'jp-hide' : ''}">
                      <div class="jpy-dice" role="group" aria-label="Les dés">${dice}</div>
                      <div class="jpy-act">${done ? '' : `<button type="button" class="button" data-jpy-roll ${me && g.rolls < 3 && !rolling ? '' : 'disabled'} data-shortcut="L">🎲 ${g.dice ? 'Relancer' : 'Lancer'}</button><span class="jpy-left">${g.dice ? api.plural(3 - g.rolls, 'lancer restant', 'lancers restants') : '3 lancers'}</span>`}</div>
                      ${hint?.text && !done ? `<p class="jpy-hint">💡 ${esc(hint.text)}</p>` : ''}
                      ${flash ? `<p class="muted jf-small jpy-flash" role="status">${esc(flash)}</p>` : ''}
                      <div class="jpy-sheet-wrap">${sheetHtml()}</div></div></div>
                    <aside class="goose-panel jp-panel"><p class="goose-status jf-big" role="status">${msg}</p>
                      ${lastMsg && done ? `<p class="jp-newrec">${esc(lastMsg)}</p>` : ''}
                      ${done ? '<p class="muted jf-small">« ↻ Rejouer » en haut : une nouvelle partie, le compte des victoires est gardé.</p>' : `<p class="jf-small">Tour ${Math.min(13, Math.floor(g.n / N) + 1)} sur 13</p>`}
                      ${Pl.records.html('yams', V, V === 'us' ? 'Yahtzee' : 'Yams')}
                      <p class="muted jf-small">« 🎲 Lancer » (L), touche les dés à garder (1 à 5), puis une case de ta colonne. ⌘Z défait la dernière case, H un conseil, Échap pause.</p></aside></div>`;
                sh.bind();
                const sig = {signal: api.signal};
                host.querySelector('[data-jpy-roll]')?.addEventListener('click', roll, sig);
                host.querySelectorAll('[data-jpy-die]').forEach(b => b.addEventListener('click', () => toggle(Number(b.dataset.jpyDie)), sig));
                const table = host.querySelector('.jpy-sheet');
                Pl.gridNav(table, api.signal);
                table?.addEventListener('click', e => { const b = e.target.closest('[data-jpy-box]'); if (b) write(b.dataset.jpyBox); }, sig);
                if (!done && !sh.paused && !busy && !rolling) maybeAI();
            }
            api.onCleanup(() => { token++; sh.settle(); sh.stop(); api.save(); });
            draw();
        },
    });
})();
