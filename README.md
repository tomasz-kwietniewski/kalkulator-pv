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
| Pobór z sieci | 5 605 kWh | 5 642 kWh | -0,7% |
| Oddanie do sieci | 2 354 kWh | 2 236 kWh | +5,3% |
| Udział taniej strefy G12w | 76,2% | 77,5% | -1,3 pkt proc. |
| Największy błąd miesięczny | - | - | 74 kWh |

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
src/pricing.js        taryfy PGE, dystrybucja, oplaty, net-billing, taryfa dynamiczna
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
  fotowoltaikę i do 16 000 zł na magazyn (połowa jego kosztu), łącznie do 23 000 zł.
  Warto o tym pamiętać, czytając stare kosztorysy: skoro dotacja na magazyn zależała
  od jego ceny na fakturze, rozbicie z tamtych dokumentów mówi więcej o programie
  dofinansowania niż o wartości sprzętu.
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
  sprzętu** - i mieściłoby się to w limicie 3 000 zł/kWh. Program premiuje więc drogie
  pozycje na fakturze, a nie tanie zakupy, i dlatego kalkulator pokazuje obok dotacji
  cenę magazynu za kWh oraz cenę tego samego sprzętu w sklepie producenta.
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

## Źródła stawek

- Taryfa PGE Obrót dla grup taryfowych G, zatwierdzona przez Prezesa URE na 2026 r.
- Wyciąg z Taryfy PGE Dystrybucja S.A. obowiązujący od 1.02.2026 (pkt 7.9, 7.11-7.13)
- Ceny RCE: API PSE (`api.raporty.pse.pl`)
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
