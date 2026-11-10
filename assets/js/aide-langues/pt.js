/* 📜 Aide à la lecture — Portugais (registres paroissiaux du Portugal et du Brésil : « assentos » de baptême, mariage, décès).
 * Format : aide-langues/README-format.md. Sources : voir `sources` en bas (mots vérifiés dans ces listes ; rien d'inventé). */
(function (def) {
    if (typeof module === 'object' && module.exports) module.exports = def;
    if (typeof window !== 'undefined') (window.LCNDA_AIDE_LANGS = window.LCNDA_AIDE_LANGS || []).push(def);
})((() => {
    const R = (k, a, rows) => rows.map(([t, d, ex, alt]) => ({t, d, k, a, ex: ex || '', alt: alt || []}));
    return {
        code: 'pt', name: 'Portugais', native: 'Português', icon: '🇵🇹', script: 'latine', dir: 'ltr', ocr: ['por'],
        intro: 'Registres paroissiaux (« livros de registo paroquial ») du Portugal, du Brésil et des anciennes colonies ; chaque acte s’appelle un « assento ». Les curés écrivent la date en toutes lettres et abrègent beaucoup (fº, Frega, q.).',
        translit: null,
        entries: [
            ...R('mot', 'bapteme', [
                ['baptizei, baptizou-se, baptisei', 'j’ai baptisé, a été baptisé', '« baptizei solenemente e pus os Santos Óleos »'],
                ['baptismo, batismo, baptizado', 'baptême, baptisé'], ['nasceu, nascido, nascida', 'est né, né, née'],
                ['filho legítimo, filha legítima', 'fils légitime, fille légitime (de parents mariés)'], ['filho natural', 'enfant naturel, né hors mariage'],
                ['exposto, exposta', 'enfant trouvé, abandonné (déposé à la « roda », le tour)'], ['enjeitado', 'enfant abandonné'],
                ['padrinho', 'parrain'], ['madrinha', 'marraine'], ['padrinhos', 'parrain et marraine'], ['afilhado, afilhada', 'filleul, filleule'],
                ['neto paterno, neta paterna', 'petit-fils, petite-fille du côté du père (les grands-parents paternels sont nommés ensuite)'],
                ['neto materno, neta materna', 'petit-fils, petite-fille du côté de la mère'],
                ['gémeos, gêmeos', 'jumeaux'], ['em perigo de vida', 'en danger de mort (baptême d’urgence)'],
                ['Santos Óleos', 'les saintes huiles (rite du baptême)'],
            ]),
            ...R('mot', 'mariage', [
                ['casamento, matrimónio, matrimônio', 'mariage'], ['receberam-se, se receberam', 'se sont mariés (« se sont reçus » l’un l’autre)'],
                ['contraente, nubente', 'l’un des époux qui se marient'], ['noivo, noiva', 'fiancé, fiancée ; le marié, la mariée'],
                ['solteiro, solteira', 'célibataire, jamais marié(e)'], ['viúvo, viúva', 'veuf, veuve'], ['viúvo que ficou de', 'veuf de (le nom de la première épouse suit)'],
                ['banhos, proclamas, denunciações', 'les bans (annonces du mariage à la messe)'], ['impedimento', 'empêchement'],
                ['dispensa', 'dispense (de l’Église)'], ['parentesco, consanguinidade', 'parenté, consanguinité'], ['afinidade', 'parenté par alliance'],
                ['testemunhas', 'témoins'], ['bênçãos nupciais', 'la bénédiction nuptiale'],
            ]),
            ...R('mot', 'deces', [
                ['faleceu, falecido, falecida', 'est mort, mort(e), défunt(e)'], ['óbito', 'décès'], ['defunto, defunta', 'défunt, défunte'],
                ['sepultado, sepultada', 'enterré(e)'], ['jaz', 'gît, repose (sur les tombes)'], ['cemitério', 'cimetière'], ['adro', 'parvis, cimetière autour de l’église'],
                ['sacramentos, recebeu os sacramentos', 'les sacrements ; a reçu les derniers sacrements'], ['sem sacramentos', 'sans les sacrements (mort soudaine)'],
                ['fez testamento, não fez testamento', 'a fait un testament, n’a pas fait de testament'], ['herdeiro, herdeira', 'héritier, héritière'],
                ['amortalhado', 'enseveli, mis dans son linceul (« em hábito de S. Francisco » : avec la robe de saint François)'],
                ['anjinho, inocente, párvulo', 'petit enfant mort (« petit ange »)'], ['encomendado', 'recommandé à Dieu (prières des morts)'],
            ]),
            ...R('mot', 'general', [
                ['assento', 'l’acte (inscription dans le registre)'], ['termo', 'l’acte, la mention ; aussi territoire d’une ville (« termo de »)'],
                ['freguesia', 'paroisse'], ['paróquia', 'paroisse'], ['lugar, aldeia', 'lieu-dit, village'], ['concelho', 'commune, municipalité'], ['bispado, diocese', 'diocèse'],
                ['natural de', 'né à, originaire de'], ['morador, moradora', 'habitant, qui demeure (« morador no lugar de… »)'], ['nesta freguesia', 'dans cette paroisse'],
                ['pároco, abade, reitor, vigário, cura', 'curé (le titre change selon la paroisse)'], ['coadjutor', 'prêtre adjoint du curé'],
                ['dito, dita', 'ledit, ladite'], ['era ut supra', 'date comme ci-dessus (latin)'], ['de que fiz este assento que assinei', 'dont j’ai fait cet acte que j’ai signé'],
                ['Dom, Dona', 'titre de noble ou de personne de rang'], ['Senhor, Senhora', 'monsieur, madame'],
            ]),
            ...R('parente', 'general', [
                ['pai', 'père'], ['mãe', 'mère'], ['pais', 'parents (père et mère)'], ['filho', 'fils'], ['filha', 'fille'],
                ['irmão', 'frère'], ['irmã', 'sœur'], ['avô', 'grand-père'], ['avó', 'grand-mère'], ['avós', 'grands-parents'], ['neto, neta', 'petit-fils, petite-fille'],
                ['bisavô, bisavó', 'arrière-grand-père, arrière-grand-mère'], ['tio, tia', 'oncle, tante'], ['sobrinho, sobrinha', 'neveu, nièce'], ['primo, prima', 'cousin, cousine'],
                ['marido', 'mari'], ['mulher, esposa', 'épouse (femme)'], ['sogro, sogra', 'beau-père, belle-mère (parents du conjoint)'], ['genro', 'gendre'], ['nora', 'belle-fille (épouse du fils)'],
                ['cunhado, cunhada', 'beau-frère, belle-sœur'], ['enteado, enteada', 'beau-fils, belle-fille (enfant du conjoint)'], ['padrasto, madrasta', 'beau-père, belle-mère (nouveau conjoint du parent)'],
                ['compadre, comadre', 'parrain ou père de l’enfant entre eux (lien du baptême)'], ['tutor', 'tuteur'],
            ]),
            ...R('mois', 'general', [
                ['janeiro', 'janvier'], ['fevereiro', 'février'], ['março', 'mars'], ['abril', 'avril'], ['maio', 'mai'], ['junho', 'juin'],
                ['julho', 'juillet'], ['agosto', 'août'], ['setembro, septembro, 7bro', 'septembre'], ['outubro, 8bro', 'octobre'], ['novembro, 9bro', 'novembre'],
                ['dezembro, 10bro, Xbro', 'décembre'], ['mês, mez', 'mois'], ['dia, dias', 'jour, jours', '« aos vinte dias do mês de maio » = le 20 mai'], ['ano', 'année'],
            ]),
            ...R('nombre', 'general', [
                ['um, uma', 'un, une'], ['dois, duas', 'deux'], ['três, tres', 'trois'], ['quatro', 'quatre'], ['cinco', 'cinq'], ['seis', 'six'], ['sete', 'sept'], ['oito', 'huit'], ['nove', 'neuf'], ['dez', 'dix'],
                ['onze', 'onze'], ['doze', 'douze'], ['treze', 'treize'], ['catorze, quatorze', 'quatorze'], ['quinze', 'quinze'], ['dezasseis, dezesseis', 'seize'], ['dezassete, dezessete', 'dix-sept'],
                ['dezoito', 'dix-huit'], ['dezanove, dezenove', 'dix-neuf'], ['vinte', 'vingt'], ['trinta', 'trente'], ['quarenta', 'quarante'], ['cinquenta, cincoenta', 'cinquante'],
                ['sessenta', 'soixante'], ['setenta', 'soixante-dix'], ['oitenta', 'quatre-vingts'], ['noventa', 'quatre-vingt-dix'], ['cem, cento', 'cent'],
                ['setecentos', 'sept cents'], ['oitocentos', 'huit cents'], ['mil', 'mille', '« mil oitocentos e vinte » = 1820'],
                ['primeiro, segundo, terceiro', 'premier, deuxième, troisième'], ['de idade de … anos', 'âgé de … ans'], ['anos, meses, dias', 'ans, mois, jours'],
                ['maior, menor', 'majeur, mineur'],
            ]),
            ...R('metier', 'general', [
                ['lavrador', 'cultivateur qui a ses terres (laboureur)'], ['jornaleiro', 'journalier'], ['trabalhador', 'travailleur, journalier'], ['criado, criada', 'domestique, servante'],
                ['sapateiro', 'cordonnier'], ['alfaiate', 'tailleur'], ['carpinteiro', 'charpentier, menuisier'], ['ferreiro', 'forgeron'], ['pedreiro', 'maçon'],
                ['moleiro', 'meunier'], ['tecedeira, tecelão', 'tisserande, tisserand'], ['pescador', 'pêcheur'], ['marinheiro', 'marin'], ['negociante', 'négociant'],
                ['proprietário', 'propriétaire'], ['almocreve', 'muletier, transporteur avec des bêtes de somme'], ['tabelião', 'notaire'], ['escrivão', 'greffier, scribe'],
                ['cirurgião', 'chirurgien'], ['boticário', 'apothicaire'], ['soldado', 'soldat'], ['padre, sacerdote', 'prêtre'],
            ]),
            ...R('abrev', 'general', [
                ['fº, fª', 'filho, filha : fils, fille'], ['Frega', 'freguesia : paroisse'], ['q., q̃', 'que'], ['dº, dª', 'dito, dita : ledit, ladite'],
                ['Pe, P.e', 'padre : prêtre'], ['D.', 'Dom, Dona'], ['S.', 'São, Santo, Santa (saint, sainte)'], ['Snr, Sr', 'senhor : monsieur'],
                ['testas', 'testemunhas : témoins'],
            ]),
            ...R('formule', 'bapteme', [
                ['Aos … dias do mês de … do ano de …', 'Le … du mois de … de l’année … (début de presque tous les actes)'],
                ['baptizei solenemente e pus os Santos Óleos a …', 'j’ai baptisé solennellement et j’ai mis les saintes huiles à …'],
                ['filho legítimo de … e de sua mulher …', 'fils légitime de … et de sa femme …'],
                ['foram padrinhos …', 'les parrains furent …'],
            ]),
            ...R('formule', 'mariage', [
                ['se receberam em matrimónio por palavras de presente', 'se sont mariés par paroles de présent (l’échange des consentements)'],
                ['feitas as denunciações sem impedimento', 'les bans faits, sans empêchement'],
                ['na forma do Sagrado Concílio Tridentino', 'selon le saint concile de Trente (règle catholique du mariage)'],
            ]),
            ...R('formule', 'deces', [
                ['faleceu da vida presente', 'a quitté cette vie (est mort)'], ['foi sepultado nesta igreja', 'a été enterré dans cette église'],
                ['com todos os sacramentos', 'muni de tous les sacrements'],
            ]),
            ...R('formule', 'general', [
                ['de que para constar fiz este assento que assinei', 'pour qu’il en reste trace, j’ai fait cet acte que j’ai signé'],
            ]),
        ],
        glyphs: {},
        letters: [],
        exercises: [
            {id: 'pt_bapt1812', icon: '👶', title: 'Um baptismo (baptême) de 1812', level: 'moyen', acte: 'bapteme', year: 1812,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). Développe les abréviations : fº = filho, Frega = freguesia.',
                src: 'Aos vinte dias do mês de Maio de mil oitocentos e doze baptizei Manuel fº=filho legítimo de João Ferreira lavrador e de sua mulher Maria da Silva desta Frega=freguesia foram padrinhos José Pereira e Ana Rodrigues',
                notes: {'fº': 'fº = filho : fils', Frega: 'Frega = freguesia : paroisse'}},
            {id: 'pt_obito1845', icon: '⚱️', title: 'Um óbito (décès) de 1845', level: 'facile', acte: 'deces', year: 1845,
                tip: 'Texte modèle écrit pour l’exercice (personnes d’exemple). « dº » = dito ; « testamto » = testamento.',
                src: 'Aos três dias do mês de Janeiro de mil oitocentos e quarenta e cinco faleceu com todos os sacramentos Francisco Gomes viúvo de idade de setenta anos não fez testamto=testamento e foi sepultado nesta igreja',
                notes: {testamto: 'testamto = testamento : testament (fin du mot abrégée)'}},
        ],
        numerals: null,
        sources: [
            {label: 'FamilySearch Research Wiki — Portuguese Genealogical Word List', url: 'https://www.familysearch.org/en/wiki/Portuguese_Genealogical_Word_List'},
            {label: 'FamilySearch Research Wiki — Portugal Church Records', url: 'https://www.familysearch.org/en/wiki/Portugal_Church_Records'},
            {label: 'Arquivo Nacional Torre do Tombo — registos paroquiais (digitarq)', url: 'https://digitarq.arquivos.pt/'},
        ],
    };
})());
