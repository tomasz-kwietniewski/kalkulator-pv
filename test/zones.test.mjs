/**
 * Strefy taryfowe generowane z kalendarza.
 *
 * Zrodlem prawdy jest tabela stref z taryfy OSD, nie zapisany string w profilu. Dla PGE
 * Dystrybucja jest to pkt 2.2.8 taryfy na 2026 (tekst jednolity od 1.02.2026), ktory dla
 * grup C12b/G12 oraz C12w/G12w/G12e podaje:
 *
 *   Lato (od 1 kwietnia do 30 wrzesnia):  strefa nocna 15-17 i 22-6
 *   Zima (od 1 pazdziernika do 31 marca): strefa nocna 13-15 i 22-6
 *   G12w dodatkowo: soboty, niedziele i dni ustawowo wolne - cala doba strefa nocna
 *
 * Testy nizej odtwarzaja te tabele wprost, razem z datami granicznymi sezonu. Wczesniej
 * bramka porownywala maski z ciagami strefa_tania_* z profilu, ale te pochodzily
 * z generatora, ktory sezon liczyl wedlug zmiany czasu - czyli blednie. Ciagi zostaly
 * usuniete z danych; niezaleznym materialem z generatora zostaje maska dzien_wolny.
 */import test from 'node:test';
import assert from 'node:assert/strict';
import profile from '../data/profiles.js';
import {
  wielkanoc, swietaPolskie, dniWolne, sezon, STREFY, maskaStrefy, maskiProfilu,
} from '../src/zones.js';

const START = '2025-08-01';
const GODZIN = 8760;

const dataGodziny = (h) => {
  const d = new Date(Date.UTC(2025, 7, 1));
  d.setUTCDate(d.getUTCDate() + Math.floor(h / 24));
  return { data: d.toISOString().slice(0, 10), godzina: h % 24 };
};

const roznice = (wygenerowana, zapisana) => {
  const out = [];
  for (let h = 0; h < zapisana.length; h++) {
    if (wygenerowana[h] !== (zapisana[h] === '1' ? 1 : 0)) out.push(dataGodziny(h));
  }
  return out;
};

test('Wielkanoc liczona algorytmem Gaussa/Meeusa', () => {
  assert.equal(wielkanoc(2024), '2024-03-31');
  assert.equal(wielkanoc(2025), '2025-04-20');
  assert.equal(wielkanoc(2026), '2026-04-05');
  assert.equal(wielkanoc(2027), '2027-03-28');
});

test('swieta ustawowe obejmuja ruchome, liczone od Wielkanocy', () => {
  const s2026 = swietaPolskie(2026);
  // Wielkanoc 5.04, Poniedzialek Wielkanocny 6.04, Zielone Swiatki +49, Boze Cialo +60
  for (const d of ['2026-01-01', '2026-01-06', '2026-04-05', '2026-04-06', '2026-05-01',
    '2026-05-03', '2026-05-24', '2026-06-04', '2026-08-15', '2026-11-01', '2026-11-11',
    '2026-12-25', '2026-12-26']) {
    assert.ok(s2026.has(d), `brakuje swieta ${d}`);
  }
  assert.equal(s2026.size, 13);
  assert.ok(swietaPolskie(2025).has('2025-06-19'), 'Boze Cialo 2025 to 19 czerwca');
});

test('dni wolne to soboty, niedziele i swieta', () => {
  const w = dniWolne(2025);
  assert.ok(!w.has('2025-08-01'), 'piatek 1.08.2025 jest dniem roboczym');
  assert.ok(w.has('2025-08-02'), 'sobota');
  assert.ok(w.has('2025-08-03'), 'niedziela');
  assert.ok(w.has('2025-11-11'), 'wtorek 11.11 jest swietem');
});

test('sezon letni trwa od 1 kwietnia do 30 wrzesnia (pkt 2.2.8 taryfy PGE)', () => {
  const sezony = STREFY.pge.sezony;
  assert.equal(sezon('2026-03-31', sezony), 'zima');
  assert.equal(sezon('2026-04-01', sezony), 'lato');
  assert.equal(sezon('2025-09-30', sezony), 'lato');
  assert.equal(sezon('2025-10-01', sezony), 'zima');
  assert.equal(sezon('2025-12-31', sezony), 'zima');
  // zmiana czasu nie ma tu nic do rzeczy - 26.10 i 29.03 sa w srodku sezonu
  assert.equal(sezon('2025-10-26', sezony), 'zima');
  assert.equal(sezon('2026-03-29', sezony), 'zima');
  // operator bez podzialu sezonowego ma jedno okno przez caly rok
  assert.equal(sezon('2026-07-01', null), null);
});

test('maska G12 odtwarza tabele stref: lato 15-17, zima 13-15, noc 22-6', () => {
  const tanieGodziny = (dataISO) => [...maskaStrefy('G12', STREFY.pge, dataISO, 24)]
    .map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  const LATO = [0, 1, 2, 3, 4, 5, 15, 16, 22, 23];
  const ZIMA = [0, 1, 2, 3, 4, 5, 13, 14, 22, 23];

  assert.deepEqual(tanieGodziny('2025-08-01'), LATO);
  assert.deepEqual(tanieGodziny('2025-09-30'), LATO, 'ostatni dzien lata');
  assert.deepEqual(tanieGodziny('2025-10-01'), ZIMA, 'pierwszy dzien zimy');
  assert.deepEqual(tanieGodziny('2025-12-01'), ZIMA);
  assert.deepEqual(tanieGodziny('2026-03-31'), ZIMA, 'ostatni dzien zimy');
  assert.deepEqual(tanieGodziny('2026-04-01'), LATO, 'pierwszy dzien lata');
});

test('maska G12w: dzien wolny tani przez cala dobe', () => {
  const sobota = maskaStrefy('G12w', STREFY.pge, '2025-08-02', 24);
  assert.equal(sobota.reduce((a, b) => a + b, 0), 24);
  const piatek = maskaStrefy('G12w', STREFY.pge, '2025-08-01', 24);
  assert.equal(piatek.reduce((a, b) => a + b, 0), 10);
});

test('G11 nie ma stref', () => {
  assert.equal(maskaStrefy('G11', STREFY.pge, START, 24), null);
});

test('BRAMKA: dni wolne z kalendarza zgadzaja sie z maska dzien_wolny w profilu', () => {
  const wolne = dniWolne(2025);
  for (const d of dniWolne(2026)) wolne.add(d);
  let roznic = 0;
  for (let h = 0; h < GODZIN; h++) {
    const { data } = dataGodziny(h);
    if ((wolne.has(data) ? '1' : '0') !== profile.dzien_wolny[h]) roznic++;
  }
  assert.equal(roznic, 0);
});
