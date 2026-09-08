/**
 * Rozklada zmierzony rok domu odniesienia na skladnik BYTOWY i GRZEWCZY, a potem sklada
 * z nich archetypy dla domow ogrzewanych inaczej. Wynik zapisuje do data/domy.js.
 *
 *   node tools/dekompozycja.mjs
 *
 * Dlaczego tak, a nie profile syntetyczne: kazdy ksztalt, ktory tu powstaje, pochodzi
 * ze zmierzonej doby realnego domu. Zmieniamy proporcje miedzy skladnikami i sposob
 * wytwarzania ciepla, ale nie wymyslamy przebiegow.
 *
 * Dekompozycja dziala na data/profiles.js, czyli na artefakcie JUZ ANONIMOWYM - dlatego
 * ten skrypt moze lezec w publicznym repozytorium, w odroznieniu od generatora profili
 * z prywatnego `zuzycie-pradu`, ktory czyta surowe logi z adresem i numerami PPE.
 *
 * Temperatury: Open-Meteo ERA5 (archive-api.open-meteo.com), godzinowo, czas lokalny,
 * dla Warszawy - nie dla samych Musul, bo dokladne wspolrzedne domu nie maja czego szukac
 * w publicznym repo, a 40 km roznicy nie zmienia progu grzewczego.
 */
import { writeFileSync } from 'node:fs';
import profile from '../data/profiles.js';

const GODZIN = 8760;
const LAT = 52.23;
const LON = 21.01;
const OKRES = { od: '2025-08-01', do: '2026-07-31' };

/** Temperatura zasilania pompy ciepla przyjeta do wzoru na COP. */
const TEMP_ZASILANIA = 35;
/** Udzial sprawnosci Carnota - typowy dla pompy powietrze-woda w warunkach domowych. */
const UDZIAL_CARNOTA = 0.4;
const COP_MIN = 1.8;
const COP_MAX = 4.8;

const copPompy = (tempZewn) => {
  const carnot = (TEMP_ZASILANIA + 273.15) / Math.max(5, TEMP_ZASILANIA - tempZewn);
  return Math.min(COP_MAX, Math.max(COP_MIN, UDZIAL_CARNOTA * carnot));
};

async function pobierzTemperatury() {
  const adres = 'https://archive-api.open-meteo.com/v1/archive?'
    + new URLSearchParams({
      latitude: LAT, longitude: LON, start_date: OKRES.od, end_date: OKRES.do,
      hourly: 'temperature_2m', timezone: 'Europe/Warsaw',
    });
  const odp = await fetch(adres);
  if (!odp.ok) throw new Error(`Open-Meteo ${odp.status}`);
  const dane = (await odp.json()).hourly.temperature_2m;
  if (dane.length !== GODZIN) throw new Error(`temperatury: ${dane.length} godzin zamiast ${GODZIN}`);
  if (dane.some((t) => t === null)) throw new Error('temperatury maja dziury');
  return dane;
}

/** Zmierzone zuzycie domu w kWh na godzine. */
const zuzycieDomu = [...profile.house_per_MWh].map((v) => (v * profile.meta.zuzycie_domu_kWh) / 1000);

const doby = (seria) => {
  const out = [];
  for (let d = 0; d < 365; d++) {
    let suma = 0;
    for (let h = 0; h < 24; h++) suma += seria[d * 24 + h];
    out.push(suma);
  }
  return out;
};

/**
 * Prog grzewczy z danych, nie z zalozenia: szukamy temperatury, przy ktorej regresja
 * zuzycie = baza + nachylenie * stopniodni tlumaczy dobowe zuzycie najlepiej.
 */
function znajdzProg(zuzycieDobowe, tempDobowa) {
  const dopasuj = (prog) => {
    const x = tempDobowa.map((t) => Math.max(0, prog - t));
    const y = zuzycieDobowe;
    const n = x.length;
    const sx = x.reduce((a, b) => a + b, 0);
    const sy = y.reduce((a, b) => a + b, 0);
    const sxx = x.reduce((a, b) => a + b * b, 0);
    const sxy = x.reduce((a, b, i) => a + b * y[i], 0);
    const nachylenie = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const baza = (sy - nachylenie * sx) / n;
    const sse = y.reduce((acc, yi, i) => acc + (yi - (baza + nachylenie * x[i])) ** 2, 0);
    const sst = y.reduce((acc, yi) => acc + (yi - sy / n) ** 2, 0);
    return { prog, baza, nachylenie, r2: 1 - sse / sst };
  };
  const wszystkie = [];
  for (let prog = 8; prog <= 22; prog += 0.5) wszystkie.push(dopasuj(prog));
  const najlepszy = wszystkie.reduce((a, b) => (b.r2 > a.r2 ? b : a));
  // Przedzial progow, ktore tlumacza dane prawie tak samo dobrze - miara tego,
  // jak pewny jest ten punkt zalamania. Na jednym roku bywa szeroki i tak trzeba to podac.
  const prawieTakSamo = wszystkie.filter((w) => w.r2 > najlepszy.r2 - 0.002).map((w) => w.prog);
  return { ...najlepszy, progOd: Math.min(...prawieTakSamo), progDo: Math.max(...prawieTakSamo) };
}

const temperatury = await pobierzTemperatury();
const tempDobowa = [];
for (let d = 0; d < 365; d++) {
  let suma = 0;
  for (let h = 0; h < 24; h++) suma += temperatury[d * 24 + h];
  tempDobowa.push(suma / 24);
}

const zuzycieDobowe = doby(zuzycieDomu);
const regresja = znajdzProg(zuzycieDobowe, tempDobowa);

/**
 * Ksztalt doby skladnika bytowego bierzemy z dni CIEPLYCH, czyli takich, w ktorych
 * grzania nie ma. To jedyny fragment roku, w ktorym widac sam dom: poranek, wieczor,
 * pralka, CWU. Zima ten ksztalt jest zalany grzaniem i nie da sie go stamtad odczytac.
 */
const dniCieple = [];
for (let d = 0; d < 365; d++) if (tempDobowa[d] > regresja.prog) dniCieple.push(d);
const ksztaltBytowy = new Array(24).fill(0);
for (const d of dniCieple) {
  for (let h = 0; h < 24; h++) ksztaltBytowy[h] += zuzycieDomu[d * 24 + h] / dniCieple.length;
}
const bytowyDobowo = ksztaltBytowy.reduce((a, b) => a + b, 0);

/** Grzanie to nadwyzka ponad skladnik bytowy, godzina po godzinie, nigdy ujemna. */
const grzanie = new Float64Array(GODZIN);
const bytowy = new Float64Array(GODZIN);
for (let d = 0; d < 365; d++) {
  for (let h = 0; h < 24; h++) {
    const i = d * 24 + h;
    bytowy[i] = Math.min(zuzycieDomu[i], ksztaltBytowy[h]);
    grzanie[i] = Math.max(0, zuzycieDomu[i] - ksztaltBytowy[h]);
  }
}

const suma = (s) => [...s].reduce((a, b) => a + b, 0);
const rocznyBytowy = suma(bytowy);
const roczneGrzanie = suma(grzanie);

/**
 * Cieplo dostarczone do domu: to, co pompa wyprodukowala z pradu przy danej temperaturze.
 * Tej wielkosci nie zmierzylismy - liczymy ja z modelu COP i tak jest opisana.
 */
const cieplo = Float64Array.from(grzanie, (v, i) => v * copPompy(temperatury[i]));
const scop = suma(cieplo) / roczneGrzanie;

/** Przesuwa dobowa porcje grzania w okno nocne 22-6 (ogrzewanie akumulacyjne). */
function doTaniejStrefy(seria) {
  const out = new Float64Array(GODZIN);
  for (let d = 0; d < 365; d++) {
    let dobowo = 0;
    for (let h = 0; h < 24; h++) dobowo += seria[d * 24 + h];
    // Osiem godzin nocy: 22-24 tej doby i 0-6 nastepnej. Ostatnia doba roku wraca
    // na poczatek profilu, zeby suma sie zgadzala.
    const godzinyNocne = [22, 23].map((h) => d * 24 + h)
      .concat([0, 1, 2, 3, 4, 5].map((h) => ((d + 1) % 365) * 24 + h));
    for (const i of godzinyNocne) out[i] += dobowo / godzinyNocne.length;
  }
  return out;
}

const naMWh = (seria) => {
  const s = suma(seria);
  return Float64Array.from(seria, (v) => (v * 1000) / s);
};

const bezposrednie = Float64Array.from(bytowy, (v, i) => v + cieplo[i]);
const akumulacyjne = (() => {
  const noc = doTaniejStrefy(cieplo);
  return Float64Array.from(bytowy, (v, i) => v + noc[i]);
})();

const ARCHETYPY = [
  {
    id: 'pompaCiepla',
    nazwa: 'Pompa ciepła',
    opis: 'Zmierzony rok domu odniesienia: ogrzewanie i CWU pompami ciepła.',
    seria: Float64Array.from(zuzycieDomu),
    udzialGrzania: roczneGrzanie / (rocznyBytowy + roczneGrzanie),
  },
  {
    id: 'elektryczneBezposrednie',
    nazwa: 'Ogrzewanie elektryczne bez pompy',
    opis: 'Maty, kable i grzejniki: to samo zapotrzebowanie na ciepło, ale bez COP,'
      + ' więc kilka razy więcej prądu.',
    seria: bezposrednie,
    udzialGrzania: suma(cieplo) / suma(bezposrednie),
  },
  {
    id: 'elektryczneAkumulacyjne',
    nazwa: 'Ogrzewanie elektryczne akumulacyjne (nocne)',
    opis: 'To samo ciepło, ale gromadzone w nocy, w taniej strefie 22-6.',
    seria: akumulacyjne,
    udzialGrzania: suma(cieplo) / suma(akumulacyjne),
  },
  {
    id: 'nieelektryczne',
    nazwa: 'Ogrzewanie nieelektryczne (gaz, pellet, węgiel)',
    opis: 'Sam składnik bytowy razem z elektryczną CWU - prąd nie idzie na ogrzewanie.',
    seria: bytowy,
    udzialGrzania: 0,
  },
];

/** Pakowanie jak w data/pv.js: dwa znaki base36 na godzine, ze skala na archetyp. */
const SKALA = 1295;
function zakoduj(seria) {
  const max = Math.max(...seria);
  const tekst = [...seria]
    .map((v) => Math.round((v / max) * SKALA).toString(36).padStart(2, '0')).join('');
  return { tekst, max };
}

const spakowane = ARCHETYPY.map((a) => {
  const perMWh = naMWh(a.seria);
  const { tekst, max } = zakoduj(perMWh);
  return { ...a, tekst, max, roczneKWhNaMWh: 1000 };
});

const modul = `// Wygenerowane przez tools/dekompozycja.mjs - nie edytowac recznie.
// Zrodlo ksztaltow: zmierzony rok domu odniesienia (data/profiles.js) rozlozony na
// skladnik bytowy i grzewczy. Temperatury: Open-Meteo ERA5, ${LAT}N ${LON}E,
// ${OKRES.od} - ${OKRES.do}, czas lokalny. Wygenerowano ${new Date().toISOString().slice(0, 10)}.

export const METODA = {
  progGrzewczy: ${regresja.prog.toFixed(1)},
  progOd: ${regresja.progOd.toFixed(1)},
  progDo: ${regresja.progDo.toFixed(1)},
  r2: ${regresja.r2.toFixed(3)},
  bazaDobowa: ${regresja.baza.toFixed(1)},
  nachylenieNaStopien: ${regresja.nachylenie.toFixed(2)},
  bytowyKWh: ${Math.round(rocznyBytowy)},
  grzewczyKWh: ${Math.round(roczneGrzanie)},
  cieploKWh: ${Math.round(suma(cieplo))},
  scop: ${scop.toFixed(2)},
  dniCieplych: ${dniCieple.length},
  temperatury: 'Open-Meteo ERA5, ${OKRES.od} - ${OKRES.do}',
};

const SPAKOWANE = {
${spakowane.map((a) => `  ${a.id}: { max: ${a.max.toFixed(6)}, dane: '${a.tekst}' },`).join('\n')}
};

export const ARCHETYPY = ${JSON.stringify(
  spakowane.map(({ id, nazwa, opis, udzialGrzania }) => ({
    id, nazwa, opis, udzialGrzania: Math.round(udzialGrzania * 1000) / 1000,
  })), null, 2)};

const rozpakowane = new Map();

/** Godzinowy ksztalt zuzycia domu na 1 MWh rocznie, 8760 wartosci, start 1 sierpnia. */
export function profilDomu(id) {
  if (!rozpakowane.has(id)) {
    const { max, dane } = SPAKOWANE[id];
    const out = new Float64Array(dane.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = (parseInt(dane.slice(i * 2, i * 2 + 2), 36) / ${SKALA}) * max;
    }
    // Pakowanie gubi ulamki procenta, wiec na koniec przywracamy sume 1000 kWh.
    const s = out.reduce((a, b) => a + b, 0);
    for (let i = 0; i < out.length; i++) out[i] = (out[i] * 1000) / s;
    rozpakowane.set(id, out);
  }
  return rozpakowane.get(id);
}
`;

writeFileSync(new URL('../data/domy.js', import.meta.url), modul);
process.stderr.write(`prog ${regresja.prog}C (${regresja.progOd}-${regresja.progDo}), R2 ${regresja.r2.toFixed(3)}\n`);
process.stderr.write(`bytowy ${Math.round(rocznyBytowy)} kWh, grzanie ${Math.round(roczneGrzanie)} kWh, `
  + `cieplo ${Math.round(suma(cieplo))} kWh, SCOP ${scop.toFixed(2)}\n`);
process.stderr.write(`zapisano data/domy.js (${(modul.length / 1024).toFixed(0)} kB)\n`);
