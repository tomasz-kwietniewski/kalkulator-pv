/**
 * Wczytywanie wlasnego profilu z licznika.
 *
 * Import CSV to klasyczna funkcja, ktora "nigdy nie dziala", wiec parser jest tu
 * zaprojektowany wokol zalozenia, ze SIE POMYLI: proponuje kolumny zamiast decydowac,
 * liczy podsumowanie do porownania z faktura i nigdy nie milczy o bledzie. Testy nizej
 * pilnuja obu stron: ze typowe pliki wchodza, a nietypowe daja konkretny komunikat.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  wykryjSeparator, parsujTekst, proponujKolumny, zbudujProfil, BladImportu,
} from '../src/import.js';

const naglowek = 'Data;Zuzycie [kWh]';
const rok = (start, godzin, wartosc = 1) => {
  const l = [];
  const d = new Date(Date.parse(start + 'T00:00:00Z'));
  for (let i = 0; i < godzin; i++) {
    l.push(`${d.toISOString().slice(0, 16).replace('T', ' ')};${wartosc}`);
    d.setUTCHours(d.getUTCHours() + 1);
  }
  return [naglowek, ...l].join('\n');
};

test('separator wykrywa sie sam: srednik, przecinek, tabulator', () => {
  assert.equal(wykryjSeparator('a;b;c\n1;2;3'), ';');
  assert.equal(wykryjSeparator('a,b,c\n1,2,3'), ',');
  assert.equal(wykryjSeparator('a\tb\tc\n1\t2\t3'), '\t');
  // przecinek dziesietny nie moze zostac wziety za separator kolumn
  assert.equal(wykryjSeparator('data;zuzycie\n2025-08-01 00:00;0,317'), ';');
});

test('kolumny sa proponowane, nie narzucane', () => {
  const { naglowki, wiersze } = parsujTekst(rok('2025-08-01', 24));
  const p = proponujKolumny(naglowki, wiersze);
  assert.equal(p.data, 0);
  assert.equal(p.wartosc, 1);
  assert.ok(p.powod.length > 10, 'propozycja ma byc uzasadniona tekstem dla uzytkownika');
});

test('przecinek dziesietny czyta sie tak samo jak kropka', () => {
  const zPrzecinkiem = parsujTekst('Data;kWh\n2025-08-01 00:00;0,317').wiersze[0][1];
  const zKropka = parsujTekst('Data;kWh\n2025-08-01 00:00;0.317').wiersze[0][1];
  assert.equal(zPrzecinkiem, '0,317');
  assert.equal(zKropka, '0.317');
  const a = zbudujProfil(parsujTekst(rok('2025-08-01', 8760, '0,5')), { data: 0, wartosc: 1 });
  assert.ok(Math.abs(a.sumaKWh - 4380) < 1, `suma ${a.sumaKWh}`);
});

test('pelny rok wchodzi w calosci, niezaleznie od tego, kiedy sie zaczyna', () => {
  for (const start of ['2025-08-01', '2025-01-01', '2025-04-15']) {
    const wynik = zbudujProfil(parsujTekst(rok(start, 8760)), { data: 0, wartosc: 1 });
    assert.equal(wynik.godziny.length, 8760, `${start}: zla dlugosc`);
    assert.equal(wynik.godzinWczytanych, 8760, `${start}: nie wszystkie godziny`);
    assert.equal(wynik.godzinUzupelnionych, 0);
    assert.equal(wynik.startISO, start);
    // profil zawsze lezy na siatce od 1 sierpnia, bo tak liczy silnik
    assert.equal(Math.round(wynik.sumaKWh), 8760);
  }
});

test('kwadranse sumuja sie do godzin', () => {
  const linie = ['Data;kWh'];
  const d = new Date(Date.UTC(2025, 7, 1));
  for (let i = 0; i < 4 * 24; i++) {
    linie.push(`${d.toISOString().slice(0, 16).replace('T', ' ')};0,25`);
    d.setUTCMinutes(d.getUTCMinutes() + 15);
  }
  const w = zbudujProfil(parsujTekst(linie.join('\n')),
    { data: 0, wartosc: 1, dopuscNiepelnyRok: true });
  assert.equal(w.interwalMinut, 15);
  assert.ok(Math.abs(w.sumaKWh - 24) < 0.01, `suma ${w.sumaKWh} zamiast 24`);
});

test('dziury sa uzupelniane i policzone, a nie przemilczane', () => {
  const linie = rok('2025-08-01', 8760).split('\n');
  linie[101] = linie[101].replace(';1', ';');      // pusta wartosc
  linie[102] = linie[102].replace(';1', ';-');     // myslnik
  linie.splice(200, 3);                            // brakujace wiersze
  const w = zbudujProfil(parsujTekst(linie.join('\n')), { data: 0, wartosc: 1 });
  assert.equal(w.godzinUzupelnionych, 5);
  assert.equal(w.godzinWczytanych, 8755);
  assert.ok(w.ostrzezenia.some((o) => /uzupe/i.test(o)), 'uzytkownik ma o tym przeczytac');
});

test('doba 25-godzinna: obie godziny 2:00 licza sie do sumy', () => {
  const linie = ['Data;kWh',
    '2025-10-26 01:00;1', '2025-10-26 02:00;1', '2025-10-26 02:00;1', '2025-10-26 03:00;1'];
  const w = zbudujProfil(parsujTekst(linie.join('\n')), { data: 0, wartosc: 1, dopuscNiepelnyRok: true });
  assert.ok(Math.abs(w.sumaKWh - 4) < 0.001, `zmiana czasu gubi energie: ${w.sumaKWh}`);
});

test('wartosci moga byc moca srednia zamiast energia', () => {
  const linie = ['Data;Moc [kW]'];
  const d = new Date(Date.UTC(2025, 7, 1));
  for (let i = 0; i < 4 * 24; i++) {
    linie.push(`${d.toISOString().slice(0, 16).replace('T', ' ')};2`);
    d.setUTCMinutes(d.getUTCMinutes() + 15);
  }
  const tekst = parsujTekst(linie.join('\n'));
  assert.equal(proponujKolumny(tekst.naglowki, tekst.wiersze).jednostka, 'kW');
  const w = zbudujProfil(tekst, { data: 0, wartosc: 1, jednostka: 'kW', dopuscNiepelnyRok: true });
  assert.ok(Math.abs(w.sumaKWh - 48) < 0.01, `2 kW przez dobe to 48 kWh, wyszlo ${w.sumaKWh}`);
});

test('bledy mowia, czego szukalismy i co znalezlismy', () => {
  assert.throws(
    () => zbudujProfil(parsujTekst('Data;kWh\nnie-data;1'), { data: 0, wartosc: 1, dopuscNiepelnyRok: true }),
    (e) => e instanceof BladImportu && /nie-data/.test(e.message),
    'komunikat ma cytowac to, czego nie dalo sie przeczytac',
  );
  assert.throws(
    () => zbudujProfil(parsujTekst('Data;kWh\n2025-08-01 00:00;abc'), { data: 0, wartosc: 1, dopuscNiepelnyRok: true }),
    (e) => e instanceof BladImportu && /abc/.test(e.message) && /liczb/i.test(e.message),
  );
  assert.throws(
    () => zbudujProfil(parsujTekst(rok('2025-08-01', 100)), { data: 0, wartosc: 1 }),
    (e) => e instanceof BladImportu && /100/.test(e.message) && /8 760|8760/.test(e.message),
    'za krotki plik ma powiedziec ile godzin ma, a ile trzeba',
  );
});

test('profil wychodzi w postaci, ktorej oczekuje silnik', () => {
  const w = zbudujProfil(parsujTekst(rok('2025-01-01', 8760, '0,5')), { data: 0, wartosc: 1 });
  const suma = w.perMWh.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(suma - 1000) < 0.5, `perMWh ma sumowac sie do 1000, jest ${suma}`);
  assert.equal(w.perMWh.length, 8760);
});
