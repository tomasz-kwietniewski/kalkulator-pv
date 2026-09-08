/**
 * Wybor profilu produkcji: zmierzony dom odniesienia albo jedna z lokalizacji PVGIS,
 * plus przeliczenie nachylenia dachu i orientacji na mnoznik rocznego uzysku.
 *
 * Zasada, ktora tu obowiazuje: **profil zmierzony zostaje domyslny i jest oznaczony
 * jako zmierzony**. Przewaga tego kalkulatora bierze sie z tego, ze autokonsumpcje liczy
 * na realnym roku pracy, a nie pyta o nia uzytkownika. Lokalizacje z PVGIS to model
 * i tak sa opisane.
 */
import profile from '../data/profiles.js';
import { LOKALIZACJE, UZYSK_NACHYLENIE, ZRODLO, godziny } from '../data/pv.js';

export const NACHYLENIE_ODNIESIENIA = ZRODLO.nachylenie;   // 35 stopni, azymut 0

/** Azymuty PVGIS odpowiadajace orientacjom z formularza (0 = poludnie). */
const AZYMUTY = {
  poludnie: [0],
  poludnieWschodZachod: [-45, 45],
  wschodZachod: [-90, 90],
};

export const PROFILE_PV = [
  {
    id: 'odniesienia',
    nazwa: 'Dom odniesienia (Musuły)',
    zrodlo: 'pomiar',
    opis: 'Zmierzony rok pracy instalacji 9 kWp - wraz z ksztaltem dachu, zacienieniem'
      + ' i przerwami falownika. Najmocniejszy wariant, ale opisuje jeden konkretny dom.',
    uzyskRoczny: Math.round(profile.pv_per_kwp.reduce((a, b) => a + b, 0)),
  },
  ...LOKALIZACJE.map((l) => ({
    id: l.id,
    nazwa: l.nazwa,
    zrodlo: 'PVGIS',
    opis: `Rok medianowy ${l.rokMedianowy} z ${l.latPomiarowych} lat bazy SARAH3,`
      + ` dach ${NACHYLENIE_ODNIESIENIA} stopni na poludnie.`,
    uzyskRoczny: l.uzyskRoczny,
  })),
];

/** Godzinowa produkcja na 1 kWp dla wybranego profilu, 8760 wartosci od 1 sierpnia. */
export function profilPv(id) {
  return id === 'odniesienia' ? profile.pv_per_kwp : godziny(id);
}

const uzysk = (nachylenie, orientacja) => {
  const wiersz = UZYSK_NACHYLENIE[nachylenie] ?? UZYSK_NACHYLENIE[NACHYLENIE_ODNIESIENIA];
  const azymuty = AZYMUTY[orientacja] ?? AZYMUTY.poludnie;
  return azymuty.reduce((suma, a) => suma + wiersz[a], 0) / azymuty.length;
};

/**
 * Mnoznik za nachylenie dachu, liczony wzgledem 35 stopni - czyli tego, dla ktorego
 * pobralismy profile godzinowe. Orientacja siedzi w ORIENTACJE w silniku, wiec tutaj
 * dzielimy przez uzysk przy TEJ SAMEJ orientacji: inaczej policzylibysmy ja dwa razy.
 */
export function mnoznikNachylenia(nachylenie, orientacja) {
  return uzysk(nachylenie, orientacja) / uzysk(NACHYLENIE_ODNIESIENIA, orientacja);
}

export const NACHYLENIA = Object.keys(UZYSK_NACHYLENIE).map(Number).sort((a, b) => a - b);
export { ZRODLO };
