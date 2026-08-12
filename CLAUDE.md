# Kontekst pracy nad tym repozytorium

Kalkulator opłacalności PV i magazynu dla sąsiadów z jednego osiedla. Powstał 11.08.2026.
Pełny opis produktu i weryfikacji: `README.md`. Ten plik zawiera to, co trzeba wiedzieć
**zanim** zacznie się tu cokolwiek zmieniać.

## Skąd biorą się dane i czego NIE robić

`data/profiles.js` i `data/rce.js` są **generowane**, nie pisane ręcznie. Generator siedzi
w prywatnym repozytorium `zuzycie-pradu` (`analyze/kalkulator/build_profiles.py`
i `fetch_rce.py`) i czyta 54 MB surowych logów z falownika.

**Nie przenosić generatora tutaj.** Rozdzielenie repozytoriów nie jest kwestią porządku:
prywatne repo zawiera adres, numery PPE, faktury i dokumentację sporu sądowego, a to repo
jest publiczne. Granicę przekracza wyłącznie anonimowy artefakt - znormalizowane kształty
godzinowe bez żadnych danych identyfikujących.

Żeby przeliczyć profile od nowa: uruchomić generator w prywatnym repo i skopiować
wynik, konwertując JSON na moduł ES (`export default {...}`). Dane są wbudowane
w pliki źródłowe celowo - dzięki temu strona nie wykonuje żadnego zapytania sieciowego
i działa otwarta z dysku.

## Parametry skalibrowane - traktować ostrożnie

Dwie wartości w `src/engine.js` nie pochodzą z kart katalogowych, tylko zostały dobrane
tak, żeby model odtwarzał zmierzony rok: `poborWlasnyW` i `docelowyPoziomZSieci`.
Wynika z tego jedno: **roczna zgodność importu jest częściowo z definicji**. Niezależnym
sprawdzianem jest rozkład miesięczny i eksport, których tymi parametrami dopasować się
nie da. Nie chwalić się dokładnością roczną bez tego zastrzeżenia.

Pozostałe parametry mają oparcie w pomiarze albo w dokumentacji:
- `rezerwaAwaryjna: 0.20` - SoC w danych praktycznie nigdy nie schodzi niżej,
- `udzialUzytkowy: 0.93` - karta Sofar BTS (14,25 kWh użytkowych z 15,36),
- tryb dobierania z sieci - falownik domu odniesienia stoi na Time of Use na stałe.

## Wymagania, które łatwo złamać nieuważnie

1. **Zero zapytań sieciowych po załadowaniu.** Żadnego CDN, analityki, webfontów, `fetch`.
   Chart.js jest lokalną kopią. Parametry idą do `location.hash`, nigdy do query stringa -
   fragment nie trafia do serwera.
2. **Wysokość kontenera wykresu musi być ustalona w CSS** (`.cwrap { height: 300px }`).
   Chart.js z `maintainAspectRatio: false` dopasowuje canvas do rodzica; bez ustalonej
   wysokości canvas rozpycha rodzica w nieskończoność. Ten błąd już raz wszedł.
3. **Stawki tylko w `src/pricing.js`**, z datą obowiązywania i odsyłaczem do dokumentu.
   Aktualizacja na kolejny rok ma być jedną zmianą.
4. **Testy są bramką w CI.** Push do `main` nie opublikuje strony, jeśli `node --test`
   nie przejdzie. To jedyne zabezpieczenie przed cichym zepsuciem wyników.

## Weryfikacja po zmianach

```bash
node --test "test/*.test.mjs"
python -m http.server 8899
```

Potem realna przeglądarka (Playwright): asercje DOM na tym, że zmiana parametrów zmienia
wynik, że wykresy mają po 12 punktów i **nie rosną po wielu przeliczeniach**, że konsola
jest czysta i że zakładka sieci nie pokazuje żadnego obcego hosta. Zrzut ekranu całej
strony, nie tylko pierwszego ekranu.

## Sprawy otwarte

- **Nabór PME część 2** (Fundusz Modernizacyjny) planowany na III kwartał 2026 -
  gdy ruszy, wpisać realne kwoty do `src/economics.js`. To jedyna ścieżka dofinansowania
  magazynu dla kogoś, kto instaluje teraz.
- **Limit obwodu awaryjnego** w domu odniesienia (3,6 kW wobec 8 kW z karty falownika) -
  hipoteza: zabezpieczenie 16 A. Do potwierdzenia w rozdzielnicy.
- Nieprzetestowane klikaniem: eksport do PDF i do pliku HTML, widok na telefonie.
