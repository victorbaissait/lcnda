/* LCNDA — 🏅 Le profil « Sportif · athlète » (maquette Q de docs/design/profils-et-oeuvres.html).
 * Clubs et sélections, résultats, records, médailles et titres, statistiques par saison (colonnes selon le sport, colonnes à
 * soi, colonnes calculées), entraîneurs et coéquipiers, blessures, équipement, reconversion — et chaque sport a ses champs
 * (plus de 120 sports en 13 familles : collectifs, raquette, individuels, cyclisme, équestres, arts martiaux, combat, échecs
 * et jeux, mécaniques, nautiques, montagne, e-sport, précision).
 * Sortes du moteur (serveur : lib/profils.php) : sp_club, sp_result, sp_record, sp_season, et la fiche profile_sport.
 */
(() => {
    'use strict';
    const ART = window.LCNDA_ART, PF = ART?.PF; if (!ART?.define || !PF) return;
    const A = () => window.LCNDA_APP;
    const U = ART.util, esc = U.esc, plural = (n, w, pl) => U.plural(n, w, pl);
    const ext = window.LCNDA_EXT || {};
    const opt = l => l.map(x => Array.isArray(x) ? x : [x, x]);
    const lab = (l, v) => (l.find(x => x[0] === v) || [, v || ''])[1];
    const NOTES = {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]};

    /* ═════════ Les familles de sports : leurs champs de résultat, leurs colonnes de statistiques ═════════ */
    const t = (key, label, type = 'text', x = {}) => ({key, label, type, ...x});
    const FAM = {
        collectif: {label: '⚽ Collectifs', fields: [t('position', 'Poste'), t('jersey', 'N° de maillot'), t('opponent', 'Équipe adverse'), t('score', 'Score'), t('starter', 'Titulaire', 'bool'), t('minutes', 'Minutes jouées', 'number'), t('scored', 'Buts, essais, points', 'number')],
            stats: [['matches', 'Matchs'], ['starts', 'Titul.'], ['minutes', 'Minutes'], ['goals', 'Buts'], ['assists', 'Passes déc.'], ['yellow', '🟨'], ['red', '🟥']]},
        raquette: {label: '🎾 Raquette', fields: [t('opponent', 'Adversaire', 'person'), t('score', 'Score (sets)'), t('surface', 'Surface', 'select', {choices: opt(['', 'terre battue', 'dur', 'gazon', 'salle'])}), t('ranking', 'Classement à ce moment')],
            stats: [['matches', 'Matchs'], ['wins', 'Victoires'], ['losses', 'Défaites'], ['titles', 'Titres'], ['ranking', 'Classement']]},
        individuel: {label: '🏃 Individuels', fields: [t('event', 'Épreuve'), t('perf', 'Temps, distance, points'), t('wind', 'Vent (m/s)'), t('age_cat', 'Catégorie d’âge'), t('lane', 'Couloir, dossard')],
            stats: [['comps', 'Compétitions'], ['wins', 'Victoires'], ['podiums', 'Podiums'], ['best', 'Meilleure perf.']]},
        cyclisme: {label: '🚴 Cyclisme', fields: [t('stage', 'Étape'), t('jersey', 'Maillot (jaune, à pois…)'), t('team', 'Équipe'), t('gap', 'Écart')],
            stats: [['days', 'Jours de course'], ['wins', 'Victoires'], ['podiums', 'Podiums'], ['km', 'Km']]},
        equestre: {label: '🏇 Équestres', fields: [t('horse', 'Cheval (fiche animal 🐾)', 'person'), t('owner', 'Propriétaire', 'person'), t('stud', 'Haras, écurie'), t('faults', 'Barres, fautes'), t('time', 'Chrono')],
            stats: [['events', 'Épreuves'], ['clear', 'Sans-faute'], ['wins', 'Victoires'], ['earnings', 'Gains']]},
        martial: {label: '🥋 Arts martiaux', fields: [t('grade', 'Grade porté'), t('kata', 'Kata, forme'), t('weight_cat', 'Catégorie de poids')],
            stats: [['comps', 'Compétitions'], ['medals', 'Médailles'], ['grade', 'Grade']]},
        combat: {label: '🥊 Combat', fields: [t('opponent', 'Adversaire', 'person'), t('weight_cat', 'Catégorie de poids'), t('method', 'Issue', 'select', {choices: opt(['', 'KO', 'KO technique', 'aux points', 'décision', 'soumission', 'abandon', 'disqualification'])}), t('rounds', 'Reprises, rounds'), t('belt', 'Ceinture de titre')],
            stats: [['fights', 'Combats'], ['wins', 'V'], ['losses', 'D'], ['draws', 'N'], ['ko', 'KO']]},
        echecs: {label: '♟ Échecs · jeux', fields: [t('opponent', 'Adversaire', 'person'), t('color', 'Couleur', 'select', {choices: opt(['', 'blancs', 'noirs'])}), t('elo_opp', 'Elo de l’adversaire'), t('opening', 'Ouverture'), t('pgn', 'Partie (PGN)', 'longtext')],
            stats: [['games', 'Parties'], ['wins', 'Gains'], ['draws', 'Nulles'], ['losses', 'Pertes'], ['elo', 'Elo (fin)']]},
        meca: {label: '🏎 Mécaniques', fields: [t('vehicle', 'Véhicule'), t('number', 'N°'), t('team', 'Écurie'), t('copilot', 'Copilote', 'person'), t('circuit', 'Circuit'), t('fastest_lap', 'Tour le plus rapide'), t('grid', 'Position de départ')],
            stats: [['races', 'Courses'], ['wins', 'Victoires'], ['podiums', 'Podiums'], ['poles', 'Poles'], ['fastest', 'Meilleurs tours'], ['points', 'Points']]},
        nautique: {label: '⛵ Nautiques', fields: [t('boat', 'Bateau'), t('class', 'Classe'), t('crew', 'Équipage', 'people'), t('corrected', 'Temps compensé')],
            stats: [['regattas', 'Régates'], ['wins', 'Victoires'], ['podiums', 'Podiums']]},
        alpin: {label: '🏔 Montagne', fields: [t('summit', 'Sommet'), t('route', 'Voie'), t('grade', 'Cotation'), t('rope', 'Cordée', 'people'), t('first', 'Première', 'bool')],
            stats: [['ascents', 'Ascensions'], ['summits', 'Sommets'], ['firsts', 'Premières']]},
        esport: {label: '🎮 E-sport', fields: [t('game', 'Jeu'), t('nick', 'Pseudo'), t('team', 'Équipe'), t('prize', 'Gains', 'money')],
            stats: [['tournaments', 'Tournois'], ['wins', 'Victoires'], ['earnings', 'Gains']]},
        precision: {label: '🎯 Précision', fields: [t('score', 'Score'), t('catch', 'Prises (poids)'), t('partners_p', 'Doublette, triplette', 'people')],
            stats: [['comps', 'Concours'], ['wins', 'Victoires'], ['best', 'Meilleur score']]},
    };
    const RUGBY = [['matches', 'Matchs'], ['starts', 'Titul.'], ['minutes', 'Minutes'], ['tries', 'Essais'], ['points', 'Points'], ['pens', 'Pénalités'], ['convs', 'Transformations'], ['drops', 'Drops'], ['yellow', '🟨'], ['red', '🟥']];
    const STATS_OF = {rugby_xv: RUGBY, rugby_7: RUGBY, rugby_xiii: RUGBY,
        football: [['matches', 'Matchs'], ['starts', 'Titul.'], ['minutes', 'Minutes'], ['goals', 'Buts'], ['assists', 'Passes déc.'], ['clean', 'Clean sheets'], ['yellow', '🟨'], ['red', '🟥']],
        basket: [['matches', 'Matchs'], ['minutes', 'Minutes'], ['points', 'Points'], ['rebounds', 'Rebonds'], ['assists', 'Passes'], ['steals', 'Interceptions'], ['blocks', 'Contres']],
        handball: [['matches', 'Matchs'], ['goals', 'Buts'], ['saves', 'Arrêts'], ['susp', '2 min']], volley: [['matches', 'Matchs'], ['sets', 'Sets'], ['points', 'Points'], ['aces', 'Aces'], ['blocks', 'Contres']],
        hockey_glace: [['matches', 'Matchs'], ['goals', 'Buts'], ['assists', 'Assistances'], ['points', 'Points'], ['plusminus', '+/-'], ['pim', 'Pénalités (min)']]};
    const OFF_OF = {rugby_xv: ['pens', 'convs', 'drops'], rugby_7: ['pens', 'convs', 'drops', 'minutes'], rugby_xiii: ['pens', 'convs', 'drops']};
    // [clé, nom, famille, icône]
    const SP = (fam, icon, list) => list.map(([k, l, i]) => [k, l, fam, i || icon]);
    const SPORTS = [
        ...SP('collectif', '⚽', [['football', 'Football'], ['futsal', 'Futsal'], ['football_us', 'Football américain', '🏈'], ['rugby_xv', 'Rugby à XV', '🏉'], ['rugby_7', 'Rugby à 7', '🏉'], ['rugby_xiii', 'Rugby à XIII', '🏉'], ['basket', 'Basket-ball', '🏀'], ['basket_3x3', 'Basket 3x3', '🏀'], ['handball', 'Handball', '🤾'], ['volley', 'Volley-ball', '🏐'], ['beach_volley', 'Beach-volley', '🏐'], ['water_polo', 'Water-polo', '🤽'], ['hockey_glace', 'Hockey sur glace', '🏒'], ['hockey_gazon', 'Hockey sur gazon', '🏑'], ['roller_hockey', 'Roller hockey', '🏒'], ['baseball', 'Baseball', '⚾'], ['softball', 'Softball', '🥎'], ['cricket', 'Cricket', '🏏'], ['ultimate', 'Ultimate', '🥏'], ['korfbal', 'Korfbal'], ['netball', 'Netball'], ['pelote', 'Pelote basque'], ['lacrosse', 'Crosse (lacrosse)', '🥍'], ['polo', 'Polo', '🏇'], ['horse_ball', 'Horse-ball', '🏇'], ['kin_ball', 'Kin-ball'], ['rink_hockey', 'Rink hockey', '🏒']]),
        ...SP('raquette', '🎾', [['tennis', 'Tennis'], ['tennis_table', 'Tennis de table', '🏓'], ['badminton', 'Badminton', '🏸'], ['squash', 'Squash'], ['padel', 'Padel'], ['jeu_paume', 'Jeu de paume']]),
        ...SP('individuel', '🏃', [['athletisme', 'Athlétisme'], ['marathon', 'Marathon, route'], ['trail', 'Trail'], ['cross', 'Cross-country'], ['orientation', 'Course d’orientation', '🧭'], ['triathlon', 'Triathlon'], ['pentathlon', 'Pentathlon moderne'], ['natation', 'Natation', '🏊'], ['natation_art', 'Natation artistique', '🏊'], ['plongeon', 'Plongeon', '🏊'], ['gymnastique', 'Gymnastique artistique', '🤸'], ['gym_rythmique', 'Gymnastique rythmique', '🤸'], ['trampoline', 'Trampoline', '🤸'], ['halterophilie', 'Haltérophilie', '🏋'], ['force', 'Force athlétique', '🏋'], ['culturisme', 'Culturisme', '💪'], ['ski_alpin', 'Ski alpin', '⛷'], ['ski_fond', 'Ski de fond', '⛷'], ['biathlon', 'Biathlon', '⛷'], ['saut_ski', 'Saut à ski', '⛷'], ['combine', 'Combiné nordique', '⛷'], ['snowboard', 'Snowboard', '🏂'], ['patinage', 'Patinage artistique', '⛸'], ['patinage_vitesse', 'Patinage de vitesse', '⛸'], ['bobsleigh', 'Bobsleigh'], ['luge', 'Luge'], ['escalade', 'Escalade', '🧗'], ['danse_sportive', 'Danse sportive', '💃'], ['skateboard', 'Skateboard', '🛹'], ['surf', 'Surf', '🏄'], ['roller', 'Roller', '🛼'], ['parkour', 'Parkour'], ['marche', 'Marche athlétique']]),
        ...SP('cyclisme', '🚴', [['cyclisme', 'Cyclisme sur route'], ['cyclisme_piste', 'Cyclisme sur piste'], ['vtt', 'VTT', '🚵'], ['bmx', 'BMX'], ['cyclo_cross', 'Cyclo-cross']]),
        ...SP('equestre', '🏇', [['cso', 'Saut d’obstacles'], ['dressage', 'Dressage'], ['cce', 'Concours complet'], ['galop', 'Courses de galop'], ['trot', 'Trot'], ['endurance_eq', 'Endurance équestre'], ['attelage', 'Attelage'], ['voltige', 'Voltige équestre']]),
        ...SP('martial', '🥋', [['judo', 'Judo'], ['karate', 'Karaté'], ['taekwondo', 'Taekwondo'], ['aikido', 'Aïkido'], ['jujitsu', 'Ju-jitsu'], ['kendo', 'Kendo'], ['kung_fu', 'Kung-fu, wushu'], ['sambo', 'Sambo']]),
        ...SP('combat', '🥊', [['boxe', 'Boxe anglaise'], ['savate', 'Boxe française (savate)'], ['kickboxing', 'Kick-boxing'], ['muay_thai', 'Muay-thaï'], ['mma', 'MMA'], ['lutte', 'Lutte libre', '🤼'], ['lutte_greco', 'Lutte gréco-romaine', '🤼'], ['escrime', 'Escrime', '🤺'], ['sumo', 'Sumo']]),
        ...SP('echecs', '♟', [['echecs', 'Échecs'], ['dames', 'Dames'], ['go', 'Go'], ['bridge', 'Bridge', '🃏'], ['scrabble', 'Scrabble', '🔤'], ['poker', 'Poker', '🃏'], ['belote', 'Belote', '🃏'], ['tarot', 'Tarot', '🃏']]),
        ...SP('meca', '🏎', [['formule1', 'Formule 1, monoplace'], ['rallye', 'Rallye'], ['endurance_auto', 'Endurance automobile'], ['karting', 'Karting'], ['moto', 'Moto (vitesse)', '🏍'], ['motocross', 'Motocross', '🏍'], ['trial', 'Trial', '🏍'], ['motonautisme', 'Motonautisme', '🚤'], ['voltige_air', 'Voltige aérienne', '✈️']]),
        ...SP('nautique', '⛵', [['voile', 'Voile'], ['aviron', 'Aviron', '🚣'], ['canoe', 'Canoë-kayak', '🛶'], ['kitesurf', 'Kitesurf', '🪁'], ['planche', 'Planche à voile'], ['rafting', 'Rafting'], ['apnee', 'Apnée, plongée', '🤿'], ['joutes', 'Joutes nautiques']]),
        ...SP('alpin', '🏔', [['alpinisme', 'Alpinisme'], ['ski_alpinisme', 'Ski-alpinisme'], ['cascade', 'Cascade de glace'], ['randonnee', 'Randonnée', '🥾'], ['speleo', 'Spéléologie', '🔦']]),
        ...SP('esport', '🎮', [['esport', 'E-sport'], ['simracing', 'Simracing'], ['jeux_combat', 'Jeux de combat']]),
        ...SP('precision', '🎯', [['tir', 'Tir sportif'], ['tir_arc', 'Tir à l’arc', '🏹'], ['petanque', 'Pétanque'], ['boules', 'Boules lyonnaises'], ['billard', 'Billard', '🎱'], ['bowling', 'Bowling', '🎳'], ['flechettes', 'Fléchettes'], ['peche', 'Pêche sportive', '🎣'], ['golf', 'Golf', '⛳'], ['curling', 'Curling', '🥌'], ['croquet', 'Croquet'], ['quilles', 'Quilles'], ['ball_trap', 'Ball-trap']]),
    ];
    PF.SPORTS = SPORTS; PF.SPORT_FAMILIES = FAM;
    const SPORT = new Map(SPORTS.map(s => [s[0], s]));
    const famOf = k => SPORT.get(k)?.[2] || 'collectif';
    const sportLabel = k => SPORT.get(k)?.[1] || '';
    const sportIcon = k => SPORT.get(k)?.[3] || '🏅';
    const SPORT_CHOICES = [['', '— Sport —'], ...SPORTS.map(s => [s[0], `${s[3]} ${s[1]}`])];

    /* — le choix du sport (rangé par famille) — */
    ART.ft.sport = {label: 'Sport', badge: '🏅', edit: (f, v) => `<select class="ar-in" data-v data-pf-sport><option value="">— Choisis le sport —</option>${Object.entries(FAM).map(([fk, F]) => `<optgroup label="${esc(F.label)}">${SPORTS.filter(s => s[2] === fk).map(s => `<option value="${esc(s[0])}" ${s[0] === v ? 'selected' : ''}>${esc(s[3])} ${esc(s[1])}</option>`).join('')}</optgroup>`).join('')}</select>`,
        get: el => el.querySelector('[data-v]')?.value || '', read: (f, v) => v ? `${esc(sportIcon(v))} ${esc(sportLabel(v) || v)}` : '', text: (f, v) => sportLabel(v) || String(v || ''), empty: v => !v};
    /* — les champs propres au sport (data.sf) : ceux de sa famille — */
    const subF = (f, F) => F.fields.map(x => ({...x, star: true}));
    const famOfDraft = (ctx, it) => famOf((ctx?.draft || it?.data || ctx?.item?.data || {}).sport);
    ART.ft.sportfields = {label: 'Champs du sport', badge: '🏅', wide: true, block: true,
        edit: (f, v, ctx) => { const fam = famOfDraft(ctx), F = FAM[fam], val = v && typeof v === 'object' ? v : {};
            return `<div class="pf-sfwrap" data-pf-sfwrap="${esc(fam)}"><small class="ar-g">${esc(F.label)} — les champs changent avec le sport choisi</small><div class="pf-sfgrid">${subF(f, F).map(x => `<div class="pf-sf" data-sfk="${esc(x.key)}" data-sft="${esc(x.type)}"><span class="ar-flab">${esc(x.label)}</span>${(ART.ft[x.type] || ART.ft.text).edit(x, val[x.key], ctx)}</div>`).join('')}</div></div>`; },
        get: el => { const o = {}; el.querySelectorAll('[data-sfk]').forEach(s => { const x = {key: s.dataset.sfk, type: s.dataset.sft}, ft = ART.ft[x.type] || ART.ft.text, v = ft.get ? ft.get(s, x) : s.querySelector('[data-v]')?.value; if (v !== '' && v != null && !(Array.isArray(v) && !v.length) && v !== false) o[x.key] = v; }); return o; },
        read: (f, v, ctx) => { const val = v && typeof v === 'object' ? v : {}, all = Object.values(FAM).flatMap(F => F.fields), seen = new Set();
            const rows = Object.entries(val).map(([k, x]) => { const d = all.find(y => y.key === k); if (!d || seen.has(k)) return ''; seen.add(k); const h = (ART.ft[d.type] || ART.ft.text).read(d, x, ctx); return h ? `<dt>${esc(d.label)}</dt><dd>${h}</dd>` : ''; }).join('');
            return rows ? `<dl class="ar-dl">${rows}</dl>` : ''; },
        text: (f, v) => Object.values(v || {}).map(x => typeof x === 'object' ? (x.title || x.pname || '') : String(x)).filter(Boolean).join(' · '), empty: v => !v || typeof v !== 'object' || !Object.keys(v).length};

    /* — les colonnes de statistiques d'un sport : celles du sport, les tiennes, les calculées (⚙️ Colonnes) — */
    const colsCfg = (st, sport) => (PF.cfgOf(st).sportcols || {})[sport || '_'] || {};
    PF.statCols = (st, sport) => {
        const base = (STATS_OF[sport] || FAM[famOf(sport)].stats).map(([key, label]) => ({key, label})), c = colsCfg(st, sport);
        const all = [...base, ...(c.custom || []).map(x => ({...x, custom: true})), ...(c.calc || []).map(x => ({...x, calc: true}))];
        const pos = new Map((c.order || []).map((k, i) => [k, i])), off = new Set(c.off || (c.order ? [] : OFF_OF[sport] || []));
        return all.sort((a, b) => (pos.has(a.key) ? pos.get(a.key) : 500 + all.indexOf(a)) - (pos.has(b.key) ? pos.get(b.key) : 500 + all.indexOf(b))).map(x => ({...x, on: !off.has(x.key)}));
    };
    const num = v => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
    /** une formule (« points / matchs », « (essais * 5) + pens * 3 ») : + − × ÷ et parenthèses seulement */
    const fold = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    PF.calc = (formula, vals, cols = []) => {
        const byLabel = new Map(cols.map(c => [fold(c.label), c.key])), known = new Set(cols.map(c => c.key));
        const toks = String(formula || '').match(/[\p{L}_][\p{L}\p{N}_.]*|\d+(?:[.,]\d+)?|[-+*/()×÷]/gu) || []; let i = 0;
        const peek = () => toks[i], next = () => toks[i++];
        const atom = () => { const x = next(); if (x === '(') { const v = expr(); if (next() !== ')') throw 0; return v; } if (x === '-') return -atom(); if (x == null) throw 0; if (/^\d/.test(x)) return Number(x.replace(',', '.')); const k = known.has(x) || vals[x] !== undefined ? x : byLabel.get(fold(x)); if (!k) throw 0; const v = num(vals[k]); return Number.isFinite(v) ? v : 0; };
        const term = () => { let v = atom(); while (['*', '/', '×', '÷'].includes(peek())) { const o = next(), w = atom(); v = o === '*' || o === '×' ? v * w : v / w; } return v; };
        const expr = () => { let v = term(); while (['+', '-'].includes(peek())) { const o = next(), w = term(); v = o === '+' ? v + w : v - w; } return v; };
        try { const v = expr(); if (i < toks.length) return NaN; return Number.isFinite(v) ? Math.round(v * 100) / 100 : NaN; } catch (_) { return NaN; }
    };
    let COLS = [];
    const cellVal = (c, stats) => c.calc ? PF.calc(c.formula, stats || {}, COLS) : stats?.[c.key];
    const fmt = v => v === '' || v == null || (typeof v === 'number' && !Number.isFinite(v)) ? '' : String(v).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    ART.ft.sportstats = {label: 'Statistiques', badge: '📊', wide: true, block: true,
        edit: (f, v, ctx) => { const sport = (ctx?.draft || {}).sport, cols = PF.statCols(ctx.store, sport).filter(c => !c.calc), val = v && typeof v === 'object' ? v : {};
            return `<div class="pf-sfwrap" data-pf-statswrap><small class="ar-g">${esc(sport ? sportLabel(sport) : 'Choisis le sport : ses colonnes s’affichent')} · colonnes réglables dans la page (📊 → ⚙️ Colonnes)</small><div class="pf-stgrid">${cols.map(c => `<label class="pf-st"><span>${esc(c.label)}</span><input class="ar-in" data-st="${esc(c.key)}" value="${esc(val[c.key] ?? '')}" inputmode="decimal"></label>`).join('')}</div></div>`; },
        get: el => { const o = {}; el.querySelectorAll('[data-st]').forEach(i => { const v = i.value.trim(); if (v !== '') o[i.dataset.st] = v.slice(0, 40); }); return o; },
        read: (f, v, ctx) => { const val = v && typeof v === 'object' ? v : {}, cols = PF.statCols(ctx.store, ctx.item?.data?.sport).filter(c => c.on); COLS = PF.statCols(ctx.store, ctx.item?.data?.sport); const cells = cols.map(c => [c, cellVal(c, val)]).filter(([, x]) => fmt(x) !== '');
            return cells.length ? `<div class="ar-scroll"><table class="ar-t"><thead><tr>${cells.map(([c]) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody><tr>${cells.map(([, x]) => `<td>${esc(fmt(x))}</td>`).join('')}</tr></tbody></table></div>` : ''; },
        text: (f, v) => Object.entries(v || {}).map(([k, x]) => `${k} ${x}`).join(' · '), empty: v => !v || typeof v !== 'object' || !Object.keys(v).length};
    // le sport change dans le formulaire : ses champs et ses colonnes suivent (ce qui est déjà écrit reste)
    document.addEventListener('change', e => {
        const sel = e.target.closest?.('[data-pf-sport]'); if (!sel) return;
        const form = sel.closest('[data-ar-form]'), C = sel.closest('.ar-dlg')?._C; if (!form || !C) return;
        const draft = {...(C.S.draft || {}), sport: sel.value}, ctx = ART.ctx(C.store, C.current?.() || {kind: C.S.kind, data: draft}, {draft});
        form.querySelectorAll('[data-ft="sportfields"],[data-ft="sportstats"]').forEach(el => { const ft = ART.ft[el.dataset.ft], box = el.querySelector('.pf-sfwrap'); if (!box) return;
            el._pfStash = {...(el._pfStash || {}), ...ft.get(el)}; // ce qui était écrit pour l'autre sport revient si on y retourne
            const tmp = document.createElement('div'); tmp.innerHTML = ft.edit({key: el.dataset.fk}, el._pfStash, ctx); box.replaceWith(tmp.firstElementChild); });
    });

    /* ═════════ Les sortes ═════════ */
    const common = {domain: 'sport', profile: 'sport', sorts: [['year', 'Par date'], ['az', 'A → Z']]};
    const CKIND = opt([['club', 'Club'], ['selection', 'Sélection nationale'], ['selection_r', 'Sélection régionale'], ['universite', 'Université, école'], ['franchise', 'Franchise, équipe pro'], ['ecurie', 'Écurie'], ['autre', 'Autre']]);
    const ARRIVAL = opt([['', '—'], ['formation', 'formé au club'], ['jeune', 'licence jeune'], ['transfert', 'transfert'], ['pret', 'prêt'], ['libre', 'libre'], ['retour', 'retour'], ['autre', 'autre']]);
    const isSel = c => /^selection/.test(c.data.ckind || '');
    ART.define({...common, key: 'sp_club', icon: '🏟', label: 'Club, équipe', many: 'Clubs et équipes', tab: 'Clubs',
        eyebrow: it => isSel(it) ? 'Sélection' : 'Club, équipe', newData: st => ({ckind: 'club', sport: PF.mainSport?.(st) || ''}),
        groups: [{key: 'main', label: 'Le club', icon: '🏟', zone: 'main', fields: [{key: 'title', label: 'Club, équipe', type: 'text', star: true, head: true, ph: 'CA Brive, Équipe de France XV…'},
            {key: 'ckind', label: 'Sorte', type: 'select', star: true, choices: CKIND}, {key: 'sport', label: 'Sport', type: 'sport', star: true}, {key: 'org', label: 'Organisation (fiche)', type: 'item', kinds: ['org'], star: false}, {key: 'place', label: 'Ville', type: 'place', star: true},
            {key: 'date', label: 'De', type: 'date', star: true}, {key: 'end', label: 'À', type: 'date', star: true, ph: 'vide ou « en cours »'},
            {key: 'arrival', label: 'Arrivée', type: 'select', star: true, choices: ARRIVAL}, {key: 'fee', label: 'Montant du transfert', type: 'money', star: false}, {key: 'contract', label: 'Contrat', type: 'text', star: false, ph: '3 ans, professionnel…'},
            {key: 'jersey', label: 'Maillot', type: 'text', star: true}, {key: 'position', label: 'Poste', type: 'text', star: true}, {key: 'matches', label: 'Matchs, sélections', type: 'number', star: true}, {key: 'scored', label: 'Buts, essais, points', type: 'number', star: false}, {key: 'captain', label: 'Capitaine', type: 'bool', star: false}]},
            {key: 'photos', label: 'Photos', zone: 'left', fields: [{key: 'photos', label: 'Photos (équipe, maillot, licence)', type: 'photos', star: true, labels: [['equipe', 'Équipe'], ['maillot', 'Maillot'], ['licence', 'Licence'], ['autre', 'Autre']]}]}, NOTES],
        list: ['photos', 'title', 'ckind', 'date', 'end', 'position', 'matches'], card: ['date', 'position'], cardLine: it => PF.years(it.data.date, it.data.end),
        filters: () => [{id: 'ck', label: 'Sorte', type: 'check', options: CKIND, test: (it, v) => !v.length || v.includes(it.data.ckind || 'club')}]});
    const MEDAL = opt([['', '—'], ['or', '🥇 or'], ['argent', '🥈 argent'], ['bronze', '🥉 bronze']]);
    const RECK = opt([['', '—'], ['personnel', 'personnel'], ['club', 'du club'], ['regional', 'régional'], ['national', 'national'], ['continental', 'continental'], ['mondial', 'du monde'], ['olympique', 'olympique'], ['age', 'd’une catégorie d’âge']]);
    const OUTC = opt([['', '—'], ['V', 'victoire'], ['D', 'défaite'], ['N', 'nul']]);
    const PHASE = opt(['', 'qualifications', 'poule', '1/16', '1/8', '1/4', '1/2', 'finale', 'petite finale', 'barrage']);
    ART.define({...common, key: 'sp_result', icon: '🏁', label: 'Résultat', many: 'Résultats',
        eyebrow: it => `Résultat${it.data.sport ? ` · ${sportLabel(it.data.sport)}` : ''}`, newData: st => ({sport: PF.mainSport?.(st) || ''}),
        groups: [{key: 'main', label: 'La compétition', icon: '🏁', zone: 'main', fields: [{key: 'title', label: 'Compétition', type: 'text', star: true, head: true, ph: 'JO Paris 2024, Tournoi des Six Nations 2018…'},
            {key: 'sport', label: 'Sport', type: 'sport', star: true}, {key: 'edition', label: 'Édition', type: 'text', star: false}, {key: 'date', label: 'Date', type: 'date', star: true}, {key: 'place', label: 'Lieu', type: 'place', star: true},
            {key: 'event', label: 'Épreuve', type: 'text', star: true, ph: 'rugby à 7, 100 m, saut d’obstacles 1,40 m'}, {key: 'category', label: 'Catégorie', type: 'text', star: false, ph: 'seniors, cadettes, -63 kg'}, {key: 'phase', label: 'Tour, phase', type: 'select', star: true, choices: PHASE},
            {key: 'rank', label: 'Classement', type: 'number', star: true}, {key: 'of', label: 'sur', type: 'number', star: true}, {key: 'perf', label: 'Performance (temps, score, distance, points)', type: 'text', star: true},
            {key: 'outcome', label: 'Issue', type: 'select', star: true, choices: OUTC}, {key: 'partners', label: 'Partenaires, coéquipiers', type: 'people', star: false, rolePh: 'doublette, coéquipière…'}]},
            {key: 'honours', label: 'Médaille, titre, record', icon: '🥇', zone: 'main', fields: [{key: 'medal', label: 'Médaille', type: 'select', star: true, choices: MEDAL}, {key: 'title_won', label: 'Titre gagné', type: 'text', star: true, ph: 'Championne de France Élite 1, Grand Chelem'}, {key: 'record', label: 'Record battu', type: 'select', star: true, choices: RECK}]},
            {key: 'sport_f', label: 'Les champs de ce sport', icon: '🏅', zone: 'main', fields: [{key: 'sf', label: 'Champs du sport', type: 'sportfields', star: true}]},
            {key: 'photos', label: 'Photos, vidéo', zone: 'left', fields: [{key: 'photos', label: 'Photos', type: 'photos', star: true, labels: [['podium', 'Podium'], ['action', 'Action'], ['diplome', 'Diplôme'], ['autre', 'Autre']]}, {key: 'video', label: 'Vidéo', type: 'media', star: false, media: ['video']}]},
            {key: 'press', label: 'Presse', icon: '📰', zone: 'right', fields: [{key: 'press', label: 'Presse', type: 'rows', star: false, addLabel: 'Un article', cols: [{key: 'paper', label: 'Journal', w: 'm'}, {key: 'date', label: 'Date', w: 's'}, {key: 'title', label: 'Titre', w: 'l'}]}]}, NOTES],
        list: ['title', 'date', 'event', 'rank', 'perf', 'medal'], card: ['date', 'medal'], cardLine: it => [it.data.date, it.data.rank ? `${it.data.rank}e${it.data.of ? ` sur ${it.data.of}` : ''}` : '', lab(MEDAL, it.data.medal).replace('—', '')].filter(Boolean).join(' · '),
        filters: () => [{id: 'md', label: 'Médaille', type: 'check', options: MEDAL.slice(1), test: (it, v) => !v.length || v.includes(it.data.medal)}, {id: 'oc', label: 'Issue', type: 'check', options: OUTC.slice(1), test: (it, v) => !v.length || v.includes(it.data.outcome)}]});
    ART.define({...common, key: 'sp_record', icon: '⏱', label: 'Record', many: 'Records',
        newData: st => ({sport: PF.mainSport?.(st) || '', rkind: 'personnel'}),
        groups: [{key: 'main', label: 'Le record', icon: '⏱', zone: 'main', fields: [{key: 'title', label: 'Épreuve', type: 'text', star: true, head: true, ph: '100 m cadettes, essais en une saison'},
            {key: 'sport', label: 'Sport', type: 'sport', star: false}, {key: 'perf', label: 'Performance', type: 'text', star: true, ph: '12″14'}, {key: 'rkind', label: 'Sorte', type: 'select', star: true, choices: RECK},
            {key: 'date', label: 'Date', type: 'date', star: true}, {key: 'place', label: 'Lieu', type: 'place', star: true}, {key: 'wind', label: 'Vent', type: 'text', star: false},
            {key: 'homologated', label: 'Homologué', type: 'bool', star: true}, {key: 'by', label: 'Par (fédération)', type: 'text', star: true, ph: 'FFA'}, {key: 'beaten', label: 'Battu le', type: 'date', star: false}, {key: 'beaten_by', label: 'Battu par', type: 'person', star: false}]}, NOTES],
        list: ['title', 'perf', 'rkind', 'date', 'homologated'], cardLine: it => [it.data.perf, lab(RECK, it.data.rkind)].filter(Boolean).join(' · ')});
    ART.define({...common, key: 'sp_season', icon: '📊', label: 'Saison', many: 'Statistiques par saison', fem: true, tab: 'Saisons',
        newData: st => ({sport: PF.mainSport?.(st) || '', scope: 'club'}),
        beforeSave: d => { const y = PF.year(d.season || d.title); if (Number.isFinite(y)) d.year = String(y); },
        groups: [{key: 'main', label: 'La saison', icon: '📊', zone: 'main', fields: [{key: 'title', label: 'Saison', type: 'text', star: true, head: true, ph: '2018-19'},
            {key: 'team', label: 'Équipe', type: 'item', kinds: ['sp_club'], star: true}, {key: 'scope', label: 'Club ou sélection', type: 'select', star: true, choices: [['club', 'Club'], ['selection', 'Sélection']]},
            {key: 'competition', label: 'Compétition', type: 'text', star: false, ph: 'Élite 1, toutes compétitions'}, {key: 'sport', label: 'Sport', type: 'sport', star: true}]},
            {key: 'stats', label: 'Les chiffres', icon: '🔢', zone: 'main', fields: [{key: 'stats', label: 'Statistiques', type: 'sportstats', star: true}]}, NOTES],
        list: ['title', 'team', 'scope', 'stats'], cardLine: it => U.refTitle(it.data.team)});
    // la fiche du profil
    ART.define({key: 'profile_sport', icon: '🏅', label: 'Profil sportif', many: 'Profils', domain: 'profile', hidden: true, linked: false, profile: 'sport',
        eyebrow: () => '🏅 Profil sportif', newData: st => ({title: PF.female(st) ? 'Sportive' : 'Sportif'}),
        groups: [{key: 'main', label: 'Ses sports', icon: '🏅', zone: 'main', fields: [{key: 'title', label: 'En une ligne', type: 'text', star: true, ph: '3e ligne aile, n° 7'},
            {key: 'sports', label: 'Sports pratiqués', type: 'rows', star: true, addLabel: 'Un sport', cols: [{key: 'sport', label: 'Sport', type: 'select', choices: SPORT_CHOICES, w: 'm'}, {key: 'discipline', label: 'Discipline, poste', w: 'm'}, {key: 'jersey', label: 'N°', w: 's'}, {key: 'from', label: 'De', w: 's'}, {key: 'to', label: 'À', w: 's'}, {key: 'level', label: 'Niveau', type: 'select', choices: opt(['', 'loisir', 'régional', 'national', 'international', 'professionnel', 'olympique']), w: 's'}]},
            {key: 'nicknames', label: 'Surnoms', type: 'text', star: false}, {key: 'side', label: 'Latéralité', type: 'select', star: false, choices: opt(['', 'droitier', 'gaucher', 'ambidextre'])}, {key: 'height', label: 'Taille', type: 'text', star: false}, {key: 'weight', label: 'Poids', type: 'text', star: false}]},
            {key: 'licences', label: 'Licences', icon: '🪪', zone: 'main', fields: [{key: 'licences', label: 'Licences', type: 'rows', star: true, addLabel: 'Une licence', cols: [{key: 'fed', label: 'Fédération', w: 'm'}, {key: 'no', label: 'N°', w: 's'}, {key: 'club', label: 'Club', w: 'm'}, {key: 'season', label: 'Saison', w: 's'}]}]},
            {key: 'people', label: 'Entraîneurs, coéquipiers', icon: '🧑‍🏫', zone: 'main', fields: [{key: 'coaches', label: 'Entraîneurs', type: 'people', star: true, rolePh: 'entraîneur, préparateur…'}, {key: 'teammates', label: 'Coéquipiers', type: 'people', star: true, rolePh: 'coéquipière, binôme…'}]},
            {key: 'grades', label: 'Grades (arts martiaux)', icon: '🥋', zone: 'main', fields: [{key: 'grades', label: 'Grades', type: 'rows', star: false, addLabel: 'Un grade', cols: [{key: 'grade', label: 'Grade (ceinture, dan)', w: 'm'}, {key: 'date', label: 'Date', w: 's'}, {key: 'jury', label: 'Jury', type: 'person', w: 'm'}, {key: 'club', label: 'Club', w: 'm'}]}]},
            {key: 'elo', label: 'Classement Elo (échecs, jeux)', icon: '♟', zone: 'main', fields: [{key: 'elo', label: 'Elo', type: 'rows', star: false, addLabel: 'Un classement', cols: [{key: 'date', label: 'Date', w: 's'}, {key: 'elo', label: 'Elo', w: 's'}, {key: 'list', label: 'Liste (FIDE, FFE…)', w: 'm'}, {key: 'title', label: 'Titre (MI, GMI…)', w: 's'}]}]},
            {key: 'body', label: 'Blessures, équipement, reconversion', icon: '🩹', zone: 'main', fields: [{key: 'injuries', label: 'Blessures', type: 'rows', star: true, addLabel: 'Une blessure', cols: [{key: 'date', label: 'Date', w: 's'}, {key: 'what', label: 'Blessure', w: 'l'}, {key: 'length', label: 'Durée', w: 's'}]},
                {key: 'equipment', label: 'Équipement, sponsors', type: 'text', star: false}, {key: 'after', label: 'Reconversion', type: 'longtext', star: true}]},
            {key: 'ids', label: 'Bases et liens', icon: '🔗', zone: 'right', fields: [{key: 'links', label: 'Liens (fédération, World Athletics, FIDE…)', type: 'rows', star: true, addLabel: 'Un lien', cols: [{key: 'label', label: 'Nom', w: 'm'}, {key: 'url', label: 'Adresse', type: 'url', w: 'l'}]}]}, NOTES]});

    /* ═════════ Les sections de la page ═════════ */
    const S = ART.pageSections, K = 'sport';
    const fiche = st => st.of('profile_sport')[0] || null;
    const sortY = l => [...l].sort((a, b) => (PF.year(a.data.date) || 9999) - (PF.year(b.data.date) || 9999));
    const open = (it, txt) => `<button type="button" class="ar-linkbtn" data-ar-open="${it.id}">${txt}</button>`;
    /** le sport principal : le premier de la fiche, sinon le plus fréquent */
    PF.mainSport = st => { const f = fiche(st)?.data?.sports?.find(r => r.sport)?.sport; if (f) return f; const n = {}; ['sp_club', 'sp_season', 'sp_result'].forEach(k => st.of(k).forEach(i => { if (i.data.sport) n[i.data.sport] = (n[i.data.sport] || 0) + 1; })); return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || ''; };
    const sportsOf = st => [...new Set([...(fiche(st)?.data?.sports || []).map(r => r.sport), ...['sp_club', 'sp_season', 'sp_result'].flatMap(k => st.of(k).map(i => i.data.sport))].filter(Boolean))];
    S.sp_clubs = {icon: '🏟', label: 'Clubs et équipes', w: 'ligne', profile: K, render: C => {
        const l = sortY(C.store.of('sp_club'));
        const body = l.length ? `<div class="ar-scroll"><table class="ar-t pf-t"><thead><tr><th>Club</th><th>Dates</th><th>Arrivée</th><th>Maillot</th><th>Poste</th><th>Matchs</th></tr></thead><tbody>${l.map(c => { const d = c.data;
            return `<tr><td><button type="button" class="ar-ochip is-link" data-ar-open="${c.id}"><i>${isSel(c) ? '🇫🇷' : '🏟'}</i>${esc(c.title)}</button>${isSel(c) ? ' <small class="ar-g">sélection</small>' : ''}${d.captain ? ' <small class="ar-g">(C)</small>' : ''}</td><td>${esc(PF.years(d.date, d.end))}</td><td>${esc([lab(ARRIVAL, d.arrival).replace('—', ''), d.contract && `contrat ${d.contract}`, d.fee && U.money(d.fee)].filter(Boolean).join(' · ') || '—')}</td><td>${esc(d.jersey || '—')}</td><td>${esc(d.position || '—')}</td><td>${esc(fmt(d.matches) || '—')}</td></tr>`; }).join('')}</tbody></table></div>`
            : PF.muted('Aucun club noté : clubs, équipes, sélections… « ＋ Ajouter ».');
        return {body, count: l.length || '', empty: !l.length, actions: `${PF.newBtn('sp_club')}${l.length ? PF.allBtn('sp_club') : ''}`};
    }};
    const medalHtml = r => { const m = r.data.medal; return m ? `<span class="pf-medal ${m === 'or' ? 'o' : m === 'argent' ? 'a' : 'b'}">${m === 'or' ? 1 : m === 'argent' ? 2 : 3}</span>` : ''; };
    S.sp_medals = {icon: '🥇', label: 'Médailles et titres', w: '½', profile: K, render: C => {
        const l = sortY(C.store.of('sp_result')), med = l.filter(r => r.data.medal).sort((a, b) => ({or: 0, argent: 1, bronze: 2}[a.data.medal] - {or: 0, argent: 1, bronze: 2}[b.data.medal]) || (PF.year(b.data.date) || 0) - (PF.year(a.data.date) || 0));
        const titles = new Map(); l.filter(r => r.data.title_won && !r.data.medal).forEach(r => { const k = r.data.title_won.trim(); titles.set(k, [...(titles.get(k) || []), r]); });
        const body = med.map(r => `<div class="pf-mline">${medalHtml(r)}${open(r, `<b>${esc(r.title)}</b>`)}${r.data.event ? ` · ${esc(r.data.event)}` : ''} · ${esc(lab(MEDAL, r.data.medal).replace(/^\S+\s/, ''))}${r.data.title_won ? ` · ${esc(r.data.title_won)}` : ''}</div>`).join('')
            + [...titles.entries()].map(([k, rs]) => `<div class="pf-mline">🏆 ${esc(k)} : ${rs.map(r => open(r, esc(PF.year(r.data.date) || r.data.date || '?'))).join(', ')}</div>`).join('');
        const aw = ext.awards?.listFor ? PF.later(C, 'aw_sport', () => ext.awards.listFor(C.pid, {category: 'sport'})) : [];
        const more = aw?.length ? `<div class="pf-sec"><small class="ar-g">🏆 Palmarès (bloc « Concours et récompenses »)</small>${ext.awards.tableHtml(aw.slice(0, 5), C.pid)}</div>` : '';
        return {body: (body + more) || PF.muted('Aucune médaille ni titre : ils viennent des résultats (« Médaille », « Titre gagné ») et du bloc « 🏆 Concours et récompenses ».'), count: med.length + titles.size + (aw?.length || 0) || '', empty: !body && !more, actions: PF.newBtn('sp_result', '＋')};
    }};
    S.sp_records = {icon: '⏱', label: 'Records', w: '½', profile: K, render: C => {
        const l = sortY(C.store.of('sp_record'));
        return {body: l.length ? `<div class="ar-scroll"><table class="ar-t pf-t"><thead><tr><th>Épreuve</th><th>Perf.</th><th>Sorte</th><th>Homologué</th></tr></thead><tbody>${l.map(r => `<tr><td>${open(r, esc(r.title))}</td><td><b>${esc(r.data.perf || '')}</b></td><td>${esc([lab(RECK, r.data.rkind).replace('—', ''), U.placeTitle(r.data.place), PF.year(r.data.date) || ''].filter(Boolean).join(' '))}</td><td>${r.data.homologated ? `✓ ${esc(r.data.by || '')}` : '—'}</td></tr>`).join('')}</tbody></table></div>` : PF.muted('Aucun record noté.'),
            count: l.length || '', empty: !l.length, actions: `${PF.newBtn('sp_record', '＋')}${l.length ? PF.allBtn('sp_record') : ''}`};
    }};
    S.sp_stats = {icon: '📊', label: 'Statistiques par saison', w: 'ligne', profile: K, render: (C, sec) => {
        const st = C.store, all = st.of('sp_season'), sports = [...new Set(all.map(s => s.data.sport).filter(Boolean))], tab = PF.state.sp_stats || 'club';
        const sport = PF.state.sp_sport && sports.includes(PF.state.sp_sport) ? PF.state.sp_sport : (sports.includes(PF.mainSport(st)) ? PF.mainSport(st) : sports[0] || PF.mainSport(st));
        const l = [...all.filter(s => !sport || !s.data.sport || s.data.sport === sport)].sort((a, b) => String(a.data.title || a.title).localeCompare(String(b.data.title || b.title), 'fr', {numeric: true}));
        const cols = PF.statCols(st, sport).filter(c => c.on); COLS = PF.statCols(st, sport);
        const sum = list => { const o = {}; cols.filter(c => !c.calc).forEach(c => { const xs = list.map(s => num(s.data.stats?.[c.key])).filter(Number.isFinite); if (xs.length) o[c.key] = /elo|ranking|best|grade/.test(c.key) ? Math.max(...xs) : Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100; }); return o; };
        const rowsOf = tab === 'total' ? [['Club', sum(l.filter(s => s.data.scope !== 'selection'))], ['Sélection', sum(l.filter(s => s.data.scope === 'selection'))], ['Total', sum(l)]].filter(([, o]) => Object.keys(o).length).map(([n, o]) => ({label: n, team: '', stats: o}))
            : l.filter(s => (tab === 'selection') === (s.data.scope === 'selection')).map(s => ({it: s, label: s.data.title || s.title, team: U.refTitle(s.data.team) || s.data.competition || '', stats: s.data.stats || {}}));
        const max = {}; cols.forEach(c => { const xs = rowsOf.map(r => num(cellVal(c, r.stats))).filter(Number.isFinite); if (xs.length > 1 && tab !== 'total') max[c.key] = Math.max(...xs); });
        const head = `<span class="ui-filters pf-filt">${[['club', 'Club'], ['selection', 'Sélection'], ['total', 'Total']].map(([k, n]) => `<button type="button" class="${tab === k ? 'is-active' : ''}" data-pf-state="sp_stats:${k}">${n}</button>`).join('')}</span>${sports.length > 1 ? `<span class="ui-filters pf-filt">${sports.map(s => `<button type="button" class="${s === sport ? 'is-active' : ''}" data-pf-state="sp_sport:${esc(s)}">${esc(sportIcon(s))} ${esc(sportLabel(s))}</button>`).join('')}</span>` : ''}`;
        const body = rowsOf.length ? `<div class="ar-scroll"><table class="ar-t pf-t pf-stats"><thead><tr><th>Saison</th>${tab === 'total' ? '' : '<th>Équipe</th>'}${cols.map(c => `<th>${esc(c.label)}${c.calc ? ' <small>🧮</small>' : ''}</th>`).join('')}</tr></thead><tbody>${rowsOf.map(r => `<tr><td>${r.it ? open(r.it, esc(r.label)) : `<b>${esc(r.label)}</b>`}</td>${tab === 'total' ? '' : `<td>${esc(r.team)}</td>`}${cols.map(c => { const v = cellVal(c, r.stats); return `<td>${num(v) === max[c.key] ? `<b>${esc(fmt(v))}</b>` : esc(fmt(v))}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`
            : PF.muted(all.length ? 'Rien pour ce choix (club, sélection).' : 'Aucune saison : une fiche par saison, avec les colonnes de son sport.');
        return {body, count: all.length || '', empty: !all.length, head: `<small class="ar-g">colonnes selon le sport</small>${head}`, actions: `<button type="button" class="button small secondary" data-pf-cols="${esc(sport || '')}" title="Les colonnes de ce sport : afficher, ranger, ajouter, calculer">⚙️ Colonnes</button>${PF.newBtn('sp_season', '＋')}`};
    }};
    S.sp_results = {icon: '🏁', label: 'Résultats', w: '⅓', profile: K, render: C => {
        const l = C.store.of('sp_result'), n = k => l.filter(r => r.data.outcome === k).length, by = PF.state.sp_by === '1';
        const comp = new Map(); l.forEach(r => { const k = (r.title || '').replace(/\s*\d{4}.*$/, '').trim() || 'Autre'; const o = comp.get(k) || {n: 0, V: 0, D: 0, N: 0}; o.n++; if (r.data.outcome) o[r.data.outcome]++; comp.set(k, o); });
        const matches = C.store.of('sp_season').reduce((t, s) => t + (num(s.data.stats?.matches) || 0), 0);
        return {body: l.length || matches ? `<p>${esc(plural(Math.max(l.length, matches), 'match', 'matchs'))} · ${PF.res(`V ${n('V')}`, 'w')} ${PF.res(`D ${n('D')}`, 'l')} N ${n('N')} · <button type="button" class="ar-linkbtn" data-pf-state="sp_by:${by ? '0' : '1'}">par compétition ${by ? '▾' : '▸'}</button></p>${by ? [...comp.entries()].map(([k, o]) => `<div>${esc(k)} · ${o.n} <small class="ar-g">(V ${o.V} · D ${o.D} · N ${o.N})</small></div>`).join('') : ''}` : PF.muted('Aucun résultat noté.'),
            count: l.length || '', empty: !l.length && !matches, actions: `${PF.newBtn('sp_result', '＋')}${l.length ? PF.allBtn('sp_result') : ''}`};
    }};
    S.sp_people = {icon: '🧑‍🏫', label: 'Entraîneurs · coéquipiers', w: '⅓', profile: K, render: C => {
        const st = C.store, it = fiche(st), ctx = it ? ART.ctx(st, it) : null, co = ART.normPeople(ART.arr(it?.data?.coaches)), tm = ART.normPeople(ART.arr(it?.data?.teammates));
        const extra = new Set(st.of('sp_result').flatMap(r => ART.normPeople(ART.arr(r.data.partners)).map(p => p.pid || p.txt))).size;
        return {body: co.length || tm.length || extra ? `${co.slice(0, 2).map(p => U.personChip(p, p.role || 'entraîneur', ctx)).join(' ')}${co.length > 2 ? ` + ${co.length - 2}` : ''}<br>${tm.length || extra ? `<small class="ar-g">${esc(plural(Math.max(tm.length, extra), PF.female(st) ? 'coéquipière' : 'coéquipier'))}</small> ${tm.slice(0, 3).map(p => U.personChip(p, p.role, ctx)).join(' ')}` : ''}` : PF.muted('Entraîneurs et coéquipiers : « … » pour les noter.'), empty: !co.length && !tm.length && !extra, actions: PF.editBtn(K)};
    }};
    S.sp_body = {icon: '🩹', label: 'Blessures · équipement · reconversion', w: '⅓', profile: K, render: C => {
        const d = fiche(C.store)?.data || {}, inj = d.injuries || [];
        const parts = [inj.map(r => `${esc(r.what || '')}${r.date ? ` ${esc(PF.year(r.date) || r.date)}` : ''}${r.length ? ` (${esc(r.length)})` : ''}`).join(' · '), d.equipment && `🎽 ${esc(d.equipment)}`, d.after && `🔁 ${esc(d.after).replace(/\n/g, '<br>')}`].filter(Boolean);
        return {body: parts.length ? parts.map(x => `<div>${x}</div>`).join('') : PF.muted('Blessures, équipement, reconversion : « … » pour les noter.'), empty: !parts.length, actions: PF.editBtn(K)};
    }};
    S.sp_sports = {icon: '🏅', label: 'Sports pratiqués', w: '⅓', profile: K, render: C => {
        const st = C.store, rows = fiche(st)?.data?.sports || [], l = rows.length ? rows : sportsOf(st).map(s => ({sport: s}));
        return {body: l.length ? l.map(r => `<div>${esc(sportIcon(r.sport))} <b>${esc(sportLabel(r.sport) || r.sport || '?')}</b>${r.discipline ? ` · ${esc(r.discipline)}` : ''}${r.jersey ? ` · n° ${esc(r.jersey)}` : ''}${PF.years(r.from, r.to) ? ` <small class="ar-g">${esc(PF.years(r.from, r.to))}</small>` : ''}${r.level ? ` <small class="ar-g">${esc(r.level)}</small>` : ''}</div>`).join('') : PF.muted('Choisis ses sports : « … ».'), empty: !l.length, actions: PF.editBtn(K)};
    }};
    S.sp_grades = {icon: '🥋', label: 'Grades', w: '⅓', profile: K, render: C => {
        const st = C.store, it = fiche(st), l = it?.data?.grades || [], ctx = it ? ART.ctx(st, it) : null;
        return {body: l.length ? l.map(r => `<div><b>${esc(r.grade || '')}</b> ${esc(r.date || '')}${r.jury ? ` · jury ${U.personChip(r.jury, '', ctx)}` : ''}${r.club ? ` · ${esc(r.club)}` : ''}</div>`).join('') : PF.muted('Ceintures, dan : « … » pour les noter.'), empty: !l.length, actions: PF.editBtn(K)};
    }};
    S.sp_elo = {icon: '♟', label: 'Classement Elo', w: '½', profile: K, render: C => {
        const l = (fiche(C.store)?.data?.elo || []).map(r => ({...r, y: PF.year(r.date), v: num(r.elo)})).filter(r => Number.isFinite(r.v)).sort((a, b) => (a.y || 0) - (b.y || 0));
        if (!l.length) return {body: PF.muted('Les classements Elo (date, Elo) dessinent la courbe.'), empty: true, actions: PF.editBtn(K)};
        const w = 300, h = 90, lo = Math.min(...l.map(r => r.v)) - 20, hi = Math.max(...l.map(r => r.v)) + 20, x = i => l.length > 1 ? 10 + i * (w - 20) / (l.length - 1) : w / 2, y = v => h - 10 - (v - lo) / (hi - lo) * (h - 20);
        const titles = [...new Set(l.map(r => r.title).filter(Boolean))];
        return {body: `<svg class="pf-elo" viewBox="0 0 ${w} ${h}" role="img" aria-label="Courbe Elo"><polyline points="${l.map((r, i) => `${x(i).toFixed(1)},${y(r.v).toFixed(1)}`).join(' ')}" fill="none" stroke="currentColor" stroke-width="2"/>${l.map((r, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(r.v).toFixed(1)}" r="3"><title>${esc(`${r.date || ''} : ${r.v}`)}</title></circle>`).join('')}</svg><small class="ar-g">max ${Math.max(...l.map(r => r.v))}${titles.length ? ` · ${esc(titles.join(', '))}` : ''}</small>`, count: l.length, actions: PF.editBtn(K)};
    }};

    /* ═════════ ⚙️ Colonnes d'un sport (statistiques) ═════════ */
    function openCols(C, sport) {
        const aside = C.dlg.querySelector('[data-ar-panel]'); aside.hidden = false; C.dlg.classList.add('has-panel');
        const close = () => { aside.hidden = true; aside.innerHTML = ''; C.panel = null; C.dlg.classList.remove('has-panel'); };
        C.panel = {close, page: true, refresh: () => paint()};
        const st = C.store, key = sport || '_';
        const cfg = () => { const tg = PF.tgtOf(st); tg.sportcols = tg.sportcols || {}; const c = tg.sportcols[key] = tg.sportcols[key] || {}; const cur = PF.statCols(st, sport); c.order = c.order || cur.map(x => x.key); c.off = c.off || cur.filter(x => !x.on).map(x => x.key); c.custom = c.custom || []; c.calc = c.calc || []; return c; };
        const save = async () => { st.settings = st.personSet?.own ? st.personSet : st.global; try { await ART.persistSettings(st); } catch (e) { A().toast(e.message, 'error'); } C.paint(false); paint(); };
        function paint() {
            const cols = PF.statCols(st, sport);
            aside.innerHTML = `<div class="ar-ph"><b>⚙️ Colonnes · ${esc(sport ? sportLabel(sport) : 'tous sports')}</b><span class="spacer"></span><button type="button" class="icon-button small" data-c-close aria-label="Fermer">×</button></div><div class="ar-pbody">
                <p class="ar-phelp">👁 pour cacher une colonne, ↑ ↓ pour ranger. Tes colonnes : ✎ pour renommer, 🗑 pour retirer (les chiffres déjà écrits restent dans les fiches).</p>
                <div class="ar-plist">${cols.map((c, i) => `<div class="ar-fr ${c.on ? '' : 'off'} ${c.custom || c.calc ? 'cust' : ''}" data-ck="${esc(c.key)}"><span class="ar-grip">⠿</span><button type="button" class="ar-eye" data-c-eye title="${c.on ? 'Cacher' : 'Montrer'}">${c.on ? '👁' : '🚫'}</button><span class="lbl">${esc(c.label)}${c.calc ? ` <small class="ar-g">= ${esc(c.formula)}</small>` : ''}</span><span class="ty">${c.calc ? 'calculée' : c.custom ? 'perso' : 'nombre'}</span><span class="tools"><button type="button" data-c-mv="-1" ${i ? '' : 'disabled'} title="Monter">↑</button><button type="button" data-c-mv="1" ${i < cols.length - 1 ? '' : 'disabled'} title="Descendre">↓</button>${c.custom || c.calc ? '<button type="button" data-c-ren title="Renommer">✎</button><button type="button" data-c-del title="Retirer">🗑</button>' : ''}</span></div>`).join('')}</div>
                <div class="ar-pbtns"><button type="button" class="button small secondary" data-c-add>＋ Ajouter une colonne</button><button type="button" class="button small secondary" data-c-calc>🧮 Colonne calculée</button></div>
                <p class="ar-phelp">Une colonne calculée : une formule avec les noms des colonnes (${esc(cols.filter(c => !c.calc).map(c => c.label).join(', '))}), ex. « Points / Matchs ».</p>
                <div class="pf-side"><b>🏅 Tous les sports, chacun ses champs</b><div class="pf-kinds">${Object.values(FAM).map(F => `<div><b>${esc(F.label)}</b>${esc(F.fields.map(f => f.label).join(', '))}</div>`).join('')}</div><p class="ar-phelp">${SPORTS.length} sports en liste ; un sport qui manque : choisis le plus proche et ajoute tes colonnes.</p></div></div>`;
        }
        aside.onclick = async e => {
            const b = e.target.closest('button'); if (!b) return; const k = b.closest('[data-ck]')?.dataset.ck;
            if (b.hasAttribute('data-c-close')) return close();
            if (b.hasAttribute('data-c-eye')) { const c = cfg(); c.off = c.off.includes(k) ? c.off.filter(x => x !== k) : [...c.off, k]; return save(); }
            if (b.dataset.cMv) { const c = cfg(), i = c.order.indexOf(k), j = i + Number(b.dataset.cMv); if (i < 0 || j < 0 || j >= c.order.length) return; [c.order[i], c.order[j]] = [c.order[j], c.order[i]]; return save(); }
            if (b.hasAttribute('data-c-del')) { const c = cfg(), old = clone({custom: c.custom, calc: c.calc}); c.custom = c.custom.filter(x => x.key !== k); c.calc = c.calc.filter(x => x.key !== k); c.order = c.order.filter(x => x !== k); await save();
                A().undoToast('Colonne retirée', {undo: async () => { const c2 = cfg(); c2.custom = old.custom; c2.calc = old.calc; if (!c2.order.includes(k)) c2.order.push(k); await save(); }}); return; }
            if (b.hasAttribute('data-c-ren')) { const c = cfg(), x = [...c.custom, ...c.calc].find(y => y.key === k); const n = await A().askText({title: '✎ Renommer la colonne', value: x?.label || '', okLabel: 'Renommer'}); if (!n?.trim() || !x) return; x.label = n.trim().slice(0, 30); return save(); }
            if (b.hasAttribute('data-c-add')) { const n = await A().askText({title: '＋ Ajouter une colonne', message: 'Son nom (ex. « Plaquages »). Les chiffres s’écrivent dans chaque saison.', value: '', okLabel: 'Ajouter'}); if (!n?.trim()) return; const c = cfg(), ck = `x_${U.slug(n).slice(0, 20)}`; if (PF.statCols(st, sport).some(x => x.key === ck)) return A().toast('Cette colonne existe déjà.', 'error'); c.custom.push({key: ck, label: n.trim().slice(0, 30)}); c.order.push(ck); return save(); }
            if (b.hasAttribute('data-c-calc')) {
                const keys = PF.statCols(st, sport).filter(c => !c.calc).map(c => c.label).join(', ');
                ext.openDialog({eyebrow: '⚙️ COLONNES', title: '🧮 Colonne calculée', submitLabel: 'Ajouter', body: `<label class="pf-fld">Nom<input name="label" maxlength="30" placeholder="Points par match" required></label><label class="pf-fld">Formule<input name="formula" maxlength="120" placeholder="Points / Matchs" required></label><p class="pf-small">Avec + − * / et des parenthèses. Colonnes : ${esc(keys)}.</p>`,
                    onSubmit: async form => { const label = form.elements.label.value.trim(), formula = form.elements.formula.value.trim(); if (!label || !formula) return false;
                        const test = PF.calc(formula, Object.fromEntries(PF.statCols(st, sport).map(c => [c.key, 1])), PF.statCols(st, sport)); if (!Number.isFinite(test) && !/\/\s*0/.test(formula)) { A().toast('Formule incomprise : vérifie les noms des colonnes et les parenthèses.', 'error'); return false; }
                        const c = cfg(), ck = `k_${U.slug(label).slice(0, 20)}`; c.calc = [...c.calc.filter(x => x.key !== ck), {key: ck, label: label.slice(0, 30), formula}]; if (!c.order.includes(ck)) c.order.push(ck); await save(); return true; }});
            }
        };
        paint();
    }
    const clone = o => JSON.parse(JSON.stringify(o ?? null));
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-pf-cols]'); if (!b) return; const C = b.closest('.ar-dlg')?._C; if (!C) return; e.preventDefault(); e.stopPropagation(); openCols(C, b.dataset.pfCols); }, true);

    /* ═════════ Le profil : modèles, en-tête, frise ═════════ */
    const ALL = ['pf_frise', 'sp_clubs', 'sp_medals', 'sp_records', 'sp_stats', 'sp_results', 'sp_people', 'sp_body', 'sp_sports', 'sp_grades', 'sp_elo'];
    const M = {
        collectif: {label: 'Sport collectif', order: ALL, hidden: ['sp_grades', 'sp_elo', 'sp_sports']},
        individuel: {label: 'Sport individuel', order: ['pf_frise', 'sp_medals', 'sp_records', 'sp_results', 'sp_stats', 'sp_clubs', 'sp_people', 'sp_body', 'sp_sports', 'sp_grades', 'sp_elo'], hidden: ['sp_grades', 'sp_elo']},
        combat: {label: 'Combat · arts martiaux', order: ['pf_frise', 'sp_medals', 'sp_grades', 'sp_results', 'sp_clubs', 'sp_records', 'sp_stats', 'sp_people', 'sp_body', 'sp_sports', 'sp_elo'], hidden: ['sp_elo', 'sp_records']},
        echecs: {label: 'Échecs · jeux', order: ['pf_frise', 'sp_elo', 'sp_medals', 'sp_results', 'sp_clubs', 'sp_stats', 'sp_people', 'sp_sports', 'sp_records', 'sp_body', 'sp_grades'], hidden: ['sp_grades', 'sp_body', 'sp_records']},
        loisir: {label: 'Sportif amateur', order: ['sp_sports', 'sp_clubs', 'sp_medals', 'sp_results', 'pf_frise', 'sp_people', 'sp_records', 'sp_stats', 'sp_body', 'sp_grades', 'sp_elo'], hidden: ['sp_stats', 'sp_grades', 'sp_elo', 'sp_records']},
    };
    const MODEL_OF = {collectif: 'collectif', raquette: 'individuel', individuel: 'individuel', cyclisme: 'individuel', equestre: 'individuel', martial: 'combat', combat: 'combat', echecs: 'echecs', meca: 'individuel', nautique: 'individuel', alpin: 'individuel', esport: 'echecs', precision: 'individuel'};
    const hero = C => {
        const st = C.store, f = PF.female(st), sports = sportsOf(st), d = fiche(st)?.data || {}, clubs = st.of('sp_club'), sel = clubs.filter(isSel).reduce((t, c) => t + (num(c.data.matches) || 0), 0);
        const res = st.of('sp_result'), med = res.filter(r => r.data.medal), intl = med.filter(r => /jo\b|olymp|monde|europe|six nations|world|international/i.test(`${r.title} ${r.data.event || ''}`)).length, rec = st.of('sp_record');
        const recBest = rec.map(r => r.data.rkind).find(k => ['mondial', 'olympique', 'continental', 'national', 'regional'].includes(k));
        return {eyebrow: `${sports[0] ? sportIcon(sports[0]) : '🏅'} ${f ? 'SPORTIVE' : 'SPORTIF'}${sports.length ? ` · ${sports.map(sportLabel).join(' ET ')}` : ''}`.toLocaleUpperCase('fr-FR'),
            sub: [PF.life(st), d.title && !/^sporti(f|ve)$/i.test(d.title) ? d.title : ''].filter(Boolean).join(' · '),
            summary: [clubs.filter(c => !isSel(c)).length && plural(clubs.filter(c => !isSel(c)).length, 'club'), sel && plural(sel, 'sélection'), med.length && (intl ? plural(intl, 'médaille internationale', 'médailles internationales') : plural(med.length, 'médaille')), rec.length && (recBest ? `${plural(rec.filter(r => r.data.rkind === recBest).length, `record ${lab(RECK, recBest)}`, `records ${lab(RECK, recBest)}s`)}` : plural(rec.length, 'record'))].filter(Boolean).join(' · '),
            links: (d.links || []).map(x => ({label: x.label, url: x.url, icon: '🔗'}))};
    };
    const COLORS = ['#8a8f99', '#1aa34a', '#d0182f', '#3c78d8', '#e1a500', '#7b2ff7'];
    const timeline = C => {
        const st = C.store, rows = [], clubs = sortY(st.of('sp_club'));
        const bars = l => l.map((c, i) => { const sp = PF.span(c.data.date, c.data.end); return sp ? {a: sp[0], b: sp[1], text: c.title, id: c.id, color: COLORS[i % COLORS.length]} : null; }).filter(Boolean);
        const cl = bars(clubs.filter(c => !isSel(c))); if (cl.length) rows.push({label: 'Clubs', bars: cl});
        clubs.filter(isSel).forEach(c => { const b = bars([c]); if (b.length) rows.push({label: c.title, bars: b.map(x => ({...x, text: c.data.matches ? plural(num(c.data.matches) || 0, 'sélection') : x.text, color: '#055dff'}))}); });
        const med = st.of('sp_result').filter(r => r.data.medal).map(r => { const y = PF.year(r.data.date); return Number.isFinite(y) ? {a: y, b: y, text: r.title, id: r.id, color: r.data.medal === 'or' ? '#c9a227' : r.data.medal === 'argent' ? '#9aa0a6' : '#b87333'} : null; }).filter(Boolean);
        if (med.length) rows.push({label: 'Médailles', bars: med});
        const inj = (fiche(st)?.data?.injuries || []).map(r => { const y = PF.year(r.date); return Number.isFinite(y) ? {a: y, b: y, text: r.what || 'blessure', color: '#d0182f'} : null; }).filter(Boolean);
        if (inj.length) rows.push({label: 'Blessures', bars: inj});
        return rows;
    };
    ART.profiles.sport = {key: 'sport', label: 'Sportif · athlète', short: 'Sport', icon: '🏅', color: '#1aa34a', group: 'aventure', kinds: ['sp_club', 'sp_result', 'sp_record', 'sp_season'], type: 'profile_sport', desc: 'clubs, sélections, résultats, records, médailles, statistiques', models: M, timeline, hero,
        defaultModel: st => MODEL_OF[famOf(PF.mainSport(st))] || 'collectif', icons: st => sportsOf(st).map(sportIcon),
        organizerNote: '<b>🏁 Un résultat</b> : compétition (édition, lieu 📍, dates) · épreuve · catégorie · date · tour / phase · classement « 3e sur 48 » · performance (temps, score, distance, points) · adversaire ou équipe adverse · partenaires 👤 · médaille · record battu · photo, vidéo, presse 📰 — et les champs propres au sport (cheval 🐾 pour l’équitation, grades pour le judo, Elo pour les échecs…).',
        sub: st => sportsOf(st).slice(0, 2).map(sportLabel).join(', ')};
})();
