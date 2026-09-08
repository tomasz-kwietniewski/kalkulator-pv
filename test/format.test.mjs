/**
 * Formatowanie liczb. Czas zwrotu pada na stronie w kilkunastu miejscach i "7,4 lat"
 * albo "22.5 kWh" psuje wrazenie rzetelnosci szybciej niz bledny model - bo widac je
 * od razu, bez liczenia.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { proc, lata, odmianaLat, zLatami, liczba, odmien, punktyProc } from '../src/format.js';

test('lata odmieniaja sie przez liczebnik', () => {
  assert.equal(zLatami(1), '1 rok');
  assert.equal(zLatami(2), '2 lata');
  assert.equal(zLatami(3), '3 lata');
  assert.equal(zLatami(4), '4 lata');
  assert.equal(zLatami(5), '5 lat');
  assert.equal(zLatami(8), '8 lat');
  assert.equal(zLatami(12), '12 lat');    // 12-14 to wyjatek: "dwanascie lat", nie "lata"
  assert.equal(zLatami(13), '13 lat');
  assert.equal(zLatami(14), '14 lat');
  assert.equal(zLatami(22), '22 lata');
  assert.equal(zLatami(25), '25 lat');
});

test('wartosci ulamkowe dostaja "roku" i przecinek', () => {
  assert.equal(zLatami(7.4), '7,4 roku');
  assert.equal(zLatami(5.75), '5,8 roku');   // zaokraglenie do jednego miejsca
  assert.equal(zLatami(20.2), '20,2 roku');
});

test('okragle wartosci nie dostaja wiszacego przecinka zero', () => {
  assert.equal(zLatami(10.0), '10 lat');
  assert.equal(zLatami(7.98), '8 lat');
  assert.equal(lata(7.4), '7,4');
});

test('punkty procentowe odmieniaja sie tak samo jak lata', () => {
  assert.equal(punktyProc(1), '1 punkt procentowy');
  assert.equal(punktyProc(3), '3 punkty procentowe');
  assert.equal(punktyProc(22), '22 punkty procentowe');   // to lapal blad w wersji z 12.08
  assert.equal(punktyProc(25), '25 punktów procentowych');
  assert.equal(punktyProc(12), '12 punktów procentowych');
  assert.equal(punktyProc(24.6), '25 punktów procentowych');
});

test('odmien dziala dla dowolnego rzeczownika', () => {
  const oferta = ['oferta', 'oferty', 'ofert'];
  assert.equal(odmien(1, oferta), 'oferta');
  assert.equal(odmien(2, oferta), 'oferty');
  assert.equal(odmien(6, oferta), 'ofert');
  assert.equal(odmien(0, oferta), 'ofert');
});

test('liczby dziesietne pisza sie z przecinkiem', () => {
  assert.equal(liczba(22.5), '22,5');
  assert.equal(liczba(15), '15');
  assert.equal(liczba(15.36), '15,36');
  // Bez zaokraglenia dzielenie zmiennoprzecinkowe wychodzilo na strone w calej okazalosci:
  // "rezerwa awaryjna to 2,8569600000000004 kWh".
  assert.equal(liczba(2.8569600000000004, 1), '2,9');
  assert.equal(liczba(1.4284800000000002, 1), '1,4');
  assert.equal(liczba(11.427840000000001), '11,43');
  assert.equal(liczba(5.0), '5', 'calkowita nie dostaje wiszacego przecinka');
  assert.equal(proc(69.42, 1), '69,4%');
  assert.equal(proc(69.42), '69%');
});
