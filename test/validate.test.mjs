/**
 * BRAMKA JAKOSCI.
 *
 * Silnik dostaje zmierzony profil produkcji i zuzycia domu Tomasza, a nastepnie musi
 * samodzielnie odtworzyc, ile energii ten dom faktycznie pobral z sieci i ile do niej
 * oddal. Jesli tego nie potrafi, kalkulator nie nadaje sie do pokazania sasiadom -
 * podejma na jego podstawie decyzje na kilkadziesiat tysiecy zlotych.
 *
 * Testujemy na profilu SUROWYM (test/profiles_raw.json), a nie na opublikowanym.
 * Opublikowany ma korekty, ktore celowo odchodza od zmierzonego roku, zeby go urealnic
 * (podniesiona produkcja i zuzycie w miesiacach, gdy falownik wylaczal sie przez spadki
 * napiecia). Na profilu surowym wszystkie liczby pochodza z jednego licznika i bilans
 * sie domyka, wiec tylko on sprawdza fizyke silnika, a nie trafnosc korekt.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { symuluj } from '../src/engine.js';
import { kosztImportu } from '../src/pricing.js';
import { maskiProfilu } from '../src/zones.js';

const profile = JSON.parse(readFileSync(new URL('./profiles_raw.json', import.meta.url)));
const maski = maskiProfilu(profile);

// Pomiar z licznikow falownika za VIII 2025 - VII 2026 (analyze/out/sofar_monthly.json
// i analyze/out/balance.json w prywatnym repo zuzycie-pradu).
const POMIAR = {
  importKWh: 5642,
  eksportKWh: 2236,
  // import_by_zone z process_sofar.py: 4 375 kWh z 5 642 przypadlo na tania strefe G12w.
  // Uwaga: generator dzielil rok na sezony wedlug zmiany czasu, a taryfa PGE robi to
  // datami (lato 1.04-30.09), wiec ten cel jest policzony inna definicja strefy niz
  // model. Roznica rzedu 1,6 pkt proc. miesci sie w limicie, ale nie jest czystym
  // bledem modelu - do zestrojenia przy nastepnym przeliczaniu profili.
  udzialTaniejG12w: 0.775,
};

const INSTALACJA = {
  kWp: 9,
  magazynKWh: 15.36,      // Sofar BTS E15-DS5, pojemnosc calkowita
  orientacja: 'poludnie',
  zuzycieDomuKWh: profile.meta.zuzycie_domu_kWh,
  poborAutaKWh: profile.meta.pobor_auta_kWh,
  maskaStrefy: maski.G12w,
};

const odchylka = (wynik, cel) => (100 * (wynik - cel)) / cel;

test('bramka: silnik odtwarza zmierzony import i eksport domu Tomasza', () => {
  const r = symuluj(INSTALACJA, profile);

  const dImport = odchylka(r.importKWh, POMIAR.importKWh);
  const dEksport = odchylka(r.eksportKWh, POMIAR.eksportKWh);

  console.log('\n  Wielkosc      symulacja    pomiar   odchylka   limit');
  console.log(`  import      ${r.importKWh.toFixed(0).padStart(9)} ${String(POMIAR.importKWh).padStart(9)}` +
    `   ${dImport.toFixed(1).padStart(6)}%    5%`);
  console.log(`  eksport     ${r.eksportKWh.toFixed(0).padStart(9)} ${String(POMIAR.eksportKWh).padStart(9)}` +
    `   ${dEksport.toFixed(1).padStart(6)}%   10%`);
  console.log(`  produkcja   ${r.produkcja.toFixed(0).padStart(9)}`);
  console.log(`  zuzycie     ${r.zuzycie.toFixed(0).padStart(9)}`);
  console.log(`  autokons.   ${r.autokonsumpcja.toFixed(1).padStart(9)}%`);
  console.log(`  samowyst.   ${r.samowystarczalnosc.toFixed(1).padStart(9)}%\n`);

  assert.ok(Math.abs(dImport) <= 5, `import odbiega o ${dImport.toFixed(1)}% (limit 5%)`);
  assert.ok(Math.abs(dEksport) <= 10, `eksport odbiega o ${dEksport.toFixed(1)}% (limit 10%)`);
});

/**
 * Rozklad importu miedzy strefy taryfowe. Sama suma nie wystarczy: rachunek na taryfie
 * strefowej zalezy od tego, KIEDY prad jest pobierany, a nie tylko ile go jest.
 * Rozjazd o 14 punktow procentowych to na tym profilu ok. 390 zl rocznie.
 */
test('import trafia we wlasciwe strefy taryfowe', () => {
  const r = symuluj(INSTALACJA, profile);
  const k = kosztImportu(r.imp, maski.G12w, 'G12w');
  const d = 100 * (k.udzialTaniej - POMIAR.udzialTaniejG12w);
  console.log(`  udzial taniej strefy: ${(100 * k.udzialTaniej).toFixed(1)}% ` +
    `wobec zmierzonych ${(100 * POMIAR.udzialTaniejG12w).toFixed(1)}% ` +
    `(roznica ${d.toFixed(1)} pkt proc.)\n`);
  assert.ok(Math.abs(d) <= 5, `udzial taniej strefy odbiega o ${d.toFixed(1)} pkt proc. (limit 5)`);
});

/**
 * Test rozkladu miesiecznego - to jest wlasciwa walidacja modelu.
 *
 * Roczna zgodnosc importu jest czesciowo z definicji: dwa parametry (pobor wlasny ukladu
 * i docelowy poziom dobierania z sieci) zostaly skalibrowane na tym samym roku. Dwoma
 * stalymi nie da sie jednak dopasowac ksztaltu dwunastu miesiecy naraz - jesli model
 * trafia miesiac po miesiacu, znaczy to, ze odwzorowuje prace magazynu i sezonowosc,
 * a nie tylko roczna sume.
 */
test('rozklad miesieczny importu zgadza sie z pomiarem', () => {
  const r = symuluj(INSTALACJA, profile);
  // import z licznika falownika, VIII 2025 .. VII 2026 (analyze/out/balance.json)
  const pomiar = [55, 118, 382, 571, 993, 983, 1143, 336, 266, 450, 303, 81];
  const nazwy = ['VIII', 'IX', 'X', 'XI', 'XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

  console.log('\n  mc     symulacja   pomiar   odchylka');
  let najgorszy = 0;
  r.miesiace.forEach((m, i) => {
    const d = m.imp - pomiar[i];
    const proc = (100 * d) / Math.max(pomiar[i], 1);
    if (Math.abs(d) > Math.abs(najgorszy)) najgorszy = d;
    console.log(`  ${nazwy[i].padEnd(6)}${m.imp.toFixed(0).padStart(8)}${String(pomiar[i]).padStart(9)}` +
      `${d.toFixed(0).padStart(8)} kWh (${proc.toFixed(0)}%)`);
  });
  console.log('');

  // Blad bezwzgledny w pojedynczym miesiacu nie powinien przekraczac 120 kWh.
  // To ok. 10% zimowego miesiaca, czyli mniej niz niepewnosc samych danych zrodlowych
  // (logger nie widzial czesci poboru, gdy falownik sie wylaczal).
  assert.ok(Math.abs(najgorszy) <= 120,
    `najwiekszy blad miesieczny to ${najgorszy.toFixed(0)} kWh (limit 120)`);
});

test('bilans energii sie domyka', () => {
  const r = symuluj(INSTALACJA, profile);

  // Zapotrzebowanie domu pokrywa PV wprost, magazyn i siec. Import obejmuje tez dwie
  // rzeczy, ktore do domu nie trafiaja: pobor wlasny ukladu i energie kupiona do magazynu.
  const dostarczone = r.wprostDoDomu + r.zMagazynu
    + (r.importKWh - r.poborWlasny - r.doMagazynuZSieci);
  assert.ok(Math.abs(dostarczone - r.zuzycie) < 1,
    `dostarczono ${dostarczone.toFixed(1)} kWh przy zapotrzebowaniu ${r.zuzycie.toFixed(1)} kWh`);

  // Bilans calego ukladu: co weszlo, to wyszlo albo zostalo w magazynie.
  const weszlo = r.produkcja + r.importKWh;
  const wyszlo = r.zuzycie + r.eksportKWh + r.stratyMagazynu + r.poborWlasny
    + r.energiaWMagazynieNaKoniec;
  assert.ok(Math.abs(weszlo - wyszlo) < 1,
    `weszlo ${weszlo.toFixed(1)} kWh, wyszlo ${wyszlo.toFixed(1)} kWh`);
});
