/**
 * Strefy taryfowe generowane z kalendarza.
 *
 * Bramka tego modulu: maski wygenerowane dla okresu profilu musza sie zgadzac
 * ze stringami zapisanymi w data/profiles.js - one pochodza z generatora w prywatnym
 * repo i to na nich policzone sa wszystkie dotychczasowe wyniki kalkulatora.
 * Jedyne dopuszczone odstepstwo jest opisane w tescie o czasie letnim: generator
 * konczyl czas letni 31 pazdziernika, a nie w ostatnia niedziele miesiaca.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import profile from '../data/profiles.js';
import {
  wielkanoc, swietaPolskie, dniWolne, czasLetni, STREFY, maskaStrefy, maskiProfilu,
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

test('czas letni trwa od ostatniej niedzieli marca do ostatniej niedzieli pazdziernika', () => {
  assert.equal(czasLetni('2026-03-28'), false);
  assert.equal(czasLetni('2026-03-29'), true);
  assert.equal(czasLetni('2025-10-25'), true);
  assert.equal(czasLetni('2025-10-26'), false);
  assert.equal(czasLetni('2025-12-31'), false);
});

test('maska G12: noc 22-6 i blok popoludniowy zalezny od pory roku', () => {
  const letnia = maskaStrefy('G12', STREFY.pge, '2025-08-01', 24);
  assert.deepEqual([...letnia].map((v, i) => (v ? i : -1)).filter((i) => i >= 0),
    [0, 1, 2, 3, 4, 5, 15, 16, 22, 23]);

  const zimowa = maskaStrefy('G12', STREFY.pge, '2025-12-01', 24);
  assert.deepEqual([...zimowa].map((v, i) => (v ? i : -1)).filter((i) => i >= 0),
    [0, 1, 2, 3, 4, 5, 13, 14, 22, 23]);
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

test('BRAMKA: maski dla okresu profilu zgadzaja sie z zapisanymi w data/profiles.js', () => {
  const maski = maskiProfilu(profile);
  assert.equal(maski.G12.length, GODZIN);
  assert.equal(maski.G12w.length, GODZIN);

  // Jedyna dopuszczona roznica: generator konczyl czas letni 31.10, a nie 26.10.2025
  // (ostatnia niedziela pazdziernika). Przez szesc dni ma wiec blok popoludniowy
  // 15-17 zamiast 13-15. Nic wiecej rozjechac sie nie ma prawa.
  const oczekiwaneG12 = [];
  for (const data of ['2025-10-26', '2025-10-27', '2025-10-28', '2025-10-29', '2025-10-30',
    '2025-10-31']) {
    for (const godzina of [13, 14, 15, 16]) oczekiwaneG12.push({ data, godzina });
  }
  assert.deepEqual(roznice(maski.G12, profile.strefa_tania_g12), oczekiwaneG12);

  // W G12w niedziela 26.10 jest tania przez cala dobe, wiec zostaje piec dni roboczych.
  const oczekiwaneG12w = oczekiwaneG12.filter((r) => r.data !== '2025-10-26');
  assert.deepEqual(roznice(maski.G12w, profile.strefa_tania_g12w), oczekiwaneG12w);
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
