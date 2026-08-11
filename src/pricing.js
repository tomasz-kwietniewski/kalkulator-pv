/**
 * Model cenowy: taryfy PGE, dystrybucja, oplaty systemowe, net-billing i taryfa dynamiczna.
 *
 * Wszystkie stawki w JEDNYM miejscu, z data obowiazywania i odsylaczem do dokumentu
 * zrodlowego - aktualizacja na kolejny rok ma byc jedna zmiana, a nie polowaniem po kodzie.
 * Kwoty NETTO, VAT doliczany na koncu.
 */

export const OBOWIAZUJE_OD = '2026-01-01';
export const VAT = 1.23;

/**
 * Sprzedaz energii - Taryfa PGE Obrot dla grup G zatwierdzona przez Prezesa URE
 * na 2026 r. Zrodlo: "Ceny za energie elektryczna dla Taryfy (...) od 1 stycznia 2026".
 * S1 = strefa droga (dzienna/szczytowa), S2 = strefa tania.
 *
 * Taryfa sprzedawcy PGE NIE ma oplaty handlowej. Jesli pojawi sie ona na fakturze,
 * znaczy to, ze rozliczenie idzie wg CENNIKA OFERTY, a nie wg Taryfy URE - do zmiany.
 */
export const ENERGIA = {
  G11: { droga: 0.4982, tania: 0.4982 },
  G12: { droga: 0.5656, tania: 0.3718 },
  G12w: { droga: 0.5821, tania: 0.4235 },
};

/**
 * Dystrybucja - Wyciag z Taryfy PGE Dystrybucja S.A. obowiazujacy od 1.02.2026, pkt 7.9.
 * Uwaga: dystrybucja jest identyczna niezaleznie od sprzedawcy, wiec przy porownywaniu
 * ofert sprzedazy sie znosi. Ma za to znaczenie przy porownywaniu GRUP taryfowych.
 */
export const DYSTRYBUCJA = {
  G11: { droga: 0.3469, tania: 0.3469, staly3f: 9.98 },
  G12: { droga: 0.4014, tania: 0.0765, staly3f: 14.40 },
  G12w: { droga: 0.4276, tania: 0.0845, staly3f: 14.98 },
};

/** Skladniki doliczane do kazdej pobranej kWh, niezalezne od grupy taryfowej. */
export const OPLATY_ZMIENNE = {
  jakosciowa: 0.0332,      // pkt 7.9 wyciagu z taryfy dystrybucyjnej
  oze: 0.0073,             // pkt 7.11, Informacja Prezesa URE 61/2025
  kogeneracyjna: 0.0030,   // pkt 7.12, rozp. MKiS z 28.11.2025
  akcyza: 0.005,           // 5 zl/MWh
};

/** Oplata abonamentowa przy cyklu 1-miesiecznym (pkt 7.9). */
export const ABONAMENT_MIESIECZNY = 4.50;

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

const TANIA = '1';

/**
 * Koszt energii pobranej z sieci, godzina po godzinie.
 *
 * @param {Float64Array} imp godzinowy import z silnika
 * @param {object} profile profile z maskami stref
 * @param {string} grupa 'G11' | 'G12' | 'G12w'
 * @returns {object} rozbicie kosztu brutto na skladniki
 */
export function kosztImportu(imp, profile, grupa, opcje = {}) {
  const { rce = null, dynamiczna = false, czapka = DYNAMICZNA.czapka } = opcje;
  const energia = ENERGIA[grupa];
  const dyst = DYSTRYBUCJA[grupa];
  const maska = grupa === 'G11' ? null : profile[`strefa_tania_${grupa.toLowerCase()}`];
  const dodatki = OPLATY_ZMIENNE.jakosciowa + OPLATY_ZMIENNE.oze
    + OPLATY_ZMIENNE.kogeneracyjna + OPLATY_ZMIENNE.akcyza;

  let kosztEnergii = 0, kosztDystrybucji = 0, kWh = 0, kWhTania = 0;
  for (let h = 0; h < imp.length; h++) {
    const e = imp[h];
    if (e <= 0) continue;
    const tania = maska ? maska[h] === TANIA : false;
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
export function oplatyStaleNetto(grupa, zuzycieRoczneKWh) {
  return 12 * (DYSTRYBUCJA[grupa].staly3f + ABONAMENT_MIESIECZNY + oplataMocowa(zuzycieRoczneKWh));
}

/**
 * Net-billing: wartosc energii oddanej do sieci trafia na depozyt prosumencki,
 * ktorym mozna oplacic energie kupiona (ale juz nie dystrybucje).
 *
 * DO POTWIERDZENIA W ZRODLE przed publikacja: rozliczenie godzinowe wg RCE dotyczy
 * instalacji uruchomionych od 1.07.2024; ceny ujemne liczone jako zero; niewykorzystana
 * nadwyzka zwracana po 12 miesiacach w ograniczonej czesci. Punkt kontrolny liczbowy:
 * u Tomasza 2 237 kWh eksportu dalo ok. 479 zl zasilenia depozytu.
 */
export function depozytProsumencki(eksp, rce) {
  let wartosc = 0;
  for (let h = 0; h < eksp.length; h++) {
    if (eksp[h] > 0) wartosc += eksp[h] * Math.max(rce[h], 0) / 1000;
  }
  return wartosc;
}

/**
 * Pelny rachunek roczny brutto.
 *
 * Depozyt pomniejsza koszt ENERGII, nie calego rachunku - to czesta pomylka.
 * Nadwyzka depozytu ponad koszt energii przechodzi dalej i tu ja tylko raportujemy.
 */
export function rachunekRoczny(wynik, profile, grupa, opcje = {}) {
  const { rce = null, dynamiczna = false, czapka = DYNAMICZNA.czapka, netBilling = true } = opcje;
  const imp = kosztImportu(wynik.imp, profile, grupa, { rce, dynamiczna, czapka });
  const stale = oplatyStaleNetto(grupa, wynik.zuzycie);
  const depozyt = netBilling && rce ? depozytProsumencki(wynik.eksp, rce) : 0;

  const energiaPoDepozycie = Math.max(0, imp.energiaNetto - depozyt);
  const depozytNiewykorzystany = Math.max(0, depozyt - imp.energiaNetto);
  const netto = energiaPoDepozycie + imp.dystrybucjaNetto + stale;

  return {
    grupa,
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
