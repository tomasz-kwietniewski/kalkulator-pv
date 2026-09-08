/**
 * Archetypy ogrzewania - rekonstrukcja ze zmierzonego roku.
 *
 * Testy pilnuja tego, co odroznia archetypy od siebie, bo to jest cala ich tresc:
 * ile prądu idzie na ogrzewanie, w ktorym miesiacu i o ktorej godzinie. Jesli
 * dekompozycja sie rozjedzie, te trzy rzeczy przestana byc prawdziwe jako pierwsze.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import profile from '../data/profiles.js';
import { DOMY, profilZuzycia, METODA, opisDomu } from '../src/domy.js';

const GODZIN = 8760;
const suma = (s) => [...s].reduce((a, b) => a + b, 0);
const miesiace = (s) => {
  const DNI = [31, 30, 31, 30, 31, 31, 28, 31, 30, 31, 30, 31];
  const out = [];
  let h = 0;
  for (const dni of DNI) {
    let x = 0;
    for (let i = 0; i < dni * 24; i++) x += s[h++];
    out.push(x);
  }
  return out;
};
const doba = (s) => {
  const d = new Array(24).fill(0);
  [...s].forEach((v, i) => { d[i % 24] += v; });
  return d;
};

test('kazdy archetyp to pelny rok znormalizowany na 1 MWh', () => {
  assert.equal(DOMY.length, 4);
  for (const dom of DOMY) {
    const s = profilZuzycia(dom.id);
    assert.equal(s.length, GODZIN, `${dom.id}: nie 8760 godzin`);
    assert.ok(Math.abs(suma(s) - 1000) < 0.5, `${dom.id}: suma ${suma(s).toFixed(1)} zamiast 1000`);
    assert.ok([...s].every((v) => v >= 0 && Number.isFinite(v)), `${dom.id}: zle wartosci`);
  }
});

test('dom z pompami ciepla to sam zmierzony profil, bez posrednictwa', () => {
  const pompa = DOMY.find((d) => d.id === 'pompaCiepla');
  assert.equal(pompa.zrodlo, 'pomiar');
  assert.deepEqual([...profilZuzycia('pompaCiepla')], [...profile.house_per_MWh]);
});

test('ogrzewanie elektryczne bez pompy zjada wiekszy udzial roku niz pompa', () => {
  const pompa = DOMY.find((d) => d.id === 'pompaCiepla');
  const bezposrednie = DOMY.find((d) => d.id === 'elektryczneBezposrednie');
  assert.ok(bezposrednie.udzialGrzania > pompa.udzialGrzania + 0.2,
    `${bezposrednie.udzialGrzania} wobec ${pompa.udzialGrzania}`);
  // ten sam rachunek co w opisie: bez COP na to samo cieplo idzie kilka razy wiecej pradu
  assert.ok(METODA.scop > 2.5 && METODA.scop < 5, `SCOP ${METODA.scop} poza rozsadnym zakresem`);
});

test('zima wyzej niz lato - i tym mocniej, im wiecej grzania jest elektryczne', () => {
  const zimaDoLata = (id) => {
    const m = miesiace(profilZuzycia(id));
    const zima = m[4] + m[5] + m[6];        // grudzien, styczen, luty
    const lato = m[0] + m[10] + m[11];      // sierpien, czerwiec, lipiec
    return zima / lato;
  };
  assert.ok(zimaDoLata('nieelektryczne') < 1.4, 'dom bez grzania elektrycznego ma plaski rok');
  assert.ok(zimaDoLata('pompaCiepla') > 1.8);
  assert.ok(zimaDoLata('elektryczneBezposrednie') > zimaDoLata('pompaCiepla'));
});

test('ogrzewanie akumulacyjne przenosi dobe na noc - i to jest cala jego tresc', () => {
  const d = doba(profilZuzycia('elektryczneAkumulacyjne'));
  const noc = [22, 23, 0, 1, 2, 3, 4, 5].reduce((a, h) => a + d[h], 0);
  assert.ok(noc / suma(d) > 0.7, `w nocy tylko ${(100 * noc / suma(d)).toFixed(0)}% doby`);

  const dPompa = doba(profilZuzycia('pompaCiepla'));
  const nocPompa = [22, 23, 0, 1, 2, 3, 4, 5].reduce((a, h) => a + dPompa[h], 0);
  assert.ok(nocPompa / suma(dPompa) < 0.45, 'pompa nie grzeje wylacznie w nocy');
});

test('metoda jest opisana liczbami, ktore mozna sprawdzic', () => {
  assert.ok(METODA.progGrzewczy >= 10 && METODA.progGrzewczy <= 20);
  assert.ok(METODA.progDo >= METODA.progOd, 'przedzial progow ma sens');
  assert.ok(METODA.r2 > 0.4, `R2 ${METODA.r2} - regresja przestala cokolwiek tlumaczyc`);
  assert.ok(METODA.bytowyKWh > 3000 && METODA.bytowyKWh < 9000);
  assert.ok(METODA.grzewczyKWh > 2000 && METODA.grzewczyKWh < 8000);
  assert.match(METODA.temperatury, /Open-Meteo/);
});

test('opis przy polu mowi, czy to pomiar, czy rekonstrukcja', () => {
  assert.match(opisDomu('pompaCiepla'), /\d+% rocznego zużycia/);
  assert.match(opisDomu('nieelektryczne'), /Rekonstrukcja/);
  assert.match(opisDomu('elektryczneAkumulacyjne'), /Próg grzewczy/);
});
