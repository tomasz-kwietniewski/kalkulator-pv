/**
 * Strefy taryfowe liczone z kalendarza.
 *
 * Wczesniej maski stref byly gotowymi ciagami 8760 znakow w data/profiles.js, przywiazanymi
 * do jednego roku (1.08.2025 - 31.07.2026) i jednego operatora. Blokowalo to wgrywanie
 * wlasnych danych (inny rok, inne dni wolne) i operatorow o innych oknach stref.
 *
 * Kalendarz jest liczony w UTC celowo: profil ma 24 godziny na dobe (365 x 24 = 8760),
 * bez zdublowanej i bez brakujacej godziny przy zmianie czasu. Pora roku wchodzi tu
 * osobno, przez czasLetni() - i wystarcza jej rozdzielczosc dobowa, bo zmiana czasu
 * wypada w nocy, a zalezne od niej okno jest popoludniowe.
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

const ostatniaNiedziela = (rok, miesiac) => {
  const d = new Date(Date.UTC(rok, miesiac, 0));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return iso(d);
};

/** Czas letni: od ostatniej niedzieli marca do ostatniej niedzieli pazdziernika. */
export function czasLetni(dataISO) {
  const rok = Number(dataISO.slice(0, 4));
  return dataISO >= ostatniaNiedziela(rok, 3) && dataISO < ostatniaNiedziela(rok, 10);
}

/**
 * Okna taniej strefy jako dane, zeby operator o innych godzinach byl wpisem w tabeli,
 * a nie nowa funkcja. Kazde okno to [od, do) w godzinach lokalnych; okno przechodzace
 * przez polnoc zapisujemy wprost (od > do).
 *
 * PGE: noc 22:00-6:00 codziennie plus blok popoludniowy przesuwany z czasem letnim.
 * Ten sam uklad okien ma G12 i G12w - roznica jest w dniach wolnych.
 */
const OKNA_PGE = {
  zawsze: [[22, 6]],
  letni: [[15, 17]],
  zimowy: [[13, 15]],
};

export const STREFY = {
  pge: {
    nazwa: 'PGE Dystrybucja',
    grupy: {
      G12: { okna: OKNA_PGE, dniWolneTanie: false },
      G12w: { okna: OKNA_PGE, dniWolneTanie: true },
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
    const okna = def.okna[czasLetni(data) ? 'letni' : 'zimowy'].concat(def.okna.zawsze);
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
