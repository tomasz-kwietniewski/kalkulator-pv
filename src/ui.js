/**
 * Warstwa interfejsu. Nie liczy niczego sama - tylko zbiera parametry, wola silnik
 * i model cenowy, a potem rysuje wynik. Cala arytmetyka siedzi w engine.js,
 * pricing.js i economics.js, dzieki czemu da sie ja testowac z Node.
 */
import profile from '../data/profiles.js';
import rceDane from '../data/rce.js';
import { symuluj, krzywaMagazynu } from './engine.js';
import { rachunekRoczny, DYNAMICZNA, OPERATORZY } from './pricing.js';
import { maskiProfilu, STREFY } from './zones.js';
import { PROFILE_PV, profilPv, mnoznikNachylenia, NACHYLENIA, ZRODLO } from './pv.js';
import { parsujTekst, proponujKolumny, zbudujProfil, BladImportu } from './import.js';
import { DOMY, profilZuzycia, opisDomu } from './domy.js';
import {
  pozycjeZCennika, sumaPozycji, rozdzielKwote, POZYCJE_KOSZTU,
  kaskadaNakladu, zwrot, zwrotDwutorowo, dotacjaPME2, cenaSklepowaMagazynu,
  WIDELKI_OFERT_2025, WIDELKI_EPS, WIDELKI_RYNKOWE, widelkiRynkowe, DOTACJE, PME2,
} from './economics.js';
import {
  rysujProfilDoby, rysujProfilMiesiecy,
  rysujMiesiace, rysujZwrot, rysujNasycenie, kolumnaPrzeplywu,
  wszystkieWykresy, odswiezWykresy, KOLORY,
} from './charts.js';
import { zl, kwh, proc, zLatami, liczba, punktyProc } from './format.js';

// Maski stref liczy sie z kalendarza okresu profilu i osobno dla kazdego operatora,
// bo godziny stref sa u kazdego inne. Liczymy leniwie i zapamietujemy - jedna maska
// to przebieg po 8 760 godzinach, a przy suwaku przeliczamy strone przy kazdym ruchu.
const maskiOperatora = new Map();
const maski = (operator) => {
  if (!maskiOperatora.has(operator)) {
    maskiOperatora.set(operator, maskiProfilu(profile, STREFY[operator]));
  }
  return maskiOperatora.get(operator);
};

/** Grupy strefowe, ktore dany operator ma opisane w taryfie. */
const grupyOperatora = (operator) => ['G11', ...Object.keys(STREFY[operator].grupy)];

/**
 * Lista taryf zalezy od operatora: ENEA nie podaje w taryfie godzin stref G12
 * (ustala je indywidualnie), wiec tej opcji przy niej nie pokazujemy, zamiast
 * pokazywac wynik policzony na zgadnietych godzinach.
 */
function dopasujTaryfyDoOperatora() {
  const operator = $('operator').value;
  const dostepne = new Set([...grupyOperatora(operator), 'dynamiczna']);
  const select = $('grupa');
  [...select.options].forEach((opcja) => { opcja.hidden = !dostepne.has(opcja.value); });
  if (!dostepne.has(select.value)) select.value = 'G12w';

  const def = STREFY[operator];
  const brakujace = ['G12', 'G12w'].filter((g) => !def.grupy[g]);
  $('grupaHint').textContent = def.sezony
    ? 'U tego operatora tania strefa popołudniowa przesuwa się z sezonem: 13-15 zimą, 15-17 latem.'
    : `Godziny stref u tego operatora są takie same przez cały rok.${
      brakujace.length ? ` Taryfa nie podaje godzin ${brakujace.join(' i ')}, więc tej grupy tu nie ma.` : ''}`;
}

const rce = rceDane.rce;
const $ = (id) => document.getElementById(id);

/** Zuzycie auta: 20 tys. km daje ok. 6 100 kWh z gniazdka (model z danych wlasciciela). */
const KWH_NA_KM = 0.305;

/** Pola kosztowe maja wlasne id w formularzu - mapowanie na nazwy pozycji z economics.js. */
const POLE_POZYCJI = {
  panele: 'kosztPanele', falownik: 'kosztFalownik', magazyn: 'kosztMagazyn', eps: 'kosztEps',
};

const POLA = ['ogrzewanie', 'zuzycie', 'auto', 'lokalizacja', 'orientacja', 'nachylenie', 'kwp', 'magazyn',
  'operator', 'grupa', 'eps',
  'kosztPanele', 'kosztFalownik', 'kosztMagazyn', 'kosztEps', 'koszt',
  'dotacja', 'pit', 'wzrostCen', 'rezerwa', 'dobieranie', 'podatnicy',
  'mocAwaria', 'limitEps'];

/** Pojemnosci, dla ktorych liczymy krzywa nasycenia. Kazda to pelna symulacja 8760 h. */
const PUNKTY_KRZYWEJ = [0, 2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20, 22.5, 25, 27.5, 30];

/**
 * Czy uzytkownik wpisal wlasne kwoty. Dopoki nie - pozycje przeliczaja sie z cennika
 * przy kazdej zmianie mocy albo pojemnosci.
 */
let kosztRecznie = false;

/**
 * Ostatnie niezerowe pozycje, w ktorych proporcjach rozdzielamy kwote laczna.
 * Trzymane osobno od pol formularza celowo: gdy uzytkownik kasuje pole "Razem",
 * zeby wpisac kwote od nowa, pola pozycji na moment zjezdzaja do zera - i bez tej
 * kopii proporcje przepadlyby po pierwszym wpisanym znaku.
 */
let proporcjeKosztu = null;

function czytajPola() {
  const operator = $('operator').value;
  const lokalizacja = $('lokalizacja').value;
  const ogrzewanie = $('ogrzewanie').value;
  const orientacja = $('orientacja').value;
  const nachylenie = +$('nachylenie').value;
  const grupa = $('grupa').value;
  return {
    operator,
    zuzycieDomuKWh: +$('zuzycie').value,
    poborAutaKWh: +$('auto').value * KWH_NA_KM,
    lokalizacja,
    ogrzewanie,
    orientacja,
    nachylenie,
    mnoznikNachylenia: mnoznikNachylenia(nachylenie, orientacja),
    // Profil produkcji podmieniamy na wybrana lokalizacje, a ksztalt zuzycia domu -
    // na wczytany z pliku, jesli uzytkownik go podal. Reszta (auto, dni wolne) zostaje
    // ze zmierzonego roku.
    // Wlasny plik z licznika wygrywa z archetypem - to sa dane, a nie rekonstrukcja.
    profil: {
      ...profile,
      pv_per_kwp: profilPv(lokalizacja),
      house_per_MWh: profilWlasny ? profilWlasny.perMWh : profilZuzycia(ogrzewanie),
    },
    wlasnyProfil: !!profilWlasny,
    kWp: +$('kwp').value,
    magazynKWh: +$('magazyn').value,
    grupa,
    dynamiczna: grupa === 'dynamiczna',
    grupaRozliczen: grupa === 'dynamiczna' ? 'G12w' : grupa,
    MASKI: maski(operator),
    eps: $('eps').checked,
    dotacja: +$('dotacja').value,
    pit: $('pit').value,
    wzrostCen: +$('wzrostCen').value / 100,
    rezerwaAwaryjna: +$('rezerwa').value / 100,
    ladowanieZSieci: $('dobieranie').value === '1',
    podatnicy: +$('podatnicy').value,
  };
}

const czytajPozycje = () => Object.fromEntries(
  POZYCJE_KOSZTU.map((k) => [k, +$(POLE_POZYCJI[k]).value || 0]),
);

function zapiszPozycje(pozycje) {
  POZYCJE_KOSZTU.forEach((k) => { $(POLE_POZYCJI[k]).value = pozycje[k]; });
  $('koszt').value = sumaPozycji(pozycje);
  if (sumaPozycji(pozycje) > 0) proporcjeKosztu = { ...pozycje };
}

/**
 * Reakcja na zmiane w polach kosztowych. Pozycje i kwota laczna sa dwoma widokami
 * tej samej rzeczy, wiec edycja jednej strony musi przeliczyc druga.
 */
function obsluzKoszt(id, p) {
  kosztRecznie = true;
  if (id === 'koszt') {
    const wzorzec = (proporcjeKosztu && sumaPozycji(proporcjeKosztu) > 0)
      ? proporcjeKosztu
      : pozycjeZCennika({ kWp: p.kWp, magazynKWh: p.magazynKWh, zasilanieAwaryjne: p.eps });
    const nowe = rozdzielKwote(+$('koszt').value, wzorzec);
    POZYCJE_KOSZTU.forEach((k) => { $(POLE_POZYCJI[k]).value = nowe[k]; });
  } else {
    const pozycje = czytajPozycje();
    $('koszt').value = sumaPozycji(pozycje);
    if (sumaPozycji(pozycje) > 0) proporcjeKosztu = { ...pozycje };
  }
}

/** Jeden wariant instalacji: symulacja + rachunek. */
function policzWariant(p, kWp, magazynKWh) {
  const wynik = symuluj({
    kWp, magazynKWh,
    zuzycieDomuKWh: p.zuzycieDomuKWh,
    poborAutaKWh: p.poborAutaKWh,
    orientacja: p.orientacja,
    mnoznikNachylenia: p.mnoznikNachylenia,
    rezerwaAwaryjna: p.rezerwaAwaryjna,
    maskaStrefy: p.MASKI[p.grupaRozliczen],
    // Dobieranie z sieci ma sens tylko przy taryfie ze strefami.
    ladowanieZSieci: p.ladowanieZSieci && magazynKWh > 0 && p.grupaRozliczen !== 'G11',
  }, p.profil);
  const rachunek = rachunekRoczny(wynik, p.MASKI[p.grupaRozliczen], p.grupaRozliczen, {
    operator: p.operator,
    rce, dynamiczna: p.dynamiczna, czapka: DYNAMICZNA.czapka, netBilling: kWp > 0,
  });
  return { wynik, rachunek };
}

/* --- wlasny profil z licznika ---------------------------------------------------- */

/**
 * Wczytany plik i zbudowany z niego profil. Trzymamy je tylko w pamieci karty:
 * plik nigdzie nie jedzie, nie wchodzi do adresu i nie jest zapisywany.
 */
let plikProfilu = null;
let profilWlasny = null;

const $blad = (tekst) => {
  const el = $('importBlad');
  el.textContent = tekst;
  el.hidden = !tekst;
};

/**
 * Eksporty z polskich portali bywaja w Windows-1250 i wtedy naglowek "Zuzycie" przychodzi
 * z krzakami, przez co propozycja kolumn traci sens. Probujemy wiec najpierw UTF-8,
 * a gdy sie nie da - cp1250.
 */
async function odczytajTekst(plik) {
  const bufor = await plik.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bufor);
  } catch {
    return new TextDecoder('windows-1250').decode(bufor);
  }
}

function pokazPodglad() {
  const { naglowki, wiersze } = plikProfilu;
  const komorki = (w) => w.map((k) => `<td>${k.replace(/[<>&]/g, '')}</td>`).join('');
  $('importTabela').innerHTML = `<tr>${naglowki.map((n) => `<th>${n}</th>`).join('')}</tr>`
    + wiersze.slice(0, 5).map((w) => `<tr>${komorki(w)}</tr>`).join('');

  const propozycja = proponujKolumny(naglowki, wiersze);
  for (const [id, wybrana] of [['kolData', propozycja.data], ['kolWartosc', propozycja.wartosc]]) {
    $(id).innerHTML = naglowki
      .map((n, k) => `<option value="${k}"${k === wybrana ? ' selected' : ''}>${n}</option>`)
      .join('');
  }
  $('kolJednostka').value = propozycja.jednostka;
  $('importPowod').textContent = propozycja.powod;
  $('importPodglad').hidden = false;
  $('importWynik').hidden = true;
  $blad('');
}

function wczytajProfil() {
  if ($('importZPV').checked) {
    $blad('Plik z licznika z okresu, gdy masz już fotowoltaikę, pokazuje pobór z sieci,'
      + ' a nie zużycie domu - brakuje w nim tego, co zjadły panele. Policzenie na nim'
      + ' autokonsumpcji zaniżyłoby wynik. Potrzebny jest plik sprzed instalacji albo'
      + ' zużycie całego domu z falownika lub systemu zarządzania energią.');
    $('importWynik').hidden = true;
    profilWlasny = null;
    przelicz();
    return;
  }
  try {
    const wynik = zbudujProfil(plikProfilu, {
      data: +$('kolData').value,
      wartosc: +$('kolWartosc').value,
      jednostka: $('kolJednostka').value,
    });
    profilWlasny = wynik;
    $blad('');
    $('zuzycie').value = Math.round(wynik.sumaKWh);
    pokazWczytanyProfil(wynik);
    opiszOgrzewanie();
    przelicz();
  } catch (e) {
    if (!(e instanceof BladImportu)) throw e;
    profilWlasny = null;
    $('importWynik').hidden = true;
    $blad(e.message);
    przelicz();
  }
}

/** Podsumowanie liczbowe i dwa wykresy - to jest wlasciwa walidacja importu. */
function pokazWczytanyProfil(wynik) {
  const doba = new Array(24).fill(0);
  const miesiace = [];
  const DNI = [31, 30, 31, 30, 31, 31, 28, 31, 30, 31, 30, 31];
  wynik.godziny.forEach((v, i) => { doba[i % 24] += v / 365; });
  let h = 0;
  for (const dni of DNI) {
    let suma = 0;
    for (let i = 0; i < dni * 24; i++) suma += wynik.godziny[h++];
    miesiace.push(suma);
  }
  rysujProfilDoby($('wykresImportDoba'), doba);
  rysujProfilMiesiecy($('wykresImportMiesiace'), miesiace);

  const czesci = [
    `Wczytano <b>${liczba(wynik.godzinWczytanych)}</b> godzin, suma <b>${kwh(wynik.sumaKWh)}</b>`,
    `dane co ${wynik.interwalMinut} min, początek ${wynik.startISO}`,
  ];
  if (wynik.godzinUzupelnionych) {
    czesci.push(`${liczba(wynik.godzinUzupelnionych)} godzin bez danych uzupełniono średnią z sąsiednich`);
  }
  const uwagi = [
    'Porównaj tę sumę z fakturą - jeśli się zgadza, to Twój dom.',
    'Dni tygodnia bierzemy z kalendarza 2025/26, więc przy pliku z innego roku'
      + ' weekendy wypadają o dzień lub dwa obok.',
  ];
  if (+$('auto').value > 0) {
    uwagi.push('Jeśli ładowanie auta jest już w tym pliku, ustaw przebieg na zero,'
      + ' żeby nie policzyć go dwa razy.');
  }
  $('importPodsumowanie').innerHTML = `${czesci.join(', ')}.<br>`
    + `<span style="color:var(--faint)">${uwagi.join(' ')}</span>`;
  $('importWynik').hidden = false;
}

function usunProfilWlasny() {
  profilWlasny = null;
  plikProfilu = null;
  $('plikProfilu').value = '';
  $('importPodglad').hidden = true;
  $('importWynik').hidden = true;
  $blad('');
  opiszOgrzewanie();
  przelicz();
}

function przelicz() {
  const p = czytajPola();
  $('kwpOut').textContent = p.kWp + ' kWp';
  $('magazynOut').textContent = p.magazynKWh + ' kWh';
  $('kosztEps').disabled = !p.eps;

  // Dopoki uzytkownik nie wpisal wlasnych kwot, pozycje ida z cennika odniesienia.
  if (!kosztRecznie) {
    zapiszPozycje(pozycjeZCennika({
      kWp: p.kWp, magazynKWh: p.magazynKWh, zasilanieAwaryjne: p.eps,
    }));
  } else if (!p.eps) {
    $('kosztEps').value = 0;
    $('koszt').value = sumaPozycji(czytajPozycje());
  }
  const pozycje = czytajPozycje();

  // Trzy warianty obok siebie. Przy magazynie 0 trzeci bylby kopia drugiego, wiec
  // wtedy pokazujemy przykladowy magazyn 10 kWh - zeby bylo widac, co by dal.
  const magazynPokazowy = p.magazynKWh > 0 ? p.magazynKWh : 10;
  // Koszt magazynu bierzemy z pozycji, a gdy uzytkownik magazynu nie planuje - z cennika
  // dla pojemnosci pokazowej. Dzieki rozbiciu na pozycje nie trzeba juz nic skalowac:
  // cena magazynu jest wprost z oferty, a nie zgadywana z proporcji calosci.
  const kosztMagazynuPokazowego = p.magazynKWh > 0
    ? pozycje.magazyn
    : pozycjeZCennika({ kWp: p.kWp, magazynKWh: magazynPokazowy }).magazyn;
  const bezMagazynu = pozycje.panele + pozycje.falownik + pozycje.eps;

  const warianty = [
    { nazwa: 'Bez fotowoltaiki', kWp: 0, magazyn: 0, koszt: 0 },
    { nazwa: `Sama fotowoltaika ${p.kWp} kWp`, kWp: p.kWp, magazyn: 0, koszt: bezMagazynu },
    {
      nazwa: `Fotowoltaika + magazyn ${magazynPokazowy} kWh`
        + (p.magazynKWh > 0 ? '' : ' (dla porównania)'),
      kWp: p.kWp, magazyn: magazynPokazowy, koszt: bezMagazynu + kosztMagazynuPokazowego,
    },
  ].map((w) => ({ ...w, ...policzWariant(p, w.kWp, w.magazyn) }));

  const bazowy = warianty[0].rachunek.brutto;

  warianty.forEach((w) => {
    w.oszczednosc = bazowy - w.rachunek.brutto;
    if (w.kWp === 0) { w.kaskada = null; w.zwrot = null; return; }
    w.kaskada = kaskadaNakladu({
      koszt: w.koszt, dotacja: p.dotacja, stawka: p.pit, podatnicy: p.podatnicy,
    });
    w.ulga = w.kaskada.ulga;
    w.naklad = w.kaskada.naklad;
    w.zwrot = zwrotDwutorowo({
      koszt: w.koszt, naklad: w.naklad,
      oszczednoscRoczna: w.oszczednosc, wzrostCen: p.wzrostCen,
    });
  });

  const wybrany = p.magazynKWh > 0 ? warianty[2] : warianty[1];

  rysujKarty(p, warianty, wybrany);
  rysujTabele(warianty);
  rysujTaryfy(p);
  rysujMagazyn(p, warianty);
  rysujKaskade(p, wybrany);
  rysujHero(p, wybrany);
  rysujPme2(p, pozycje);
  rysujDotacje(p, wybrany);
  rysujPasek(sumaPozycji(pozycje), p);
  rysujMiesiace($('wykresMies'), warianty[2].wynik.miesiace);
  rysujWykresZwrotu(warianty);
  rysujEps(p);
  zapiszWAdresie();
}

/* --- sekcja 3: wynik ------------------------------------------------------------- */

function rysujKarty(p, w, karta) {
  const pelny = w[2];
  const sama = w[1];
  const dodatekMagazynu = pelny.oszczednosc - sama.oszczednosc;

  $('podsumowanie').innerHTML = pelny.kWp === 0
    ? 'Ustaw moc fotowoltaiki powyżej zera, żeby zobaczyć wynik.'
    : `Przy zużyciu ${kwh(p.zuzycieDomuKWh)} rocznie instalacja ${pelny.kWp} kWp`
      + (p.magazynKWh > 0 ? ` z magazynem ${p.magazynKWh} kWh` : ' bez magazynu')
      + ` obniża rachunek z <b>${zl(w[0].rachunek.brutto)}</b> `
      + `do <b>${zl(karta.rachunek.brutto)}</b> rocznie.`;

  $('karty').innerHTML = [
    ['Rachunek dziś', zl(w[0].rachunek.brutto), 'c', 'bez fotowoltaiki'],
    ['Rachunek po instalacji', zl(karta.rachunek.brutto), 'g',
      `${karta.kWp} kWp${p.magazynKWh > 0 ? ' + ' + p.magazynKWh + ' kWh' : ', bez magazynu'}`],
    ['Oszczędność rocznie', zl(karta.oszczednosc), 'g',
      p.magazynKWh > 0 ? `w tym dzięki magazynowi: ${zl(dodatekMagazynu)}`
        : `magazyn ${pelny.magazyn} kWh dodałby ${zl(dodatekMagazynu)}`],
    ['Autokonsumpcja', proc(karta.wynik.autokonsumpcja), 'b',
      `tyle własnego prądu zużywasz, reszta idzie do sieci`],
  ].map(([lab, val, kl, foot]) =>
    `<div class="card"><div class="lab">${lab}</div><div class="val ${kl}">${val}</div>`
    + `<div class="foot">${foot}</div></div>`).join('');
}

function rysujTabele(w) {
  const najlepszy = w.reduce((a, b) => {
    const ra = a.zwrot?.poOdzyskach.rokZwrotu ?? Infinity;
    const rb = b.zwrot?.poOdzyskach.rokZwrotu ?? Infinity;
    return rb < ra ? b : a;
  });
  $('tabela').querySelector('tbody').innerHTML = w.map((x) => `<tr${x === najlepszy ? ' class="najlepszy"' : ''}>
    <td>${x.nazwa}</td>
    <td>${zl(x.rachunek.brutto)}</td>
    <td>${x.kWp ? zl(x.oszczednosc) : '-'}</td>
    <td>${x.kWp ? proc(x.wynik.autokonsumpcja) : '-'}</td>
    <td>${proc(x.wynik.samowystarczalnosc)}</td>
    <td>${x.kWp ? zl(x.naklad) : '-'}</td>
    <td>${x.zwrot?.poOdzyskach.rokZwrotu ? zLatami(x.zwrot.poOdzyskach.rokZwrotu) : (x.kWp ? 'ponad 20 lat' : '-')}</td>
  </tr>`).join('');
}

/** Porownanie taryf na tej samej instalacji - to osobna decyzja niz sama fotowoltaika. */
function rysujTaryfy(p) {
  const policz = (g, dynamiczna) => {
    const w = symuluj({
      kWp: p.kWp, magazynKWh: p.magazynKWh,
      zuzycieDomuKWh: p.zuzycieDomuKWh, poborAutaKWh: p.poborAutaKWh,
      orientacja: p.orientacja, rezerwaAwaryjna: p.rezerwaAwaryjna, maskaStrefy: p.MASKI[g],
      mnoznikNachylenia: p.mnoznikNachylenia,
      ladowanieZSieci: p.ladowanieZSieci && p.magazynKWh > 0 && g !== 'G11',
    }, p.profil);
    return rachunekRoczny(w, p.MASKI[g], g, {
      rce, dynamiczna, netBilling: p.kWp > 0, operator: p.operator,
    }).brutto;
  };

  // Wariant dynamiczny liczymy na harmonogramie G12w: magazyn pracuje wedlug stref,
  // a rozliczenie idzie po cenach gieldowych. To celowo ostrozne zalozenie - odpowiada
  // zwyklemu falownikowi z Time of Use, a nie takiemu, ktory sam sledzi ceny godzinowe.
  // Drogie godziny na gieldzie i tak wypadaja w oknach zblizonych do stref taryfowych.
  const wszystkie = [
    ...grupyOperatora(p.operator).map((g) => ({ g, brutto: policz(g, false) })),
    { g: 'dynamiczna', brutto: policz('G12w', true) },
  ].sort((a, b) => a.brutto - b.brutto);

  const naj = wszystkie[0];
  const nazwy = { G11: 'G11', G12: 'G12', G12w: 'G12w', dynamiczna: 'taryfa dynamiczna' };
  $('taryfaInfo').innerHTML = `<b>Wybór taryfy to osobna decyzja niż fotowoltaika</b> - i darmowa.
    Na tym profilu najtańsza wychodzi <b>${nazwy[naj.g]}</b> (${zl(naj.brutto)} rocznie).
    Pozostałe: ${wszystkie.slice(1).map((x) => `${nazwy[x.g]} ${zl(x.brutto)}`).join(', ')}.
    ${p.grupa !== naj.g ? `Zmiana taryfy dałaby <b>${zl(wszystkie.find((x) => x.g === p.grupa).brutto - naj.brutto)}</b> rocznie bez żadnej inwestycji.` : 'Masz już wybraną najtańszą.'}
    <br><span style="font-size:12.5px;color:var(--faint)">Taryfa dynamiczna liczona bez „Tarczy" -
    czapka cenowa wygasa z końcem 2026 i zakładamy, że nie zostanie przedłużona.
    Wynik zakłada zwykłą pracę magazynu według harmonogramu stref, bez reagowania na
    bieżące ceny - drogie godziny na giełdzie i tak wypadają w powtarzalnych oknach,
    podobnych do stref G12w. Zimą ta taryfa niewiele różni się od strefowej, bo w drogich
    godzinach ceny bywają wtedy bardzo wysokie; więcej daje latem, gdy tanich godzin
    jest wyraźnie więcej niż w taryfie dwustrefowej. Falownik sterujący się cenami
    godzinowymi wyciągnie z niej jeszcze trochę, ale to ma znaczenie głównie przy
    ładowaniu auta, które da się swobodnie przesuwać w dobie.</span>`;
}

/* --- sekcja 4: co daje magazyn --------------------------------------------------- */

function rysujMagazyn(p, w) {
  const sama = w[1];
  const pelny = w[2];
  const pojemnosc = pelny.magazyn;
  const hipotetyczny = p.magazynKWh === 0;

  const dodatek = pelny.oszczednosc - sama.oszczednosc;
  const punkty = pelny.wynik.autokonsumpcja - sama.wynik.autokonsumpcja;
  const mniejDoSieci = sama.wynik.eksportKWh - pelny.wynik.eksportKWh;
  const kosztMagazynu = pelny.koszt - sama.koszt;
  const nakladMagazynu = pelny.naklad - sama.naklad;
  // Zwrot samego magazynu liczymy tak samo jak zwrot calosci - z uwzglednieniem wzrostu
  // cen energii. Proste dzielenie nakladu przez roczna oszczednosc dawaloby inna liczbe
  // niz reszta strony i wygladalo na blad.
  const zwrotMagazynu = dodatek > 0
    ? zwrot({ naklad: nakladMagazynu, oszczednoscRoczna: dodatek, lat: 40, wzrostCen: p.wzrostCen }).rokZwrotu
    : null;

  const zwrotSamej = sama.zwrot?.poOdzyskach.rokZwrotu;
  const zwrotPelnej = pelny.zwrot?.poOdzyskach.rokZwrotu;
  // Werdykt formulujemy jako wybor miedzy dwiema sensownymi opcjami, a nie jako ocene.
  // Na tym profilu magazyn zwykle wydluza zwrot calosci i to zostaje powiedziane wprost,
  // ale sasiad ma z tego wyjsc z decyzja do podjecia, a nie z poczuciem, ze go odradzamy.
  let werdykt;
  if (zwrotPelnej == null) {
    werdykt = 'Przy tych parametrach wariant z magazynem nie wychodzi na zero w ciągu 20 lat.';
  } else if (zwrotSamej == null) {
    werdykt = `Wariant z magazynem wychodzi na zero po ${zLatami(zwrotPelnej)}, `
      + 'a sama fotowoltaika nie zdąża w ciągu 20 lat.';
  } else if (zwrotPelnej < zwrotSamej) {
    werdykt = `Magazyn tu <b>skraca</b> zwrot całości z ${zLatami(zwrotSamej)} do `
      + `${zLatami(zwrotPelnej)}, mimo że początkowa inwestycja jest większa.`;
  } else {
    const obaSzybkie = zwrotPelnej <= 12;
    werdykt = `Zwrot całości wydłuża się z ${zLatami(zwrotSamej)} do ${zLatami(zwrotPelnej)}, `
      + 'bo magazyn zwraca się wolniej niż same panele. '
      + (obaSzybkie
        ? 'Obie wersje wychodzą na plus w rozsądnym czasie, więc to raczej wybór między '
          + 'szybszym zwrotem a większą niezależnością od sieci niż między lepszą a gorszą '
          + 'inwestycją. Magazyn dokłada do tego zasilanie awaryjne i spokój przy droższym prądzie.'
        : 'Przy tych cenach magazyn jest więc raczej zakupem pod niezależność od sieci '
          + 'i zasilanie awaryjne niż pod oszczędność.');
  }

  $('magazynLead').innerHTML = p.kWp === 0
    ? 'Ustaw moc fotowoltaiki powyżej zera.'
    : (hipotetyczny ? `Nie planujesz magazynu, więc liczymy przykładowe <b>${pojemnosc} kWh</b>, `
      + 'żeby było widać, co by zmieniło. ' : `Magazyn <b>${pojemnosc} kWh</b> przy tej fotowoltaice. `)
      + `Autokonsumpcja rośnie z ${proc(sama.wynik.autokonsumpcja)} do `
      + `<b>${proc(pelny.wynik.autokonsumpcja)}</b>, czyli o ${punktyProc(punkty)}. `
      + werdykt;

  $('kartyMagazyn').innerHTML = [
    ['Autokonsumpcja', `+${punkty.toFixed(0)} pkt`, 'b',
      `${proc(sama.wynik.autokonsumpcja)} bez magazynu, ${proc(pelny.wynik.autokonsumpcja)} z nim`],
    ['Mniej oddane do sieci', kwh(mniejDoSieci), 'g',
      `zamiast sprzedawać po cenie giełdowej, zużywasz u siebie`],
    ['Oszczędność więcej', zl(dodatek) + '/rok', 'g',
      `ponad to, co daje sama fotowoltaika`],
    ['Sam magazyn zwraca się w', zwrotMagazynu ? zLatami(zwrotMagazynu) : 'ponad 40 lat',
      'a', `${zl(kosztMagazynu)} z oferty, ${zl(nakladMagazynu)} po odzyskach`],
  ].map(([lab, val, kl, foot]) =>
    `<div class="card"><div class="lab">${lab}</div><div class="val ${kl}">${val}</div>`
    + `<div class="foot">${foot}</div></div>`).join('');

  $('przeplywy').innerHTML =
    kolumnaPrzeplywu('Sama fotowoltaika', `${p.kWp} kWp, bez magazynu`, sama.wynik)
    + kolumnaPrzeplywu(`Z magazynem ${pojemnosc} kWh`,
      `${p.kWp} kWp` + (hipotetyczny ? ' - wariant porównawczy' : ''), pelny.wynik);

  const zSieciDoMagazynu = pelny.wynik.doMagazynuZSieci;
  $('przeplywOpis').innerHTML = `Straty ładowania i rozładowania magazynu to `
    + `${kwh(pelny.wynik.stratyMagazynu)} rocznie i są już odjęte od tego, co magazyn oddaje domowi.`
    + (zSieciDoMagazynu > 1
      ? ` Pozycja „z magazynu" obejmuje też ${kwh(zSieciDoMagazynu)} energii dobranej z sieci `
        + 'w taniej strefie - to nie jest prąd z paneli, tylko tańszy prąd kupiony na później.'
      : '');

  rysujKrzywa(p, pojemnosc);
}

function rysujKrzywa(p, wybrana) {
  const krzywa = krzywaMagazynu({
    kWp: p.kWp,
    zuzycieDomuKWh: p.zuzycieDomuKWh,
    poborAutaKWh: p.poborAutaKWh,
    orientacja: p.orientacja,
    mnoznikNachylenia: p.mnoznikNachylenia,
    rezerwaAwaryjna: p.rezerwaAwaryjna,
    maskaStrefy: p.MASKI[p.grupaRozliczen],
    ladowanieZSieci: p.ladowanieZSieci && p.grupaRozliczen !== 'G11',
  }, p.profil, PUNKTY_KRZYWEJ);

  rysujNasycenie($('wykresNasycenie'), krzywa, wybrana);

  // Gdzie krzywa przestaje sie oplacac: pierwszy punkt, w ktorym kolejne 2,5 kWh
  // daje mniej niz jeden punkt procentowy autokonsumpcji.
  const prog = krzywa.findIndex((punkt, i) =>
    i > 0 && punkt.autokonsumpcja - krzywa[i - 1].autokonsumpcja < 1);
  const wPunkcie = krzywa.find((x) => Math.abs(x.magazynKWh - wybrana) < 1.26);
  $('nasycenieOpis').innerHTML = (wPunkcie
    ? `Przy ${wybrana} kWh zużywasz u siebie <b>${proc(wPunkcie.autokonsumpcja, 1)}</b> własnej produkcji, `
      + `a ${proc(wPunkcie.samowystarczalnosc, 1)} prądu w domu pochodzi z instalacji. `
    : '')
    + (prog > 0
      ? `Powyżej <b>${liczba(krzywa[prog - 1].magazynKWh)} kWh</b> każde kolejne 2,5 kWh pojemności podnosi `
        + 'autokonsumpcję o mniej niż punkt procentowy - od tego miejsca dopłacasz głównie za rezerwę '
        + 'na wypadek awarii, a nie za oszczędność.'
      : 'Na tym profilu krzywa nie zdążyła się wypłaszczyć w pokazanym zakresie - '
        + 'zużycie jest na tyle duże, że magazyn wciąż ma co przyjmować.');
}

/* --- sekcja 5: koszt i zwrot ----------------------------------------------------- */

function rysujKaskade(p, w) {
  if (!w.kaskada) { $('kaskada').innerHTML = ''; return; }
  const k = w.kaskada;
  const opis = `${p.kWp} kWp`
    + (p.magazynKWh > 0 ? `, magazyn ${p.magazynKWh} kWh` : ', bez magazynu')
    + (p.eps ? ', z zasilaniem awaryjnym' : '');

  const wiersz = (klasa, tytul, podpis, kwota) => `<div class="w ${klasa}">
    <span class="op">${tytul}<small>${podpis}</small></span>
    <span class="kw">${kwota}</span></div>`;

  $('kaskada').innerHTML = wiersz('', 'Koszt z oferty', opis, zl(k.koszt))
    + (k.dotacja > 0
      ? wiersz('odjecie', 'Dotacja', 'wpisana przez Ciebie', '- ' + zl(k.dotacja))
      : wiersz('odjecie', 'Dotacja', 'brak czynnego naboru na dziś', '0 zł'))
    + (k.ulga > 0
      ? wiersz('odjecie', 'Ulga termomodernizacyjna',
        'wraca dopiero przy rozliczeniu PIT za rok, w którym zapłacisz fakturę', '- ' + zl(k.ulga))
      : wiersz('odjecie', 'Ulga termomodernizacyjna',
        'odliczenie od dochodu - przy zerowym podatku warte zero', '0 zł'))
    + wiersz('suma', 'Realny koszt inwestycji',
      'tyle zostaje z kieszeni po wszystkich odzyskach', zl(k.naklad));
}

function rysujHero(p, w) {
  if (!w.zwrot) {
    $('heroZwrot').innerHTML = '<div class="glowny"><div class="lab">Zwrot</div>'
      + '<div class="duza">-</div><div class="pod">Ustaw moc fotowoltaiki powyżej zera.</div></div>';
    return;
  }
  const poOdzyskach = w.zwrot.poOdzyskach.rokZwrotu;
  const odPelnej = w.zwrot.odPelnejKwoty.rokZwrotu;
  const saldo = w.zwrot.poOdzyskach.saldoKoncowe;

  $('heroZwrot').innerHTML = `
    <div class="glowny">
      <div class="lab">Inwestycja wychodzi na zero po</div>
      <div class="duza">${poOdzyskach ? zLatami(poOdzyskach) : 'ponad 20 latach'}</div>
      <div class="pod">licząc od realnego kosztu ${zl(w.naklad)}, czyli po dotacji i uldze</div>
    </div>
    <div class="obok">
      <div class="lab">Od pełnej kwoty z oferty</div>
      <div class="srednia">${odPelnej ? zLatami(odPelnej) : 'ponad 20 lat'}</div>
      <div class="pod">${zl(w.koszt)} trzeba mieć na starcie - ulga wraca dopiero
      przy rozliczeniu PIT, a nie w dniu montażu</div>
    </div>
    <div class="obok">
      <div class="lab">Po 20 latach na plusie</div>
      <div class="srednia">${saldo > 0 ? '+' + zl(saldo) : zl(saldo)}</div>
      <div class="pod">przy wzroście cen energii ${(100 * p.wzrostCen).toFixed(1).replace('.', ',')}%
      rocznie i degradacji paneli 0,5% rocznie</div>
    </div>`;
}

function rysujWykresZwrotu(w) {
  rysujZwrot($('wykresZwrot'), [
    {
      nazwa: 'sama fotowoltaika', skrot: 'sama PV',
      przeplyw: w[1].zwrot?.poOdzyskach.przeplyw,
      rokZwrotu: w[1].zwrot?.poOdzyskach.rokZwrotu,
      kolor: KOLORY.niebieski,
    },
    {
      nazwa: 'fotowoltaika z magazynem', skrot: 'z magazynem',
      przeplyw: w[2].zwrot?.poOdzyskach.przeplyw,
      rokZwrotu: w[2].zwrot?.poOdzyskach.rokZwrotu,
      kolor: KOLORY.zielony, grubosc: 2.5,
    },
  ]);
}

/**
 * Szacunek dotacji z PME 2 - pokazany, ale NIE wliczony w wynik.
 *
 * Nabor nie ruszyl i regulaminu nie ma, wiec doliczanie tej kwoty do czasu zwrotu
 * obiecywaloby pieniadze, ktorych nikt jeszcze nie dostal. Kto chce zobaczyc wynik
 * z dotacja, wstawia ja jednym klikiem.
 */
function rysujPme2(p, pozycje) {
  const el = $('pme2Info');
  if (p.kWp === 0 || p.magazynKWh === 0) {
    el.innerHTML = '<div class="naglowek">Dotacja na magazyn</div>'
      + '<div class="wiaze">Program dotyczy magazynu energii. Ustaw pojemność powyżej zera, '
      + 'żeby zobaczyć, ile mógłby dołożyć.</div>';
    return;
  }
  if (p.magazynKWh < PME2.minimalnaPojemnoscKWh) {
    el.innerHTML = '<div class="naglowek">Dotacja na magazyn: nie przysługuje</div>'
      + `<div class="wiaze">Twoje ${p.magazynKWh} kWh nie sięga minimum `
      + `${PME2.minimalnaPojemnoscKWh} kWh wymaganego w programie Przydomowe Magazyny `
      + 'Energii. Poniżej tej pojemności wniosku nie da się złożyć.</div>';
    return;
  }

  const d = dotacjaPME2({ pojemnoscKWh: p.magazynKWh, kosztMagazynu: pozycje.magazyn });
  const sklep = cenaSklepowaMagazynu(p.magazynKWh);
  const zaKWh = pozycje.magazyn / p.magazynKWh;
  const opisReguly = {
    udzialKosztow: `Wiąże <b>30% kosztu magazynu</b>, a nie limit ${PME2.zlZaKWh} zł za kWh `
      + `(ten dałby ${zl(PME2.zlZaKWh * p.magazynKWh)}) ani górne ${zl(d.gorny)}.`,
    zlZaKWh: `Wiąże limit <b>${PME2.zlZaKWh} zł za kWh</b> pojemności.`,
    gornyLimit: `Wiąże <b>górny limit programu</b>, czyli ${zl(d.gorny)}.`,
  }[d.wiaze];

  el.innerHTML = `<div class="naglowek">Dotacja z programu Przydomowe Magazyny Energii</div>
    <div class="kwota">ok. ${zl(d.kwota)}</div>
    <div class="wiaze">${opisReguly} Nabór planowany na III kwartał 2026 - dopóki nie ruszy,
    wynik liczymy bez tej kwoty.</div>
    <div class="akcjarow">
      <button class="akcja maly noprint" data-akcja="wstawDotacje">Policz z tą dotacją</button>
      <span class="info" style="font-size:12.5px;color:var(--faint)">wpisze ${zl(d.kwota)}
      w pole obok</span>
    </div>
    <div class="ostrzezenie">
      <b>Jak liczy się ta dotacja.</b> Program dopłaca do <b>pozycji „magazyn"</b>, a nie
      do całej instalacji. Ta sama inwestycja za tę samą kwotę łączną da więc różną
      dotację zależnie od tego, ile z niej przypisano magazynowi - a przypisać można
      aż do ${zl(PME2.maksKosztZaKWh)} za kWh. U Ciebie magazyn wychodzi
      <b>${zl(zaKWh)} za kWh</b>; sam sprzęt tej pojemności kosztuje w sklepie producenta
      ${zl(sklep.kwota)} (${sklep.modulow} ${sklep.modulow === 1 ? 'moduł' : 'moduły'}
      po 5,12 kWh, razem ${liczba(sklep.pojemnoscRzeczywista)} kWh), reszta to montaż,
      konfiguracja, gwarancja i marża wykonawcy.
      <p style="margin:8px 0 0"><b>Porównuj oferty po kwocie łącznej</b> - to ona mówi,
      ile wydasz. I licz się z tym, że tam, gdzie są dopłaty, ceny idą w górę: część
      dofinansowania zostaje u wykonawcy, a nie u Ciebie. To argument za zebraniem kilku
      ofert, a nie za rezygnacją z dotacji.</p>
    </div>`;
}

function rysujDotacje(p, w) {
  const ulga = w.ulga ?? 0;
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
        + 'energii, nie tylko panele. Odliczyć można wyłącznie tę część wydatku, którą '
        + 'pokryłeś z własnych pieniędzy - to, co pokryła dotacja, do ulgi nie wchodzi.'
      : 'nie uwzględniamy jej w wyniku. Odliczenie od dochodu przy zerowym podatku jest warte zero.'}</p>`;
}

/**
 * Pasek widelek rynkowych. Skaluje sie z konfiguracja, bo sztywny zakres z szesciu ofert
 * na 9 kWp bylby dla instalacji 4 kWp mylacy. Znacznik to nasza wycena - stoi zwykle
 * blisko dolnej granicy i tak ma byc, ale uzytkownik ma to widziec.
 */
function rysujPasek(koszt, p) {
  const w = widelkiRynkowe({ kWp: p.kWp, magazynKWh: p.magazynKWh });
  const el = $('pasekOfert');
  if (!w.max) {
    el.style.visibility = 'hidden';
    $('pasekMin').textContent = '';
    $('pasekMax').textContent = '';
    $('pasekOpis').textContent = '';
    $('pasekZrodlo').textContent = '';
    return;
  }
  el.style.visibility = 'visible';
  const skalaMin = 0;
  const skalaMax = Math.max(w.max, koszt) * 1.05;
  const pct = (v) => (100 * (v - skalaMin)) / (skalaMax - skalaMin);

  el.querySelector('.zakres').style.left = pct(w.min) + '%';
  el.querySelector('.zakres').style.width = (pct(w.max) - pct(w.min)) + '%';
  el.querySelector('.znacznik').style.left = Math.min(99, Math.max(0, pct(koszt))) + '%';

  $('pasekMin').textContent = zl(w.min);
  $('pasekMax').textContent = zl(w.max);
  $('pasekOpis').textContent = `widełki rynkowe dla ${liczba(p.kWp)} kWp`
    + `${p.magazynKWh > 0 ? ` i ${liczba(p.magazynKWh)} kWh magazynu` : ' bez magazynu'}`;

  const ponizej = koszt < w.min;
  $('pasekZrodlo').innerHTML = `Typowa wycena rynkowa takiej instalacji to <b>${zl(w.typowa)}</b>.`
    + ` Widełki z ${WIDELKI_RYNKOWE.zrodlo}: instalacje ${WIDELKI_RYNKOWE.pvAktualizacja},`
    + ` magazyny ${WIDELKI_RYNKOWE.magazynAktualizacja} (od ${zl(WIDELKI_RYNKOWE.magazynZaKWh.min)}`
    + ` do ${zl(WIDELKI_RYNKOWE.magazynZaKWh.max)} za kWh, montaż osobno`
    + ` ${zl(WIDELKI_RYNKOWE.montazMagazynu.min)} - ${zl(WIDELKI_RYNKOWE.montazMagazynu.max)}).`
    + (ponizej
      ? ' Twój znacznik stoi na lewo od paska - nasza wycena liczy ceny sprzętu ze sklepu'
        + ' producenta plus narzut na montaż, a oferty pod klucz bywają droższe. Jeśli masz'
        + ' konkretną ofertę, wpisz jej kwotę: czas zwrotu policzy się od Twoich pieniędzy.'
      : '')
    + ` Dla porównania sześć ofert zebranych na tym osiedlu w 2025 mieściło się`
    + ` między ${zl(WIDELKI_OFERT_2025.min)} a ${zl(WIDELKI_OFERT_2025.max)}`
    + ` (mediana ${zl(WIDELKI_OFERT_2025.mediana)}) - dla 9 kWp z magazynem 15 kWh.`;
}

/* --- sekcja 6: zasilanie awaryjne ------------------------------------------------ */

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
       albo zapytaj o wariant z pełną rozdzielnicą i automatycznym przełącznikiem.`;
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
  if (+par.get('koszt') > 0) {
    kosztRecznie = true;
    const pozycje = czytajPozycje();
    // Starsze linki maja tylko kwote laczna - rozdzielamy ja na pozycje wedlug cennika.
    if (sumaPozycji(pozycje) === 0) {
      const wzorzec = pozycjeZCennika({
        kWp: +$('kwp').value, magazynKWh: +$('magazyn').value, zasilanieAwaryjne: $('eps').checked,
      });
      const nowe = rozdzielKwote(+par.get('koszt'), wzorzec);
      POZYCJE_KOSZTU.forEach((k) => { $(POLE_POZYCJI[k]).value = nowe[k]; });
      proporcjeKosztu = { ...nowe };
    } else {
      proporcjeKosztu = { ...pozycje };
    }
  }
}

function pobierzHtml() {
  // Wykresy zamieniamy na obrazki, zeby plik byl samowystarczalny i bez skryptow.
  const kopia = document.documentElement.cloneNode(true);
  kopia.querySelectorAll('script').forEach((s) => s.remove());
  kopia.querySelectorAll('.noprint').forEach((s) => s.remove());
  wszystkieWykresy().forEach(([id, wykres]) => {
    const cel = kopia.querySelector('#' + id);
    if (!cel) return;
    const img = kopia.ownerDocument.createElement('img');
    img.src = wykres.toBase64Image();
    img.style.width = '100%';
    cel.replaceWith(img);
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

const POLA_KOSZTU = ['koszt', ...Object.values(POLE_POZYCJI)];

/** Listy zalezne od danych: profile naslonecznienia i katy nachylenia dachu. */
function wypelnijListy() {
  $('lokalizacja').innerHTML = PROFILE_PV.map((pr) => {
    const etykieta = pr.zrodlo === 'pomiar'
      ? `${pr.nazwa} - profil zmierzony`
      : `${pr.nazwa} - model PVGIS`;
    return `<option value="${pr.id}">${etykieta} (${pr.uzyskRoczny} kWh/kWp)</option>`;
  }).join('');
  $('ogrzewanie').innerHTML = DOMY
    .map((d) => `<option value="${d.id}">${d.nazwa}</option>`).join('');
  $('nachylenie').innerHTML = NACHYLENIA
    .map((n) => `<option value="${n}"${n === 35 ? ' selected' : ''}>${n}°</option>`).join('');
}

/** Skad pochodzi wybrany profil - to ma byc widoczne przy samym polu, nie w stopce. */
function opiszLokalizacje(id) {
  const pr = PROFILE_PV.find((x) => x.id === id) ?? PROFILE_PV[0];
  $('lokalizacjaHint').textContent = pr.zrodlo === 'pomiar'
    ? `Zmierzony rok pracy realnej instalacji: ${pr.uzyskRoczny} kWh z każdego kWp.`
    : `${pr.opis} Dane: ${ZRODLO.nazwa}, ${ZRODLO.atrybucja}.`;
}

/** Ksztalt zuzycia z pliku uzytkownika przykrywa archetyp - trzeba to powiedziec wprost. */
function opiszOgrzewanie() {
  $('ogrzewanieHint').textContent = profilWlasny
    ? 'Liczymy na Twoim pliku z licznika, więc ten wybór nic teraz nie zmienia.'
    : opisDomu($('ogrzewanie').value);
}

function start() {
  wypelnijListy();
  odtworzZAdresu();
  opiszLokalizacje($('lokalizacja').value);
  opiszOgrzewanie();
  dopasujTaryfyDoOperatora();
  POLA.forEach((id) => {
    const el = $(id);
    el.addEventListener('input', () => {
      if (POLA_KOSZTU.includes(id)) obsluzKoszt(id, czytajPola());
      // Zmiana mocy, pojemnosci albo zasilania awaryjnego zmienia to, co jest w ofercie,
      // wiec wracamy do cennika - inaczej kwota z poprzedniej konfiguracji zostalaby
      // przypisana do nowej i cicho zafalszowala zwrot.
      if (['kwp', 'magazyn', 'eps'].includes(id)) kosztRecznie = false;
      if (id === 'operator') dopasujTaryfyDoOperatora();
      if (id === 'lokalizacja') opiszLokalizacje($('lokalizacja').value);
      if (id === 'ogrzewanie') opiszOgrzewanie();
      przelicz();
    });
  });
  $('plikProfilu').addEventListener('change', async (zdarzenie) => {
    const plik = zdarzenie.target.files[0];
    if (!plik) return;
    try {
      plikProfilu = parsujTekst(await odczytajTekst(plik));
      pokazPodglad();
    } catch (e) {
      if (!(e instanceof BladImportu)) throw e;
      $blad(e.message);
    }
  });
  $('btnWczytaj').addEventListener('click', wczytajProfil);
  $('btnUsunProfil').addEventListener('click', usunProfilWlasny);
  // Przeliczamy przy kazdej zmianie wyboru kolumn, takze po nieudanej probie - inaczej
  // uzytkownik poprawia kolumne, a na ekranie dalej stoi stary komunikat o bledzie.
  ['kolData', 'kolWartosc', 'kolJednostka'].forEach((id) => {
    $(id).addEventListener('change', () => { if (plikProfilu) wczytajProfil(); });
  });
  $('btnCennik').addEventListener('click', () => { kosztRecznie = false; przelicz(); });
  // Przycisk wstawiajacy szacunek dotacji powstaje razem z trescia bloku, wiec
  // nasluchujemy na kontenerze, a nie na samym przycisku.
  $('pme2Info').addEventListener('click', (zdarzenie) => {
    if (zdarzenie.target.dataset.akcja !== 'wstawDotacje') return;
    const p = czytajPola();
    const d = dotacjaPME2({ pojemnoscKWh: p.magazynKWh, kosztMagazynu: czytajPozycje().magazyn });
    $('dotacja').value = d.kwota;
    przelicz();
  });
  $('btnPdf').addEventListener('click', () => window.print());
  $('btnHtml').addEventListener('click', pobierzHtml);
  $('btnLink').addEventListener('click', async () => {
    await navigator.clipboard.writeText(location.href);
    $('btnLink').textContent = 'Skopiowano';
    setTimeout(() => { $('btnLink').textContent = 'Skopiuj link z moimi liczbami'; }, 2000);
  });
  // Chart.js rysuje canvas dopiero po ulozeniu strony - przed drukiem wymuszamy odswiezenie.
  // Zwiniete <details> przegladarka pomija na wydruku w calosci, wiec na czas druku
  // otwieramy je wszystkie i przywracamy stan po. Inaczej ciekawostka o sprzecie z Chin
  // wraz z ostrzezeniem o pracy off-grid nie trafialaby do PDF-a.
  window.addEventListener('beforeprint', () => {
    document.querySelectorAll('details').forEach((d) => {
      d.dataset.stanPrzedDrukiem = d.open ? '1' : '0';
      d.open = true;
    });
    odswiezWykresy();
  });
  window.addEventListener('afterprint', () => {
    document.querySelectorAll('details').forEach((d) => {
      if (d.dataset.stanPrzedDrukiem !== undefined) d.open = d.dataset.stanPrzedDrukiem === '1';
    });
  });
  przelicz();
}

start();
