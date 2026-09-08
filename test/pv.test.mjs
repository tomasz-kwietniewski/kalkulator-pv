/**
 * Profile naslonecznienia z PVGIS i przeliczanie nachylenia dachu.
 *
 * Najwazniejszy jest tu test godziny szczytu. PVGIS podaje czasy w UTC, a caly model -
 * profil domu, strefy taryfowe, magazyn - chodzi w czasie lokalnym. Pierwsza wersja
 * danych byla przesunieta o godzine i dawalo to profil, ktory produkuje przed swoim
 * szczytem i konczy o 17:00. Ten test nie pozwoli temu wrocic.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import profile from '../data/profiles.js';
import { LOKALIZACJE, ZRODLO, godziny } from '../data/pv.js';
import { PROFILE_PV, profilPv, mnoznikNachylenia, NACHYLENIA } from '../src/pv.js';
import { symuluj } from '../src/engine.js';

const GODZIN = 8760;
const suma = (s) => [...s].reduce((a, b) => a + b, 0);
const dobaSrednia = (s) => {
  const d = new Array(24).fill(0);
  [...s].forEach((v, i) => { d[i % 24] += v; });
  return d;
};

test('kazda lokalizacja ma pelny rok i sensowny uzysk', () => {
  assert.equal(LOKALIZACJE.length, 10);
  for (const l of LOKALIZACJE) {
    const g = godziny(l.id);
    assert.equal(g.length, GODZIN, `${l.id}: nie 8760 godzin`);
    const roczny = suma(g);
    assert.ok(roczny > 950 && roczny < 1200, `${l.id}: uzysk ${roczny.toFixed(0)} poza zakresem`);
    assert.ok(Math.abs(roczny - l.uzyskRoczny) < 2, `${l.id}: metadane nie zgadzaja sie z danymi`);
    assert.ok(Math.max(...g) <= 1, `${l.id}: godzina ponad 1 kWh na kWp`);
    assert.ok([...g].every((v) => Number.isFinite(v) && v >= 0), `${l.id}: zle wartosci`);
  }
});

test('dane sa opisane zrodlem i data pobrania', () => {
  assert.match(ZRODLO.nazwa, /PVGIS/);
  assert.match(ZRODLO.pobrano, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(ZRODLO.nachylenie, 35);
  assert.match(ZRODLO.atrybucja, /European Union/);
});

test('profile PVGIS chodza w czasie lokalnym, nie w UTC', () => {
  const szczyt = {};
  for (const l of LOKALIZACJE) {
    const d = dobaSrednia(godziny(l.id));
    szczyt[l.id] = d.indexOf(Math.max(...d));
    assert.ok([11, 12].includes(szczyt[l.id]),
      `${l.id}: szczyt o ${szczyt[l.id]} zamiast 11-12 - dane chyba zostaly w UTC`);
    // W UTC wieczorna cześc doby urywa sie okolo 17, wiec to jest drugi bezpiecznik.
    assert.ok(d[19] > 0, `${l.id}: zero produkcji o 19 - profil przesuniety`);
  }
  // Slonce gorujе pozniej na zachodzie kraju - stad Szczecin ma szczyt nie wczesniej
  // niz Bialystok. Sam ten uklad tez by sie posypal przy zlym przeliczeniu czasu.
  assert.ok(szczyt.szczecin >= szczyt.bialystok,
    `Szczecin ${szczyt.szczecin}, Bialystok ${szczyt.bialystok}`);
});

test('profil zmierzony jest domyslny i oznaczony jako pomiar', () => {
  assert.equal(PROFILE_PV[0].id, 'odniesienia');
  assert.equal(PROFILE_PV[0].zrodlo, 'pomiar');
  assert.deepEqual([...profilPv('odniesienia')], [...profile.pv_per_kwp]);
  assert.equal(PROFILE_PV.filter((p) => p.zrodlo === 'PVGIS').length, 10);
});

test('nachylenie: przy poludniu optimum kolo 35-40, przy wschodzie-zachodzie plaski dach', () => {
  for (const orientacja of ['poludnie', 'poludnieWschodZachod', 'wschodZachod']) {
    assert.equal(mnoznikNachylenia(35, orientacja), 1, 'punkt odniesienia to 35 stopni');
  }
  assert.ok(mnoznikNachylenia(10, 'poludnie') < 0.95, 'plaski dach na poludnie traci');
  assert.ok(mnoznikNachylenia(40, 'poludnie') > mnoznikNachylenia(50, 'poludnie'));
  assert.ok(mnoznikNachylenia(10, 'wschodZachod') > 1, 'przy wschod-zachod plaski dach zyskuje');
  assert.deepEqual(NACHYLENIA, [10, 20, 30, 35, 40, 50]);
});

test('kalibracja uczciwosci: zmierzony rok wobec PVGIS dla Warszawy', () => {
  const zmierzony = suma(profile.pv_per_kwp);
  const warszawa = suma(godziny('warszawa'));
  const roznica = 100 * (zmierzony - warszawa) / warszawa;
  // Rocznie schodzi sie w granicach kilku procent - i tylko to twierdzimy. Rozklad
  // miesieczny juz nie: zmierzony rok mial slabe lato 2025 i mocna wiosne 2026.
  assert.ok(Math.abs(roznica) < 8,
    `zmierzony ${zmierzony.toFixed(0)} wobec PVGIS ${warszawa.toFixed(0)} kWh/kWp (${roznica.toFixed(1)}%)`);
});

test('zmiana lokalizacji i nachylenia zmienia produkcje w silniku', () => {
  const baza = { kWp: 9, magazynKWh: 0, zuzycieDomuKWh: 11000, orientacja: 'poludnie' };
  const zProfilem = (id, mnoznik = 1) => symuluj(
    { ...baza, mnoznikNachylenia: mnoznik },
    { ...profile, pv_per_kwp: profilPv(id) },
  ).produkcja;

  const odniesienia = zProfilem('odniesienia');
  const wroclaw = zProfilem('wroclaw');
  const szczecin = zProfilem('szczecin');
  assert.ok(wroclaw > szczecin, 'Wroclaw ma wiecej slonca niz Szczecin');
  assert.ok(Math.abs(odniesienia - zProfilem('warszawa')) > 100, 'profile roznia sie miedzy soba');

  const plaski = zProfilem('warszawa', mnoznikNachylenia(10, 'poludnie'));
  assert.ok(plaski < zProfilem('warszawa'), 'dach 10 stopni na poludnie produkuje mniej');
});
