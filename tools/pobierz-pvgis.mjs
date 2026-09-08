/**
 * Pobiera z PVGIS godzinowe profile produkcji dla dziesieciu lokalizacji w Polsce
 * i zapisuje je jako modul ES do data/pv.js. Uruchamiany RECZNIE, gdy chcemy odswiezyc
 * dane - strona po zaladowaniu nie wykonuje zadnego zapytania sieciowego i tak ma zostac.
 *
 *   node tools/pobierz-pvgis.mjs
 *
 * Zrodlo: PVGIS 5.3 (baza SARAH3), API re.jrc.ec.europa.eu. Dane sa bezplatne i bez
 * ograniczen uzycia ("The information provided by PVGIS is free and there are no
 * restrictions on its use"), atrybucja z odpowiedzi API: PVGIS (c) European Union.
 *
 * PVGIS podaje czasy w UTC, a nasz profil - jak licznik i jak strefy taryfowe - chodzi
 * w czasie lokalnym. Bez przeliczenia szczyt produkcji wypadalby o 10:00 zamiast o 11:00
 * i cala autokonsumpcja liczylaby sie na przesunietej dobie. Przeliczamy wiec na czas
 * warszawski razem ze zmiana czasu (zima UTC+1, lato UTC+2).
 *
 * Rok typowy wybieramy jako ROK MEDIANOWY z dziesieciu ostatnich lat, a nie jako
 * srednia z nich. Usrednianie godzina po godzinie wygladziloby zachmurzenie i dalo
 * profil bez ostrych szczytow - a to zawyzyloby autokonsumpcje, czyli dokladnie te
 * liczbe, po ktora ludzie tu przychodza. Rok medianowy zachowuje realna zmiennosc.
 */
import { writeFileSync } from 'node:fs';

const LOKALIZACJE = [
  { id: 'warszawa', nazwa: 'Warszawa', lat: 52.23, lon: 21.01 },
  { id: 'gdansk', nazwa: 'Gdańsk', lat: 54.35, lon: 18.65 },
  { id: 'szczecin', nazwa: 'Szczecin', lat: 53.43, lon: 14.55 },
  { id: 'poznan', nazwa: 'Poznań', lat: 52.41, lon: 16.93 },
  { id: 'wroclaw', nazwa: 'Wrocław', lat: 51.11, lon: 17.04 },
  { id: 'krakow', nazwa: 'Kraków', lat: 50.06, lon: 19.94 },
  { id: 'rzeszow', nazwa: 'Rzeszów', lat: 50.04, lon: 22.00 },
  { id: 'bialystok', nazwa: 'Białystok', lat: 53.13, lon: 23.16 },
  { id: 'lublin', nazwa: 'Lublin', lat: 51.25, lon: 22.57 },
  { id: 'olsztyn', nazwa: 'Olsztyn', lat: 53.78, lon: 20.49 },
];

const OD_ROKU = 2014;
const DO_ROKU = 2023;
const NACHYLENIE = 35;      // stopni - typowy dach skosny w Polsce
const STRATY = 14;          // % - domyslne straty systemu w PVGIS
const GODZIN = 8760;
const START_PROFILU = [8, 1];   // 1 sierpnia, zeby zgadzalo sie z data/profiles.js

const url = (sciezka, par) =>
  `https://re.jrc.ec.europa.eu/api/v5_3/${sciezka}?${new URLSearchParams(par)}`;

async function pobierz(adres) {
  const odp = await fetch(adres);
  if (!odp.ok) throw new Error(`PVGIS ${odp.status} dla ${adres}`);
  return odp.text();
}

/** Czy dana chwila UTC wypada w polskim czasie letnim (ostatnia niedziela III - X, 01:00 UTC). */
function czasLetniUTC(dataUTC) {
  const rok = dataUTC.getUTCFullYear();
  const przelom = (miesiac) => {
    const d = new Date(Date.UTC(rok, miesiac, 0, 1));   // ostatni dzien miesiaca, 01:00 UTC
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return d;
  };
  return dataUTC >= przelom(3) && dataUTC < przelom(10);
}

/**
 * CSV z seriescalc -> { rok: [godziny w czasie LOKALNYM] }, bez 29 lutego.
 *
 * Przy jesiennej zmianie czasu dwie godziny UTC trafiaja na te sama godzine lokalna -
 * usredniamy je. Przy wiosennej jedna godzina lokalna zostaje pusta i uzupelnia ja
 * profilLokalizacji(). Obie wypadaja w nocy, wiec produkcji to nie dotyczy, ale siatka
 * 365 x 24 musi sie zgadzac.
 */
function parsuj(csv) {
  const lata = new Map();
  for (const linia of csv.split('\n')) {
    const m = linia.match(/^(\d{4})(\d{2})(\d{2}):(\d{2})\d{2},([\d.]+),/);
    if (!m) continue;
    const [, rok, miesiac, dzien, godzina, moc] = m;
    const utc = new Date(Date.UTC(+rok, +miesiac - 1, +dzien, +godzina));
    const lok = new Date(utc.getTime() + (czasLetniUTC(utc) ? 2 : 1) * 3600000);
    if (lok.getUTCMonth() === 1 && lok.getUTCDate() === 29) continue;
    const klucz = String(lok.getUTCFullYear());
    if (!lata.has(klucz)) lata.set(klucz, new Map());
    const doby = lata.get(klucz);
    const id = `${lok.getUTCMonth() + 1}-${lok.getUTCDate()}-${lok.getUTCHours()}`;
    const wpis = doby.get(id) ?? {
      miesiac: lok.getUTCMonth() + 1, dzien: lok.getUTCDate(), godzina: lok.getUTCHours(),
      suma: 0, ile: 0,
    };
    wpis.suma += +moc / 1000;
    wpis.ile += 1;
    doby.set(id, wpis);
  }
  const wynik = new Map();
  for (const [rok, doby] of lata) {
    wynik.set(rok, [...doby.values()]
      .map((w) => ({ ...w, kWh: w.suma / w.ile }))
      .sort((a, b) => a.miesiac - b.miesiac || a.dzien - b.dzien || a.godzina - b.godzina));
  }
  return wynik;
}

/** Przestawia rok kalendarzowy tak, zeby zaczynal sie 1 sierpnia. */
function odSierpnia(godziny) {
  const przed = godziny.filter((g) => g.miesiac >= START_PROFILU[0]);
  const po = godziny.filter((g) => g.miesiac < START_PROFILU[0]);
  return [...przed, ...po].map((g) => g.kWh);
}

/**
 * Kompresja: kazda godzina to dwa znaki base36. Zakres 0-1295 odpowiada 0-1 kWh
 * na kWp, czyli krok 0,77 Wh - ponizej szumu pomiarowego, a plik jest trzy razy
 * mniejszy niz tablica liczb. Dekoder siedzi w data/pv.js.
 */
const SKALA = 1295;
const zakoduj = (wartosci) => wartosci
  .map((v) => Math.round(Math.min(1, Math.max(0, v)) * SKALA).toString(36).padStart(2, '0'))
  .join('');

async function profilLokalizacji(lok) {
  const csv = await pobierz(url('seriescalc', {
    lat: lok.lat, lon: lok.lon, angle: NACHYLENIE, aspect: 0,
    pvcalculation: 1, peakpower: 1, loss: STRATY,
    startyear: OD_ROKU, endyear: DO_ROKU, outputformat: 'csv',
  }));
  const lata = parsuj(csv);
  // Rok z wiosenna zmiana czasu ma 8759 wlasnych godzin - brakujaca uzupelniamy srednia
  // z sasiadow, zeby siatka pozostala rowna 365 x 24.
  for (const [, g] of lata) {
    if (g.length === GODZIN - 1) {
      const i = g.findIndex((w, k) => k > 0 && w.godzina !== (g[k - 1].godzina + 1) % 24);
      if (i > 0) g.splice(i, 0, { ...g[i], kWh: (g[i - 1].kWh + g[i].kWh) / 2 });
    }
  }
  const pelne = [...lata.entries()].filter(([, g]) => g.length === GODZIN);
  if (pelne.length < 5) throw new Error(`${lok.id}: tylko ${pelne.length} pelnych lat`);

  const sumy = pelne.map(([rok, g]) => ({ rok, suma: g.reduce((a, b) => a + b.kWh, 0), g }));
  sumy.sort((a, b) => a.suma - b.suma);
  const mediana = sumy[Math.floor(sumy.length / 2)];
  const srednia = sumy.reduce((a, b) => a + b.suma, 0) / sumy.length;

  return {
    id: lok.id,
    nazwa: lok.nazwa,
    lat: lok.lat,
    lon: lok.lon,
    rokMedianowy: +mediana.rok,
    uzyskRoczny: Math.round(mediana.suma),
    uzyskSredni: Math.round(srednia),
    latPomiarowych: sumy.length,
    godziny: zakoduj(odSierpnia(mediana.g)),
  };
}

/** Roczny uzysk dla siatki nachylen i azymutow - stad biora sie mnozniki w UI. */
async function tabelaNachylen(lat, lon) {
  const wynik = {};
  for (const angle of [10, 20, 30, 35, 40, 50]) {
    wynik[angle] = {};
    for (const aspect of [-90, -45, 0, 45, 90]) {
      const json = JSON.parse(await pobierz(url('PVcalc', {
        lat, lon, peakpower: 1, loss: STRATY, angle, aspect, outputformat: 'json',
      })));
      wynik[angle][aspect] = Math.round(json.outputs.totals.fixed.E_y);
      process.stderr.write('.');
    }
  }
  return wynik;
}

const profile = [];
for (const lok of LOKALIZACJE) {
  process.stderr.write(`${lok.id} `);
  profile.push(await profilLokalizacji(lok));
  process.stderr.write('ok\n');
}
process.stderr.write('siatka nachylen ');
const nachylenia = await tabelaNachylen(51.75, 19.46);
process.stderr.write(' ok\n');

const modul = `// Wygenerowane przez tools/pobierz-pvgis.mjs - nie edytowac recznie.
// Zrodlo: PVGIS 5.3, baza SARAH3, lata ${OD_ROKU}-${DO_ROKU}, nachylenie ${NACHYLENIE} stopni,
// azymut 0 (poludnie), straty systemu ${STRATY}%. PVGIS (c) European Union.
// Pobrano: ${new Date().toISOString().slice(0, 10)}.
//
// Kazda lokalizacja to ROK MEDIANOWY z ${DO_ROKU - OD_ROKU + 1} lat, przestawiony tak, zeby
// zaczynal sie 1 sierpnia - tak samo jak zmierzony profil w data/profiles.js.
// Godziny sa spakowane po dwa znaki base36; dekoduje je funkcja godziny().

export const ZRODLO = {
  nazwa: 'PVGIS 5.3 (SARAH3)',
  api: 're.jrc.ec.europa.eu/api/v5_3/seriescalc',
  pobrano: '${new Date().toISOString().slice(0, 10)}',
  lata: '${OD_ROKU}-${DO_ROKU}',
  nachylenie: ${NACHYLENIE},
  straty: ${STRATY},
  atrybucja: 'PVGIS (c) European Union, 2001-2026',
};

/** Roczny uzysk kWh/kWp wg PVGIS dla srodkowej Polski - siatka nachylen i azymutow. */
export const UZYSK_NACHYLENIE = ${JSON.stringify(nachylenia, null, 2)};

export const LOKALIZACJE = ${JSON.stringify(
  profile.map(({ godziny, ...reszta }) => reszta), null, 2)};

const SPAKOWANE = {
${profile.map((p) => `  ${p.id}: '${p.godziny}',`).join('\n')}
};

const rozpakowane = new Map();

/** Godzinowa produkcja na 1 kWp, 8760 wartosci, start 1 sierpnia. */
export function godziny(id) {
  if (!rozpakowane.has(id)) {
    const s = SPAKOWANE[id];
    const out = new Float64Array(s.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 36) / ${SKALA};
    }
    rozpakowane.set(id, out);
  }
  return rozpakowane.get(id);
}
`;
writeFileSync(new URL('../data/pv.js', import.meta.url), modul);
process.stderr.write(`\nzapisano data/pv.js (${(modul.length / 1024).toFixed(0)} kB)\n`);
