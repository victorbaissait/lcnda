#!/usr/bin/env python3
"""Fabrique famille-rootsmagic.rmtree : une petite base RootsMagic 9 inventée (mêmes tables et colonnes que RootsMagic,
avec sa comparaison RMNOCASE), pour tests/test-imports-exports-plus.js.   python3 fabriquer-rootsmagic.py [sortie] [nb_personnes_en_plus]"""
import sqlite3, sys, os

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'famille-rootsmagic.rmtree')
extra = int(sys.argv[2]) if len(sys.argv) > 2 else 0
if os.path.exists(out): os.remove(out)
db = sqlite3.connect(out)
db.create_collation('RMNOCASE', lambda a, b: (a.lower() > b.lower()) - (a.lower() < b.lower()))
db.executescript('''
CREATE TABLE ConfigTable (RecID INTEGER PRIMARY KEY, RecType INTEGER, Title TEXT, DataRec BLOB, UTCModDate FLOAT);
CREATE TABLE PersonTable (PersonID INTEGER PRIMARY KEY, UniqueID TEXT, Sex INTEGER, ParentID INTEGER, SpouseID INTEGER, Color INTEGER, Color1 INTEGER, Color2 INTEGER, Color3 INTEGER, Color4 INTEGER, Color5 INTEGER, Color6 INTEGER, Color7 INTEGER, Color8 INTEGER, Color9 INTEGER, Relate1 INTEGER, Relate2 INTEGER, Flags INTEGER, Living INTEGER, IsPrivate INTEGER, Proof INTEGER, Bookmark INTEGER, Note TEXT, UTCModDate FLOAT);
CREATE TABLE NameTable (NameID INTEGER PRIMARY KEY, OwnerID INTEGER, Surname TEXT COLLATE RMNOCASE, Given TEXT COLLATE RMNOCASE, Prefix TEXT COLLATE RMNOCASE, Suffix TEXT COLLATE RMNOCASE, Nickname TEXT COLLATE RMNOCASE, NameType INTEGER, Date TEXT, SortDate BIGINT, IsPrimary INTEGER, IsPrivate INTEGER, Proof INTEGER, Sentence TEXT, Note TEXT, BirthYear INTEGER, DeathYear INTEGER, Display INTEGER, Language TEXT, UTCModDate FLOAT, SurnameMP TEXT, GivenMP TEXT, NicknameMP TEXT);
CREATE INDEX idxSurname ON NameTable (Surname);
CREATE TABLE FamilyTable (FamilyID INTEGER PRIMARY KEY, FatherID INTEGER, MotherID INTEGER, ChildID INTEGER, HusbOrder INTEGER, WifeOrder INTEGER, IsPrivate INTEGER, Proof INTEGER, SpouseLabel INTEGER, FatherLabel INTEGER, MotherLabel INTEGER, SpouseLabelStr TEXT, FatherLabelStr TEXT, MotherLabelStr TEXT, Note TEXT, UTCModDate FLOAT);
CREATE TABLE ChildTable (RecID INTEGER PRIMARY KEY, ChildID INTEGER, FamilyID INTEGER, RelFather INTEGER, RelMother INTEGER, ChildOrder INTEGER, IsPrivate INTEGER, ProofFather INTEGER, ProofMother INTEGER, Note TEXT, UTCModDate FLOAT);
CREATE TABLE FactTypeTable (FactTypeID INTEGER PRIMARY KEY, OwnerType INTEGER, Name TEXT COLLATE RMNOCASE, Abbrev TEXT, GedcomTag TEXT, UseValue INTEGER, UseDate INTEGER, UsePlace INTEGER, Sentence TEXT, Flags INTEGER, UTCModDate FLOAT);
CREATE TABLE EventTable (EventID INTEGER PRIMARY KEY, EventType INTEGER, OwnerType INTEGER, OwnerID INTEGER, FamilyID INTEGER, PlaceID INTEGER, SiteID INTEGER, Date TEXT, SortDate BIGINT, IsPrimary INTEGER, IsPrivate INTEGER, Proof INTEGER, Status INTEGER, Sentence TEXT, Details TEXT, Note TEXT, UTCModDate FLOAT);
CREATE TABLE PlaceTable (PlaceID INTEGER PRIMARY KEY, PlaceType INTEGER, Name TEXT COLLATE RMNOCASE, Abbrev TEXT, Normalized TEXT, Latitude INTEGER, Longitude INTEGER, LatLongExact INTEGER, MasterID INTEGER, Note TEXT, Reverse TEXT COLLATE RMNOCASE, fsID INTEGER, AnID INTEGER, UTCModDate FLOAT);
CREATE TABLE SourceTable (SourceID INTEGER PRIMARY KEY, Name TEXT COLLATE RMNOCASE, RefNumber TEXT, ActualText TEXT, Comments TEXT, IsPrivate INTEGER, TemplateID INTEGER, Fields BLOB, UTCModDate FLOAT);
CREATE TABLE CitationTable (CitationID INTEGER PRIMARY KEY, SourceID INTEGER, Comments TEXT, ActualText TEXT, RefNumber TEXT, Footnote TEXT, ShortFootnote TEXT, Bibliography TEXT, Fields BLOB, UTCModDate FLOAT, CitationName TEXT COLLATE RMNOCASE);
CREATE TABLE CitationLinkTable (LinkID INTEGER PRIMARY KEY, CitationID INTEGER, OwnerType INTEGER, OwnerID INTEGER, SortOrder INTEGER, Quality TEXT, IsPrivate INTEGER, Flags INTEGER, UTCModDate FLOAT);
CREATE TABLE MultimediaTable (MediaID INTEGER PRIMARY KEY, MediaType INTEGER, MediaPath TEXT, MediaFile TEXT COLLATE RMNOCASE, URL TEXT, Thumbnail BLOB, Caption TEXT COLLATE RMNOCASE, RefNumber TEXT COLLATE RMNOCASE, Date TEXT, SortDate BIGINT, Description TEXT, UTCModDate FLOAT);
CREATE TABLE MediaLinkTable (LinkID INTEGER PRIMARY KEY, MediaID INTEGER, OwnerType INTEGER, OwnerID INTEGER, IsPrimary INTEGER, Include1 INTEGER, Include2 INTEGER, Include3 INTEGER, Include4 INTEGER, SortOrder INTEGER, RectLeft INTEGER, RectTop INTEGER, RectRight INTEGER, RectBottom INTEGER, Note TEXT, Caption TEXT COLLATE RMNOCASE, RefNumber TEXT COLLATE RMNOCASE, Date TEXT, SortDate BIGINT, Description TEXT, UTCModDate FLOAT);
CREATE TABLE AddressTable (AddressID INTEGER PRIMARY KEY, AddressType INTEGER, Name TEXT COLLATE RMNOCASE, Street1 TEXT, Street2 TEXT, City TEXT, State TEXT, Zip TEXT, Country TEXT, Phone1 TEXT, Phone2 TEXT, Fax TEXT, Email TEXT, URL TEXT, Latitude INTEGER, Longitude INTEGER, Note TEXT, UTCModDate FLOAT);
CREATE TABLE AddressLinkTable (LinkID INTEGER PRIMARY KEY, OwnerType INTEGER, AddressID INTEGER, OwnerID INTEGER, AddressNum INTEGER, Details TEXT, UTCModDate FLOAT);
CREATE TABLE RoleTable (RoleID INTEGER PRIMARY KEY, RoleName TEXT COLLATE RMNOCASE, EventType INTEGER, RoleType INTEGER, Sentence TEXT, UTCModDate FLOAT);
CREATE TABLE WitnessTable (WitnessID INTEGER PRIMARY KEY, EventID INTEGER, PersonID INTEGER, WitnessOrder INTEGER, Role INTEGER, Sentence TEXT, Note TEXT, Given TEXT COLLATE RMNOCASE, Surname TEXT COLLATE RMNOCASE, Prefix TEXT COLLATE RMNOCASE, Suffix TEXT COLLATE RMNOCASE, UTCModDate FLOAT);
''')
X = db.execute
for fid, owner, name, tag in [(1,0,'Birth','BIRT'),(2,0,'Death','DEAT'),(3,0,'Christen','CHR'),(4,0,'Burial','BURI'),(29,0,'Occupation','OCCU'),(300,1,'Marriage','MARR'),(999,0,'Tirage au sort','EVEN')]:
    X('INSERT INTO FactTypeTable(FactTypeID,OwnerType,Name,Abbrev,GedcomTag,UseValue,UseDate,UsePlace,Flags) VALUES(?,?,?,?,?,1,1,1,0)', (fid, owner, name, name[:4], tag))
X("INSERT INTO RoleTable VALUES(1,'Témoin',300,1,'',0)"); X("INSERT INTO RoleTable VALUES(2,'Parrain',3,1,'',0)")
places = [(1,'Tulle, Corrèze, Nouvelle-Aquitaine, France',452670000,17690000),(2,'Saint-Étienne, Loire, Auvergne-Rhône-Alpes, France',454340000,43900000),(3,'Québec, Québec, Canada',468130000,-712080000)]
for pid, nm, la, lo in places: X('INSERT INTO PlaceTable(PlaceID,PlaceType,Name,Latitude,Longitude,LatLongExact,MasterID) VALUES(?,0,?,?,?,1,0)', (pid, nm, la, lo))
X("INSERT INTO PlaceTable(PlaceID,PlaceType,Name,Latitude,Longitude,LatLongExact,MasterID) VALUES(4,2,'Le Moulin de la Borie',452700000,17700000,1,1)")
people = [  # id, sexe, prénom, nom, privé, note
 (1,0,'Jean-Baptiste','FAURE',0,'Laboureur, <b>sait signer</b>.'),(2,1,'Marie-Thérèse','LAGARDE',0,''),(3,0,'Léon','FAURE',0,''),
 (4,1,'Hélène','CABANIS',0,''),(5,0,'Aimé','FAURE',0,''),(6,1,'Zoé','FAURE',1,'Fiche confidentielle'),(7,0,'François','DUBŒUF',0,'')]
for pid, sex, given, sur, priv, note in people:
    X('INSERT INTO PersonTable(PersonID,UniqueID,Sex,ParentID,SpouseID,Living,IsPrivate,Note) VALUES(?,?,?,0,0,0,?,?)', (pid, 'RM-%04d-GUID-ABCD' % pid, sex, priv, note))
    X('INSERT INTO NameTable(OwnerID,Surname,Given,Prefix,Suffix,Nickname,NameType,Date,SortDate,IsPrimary) VALUES(?,?,?,?,?,?,0,".",0,1)', (pid, sur, given, '', '', 'Titou' if pid == 3 else ''))
X("INSERT INTO NameTable(OwnerID,Surname,Given,NameType,Date,IsPrimary,Nickname,Prefix,Suffix) VALUES(2,'FAURE','Marie-Thérèse',5,'D.+18200000..+00000000..',0,'','','')")
X('INSERT INTO FamilyTable(FamilyID,FatherID,MotherID,ChildID,Note) VALUES(1,1,2,0,"Mariage arrangé.")')
X('INSERT INTO FamilyTable(FamilyID,FatherID,MotherID,ChildID,Note) VALUES(2,3,4,0,"")')
for rec, child, fam, rf, rm, order in [(1,3,1,0,0,1),(2,7,1,1,1,2),(3,5,2,0,0,1),(4,6,2,0,0,2)]:
    X('INSERT INTO ChildTable(RecID,ChildID,FamilyID,RelFather,RelMother,ChildOrder) VALUES(?,?,?,?,?,?)', (rec, child, fam, rf, rm, order))
events = [  # id, type, owner type, owner, place, site, date, details, note
 (1,1,0,1,1,0,'D.+17920315..+00000000..','',''),(2,2,0,1,2,0,'DA+18600000..+00000000..','','Mort de vieillesse.'),
 (3,1,0,2,1,4,'D.+17951100..+00000000..','',''),(4,300,1,1,1,0,'D.+18190615..+00000000..','',''),
 (5,3,0,3,1,0,'D.+18200402..+00000000..','',''),(6,29,0,3,0,0,'DR+18400000..+18500000..','Armurier',''),
 (7,1,0,5,3,0,'D.+18520101..+00000000..','',''),(8,999,0,5,2,0,'TVers la Saint-Martin 1872','Bon numéro',''),
 (9,1,0,7,2,0,'DB+18250000..+00000000..','',''),(10,1,0,6,1,0,'D.+19500101..+00000000..','','')]
for e in events:
    X('INSERT INTO EventTable(EventID,EventType,OwnerType,OwnerID,FamilyID,PlaceID,SiteID,Date,SortDate,IsPrimary,IsPrivate,Proof,Status,Details,Note) VALUES(?,?,?,?,0,?,?,?,0,1,0,0,0,?,?)', e)
X("INSERT INTO WitnessTable(EventID,PersonID,WitnessOrder,Role) VALUES(4,7,1,1)")
X("INSERT INTO WitnessTable(EventID,PersonID,WitnessOrder,Role) VALUES(5,1,1,2)")
fields = '<Root><Fields><Field><Name>Author</Name><Value>Archives départementales de la Corrèze</Value></Field><Field><Name>Publisher</Name><Value>AD 19</Value></Field></Fields></Root>'
X('INSERT INTO SourceTable(SourceID,Name,RefNumber,ActualText,Comments,IsPrivate,TemplateID,Fields) VALUES(1,"Registres paroissiaux de Tulle","","","Collection numérisée",0,0,?)', (fields.encode(),))
X('INSERT INTO SourceTable(SourceID,Name,RefNumber,ActualText,Comments,IsPrivate,TemplateID,Fields) VALUES(2,"Recensement de Saint-Étienne 1846","","Léon Faure, armurier","",0,0,?)', (b'<Root><Fields></Fields></Root>',))
X('INSERT INTO CitationTable(CitationID,SourceID,Comments,ActualText,RefNumber,Fields,CitationName) VALUES(1,1,"Acte n° 12","","",?,"Baptême de Léon")', ('<Root><Fields><Field><Name>Page</Name><Value>folio 12 v°</Value></Field></Fields></Root>'.encode(),))
X('INSERT INTO CitationTable(CitationID,SourceID,Comments,ActualText,RefNumber,Fields,CitationName) VALUES(2,2,"","","vue 34",?,"")', (b'',))
for l in [(1,1,2,5,'OPD'),(2,1,0,3,'OPD'),(3,2,2,6,'DSI'),(4,1,1,1,'~~~')]:
    X('INSERT INTO CitationLinkTable(LinkID,CitationID,OwnerType,OwnerID,SortOrder,Quality,IsPrivate,Flags) VALUES(?,?,?,?,0,?,0,0)', l)
X("INSERT INTO AddressTable(AddressID,AddressType,Name,Street1,City,Country) VALUES(1,1,'Archives départementales de la Corrèze','Rue Souham','Tulle','France')")
X("INSERT INTO AddressLinkTable(OwnerType,AddressID,OwnerID) VALUES(3,1,1)")
X("INSERT INTO MultimediaTable(MediaID,MediaType,MediaPath,MediaFile,Caption,Date,Description) VALUES(1,1,'C:\\Users\\Jean\\Documents\\RootsMagic\\Médias\\','portrait-leon.jpg','Portrait de Léon','D.+18600000..+00000000..','Photographie retouchée')")
X("INSERT INTO MediaLinkTable(MediaID,OwnerType,OwnerID,IsPrimary,SortOrder) VALUES(1,0,3,1,0)")
# Gros fichier : des familles en plus (chaîne de descendants)
nid = 1000
for i in range(extra):
    pid = nid + i
    X('INSERT INTO PersonTable(PersonID,UniqueID,Sex,Living,IsPrivate,Note) VALUES(?,?,?,0,0,"")', (pid, 'BIG-%d' % pid, i % 2))
    X('INSERT INTO NameTable(OwnerID,Surname,Given,NameType,IsPrimary) VALUES(?,?,?,0,1)', (pid, 'GRAND%d' % (i // 50), 'Prénom%d' % i))
    X('INSERT INTO EventTable(EventType,OwnerType,OwnerID,FamilyID,PlaceID,SiteID,Date,SortDate,IsPrimary) VALUES(1,0,?,0,1,0,?,0,1)', (pid, 'D.+%04d0101..+00000000..' % (1700 + i % 150)))
    if i % 2 == 1:
        fam = 1000 + i
        X('INSERT INTO FamilyTable(FamilyID,FatherID,MotherID,ChildID) VALUES(?,?,?,0)', (fam, pid - 1, pid))
X('INSERT INTO ConfigTable(RecID,RecType,Title,DataRec) VALUES(1,1,"Database",?)', (b'<Root><Version>9000</Version></Root>',))
db.commit(); db.close()
print(out)
