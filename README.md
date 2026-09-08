# Kalkulator opłacalności fotowoltaiki i magazynu energii

Kalkulator dla sąsiadów z osiedla w Musułach. Odpowiada na pytanie „czy fotowoltaika
i magazyn energii mi się opłacą" nie przez mnożenie rocznych sum przez zgadnięte
współczynniki, tylko przez **symulację godzina po godzinie na zmierzonym roku pracy
realnego domu z tego samego osiedla**.

Domy na osiedlu są do siebie bardzo podobne: drewniane szkieletowe, ok. 125 m²,
w pełni elektryczne, ogrzewane pompami ciepła, zużycie 8-15 MWh rocznie. Profil
odniesienia pochodzi z jednego z nich: PV 9 kWp, magazyn 15 kWh, rok pomiarów
VIII 2025 - VII 2026 z loggera falownika co 5 minut, zweryfikowany fakturami.

## Dlaczego nie kolejny kalkulator z internetu

Typowy kalkulator net-billingu pyta użytkownika o **autokonsumpcję** - czyli o liczbę,
której użytkownik nie zna, a która najmocniej decyduje o wyniku. Ten ją **liczy**,
bo ma zmierzony profil produkcji i zużycia co godzinę. Dzięki temu potrafi odpowiedzieć
na pytanie, które generyczne kalkulatory obchodzą bokiem: **czy magazyn się zwraca**.

## Co wychodzi w sprawie magazynu

Na profilu domu odniesienia (9 kWp, zużycie 11 MWh, taryfa G12w) odpowiedź jest
niewygodna i dlatego warto ją mieć wprost:

| Pojemność | Autokonsumpcja | Oddane do sieci | Zwrot całości | Zwrot samego magazynu |
|---|---|---|---|---|
| brak | 44% | 4 653 kWh | 2,9 roku | - |
| 5 kWh | 56% | 3 703 kWh | 3,7 roku | 13,3 roku |
| 10 kWh | 64% | 3 041 kWh | 4,2 roku | 12,5 roku |
| 15 kWh | 69% | 2 559 kWh | 4,7 roku | 13,3 roku |
| 20 kWh | 73% | 2 284 kWh | 5,2 roku | 14,4 roku |

(9 kWp, zużycie 11 MWh, taryfa G12w, ceny sprzętu z sierpnia 2026 plus montaż,
ulga 12%, wzrost cen energii 4% rocznie, bez zasilania awaryjnego)

Magazyn robi dokładnie to, czego się po nim spodziewamy: podnosi autokonsumpcję z 44%
do niemal 70% i zatrzymuje w domu ponad 2 000 kWh rocznie, które inaczej poszłyby do
sieci za ułamek ceny. Ale **wydłuża czas zwrotu całej inwestycji**, bo kosztuje więcej,
niż oszczędza. Kupuje się nim niezależność od sieci i zasilanie awaryjne, a nie szybszy
zwrot. Kalkulator mówi to wprost, zamiast chować za jedną sumaryczną liczbą.

Widać też, że sam magazyn wypada najlepiej w okolicach **10 kWh** - mniejszy nie zdąży
się nasycić przez dobę, większy stoi pusty przez większość roku. A powyżej ok. 22 kWh
każde kolejne 2,5 kWh pojemności podnosi autokonsumpcję o mniej niż punkt procentowy.

## Jak sprawdzono, że nie zmyśla

`test/validate.test.mjs` uruchamia silnik na zmierzonym profilu i porównuje wynik
z tym, co naprawdę pokazały liczniki:

| Wielkość | Symulacja | Pomiar | Odchyłka |
|---|---|---|---|
| Pobór z sieci | 5 604 kWh | 5 642 kWh | -0,7% |
| Oddanie do sieci | 2 354 kWh | 2 236 kWh | +5,3% |
| Udział taniej strefy G12w | 75,9% | 77,5% | -1,6 pkt proc. |
| Największy błąd miesięczny | - | - | 74 kWh |

Uwaga do wiersza o strefach: 77,5% policzył generator w prywatnym repozytorium, a robił
to według zmiany czasu zamiast według sezonu z taryfy (lato 1.04 - 30.09). Kalkulator
liczy strefy zgodnie z taryfą, więc te dwie liczby dzieli nie tylko dokładność modelu,
ale i definicja sezonu - do zestrojenia przy następnym przeliczaniu profili.

Dwa parametry modelu (pobór własny układu i poziom dobierania magazynu z sieci)
są skalibrowane na tym samym roku, więc roczna zgodność jest częściowo z definicji.
Niezależnym sprawdzianem jest **rozkład miesięczny**: dwiema rocznymi stałymi nie da
się dopasować kształtu dwunastu miesięcy naraz.

Testy są bramką w CI - strona nie trafi na produkcję, jeśli przestaną przechodzić.

## Prywatność

Strona jest statyczna i liczy wyłącznie w przeglądarce. Nie ma serwera, backendu,
bazy ani analityki. Dane (profile godzinowe i ceny giełdowe) są **wbudowane w pliki
źródłowe**, więc po załadowaniu strony nie leci już żadne zapytanie - i dlatego
działa też otwarta z dysku. Parametry zapisujemy we fragmencie adresu po `#`,
który nigdy nie trafia do serwera.

## Struktura

```
index.html            strona
src/engine.js         symulacja 8760 h: PV, dom, magazyn, siec (bez DOM, testowalny z Node)
src/import.js         wczytywanie wlasnego profilu godzinowego z pliku CSV
src/pv.js             wybor profilu naslonecznienia i mnoznik nachylenia dachu
src/zones.js          strefy taryfowe z kalendarza: swieta, dni wolne, sezon taryfowy
src/pricing.js        taryfy pieciu operatorow, oplaty, net-billing, taryfa dynamiczna
src/economics.js      pozycje kosztowe, dotacje, ulga, kaskada nakladu, czas zwrotu
src/charts.js         wykresy, znacznik punktu zwrotu, diagram przeplywu energii
src/format.js         formatowanie liczb po polsku (kwoty, procenty, odmiana lat)
src/ui.js             warstwa interfejsu - nie liczy niczego sama
data/profiles.js      profile godzinowe (anonimowe: same znormalizowane ksztalty)
data/rce.js           godzinowe ceny RCE z API PSE
test/                 testy jednostkowe i bramka walidacyjna
```

Profile generuje skrypt `analyze/kalkulator/build_profiles.py` w prywatnym repozytorium
z danymi źródłowymi. Do tego repozytorium trafia wyłącznie gotowy, anonimowy artefakt -
bez adresu, numerów PPE, kwot faktur i numerów seryjnych.

## Stan przepisów i programów (zweryfikowany 11.08.2026)

- **Mój Prąd 6.0** - zamknięty 12.09.2025, wyczerpana pula. Dawał do 7 000 zł na
  fotowoltaikę z magazynem, do 16 000 zł na magazyn energii i do 5 000 zł na magazyn
  ciepła, przy czym dofinansowanie nie mogło przekroczyć **połowy kosztów
  kwalifikowanych**. Warto o tym pamiętać, czytając stare kosztorysy: limit na magazyn
  był ponad dwa razy wyższy niż na fotowoltaikę, a po pełne 16 000 zł dało się sięgnąć
  dopiero przy magazynie wycenionym na jakieś 32 000 zł. Rozbicie z tamtych dokumentów
  mówi więc więcej o konstrukcji programu niż o wartości sprzętu.
- **Przydomowe Magazyny Energii cz. 1 (KPO)** - nabór 30.03 - 19.06.2026, zamknięty.
  Był zwrotem kosztów instalacji **już wykonanych** (wydatki 1.08.2024 - 31.10.2025),
  do 28 000 zł i do 50% kosztów. Dla decyzji podejmowanej dziś bez znaczenia.
- **Przydomowe Magazyny Energii cz. 2 (Fundusz Modernizacyjny)** - planowany na
  III kwartał 2026, budżet do 1 mld zł. Dotacja na magazyn to **30% kosztów, nie więcej
  niż 800 zł/kWh i nie więcej niż 16 000 zł** przy net-billingu (8 000 zł przy starych
  opustach). Minimum **10 kWh**, koszt zakupu z montażem do 3 000 zł/kWh, rozpoczęcie
  przedsięwzięcia nie wcześniej niż 1.11.2025. Osobno do 2 000 zł na sprzęt z Unii.
  Kalkulator **pokazuje szacunek, ale nie wlicza go w wynik** - nabór nie ruszył
  i regulaminu jeszcze nie ma.

  Warto wiedzieć, co z tych limitów wynika: przy realnych cenach magazynu (ok. 1 100 zł/kWh)
  **zawsze wiąże 30% kosztu**, nigdy 800 zł/kWh ani 16 000 zł. Żeby wyjąć pełne 16 000 zł,
  faktura musiałaby pokazać magazyn za ponad 53 000 zł, czyli **około dwuipółkrotność ceny
  sprzętu** - i mieściłoby się to w limicie 3 000 zł/kWh.

  Kluczowe jest jednak co innego: **dotacja liczy się od pozycji „magazyn", a nie od kwoty
  łącznej**. Wykonawca może wycenić niżej fotowoltaikę z falownikiem, a wyżej magazyn,
  i przy tej samej sumie dotacja wyjdzie większa. Dokładnie to widać na fakturze za
  instalację odniesienia: oferta podawała 50 000 zł za całość, faktura rozpisała 16 750 zł
  na PV z montażem i 32 750 zł na magazyn. Dlatego kalkulator radzi **porównywać oferty
  po kwocie łącznej**, a cenę magazynu za kWh podaje obok jako punkt odniesienia, nie
  jako kryterium wyboru. Mówi też wprost o efekcie cenowym dopłat: tam, gdzie jest
  dofinansowanie, stawki rosną i część dotacji zostaje u wykonawcy.
- **Ulga termomodernizacyjna** (art. 26h ustawy o PIT) - limit 53 000 zł na podatnika,
  małżonkowie współwłaściciele łącznie 106 000 zł. Budynek musi być oddany do użytku
  (progu wieku nie ma, dom w budowie się nie kwalifikuje). Od 2025 katalog obejmuje
  także **magazyny energii i magazyny ciepła**, nie tylko panele. Odliczyć można
  wyłącznie część pokrytą z własnych środków.
- **Net-billing** - instalacje przyłączone od 1.07.2024 rozliczane godzinowym RCE,
  bez powrotu do miesięcznego RCEm. Przy ujemnej cenie depozyt się nie zmniejsza.
  Wartość depozytu za dany miesiąc jest **powiększana o współczynnik 1,23** i przypisywana
  do konta w miesiącu następnym (przepis od 1.02.2025). Środki można rozliczać przez
  12 miesięcy, niewykorzystana nadwyżka wraca do 20% wartości depozytu miesięcznego.

## Taryfa dynamiczna: co kalkulator zakłada i czego jeszcze nie ma na rynku

Wariant dynamiczny liczymy **na harmonogramie stref G12w**: magazyn pracuje według
z góry ustawionych okien, a rozliczenie idzie po cenach giełdowych. To celowo ostrożne
założenie, odpowiadające zwykłemu falownikowi z trybem Time of Use, a nie takiemu, który
sam śledzi ceny godzinowe. Drogie godziny na giełdzie i tak wypadają w powtarzalnych
oknach, zbliżonych do stref taryfowych, więc dla domu bez samochodu elektrycznego to
przybliżenie jest uczciwe.

Zimą ta taryfa niewiele różni się od strefowej, bo w drogich godzinach ceny bywają
wtedy bardzo wysokie. Więcej daje latem, gdy tanich godzin jest wyraźnie więcej niż
w taryfie dwustrefowej.

**Czego brakuje, żeby wycisnąć z niej resztę.** Największa wartość dodana to nie tańszy
zakup, tylko **sprzedawanie nadwyżek wtedy, gdy są drogie**, zamiast w południe, gdy
świeci pełne słońce i energia w sieci jest warta najmniej albo nic. Wymaga to falownika,
który sam handluje: trzyma energię w magazynie i oddaje ją w drogich godzinach.

Taka usługa już istnieje - Pstryk sprzedaje ją jako **Pstryk Connect** za 30 zł
miesięcznie od domu (pierwsze trzy miesiące bez opłaty). Opisuje ją tak: „Pstryk zarządza
magazynem analizując ceny i Twój profil zużycia, by automatycznie kupować tani prąd
i sprzedawać nadwyżki z zyskiem jeśli masz PV". Problem jest gdzie indziej: **lista
obsługiwanych magazynów jest krótka**.

Widać to po proporcjach (stan na 17.08.2026, źródło: aplikacja Pstryka). Ładowarek
samochodowych obsługuje osiemnaście marek, między innymi Easee, Wallbox, Teslę, Kebę,
Zaptec i Myenergi. **Magazynów energii - dwie: Sigenergy i Solax** (ten drugi przez
dedykowany klucz API). Pomp ciepła - jedną. Sterowanie samym samochodem jest zapowiadane
jako „już wkrótce". Innymi słowy: przy ładowarkach ta usługa jest dojrzała, przy
magazynach dopiero raczkuje, choć lista sukcesywnie rośnie.

Dlatego właściciel domu odniesienia **zrezygnował z taryfy dynamicznej i został przy
G12w**. Nie dlatego, że automatyczny handel energią nie działa, tylko dlatego, że
**jego falownik Sofar nie jest obsługiwany**. To decyzja do rewizji, gdy lista
integracji się poszerzy.

Da się to obejść własnymi rękami: falownik Sofar ma tryb, w którym można ustawić
harmonogram pracy, a resztę dołożyć automatyką w Home Assistant. Tylko że to nie jest
rozwiązanie dla każdego - dużo konfigurowania, a potem utrzymywanie tego, sprawdzanie,
czy naprawdę robi to, co miało robić, i poprawianie, gdy coś się zmieni. Właściciel domu
odniesienia napisał sobie taką automatykę **tylko do ładowarki samochodu**, żeby ładować
nadwyżkami ze słońca: tam zysk był na tyle duży i klarowny, że praca się zwróciła.
Przy samym magazynie uznał, że woli rozwiązanie działające bez dłubania - i to jest
uczciwe założenie także dla kogoś, kto czyta ten kalkulator.

Wniosek praktyczny dla kogoś, kto dopiero wybiera: **jeśli myślisz o taryfie dynamicznej,
sprawdź listę obsługiwanych urządzeń, zanim wybierzesz falownik** - a nie odwrotnie.

## Dla kogo ten wynik jest wiarygodny

Kalkulator liczy autokonsumpcję godzina po godzinie, więc jakość wyniku zależy od tego,
skąd biorą się dwa profile: produkcji i zużycia.

**Profil zużycia:**

- **Twój własny plik z licznika** - wariant najmocniejszy i jedyny, który opisuje
  naprawdę Twój dom. Wgrywasz CSV (Moje IRE, eLicznik, aplikacja sprzedawcy), a kalkulator
  pokazuje wczytany profil na wykresie, zanim cokolwiek policzy. Plik zostaje
  w przeglądarce - nie jest nigdzie wysyłany ani zapisywany, nie ma go też w linku
  z parametrami.
- **Profil domu odniesienia** - kształt zużycia domu w pełni elektrycznego z pompami
  ciepła, przeskalowany do Twojego rocznego zużycia. Im bardziej Twój dom przypomina ten
  wzorzec, tym lepiej.

**Profil produkcji:**

- **Profil zmierzony (dom odniesienia, Musuły)** - domyślny. Realny rok pracy instalacji
  9 kWp: 1 008 kWh z każdego kWp, razem z kształtem dachu, zacienieniem i przerwami
  falownika. Najmocniejszy wariant, ale opisuje jeden konkretny dom.
- **Miasto z PVGIS** - model. Dobrze oddaje nasłonecznienie regionu, ale zakłada czysty
  dach 35° na południe, bez zacienienia.

Porównanie obu (kalibracja uczciwości): zmierzony rok dał 1 008 kWh/kWp, PVGIS dla
Warszawy 1 049 - różnica 4% w skali roku. **Rozkład miesięczny rozjeżdża się mocniej**:
zmierzony sierpień i wrzesień 2025 wypadły o 30-35% poniżej typowych, a marzec-lipiec 2026
o kilkanaście procent powyżej. To pogoda tamtego konkretnego roku plus przerwy falownika,
nie błąd modelu - ale trzeba o tym wiedzieć, czytając wykres miesięczny.

Mnożniki za ustawienie dachu też pochodzą teraz z PVGIS (siatka nachyleń i azymutów dla
środkowej Polski), a nie z oszacowania. Przy okazji wyszło, że dach wschód-zachód traci
21%, a nie 15%, jak zakładała poprzednia wersja.

## Źródła stawek

Kalkulator liczy dla pięciu operatorów sieci. Wszystkie stawki pochodzą z wyciągów
z taryf OSD i z taryf sprzedawców zatwierdzonych przez Prezesa URE na 2026 r.:

| Operator | Sprzedawca | Dokument |
|---|---|---|
| PGE Dystrybucja | PGE Obrót | Taryfa na 2026, tekst jednolity od 1.02.2026, pkt 2.2.8 i 7.9 |
| TAURON Dystrybucja | TAURON Sprzedaż | Wyciąg z Taryfy na 2026 dla grup G, pkt 2.2 i 7.1 |
| ENEA Operator | ENEA S.A. | Wyciąg z Taryfy na 2026, pkt 2.2.5 i 7.2 |
| Energa-Operator | ENERGA-OBRÓT | Wyciąg z Taryfy na 2026, pkt 3.2 i 9.2 |
| Stoen Operator | E.ON Polska | Taryfa na 2026, pkt 2.2.5-2.2.6 i 7.5 |

Różnice między nimi są większe, niż się wydaje, i nie sprowadzają się do cen:

- **PGE jako jedyne przesuwa blok popołudniowy z sezonem** - 13-15 zimą, 15-17 latem.
  Sezon wyznaczają daty (lato 1.04 - 30.09), a nie zmiana czasu.
- **Stoen w G12w nie ma doliny popołudniowej** - strefa szczytowa to 6-22 w dni robocze.
- **ENEA w G12w zaczyna tanią strefę o 21:00**, też bez doliny.
- **ENEA nie podaje w taryfie godzin G12** (ustala je indywidualnie), więc kalkulator
  tej grupy przy niej nie pokazuje, zamiast liczyć na zgadniętych godzinach.
- **E.ON pobiera opłatę handlową** (13,23 zł netto miesięcznie), której sprzedawcy
  z urzędu na taryfie URE nie mają.
- Ceny RCE: API PSE (`api.raporty.pse.pl`)
- **Nasłonecznienie dla dziesięciu miast**: PVGIS 5.3, baza SARAH3, lata 2014-2023,
  pobrane skryptem `tools/pobierz-pvgis.mjs`. PVGIS © European Union. Dane są bezpłatne
  i bez ograniczeń użycia. Dla każdego miasta bierzemy **rok medianowy**, a nie średnią
  z dziesięciu lat: uśrednianie godzina po godzinie wygładziłoby zachmurzenie i zawyżyło
  autokonsumpcję. Czasy PVGIS są w UTC i zostały przeliczone na czas polski razem ze
  zmianą czasu - bez tego cała doba byłaby przesunięta o godzinę.
- **Ceny sprzętu**: sklep producenta (sofar-sklep.pl), stan na 14.08.2026. Falownik
  Sofar HYD8KTL 5 799 zł, jednostka sterująca magazynu 1 299 zł, moduł 5,12 kWh
  5 299 zł (czyli 1 035 zł/kWh), rozdzielnica AC HydBOX 32A 4 299 zł - wszystko brutto.
  Do tego narzut na montaż, konstrukcję, zabezpieczenia i zgłoszenie do operatora.
- **Widełki ofert**: sześć ofert zebranych na tym osiedlu w 2025 r. Służą już tylko jako
  odniesienie historyczne - dzisiejsza wycena wypada poniżej, bo sprzęt przez rok staniał.

## Uruchomienie lokalnie

```bash
python -m http.server 8899
```

Testy:

```bash
node --test "test/*.test.mjs"
```
