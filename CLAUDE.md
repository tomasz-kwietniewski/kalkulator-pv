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

## Strefy taryfowe liczy `src/zones.js` z tabeli w taryfie OSD

Maski stref powstają z kalendarza, a nie z danych: `maskiProfilu` buduje `Uint8Array`,
który silnik i model cenowy dostają w parametrze (`maskaStrefy`). Nie wiedzą już nic
o profilu ani o nazwie grupy taryfowej - dzięki temu da się dołożyć operatora i wgrać
własne dane z innego roku.

**Źródłem prawdy jest tabela stref z taryfy operatora**, cytowana w `STREFY` razem
z datą obowiązywania. Dla PGE Dystrybucja to pkt 2.2.8 taryfy na 2026 (tekst jednolity
od 1.02.2026), grupy C12b/G12 oraz C12w/G12w/G12e:

| Sezon | Strefa nocna (tania) |
|---|---|
| Lato: 1 kwietnia - 30 września | 15-17 i 22-6 |
| Zima: 1 października - 31 marca | 13-15 i 22-6 |
| G12w dodatkowo: soboty, niedziele i dni ustawowo wolne | cała doba |

**Sezon idzie z kalendarza, nie ze zmiany czasu.** To była pomyłka generatora
w prywatnym `zuzycie-pradu` (`process_sofar.py`, `is_summer_dst`) i przez jeden dzień
także tego repozytorium: 8.09.2026 poprawiliśmy dane pod zmianę czasu, zanim taryfa
pokazała, że sezon wyznaczają daty. Skutek różnicy: 112 godzin w G12 i 80 w G12w między
1.10.2025 a 31.03.2026, rachunek roczny o ok. 6 zł, udział taniej strefy 76,1% -> 75,9%.

**Generator jest już poprawiony** (8.09.2026, ta sama sesja): funkcja nazywa się teraz
`is_sezon_letni` i zwraca `4 <= month <= 9`, z odsyłaczem do pkt 2.2.8 taryfy. Sprawdzone
end-to-end: wygenerowane maski zgadzają się z `src/zones.js` **co do godziny przez cały
rok, w obu grupach**. Profile energii (`pv_per_kwp`, `house_per_MWh`, `ev_per_MWh`,
`dzien_wolny`) wyszły z generatora bit w bit takie same, więc `data/profiles.js` nie
wymagało przeliczenia. Zmienił się natomiast zmierzony udział taniej strefy: 77,5% -> 78,1%
(4 375 -> 4 409 kWh z 5 642), i tę wartość ma teraz `test/validate.test.mjs`.

Pola `strefa_tania_g12` i `strefa_tania_g12w` **zostały usunięte** z `data/profiles.js`
i `test/profiles_raw.json`. Zapisywały regułę generatora, czyli tę błędną, a odtwarzanie
ich z `zones.js` dałoby test, który porównuje kod z samym sobą. Bramką jest teraz
`test/zones.test.mjs` odtwarzający tabelę z taryfy wprost, razem z datami granicznymi
(30.09/1.10 i 31.03/1.04). Materiałem z generatora zostaje maska `dzien_wolny` - ona
jest niezależna i nadal porównywana godzina po godzinie.

**Otwarte, do sprawdzenia na fakturze:** ta sama taryfa mówi, że zegary sterujące
w układach pomiarowych „ustawia się według czasu zimowego i nie zmienia się w okresie
obowiązywania czasu letniego", chyba że licznik potrafi utrzymać godziny stref sam.
Gdyby u Tomasza obowiązywał wariant pierwszy, letnie okna wypadałyby w profilu
o godzinę później (16-18 i 23-7). Model zakłada wariant drugi, bo licznik jest nowy
i raportuje do CSIRE. Rozstrzygnie faktura z rozbiciem na strefy.

## Profile nasłonecznienia: `data/pv.js` i `tools/pobierz-pvgis.mjs`

`data/pv.js` jest **generowane** skryptem `tools/pobierz-pvgis.mjs` (PVGIS 5.3, baza
SARAH3, lata 2014-2023). Skrypt wolno tu trzymać - zakaz z sekcji wyżej dotyczy generatora
profili zużycia z prywatnego repozytorium, bo tamten czyta surowe logi z adresem i numerami
PPE. PVGIS to publiczne API i nic prywatnego przez nie nie przechodzi.

Trzy rzeczy, które przy odświeżaniu danych łatwo zepsuć:

1. **PVGIS podaje czasy w UTC.** Cały model - profil domu, strefy taryfowe, praca magazynu
   - chodzi w czasie lokalnym. Bez przeliczenia (zima UTC+1, lato UTC+2) szczyt produkcji
   wypada godzinę za wcześnie i autokonsumpcja liczy się na przesuniętej dobie. Pierwsza
   wersja danych miała ten błąd; pilnuje tego test „profile PVGIS chodzą w czasie lokalnym".
   Szczyt doby ma wypadać o 11 lub 12 - później na zachodzie kraju, bo tam słońce góruje
   później. To nie jest błąd.
2. **Rok medianowy, nie średnia z lat.** Uśrednianie godzina po godzinie wygładza
   zachmurzenie i daje profil bez ostrych szczytów, co zawyża autokonsumpcję - czyli psuje
   dokładnie tę liczbę, po którą ludzie tu przychodzą.
3. **Godziny są spakowane po dwa znaki base36** (krok 0,77 Wh na kWp). Dziesięć lokalizacji
   to 175 kB zamiast 400 kB, a strona ma działać otwarta z dysku, więc wszystko jedzie
   w pliku. Dekoder siedzi w tym samym module, rozpakowuje leniwie i zapamiętuje wynik.

Mnożniki orientacji w `ORIENTACJE` (silnik) i mnożnik nachylenia w `src/pv.js` liczą się
z tej samej siatki PVGIS. Nie mnożyć ich przez siebie inaczej niż dziś: mnożnik nachylenia
jest liczony **względem tej samej orientacji**, żeby orientacja nie weszła dwa razy.

## Import wlasnego profilu: `src/import.js`

Parser jest zbudowany wokol zalozenia, ze **sie pomyli**, i to jest jego cala konstrukcja:
kolumny proponuje, nie narzuca; po wczytaniu rysuje profil (usredniona doba i dwanascie
miesiecy), bo wzrokowa kontrola wylapie zla kolumne szybciej niz jakikolwiek regex;
podaje sume kWh do porownania z faktura. Nie zamieniac tego na ciche "wczytano poprawnie".

Rzeczy, ktore juz raz byly zle albo latwo je zepsuc:

- **Po poprawieniu wyboru kolumny profil musi sie przeliczyc.** Pierwsza wersja robila to
  tylko wtedy, gdy poprzednia proba sie udala - czyli po bledzie uzytkownik poprawial
  kolumne, a komunikat zostawal na ekranie.
- **Plik moze byc w Windows-1250** (eksporty z polskich portali). Czytamy przez TextDecoder
  z fatal:true i dopiero po bledzie schodzimy do cp1250, zeby naglowek "Zuzycie" nie
  przyszedl z krzakami i nie zepsul propozycji kolumn.
- **Dziury do 48 godzin uzupelniamy i mowimy ile ich bylo.** Dluzsza przerwa to blad -
  uzupelnianie jej byloby zmyslaniem danych.
- **Plik z okresu, gdy uzytkownik mial juz PV, jest odrzucany z wyjasnieniem.** Taki plik
  pokazuje pobor z sieci, a nie zuzycie domu, wiec autokonsumpcja wyszlaby zanizona.
  To pytanie stoi w formularzu jako pole wyboru i ma tam zostac.
- **Dni tygodnia bierzemy z kalendarza 2025/26.** Plik z innego roku ma weekendy
  przesuniete o dzien-dwa wzgledem naszej siatki i tak jest napisane w podsumowaniu.
  Gdyby to kiedys przeszkadzalo, alternatywa jest obracanie danych po dniu tygodnia
  zamiast po dacie - ale wtedy rozjezdzaja sie pory roku.

## Archetypy ogrzewania: `data/domy.js` i `tools/dekompozycja.mjs`

`data/domy.js` jest **generowane** przez `tools/dekompozycja.mjs`. Skrypt czyta
`data/profiles.js` (artefakt już anonimowy) i temperatury z Open-Meteo ERA5, więc może
leżeć w publicznym repozytorium.

Metoda: regresja zużycia dobowego względem temperatury wyznacza próg grzewczy, kształt
doby składnika bytowego bierzemy z dni cieplejszych niż próg (bo tylko wtedy widać dom
bez grzania), a grzanie to nadwyżka ponad ten kształt, godzina po godzinie.

Rzeczy, które trzeba przy tym trzymać w głowie:

- **Próg grzewczy jest słabo określony.** Wyszedł 15,5°C, ale 15,0-16,5°C tłumaczy dane
  praktycznie tak samo (R² 0,555). `METODA.progOd` i `progDo` są w danych właśnie po to,
  żeby nie chwalić się precyzją, której nie ma.
- **Nie modelujemy załamania COP przy mrozie.** Plan zakładał, że będzie widoczne, ale
  w zmierzonym roku nadwyżka na stopień jest podobna przy -10°C i przy +8°C. Przeliczenie
  prądu na ciepło idzie przez model COP (ułamek Carnota, zasilanie 35°C, SCOP wychodzi
  3,86) i to jest **założenie, nie pomiar** - tak też jest opisane w README.
- **Wariant akumulacyjny jest najważniejszym wynikiem tego etapu**: przeniesienie grzania
  na noc zbija autokonsumpcję z 70% na 47% i wydłuża zwrot z 4,7 do 6,7 roku. Gdyby
  kiedyś wyszło inaczej, najpierw sprawdzić, czy okno nocne 22-6 nie rozjechało się
  ze strefami taryfowymi.
- **Wczytany plik użytkownika ma pierwszeństwo przed archetypem** i podpowiedź przy polu
  mówi wtedy wprost, że wybór ogrzewania nic nie zmienia. To celowe: dane biją model.

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
3. **Stawki tylko w `src/pricing.js`**, w tabeli `OPERATORZY`, z datą obowiązywania
   i odsyłaczem do dokumentu przy każdym operatorze. Aktualizacja na kolejny rok ma być
   zmianą w tej jednej tabeli. **Bez dokumentu nie wpisujemy stawki ani godziny stref** -
   dlatego ENEA nie ma G12: jej taryfa podaje tylko długość stref, a godziny zegarowe
   „określa Operator".
4. **Testy są bramką w CI.** Push do `main` nie opublikuje strony, jeśli `node --test`
   nie przejdzie. To jedyne zabezpieczenie przed cichym zepsuciem wyników.
5. **Suma pozycji kosztowych musi równać się polu „Razem" co do złotówki.** Pozycje
   i kwota łączna to dwa widoki tej samej rzeczy; `rozdzielKwote` dorzuca resztę
   z zaokrągleń do największej pozycji właśnie po to. Gdy użytkownik zobaczy, że pola
   nie sumują się do kwoty, którą sam wpisał, słusznie przestanie ufać reszcie wyników.
6. **Proporcje kosztów trzymamy w `proporcjeKosztu`, nie w polach formularza.**
   Przy kasowaniu pola „Razem" pola pozycji na moment zjeżdżają do zera i bez tej kopii
   proporcje przepadłyby po pierwszym wpisanym znaku.
7. **Liczby idą przez `src/format.js`.** Wstawiona wprost do szablonu liczba dziesiętna
   wychodzi z kropką („22.5 kWh"), a czas zwrotu bez odmiany („7,4 lat"). Jedno i drugie
   już się wydarzyło. Od 8.09.2026, gdy pojemność magazynu przestała być liczbą całkowitą
   (15,36 kWh), wyszło tego jeszcze kilka miejsc naraz. **`liczba()` zaokrągla** - bez tego
   wartość z dzielenia wchodziła na stronę jako „2,8569600000000004 kWh"; drugi argument
   ustawia liczbę miejsc.

## Weryfikacja po zmianach

```bash
node --test "test/*.test.mjs"
python -m http.server 8899
```

Potem realna przeglądarka (Playwright): asercje DOM na tym, że zmiana parametrów zmienia
wynik, że wykresy mają po 12 punktów i **nie rosną po wielu przeliczeniach**, że konsola
jest czysta i że zakładka sieci nie pokazuje żadnego obcego hosta. Zrzut ekranu całej
strony, nie tylko pierwszego ekranu.

## Skąd pochodzi CENNIK_ODNIESIENIA

Dokumenty źródłowe leżą w prywatnym repo `zuzycie-pradu`, w
`docs/Fotowoltaika_magazyn_energii_oferty`. Nic z tego katalogu nie trafia tutaj poza
liczbami - w plikach są nazwiska, adres i numery kont.

Rozbicie na pozycje pochodzi z arkusza porównawczego (lista kontrolna Akademii
Fotowoltaiki), gdzie wykonawca podał ceny składowe **przed dotacją**:
falownik Sofar HYD 8 KTL-X G3 - 8 999 zł, magazyn BTS E10-DS5 10 kWh -
„1599 + 6999 + 6999 = 15599 zł" (stąd baza 1 599 i 1 400 zł/kWh), zasilanie awaryjne
+2 900 zł u wybranego wykonawcy i +3 996 zł u innego.

Sześć ofert z 2025 (`WIDELKI_OFERT_2025`), w kolejności rosnącej: Otovo 43 446,
Appeco 47 229, Prosun Energy 52 800, VIMA Energia 57 615, Pelsun 66 598,
AiO Power 68 273. Mediana 55 208 zł zgadza się co do złotówki.

**Uwaga na przyszłość:** w tym samym arkuszu jest notatka, że wynegocjowana rozbudowa
o 5 kWh kosztowała u Sofara **6 000 zł**, a nie 6 999 zł z cennika. Kalkulator używa ceny
katalogowej (1 400 zł/kWh), czyli wariantu ostrożniejszego. Dla porównania rozbudowa
o te same 5 kWh: Deye +6 330, Huawei +8 200, Sigenergy +8 610.

## Cennik odniesienia jest skrzywiony pod dotację - decyzja czeka

Cennik z arkusza (wyżej) to ceny handlowe. Ale **faktura końcowa ma zupełnie inne
rozbicie tej samej instalacji** i to ono pokazuje, jak działał mechanizm dotacji:

| Pozycja z faktury 16/07/2025 | Netto | Brutto |
|---|---|---|
| Instalacja PV 9 kW z montażem (18 modułów, falownik, stelaż, zabezpieczenia) | 15 509 zł | 16 750 zł |
| Magazyn BTS E15-DS5 (3 moduły + jednostka sterująca, montaż i konfiguracja) | 30 324 zł | 32 750 zł |
| Razem | 45 833 zł | 49 500 zł |

Sama oferta podawała **jedną kwotę 50 000 zł brutto** - rozbicie pojawiło się dopiero
na fakturze. Magazynowi przypisano 32 750 zł, czyli 2 132 zł/kWh, przy cenie tego samego
zestawu w sklepie producenta ok. 17 200 zł. Odwrotnie niż w cenniku handlowym, gdzie
magazyn 10 kWh kosztował 15 599 zł, a więc mniej niż połowę.

Powód: Mój Prąd 6.0 dawał **do 7 000 zł na PV z magazynem, do 16 000 zł na magazyn
energii i do 5 000 zł na magazyn ciepła**, a dofinansowanie nie mogło przekroczyć
**połowy kosztów kwalifikowanych**. Widać to w ofercie VIMA: magazyn „cena netto
17 372,94 zł → 8 686,47 zł" (zadziałała połowa kosztu), a PV 7 000 zł przy koszcie
29 222,30 zł (zadziałał sufit kwotowy). Żeby sięgnąć po pełne 16 000 zł, magazyn musiał
być na fakturze pozycją rzędu 32 000 zł. Stąd te 30 324 zł.
**Suma jest wiarygodna, rozbicie nie.** To ma znaczenie, bo cała odpowiedź „czy magazyn
się zwraca" stoi na tym rozbiciu.

Historia poprawek tego akapitu, żeby nie cofnąć go w dobrej wierze: pierwotnie README
podawało 17 000 na PV i 6 000 na magazyn (błędnie, odwrotnie). Potem opis mówił, że 50%
dotyczyło wyłącznie magazynu - to też było niepełne. Wersja obecna (15.08.2026): limity
kwotowe osobno na każdy element, a połowa kosztów jako sufit całości.

Ceny katalogowe zebrane 12.08.2026 ze sklepu producenta (sofar-sklep.pl), brutto:

| Pozycja | Faktura 2025 | Sklep 2026 | Uwaga |
|---|---|---|---|
| Falownik HYD8KTL | 8 999 zł | 5 799 zł | ten sam model co w domu odniesienia |
| Jednostka sterująca BDU (BTS 5K-BDU) | 1 599 zł | 1 299 zł | prawie się zgadza |
| Moduł 5,12 kWh (BTS 5K) | ok. 7 168 zł | 5 299 zł | 1 035 zł/kWh |
| Magazyn 15,36 kWh złożony z modułów | 22 599 zł | 17 196 zł | 1 299 + 3 x 5 299 |
| Magazyn 15,36 kWh w zestawie z falownikiem | - | 16 200 zł | 21 999 zł zestaw minus falownik |
| Rozdzielnica AC HydBOX 32A | - | 4 299 zł | pełny backup domu, sam sprzęt |

Różnica **nie jest w całości skrzywieniem pod dotację** - składa się z trzech rzeczy, których
bez faktury z wydzieloną robocizną nie da się rozdzielić: (1) układanie kosztorysu pod dotację,
(2) realny spadek cen przez rok, najmocniejszy właśnie na magazynach, (3) marża wykonawcy,
montaż, gwarancja i zgłoszenie do operatora, których sklep nie zawiera. Nie pisać więc,
że faktura była zawyżona o konkretną kwotę.

Od 8.09.2026 obok wyliczonej kwoty stoi **pasek widełek rynkowych** (`widelkiRynkowe`
w `economics.js`), który skaluje się z konfiguracją: ceny instalacji z Akademii
Fotowoltaiki (kwiecień 2026) plus ceny magazynów za kWh z montażem (wrzesień 2026).
Domyślnych liczb celowo nie ruszaliśmy - kalkulator dalej liczy z cen sprzętu ze sklepu
producenta, a pasek pokazuje, gdzie ta wycena stoi wobec rynku. Przy 9 kWp i 15 kWh nasze
37 250 zł mieści się tuż nad dolną granicą widełek 34 745 - 72 025 zł (typowa 53 460 zł).
Poprzedni pasek pokazywał sztywne 43 446 - 68 273 zł z sześciu ofert z osiedla, co przy
instalacji 4 kWp było po prostu mylące; te oferty zostały w tekście pod paskiem.

Do rozstrzygnięcia z Tomaszem: czy dołożyć drugi cennik do wyboru („sprzęt 2026" obok
„oferta pod klucz 2025"), czy przestawić domyślny. **Zrobione 8.09.2026:** koszt magazynu liczy się skokowo. `pojemnoscModulowa` zaokrągla
pojemność w górę do całych modułów 5,12 kWh i tak liczy się zarówno cena, jak i praca
magazynu; suwak pokazuje realną pojemność (13 kWh -> 15,36 kWh, trzy moduły). Wcześniej
liniowa cena przy 13 kWh dawała 16 300 zł, czyli **mniej niż same moduły w sklepie
producenta** (17 196 zł), a przy 16 kWh była niższa o prawie 2 900 zł. Test
„cennik nie może wycenić magazynu taniej niż sam sprzęt w sklepie" pilnuje tego dla
ośmiu pojemności.

## Sprawy otwarte

- **Nabór PME część 2** (Fundusz Modernizacyjny) planowany na III kwartał 2026 -
  gdy ruszy, wpisać realne kwoty do `src/economics.js`. To jedyna ścieżka dofinansowania
  magazynu dla kogoś, kto instaluje teraz.
- **Limit obwodu awaryjnego** w domu odniesienia (3,6 kW wobec 8 kW z karty falownika) -
  hipoteza: zabezpieczenie 16 A. Do potwierdzenia w rozdzielnicy.
- **Ceny wariantu backupu całego domu** (rozdzielnica z automatycznym przełącznikiem) -
  sekcja 6 opisuje ten wariant jakościowo, bo nie mamy dla niego żadnej oferty. Gdy
  pojawi się konkretna wycena, można ją dołożyć obok widełek 2 900 - 4 000 zł za EPS.
- **Eksport do PDF i do HTML sprawdzony 8.09.2026** (Playwright: `page.pdf()` na mediach
  print oraz kliknięcie „Zapisz jako plik" z przechwyceniem bloba). PDF ma 6 stron,
  formularz jest schowany, wykresy się rysują. Eksport HTML waży ok. 185 kB, nie ma
  w nim ani jednego `<script>`, wykresy są wklejone jako PNG w data URI, a pola formularza
  zamienione na tekst - w pliku bez JS pole do wpisywania i tak nic by nie robiło.
  Przy okazji poprawione: `h2,h3 { break-after: avoid }`, bo nagłówki sekcji 6, 7 i 8
  zostawały same na dole strony.
- Widok na telefonie sprawdzony 12.08.2026 (390 px): brak poziomego przewijania, tabela
  przewija się wewnątrz `.tabwrap`, diagram przepływu schodzi do jednej kolumny.

## Co wychodzi w sprawie magazynu i dlaczego to zostawiamy

Na profilu domu odniesienia magazyn **wydłuża** czas zwrotu całości (2,9 roku bez
magazynu, 4,8 roku przy 15,36 kWh), choć podnosi autokonsumpcję z 45% do 70%. Sam magazyn
zwraca się w ok. 13 latach, najlepiej w okolicach 10 kWh (12,3 roku). Pełna tabela jest
w `README.md` i była przeliczana 8.09.2026 - po zmianach modelu w etapach 1-6.
Liczby biorą się z konfiguracji domyślnej strony: 9 kWp, 11 MWh, G12w u PGE, dach
południowy wschód/zachód 35°, profil zmierzony.

To wynik kontrintuicyjny i przy każdej zmianie modelu warto sprawdzić, czy nadal wychodzi.
Nie wygładzać go: kalkulator ma odpowiadać, a nie sprzedawać magazyn. Sekcja 4 mówi wprost,
że magazynem kupuje się niezależność od sieci, a nie szybszy zwrot.
