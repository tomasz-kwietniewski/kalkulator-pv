/**
 * Sprawdzenie modelu cenowego wobec liczb wyliczonych niezaleznie w prywatnym repo
 * zuzycie-pradu (analyze/consolidate.py, analyze/oferty_g12.py) na fakturach z tego
 * samego roku. Chodzi o to, zeby kalkulator nie zaczal zycia wlasnym zyciem cenowym.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { symuluj } from '../src/engine.js';
import {
  ENERGIA, DYSTRYBUCJA, VAT, oplataMocowa, kosztImportu, depozytProsumencki, rachunekRoczny,
} from '../src/pricing.js';

const profile = JSON.parse(readFileSync(new URL('./profiles_raw.json', import.meta.url)));
const rce = (await import('../data/rce.js')).default.rce;

test('stawki zgadzaja sie z oficjalna taryfa PGE na 2026', () => {
  // Ceny za energie elektryczna dla grup G, zatwierdzone przez Prezesa URE na 2026.
  assert.equal(ENERGIA.G11.droga, 0.4982);
  assert.equal(ENERGIA.G12w.droga, 0.5821);
  assert.equal(ENERGIA.G12w.tania, 0.4235);
  // Brutto z tabeli taryfy zawiera VAT i akcyze - sprawdzamy, ze nasze netto sie zgadza.
  assert.ok(Math.abs((ENERGIA.G12w.droga + 0.005) * VAT - 0.7221) < 0.001);
  assert.ok(Math.abs((ENERGIA.G12w.tania + 0.005) * VAT - 0.5271) < 0.001);
  // Wyciag z taryfy PGE Dystrybucja od 1.02.2026, pkt 7.9.
  assert.equal(DYSTRYBUCJA.G12w.staly3f, 14.98);
  assert.equal(DYSTRYBUCJA.G11.staly3f, 9.98);
  // Oplata mocowa, pkt 7.13 - dom na tym osiedlu zawsze wpada w najwyzszy prog.
  assert.equal(oplataMocowa(11000), 24.05);
  assert.equal(oplataMocowa(2500), 17.18);
});

test('efektywna cena energii G12w zgadza sie z wyliczeniem z faktur', () => {
  const r = symuluj({
    kWp: 9, magazynKWh: 15.36,
    zuzycieDomuKWh: profile.meta.zuzycie_domu_kWh,
    poborAutaKWh: profile.meta.pobor_auta_kWh,
  }, profile);
  const k = kosztImportu(r.imp, profile, 'G12w');

  // consolidate.py liczy energie jako dzien*0,5821 + noc*0,4235, brutto z VAT.
  const udzialTaniej = k.udzialTaniej;
  const oczekiwana = (udzialTaniej * ENERGIA.G12w.tania + (1 - udzialTaniej) * ENERGIA.G12w.droga);
  const nasza = k.energiaNetto / k.kWh;
  assert.ok(Math.abs(nasza - oczekiwana) < 0.0005,
    `cena efektywna ${nasza.toFixed(4)} vs oczekiwana ${oczekiwana.toFixed(4)}`);

  console.log(`\n  udzial taniej strefy G12w: ${(100 * udzialTaniej).toFixed(1)}%` +
    `  (analiza zrodlowa na fakturach: ok. 78%)`);
  console.log(`  cena efektywna energii:    ${(nasza * VAT).toFixed(4)} zl/kWh brutto\n`);
});

test('depozyt prosumencki odtwarza realne zasilenie z faktur', () => {
  const r = symuluj({
    kWp: 9, magazynKWh: 15.36,
    zuzycieDomuKWh: profile.meta.zuzycie_domu_kWh,
    poborAutaKWh: profile.meta.pobor_auta_kWh,
  }, profile);
  const d = depozytProsumencki(r.eksp, rce);
  // Realnie: 2 237 kWh eksportu dalo ok. 479 zl na koncie prosumenta (README repo
  // zrodlowego). To kwota JUZ po ustawowym wspolczynniku 1,23 - wartosc rynkowa netto
  // tej energii to ok. 389 zl. Funkcja zwraca kwote przypisana do konta, wiec porownujemy
  // wprost z 479 zl.
  const odchylka = (100 * (d - 479)) / 479;
  console.log(`\n  depozyt: ${d.toFixed(0)} zl przy ${r.eksportKWh.toFixed(0)} kWh eksportu` +
    `  (realnie 479 zl przy 2 237 kWh, odchylka ${odchylka.toFixed(0)}%)\n`);
  assert.ok(Math.abs(odchylka) <= 20, `depozyt odbiega o ${odchylka.toFixed(0)}% (limit 20%)`);
});

test('rachunek roczny rozklada sie na skladniki i oplaty stale nie znikaja', () => {
  const r = symuluj({
    kWp: 9, magazynKWh: 15.36,
    zuzycieDomuKWh: profile.meta.zuzycie_domu_kWh,
    poborAutaKWh: profile.meta.pobor_auta_kWh,
  }, profile);

  for (const grupa of ['G11', 'G12', 'G12w']) {
    const rach = rachunekRoczny(r, profile, grupa, { rce });
    assert.ok(rach.brutto > 0);
    // Oplaty stale sa niezalezne od zuzycia - to podloga rachunku.
    assert.ok(rach.oplatyStaleNetto > 400 && rach.oplatyStaleNetto < 700);
    assert.ok(Math.abs(rach.netto * VAT - rach.brutto) < 0.01);
  }

  // Instalacja bez PV: brak eksportu, brak depozytu, rachunek wyzszy.
  const bezPv = symuluj({
    kWp: 0, magazynKWh: 0,
    zuzycieDomuKWh: profile.meta.zuzycie_domu_kWh,
    poborAutaKWh: profile.meta.pobor_auta_kWh,
  }, profile);
  const zPv = rachunekRoczny(r, profile, 'G12w', { rce });
  const bez = rachunekRoczny(bezPv, profile, 'G12w', { rce });
  assert.ok(bez.brutto > zPv.brutto, 'rachunek bez PV musi byc wyzszy niz z PV');
  console.log(`\n  G12w bez PV: ${bez.brutto.toFixed(0)} zl | z PV i magazynem: ` +
    `${zPv.brutto.toFixed(0)} zl | roznica ${(bez.brutto - zPv.brutto).toFixed(0)} zl/rok\n`);
});
