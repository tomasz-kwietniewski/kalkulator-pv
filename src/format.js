/** Formatowanie liczb do wyswietlenia. Jedno miejsce, zeby ui.js i charts.js nie rozjechaly sie stylem. */

export const zl = (v) => Math.round(v).toLocaleString('pl-PL') + ' zł';
export const kwh = (v) => Math.round(v).toLocaleString('pl-PL') + ' kWh';
export const proc = (v, miejsc = 0) => v.toFixed(miejsc).replace('.', ',') + '%';

/**
 * Liczba dziesietna po polsku - przecinek, bez wiszacego ",0" przy calkowitych.
 * Zaokragla, bo wartosci z dzielenia potrafia przyjsc jako 2.8569600000000004 i wchodza
 * na strone w calej okazalosci. Domyslnie dwa miejsca; `miejsc` na zawolanie.
 */
export const liczba = (v, miejsc = 2) => {
  const zaokraglona = Number(Number(v).toFixed(miejsc));
  return Number.isInteger(zaokraglona) ? String(zaokraglona) : String(zaokraglona).replace('.', ',');
};

/** Lata z przecinkiem dziesietnym - "7,4 roku" czyta sie po polsku, "7.4" nie. */
export const lata = (v) => v.toFixed(1).replace('.', ',');

/**
 * Odmiana rzeczownika przez liczebnik: [pojedynczy, mnogi, dopelniacz].
 * Koncowki 2-4 biora forme mnoga, ale nastolatki (12-14) juz nie: "22 lata", ale "12 lat".
 */
export function odmien(v, [jeden, malo, duzo]) {
  const calosc = Math.abs(Math.round(v));
  if (calosc === 1) return jeden;
  const ostatnia = calosc % 10;
  const dwie = calosc % 100;
  return (ostatnia >= 2 && ostatnia <= 4 && (dwie < 12 || dwie > 14)) ? malo : duzo;
}

/**
 * Odmiana slowa "rok". Kalkulator pokazuje czas zwrotu w kilkunastu miejscach
 * i "7,4 lat" razi w kazdym z nich.
 */
export function odmianaLat(v) {
  const calosc = Math.floor(v);
  if (Math.abs(v - calosc) > 1e-9) return 'roku';   // ulamek: "7,4 roku"
  return odmien(calosc, ['rok', 'lata', 'lat']);
}

/** "1 punkt procentowy", "22 punkty procentowe", "25 punktów procentowych". */
export const punktyProc = (v) => `${Math.round(v)} `
  + odmien(v, ['punkt procentowy', 'punkty procentowe', 'punktów procentowych']);

/** "7,4 roku", "8 lat", "2 lata" - bez wiszacego ",0" przy okraglych wartosciach. */
export function zLatami(v) {
  const zaokraglone = Math.round(v * 10) / 10;
  const tekst = Number.isInteger(zaokraglone) ? String(zaokraglone) : lata(zaokraglone);
  return `${tekst} ${odmianaLat(zaokraglone)}`;
}
