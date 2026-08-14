/**
 * Silnik symulacji instalacji PV z magazynem energii.
 *
 * Liczy godzina po godzinie przez pelny rok (8760 h) na zmierzonym profilu realnego
 * domu, zamiast mnozyc roczne sumy przez zgadniete wspolczynniki. Dzieki temu potrafi
 * odpowiedziec na pytanie, na ktore kalkulatory oparte na wspolczynnikach odpowiadaja
 * najgorzej: ile realnie doklada magazyn energii.
 *
 * Modul nie zna DOM i nie ma zaleznosci - da sie go uruchomic z Node w testach.
 */

/** Kolejnosc godzin w profilu: pierwsza wartosc to 2025-08-01 00:00, dalej co godzine. */
export const GODZIN_W_ROKU = 8760;
export const MIESIACE_PROFILU = [8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7];

export const DOMYSLNE = {
  // Sofar BTS E15-DS5, karta produktu: 15,36 kWh calkowitych / 14,25 kWh uzytkowych.
  // To rozroznienie ma znaczenie - jedna z ofert rynkowych deklarowala 9,8 kWh
  // nominalnie przy 7,71 kWh funkcjonalnych, czyli 79% zamiast 93%.
  udzialUzytkowy: 0.93,
  // Rezerwa na zasilanie awaryjne. Magazyn z EPS nie oddaje calej pojemnosci do
  // autokonsumpcji - czesc stoi zaparkowana na wypadek braku pradu. U Tomasza widac to
  // wprost w danych: SoC praktycznie nigdy nie schodzi ponizej 20% (ponizej 15% spedza
  // 0,2% czasu w roku), a we wrzesniu podloga siega 26%. Z 15,36 kWh do codziennej pracy
  // zostaje wiec ok. 11,4 kWh. To realny koszt funkcji awaryjnej, ktorego oferty nie podaja.
  rezerwaAwaryjna: 0.20,
  // Strata round-trip 10% - wartosc skalibrowana na realnych danych w analyze/scenario.py.
  // Rozkladamy ja symetrycznie na ladowanie i rozladowanie.
  sprawnoscRoundTrip: 0.90,
  // Moc ladowania/rozladowania jako krotnosc pojemnosci (C-rate). 0,5C odpowiada
  // karcie Sofar BTS: 2,5 kW na kazde 5 kWh modulu, czyli 7,5 kW przy 15 kWh.
  cRate: 0.5,
  // Sprawnosc falownika na sciezce PV -> dom (DC/AC).
  sprawnoscFalownika: 0.97,
  // Pobor wlasny ukladu [W] - falownik hybrydowy i BDU magazynu pobieraja prad zawsze,
  // niezaleznie od tego, czy dom cokolwiek robi. Kolumna "zuzycie domu" w danych loggera
  // tego NIE obejmuje, bo to nie jest odbiornik w domu, ale licznik OSD juz tak.
  //
  // Wartosc skalibrowana na zmierzonym roku Tomasza. Sprawdzono i odrzucono po drodze
  // hipoteze, ze cala brakujaca energia to pobor wlasny (wymagalby 55 W i nie tlumaczyl
  // rozkladu importu miedzy strefy) oraz ze to gorsza sprawnosc round-trip (psulaby
  // trafiony eksport). Wlasciwe wyjasnienie to dobieranie magazynu z sieci - patrz nizej.
  poborWlasnyW: 20,
  // Dobieranie magazynu z sieci w taniej strefie: kupujesz tanio noca, oddajesz domowi
  // w drogich godzinach. W falownikach Sofar HYD odpowiada za to tryb "Time of Use".
  //
  // Najpierw wywnioskowane z danych: zuzycie domu przypada na tania strefe w 54%,
  // produkcja PV w 37%, a zmierzony import az w 77,5% - takiej przewagi nie da sie
  // uzyskac samym magazynowaniem PV. Potem POTWIERDZONE w dokumentacji instalacji
  // domu odniesienia: falownik jest ustawiony na Time of Use na stale.
  //
  // Sam harmonogram (godziny i docelowy poziom naladowania) nie jest udokumentowany,
  // wiec docelowyPoziomZSieci pozostaje parametrem skalibrowanym na zmierzonym roku.
  // Domyslnie WLACZONE dla taryf strefowych, bo tylko z ta funkcja model odtwarza
  // zmierzony rozklad importu (76% w taniej strefie wobec 77,5% realnie; bez niej
  // wychodzi 63%, co zawyzaloby rachunek o ok. 390 zl rocznie). Wymaga jednak
  // skonfigurowania falownika - to nie jest zachowanie domyslne po montazu.
  ladowanieZSieci: true,
  docelowyPoziomZSieci: 0.30,
  // Dopelniamy dopiero w ostatnich godzinach taniej strefy, tuz przed droga. Dopelnianie
  // przez cala noc powodowaloby jalowy obieg energii (magazyn napelniany i opróżniany
  // w kolko) i zawyzalo zarowno import, jak i eksport.
  godzinDopelniania: 3,
};

/** Mnoznik rocznego uzysku wzgledem dachu poludniowego. */
export const ORIENTACJE = {
  poludnie: { etykieta: 'Poludnie', mnoznik: 1.0, przesuniecie: 0 },
  poludnieWschodZachod: { etykieta: 'Poludniowy wschod / zachod', mnoznik: 0.95, przesuniecie: 1 },
  wschodZachod: { etykieta: 'Wschod-zachod (dwa polacie)', mnoznik: 0.85, przesuniecie: 2 },
};

/**
 * Odwzorowuje inna orientacje dachu na zmierzonym profilu poludniowym.
 *
 * Dach wschod-zachod to w praktyce dwie polacie: jedna produkuje wczesniej, druga pozniej.
 * Modelujemy to jako srednia z profilu przesunietego o -h i +h godzin, co splaszcza
 * i poszerza dobowa krzywa - a wiec zmienia nie tylko ile energii powstaje, ale i kiedy.
 * To drugie jest wazniejsze, bo decyduje o tym, ile PV trafi wprost do domu.
 */
export function przesunProfil(pv, przesuniecie) {
  if (!przesuniecie) return pv;
  const n = pv.length;
  const wynik = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const wczesniej = pv[(i + przesuniecie) % n];
    const pozniej = pv[(i - przesuniecie + n) % n];
    wynik[i] = 0.5 * (wczesniej + pozniej);
  }
  return wynik;
}

/**
 * @param {object} p parametry instalacji i domu
 * @param {object} profile zawartosc data/profiles.json
 * @returns {object} bilans roczny, serie godzinowe i rozbicie miesieczne
 */
export function symuluj(p, profile) {
  const {
    kWp = 0,
    magazynKWh = 0,
    zuzycieDomuKWh = 0,
    poborAutaKWh = 0,
    orientacja = 'poludnie',
    udzialUzytkowy = DOMYSLNE.udzialUzytkowy,
    rezerwaAwaryjna = DOMYSLNE.rezerwaAwaryjna,
    sprawnoscRoundTrip = DOMYSLNE.sprawnoscRoundTrip,
    cRate = DOMYSLNE.cRate,
    sprawnoscFalownika = DOMYSLNE.sprawnoscFalownika,
    poborWlasnyW = DOMYSLNE.poborWlasnyW,
    trybStrefowy = false,
    grupaTaryfowa = 'G12w',
    ladowanieZSieci = DOMYSLNE.ladowanieZSieci,
    docelowyPoziomZSieci = DOMYSLNE.docelowyPoziomZSieci,
    godzinDopelniania = DOMYSLNE.godzinDopelniania,
  } = p;

  const orient = ORIENTACJE[orientacja] ?? ORIENTACJE.poludnie;
  const pvBaza = przesunProfil(profile.pv_per_kwp, orient.przesuniecie);
  const skalaPv = kWp * orient.mnoznik * sprawnoscFalownika;
  const skalaDomu = zuzycieDomuKWh / 1000;
  const skalaAuta = poborAutaKWh / 1000;

  const pojemnosc = magazynKWh * udzialUzytkowy * (1 - rezerwaAwaryjna);
  const mocMagazynu = magazynKWh * cRate;
  const sprLad = Math.sqrt(sprawnoscRoundTrip);
  const sprRozlad = Math.sqrt(sprawnoscRoundTrip);

  const n = GODZIN_W_ROKU;
  const imp = new Float64Array(n);
  const eksp = new Float64Array(n);
  const poborWlasnyKWh = (magazynKWh > 0 || kWp > 0) ? poborWlasnyW / 1000 : 0;
  const maskaStrefy = grupaTaryfowa !== 'G11'
    ? profile[`strefa_tania_${grupaTaryfowa.toLowerCase()}`] : null;
  const strefaTania = trybStrefowy ? maskaStrefy : null;
  const oknoDopelniania = (ladowanieZSieci && maskaStrefy)
    ? oknoPrzedDrogaStrefa(maskaStrefy, godzinDopelniania) : null;
  const progDopelniania = pojemnosc * 0.15;
  let soc = 0;
  let produkcja = 0, zuzycie = 0, wprostDoDomu = 0, zMagazynu = 0, stratyMagazynu = 0;
  let poborWlasny = 0, zSieciLacznie = 0;

  for (let h = 0; h < n; h++) {
    const pv = pvBaza[h] * skalaPv;
    const obciazenie = profile.house_per_MWh[h] * skalaDomu + profile.ev_per_MWh[h] * skalaAuta;
    produkcja += pv;
    zuzycie += obciazenie;

    const wprost = Math.min(pv, obciazenie);
    wprostDoDomu += wprost;
    let nadwyzka = pv - wprost;
    let niedobor = obciazenie - wprost;

    if (pojemnosc > 0) {
      if (nadwyzka > 0) {
        const doPelna = (pojemnosc - soc) / sprLad;
        const ladowane = Math.min(nadwyzka, mocMagazynu, doPelna);
        soc += ladowane * sprLad;
        stratyMagazynu += ladowane * (1 - sprLad);
        nadwyzka -= ladowane;
      }
      // Tryb strefowy: w taniej strefie nie ruszamy magazynu, tylko kupujemy tania energie
      // z sieci, a magazyn zostawiamy na godziny drogie. Falowniki hybrydowe maja taka
      // funkcje i przy taryfie strefowej ma ona realne znaczenie - u Tomasza widac ja
      // w danych: 78% importu przypada na tania strefe, podczas gdy rozladowywanie
      // "kiedy popadnie" dawaloby 63%.
      const wstrzymaj = trybStrefowy && strefaTania && strefaTania[h] === '1';
      if (niedobor > 0 && soc > 0 && !wstrzymaj) {
        const dostepne = soc * sprRozlad;
        const oddane = Math.min(niedobor, mocMagazynu, dostepne);
        soc -= oddane / sprRozlad;
        stratyMagazynu += oddane * (1 / sprRozlad - 1);
        zMagazynu += oddane;
        niedobor -= oddane;
      }
    }

    // Dobieranie z sieci tuz przed droga strefa: magazyn kupuje tania energie i oddaje
    // ja domowi, gdy energia jest droga. Zwieksza import, ale przesuwa go do taniej strefy.
    // Warunek "magazyn praktycznie pusty" jest tu istotny: bez niego dopelnialibysmy
    // takze latem, gdy magazyn i tak zostanie naladowany z PV, co sztucznie zawyza
    // eksport (pelny rano magazyn nie ma miejsca na poludniowa produkcje).
    if (oknoDopelniania && oknoDopelniania[h] && pojemnosc > 0 && soc < progDopelniania) {
      const doCelu = (pojemnosc * docelowyPoziomZSieci - soc) / sprLad;
      const zSieci = Math.min(Math.max(doCelu, 0), mocMagazynu);
      if (zSieci > 0) {
        soc += zSieci * sprLad;
        stratyMagazynu += zSieci * (1 - sprLad);
        zSieciLacznie += zSieci;
        niedobor += zSieci;
      }
    }

    // Pobor wlasny ukladu doliczamy do importu, a nie do zuzycia domu: to prad, ktory
    // kupuje uzytkownik, ale ktorego nie widzi jako zuzycia w zadnym pomieszczeniu.
    poborWlasny += poborWlasnyKWh;
    niedobor += poborWlasnyKWh;

    imp[h] = niedobor;
    eksp[h] = nadwyzka;
  }

  const importKWh = suma(imp);
  const eksportKWh = suma(eksp);
  const autokonsumpcja = produkcja > 0 ? (100 * (produkcja - eksportKWh)) / produkcja : 0;
  const samowystarczalnosc = zuzycie > 0 ? (100 * (zuzycie - importKWh)) / zuzycie : 0;

  return {
    produkcja, zuzycie, importKWh, eksportKWh,
    wprostDoDomu, zMagazynu, stratyMagazynu, poborWlasny, doMagazynuZSieci: zSieciLacznie,
    autokonsumpcja, samowystarczalnosc,
    energiaWMagazynieNaKoniec: soc,
    imp, eksp,
    miesiace: agregujMiesiacami(profile, pvBaza, skalaPv, skalaDomu, skalaAuta, imp, eksp),
  };
}

/**
 * Krzywa nasycenia magazynu: jak autokonsumpcja i samowystarczalnosc rosna z pojemnoscia.
 *
 * Odpowiada na pytanie, ktorego zadna oferta nie stawia wprost: od ktorego momentu
 * kolejne kWh magazynu przestaja cokolwiek dawac. Krzywa sie wyplaszcza, bo magazyn
 * zagospodaruje tylko te nadwyzke, ktora naprawde powstaje w ciagu doby - pojemnosc
 * ponad dobowa nadwyzke stoi pusta przez wiekszosc roku.
 *
 * Kazdy punkt to pelna symulacja 8760 h, wiec wywolanie nie jest darmowe. Wolajacy
 * decyduje, ile punktow potrzebuje.
 */
export function krzywaMagazynu(p, profile, pojemnosci) {
  return pojemnosci.map((magazynKWh) => {
    const w = symuluj({ ...p, magazynKWh }, profile);
    return {
      magazynKWh,
      autokonsumpcja: w.autokonsumpcja,
      samowystarczalnosc: w.samowystarczalnosc,
      eksportKWh: w.eksportKWh,
      importKWh: w.importKWh,
    };
  });
}

/**
 * Zaznacza ostatnie K godzin taniej strefy przed kazdym blokiem strefy drogiej.
 * To tam ma sens dobieranie magazynu z sieci - energia jest jeszcze tania, a zaraz
 * bedzie potrzebna. Dopelnianie przez cala tania strefe powodowaloby jalowy obieg.
 */
export function oknoPrzedDrogaStrefa(maska, k) {
  const n = maska.length;
  const okno = new Uint8Array(n);
  for (let h = 0; h < n; h++) {
    if (maska[h] !== '1') continue;
    // czy w ciagu najblizszych k godzin zaczyna sie strefa droga
    for (let d = 1; d <= k; d++) {
      if (maska[(h + d) % n] !== '1') { okno[h] = 1; break; }
    }
  }
  return okno;
}

function suma(a) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s;
}

/**
 * Granice miesiecy w profilu. Rok zaczyna sie 1 sierpnia 2025 i konczy 31 lipca 2026,
 * wiec luty ma 28 dni (2026 nie jest rokiem przestepnym).
 */
const DNI_MIESIECY = [31, 30, 31, 30, 31, 31, 28, 31, 30, 31, 30, 31]; // VIII..VII

export function graniceMiesiecy() {
  const granice = [];
  let start = 0;
  for (const dni of DNI_MIESIECY) {
    granice.push([start, start + dni * 24]);
    start += dni * 24;
  }
  return granice;
}

function agregujMiesiacami(profile, pvBaza, skalaPv, skalaDomu, skalaAuta, imp, eksp) {
  return graniceMiesiecy().map(([a, b], i) => {
    let prod = 0, cons = 0, im = 0, ex = 0;
    for (let h = a; h < b; h++) {
      prod += pvBaza[h] * skalaPv;
      cons += profile.house_per_MWh[h] * skalaDomu + profile.ev_per_MWh[h] * skalaAuta;
      im += imp[h];
      ex += eksp[h];
    }
    return { miesiac: MIESIACE_PROFILU[i], produkcja: prod, zuzycie: cons, imp: im, eksport: ex };
  });
}
