/**
 * Wybor ksztaltu zuzycia domu: sposob ogrzewania zmienia wynik mocniej niz cokolwiek
 * innego w formularzu, bo decyduje, ile pradu idzie zima i o ktorej godzinie.
 *
 * Wszystkie ksztalty pochodza ze zmierzonego roku domu odniesienia, rozlozonego na
 * skladnik bytowy i grzewczy (tools/dekompozycja.mjs). Nie ma tu profili syntetycznych:
 * zmieniamy proporcje miedzy skladnikami i sposob wytwarzania ciepla, a nie przebiegi.
 */
import profile from '../data/profiles.js';
import { ARCHETYPY, METODA, profilDomu } from '../data/domy.js';

/**
 * Dom z pompami ciepla to sam zmierzony profil, wiec bierzemy go wprost z pomiaru,
 * a nie z rozpakowanej kopii - po co tracic cokolwiek na zaokragleniach.
 */
const ZMIERZONY = 'pompaCiepla';

export const DOMY = ARCHETYPY.map((a) => ({
  ...a,
  zrodlo: a.id === ZMIERZONY ? 'pomiar' : 'rekonstrukcja',
}));

export function profilZuzycia(id) {
  return id === ZMIERZONY ? profile.house_per_MWh : profilDomu(id);
}

/** Zdanie o pochodzeniu ksztaltu - ma stac przy polu, a nie w stopce. */
export function opisDomu(id) {
  const dom = DOMY.find((d) => d.id === id) ?? DOMY[0];
  const udzial = Math.round(dom.udzialGrzania * 100);
  if (dom.zrodlo === 'pomiar') {
    return `${dom.opis} Ogrzewanie to ${udzial}% rocznego zużycia prądu.`;
  }
  return `${dom.opis} Rekonstrukcja ze zmierzonego roku: ogrzewanie to ${udzial}%`
    + ` rocznego zużycia. Próg grzewczy ${String(METODA.progGrzewczy).replace('.', ',')}°C`
    + ` wyszedł z danych, a nie z założenia.`;
}

export { METODA };
