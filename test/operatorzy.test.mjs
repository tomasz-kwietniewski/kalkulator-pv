/**
 * Pieciu operatorow: strefy czasowe i stawki, kazda liczba z wyciagu z taryfy OSD
 * albo z taryfy sprzedawcy zatwierdzonej przez Prezesa URE. Zrodla sa w `zrodlo`
 * przy kazdym wpisie - test pilnuje, zeby zadna stawka nie trafila tu bez dokumentu.
 *
 * Roznice miedzy operatorami sa wieksze, niz sie wydaje, i to one sa tu najwazniejsze:
 * - PGE ma sezonowy blok popoludniowy (15-17 latem, 13-15 zima),
 * - Tauron i Energa maja go na 13-15 przez caly rok,
 * - Stoen ma go w G12, ale w G12w juz nie: tam tanie jest tylko 22-6 i dni wolne,
 * - Enea w G12w zaczyna tania strefe o 21:00 i tez nie ma bloku popoludniowego,
 * - Enea nie podaje godzin G12 w taryfie (ustala je operator), wiec tej grupy tu nie ma.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { STREFY, maskaStrefy } from '../src/zones.js';
import { OPERATORZY, rachunekRoczny } from '../src/pricing.js';

const tanieGodziny = (operator, grupa, dataISO) => {
  const m = maskaStrefy(grupa, STREFY[operator], dataISO, 24);
  return m ? [...m].map((v, i) => (v ? i : -1)).filter((i) => i >= 0) : null;
};

const NOC = [0, 1, 2, 3, 4, 5, 22, 23];
const DOLINA_ZIMA = [13, 14];
const DOLINA_LATO = [15, 16];

test('kazdy operator ma nazwe, zrodlo i date obowiazywania', () => {
  const oczekiwani = ['pge', 'tauron', 'enea', 'energa', 'stoen'];
  assert.deepEqual(Object.keys(STREFY).sort(), [...oczekiwani].sort());
  assert.deepEqual(Object.keys(OPERATORZY).sort(), [...oczekiwani].sort());
  for (const id of oczekiwani) {
    for (const zrodlo of [STREFY[id], OPERATORZY[id]]) {
      assert.ok(zrodlo.nazwa, `${id}: brak nazwy`);
      assert.ok(zrodlo.zrodlo && zrodlo.zrodlo.length > 15, `${id}: brak odsylacza do dokumentu`);
      assert.match(zrodlo.obowiazujeOd, /^\d{4}-\d{2}-\d{2}$/, `${id}: brak daty obowiazywania`);
    }
  }
});

test('PGE: blok popoludniowy przesuwa sie z sezonem, w obu grupach', () => {
  assert.deepEqual(tanieGodziny('pge', 'G12', '2026-01-15'), [...DOLINA_ZIMA, ...NOC].sort((a, b) => a - b));
  assert.deepEqual(tanieGodziny('pge', 'G12', '2026-07-15'), [...DOLINA_LATO, ...NOC].sort((a, b) => a - b));
  // czwartek, dzien roboczy - G12w ma ten sam uklad co G12
  assert.deepEqual(tanieGodziny('pge', 'G12w', '2026-01-15'), [...DOLINA_ZIMA, ...NOC].sort((a, b) => a - b));
});

test('Tauron i Energa: dolina 13-15 przez caly rok, bez sezonow', () => {
  for (const operator of ['tauron', 'energa']) {
    assert.equal(STREFY[operator].sezony, null, `${operator} nie dzieli roku na sezony`);
    const zima = [...DOLINA_ZIMA, ...NOC].sort((a, b) => a - b);
    assert.deepEqual(tanieGodziny(operator, 'G12', '2026-01-15'), zima);
    assert.deepEqual(tanieGodziny(operator, 'G12', '2026-07-15'), zima, `${operator}: lipiec tak samo jak styczen`);
    assert.deepEqual(tanieGodziny(operator, 'G12w', '2026-07-15'), zima);
  }
});

test('Stoen: G12 ma doline, G12w juz nie - tam tania jest tylko noc i dni wolne', () => {
  assert.deepEqual(tanieGodziny('stoen', 'G12', '2026-01-15'), [...DOLINA_ZIMA, ...NOC].sort((a, b) => a - b));
  assert.deepEqual(tanieGodziny('stoen', 'G12w', '2026-01-15'), NOC);
  assert.equal(tanieGodziny('stoen', 'G12w', '2026-01-17').length, 24, 'sobota cala tania');
});

test('Enea: G12w od 21:00, bez doliny; G12 nie jest obslugiwane', () => {
  assert.deepEqual(tanieGodziny('enea', 'G12w', '2026-01-15'), [0, 1, 2, 3, 4, 5, 21, 22, 23]);
  assert.equal(tanieGodziny('enea', 'G12w', '2026-01-18').length, 24, 'niedziela cala tania');
  assert.equal(tanieGodziny('enea', 'G12', '2026-01-15'), null,
    'taryfa Enei nie podaje godzin G12 - ustala je operator, wiec nie zgadujemy');
});

test('stawki zgadzaja sie z wyciagami z taryf', () => {
  // PGE Dystrybucja 2026 pkt 7.9 / PGE Obrot taryfa G 2026
  assert.equal(OPERATORZY.pge.dystrybucja.G12w.droga, 0.4276);
  assert.equal(OPERATORZY.pge.energia.G12w.tania, 0.4235);
  // Wyciag z Taryfy TAURON Dystrybucja na 2026, pkt 7.1 / Taryfa TAURON Sprzedaz
  assert.equal(OPERATORZY.tauron.dystrybucja.G12w.tania, 0.0512);
  assert.equal(OPERATORZY.tauron.energia.G11.droga, 0.4970);
  // Wyciag z Taryfy ENEA Operator 2026, pkt 7.2 / Taryfa ENEA S.A. dla grup G
  assert.equal(OPERATORZY.enea.dystrybucja.G12w.staly3f, 26.23);
  assert.equal(OPERATORZY.enea.energia.G12w.droga, 0.6518);
  // Wyciag z Taryfy Energa-Operator 2026, pkt 9.2 / Taryfa ENERGA-OBROT dla grup G
  assert.equal(OPERATORZY.energa.dystrybucja.G12.droga, 0.3844);
  assert.equal(OPERATORZY.energa.energia.G12w.tania, 0.3940);
  // Taryfa Stoen Operator 2026 pkt 7.5 / Taryfa E.ON Polska dla grup G
  assert.equal(OPERATORZY.stoen.dystrybucja.G12w.tania, 0.1079);
  assert.equal(OPERATORZY.stoen.energia.G12.tania, 0.4295);
  assert.equal(OPERATORZY.stoen.oplataHandlowa, 13.23, 'E.ON pobiera oplate handlowa, URE-owi sprzedawcy nie');
});

test('ten sam profil daje inny rachunek u innego operatora', () => {
  const imp = new Float64Array(8760).fill(0.5);          // 4380 kWh rownomiernie
  const wynik = { imp, eksp: new Float64Array(8760), zuzycie: 4380 };
  const rachunki = {};
  for (const operator of ['pge', 'tauron', 'energa', 'stoen']) {
    const maska = maskaStrefy('G12w', STREFY[operator], '2025-08-01', 8760);
    rachunki[operator] = rachunekRoczny(wynik, maska, 'G12w', { operator, netBilling: false }).brutto;
  }
  const kwoty = Object.values(rachunki).map((k) => Math.round(k));
  assert.equal(new Set(kwoty).size, kwoty.length, `rachunki powinny sie roznic: ${JSON.stringify(rachunki)}`);
  assert.ok(rachunki.pge > rachunki.stoen, 'PGE ma najdrozsza dystrybucje z tej czworki');
});
