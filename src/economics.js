/**
 * Ekonomia inwestycji: koszt, dotacje, ulga podatkowa, czas zwrotu.
 *
 * Liczby odniesienia pochodza z realnej instalacji w Musulach (2025) i z szesciu ofert
 * zebranych wtedy przez wlasciciela. To odroznia ten kalkulator od generycznych:
 * zamiast sredniej rynkowej podaje ceny, ktore naprawde padly w tej okolicy.
 */

/** Data ostatniego sprawdzenia cen podzespolow. Trzymana przy danych, jak przy dotacjach. */
export const CENNIK_SPRAWDZONY = '2026-08-14';

/**
 * Ceny odniesienia dla instalacji POD KLUCZ, stan na sierpien 2026.
 *
 * Kazda pozycja to cena sprzetu ze sklepu producenta plus narzut na montaz, konstrukcje,
 * zabezpieczenia, uruchomienie i zgloszenie do operatora. Narzutu nie da sie potwierdzic
 * zadna oferta, bo oferty sa pod klucz i nikt robocizny nie wydziela - dlatego jest
 * oszacowany tak, zeby calosc dla 9 kWp z magazynem 15 kWh wypadla w okolicy 41 tys.,
 * czyli tam, gdzie schodza sie ceny sklepowe i doswiadczenie wlasciciela domu odniesienia.
 *
 * DLACZEGO NIE CENY Z OFERT Z 2025. Poprzednia wersja brala rozbicie z arkusza
 * porownawczego (falownik 8 999 zl, magazyn 10 kWh za 15 599 zl). Przez rok sprzet
 * wyraznie stanial: ten sam falownik Sofar HYD8KTL kosztuje dzis 5 799 zl, a magazyn
 * 15,36 kWh zlozony z modulow 17 196 zl. Trzymanie starych cen zawyzaloby koszt
 * i wydluzalo czas zwrotu. Widelki szesciu ofert z 2025 zostaja na pasku jako
 * odniesienie historyczne - i to jest w porzadku, ze dzisiejsza wycena wypada ponizej.
 */
export const CENNIK_ODNIESIENIA = {
  // Panele + konstrukcja + montaz. Sprzet ok. 800 zl/kWp (panel 500 W ok. 200 zl,
  // konstrukcja mniej wiecej drugie tyle), reszta to robocizna na dachu i osprzet.
  zlZaKWpZPanelami: 1250,
  // Sofar HYD8KTL: 5 799 zl brutto w sklepie producenta, reszta to montaz i konfiguracja.
  falownikHybrydowy: 7500,
  // Jednostka sterujaca BTS 5K-BDU: 1 299 zl brutto.
  magazynBaza: 2000,
  // Modul BTS 5K 5,12 kWh: 5 299 zl brutto, czyli 1 035 zl/kWh. Cena za kWh spada
  // z pojemnoscia, bo jednostka bazowa jest stala - stad rozbicie na baze i modul.
  magazynZaKWh: 1100,
  // Zasilanie awaryjne wycenialo sie roznie: 980 zl za reczny przelacznik, 2 900 zl
  // za puszke EPS w zrealizowanej ofercie, 3 996 zl u innego dostawcy. Sama rozdzielnica
  // AC z polki (Sofar HydBOX 32A) to 4 299 zl brutto, a tansza polska alternatywa
  // (Encor SwitchBox) kosztuje mniej. Domyslnie 4 000 zl.
  zasilanieAwaryjne: 4000,
};

/**
 * Poprzedni cennik, z ofert zebranych na osiedlu w 2025. Nieuzywany w obliczeniach -
 * zostaje, zeby dalo sie odtworzyc, skad brala sie wczesniejsza wersja wynikow,
 * i zeby bylo widac skale zmiany cen w ciagu roku.
 */
export const CENNIK_2025 = {
  zlZaKWpZPanelami: 1720,
  falownikHybrydowy: 8999,
  magazynBaza: 1599,
  magazynZaKWh: 1400,
  zasilanieAwaryjne: 2900,
};

/**
 * Rozpietosc, ktora zasilanie awaryjne osiagalo w zebranych ofertach.
 * Dolny koniec to prostszy przelacznik, gorny - pelna rozdzielnica AC.
 */
export const WIDELKI_EPS = { min: 2900, max: 5000 };

/**
 * Rozpietosc cen z szesciu ofert zebranych w 2025 na dom tej wielkosci
 * (konfiguracje od 4,68 do 16 kWh magazynu). Sluzy jako pasek odniesienia:
 * sasiad od razu widzi, czy oferta, ktora dostal, miesci sie w tym, co tu krazylo.
 */
export const WIDELKI_OFERT_2025 = { min: 43446, max: 68273, mediana: 55208 };

/**
 * Stan programow wsparcia. ZWERYFIKOWANY 11.08.2026 na przydomowemagazyny.gov.pl,
 * mojprad.gov.pl i gov.pl. Obszar zmienia sie w trakcie roku - date weryfikacji
 * trzymamy przy danych, zeby bylo widac, jak swieze sa.
 */
export const DOTACJE_SPRAWDZONE = '2026-08-11';

export const DOTACJE = {
  mojPrad6: {
    nazwa: 'Mój Prąd 6.0',
    aktywny: false,
    info: 'Nabór zakończony 12.09.2025 - wyczerpała się pula środków. Dawał do 7 000 zł '
      + 'na fotowoltaikę i do 16 000 zł na magazyn energii, czyli maksymalnie 23 000 zł, '
      + 'przy czym dotacja na magazyn liczyła się jako połowa jego kosztu. To dlatego '
      + 'kosztorysy z tamtego okresu przypisywały magazynowi dużą część kwoty - inaczej '
      + 'nie dało się sięgnąć po pełne 16 000 zł. Właściciel domu odniesienia zdążył '
      + 'i z tego dofinansowania skorzystał.',
  },
  pme1: {
    nazwa: 'Przydomowe Magazyny Energii, część 1 (KPO)',
    aktywny: false,
    info: 'Nabór trwał od 30.03 do 19.06.2026 i jest zamknięty. Był to zwrot kosztów '
      + 'instalacji JUŻ WYKONANYCH (wydatki od 1.08.2024 do 31.10.2025, przyłączenie '
      + 'do 31.10.2025), do 28 000 zł i do 50% kosztów. Dla decyzji podejmowanej dziś '
      + 'nie ma znaczenia.',
  },
  pme2: {
    nazwa: 'Przydomowe Magazyny Energii, część 2 (Fundusz Modernizacyjny)',
    aktywny: false,
    planowany: true,
    info: 'Nabór planowany na III kwartał 2026, budżet do 1 mld zł. Warunki znane '
      + 'z zapowiedzi: przedsięwzięcie rozpoczęte nie wcześniej niż 1.11.2025, '
      + 'minimalna pojemność magazynu 10 kWh. Wnioski przez Generator (GWD). '
      + 'To jedyna realna ścieżka dofinansowania magazynu dla kogoś, kto instaluje teraz - '
      + 'ale dopóki nabór nie ruszy, w kalkulatorze zostawiamy dotację na zero.',
    minimalnaPojemnoscKWh: 10,
  },
};

/**
 * Ulga termomodernizacyjna (art. 26h ustawy o PIT). ZWERYFIKOWANA 11.08.2026.
 *
 * To ODLICZENIE OD DOCHODU, a nie zwrot wydatku - przy zerowym podatku jest warta zero.
 *
 * Warunki potwierdzone:
 *  - wlasciciel lub wspolwlasciciel budynku mieszkalnego JEDNORODZINNEGO,
 *  - budynek musi byc oddany do uzytku; ulga NIE obejmuje budynku w budowie.
 *    Progu wieku budynku nie ma - liczy sie tylko to, czy jest oddany,
 *  - limit 53 000 zl na podatnika, malzonkowie wspolwlasciciele lacznie do 106 000 zl,
 *  - przedsiewziecie ukonczone w ciagu 3 lat od konca roku pierwszego wydatku,
 *  - wydatki udokumentowane fakturami VAT,
 *  - odliczyc mozna WYLACZNIE czesc pokryta z wlasnych srodkow - kwota sfinansowana
 *    dotacja z odliczenia wypada.
 *
 * WAZNE I KORZYSTNE: od poczatku 2025 katalog wydatkow obejmuje takze MAGAZYNY ENERGII
 * i magazyny ciepla, nie tylko sama fotowoltaike. Dla decyzji o magazynie ma to
 * znaczenie tym wieksze, ze dotacji na magazyn obecnie nie ma.
 */
export const ULGA = {
  limitNaPodatnika: 53000,
  stawki: { skala12: 0.12, skala32: 0.32, liniowy: 0.19, ryczalt: 0.12, brak: 0 },
};

export function ulgaTermomodernizacyjna({ koszt, dotacja = 0, stawka = 'skala12', podatnicy = 1 }) {
  const procent = ULGA.stawki[stawka] ?? 0;
  if (!procent) return 0;
  const podstawa = Math.max(0, koszt - dotacja);
  return Math.min(podstawa, ULGA.limitNaPodatnika * podatnicy) * procent;
}

/* --- koszt rozbity na pozycje, tak jak wyglada oferta --- */

/**
 * Kolejnosc pozycji jest ta sama wszedzie: w formularzu, w rozdzielaniu kwoty
 * i w kaskadzie nakladu.
 */
export const POZYCJE_KOSZTU = ['panele', 'falownik', 'magazyn', 'eps'];

export const ETYKIETY_POZYCJI = {
  panele: 'Panele z montażem',
  falownik: 'Falownik',
  magazyn: 'Magazyn energii',
  eps: 'Zasilanie awaryjne',
};

/**
 * Rozbicie na pozycje nie jest kosmetyka. Bez osobnej ceny magazynu nie da sie
 * odpowiedziec na pytanie, po ktore ludzie tu przychodza: czy sam magazyn sie zwraca.
 * Przy jednej zbiorczej kwocie koszt magazynu trzeba by zgadywac z cennika, czyli
 * odpowiadac cennikiem zamiast oferta, ktora czytelnik ma przed soba.
 */
export function pozycjeZCennika({
  kWp, magazynKWh, zasilanieAwaryjne = false, cennik = CENNIK_ODNIESIENIA,
}) {
  return {
    panele: Math.round(kWp * cennik.zlZaKWpZPanelami),
    falownik: kWp > 0 ? cennik.falownikHybrydowy : 0,
    magazyn: magazynKWh > 0 ? Math.round(cennik.magazynBaza + magazynKWh * cennik.magazynZaKWh) : 0,
    eps: zasilanieAwaryjne ? cennik.zasilanieAwaryjne : 0,
  };
}

export function sumaPozycji(pozycje) {
  return POZYCJE_KOSZTU.reduce((s, k) => s + (pozycje[k] || 0), 0);
}

/**
 * Rozdziela kwote laczna z oferty na pozycje, w proporcjach tego, co w polach juz stoi.
 *
 * Dla ofert podajacych jedna kwote za calosc - a takich jest sporo. Reszta z zaokraglen
 * trafia do najwiekszej pozycji, dzieki czemu suma pol zawsze zgadza sie z kwota laczna
 * co do zlotowki. Bez tego uzytkownik widzialby, ze pozycje nie sumuja sie do tego,
 * co sam wpisal, i slusznie przestalby ufac reszcie wynikow.
 */
export function rozdzielKwote(razem, pozycje) {
  const cel = Math.max(0, Math.round(razem));
  const suma = sumaPozycji(pozycje);
  // Nie ma z czego robic proporcji - cala kwota idzie w panele, bo to jedyna pozycja
  // obecna w kazdej instalacji.
  if (suma <= 0) return { panele: cel, falownik: 0, magazyn: 0, eps: 0 };

  const wynik = {};
  POZYCJE_KOSZTU.forEach((k) => { wynik[k] = Math.round((cel * (pozycje[k] || 0)) / suma); });
  const roznica = cel - sumaPozycji(wynik);
  if (roznica !== 0) {
    const najwieksza = POZYCJE_KOSZTU.reduce((a, b) => (wynik[b] > wynik[a] ? b : a));
    wynik[najwieksza] += roznica;
  }
  return wynik;
}

export function kosztInstalacji({
  kWp, magazynKWh, zasilanieAwaryjne = false, cennik = CENNIK_ODNIESIENIA,
}) {
  return sumaPozycji(pozycjeZCennika({ kWp, magazynKWh, zasilanieAwaryjne, cennik }));
}

/**
 * Droga od kwoty z oferty do tego, co realnie zostaje w kieszeni.
 *
 * Kolejnosc ma znaczenie podatkowe: ulge liczymy od kwoty JUZ pomniejszonej o dotacje,
 * bo odliczyc mozna wylacznie czesc pokryta z wlasnych srodkow.
 *
 * Wynik celowo trzyma wszystkie szczeble, a nie samo saldo. Roznica miedzy "kosztem"
 * a "nakladem" to najczestsze zrodlo nieporozumien przy porownywaniu ofert: ulga wraca
 * dopiero przy rozliczeniu PIT, wiec na starcie i tak trzeba miec cala kwote.
 */
export function kaskadaNakladu({ koszt, dotacja = 0, stawka = 'skala12', podatnicy = 1 }) {
  const dotacjaRealna = Math.min(Math.max(0, dotacja), koszt);
  const poDotacji = koszt - dotacjaRealna;
  const ulga = ulgaTermomodernizacyjna({ koszt, dotacja: dotacjaRealna, stawka, podatnicy });
  return {
    koszt,
    dotacja: dotacjaRealna,
    poDotacji,
    ulga,
    naklad: Math.max(0, poDotacji - ulga),
  };
}

/**
 * Skumulowany przeplyw pieniedzy i czas zwrotu.
 *
 * Uwzglednia wzrost cen energii (oszczednosc rosnie) i degradacje paneli (produkcja
 * maleje). Nie uwzglednia kosztu pieniadza w czasie - dla decyzji domowej prosty czas
 * zwrotu jest czytelniejszy, a inflacja cen energii i tak dziala na korzysc inwestycji.
 */
export function zwrot({ naklad, oszczednoscRoczna, lat = 20, wzrostCen = 0.04, degradacja = 0.005 }) {
  const przeplyw = [-naklad];
  let suma = -naklad;
  let rokZwrotu = null;
  for (let rok = 1; rok <= lat; rok++) {
    const o = oszczednoscRoczna * Math.pow(1 + wzrostCen, rok - 1) * Math.pow(1 - degradacja, rok - 1);
    suma += o;
    przeplyw.push(suma);
    if (rokZwrotu === null && suma >= 0) {
      const poprzednia = suma - o;
      rokZwrotu = rok - 1 + (-poprzednia / o);
    }
  }
  return { przeplyw, rokZwrotu, saldoKoncowe: suma };
}

/**
 * Dwa czasy zwrotu obok siebie - bo to dwie rozne odpowiedzi na dwa rozne pytania.
 *
 * "Od pelnej kwoty" mowi, kiedy inwestycja odrobi kazda zlotowke wylozona na starcie.
 * "Po odzyskach" mowi, ile ta inwestycja kosztuje ostatecznie, po dotacji i uldze.
 * Pokazujemy oba, bo pokazanie samego drugiego zawyza obraz: dotacja i ulga wracaja
 * pozniej, a przelew do instalatora idzie w calosci od razu.
 */
export function zwrotDwutorowo({
  koszt, naklad, oszczednoscRoczna, lat = 20, wzrostCen, degradacja,
}) {
  const wspolne = { oszczednoscRoczna, lat };
  if (wzrostCen !== undefined) wspolne.wzrostCen = wzrostCen;
  if (degradacja !== undefined) wspolne.degradacja = degradacja;
  return {
    odPelnejKwoty: zwrot({ naklad: koszt, ...wspolne }),
    poOdzyskach: zwrot({ naklad, ...wspolne }),
  };
}
