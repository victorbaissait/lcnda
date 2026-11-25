"""LCNDA — 🕰 Son époque et son travail : les listes faites à la main (chaque ligne est VÉRIFIÉE par build.py : la page
Wikipédia est téléchargée et la phrase qui donne la date y est cherchée ; une ligne dont la phrase n'est pas trouvée
n'est pas livrée).

  NOUVEAUTES : (id, icône, nom, année, portée, page Wikipédia « lang:Titre », mots qui doivent être dans la phrase, quand ? [« avant/après »])
  FLEAUX     : les fléaux des cultures et des élevages, avec les départements touchés et la phrase de la source
  PHOTOS     : les formats de photos anciennes (pour dater une photo)
"""

# (id, icône, nom court, année, portée, page, mots de la phrase (regex), ce qu'on dit « il n'y avait pas encore … »)
NOUVEAUTES = [
    ('montgolfiere', '🎈', 'la montgolfière', 1783, 'France', 'fr:Montgolfière', r'1783', r'ballon|Montgolfier'),
    ('telegraphe_chappe', '📡', 'le télégraphe Chappe', 1794, 'France', 'fr:Télégraphe Chappe', r'1794', r'télégraph|Chappe'),
    ('vaccin_variole', '💉', 'le vaccin contre la variole', 1796, 'Monde', 'fr:Edward Jenner', r'1796', r'vaccin|variole|vaccine'),
    ('bateau_vapeur', '🚢', 'le bateau à vapeur', 1807, 'Monde', 'fr:Bateau à vapeur', r'1807', r'vapeur'),
    ('conserve', '🥫', 'la conserve (Appert)', 1810, 'France', 'fr:Appertisation', r'1810', r'Appert'),
    ('sucre_betterave', '🍬', 'le sucre de betterave', 1812, 'France', 'fr:Sucre de betterave', r'1812', r'sucre'),
    ('machine_coudre', '🧵', 'la machine à coudre', 1830, 'France', 'fr:Machine à coudre', r'1830', r'machine|coudre|Thimonnier'),
    ('allumette', '🔥', 'l’allumette chimique', 1831, 'Monde', 'fr:Allumette', r'1831', r'allumette'),
    ('train', '🚂', 'le train de voyageurs', 1837, 'France', 'fr:Ligne de Paris-Saint-Lazare à Saint-Germain-en-Laye', r'1837', r'voyageurs|ferroviaire'),
    ('photographie', '📷', 'la photographie', 1839, 'France', 'fr:Daguerréotype', r'1839', r'invention|photograph|daguerr'),
    ('telegraphe_electrique', '⚡', 'le télégraphe électrique', 1844, 'Monde', 'fr:Samuel Morse', r'1844', r'télégraph|message'),
    ('timbre', '✉️', 'le timbre-poste', 1849, 'France', 'fr:Cérès (timbre français)', r'1849', r'timbre'),
    ('velocipede', '🚲', 'le vélocipède à pédales', 1867, 'France', 'fr:Pierre Michaux', r'1867', r'vélocipède'),
    ('telephone', '☎️', 'le téléphone', 1876, 'Monde', 'fr:Téléphone', r'1876', r'Bell|brevet|téléphone'),
    ('phonographe', '🎙️', 'le phonographe', 1877, 'Monde', 'fr:Phonographe', r'1877', r'enregistr|phonograph'),
    ('ampoule', '💡', 'l’ampoule électrique', 1879, 'Monde', 'fr:Lampe à incandescence', r'1879', r'lampe'),
    ('vaccin_rage', '💉', 'le vaccin contre la rage', 1885, 'France', 'fr:Vaccin contre la rage', r'1885', r'rage|antirabique'),
    ('automobile', '🚗', 'l’automobile à essence', 1886, 'Monde', 'fr:Carl Benz', r'1886', r'automobile|brevet|véhicule|Motorwagen'),
    ('cinema', '🎞️', 'le cinéma', 1895, 'France', 'fr:Cinématographe', r'1895', r'Lumière'),
    ('rayons_x', '🩻', 'la radiographie (rayons X)', 1895, 'Monde', 'fr:Rayon X', r'1895', r'Röntgen|découvert'),
    ('metro', '🚇', 'le métro de Paris', 1900, 'France', 'fr:Métro de Paris', r'1900', r'métro|ligne'),
    ('avion', '✈️', 'l’avion', 1903, 'Monde', 'fr:Frères Wright', r'1903', r'vol|avion|Flyer'),
    ('refrigerateur', '🧊', 'le réfrigérateur', 1913, 'Monde', 'fr:Réfrigérateur', r'1913', r'réfrigérateur'),
    ('insuline', '💊', 'l’insuline', 1921, 'Monde', 'fr:Insuline', r'1921', r'Banting|extrait'),
    ('radio', '📻', 'la radio (TSF)', 1922, 'France', 'fr:Radiola', r'1922', r'radio'),
    ('penicilline', '💊', 'la pénicilline', 1928, 'Monde', 'fr:Pénicilline', r'1928', r'Fleming'),
    ('television', '📺', 'la télévision', 1935, 'France', 'fr:Radio-PTT Vision', r'1935', r'antenne|émission'),
    ('ordinateur', '💻', 'l’ordinateur', 1945, 'Monde', 'fr:ENIAC', r'1945', r'ordinateur'),
    ('stylo_bille', '🖊️', 'le stylo à bille', 1950, 'France', 'fr:Bic Cristal', r'1950', r'stylo'),
    ('vol_spatial', '🚀', 'le premier homme dans l’espace', 1961, 'Monde', 'fr:Vostok 1', r'1961', r'Gagarine'),
    ('pas_lune', '🌕', 'le premier pas sur la Lune', 1969, 'Monde', 'fr:Apollo 11', r'1969', r'Lune'),
    ('minitel', '📟', 'le Minitel', 1980, 'France', 'fr:Minitel', r'1980|1982', r'Minitel|Télétel'),
    ('internet_web', '🌐', 'le Web', 1990, 'Monde', 'fr:World Wide Web', r'1990', r'Web'),
]

# les fléaux : (id, icône, nom, mots-métier (regex), page source, [(année, précision, départements, « zone » telle que la source la dit, mots de la phrase)])
#   précision : 'an' (l'année est donnée), 'decennie' (« dans les années 1880 »), 'apres' (« après 1890 »)
WINE = r'vigner|viticult|vigne|tonnel|vendang|cultivateur|propri[ée]taire|journalier|laboureur|agricult|cabaret|aubergiste|n[ée]gociant en vins|marchand de vin'
SILK = r's[ée]ricicult|magnan|ver[s]? [àa] soie|fileu?r|fileuse|mouli[nn]i|soie|dévideu|tisseu|ovalist|canut|cultivateur|propri[ée]taire|journalier|laboureur|agricult'
FARM = r'cultivateur|laboureur|journalier|agricult|fermier|m[ée]tayer|propri[ée]taire|paysan|jardinier|maraîch|ménager|bordier|colon|domestique|valet de ferme|métayer'
FLEAUX = [
    ('phylloxera', '🐛', 'le phylloxéra', WINE, 'fr:Phylloxéra', [
        (1863, 'an', ['30'], 'Pujaut près de Roquemaure, dans le Gard', r'Pujaut'),
        (1865, 'an', ['13'], 'la Crau-Saint-Rémy (Bouches-du-Rhône)', r'Crau-Saint-Rémy'),
        (1866, 'an', ['33'], 'Floirac, en face de Bordeaux (Gironde)', r'Floirac'),
        (1871, 'an', ['34', '26', '13'], 'la vallée du Rhône, de Cadarache à Castries et Tain-l’Hermitage', r'grand triangle'),
        (1872, 'an', ['16', '17'], 'près de Cognac', r'Cognac'),
        (1876, 'an', ['45'], 'Orléans', r'Orléans'),
        (1878, 'an', ['21', '71', '89'], 'la Bourgogne', r'Bourgogne'),
        (1884, 'an', ['15', '43', '63', '03'], 'les arrondissements d’Aurillac, de Brioude et d’Yssingeaux, puis toute l’Auvergne', r'Aurillac'),
        (1887, 'an', ['52'], 'le sud de la Haute-Marne', r'Haute-Marne'),
        (1890, 'an', ['02'], 'l’Aisne (Trélou, près de Dormans)', r'Trélou'),
        (1894, 'an', ['51', '10'], 'le vignoble de Champagne', r'vignoble de Champagne'),
        (1893, 'an', ['12'], 'le vignoble de Marcillac (Aveyron)', r'Marcillac'),
        (1870, 'an', ['11'], 'l’Aude', r'phylloxéra fasse son apparition vers 1870', 'fr:Aude (département)'),
        (1872, 'an', ['16'], 'le vignoble charentais', r'vignoble charentais dès 1872', 'fr:Charente (département)'),
        (1872, 'an', ['17'], 'la Charente-Maritime', r'L.année 1872 voit', 'fr:Histoire de la Charente-Maritime'),
        (1876, 'an', ['45'], 'le Loiret', r'atteint le Loiret en 1876', 'fr:Histoire du Loiret'),
        (1882, 'an', ['41'], 'le canton de Mer, puis celui de Vendôme (Loir-et-Cher)', r'canton de Mer', 'fr:Histoire de Loir-et-Cher'),
        (1880, 'decennie', ['89'], 'l’Yonne', r'Vers 1880-1890', 'fr:Histoire de l\'Yonne'),
        (1870, 'decennie', ['11', '34', '30', '13', '83', '84', '04', '06'], 'le Bas Languedoc et la Provence', r'Bas Languedoc'),
        (1880, 'decennie', ['16', '17', '69', '45', '41', '37', '70'], 'les Charentes, le Beaujolais, la Loire moyenne, la Haute-Saône', r'Bas Languedoc'),
        (1890, 'apres', ['51', '88', '54'], 'la Champagne, les Vosges, la Meurthe-et-Moselle', r'Bas Languedoc'),
    ]),
    ('oidium', '🍇', 'l’oïdium de la vigne', WINE, 'fr:Oïdium de la vigne', [
        (1847, 'an', ['92', '75', '78'], 'les serres de Suresnes, à l’ouest de Paris', r'Suresnes'),
        (1851, 'an', ['*'], 'tout le vignoble français (« quatre ans plus tard » que 1847)', r'Quatre ans plus tard', 1847),
    ]),
    ('mildiou_vigne', '🍂', 'le mildiou de la vigne', WINE, 'fr:Oïdium de la vigne', [
        (1878, 'an', ['*'], 'le vignoble européen', r'mildiou de la vigne suivit'),
    ]),
    ('black_rot', '🍇', 'le black-rot de la vigne', WINE, 'fr:Oïdium de la vigne', [
        (1885, 'an', ['*'], 'le vignoble européen', r'black rot en 1885'),
    ]),
    ('mildiou_pdt', '🥔', 'le mildiou de la pomme de terre', FARM, 'fr:Mildiou de la pomme de terre', [
        (1844, 'an', ['59', '62', '80', '02', '60', '76'], 'le Nord de la France', r'Nord de la France en 1844'),
    ]),
    ('pebrine', '🐛', 'la pébrine des vers à soie', SILK, 'fr:Louis Pasteur', [
        (1865, 'an', ['30', '07', '48', '26', '84', '34', '13'], 'les magnaneries du Midi (Cévennes, vallée du Rhône)', r'soie'),
    ]),
]

# 📷 dater une photo ancienne : (id, nom, de, à, page Wikipédia, mots de la phrase)
PHOTOS = [
    ('daguerreotype', 'Daguerréotype (image sur plaque de métal argenté, comme un miroir)', 1839, 1860, 'fr:Daguerréotype', r'18[3-6]\d'),
    ('calotype', 'Calotype (tirage sur papier, négatif papier)', 1841, 1860, 'fr:Calotype', r'184\d'),
    ('ambrotype', 'Ambrotype (image sur verre, sur fond noir)', 1854, 1870, 'fr:Ambrotype', r'185\d'),
    ('ferrotype', 'Ferrotype (image sur plaque de fer noircie)', 1856, 1930, 'fr:Ferrotype', r'185\d'),
    ('carte_visite', 'Carte de visite (petit tirage collé sur carton, environ 6 × 10 cm)', 1854, 1900, 'fr:Carte de visite (photographie)', r'185\d'),
    ('cabinet', 'Photo-carte « cabinet » (tirage plus grand, environ 11 × 17 cm)', 1866, 1914, 'en:Cabinet card', r'186\d'),
    ('albumine', 'Tirage à l’albumine (couleur brun-sépia, papier fin)', 1850, 1895, 'fr:Tirage albuminé', r'18[5-9]\d'),
    ('gelatino', 'Plaque sèche au gélatino-bromure (photos plus nettes, instantanés)', 1878, 1930, 'fr:Gélatino-bromure d\'argent', r'187\d'),
    ('autochrome', 'Autochrome (premières photos en couleurs, sur verre)', 1907, 1935, 'fr:Autochrome', r'190\d'),
    ('carte_postale', 'Carte postale photographique', 1889, 1960, 'fr:Carte postale', r'18[6-9]\d|190\d'),
    ('kodak', 'Appareil Kodak (photos d’amateur, tirages ronds puis carrés)', 1888, 1930, 'fr:Kodak', r'1888'),
]
