#!/usr/bin/env node
// Load 2026 Turkey Athletics Federation schedule into the app
const https = require('https');

const API_URL = 'https://atletikpro.vercel.app/api/data';

const MONTHS = {
  'Ocak':1,'Şubat':2,'Mart':3,'Nisan':4,'Mayıs':5,'Haziran':6,
  'Temmuz':7,'Ağustos':8,'Eylül':9,'Ekim':10,'Kasım':11,'Aralık':12
};

function pad(n){ return String(n).padStart(2,'0'); }

function parseDate(str, defaultYear=2026) {
  str = str.trim();
  // "27 Şubat - 2 Mart" cross-month
  const crossMonth = str.match(/^(\d+)\s+(\S+)\s*-\s*(\d+)\s+(\S+)$/);
  if (crossMonth) {
    const [,d1,m1,d2,m2] = crossMonth;
    const y=defaultYear;
    return {
      start:`${y}-${pad(MONTHS[m1])}-${pad(d1)}`,
      end:`${y}-${pad(MONTHS[m2])}-${pad(d2)}`
    };
  }
  // "3 - 4 Ocak" or "10 -  Ocak" or "30 - 31 Ocak"
  const sameMonth = str.match(/^(\d+)\s*-\s*(\d*)\s*(\S+)$/);
  if (sameMonth) {
    const [,d1,d2raw,m] = sameMonth;
    const d2 = d2raw ? d2raw : d1;
    return {
      start:`${defaultYear}-${pad(MONTHS[m])}-${pad(d1)}`,
      end:`${defaultYear}-${pad(MONTHS[m])}-${pad(d2)}`
    };
  }
  return null;
}

function mapType(kategori) {
  if (!kategori) return 'Diğer';
  if (kategori.includes('Süper Lig')) return 'Süper Lig';
  if (kategori === 'Kulüp' || kategori.startsWith('Kulüp')) return 'Kulüp Yarışması';
  if (kategori === 'İl' || kategori === 'Şehir') return 'Şehir Yarışması';
  if (kategori === 'Bölge') return 'Bölgesel Yarışma';
  if (kategori.startsWith('Ulusal')) return 'Ulusal Yarışma';
  if (kategori.startsWith('EA') || kategori.includes('Avrupa')) return 'Avrupa Şampiyonası';
  if (kategori.startsWith('WA') || kategori.startsWith('BA') || kategori === 'INT') return 'Uluslararası Yarışma';
  return 'Diğer';
}

function mkId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}

// Raw competition data from PDF (date, name, ageGroup, location, category)
const RAW = [
  ['3 - 4 Ocak','Sem-Olimpik Salon Deneme','U16-U14','Bursa','Ulusal'],
  ['5 - 31 Ocak','Olimpik Kadro Hazırlık Kampı / Milli Takım Hazırlık Kampı','Muhtelif','Muhtelif','Hazırlık Kampı'],
  ['7 - 8 Ocak','Salon Olimpik Deneme / TOHM Salon Deneme','B-U20-U18','İstanbul','Ulusal'],
  ['10 -  Ocak','46. Dünya Kros Şampiyonası','B','Tallahassee, FL/USA','WA'],
  ['10 -  Ocak','MEB Okullar Yıldızlar Kros Grup Yarışmaları','2011-2012-2013','Antalya / Kocaeli / Ordu / Tokat / Diyarbakır / Erzincan','Okul-SGM'],
  ['10 -  Ocak','MEB Okullar Gençler A Kros Grup Yarışmaları','2007-2008-2009-2010-2011','Antalya / Kocaeli / Ordu / Tokat / Diyarbakır / Erzincan','Okul-SGM'],
  ['10 -  Ocak','MEB Okullar Gençler B Kros Grup Yarışmaları','2010-2011','Antalya / Kocaeli / Ordu / Tokat / Diyarbakır / Erzincan','Okul-SGM'],
  ['14 -  Ocak','Besim Aybars Kros 1. Ligi Final / U18-U20 Ligi Eleme Kademesi','B-U20-U18','Kocaeli','Kulüp'],
  ['14 - 15 Ocak','Salon Olimpik Deneme / TOHM Salon Deneme','B-U20-U18','İstanbul','Ulusal'],
  ['14 - 15 Ocak','Ahmet Melek Komple Atlet Kupası','B-U20-U18-U16','İstanbul','Ulusal'],
  ['21 -  Ocak','Üniversiteler Kros Türkiye Şampiyonası','B','Kuşadası / Aydın','Ulusal Şamp.'],
  ['23 - 25 Ocak','Para-Atlet Ulusal Sınıflandırma / Para-Atlet Olimpik Deneme Yarışması','Muhtelif','Adana','ParaAthletic'],
  ['23 -  Ocak','Salon Olimpik Deneme','B','İstanbul','Ulusal'],
  ['24 - 25 Ocak','Cüneyt Koryürek U20 Türkiye Salon Şampiyonası','U20','İstanbul','Ulusal Şamp.'],
  ['28 -  Ocak','Besim Aybars Kros Süper Ligi - U18/U20 Ligi 1. Kademe Yarışması','B-U20-U18','Adana','Kulüp'],
  ['30 Ocak - 1 Şubat','Olimpik Teknik Kurul Toplantısı','','İstanbul','Diğer'],
  ['30 Ocak - 1 Şubat','MHK Toplantısı','','İstanbul','Diğer'],
  ['31 Ocak - 1 Şubat','Yeşilay Türkiye Salon Şampiyonası (Büyükler Balkan Salon Milli Takım Seçme)','B','İstanbul','Ulusal Şamp.'],
  ['31 Ocak - 1 Şubat','Masterlar Salon Türkiye Şampiyonası','Muhtelif','Bursa','Ulusal Şamp.'],
  ['1 - 28 Şubat','Olimpik Kadro Hazırlık Kampı','Muhtelif','Muhtelif','Hazırlık Kampı'],
  ['6 - 8 Şubat','Nejat Kök U16 Türkiye Salon Şampiyonası','U16','Bursa','Ulusal Şamp.'],
  ['7 -  Şubat','International Antalya Race Walking Silver Tour (Balkan Yürüyüş Şamp. Seçmesi)','B','Antalya/EXPO','WA-RW Tour Silver'],
  ['7 - 8 Şubat','Open Indoor Meeting','B-U20','Sofya/BUL','INT'],
  ['8 -  Şubat','Avrupa Şampiyon Kulüpler Kupası Kros Yarışması','B-U20','Albufeira/POR','EA'],
  ['10 - 13 Şubat','Dubai 2026 WPA Grand Prix','B','Dubai/UAE','ParaAthletic'],
  ['12 - 13 Şubat','Memorijal Josip Gašparac','B','Osijek/CRO','WA-Indoor Tour Bronze'],
  ['14 - 15 Şubat','Atmalar Ligi 1. Kademe Yarışması','U18','Mersin','Kulüp'],
  ['14 - 15 Şubat','Seyfi Alanya Kış Atmalar Türkiye Şampiyonası','B-U20-U18-U16','Mersin','Ulusal Şamp.'],
  ['14 -  Şubat','Balkan U20 Salon Şampiyonası','U20','YBD','BA'],
  ['14 -  Şubat','Olimpik Deneme','B','İstanbul','Ulusal'],
  ['14 - 15 Şubat','Üniversiteler Salon Türkiye Şampiyonası','B','Bursa','Ulusal Şamp.'],
  ['15 -  Şubat','Ahmet Aytar Yarı Maraton Ligi 1. Kademe Yarışması','B','Trabzon','Kulüp'],
  ['16 - 17 Şubat','Olimpik Teknik Kurul Toplantısı','','İstanbul','Diğer'],
  ['16 - 17 Şubat','MHK Toplantısı','','İstanbul','Diğer'],
  ['17 -  Şubat','11. Ruhi Sarıalp Jumping Cup','B','İstanbul','INT'],
  ['18 -  Şubat','MEB Okullar Yıldızlar Türkiye Kros Şampiyonası','2011-2012-2013','Kuşadası / Aydın','Okul-SGM'],
  ['18 -  Şubat','MEB Okullar Gençler A Türkiye Kros Şampiyonası','2007-2008-2009-2010-2011','Kuşadası / Aydın','Okul-SGM'],
  ['18 -  Şubat','MEB Okullar Gençler B Türkiye Kros Şampiyonası','2010-2011','Kuşadası / Aydın','Okul-SGM'],
  ['21 - 22 Şubat','Jerfi Fıratlı U18 Türkiye Salon Şampiyonası','U18','İstanbul','Ulusal Şamp.'],
  ['21 -  Şubat','Balkan Salon Şampiyonası','B','Belgrade/SRB','BA'],
  ['25 Şubat - 2 Mart','60\'ncı CISM Dünya Kros Şampiyonası','B','Yunanistan/GRE','Diğer'],
  ['27 Şubat - 1 Mart','Özcan Kutlu U14 Türkiye Salon Şampiyonası','U14','Bursa','Ulusal'],
  ['1 - 29 Mart','Olimpik Kadro Hazırlık Kampı','Muhtelif','Muhtelif','Hazırlık Kampı'],
  ['1 -  Mart','Besim Aybars Kros Süper Ligi - U18/U20 Ligi Finali','B-U20-U18','Antalya','Kulüp'],
  ['13 - 15 Mart','Para-Atlet Ulusal Sınıflandırma / Para-Atlet Olimpik Deneme Yarışması','Muhtelif','İzmir','ParaAthletic'],
  ['14 - 15 Mart','Avrupa Atmalar Kupası','B-U23','Nicosia/CYP','EA'],
  ['14 - 15 Mart','Balkan Masterler Salon Şampiyonası','Master','Novo Mesto/SLO','INT'],
  ['14 -  Mart','Balkan Yürüyüş Şampiyonası','B-U20-U18','İzmir','BA'],
  ['19 - 22 Mart','Ramazan Bayramı Tatili','','','Diğer'],
  ['20 - 22 Mart','Dünya Salon Şampiyonası','B','Toruń/POL','WA'],
  ['26 -  Mart','Decathlon Türkiye\'nin En Hızlısı Grup Yarışmaları (Diyarbakır)','2012-2013-2014-2015-2016','Diyarbakır','Bölge'],
  ['27 Mart - 2 Nisan','Avrupa Masterler Salon Şampiyonası','Master','Torun/POL','INT'],
  ['28 - 29 Mart','U14 Artun Talay Atmalar Türkiye Kupası / Eşref Apak Atma Branşları Alt Yapı Gelişim Projesi','U14','Ankara','Ulusal'],
  ['30 -  Mart','Decathlon Türkiye\'nin En Hızlısı Grup Yarışmaları (Antalya)','2012-2013-2014-2015-2016','Antalya','Bölge'],
  ['1 - 29 Nisan','Olimpik Kadro Hazırlık Kampı / Milli Takım Hazırlık Kampı','Muhtelif','Muhtelif','Hazırlık Kampı'],
  ['1 -  Nisan','Decathlon Türkiye\'nin En Hızlısı Grup Yarışmaları (İzmir)','2012-2013-2014-2015-2016','İzmir','Bölge'],
  ['3 - 7 Nisan','3\'üncü CISM Dünya Yarı Maraton Şampiyonası','B','Antalya','Diğer'],
  ['3 - 4 Nisan','4x400 Relay Cup (Road to Gaborone)','B','Sicilya/ITA','INT'],
  ['7 -  Nisan','Decathlon Türkiye\'nin En Hızlısı Grup Yarışmaları (Eskişehir)','2012-2013-2014-2015-2016','Eskişehir','Bölge'],
  ['9 -  Nisan','Decathlon Türkiye\'nin En Hızlısı Grup Yarışmaları (Ordu)','2012-2013-2014-2015-2016','Ordu','Bölge'],
  ['11 -  Nisan','Road-To-Botswana Golden Grand Prix','B','Gaborone/BOT','WA-Cont.Tour Challenger'],
  ['11 - 12 Nisan','MEB Okullar Yıldızlar Puanlı Atletizm Grup Yarışmaları','2011-2012-2013','Adana / Konya / Erzincan / Diyarbakır / Kocaeli / Eskişehir','Okul-SGM'],
  ['11 - 12 Nisan','MEB Okullar Küçükler Puanlı Atletizm Grup Yarışmaları','2014-2015','Adana / Konya / Erzincan / Diyarbakır / Kocaeli / Eskişehir','Okul-SGM'],
  ['12 -  Nisan','Dünya Takımlar Yürüyüş Şampiyonası','B','Brasilia/BRA','WA'],
  ['14 -  Nisan','Decathlon Türkiye\'nin En Hızlısı Grup Yarışmaları (İstanbul-Anadolu)','2012-2013-2014-2015-2016','İstanbul','Bölge'],
  ['16 -  Nisan','Decathlon Türkiye\'nin En Hızlısı Grup Yarışmaları (İstanbul-Avrupa)','2012-2013-2014-2015-2016','İstanbul','Bölge'],
  ['18 - 19 Nisan','Nurullah İvak Atmalar Kupası','B-U20-U18-U16','İzmir','WA-Cont.Tour Challenger'],
  ['18 - 19 Nisan','Atmalar Ligi Final Yarışması','U18','İzmir','Kulüp'],
  ['19 -  Nisan','Balkan Maraton Şampiyonası','B','Belgrade/SRB','BA'],
  ['19 -  Nisan','İstanbul Yarı Maratonu','B','İstanbul','INT'],
  ['19 -  Nisan','Hüseyin Aktaş Yarı Maraton Türkiye Şampiyonası','B','İstanbul','Ulusal Şamp.'],
  ['20 - 25 Nisan','Rabat 2026 WPA Grand Prix','Muhtelif','Rabat/MOR','ParaAthletic'],
  ['20 - 26 Nisan','Ulusal Egemenlik Günü Bayrak Yarışmaları','U16-U14-U12','Tüm İllerde','İl'],
  ['21 -  Nisan','Decathlon Türkiye\'nin En Hızlısı Final','2012-2013-2014-2015-2016','İstanbul','Ulusal'],
  ['25 - 26 Nisan','MEB Okullar Gençler A Puanlı Atletizm Grup Yarışmaları','2007-2008-2009-2010-2011','Adana / Konya / İzmir / Diyarbakır / Kocaeli / Ordu','Okul-SGM'],
  ['25 - 26 Nisan','MEB Okullar Gençler B Puanlı Atletizm Grup Yarışmaları','2010-2011','Adana / Konya / İzmir / Diyarbakır / Kocaeli / Ordu','Okul-SGM'],
  ['25 -  Nisan','Masterlar Mesafeler ve Atmalar Kupası','Muhtelif','YBD','Ulusal'],
  ['2 - 3 Mayıs','Dünya Bayrak Şampiyonası','B','Gaborone/BOT','WA'],
  ['2 -  Mayıs','2. Soner Coşan Sprint-Engel & Relay Cup','B-U20-U18','İzmir','Ulusal'],
  ['2 - 24 Mayıs','11. TAF Küçükler Atletizm İl Seçmeleri','U14','İllerde','Bölge'],
  ['2 -  Mayıs','Sabahattin Mayruk Atmalar Olimpik ve SEM Deneme','B-U20-U18-U16','Mersin','Ulusal'],
  ['3 -  Mayıs','2. İbrahim Halil Çömlekçi Pole Vault Cup ve Atlamalar Olimpik ve SEM Deneme','B-U20-U18-U16','Mersin','Ulusal'],
  ['3 -  Mayıs','Muharrem Dalkılıç 10.000m Türkiye Şampiyonası ve Mesafeler Olimpik ve SEM Deneme','B-U23-U20-U18-U16','İzmir','Ulusal'],
  ['8 -  Mayıs','Diamond League - Doha','B','Doha/QAT','WA-Diamond League'],
  ['9 - 10 Mayıs','MEB Okullar Küçükler Puanlı Atletizm Türkiye Şampiyonası','2014-2015','Bursa','Okul-SGM'],
  ['9 - 10 Mayıs','MEB Okullar Yıldızlar Puanlı Atletizm Türkiye Şampiyonası','2011-2012-2013','Bursa','Okul-SGM'],
  ['15 Mayıs - 15 Haziran','Naili Moran Yaş Grupları İl Seçmeleri','U16-U14','İllerde','Bölge'],
  ['16 -  Mayıs','Diamond League - Shanghai','B','Shanghai/CHN','WA-Diamond League'],
  ['16 - 17 Mayıs','Sprint, Engel ve Teknik Branşları Olimpik ve SEM Deneme Yarışması','B-U20-U18-U16','YBD','Ulusal'],
  ['16 - 17 Mayıs','Orta ve Uzun Mesafe Branşları Olimpik ve SEM Deneme Yarışması','B-U20-U18-U16','YBD','Ulusal'],
  ['16 - 17 Mayıs','MEB Okullar Gençler A Puanlı Atletizm Türkiye Şampiyonası','2007-2008-2009-2010-2011','Eskişehir','Okul-SGM'],
  ['16 - 17 Mayıs','MEB Okullar Gençler B Puanlı Atletizm Türkiye Şampiyonası','2010-2011','Eskişehir','Okul-SGM'],
  ['16 - 17 Mayıs','Gençlik Kupası Atletizm Yarışmaları','U18-U16-U14-U12','İstanbul / Maltepe','Diğer'],
  ['17 -  Mayıs','Türkiye Yürüyüş Şampiyonası','B-U20-U18-U16','İzmir','Ulusal'],
  ['18 - 23 Mayıs','Nottwil 2026 WPA Grand Prix','Muhtelif','Nottwil/SUI','ParaAthletic'],
  ['19 -  Mayıs','19 Mayıs Samsun Yarı Maratonu ve Ahmet Aytar Yarı Maraton Ligi Final Yarışması','B','Samsun','Ulusal'],
  ['19 -  Mayıs','9. Bayrak Takım Yarışmaları','U16-U14-U12','İllerde','Bölge'],
  ['22 - 24 Mayıs','Olimpik Teknik Kurul Toplantısı','','Eskişehir','Diğer'],
  ['23 -  Mayıs','Diamond League - Xiamen','B','Xiamen/CHN','WA-Diamond League'],
  ['23 - 24 Mayıs','Orhan Altan Komple Atlet Açık Saha Ligi 1. Ayak','B-U20-U18-U16','Konya','Ulusal'],
  ['23 - 24 Mayıs','European Clubs Cup Senior Track&Field 2026 Castellón','B','Castellón/ESP','INT'],
  ['26 - 30 Mayıs','Kurban Bayramı Tatili','','','Diğer'],
  ['28 - 30 Mayıs','76. Boris Hanžeković Memorial','B','Zagreb/CRO','WA-Cont.Tour Gold'],
  ['31 -  Mayıs','Diamond League - Rabat','B','Rabat/MAR','WA-Diamond League'],
  ['1 - 29 Haziran','Olimpik Kadro ve Major Şampiyonalar Hazırlık Kampı','Muhtelif','Muhtelif','Hazırlık Kampı'],
  ['3 -  Haziran','Paavo Nurmi Games','B','Turku/FIN','WA-Cont.Tour Gold'],
  ['4 -  Haziran','Diamond League - Golden Gala','B','Roma/ITA','WA-Diamond League'],
  ['6 -  Haziran','İzmir Cup','B-U20-U18','İzmir','WA-Cont.Tour Challenger'],
  ['6 - 7 Haziran','Olimpik Deneme (Büyükler Balkan Şampiyonası Seçmesi)','B','İzmir','Ulusal'],
  ['7 -  Haziran','Diamond League - BAUHAUS-Galan','B','Stockholm/SWE','WA-Diamond League'],
  ['8 - 10 Haziran','Aycan Önel U14 Türkiye Şampiyonası','U14','Ankara/TED Koleji Gölbaşı Tesisleri','Ulusal Şamp.'],
  ['10 -  Haziran','Diamond League - Oslo Bislett Games','B','Oslo/NOR','WA-Diamond League'],
  ['12 - 19 Haziran','Tunis 2026 WPA Grand Prix','Muhtelif','Tunus/TUN','ParaAthletic'],
  ['16 -  Haziran','65th Ostrava Golden Spike','B','Ostrava/CZE','WA-Cont.Tour Gold'],
  ['16 - 18 Haziran','U18 Türkiye Şampiyonası (U18 Balkan Şampiyonası Milli Takım Seçme)','U18','Eskişehir','Ulusal'],
  ['20 - 21 Haziran','11. TAF Küçükler Atletizm Yarı Final Grup Yarışmaları','U14','Grup Merkezlerinde','Ulusal'],
  ['20 - 21 Haziran','Büyükler Balkan Şampiyonası','B','Volos/GRE','BA'],
  ['21 -  Haziran','FBK Games','B','Hengelo/NED','WA-Cont.Tour Gold'],
  ['22 - 23 Haziran','Aydın Onur U20 Türkiye Şampiyonası (U20 Balkan ve Dünya Seçmesi)','U20','Eskişehir','Ulusal'],
  ['25 - 28 Haziran','Olimpik Teknik Kurul Toplantısı','','İzmir','Diğer'],
  ['26 - 28 Haziran','Orhan Altan Komple Atlet Açık Saha Ligi Finali','B-U20-U18-U16','İzmir','Ulusal'],
  ['26 -  Haziran','Diamond League - Paris','B','Paris/FRA','WA-Diamond League'],
  ['27 - 28 Haziran','Süper Lig 1. Kademe','B','İzmir','Kulüp'],
  ['27 - 28 Haziran','Anadolu Yıldızlar Ligi 1. Etap 1. Grup','2012-2013-2014-2015','Çanakkale','Bölge'],
  ['27 - 28 Haziran','Anadolu Yıldızlar Ligi 1. Etap 2. Grup','2012-2013-2014-2015','Kütahya','Bölge'],
  ['27 - 28 Haziran','Anadolu Yıldızlar Ligi 1. Etap 3. Grup','2012-2013-2014-2015','Kahramanmaraş','Bölge'],
  ['27 - 28 Haziran','Anadolu Yıldızlar Ligi 1. Etap 4. Grup','2012-2013-2014-2015','Sivas','Bölge'],
  ['27 - 28 Haziran','Anadolu Yıldızlar Ligi 1. Etap 5. Grup','2012-2013-2014-2015','Çorum','Bölge'],
  ['27 - 28 Haziran','Anadolu Yıldızlar Ligi 1. Etap 6. Grup','2012-2013-2014-2015','Ordu','Bölge'],
  ['27 - 28 Haziran','Anadolu Yıldızlar Ligi 1. Etap 7. Grup','2012-2013-2014-2015','Kars','Bölge'],
  ['27 - 28 Haziran','Anadolu Yıldızlar Ligi 1. Etap 8. Grup','2012-2013-2014-2015','Diyarbakır','Bölge'],
  ['30 -  Haziran','Gyulai István Memorial - Hungarian Athletics Gran Prix','B','Székesfehérvár/HUN','WA-Cont.Tour Gold'],
  ['30 Haziran - 2 Temmuz','Edip Akarsu U16 Türkiye Şampiyonası','U16','Eskişehir','Ulusal'],
  ['1 - 30 Temmuz','İl Karmaları Bayrak Yarışmaları','U16-U14-U12','İllerde','Bölge'],
  ['1 - 29 Temmuz','Olimpik Kadro ve Major Şampiyonalar Hazırlık Kampı','Muhtelif','Muhtelif','Hazırlık Kampı'],
  ['3 - 5 Temmuz','Yeşilay U23 ve Büyükler Türkiye Şampiyonası (Çoklu Branşlar Dahil)','B-U23','İzmir','Ulusal Şamp.'],
  ['3 - 5 Temmuz','Para-Atlet Ulusal Sınıflandırma / Para-Atlet Türkiye Şampiyonası','Muhtelif','Batman','ParaAthletic'],
  ['4 - 5 Temmuz','Ercan Erden Throwing Cup','B-U20-U18-U16-U14','İzmir','Ulusal'],
  ['4 -  Temmuz','Diamond League - Prefontaine Classic','B','Eugene, OR/USA','WA-Diamond League'],
  ['4 -  Temmuz','U18 Balkan Şampiyonası','U18','Novo Mesto/SLO','BA'],
  ['5 - 7 Temmuz','Avrupa Off-Road Şampiyonası','B','Kamnik/SLO','EA'],
  ['9 - 10 Temmuz','U16 Kulüpler Türkiye Şampiyonası (Açık)','U16','Eskişehir','Kulüp'],
  ['10 -  Temmuz','Diamond League - Herculis EBS','B','Monaco/MON','WA-Diamond League'],
  ['11 -  Temmuz','U20 Balkan Şampiyonası','','Craiova/ROM','BA'],
  ['11 -  Temmuz','81. Cezmi Or Kupası','B','İstanbul/ENKA','WA-Cont.Tour Challenger'],
  ['14 - 15 Temmuz','11. TAF Küçükler Atletizm Final Yarışması','U14','Konya','Ulusal'],
  ['16 - 19 Temmuz','Avrupa U18 Şampiyonası','U18','Rieti/ITA','EA'],
  ['18 -  Temmuz','Diamond League - London','B','London/GBR','WA-Diamond League'],
  ['18 - 19 Temmuz','Naili Moran Yaş Grupları Atletizm Final Yarışması','U16-U14','İzmir','Ulusal'],
  ['18 - 19 Temmuz','Masterlar Türkiye Şampiyonası','Muhtelif','Eskişehir','Ulusal'],
  ['22 - 23 Temmuz','Nuri Turan Kulüpler 1. Lig 1. Kademe Yarışması (Açık)','B','İstanbul/Burhan Felek','Kulüp'],
  ['25 - 26 Temmuz','Süper Lig Finali','B','İzmir','Kulüp'],
  ['26 -  Temmuz','Aynur Ayhan Yürüyüş Kulüpler Türkiye Şampiyonası','B-U20-U18-U16','İzmir','Kulüp'],
  ['28 - 29 Temmuz','Nuri Turan Kulüpler 1. Lig Final Yarışması','B','İstanbul/Burhan Felek','Kulüp'],
  ['28 - 31 Temmuz','1. SEM Atletizm Festivali','U18-U16-U14','Konya','Ulusal'],
  ['1 -  Ağustos','2. Hüseyin Manioğlu Kupası ve Olimpik ve SEM Deneme','B-U20-U18-U16','İzmir','Ulusal'],
  ['1 - 29 Ağustos','Olimpik Kadro ve Major Şampiyonalar Hazırlık Kampı','Muhtelif','Muhtelif','Hazırlık Kampı'],
  ['5 - 9 Ağustos','Dünya U20 Şampiyonası','U20','Eugene, OR/USA','WA'],
  ['8 -  Ağustos','2. Fahir Özgüden Sprint & Hurdles Cup','Muhtelif','İstanbul/Burhan Felek','Ulusal'],
  ['10 - 16 Ağustos','Avrupa Şampiyonası','B','Birmingham/GBR','EA'],
  ['11 - 13 Ağustos','Anadolu Yıldızlar Ligi 2. Etap 1. Grup','2012-2013-2014-2015','Eskişehir','Bölge'],
  ['11 - 13 Ağustos','Anadolu Yıldızlar Ligi 2. Etap 2. Grup','2012-2013-2014-2015','Isparta','Bölge'],
  ['11 - 13 Ağustos','Anadolu Yıldızlar Ligi 2. Etap 3. Grup','2012-2013-2014-2015','Trabzon','Bölge'],
  ['11 - 13 Ağustos','Anadolu Yıldızlar Ligi 2. Etap 4. Grup','2012-2013-2014-2015','Adıyaman','Bölge'],
  ['15 - 16 Ağustos','U18 Kulüpler Türkiye Şampiyonası (Açık)','U18','Kütahya','Kulüp'],
  ['19 -  Ağustos','39. Sadi Gülçelik Yarışmaları','U18-U16','İstanbul/ENKA','Kulüp'],
  ['21 -  Ağustos','Diamond League - Athletissima Lausanne','B','Lausanne/SUI','WA-Diamond League'],
  ['21 Ağustos - 3 Eylül','Akdeniz Oyunları','','Taranto/ITA','INT'],
  ['22 - 23 Ağustos','U20 Kulüpler Ligi Final','U20','Konya','Kulüp'],
  ['23 -  Ağustos','Diamond League - Silesia','B','Chorzów/POL','WA-Diamond League'],
  ['27 -  Ağustos','Diamond League - Weltklasse Zürich','B','Zürich/SUI','WA-Diamond League'],
  ['28 - 29 Ağustos','Anadolu Yıldızlar Ligi Pist Yarışmaları Final Müsabakası','2012-2013-2014-2015','Denizli','Ulusal'],
  ['4 - 5 Eylül','Diamond League Finals - Memorial van Damme','B','Bruxelles/BEL','WA-Diamond League'],
  ['6 -  Eylül','18. İsmail Akçay Uluslararası Yol Koşusu (10km)','','Balıkesir','Ulusal'],
  ['11 - 13 Eylül','Dünya Ultimate Şampiyonası','B','Budapest/HUN','WA'],
  ['17 - 20 Eylül','Balkan Masterler Pist Şampiyonası','Master','Craiova/ROM','INT'],
  ['19 - 20 Eylül','Dünya Yol Koşuları Şampiyonası','B','København/DEN','WA'],
  ['9 - 11 Ekim','Olimpik ve Paralimpik Kurul Toplantısı','','Ankara','Diğer'],
  ['10 - 24 Ekim','Eşref Aydın Bölgesel Kros Mahalli Seçmeler','U18-U16','İllerde','Bölge'],
  ['18 -  Ekim','Balkan Yarı Maraton Şampiyonası','B','Apatin/SRB','BA'],
  ['18 -  Ekim','Balkan Kros Şampiyonası Milli Takım Seçme Yarışmaları','','Adana','Ulusal'],
  ['30 Ekim - 15 Kasım','Youth Olympic Games','','Dakar/SEN','INT'],
  ['31 -  Ekim','Eşref Aydın Bölgesel Kros Ligi 1. Kademe Yarışması','U18-U16','Grup Merkezlerinde','Bölge'],
  ['1 -  Kasım','Şevki Koru Türkiye Maraton Şampiyonası','','İstanbul','Ulusal Şamp.'],
  ['1 -  Kasım','Türkiye İş Bankası 48. İstanbul Maratonu','','İstanbul','INT'],
  ['1 - 29 Kasım','Olimpik Kadro ve Avrupa Kros Şampiyonası Hazırlık Kampı','Muhtelif','Muhtelif','Hazırlık Kampı'],
  ['7 -  Kasım','Balkan Kros Şampiyonası','','Koyonare/BUL','BA'],
  ['7 -  Kasım','Masterlar Kros Türkiye Şampiyonası','Muhtelif','Antalya','Ulusal'],
  ['10 -  Kasım','Atatürk\'ü Anma Kros Yarışması','U18-U16-U14','Ankara','Ulusal'],
  ['15 -  Kasım','71. Ömer Besim Koşalay Kros Yarışması & Kros Türkiye Şampiyonası','','İstanbul','Ulusal Şamp.'],
  ['21 -  Kasım','Eşref Aydın Bölgesel Kros Ligi Yarı Final Yarışması','U18-U16','YBD','Bölge'],
  ['24 -  Kasım','Canım Öğretmenim Yol Koşusu','U16-U14-U12','İllerde','İl'],
  ['1 - 29 Aralık','Olimpik Kadro Hazırlık Kampı / Milli Takım Hazırlık Kampı','Muhtelif','Muhtelif','Hazırlık Kampı'],
  ['5 - 6 Aralık','Salon Olimpik Deneme','B-U20-U18','Bursa','Ulusal'],
  ['6 -  Aralık','Valencia Maratonu','B','Valencia/ESP','INT'],
  ['12 -  Aralık','Eşref Aydın Bölgesel Kros Ligi Final Yarışması','U18-U16','YBD','Bölge'],
  ['12 - 13 Aralık','Salon Rekor Deneme','B-U20-U18','İstanbul','Ulusal'],
  ['13 -  Aralık','32. SPAR Avrupa Kros Şampiyonası','','Belgrad/SRB','EA'],
  ['26 - 27 Aralık','Selahattin Yıldız Salon Kupası','B-U20-U18','İstanbul','Ulusal'],
  ['27 -  Aralık','91. Büyük Atatürk Koşusu','B','Ankara','Ulusal'],
];

const TODAY = new Date('2026-05-05');

function buildSchedule() {
  const result = [];
  for (const [dateStr, name, ageGroup, location, kategori] of RAW) {
    const dates = parseDate(dateStr);
    if (!dates) continue; // skip entries with no parseable date
    const type = mapType(kategori);
    const endDate = new Date(dates.end);
    const status = endDate < TODAY ? 'completed' : 'planned';
    const notes = [ageGroup, kategori].filter(s => s && s !== '0' && s !== 'Muhtelif').join(' | ');
    result.push({
      id: mkId(),
      name,
      dateStart: dates.start,
      dateEnd: dates.end,
      location: location || '',
      type,
      status,
      notes,
    });
  }
  return result;
}

function apiRequest(method, url, data) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = data ? JSON.stringify(data) : null;
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(body ? {'Content-Length': Buffer.byteLength(body)} : {})
      }
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({status: res.statusCode, body: JSON.parse(d)}); }
        catch { resolve({status: res.statusCode, body: d}); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  console.log('Building schedule from PDF data...');
  const schedule = buildSchedule();
  console.log(`Generated ${schedule.length} entries.`);

  console.log('Fetching current data from server...');
  const {status: s1, body: current} = await apiRequest('GET', API_URL);
  if (s1 !== 200) {
    console.error('Failed to fetch current data. Status:', s1);
    process.exit(1);
  }
  console.log('Current keys:', Object.keys(current).join(', '));

  // Merge schedule into current data
  current.schedule = schedule;

  console.log('Pushing updated data...');
  const {status: s2, body: result} = await apiRequest('POST', API_URL, current);
  if (s2 === 200 && result.ok) {
    console.log(`✅ Done! ${schedule.length} competitions loaded into the schedule.`);
  } else {
    console.error('❌ Push failed. Status:', s2, 'Response:', JSON.stringify(result));
    process.exit(1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
