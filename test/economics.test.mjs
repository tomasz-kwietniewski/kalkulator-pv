/**
 * Ekonomia inwestycji: rozbicie kosztu na pozycje, rozdzielanie kwoty lacznej z oferty,
 * kaskada od kwoty z oferty do nakladu realnego i dwa czasy zwrotu.
 *
 * Te liczby trafiaja wprost pod decyzje na kilkadziesiat tysiecy zlotych, a wiekszosc
 * z nich uzytkownik moze sprawdzic na kartce. Jesli suma pol nie zgadza sie z kwota,
 * ktora sam wpisal, slusznie przestanie ufac calej reszcie.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { symuluj, krzywaMagazynu } from '../src/engine.js';
import {
  CENNIK_ODNIESIENIA, POZYCJE_KOSZTU, pozycjeZCennika, sumaPozycji, rozdzielKwote,
  kosztInstalacji, ulgaTermomodernizacyjna, kaskadaNakladu, zwrot, zwrotDwutorowo,
  ULGA, WIDELKI_OFERT_2025, WIDELKI_EPS, PME2, dotacjaPME2, cenaSklepowaMagazynu,
  widelkiRynkowe, pojemnoscModulowa, MODULY_MAGAZYNU, MODUL_DOMYSLNY,
} from '../src/economics.js';

const profile = JSON.parse(readFileSync(new URL('./profiles_raw.json', import.meta.url)));

test('pozycje z cennika sumuja sie do kosztu instalacji', () => {
  const cfg = { kWp: 9, magazynKWh: 15, zasilanieAwaryjne: true };
  const p = pozycjeZCennika(cfg);
  assert.equal(sumaPozycji(p), kosztInstalacji(cfg));

  // Ceny z cennika sa szacunkiem i wychodza zaokraglone do stu zlotych - kwota
  // w rodzaju "18 896 zl" udawalaby precyzje, ktorej nie ma.
  const doStu = (v) => Math.round(v / 100) * 100;
  assert.equal(p.panele, doStu(9 * CENNIK_ODNIESIENIA.zlZaKWpZPanelami));
  assert.equal(p.falownik, doStu(CENNIK_ODNIESIENIA.falownikHybrydowy));
  // 15 kWh to trzy moduly po 5,12, czyli placi sie za 15,36 kWh
  assert.equal(p.magazyn,
    doStu(CENNIK_ODNIESIENIA.magazynBaza + 15.36 * CENNIK_ODNIESIENIA.magazynZaKWh));
  assert.equal(p.eps, doStu(CENNIK_ODNIESIENIA.zasilanieAwaryjne));
  for (const kwota of Object.values(p)) {
    assert.equal(kwota % 100, 0, `${kwota} nie jest zaokraglone do stu zlotych`);
  }
});

/**
 * Cennik jest pod klucz, wiec kazda pozycja musi pokryc cene sprzetu ze sklepu
 * producenta i jeszcze zostawic cos na montaz. Ten test pilnuje, zeby przy kolejnej
 * aktualizacji cen nie zjechac ponizej samego sprzetu - wtedy kalkulator obiecywalby
 * instalacje tansza, niz kosztuja same czesci.
 */
test('cennik pod klucz pokrywa ceny sprzetu ze sklepu producenta', () => {
  // Sofar sklep, brutto, sierpien 2026.
  const SKLEP = { falownik: 5799, bdu: 1299, modul512: 5299, hydbox: 4299, panelZKonstrukcjaZaKWp: 800 };

  assert.ok(CENNIK_ODNIESIENIA.falownikHybrydowy > SKLEP.falownik,
    'falownik w cenniku nie pokrywa nawet ceny sklepowej');
  assert.ok(CENNIK_ODNIESIENIA.magazynBaza > SKLEP.bdu);
  assert.ok(CENNIK_ODNIESIENIA.zlZaKWpZPanelami > SKLEP.panelZKonstrukcjaZaKWp);
  // Modul 5,12 kWh za 5 299 zl to 1 035 zl/kWh - cennik nie moze zejsc ponizej.
  assert.ok(CENNIK_ODNIESIENIA.magazynZaKWh > SKLEP.modul512 / 5.12);

  // Magazyn 15 kWh: sklep 1 299 + 3 x 5 299 = 17 196 zl za sam sprzet.
  const magazynWCenniku = CENNIK_ODNIESIENIA.magazynBaza + 15 * CENNIK_ODNIESIENIA.magazynZaKWh;
  assert.ok(magazynWCenniku > 17196, `magazyn w cenniku ${magazynWCenniku} zl < 17 196 zl sprzetu`);

  // Zasilanie awaryjne moze byc tansze niz HydBOX, bo istnieja prostsze przelaczniki
  // (980 zl za reczny), ale nie moze byc absurdalnie niskie.
  assert.ok(CENNIK_ODNIESIENIA.zasilanieAwaryjne >= 980
    && CENNIK_ODNIESIENIA.zasilanieAwaryjne <= SKLEP.hydbox + 2000);
});

/**
 * Instalacja pod klucz na dom z tego osiedla ma wypasc w przedziale, ktory Tomasz
 * potwierdzil na cenach sklepowych (40-45 tys. z zasilaniem awaryjnym). Ponizej
 * widelek z 2025 - i tak ma byc, bo sprzet przez rok stanial.
 */
test('calosc dla domu odniesienia miesci sie w dzisiejszych realiach', () => {
  const razem = kosztInstalacji({ kWp: 9, magazynKWh: 15, zasilanieAwaryjne: true });
  assert.ok(razem >= 38000 && razem <= 46000, `${razem} zl poza przedzialem 38-46 tys.`);
  assert.ok(razem < WIDELKI_OFERT_2025.min,
    'dzisiejsza wycena powinna wypadac ponizej najtanszej oferty z 2025');
});

test('domyslna cena zasilania awaryjnego miesci sie w widelkach z ofert', () => {
  assert.ok(CENNIK_ODNIESIENIA.zasilanieAwaryjne >= WIDELKI_EPS.min
    && CENNIK_ODNIESIENIA.zasilanieAwaryjne <= WIDELKI_EPS.max);
});

test('bez magazynu i bez EPS te pozycje sa zerowe', () => {
  const p = pozycjeZCennika({ kWp: 9, magazynKWh: 0, zasilanieAwaryjne: false });
  assert.equal(p.magazyn, 0);
  assert.equal(p.eps, 0);
  assert.ok(p.panele > 0 && p.falownik > 0);
});

/**
 * Rozdzielanie kwoty lacznej. Warunek nadrzedny jest jeden: suma pol MUSI rownac sie
 * kwocie, ktora uzytkownik wpisal - co do zlotowki, niezaleznie od reszt z zaokraglen.
 */
test('rozdzielona kwota zawsze sumuje sie do wpisanej', () => {
  const bazowe = pozycjeZCennika({ kWp: 9, magazynKWh: 15, zasilanieAwaryjne: true });
  // Kwoty dobrane tak, zeby trafic w reszty niepodzielne przez liczbe pozycji.
  for (const kwota of [0, 1, 2, 3, 7, 999, 43446, 55208, 68273, 100001, 123457]) {
    const r = rozdzielKwote(kwota, bazowe);
    assert.equal(sumaPozycji(r), kwota, `kwota ${kwota} rozjechala sie o ${sumaPozycji(r) - kwota} zl`);
    POZYCJE_KOSZTU.forEach((k) => assert.ok(r[k] >= 0, `pozycja ${k} wyszla ujemna przy ${kwota} zl`));
  }
});

test('rozdzielanie zachowuje proporcje pozycji', () => {
  const bazowe = { panele: 15480, falownik: 8999, magazyn: 22599, eps: 3500 };
  const suma = sumaPozycji(bazowe);
  const r = rozdzielKwote(suma * 2, bazowe);
  POZYCJE_KOSZTU.forEach((k) => {
    assert.ok(Math.abs(r[k] - bazowe[k] * 2) <= 1,
      `pozycja ${k}: ${r[k]} zamiast ok. ${bazowe[k] * 2}`);
  });
});

test('rozdzielanie nie ozywia pozycji, ktorych w ofercie nie ma', () => {
  // Instalacja bez magazynu i bez EPS: podwojenie kwoty nie moze wyczarowac magazynu.
  const bezMagazynu = { panele: 15480, falownik: 8999, magazyn: 0, eps: 0 };
  const r = rozdzielKwote(50000, bezMagazynu);
  assert.equal(r.magazyn, 0);
  assert.equal(r.eps, 0);
  assert.equal(sumaPozycji(r), 50000);
});

test('rozdzielanie z pustych pol wklada calosc w panele', () => {
  const r = rozdzielKwote(50000, { panele: 0, falownik: 0, magazyn: 0, eps: 0 });
  assert.equal(r.panele, 50000);
  assert.equal(sumaPozycji(r), 50000);
});

/* --- droga od kwoty z oferty do tego, co zostaje w kieszeni --- */

test('ulge liczymy od kwoty juz pomniejszonej o dotacje', () => {
  // 50 000 zl kosztu, 20 000 zl dotacji, PIT wg skali 12%: podstawa to 30 000, nie 50 000.
  const k = kaskadaNakladu({ koszt: 50000, dotacja: 20000, stawka: 'skala12' });
  assert.equal(k.poDotacji, 30000);
  assert.equal(Math.round(k.ulga), 3600);
  assert.equal(Math.round(k.naklad), 26400);
});

test('limit ulgi obowiazuje na podatnika i podwaja sie dla malzonkow', () => {
  const jeden = ulgaTermomodernizacyjna({ koszt: 90000, stawka: 'skala32', podatnicy: 1 });
  const dwoje = ulgaTermomodernizacyjna({ koszt: 90000, stawka: 'skala32', podatnicy: 2 });
  assert.equal(Math.round(jeden), Math.round(ULGA.limitNaPodatnika * 0.32));
  // Przy dwoch podatnikach limit 106 000 zl przewyzsza koszt, wiec liczy sie caly koszt.
  assert.equal(Math.round(dwoje), Math.round(90000 * 0.32));
});

test('bez podatku ulga jest warta zero, a naklad rowna sie kwocie po dotacji', () => {
  const k = kaskadaNakladu({ koszt: 50000, dotacja: 0, stawka: 'brak' });
  assert.equal(k.ulga, 0);
  assert.equal(k.naklad, 50000);
});

test('dotacja wieksza od kosztu nie robi z nakladu liczby ujemnej', () => {
  const k = kaskadaNakladu({ koszt: 20000, dotacja: 30000, stawka: 'skala32' });
  assert.equal(k.dotacja, 20000);
  assert.equal(k.poDotacji, 0);
  assert.equal(k.ulga, 0);
  assert.equal(k.naklad, 0);
});

/* --- czas zwrotu --- */

test('zwrot od pelnej kwoty nigdy nie jest szybszy niz po odzyskach', () => {
  const w = zwrotDwutorowo({
    koszt: 55208, naklad: 38000, oszczednoscRoczna: 6000, wzrostCen: 0.04,
  });
  assert.ok(w.odPelnejKwoty.rokZwrotu > w.poOdzyskach.rokZwrotu);
  // Obie liczby musza byc sensowne, a nie null - przy 6 000 zl rocznie 55 tys. wraca.
  assert.ok(w.poOdzyskach.rokZwrotu > 0 && w.odPelnejKwoty.rokZwrotu < 20);
});

test('brak oszczednosci znaczy brak zwrotu, a nie zwrot w roku zerowym', () => {
  const w = zwrot({ naklad: 50000, oszczednoscRoczna: 0 });
  assert.equal(w.rokZwrotu, null);
  assert.ok(w.saldoKoncowe < 0);
});

test('punkt zwrotu lezy tam, gdzie skumulowany bilans przecina zero', () => {
  const w = zwrot({ naklad: 50000, oszczednoscRoczna: 5000, wzrostCen: 0, degradacja: 0 });
  // Bez wzrostu cen i bez degradacji to czysta arytmetyka: 50 000 / 5 000 = 10 lat.
  assert.ok(Math.abs(w.rokZwrotu - 10) < 1e-9, `wyszlo ${w.rokZwrotu}`);
  assert.equal(Math.round(w.przeplyw[10]), 0);
});

/* --- krzywa nasycenia magazynu --- */

test('autokonsumpcja rosnie z pojemnoscia magazynu i sie wyplaszcza', () => {
  const wspolne = {
    kWp: 9, orientacja: 'poludnie',
    zuzycieDomuKWh: profile.meta.zuzycie_domu_kWh,
    poborAutaKWh: profile.meta.pobor_auta_kWh,
    // Bez dobierania z sieci, zeby mierzyc sam efekt pojemnosci. Dobieranie nocne
    // zmienia import, ale jest osobna decyzja o konfiguracji falownika.
    ladowanieZSieci: false,
  };
  const pojemnosci = [0, 5, 10, 15, 20, 25, 30];
  const krzywa = krzywaMagazynu(wspolne, profile, pojemnosci);

  console.log('\n  magazyn   autokons.  samowyst.   eksport');
  krzywa.forEach((p) => {
    console.log(`  ${String(p.magazynKWh).padStart(5)} kWh ${p.autokonsumpcja.toFixed(1).padStart(8)}%`
      + `${p.samowystarczalnosc.toFixed(1).padStart(10)}% ${p.eksportKWh.toFixed(0).padStart(9)} kWh`);
  });

  for (let i = 1; i < krzywa.length; i++) {
    assert.ok(krzywa[i].autokonsumpcja >= krzywa[i - 1].autokonsumpcja,
      `autokonsumpcja spadla miedzy ${krzywa[i - 1].magazynKWh} a ${krzywa[i].magazynKWh} kWh`);
    assert.ok(krzywa[i].eksportKWh <= krzywa[i - 1].eksportKWh,
      `eksport wzrosl miedzy ${krzywa[i - 1].magazynKWh} a ${krzywa[i].magazynKWh} kWh`);
  }
  krzywa.forEach((p) => {
    assert.ok(p.autokonsumpcja >= 0 && p.autokonsumpcja <= 100);
    assert.ok(p.samowystarczalnosc >= 0 && p.samowystarczalnosc <= 100);
  });

  // Nasycenie: przyrost z 25 na 30 kWh musi byc wyraznie mniejszy niz z 0 na 5 kWh.
  const pierwszy = krzywa[1].autokonsumpcja - krzywa[0].autokonsumpcja;
  const ostatni = krzywa[6].autokonsumpcja - krzywa[5].autokonsumpcja;
  console.log(`\n  pierwsze 5 kWh daje ${pierwszy.toFixed(1)} pkt proc., `
    + `ostatnie 5 kWh juz tylko ${ostatni.toFixed(1)}\n`);
  assert.ok(ostatni < pierwszy / 2,
    `krzywa sie nie wyplaszcza: pierwszy przyrost ${pierwszy.toFixed(1)}, ostatni ${ostatni.toFixed(1)}`);
});

test('magazyn zmniejsza eksport, ale nie zmienia produkcji', () => {
  const wspolne = {
    kWp: 9, zuzycieDomuKWh: profile.meta.zuzycie_domu_kWh,
    poborAutaKWh: profile.meta.pobor_auta_kWh, ladowanieZSieci: false,
  };
  const bez = symuluj({ ...wspolne, magazynKWh: 0 }, profile);
  const z = symuluj({ ...wspolne, magazynKWh: 15 }, profile);
  assert.ok(Math.abs(bez.produkcja - z.produkcja) < 1, 'magazyn nie moze zmieniac produkcji PV');
  assert.ok(z.eksportKWh < bez.eksportKWh);
  assert.ok(z.importKWh < bez.importKWh);
});

/* --- dotacja PME 2 ------------------------------------------------------------- */

test('przy realnych cenach magazynu wiaze 30% kosztu, a nie limit 800 zl/kWh', () => {
  // Cennik kalkulatora: magazyn 15 kWh to 2 000 + 15 x 1 100 = 18 500 zl.
  const koszt = pozycjeZCennika({ kWp: 9, magazynKWh: 15 }).magazyn;
  const d = dotacjaPME2({ pojemnoscKWh: 15, kosztMagazynu: koszt });
  assert.equal(d.wiaze, 'udzialKosztow');
  assert.equal(d.kwota, Math.round(0.3 * koszt));
  // Limit pojemnosciowy bylby dwa razy wyzszy - i to jest sedno sprawy.
  assert.ok(d.kwota < PME2.zlZaKWh * 15);
  console.log(`\n  magazyn 15 kWh za ${koszt} zl -> dotacja ${d.kwota} zl (wiaze ${d.wiaze})`);
});

test('ponizej 10 kWh dotacja nie przysluguje', () => {
  assert.equal(dotacjaPME2({ pojemnoscKWh: 9.9, kosztMagazynu: 30000 }).kwota, 0);
  assert.equal(dotacjaPME2({ pojemnoscKWh: 9.9, kosztMagazynu: 30000 }).wiaze, 'zaMalyMagazyn');
  assert.ok(dotacjaPME2({ pojemnoscKWh: 10, kosztMagazynu: 13000 }).kwota > 0);
});

/**
 * Sedno konstrukcji programu: pelna dotacje da sie wyjac tylko przy fakturze
 * wyraznie odbiegajacej od cen sprzetu. Ten test pilnuje, zebysmy tego nie zgubili,
 * bo na tym stoi ostrzezenie pokazywane uzytkownikowi.
 */
test('pelne 16 000 zl wymaga faktury okolo dwuipolkrotnie wyzszej niz sklep', () => {
  const pojemnosc = 20;
  const sklep = cenaSklepowaMagazynu(pojemnosc);

  // Uczciwa cena: wiaze 30%, do pelnej dotacji daleko.
  const uczciwa = dotacjaPME2({ pojemnoscKWh: pojemnosc, kosztMagazynu: sklep.kwota });
  assert.equal(uczciwa.wiaze, 'udzialKosztow');
  assert.ok(uczciwa.kwota < PME2.maksNetBilling / 2);

  // Zeby 30% dalo 16 000 zl, faktura musi pokazac ponad 53 tys.
  const potrzebnaKwota = PME2.maksNetBilling / PME2.udzialKosztow;
  const napompowana = dotacjaPME2({ pojemnoscKWh: pojemnosc, kosztMagazynu: potrzebnaKwota });
  assert.equal(napompowana.kwota, PME2.maksNetBilling);
  const krotnosc = potrzebnaKwota / sklep.kwota;
  console.log(`  20 kWh: sklep ${sklep.kwota} zl -> dotacja ${uczciwa.kwota} zl; `
    + `zeby wyjac ${PME2.maksNetBilling} zl faktura musi pokazac ${Math.round(potrzebnaKwota)} zl `
    + `(x${krotnosc.toFixed(1)})`);
  assert.ok(krotnosc > 2, `krotnosc ${krotnosc.toFixed(2)} - ostrzezenie na stronie straciloby sens`);

  // I nadal miesci sie w limicie 3 000 zl/kWh, czyli regulamin na to pozwala.
  assert.ok(potrzebnaKwota / pojemnosc < PME2.maksKosztZaKWh);
});

test('koszt ponad 3 000 zl za kWh nie wchodzi do podstawy', () => {
  const d = dotacjaPME2({ pojemnoscKWh: 10, kosztMagazynu: 90000 });
  assert.equal(d.kosztKwalifikowany, 30000);
  // 30% z 30 000 to 9 000, ale limit pojemnosciowy 800 x 10 = 8 000 jest nizszy.
  assert.equal(d.wiaze, 'zlZaKWh');
  assert.equal(d.kwota, 8000);
});

test('stare opusty daja polowe gornego limitu', () => {
  const duzy = { pojemnoscKWh: 40, kosztMagazynu: 200000 };
  assert.equal(dotacjaPME2({ ...duzy, netBilling: true }).kwota, PME2.maksNetBilling);
  assert.equal(dotacjaPME2({ ...duzy, netBilling: false }).kwota, PME2.maksNetMetering);
});

test('cena sklepowa magazynu liczy sie skokowo, po modulach', () => {
  // Modul ma 5,12 kWh - przy 13 kWh i tak kupuje sie trzy sztuki.
  const trzynascie = cenaSklepowaMagazynu(13);
  const pietnascie = cenaSklepowaMagazynu(15.36);
  assert.equal(trzynascie.modulow, 3);
  assert.equal(trzynascie.kwota, pietnascie.kwota);
  assert.equal(pietnascie.kwota, 1299 + 3 * 5299);
  assert.equal(trzynascie.pojemnoscRzeczywista, 15.36);
  // Powyzej 20,48 kWh potrzebna jest druga jednostka sterujaca.
  assert.equal(cenaSklepowaMagazynu(25).kwota, 2 * 1299 + 5 * 5299);
  assert.equal(cenaSklepowaMagazynu(0).kwota, 0);
});

test('widelki rynkowe skaluja sie z konfiguracja', () => {
  const male = widelkiRynkowe({ kWp: 4, magazynKWh: 0 });
  const duze = widelkiRynkowe({ kWp: 10, magazynKWh: 0 });
  assert.ok(male.min < duze.min && male.max < duze.max, 'wieksza instalacja kosztuje wiecej');
  assert.ok(male.min < male.typowa && male.typowa < male.max, 'typowa lezy w widelkach');

  // 9 kWp musi wypasc miedzy punktami tabeli dla 8 i 10 kWp
  const dziewiec = widelkiRynkowe({ kWp: 9, magazynKWh: 0 });
  assert.ok(dziewiec.min > 20600 && dziewiec.min < 24000, `min ${dziewiec.min}`);
  assert.ok(dziewiec.max > 28300 && dziewiec.max < 33100, `max ${dziewiec.max}`);

  // magazyn dokłada pojemnosc i montaz
  const zMagazynem = widelkiRynkowe({ kWp: 9, magazynKWh: 15 });
  assert.ok(zMagazynem.min - dziewiec.min > 15 * 663, 'magazyn dolicza tez montaz');
  assert.equal(widelkiRynkowe({ kWp: 0, magazynKWh: 0 }).max, 0);
});

test('nasza wycena odniesienia miesci sie w widelkach rynkowych', () => {
  // Kalkulator ma prawo byc tanszy od rynku, ale nie moze wypasc calkiem poza skala -
  // wtedy albo cennik sie zestarzal, albo widelki trzeba odswiezyc.
  const pozycje = pozycjeZCennika({ kWp: 9, magazynKWh: 15, zasilanieAwaryjne: false });
  const nasza = sumaPozycji(pozycje);
  const w = widelkiRynkowe({ kWp: 9, magazynKWh: 15 });
  assert.ok(nasza > w.min * 0.75 && nasza < w.max,
    `nasza wycena ${nasza} wobec widelek ${w.min}-${w.max}`);
});

test('pojemnosc magazynu zaokragla sie w gore do calych modulow', () => {
  assert.equal(pojemnoscModulowa(0), 0);
  assert.equal(pojemnoscModulowa(5.12), 5.12);
  assert.equal(pojemnoscModulowa(13), 15.36, 'trzy moduly, bo polowy modulu nie da sie kupic');
  assert.equal(pojemnoscModulowa(16), 20.48);
  assert.equal(pojemnoscModulowa(15.36), 15.36, 'pelne moduly zostaja bez zmian');
});

test('cennik nie moze wycenic magazynu taniej niz sam sprzet w sklepie', () => {
  // To byl realny blad: przy 13 kWh liniowa cena dawala 16 300 zl, a same moduly
  // (trzy, bo tyle trzeba kupic) kosztuja w sklepie producenta 17 196 zl.
  for (const kWh of [5, 10, 13, 15, 16, 20, 25, 30]) {
    const nasz = pozycjeZCennika({ kWp: 0, magazynKWh: kWh }).magazyn;
    const sklep = cenaSklepowaMagazynu(kWh).kwota;
    assert.ok(nasz > sklep,
      `${kWh} kWh: cennik ${nasz} zl nie pokrywa nawet sprzetu za ${sklep} zl`);
  }
});

test('rozmiar modulu jest parametrem, bo kazdy producent ma swoj', () => {
  // Sofar, Deye i GoodWe maja 5,12 kWh, Huawei 5, Pylontech 4,8, BYD 2,56.
  assert.equal(pojemnoscModulowa(13, 5.12), 15.36);
  assert.equal(pojemnoscModulowa(13, 5), 15);
  assert.equal(pojemnoscModulowa(13, 2.56), 15.36);
  assert.equal(pojemnoscModulowa(13, 6.1), 18.3);
  // zero znaczy "dowolna pojemnosc" - dla ofert podanych jedna liczba
  assert.equal(pojemnoscModulowa(13, 0), 13);
  assert.equal(pojemnoscModulowa(0, 5.12), 0);

  const zSofarem = pozycjeZCennika({ kWp: 0, magazynKWh: 13, modulKWh: 5.12 }).magazyn;
  const zHuawei = pozycjeZCennika({ kWp: 0, magazynKWh: 13, modulKWh: 5 }).magazyn;
  const dowolna = pozycjeZCennika({ kWp: 0, magazynKWh: 13, modulKWh: 0 }).magazyn;
  assert.ok(zSofarem > zHuawei && zHuawei > dowolna, `${zSofarem} / ${zHuawei} / ${dowolna}`);

  assert.ok(MODULY_MAGAZYNU.length >= 5, 'lista modulow ma pokrywac popularne marki');
  assert.equal(MODULY_MAGAZYNU[0].kWh, 0, 'pierwsza opcja to dowolna pojemnosc');
  assert.equal(MODUL_DOMYSLNY, 5.12);
});

test('nietypowa pojemnosc kosztuje tyle, co kupione moduly', () => {
  const trzynascie = pozycjeZCennika({ kWp: 0, magazynKWh: 13 }).magazyn;
  const pelne = pozycjeZCennika({ kWp: 0, magazynKWh: 15.36 }).magazyn;
  assert.equal(trzynascie, pelne, '13 i 15,36 kWh to te same trzy moduly');
  assert.ok(pozycjeZCennika({ kWp: 0, magazynKWh: 16 }).magazyn > trzynascie, 'czwarty modul kosztuje');
  assert.equal(pozycjeZCennika({ kWp: 0, magazynKWh: 0 }).magazyn, 0);
});
