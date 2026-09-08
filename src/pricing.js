/**
 * Model cenowy: taryfy pieciu operatorow, oplaty systemowe, net-billing i taryfa dynamiczna.
 *
 * Wszystkie stawki w JEDNYM miejscu, z data obowiazywania i odsylaczem do dokumentu
 * zrodlowego - aktualizacja na kolejny rok ma byc jedna zmiana, a nie polowaniem po kodzie.
 * Kwoty NETTO, VAT doliczany na koncu.
 */

export const OBOWIAZUJE_OD = '2026-01-01';
export const VAT = 1.23;

/**
 * Operatorzy: dystrybucja OSD plus energia sprzedawcy z urzedu z jego obszaru.
 * Kwoty NETTO, zl/kWh dla skladnikow zmiennych i zl/miesiac dla stalych, uklad 3-fazowy.
 *
 * Kazda liczba pochodzi z wyciagu z taryfy OSD albo z taryfy sprzedawcy zatwierdzonej
 * przez Prezesa URE - odsylacz siedzi w `zrodlo`, data w `obowiazujeOd`. Aktualizacja
 * na kolejny rok ma byc zmiana w tej jednej tabeli.
 *
 * Dystrybucja nie zalezy od sprzedawcy, ale ZALEZY od operatora i od grupy taryfowej,
 * a roznice miedzy operatorami sa duze: skladnik zmienny nocny w G12w idzie od 0,0512
 * (TAURON) do 0,1079 zl/kWh (Stoen), a skladnik staly od 10,86 do 26,23 zl/miesiac.
 *
 * `droga` to strefa dzienna/szczytowa, `tania` to nocna/pozaszczytowa. W G11 obie
 * sa rowne, bo grupa jest jednostrefowa.
 */
export const OPERATORZY = {
  pge: {
    nazwa: 'PGE Dystrybucja',
    sprzedawca: 'PGE Obrot',
    zrodlo: 'Taryfa PGE Dystrybucja S.A. na 2026 pkt 7.9 (tekst jednolity od 1.02.2026);'
      + ' Taryfa PGE Obrot S.A. dla grup G na 2026',
    obowiazujeOd: '2026-02-01',
    dystrybucja: {
      G11: { droga: 0.3469, tania: 0.3469, staly3f: 9.98 },
      G12: { droga: 0.4014, tania: 0.0765, staly3f: 14.40 },
      G12w: { droga: 0.4276, tania: 0.0845, staly3f: 14.98 },
    },
    energia: {
      G11: { droga: 0.4982, tania: 0.4982 },
      G12: { droga: 0.5656, tania: 0.3718 },
      G12w: { droga: 0.5821, tania: 0.4235 },
    },
    abonament: 4.50,
    // Taryfa sprzedawcy z urzedu nie ma oplaty handlowej. Jesli pojawi sie ona
    // na fakturze, znaczy to, ze rozliczenie idzie wg CENNIKA OFERTY, a nie Taryfy URE.
    oplataHandlowa: 0,
  },
  tauron: {
    nazwa: 'TAURON Dystrybucja',
    sprzedawca: 'TAURON Sprzedaz',
    zrodlo: 'Wyciag z Taryfy TAURON Dystrybucja S.A. na 2026 dla grup G pkt 7.1;'
      + ' Taryfa TAURON Sprzedaz sp. z o.o. dla grup G na 2026 (decyzja URE z 17.12.2025)',
    obowiazujeOd: '2026-01-01',
    dystrybucja: {
      G11: { droga: 0.2464, tania: 0.2464, staly3f: 10.86 },
      G12: { droga: 0.2841, tania: 0.0558, staly3f: 10.86 },
      G12w: { droga: 0.3298, tania: 0.0512, staly3f: 10.86 },
    },
    energia: {
      G11: { droga: 0.4970, tania: 0.4970 },
      G12: { droga: 0.5430, tania: 0.4130 },
      G12w: { droga: 0.6220, tania: 0.4130 },
    },
    abonament: 4.56,
    oplataHandlowa: 0,
  },
  enea: {
    nazwa: 'ENEA Operator',
    sprzedawca: 'ENEA S.A.',
    zrodlo: 'Wyciag z Taryfy ENEA Operator sp. z o.o. na 2026 pkt 7.2;'
      + ' Taryfa ENEA S.A. dla odbiorcow z grup G na 2026',
    obowiazujeOd: '2026-02-01',
    dystrybucja: {
      G11: { droga: 0.2456, tania: 0.2456, staly3f: 10.41 },
      G12: { droga: 0.2779, tania: 0.0913, staly3f: 14.56 },
      G12w: { droga: 0.2702, tania: 0.0813, staly3f: 26.23 },
    },
    energia: {
      G11: { droga: 0.4980, tania: 0.4980 },
      G12: { droga: 0.5779, tania: 0.3369 },
      G12w: { droga: 0.6518, tania: 0.3465 },
    },
    // Wyciag Enei nie zawiera tabeli abonamentu; 3,84 to 4,72 zl brutto z "Informacji
    // o stawkach brutto" (od 1.02.2026) podzielone przez VAT.
    abonament: 3.84,
    oplataHandlowa: 0,
  },
  energa: {
    nazwa: 'Energa-Operator',
    sprzedawca: 'ENERGA-OBROT',
    zrodlo: 'Wyciag z Taryfy Energa-Operator S.A. na 2026 pkt 9.2 i 8;'
      + ' Taryfa ENERGA-OBROT S.A. dla grup G od 1.01.2026',
    obowiazujeOd: '2026-02-01',
    dystrybucja: {
      G11: { droga: 0.3485, tania: 0.3485, staly3f: 11.77 },
      G12: { droga: 0.3844, tania: 0.0827, staly3f: 20.17 },
      G12w: { droga: 0.4017, tania: 0.0851, staly3f: 20.17 },
    },
    energia: {
      G11: { droga: 0.4968, tania: 0.4968 },
      G12: { droga: 0.5789, tania: 0.3753 },
      G12w: { droga: 0.6057, tania: 0.3940 },
    },
    abonament: 4.64,
    oplataHandlowa: 0,
  },
  stoen: {
    nazwa: 'Stoen Operator',
    sprzedawca: 'E.ON Polska',
    zrodlo: 'Taryfa Stoen Operator Sp. z o.o. na 2026 pkt 7.5;'
      + ' Taryfa E.ON Polska S.A. dla grup taryfowych G od 1.01.2026',
    obowiazujeOd: '2026-01-01',
    dystrybucja: {
      G11: { droga: 0.2342, tania: 0.2342, staly3f: 18.53 },
      G12: { droga: 0.2545, tania: 0.0555, staly3f: 18.53 },
      G12w: { droga: 0.2570, tania: 0.1079, staly3f: 18.53 },
    },
    energia: {
      G11: { droga: 0.5050, tania: 0.5050 },
      G12: { droga: 0.5394, tania: 0.4295 },
      G12w: { droga: 0.5294, tania: 0.4445 },
    },
    abonament: 2.88,
    // E.ON nie jest sprzedawca z urzedu na taryfie URE i pobiera oplate handlowa.
    // Bez niej rachunek u Stoena wyszedlby o ponad 190 zl rocznie za niski.
    oplataHandlowa: 13.23,
  },
};

export const DOMYSLNY_OPERATOR = 'pge';

// Widoki na operatora domyslnego - dzieki nim reszta kodu i testy moga pytac
// o stawki PGE bez znajomosci calej tabeli.
export const ENERGIA = OPERATORZY.pge.energia;
export const DYSTRYBUCJA = OPERATORZY.pge.dystrybucja;

/** Skladniki doliczane do kazdej pobranej kWh, niezalezne od grupy taryfowej. */
export const OPLATY_ZMIENNE = {
  jakosciowa: 0.0332,      // pkt 7.9 wyciagu z taryfy dystrybucyjnej
  oze: 0.0073,             // pkt 7.11, Informacja Prezesa URE 61/2025
  kogeneracyjna: 0.0030,   // pkt 7.12, rozp. MKiS z 28.11.2025
  akcyza: 0.005,           // 5 zl/MWh
};

/** Oplata abonamentowa operatora domyslnego przy cyklu 1-miesiecznym. */
export const ABONAMENT_MIESIECZNY = OPERATORZY.pge.abonament;

/**
 * Oplata mocowa dla gospodarstw domowych - ryczalt zalezny od rocznego zuzycia
 * (pkt 7.13, Informacja Prezesa URE 57/2025). Progi w kWh/rok, stawka w zl/miesiac.
 */
export const OPLATA_MOCOWA_PROGI = [
  { doKWh: 500, zlNaMiesiac: 4.29 },
  { doKWh: 1200, zlNaMiesiac: 10.31 },
  { doKWh: 2800, zlNaMiesiac: 17.18 },
  { doKWh: Infinity, zlNaMiesiac: 24.05 },
];

export function oplataMocowa(zuzycieRoczneKWh) {
  return OPLATA_MOCOWA_PROGI.find((p) => zuzycieRoczneKWh <= p.doKWh).zlNaMiesiac;
}

/** Taryfa dynamiczna: cena energii = RCE z gieldy + marza sprzedawcy. */
export const DYNAMICZNA = {
  oplataObslugi: 0.08,   // zl/kWh netto - marza Pstryka wg faktur
  // "Tarcza" (czapka cenowa ok. 0,495 zl/kWh netto) wygasa z koncem 2026 i zalozenie
  // przyjete w analizie zrodlowej jest takie, ze nie zostanie przedluzona. Domyslnie
  // liczymy BEZ czapki, czyli w wariancie mniej korzystnym dla taryfy dynamicznej.
  czapka: null,
};

/**
 * Koszt energii pobranej z sieci, godzina po godzinie.
 *
 * @param {Float64Array} imp godzinowy import z silnika
 * @param {Uint8Array|null} maska maska taniej strefy z src/zones.js (null dla G11)
 * @param {string} grupa 'G11' | 'G12' | 'G12w'
 * @returns {object} rozbicie kosztu brutto na skladniki
 */
export function kosztImportu(imp, maska, grupa, opcje = {}) {
  const { rce = null, dynamiczna = false, czapka = DYNAMICZNA.czapka,
    operator = DOMYSLNY_OPERATOR } = opcje;
  const energia = OPERATORZY[operator].energia[grupa];
  const dyst = OPERATORZY[operator].dystrybucja[grupa];
  const dodatki = OPLATY_ZMIENNE.jakosciowa + OPLATY_ZMIENNE.oze
    + OPLATY_ZMIENNE.kogeneracyjna + OPLATY_ZMIENNE.akcyza;

  let kosztEnergii = 0, kosztDystrybucji = 0, kWh = 0, kWhTania = 0;
  for (let h = 0; h < imp.length; h++) {
    const e = imp[h];
    if (e <= 0) continue;
    const tania = maska ? maska[h] === 1 : false;
    kWh += e;
    if (tania) kWhTania += e;

    let cenaEnergii;
    if (dynamiczna) {
      // RCE w zl/MWh; energia wprowadzona po cenie ujemnej nie oznacza doplaty do poboru,
      // wiec przy poborze bierzemy cene rynkowa taka, jaka jest (moze byc ujemna).
      cenaEnergii = rce[h] / 1000 + DYNAMICZNA.oplataObslugi;
      if (czapka != null) cenaEnergii = Math.min(cenaEnergii, czapka);
    } else {
      cenaEnergii = tania ? energia.tania : energia.droga;
    }
    kosztEnergii += e * cenaEnergii;
    kosztDystrybucji += e * ((tania ? dyst.tania : dyst.droga) + dodatki);
  }

  return {
    kWh,
    udzialTaniej: kWh > 0 ? kWhTania / kWh : 0,
    energiaNetto: kosztEnergii,
    dystrybucjaNetto: kosztDystrybucji,
  };
}

/**
 * Oplaty stale za 12 miesiecy: skladnik staly sieciowy, abonament i oplata mocowa.
 * Nie zaleza od tego, ile energii zuzyjesz - fotowoltaika ich nie zmniejsza. Dlatego
 * musza byc widoczne osobno: to podloga rachunku, ponizej ktorej nie da sie zejsc.
 */
export function oplatyStaleNetto(grupa, zuzycieRoczneKWh, operator = DOMYSLNY_OPERATOR) {
  const o = OPERATORZY[operator];
  return 12 * (o.dystrybucja[grupa].staly3f + o.abonament + o.oplataHandlowa
    + oplataMocowa(zuzycieRoczneKWh));
}

/**
 * Wspolczynnik, o ktory powieksza sie wartosc depozytu prosumenckiego przed
 * przypisaniem do konta (art. 4c ustawy o OZE, przepis obowiazuje od 1.02.2025).
 * Odpowiada stawce VAT: prosument oddaje energie po cenie netto, a kupuje po brutto,
 * wiec bez tego wspolczynnika depozyt nie pokrywalby rownowaznej ilosci energii.
 */
export const WSPOLCZYNNIK_DEPOZYTU = 1.23;

/**
 * Net-billing: wartosc energii oddanej do sieci trafia na depozyt prosumencki,
 * ktorym mozna oplacic energie kupiona (ale juz nie dystrybucje).
 *
 * ZWERYFIKOWANE 11.08.2026:
 *  - rozliczenie godzinowe wg RCE obowiazuje instalacje przylaczone od 1.07.2024
 *    i nie ma z niego powrotu do miesiecznego RCEm,
 *  - przy ujemnej cenie RCE depozyt sie NIE ZMNIEJSZA (stad ograniczenie do zera),
 *  - wartosc depozytu za dany miesiac jest powiekszana o wspolczynnik 1,23
 *    i przypisywana do konta w miesiacu nastepnym,
 *  - srodki mozna rozliczac przez 12 miesiecy; niewykorzystana nadwyzka jest
 *    zwracana do 20% wartosci depozytu z danego miesiaca.
 *
 * Punkt kontrolny: u domu odniesienia 2 237 kWh eksportu dalo ok. 479 zl na koncie -
 * i to jest kwota JUZ po pomnozeniu przez 1,23 (wartosc rynkowa netto to ok. 389 zl).
 *
 * @returns {number} kwota przypisana do konta prosumenta (po wspolczynniku)
 */
export function depozytProsumencki(eksp, rce) {
  let wartosc = 0;
  for (let h = 0; h < eksp.length; h++) {
    if (eksp[h] > 0) wartosc += eksp[h] * Math.max(rce[h], 0) / 1000;
  }
  return wartosc * WSPOLCZYNNIK_DEPOZYTU;
}

/**
 * Pelny rachunek roczny brutto.
 *
 * Depozyt pomniejsza koszt ENERGII, nie calego rachunku - to czesta pomylka.
 * Nadwyzka depozytu ponad koszt energii przechodzi dalej i tu ja tylko raportujemy.
 */
export function rachunekRoczny(wynik, maska, grupa, opcje = {}) {
  const { rce = null, dynamiczna = false, czapka = DYNAMICZNA.czapka, netBilling = true,
    operator = DOMYSLNY_OPERATOR } = opcje;
  const imp = kosztImportu(wynik.imp, maska, grupa, { rce, dynamiczna, czapka, operator });
  const stale = oplatyStaleNetto(grupa, wynik.zuzycie, operator);
  const depozyt = netBilling && rce ? depozytProsumencki(wynik.eksp, rce) : 0;

  const energiaPoDepozycie = Math.max(0, imp.energiaNetto - depozyt);
  const depozytNiewykorzystany = Math.max(0, depozyt - imp.energiaNetto);
  const netto = energiaPoDepozycie + imp.dystrybucjaNetto + stale;

  return {
    grupa,
    operator,
    kWhImport: imp.kWh,
    udzialTaniej: imp.udzialTaniej,
    energiaNetto: imp.energiaNetto,
    dystrybucjaNetto: imp.dystrybucjaNetto,
    oplatyStaleNetto: stale,
    depozyt,
    depozytNiewykorzystany,
    netto,
    brutto: netto * VAT,
  };
}
