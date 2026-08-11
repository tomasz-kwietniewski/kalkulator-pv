/**
 * Warstwa interfejsu. Nie liczy niczego sama - tylko zbiera parametry, wola silnik
 * i model cenowy, a potem rysuje wynik. Cala arytmetyka siedzi w engine.js,
 * pricing.js i economics.js, dzieki czemu da sie ja testowac z Node.
 */
import profile from '../data/profiles.js';
import rceDane from '../data/rce.js';
import { symuluj } from './engine.js';
import { rachunekRoczny, DYNAMICZNA } from './pricing.js';
import {
  kosztInstalacji, ulgaTermomodernizacyjna, zwrot, WIDELKI_OFERT_2025, DOTACJE,
} from './economics.js';

const rce = rceDane.rce;
const $ = (id) => document.getElementById(id);
const zl = (v) => Math.round(v).toLocaleString('pl-PL') + ' zł';
const kwh = (v) => Math.round(v).toLocaleString('pl-PL') + ' kWh';

/** Zuzycie auta: 20 tys. km daje ok. 6 100 kWh z gniazdka (model z danych wlasciciela). */
const KWH_NA_KM = 0.305;

const POLA = ['zuzycie', 'auto', 'orientacja', 'kwp', 'magazyn', 'grupa', 'eps',
  'koszt', 'dotacja', 'pit', 'wzrostCen', 'rezerwa', 'dobieranie', 'podatnicy',
  'mocAwaria', 'limitEps'];

let wykresMies = null;
let wykresZwrot = null;
let kosztRecznie = false;

function czytajPola() {
  const grupa = $('grupa').value;
  return {
    zuzycieDomuKWh: +$('zuzycie').value,
    poborAutaKWh: +$('auto').value * KWH_NA_KM,
    orientacja: $('orientacja').value,
    kWp: +$('kwp').value,
    magazynKWh: +$('magazyn').value,
    grupa,
    dynamiczna: grupa === 'dynamiczna',
    grupaRozliczen: grupa === 'dynamiczna' ? 'G12w' : grupa,
    eps: $('eps').checked,
    dotacja: +$('dotacja').value,
    pit: $('pit').value,
    wzrostCen: +$('wzrostCen').value / 100,
    rezerwaAwaryjna: +$('rezerwa').value / 100,
    ladowanieZSieci: $('dobieranie').value === '1',
    podatnicy: +$('podatnicy').value,
  };
}

/** Jeden wariant instalacji: symulacja + rachunek. */
function policzWariant(p, kWp, magazynKWh) {
  const wynik = symuluj({
    kWp, magazynKWh,
    zuzycieDomuKWh: p.zuzycieDomuKWh,
    poborAutaKWh: p.poborAutaKWh,
    orientacja: p.orientacja,
    rezerwaAwaryjna: p.rezerwaAwaryjna,
    grupaTaryfowa: p.grupaRozliczen,
    // Dobieranie z sieci ma sens tylko przy taryfie ze strefami.
    ladowanieZSieci: p.ladowanieZSieci && magazynKWh > 0 && p.grupaRozliczen !== 'G11',
  }, profile);
  const rachunek = rachunekRoczny(wynik, profile, p.grupaRozliczen, {
    rce, dynamiczna: p.dynamiczna, czapka: DYNAMICZNA.czapka, netBilling: kWp > 0,
  });
  return { wynik, rachunek };
}

function przelicz() {
  const p = czytajPola();
  $('kwpOut').textContent = p.kWp + ' kWp';
  $('magazynOut').textContent = p.magazynKWh + ' kWh';

  // Trzy warianty obok siebie. Przy magazynie 0 trzeci bylby kopia drugiego, wiec
  // wtedy pokazujemy przykladowy magazyn 10 kWh - zeby bylo widac, co by dal.
  const magazynPokazowy = p.magazynKWh > 0 ? p.magazynKWh : 10;
  const warianty = [
    { nazwa: 'Bez fotowoltaiki', kWp: 0, magazyn: 0 },
    { nazwa: `Sama fotowoltaika ${p.kWp} kWp`, kWp: p.kWp, magazyn: 0 },
    {
      nazwa: `Fotowoltaika + magazyn ${magazynPokazowy} kWh`
        + (p.magazynKWh > 0 ? '' : ' (dla porównania)'),
      kWp: p.kWp, magazyn: magazynPokazowy,
    },
  ].map((w) => ({ ...w, ...policzWariant(p, w.kWp, w.magazyn) }));

  const bazowy = warianty[0].rachunek.brutto;

  // Koszt: dopoki uzytkownik nie wpisze wlasnego, liczymy z cen odniesienia.
  warianty.forEach((w) => {
    w.koszt = w.kWp === 0 ? 0
      : kosztInstalacji({ kWp: w.kWp, magazynKWh: w.magazyn, zasilanieAwaryjne: p.eps });
  });
  if (!kosztRecznie) $('koszt').value = warianty[2].koszt;
  const kosztWpisany = +$('koszt').value;
  if (kosztRecznie && warianty[2].koszt > 0) {
    // Wlasna kwota dotyczy pelnego wariantu; pozostale skalujemy proporcjonalnie,
    // zeby porownanie "sama PV vs PV z magazynem" pozostalo spojne.
    const wsp = kosztWpisany / warianty[2].koszt;
    warianty.forEach((w) => { w.koszt = Math.round(w.koszt * wsp); });
  }

  warianty.forEach((w) => {
    w.oszczednosc = bazowy - w.rachunek.brutto;
    const ulga = ulgaTermomodernizacyjna({
      koszt: w.koszt, dotacja: w.kWp ? p.dotacja : 0, stawka: p.pit, podatnicy: p.podatnicy,
    });
    w.ulga = ulga;
    w.naklad = Math.max(0, w.koszt - (w.kWp ? p.dotacja : 0) - ulga);
    w.zwrot = w.kWp === 0 ? null
      : zwrot({ naklad: w.naklad, oszczednoscRoczna: w.oszczednosc, wzrostCen: p.wzrostCen });
  });

  rysujKarty(p, warianty);
  rysujTabele(warianty);
  rysujTaryfy(p, warianty[2]);
  rysujDotacje(p, warianty[2]);
  rysujPasek(warianty[2].koszt);
  rysujWykresy(warianty);
  rysujEps(p);
  zapiszWAdresie();
}

function rysujKarty(p, w) {
  const pelny = w[2];
  const sama = w[1];
  const dodatekMagazynu = pelny.oszczednosc - sama.oszczednosc;
  const kosztMagazynu = pelny.naklad - sama.naklad;
  const zwrotMagazynu = dodatekMagazynu > 0 ? kosztMagazynu / dodatekMagazynu : null;

  const wybrany = p.magazynKWh > 0 ? pelny : sama;
  $('podsumowanie').innerHTML = pelny.kWp === 0
    ? 'Ustaw moc fotowoltaiki powyżej zera, żeby zobaczyć wynik.'
    : `Przy zużyciu ${kwh(p.zuzycieDomuKWh)} rocznie instalacja ${pelny.kWp} kWp`
      + (p.magazynKWh > 0 ? ` z magazynem ${p.magazynKWh} kWh` : ' bez magazynu')
      + ` obniża rachunek z <b>${zl(w[0].rachunek.brutto)}</b> `
      + `do <b>${zl(wybrany.rachunek.brutto)}</b> rocznie.`;

  const karta = p.magazynKWh > 0 ? pelny : sama;
  $('karty').innerHTML = [
    ['Rachunek dziś', zl(w[0].rachunek.brutto), 'c', 'bez fotowoltaiki'],
    ['Rachunek po instalacji', zl(karta.rachunek.brutto), 'g',
      `${karta.kWp} kWp${p.magazynKWh > 0 ? ' + ' + p.magazynKWh + ' kWh' : ', bez magazynu'}`],
    ['Oszczędność rocznie', zl(karta.oszczednosc), 'g',
      p.magazynKWh > 0 ? `w tym magazyn: ${zl(dodatekMagazynu)}`
        : `magazyn ${pelny.magazyn} kWh dodałby ${zl(dodatekMagazynu)}`],
    ['Zwrot nakładu', karta.zwrot?.rokZwrotu ? karta.zwrot.rokZwrotu.toFixed(1) + ' lat' : 'ponad 20 lat',
      'a', `sam magazyn: ${zwrotMagazynu && zwrotMagazynu < 40 ? zwrotMagazynu.toFixed(0) + ' lat' : 'nie zwraca się'}`],
  ].map(([lab, val, kl, foot]) =>
    `<div class="card"><div class="lab">${lab}</div><div class="val ${kl}">${val}</div>`
    + `<div class="foot">${foot}</div></div>`).join('');
}

function rysujTabele(w) {
  const najlepszy = w.reduce((a, b) => {
    const ra = a.zwrot?.rokZwrotu ?? Infinity;
    const rb = b.zwrot?.rokZwrotu ?? Infinity;
    return rb < ra ? b : a;
  });
  $('tabela').querySelector('tbody').innerHTML = w.map((x) => `<tr${x === najlepszy ? ' class="najlepszy"' : ''}>
    <td>${x.nazwa}</td>
    <td>${zl(x.rachunek.brutto)}</td>
    <td>${x.kWp ? zl(x.oszczednosc) : '-'}</td>
    <td>${x.kWp ? x.wynik.autokonsumpcja.toFixed(0) + '%' : '-'}</td>
    <td>${x.wynik.samowystarczalnosc.toFixed(0)}%</td>
    <td>${x.kWp ? zl(x.naklad) : '-'}</td>
    <td>${x.zwrot?.rokZwrotu ? x.zwrot.rokZwrotu.toFixed(1) + ' lat' : (x.kWp ? '> 20 lat' : '-')}</td>
  </tr>`).join('');
}

/** Porownanie taryf na tej samej instalacji - to osobna decyzja niz sama fotowoltaika. */
function rysujTaryfy(p, pelny) {
  const wyniki = ['G11', 'G12', 'G12w'].map((g) => {
    const w = symuluj({
      kWp: p.kWp, magazynKWh: p.magazynKWh,
      zuzycieDomuKWh: p.zuzycieDomuKWh, poborAutaKWh: p.poborAutaKWh,
      orientacja: p.orientacja, rezerwaAwaryjna: p.rezerwaAwaryjna, grupaTaryfowa: g,
      ladowanieZSieci: p.ladowanieZSieci && p.magazynKWh > 0 && g !== 'G11',
    }, profile);
    return { g, brutto: rachunekRoczny(w, profile, g, { rce, netBilling: p.kWp > 0 }).brutto };
  });
  const dyn = (() => {
    const w = symuluj({
      kWp: p.kWp, magazynKWh: p.magazynKWh, zuzycieDomuKWh: p.zuzycieDomuKWh,
      poborAutaKWh: p.poborAutaKWh, orientacja: p.orientacja,
      rezerwaAwaryjna: p.rezerwaAwaryjna, grupaTaryfowa: 'G12w',
      ladowanieZSieci: p.ladowanieZSieci && p.magazynKWh > 0,
    }, profile);
    return rachunekRoczny(w, profile, 'G12w', { rce, dynamiczna: true, netBilling: p.kWp > 0 }).brutto;
  })();

  const wszystkie = [...wyniki, { g: 'dynamiczna', brutto: dyn }].sort((a, b) => a.brutto - b.brutto);
  const naj = wszystkie[0];
  const nazwy = { G11: 'G11', G12: 'G12', G12w: 'G12w', dynamiczna: 'taryfa dynamiczna' };
  $('taryfaInfo').innerHTML = `<b>Wybór taryfy to osobna decyzja niż fotowoltaika</b> - i darmowa.
    Na tym profilu najtańsza wychodzi <b>${nazwy[naj.g]}</b> (${zl(naj.brutto)} rocznie).
    Pozostałe: ${wszystkie.slice(1).map((x) => `${nazwy[x.g]} ${zl(x.brutto)}`).join(', ')}.
    ${p.grupa !== naj.g ? `Zmiana taryfy dałaby <b>${zl(wszystkie.find((x) => x.g === p.grupa).brutto - naj.brutto)}</b> rocznie bez żadnej inwestycji.` : 'Masz już wybraną najtańszą.'}
    <br><span style="font-size:12.5px;color:var(--faint)">Taryfa dynamiczna liczona bez „Tarczy" -
    czapka cenowa wygasa z końcem 2026 i zakładamy, że nie zostanie przedłużona.</span>`;
}

function rysujDotacje(p, pelny) {
  const ulga = pelny.ulga;
  const zaMaly = p.magazynKWh > 0 && p.magazynKWh < DOTACJE.pme2.minimalnaPojemnoscKWh;
  $('dotacjeInfo').innerHTML = `<p><b>${DOTACJE.mojPrad6.nazwa}:</b> ${DOTACJE.mojPrad6.info}</p>
    <p><b>${DOTACJE.pme1.nazwa}:</b> ${DOTACJE.pme1.info}</p>
    <p><b>${DOTACJE.pme2.nazwa}:</b> ${DOTACJE.pme2.info}
      ${zaMaly ? `<br><b>Uwaga:</b> Twój magazyn ${p.magazynKWh} kWh jest mniejszy niż zapowiadane
      minimum ${DOTACJE.pme2.minimalnaPojemnoscKWh} kWh - przy takiej pojemności dofinansowanie
      z tego programu nie przysługiwałoby.` : ''}</p>
    <p><b>Ulga termomodernizacyjna:</b> ${ulga > 0
      ? `przy tym koszcie i Twoim sposobie rozliczenia PIT odzyskasz ok. <b>${zl(ulga)}</b>. `
        + 'Warunek: budynek musi być już oddany do użytku (progu wieku nie ma, ale dom '
        + 'w budowie się nie kwalifikuje). Limit 53 000 zł na podatnika, małżonkowie '
        + 'współwłaściciele mają po własnym. Od 2025 katalog obejmuje także magazyny '
        + 'energii, nie tylko panele. Dotacji i ulgi nie da się rozliczyć z tej samej '
        + 'złotówki - podstawę pomniejszamy o dotację.'
      : 'nie uwzględniamy jej w wyniku. Odliczenie od dochodu przy zerowym podatku jest warte zero.'}</p>`;
}

function rysujPasek(koszt) {
  const { min, max } = WIDELKI_OFERT_2025;
  const skalaMin = 30000, skalaMax = 80000;
  const pct = (v) => (100 * (v - skalaMin)) / (skalaMax - skalaMin);
  const el = $('pasekOfert');
  el.querySelector('.zakres').style.left = pct(min) + '%';
  el.querySelector('.zakres').style.width = (pct(max) - pct(min)) + '%';
  el.querySelector('.znacznik').style.left = Math.min(99, Math.max(0, pct(koszt))) + '%';
}

const MIES = ['sie', 'wrz', 'paź', 'lis', 'gru', 'sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip'];

function rysujWykresy(w) {
  const pelny = w[2];
  const wspolne = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 12 } } } },
    scales: { y: { beginAtZero: true, grid: { color: '#eceee9' } }, x: { grid: { display: false } } },
  };

  const dane = {
    labels: MIES,
    datasets: [
      { label: 'produkcja PV', data: pelny.wynik.miesiace.map((m) => Math.round(m.produkcja)), backgroundColor: '#1d9e75' },
      { label: 'zużycie', data: pelny.wynik.miesiace.map((m) => Math.round(m.zuzycie)), backgroundColor: '#d85a30' },
      { label: 'pobór z sieci', data: pelny.wynik.miesiace.map((m) => Math.round(m.imp)), backgroundColor: '#ba7517' },
      { label: 'oddane do sieci', data: pelny.wynik.miesiace.map((m) => Math.round(m.eksport)), backgroundColor: '#2f6fb0' },
    ],
  };
  if (wykresMies) { wykresMies.data = dane; wykresMies.update(); }
  else wykresMies = new Chart($('wykresMies'), { type: 'bar', data: dane, options: wspolne });

  const lata = Array.from({ length: 21 }, (_, i) => i);
  const daneZ = {
    labels: lata,
    datasets: [
      { label: 'sama fotowoltaika', data: w[1].zwrot?.przeplyw.map(Math.round) ?? [],
        borderColor: '#2f6fb0', backgroundColor: 'transparent', tension: .2, pointRadius: 0 },
      { label: 'fotowoltaika z magazynem', data: w[2].zwrot?.przeplyw.map(Math.round) ?? [],
        borderColor: '#1d9e75', backgroundColor: 'transparent', tension: .2, pointRadius: 0 },
    ],
  };
  const opcjeZ = {
    ...wspolne,
    scales: {
      y: { grid: { color: '#eceee9' }, ticks: { callback: (v) => (v / 1000).toFixed(0) + ' tys.' } },
      x: { grid: { display: false }, title: { display: true, text: 'lata od instalacji' } },
    },
  };
  if (wykresZwrot) { wykresZwrot.data = daneZ; wykresZwrot.options = opcjeZ; wykresZwrot.update(); }
  else wykresZwrot = new Chart($('wykresZwrot'), { type: 'line', data: daneZ, options: opcjeZ });
}

function rysujEps(p) {
  const moc = +$('mocAwaria').value;
  const limit = +$('limitEps').value;
  const uzyteczna = p.magazynKWh * 0.93 * (1 - p.rezerwaAwaryjna);
  const rezerwaKWh = p.magazynKWh * 0.93 * p.rezerwaAwaryjna;
  const godziny = moc > 0 ? rezerwaKWh / moc : 0;
  const miesci = moc <= limit;
  $('epsWynik').className = 'callout' + (miesci ? '' : ' warn');
  $('epsWynik').innerHTML = miesci
    ? `Zmieścisz się w limicie obwodu. Rezerwa awaryjna to <b>${rezerwaKWh.toFixed(1)} kWh</b>,
       co przy poborze ${moc} kW wystarczy na <b>ok. ${godziny.toFixed(1)} godz.</b>
       Na co dzień do autokonsumpcji pracuje ${uzyteczna.toFixed(1)} kWh z ${p.magazynKWh} kWh nominalnych.`
    : `<b>Nie zmieścisz się.</b> Chcesz ${moc} kW, a obwód awaryjny wytrzyma ${limit} kW -
       przy takim poborze zabezpieczenie wyłączy zasilanie. Albo ogranicz listę odbiorników,
       albo dopytaj instalatora o zabezpieczenie i rozłożenie obwodu na fazy.`;
}

/* --- zapis i odtwarzanie stanu; fragment adresu nie trafia do serwera --- */
function zapiszWAdresie() {
  const stan = {};
  POLA.forEach((id) => {
    const el = $(id);
    stan[id] = el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.value;
  });
  history.replaceState(null, '', '#' + new URLSearchParams(stan).toString());
}

function odtworzZAdresu() {
  if (!location.hash.length) return;
  const par = new URLSearchParams(location.hash.slice(1));
  POLA.forEach((id) => {
    if (!par.has(id)) return;
    const el = $(id);
    if (el.type === 'checkbox') el.checked = par.get(id) === '1';
    else el.value = par.get(id);
  });
  if (par.get('koszt') && +par.get('koszt') > 0) kosztRecznie = true;
}

function pobierzHtml() {
  // Wykresy zamieniamy na obrazki, zeby plik byl samowystarczalny i bez skryptow.
  const kopia = document.documentElement.cloneNode(true);
  kopia.querySelectorAll('script').forEach((s) => s.remove());
  kopia.querySelectorAll('.noprint').forEach((s) => s.remove());
  [['wykresMies', wykresMies], ['wykresZwrot', wykresZwrot]].forEach(([id, ch]) => {
    if (!ch) return;
    const img = kopia.ownerDocument.createElement('img');
    img.src = ch.toBase64Image();
    img.style.width = '100%';
    kopia.querySelector('#' + id).replaceWith(img);
  });
  // Wartosci pol wpisujemy na sztywno, bo klon nie zachowuje stanu formularzy.
  POLA.forEach((id) => {
    const zrodlo = $(id); const cel = kopia.querySelector('#' + id);
    if (!cel) return;
    if (zrodlo.tagName === 'SELECT') {
      cel.replaceWith(kopia.ownerDocument.createTextNode(zrodlo.selectedOptions[0].text));
    } else if (zrodlo.type !== 'checkbox') {
      cel.setAttribute('value', zrodlo.value);
    }
  });
  const blob = new Blob(['<!DOCTYPE html>' + kopia.outerHTML], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'kalkulator-fotowoltaika-wynik.html';
  a.click();
  URL.revokeObjectURL(a.href);
}

function start() {
  odtworzZAdresu();
  POLA.forEach((id) => {
    const el = $(id);
    el.addEventListener('input', () => {
      if (id === 'koszt') kosztRecznie = true;
      if (['kwp', 'magazyn', 'eps'].includes(id)) kosztRecznie = false;
      przelicz();
    });
  });
  $('btnPdf').addEventListener('click', () => window.print());
  $('btnHtml').addEventListener('click', pobierzHtml);
  $('btnLink').addEventListener('click', async () => {
    await navigator.clipboard.writeText(location.href);
    $('btnLink').textContent = 'Skopiowano';
    setTimeout(() => { $('btnLink').textContent = 'Skopiuj link z moimi liczbami'; }, 2000);
  });
  // Chart.js rysuje canvas dopiero po ulozeniu strony - przed drukiem wymuszamy odswiezenie.
  window.addEventListener('beforeprint', () => {
    wykresMies?.resize(); wykresZwrot?.resize();
  });
  przelicz();
}

start();
