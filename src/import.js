/**
 * Wczytywanie wlasnego profilu godzinowego z pliku CSV z licznika albo z aplikacji
 * sprzedawcy.
 *
 * Projektowane wokol zalozenia, ze parser sie pomyli. Dlatego:
 * - kolumny sa PROPONOWANE, a decyzje podejmuje uzytkownik w interfejsie,
 * - kazdy blad mowi, czego oczekiwalismy i co znalezlismy, zamiast "nieprawidlowy plik",
 * - wynik niesie liczby do porownania z faktura (suma, liczba godzin, ile uzupelniono),
 * - nic nie jest wysylane nigdzie - plik czyta FileReader w przegladarce.
 *
 * Silnik pracuje na siatce 8 760 godzin zaczynajacej sie 1 sierpnia (tak samo jak
 * data/profiles.js), wiec wczytany rok jest na te siatke przekladany po dacie i godzinie.
 * Dzieki temu plik moze zaczynac sie w dowolnym dniu roku.
 */

const GODZIN = 8760;
const START_MIESIAC = 8;         // 1 sierpnia
const DNI_MIESIECY = {
  1: 31, 2: 28, 3: 31, 4: 30, 5: 31, 6: 30, 7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31,
};
const MAX_DZIURA = 48;           // dluzsza przerwa to juz nie usterka pliku, tylko brak danych
const MIN_POKRYCIE = 0.95;

export class BladImportu extends Error {}

/** Indeks na siatce profilu (0 = 1 sierpnia, godzina 0). */
function indeks(miesiac, dzien, godzina) {
  let dni = 0;
  for (let m = START_MIESIAC; m < START_MIESIAC + 12; m++) {
    const mm = ((m - 1) % 12) + 1;
    if (mm === miesiac) return (dni + dzien - 1) * 24 + godzina;
    dni += DNI_MIESIECY[mm];
  }
  return -1;
}

/**
 * Separator to ten znak, ktory daje ten sam, wiekszy od jednego, podzial w kazdym wierszu.
 * Kolejnosc ma znaczenie: przecinek sprawdzamy ostatni, bo w polskich plikach czesciej
 * bywa przecinkiem dziesietnym niz separatorem kolumn.
 */
export function wykryjSeparator(tekst) {
  const linie = tekst.split(/\r?\n/).filter((l) => l.trim()).slice(0, 12);
  for (const kandydat of [';', '\t', '|', ',']) {
    const podzialy = linie.map((l) => l.split(kandydat).length);
    if (podzialy[0] > 1 && podzialy.every((p) => p === podzialy[0])) return kandydat;
  }
  return ';';
}

/** Tekst pliku -> { separator, naglowki, wiersze }. Gdy naglowka nie ma, nazywamy kolumny. */
export function parsujTekst(tekst) {
  const separator = wykryjSeparator(tekst);
  const linie = tekst.split(/\r?\n/).filter((l) => l.trim());
  if (!linie.length) throw new BladImportu('Plik jest pusty.');
  const komorki = linie.map((l) => l.split(separator).map((k) => k.trim().replace(/^"|"$/g, '')));
  const pierwszy = komorki[0];
  const bezNaglowka = pierwszy.some((k) => czytajDate(k) !== null);
  const naglowki = bezNaglowka ? pierwszy.map((_, i) => `kolumna ${i + 1}`) : pierwszy;
  const wiersze = bezNaglowka ? komorki : komorki.slice(1);
  return { separator, naglowki, wiersze };
}

/**
 * Data z komorki. Obslugiwane ksztalty: 2025-08-01 00:00 (takze z T, sekundami i strefa),
 * 01.08.2025 00:00, 01/08/2025 00:00 oraz sama data bez godziny.
 */
export function czytajDate(komorka) {
  const s = String(komorka ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (m) {
    return {
      rok: +m[1], miesiac: +m[2], dzien: +m[3], godzina: +(m[4] ?? 0), minuta: +(m[5] ?? 0),
    };
  }
  m = s.match(/^(\d{2})[./](\d{2})[./](\d{4})(?:[T ](\d{2}):(\d{2}))?/);
  if (m) {
    return {
      rok: +m[3], miesiac: +m[2], dzien: +m[1], godzina: +(m[4] ?? 0), minuta: +(m[5] ?? 0),
    };
  }
  return null;
}

/** Liczba z komorki: przecinek dziesietny, spacje w tysiacach, pusta wartosc jako dziura. */
export function czytajLiczbe(komorka) {
  const s = String(komorka ?? '').trim().replace(/[\s ]/g, '').replace(',', '.');
  if (s === '' || s === '-' || s.toLowerCase() === 'null' || s.toLowerCase() === 'brak') return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
}

const NAGLOWEK_DATY = /data|czas|time|date|okres|godzin|dzien|timestamp/i;
const NAGLOWEK_ENERGII = /kwh|zu[zż]yc|pob[oó]r|energia|wolumen|ilo[sś][cć]/i;
const NAGLOWEK_MOCY = /\bkw\b|moc/i;

/**
 * Propozycja kolumn - z naglowka, a gdy go nie ma, z zawartosci. Zwraca tez powod,
 * bo uzytkownik ma widziec, na jakiej podstawie zgadujemy, i moc to zmienic.
 */
export function proponujKolumny(naglowki, wiersze) {
  const probka = wiersze.slice(0, 20);
  const wygladaNaDate = (i) => probka.filter((w) => czytajDate(w[i]) !== null).length
    > probka.length / 2;
  const wygladaNaLiczbe = (i) => probka.filter((w) => {
    const v = czytajLiczbe(w[i]);
    return v !== null && Number.isFinite(v);
  }).length > probka.length / 2;

  let data = naglowki.findIndex((n) => NAGLOWEK_DATY.test(n));
  if (data < 0 || !wygladaNaDate(data)) data = naglowki.findIndex((_, i) => wygladaNaDate(i));

  let wartosc = naglowki.findIndex((n, i) => NAGLOWEK_ENERGII.test(n) && i !== data);
  if (wartosc < 0) wartosc = naglowki.findIndex((n, i) => NAGLOWEK_MOCY.test(n) && i !== data);
  if (wartosc < 0 || !wygladaNaLiczbe(wartosc)) {
    wartosc = naglowki.findIndex((_, i) => i !== data && wygladaNaLiczbe(i));
  }

  const naglowekWartosci = naglowki[wartosc] ?? '';
  const jednostka = (NAGLOWEK_MOCY.test(naglowekWartosci) && !/kwh/i.test(naglowekWartosci))
    ? 'kW' : 'kWh';

  const powod = data >= 0 && wartosc >= 0
    ? `Za datę wzięliśmy kolumnę „${naglowki[data]}", a za wartość „${naglowekWartosci}"`
      + ` (${jednostka === 'kW' ? 'średnia moc' : 'energia w interwale'}).`
      + ' Jeśli to nie te kolumny, wskaż inne.'
    : 'Nie rozpoznaliśmy kolumn - wskaż je sam.';
  return { data, wartosc, jednostka, powod };
}

/**
 * Wiersze -> profil na siatce 8 760 godzin.
 *
 * @param {object} plik wynik parsujTekst
 * @param {object} opcje { data, wartosc, jednostka, dopuscNiepelnyRok }
 */
export function zbudujProfil(plik, opcje) {
  const {
    data: kolData, wartosc: kolWartosc, jednostka = 'kWh', dopuscNiepelnyRok = false,
  } = opcje;
  if (!(kolData >= 0) || !(kolWartosc >= 0)) {
    throw new BladImportu('Nie wskazano kolumny z datą albo z wartością.');
  }

  const sumy = new Float64Array(GODZIN);
  const ile = new Int32Array(GODZIN);
  const ostrzezenia = [];
  const odstepy = [];
  let pierwsza = null;
  let poprzednia = null;
  let pominietych = 0;

  for (const [nr, wiersz] of plik.wiersze.entries()) {
    const chwila = czytajDate(wiersz[kolData]);
    if (!chwila) {
      throw new BladImportu(`W wierszu ${nr + 1}, w kolumnie z datą, spodziewaliśmy się daty,`
        + ` a jest „${wiersz[kolData] ?? ''}".`);
    }
    const liczba = czytajLiczbe(wiersz[kolWartosc]);
    if (Number.isNaN(liczba)) {
      throw new BladImportu(`W wierszu ${nr + 1}, w kolumnie z wartością, spodziewaliśmy się`
        + ` liczby, a jest „${wiersz[kolWartosc]}".`);
    }
    if (!pierwsza) pierwsza = chwila;
    if (poprzednia) {
      const roznica = (chwila.godzina * 60 + chwila.minuta)
        - (poprzednia.godzina * 60 + poprzednia.minuta);
      if (roznica > 0) odstepy.push(roznica);
    }
    poprzednia = chwila;

    if (chwila.miesiac === 2 && chwila.dzien === 29) { pominietych += 1; continue; }
    if (liczba === null) continue;
    const i = indeks(chwila.miesiac, chwila.dzien, chwila.godzina);
    if (i < 0 || i >= GODZIN) { pominietych += 1; continue; }
    sumy[i] += liczba;
    ile[i] += 1;
  }

  odstepy.sort((a, b) => a - b);
  const interwalMinut = odstepy.length ? odstepy[Math.floor(odstepy.length / 2)] : 60;

  // Energia w interwale sumuje sie do godziny, srednia moc w kW usrednia sie i daje kWh.
  const godziny = new Float64Array(GODZIN);
  for (let i = 0; i < GODZIN; i++) {
    if (!ile[i]) continue;
    godziny[i] = jednostka === 'kW' ? sumy[i] / ile[i] : sumy[i];
  }

  const godzinWczytanych = ile.reduce((a, b) => a + (b ? 1 : 0), 0);
  if (!dopuscNiepelnyRok && godzinWczytanych < GODZIN * MIN_POKRYCIE) {
    throw new BladImportu(`Plik ma dane dla ${godzinWczytanych} godzin, a do policzenia`
      + ' autokonsumpcji potrzebny jest pełny rok, czyli 8760 godzin.'
      + ' Wyeksportuj z licznika dwanaście miesięcy pod rząd.');
  }

  let godzinUzupelnionych = 0;
  if (!dopuscNiepelnyRok) {
    let i = 0;
    while (i < GODZIN) {
      if (ile[i]) { i += 1; continue; }
      let koniec = i;
      while (koniec < GODZIN && !ile[koniec]) koniec += 1;
      const dlugosc = koniec - i;
      if (dlugosc > MAX_DZIURA) {
        throw new BladImportu(`W pliku brakuje ${dlugosc} godzin pod rząd. Tak dużej dziury`
          + ' nie da się uzupełnić bez zmyślania - wyeksportuj dane jeszcze raz.');
      }
      const przed = i > 0 ? godziny[i - 1] : null;
      const po = koniec < GODZIN ? godziny[koniec] : null;
      const wypelniacz = (przed !== null && po !== null) ? (przed + po) / 2 : (przed ?? po ?? 0);
      for (let k = i; k < koniec; k += 1) godziny[k] = wypelniacz;
      godzinUzupelnionych += dlugosc;
      i = koniec;
    }
  }

  const sumaKWh = godziny.reduce((a, b) => a + b, 0);
  if (sumaKWh <= 0) {
    throw new BladImportu('Suma wczytanych wartości wyszła zerowa - to chyba nie ta kolumna.');
  }
  const perMWh = Float64Array.from(godziny, (v) => (v * 1000) / sumaKWh);

  if (godzinUzupelnionych) {
    ostrzezenia.push(`${godzinUzupelnionych} godzin bez danych uzupełniono średnią z sąsiednich.`);
  }
  if (pominietych) {
    ostrzezenia.push(`${pominietych} wierszy pominięto (29 lutego albo data spoza roku).`);
  }
  if (interwalMinut !== 60) {
    ostrzezenia.push(`Dane co ${interwalMinut} minut zsumowano do godzin.`);
  }

  const dwie = (n) => String(n).padStart(2, '0');
  return {
    godziny,
    perMWh,
    sumaKWh,
    godzinWczytanych,
    godzinUzupelnionych,
    interwalMinut,
    jednostka,
    startISO: pierwsza ? `${pierwsza.rok}-${dwie(pierwsza.miesiac)}-${dwie(pierwsza.dzien)}` : null,
    ostrzezenia,
  };
}
