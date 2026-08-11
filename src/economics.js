/**
 * Ekonomia inwestycji: koszt, dotacje, ulga podatkowa, czas zwrotu.
 *
 * Liczby odniesienia pochodza z realnej instalacji w Musulach (2025) i z szesciu ofert
 * zebranych wtedy przez wlasciciela. To odroznia ten kalkulator od generycznych:
 * zamiast sredniej rynkowej podaje ceny, ktore naprawde padly w tej okolicy.
 */

/** Ceny podzespolow z oferty Prosun Energy (2025), wybranej i zrealizowanej. */
export const CENNIK_ODNIESIENIA = {
  zlZaKWpZPanelami: 1720,   // panele + montaz + osprzet, bez falownika i magazynu
  falownikHybrydowy: 8999,  // Sofar HYD 8 KTL-X G3
  magazynBaza: 1599,        // jednostka bazowa Sofar BTS
  magazynZaKWh: 1400,       // modul 5 kWh za 6 999 zl
  zasilanieAwaryjne: 2900,  // EPS - u innego dostawcy z tych ofert 3 996 zl
};

/**
 * Rozpietosc cen z szesciu ofert zebranych w 2025 na dom tej wielkosci
 * (konfiguracje od 4,68 do 16 kWh magazynu). Sluzy jako pasek odniesienia:
 * sasiad od razu widzi, czy oferta, ktora dostal, miesci sie w tym, co tu krazylo.
 */
export const WIDELKI_OFERT_2025 = { min: 43446, max: 68273, mediana: 55208 };

/**
 * Stan programow wsparcia na sierpien 2026. DO ZWERYFIKOWANIA przed publikacja -
 * to obszar, ktory zmienia sie w trakcie roku, a od niego zalezy glowny wynik.
 */
export const DOTACJE = {
  mojPrad6: {
    nazwa: 'Mój Prąd 6.0',
    aktywny: false,
    info: 'Nabór zakończony 12.09.2025 - wyczerpała się pula środków. '
      + 'Właściciel domu odniesienia zdążył: dostał 17 000 zł na PV i 6 000 zł na magazyn.',
  },
  magazynyKPO: {
    nazwa: 'Dofinansowanie przydomowych magazynów energii (KPO)',
    aktywny: true,
    info: 'Nabór ruszył 30.03.2026 (mojprad.gov.pl). Dotyczy MAGAZYNU, nie samej fotowoltaiki. '
      + 'Kwoty i warunki trzeba sprawdzić przed złożeniem wniosku - pula bywa wyczerpywana.',
    domyslnaKwota: 0,
  },
};

/**
 * Ulga termomodernizacyjna (art. 26h ustawy o PIT).
 *
 * To ODLICZENIE OD DOCHODU, a nie zwrot wydatku - przy zerowym podatku jest warta zero.
 * Warunek: budynek musi juz istniec i byc oddany do uzytku (nie w budowie); progu wieku
 * budynku nie ma. Limit 53 000 zl na podatnika; malzonkowie wspolwlasciciele maja po
 * wlasnym limicie. Z odliczenia wypada czesc pokryta dotacja - nie mozna rozliczyc
 * tej samej zlotowki dwa razy.
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

export function kosztInstalacji({ kWp, magazynKWh, zasilanieAwaryjne = false, cennik = CENNIK_ODNIESIENIA }) {
  let koszt = kWp * cennik.zlZaKWpZPanelami;
  if (kWp > 0) koszt += cennik.falownikHybrydowy;
  if (magazynKWh > 0) koszt += cennik.magazynBaza + magazynKWh * cennik.magazynZaKWh;
  if (zasilanieAwaryjne) koszt += cennik.zasilanieAwaryjne;
  return Math.round(koszt);
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
