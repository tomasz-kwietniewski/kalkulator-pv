/**
 * Strefy taryfowe liczone z kalendarza.
 *
 * Wczesniej maski stref byly gotowymi ciagami 8760 znakow w data/profiles.js, przywiazanymi
 * do jednego roku (1.08.2025 - 31.07.2026) i jednego operatora. Blokowalo to wgrywanie
 * wlasnych danych (inny rok, inne dni wolne) i operatorow o innych oknach stref.
 *
 * Kalendarz jest liczony w UTC celowo: profil ma 24 godziny na dobe (365 x 24 = 8760),
 * bez zdublowanej i bez brakujacej godziny przy zmianie czasu.
 *
 * Sezon taryfowy NIE ma nic wspolnego ze zmiana czasu - taryfa PGE Dystrybucja (pkt 2.2.8)
 * wyznacza go datami: lato od 1 kwietnia do 30 wrzesnia, zima od 1 pazdziernika do 31 marca.
 * Operatorzy bez podzialu sezonowego (Tauron, Energa, Stoen) maja jedno okno przez caly rok
 * i dla nich sezony sa puste.
 */

const GODZINA = 3600000;
const DZIEN = 24 * GODZINA;

const iso = (d) => d.toISOString().slice(0, 10);
const zUTC = (dataISO) => new Date(`${dataISO}T00:00:00Z`);

/** Niedziela wielkanocna wg algorytmu Gaussa/Meeusa (kalendarz gregorianski). */
export function wielkanoc(rok) {
  const a = rok % 19;
  const b = Math.floor(rok / 100);
  const c = rok % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const miesiac = Math.floor((h + l - 7 * m + 114) / 31);
  const dzien = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(new Date(Date.UTC(rok, miesiac - 1, dzien)));
}

/** Swieta o stalej dacie (MM-DD). */
const STALE_SWIETA = ['01-01', '01-06', '05-01', '05-03', '08-15', '11-01', '11-11',
  '12-25', '12-26'];

/**
 * Polskie swieta ustawowo wolne od pracy. Ruchome licza sie od Wielkanocy:
 * Poniedzialek Wielkanocny +1, Zielone Swiatki +49, Boze Cialo +60.
 */
export function swietaPolskie(rok) {
  const w = zUTC(wielkanoc(rok));
  const odWielkanocy = (dni) => iso(new Date(w.getTime() + dni * DZIEN));
  return new Set([
    ...STALE_SWIETA.map((md) => `${rok}-${md}`),
    iso(w), odWielkanocy(1), odWielkanocy(49), odWielkanocy(60),
  ]);
}

/** Soboty, niedziele i swieta - w G12w cala taka doba jest tania. */
export function dniWolne(rok) {
  const wolne = swietaPolskie(rok);
  const d = new Date(Date.UTC(rok, 0, 1));
  while (d.getUTCFullYear() === rok) {
    const dzienTygodnia = d.getUTCDay();
    if (dzienTygodnia === 0 || dzienTygodnia === 6) wolne.add(iso(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return wolne;
}

/**
 * Sezon taryfowy dla daty. Zwraca 'lato', 'zima' albo null, gdy operator nie dzieli roku
 * na sezony. Granice sa zapisane jako MM-DD, wiec porownanie na tekscie wystarcza.
 */
export function sezon(dataISO, sezony) {
  if (!sezony) return null;
  const mmdd = dataISO.slice(5);
  return (mmdd >= sezony.lato.od && mmdd <= sezony.lato.do) ? 'lato' : 'zima';
}

/**
 * Okna taniej strefy jako dane, zeby operator o innych godzinach byl wpisem w tabeli,
 * a nie nowa funkcja. Kazde okno to [od, do) w godzinach lokalnych; okno przechodzace
 * przez polnoc zapisujemy wprost (od > do). Okna z klucza 'zawsze' obowiazuja caly rok,
 * a 'lato'/'zima' dochodza do nich w swoim sezonie.
 *
 * PGE: noc 22:00-6:00 codziennie plus blok popoludniowy, ktory w sezonie letnim stoi
 * na 15-17, a w zimowym na 13-15. Ten sam uklad okien ma G12 i G12w - roznica jest
 * w dniach wolnych.
 */
// Okna z tabel stref w taryfach OSD. PGE przesuwa blok popoludniowy z sezonem,
// reszta ma go na stale albo nie ma go wcale.
const OKNA_PGE = { zawsze: [[22, 6]], lato: [[15, 17]], zima: [[13, 15]] };
const OKNA_DOLINA = { zawsze: [[22, 6], [13, 15]] };
const OKNA_NOC = { zawsze: [[22, 6]] };
const OKNA_NOC_OD_21 = { zawsze: [[21, 6]] };

export const STREFY = {
  pge: {
    nazwa: 'PGE Dystrybucja',
    // Taryfa PGE Dystrybucja S.A. na 2026, tekst jednolity od 1.02.2026, pkt 2.2.8:
    // Lato (1.04-30.09) nocna 15-17 i 22-6; Zima (1.10-31.03) nocna 13-15 i 22-6.
    zrodlo: 'Taryfa PGE Dystrybucja S.A. na 2026, pkt 2.2.8',
    obowiazujeOd: '2026-02-01',
    sezony: { lato: { od: '04-01', do: '09-30' } },
    grupy: {
      G12: { okna: OKNA_PGE, dniWolneTanie: false },
      G12w: { okna: OKNA_PGE, dniWolneTanie: true },
    },
  },
  tauron: {
    nazwa: 'TAURON Dystrybucja',
    // Wyciag z Taryfy TD S.A. na rok 2026 dla grup G, pkt 2.2.3 i 2.2.4:
    // od 1 stycznia do 31 grudnia, nocna 22-6 i 13-15 - bez podzialu na sezony.
    zrodlo: 'Wyciag z Taryfy TAURON Dystrybucja S.A. na 2026 dla grup G, pkt 2.2.3-2.2.4',
    obowiazujeOd: '2026-01-01',
    sezony: null,
    grupy: {
      G12: { okna: OKNA_DOLINA, dniWolneTanie: false },
      G12w: { okna: OKNA_DOLINA, dniWolneTanie: true },
    },
  },
  enea: {
    nazwa: 'ENEA Operator',
    // Wyciag z Taryfy ENEA Operator na 2026, pkt 2.2.5: G12w to szczyt 6-21 w dni
    // robocze, wiec tania strefa zaczyna sie o 21:00 i nie ma bloku popoludniowego.
    // Grupy G12 tu nie ma celowo: pkt 2.2.7 podaje tylko dlugosc stref (10 godzin,
    // w tym 8 z doliny 22-7 i 2 z przedzialu 13-17), a godziny zegarowe "okresla
    // Operator". Bez tych godzin maska bylaby zgadywaniem.
    zrodlo: 'Wyciag z Taryfy ENEA Operator sp. z o.o. na 2026, pkt 2.2.5',
    obowiazujeOd: '2026-02-01',
    sezony: null,
    grupy: {
      G12w: { okna: OKNA_NOC_OD_21, dniWolneTanie: true },
    },
  },
  energa: {
    nazwa: 'Energa-Operator',
    // Wyciag z Taryfy Energa-Operator na 2026, pkt 3.2.5 i 3.2.6: od 1 stycznia
    // do 31 grudnia, nocna 13-15 i 22-6.
    zrodlo: 'Wyciag z Taryfy Energa-Operator S.A. na 2026, pkt 3.2.5-3.2.6',
    obowiazujeOd: '2026-02-01',
    sezony: null,
    grupy: {
      G12: { okna: OKNA_DOLINA, dniWolneTanie: false },
      G12w: { okna: OKNA_DOLINA, dniWolneTanie: true },
    },
  },
  stoen: {
    nazwa: 'Stoen Operator',
    // Taryfa Stoen Operator na 2026, pkt 2.2.5 i 2.2.6. Uwaga na roznice miedzy
    // grupami: G12 ma doline 13-15, ale w G12w strefa szczytowa to 6-22 w dni
    // robocze, wiec doliny popoludniowej tam nie ma.
    zrodlo: 'Taryfa Stoen Operator Sp. z o.o. na 2026, pkt 2.2.5-2.2.6',
    obowiazujeOd: '2026-01-01',
    sezony: null,
    grupy: {
      G12: { okna: OKNA_DOLINA, dniWolneTanie: false },
      G12w: { okna: OKNA_NOC, dniWolneTanie: true },
    },
  },
};

const wOknie = (godzina, od, doGodz) => (od < doGodz
  ? godzina >= od && godzina < doGodz
  : godzina >= od || godzina < doGodz);

/**
 * Maska taniej strefy dla dowolnego okna czasu: 1 = tania, 0 = droga.
 * Zwraca null dla grupy bez stref (G11), bo tam pytanie nie ma sensu.
 *
 * @param {string} grupa 'G11' | 'G12' | 'G12w'
 * @param {object} definicja wpis z STREFY
 * @param {string} startISO data pierwszej godziny profilu, np. '2025-08-01'
 * @param {number} godzin dlugosc profilu
 * @returns {Uint8Array|null}
 */
export function maskaStrefy(grupa, definicja, startISO, godzin) {
  const def = definicja.grupy[grupa];
  if (!def) return null;

  const maska = new Uint8Array(godzin);
  const start = zUTC(startISO).getTime();
  const wolneWRoku = new Map();

  for (let h = 0; h < godzin; h++) {
    const chwila = new Date(start + h * GODZINA);
    const data = iso(chwila);
    const rok = chwila.getUTCFullYear();
    if (!wolneWRoku.has(rok)) wolneWRoku.set(rok, dniWolne(rok));

    if (def.dniWolneTanie && wolneWRoku.get(rok).has(data)) {
      maska[h] = 1;
      continue;
    }
    const pora = sezon(data, definicja.sezony);
    const okna = pora ? def.okna[pora].concat(def.okna.zawsze) : def.okna.zawsze;
    const godzina = chwila.getUTCHours();
    maska[h] = okna.some(([od, doGodz]) => wOknie(godzina, od, doGodz)) ? 1 : 0;
  }
  return maska;
}

/** Maski dla kalendarza konkretnego profilu - jedno miejsce, ktore czyta jego meta. */
export function maskiProfilu(profile, definicja = STREFY.pge) {
  const start = profile.meta.okres.slice(0, 10);
  const godzin = profile.pv_per_kwp.length;
  return {
    G11: null,
    G12: maskaStrefy('G12', definicja, start, godzin),
    G12w: maskaStrefy('G12w', definicja, start, godzin),
  };
}
