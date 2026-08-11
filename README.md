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
src/economics.js      koszt instalacji, dotacje, ulga, czas zwrotu
src/ui.js             warstwa interfejsu - nie liczy niczego sama
data/profiles.js      profile godzinowe (anonimowe: same znormalizowane ksztalty)
data/rce.js           godzinowe ceny RCE z API PSE
test/                 testy jednostkowe i bramka walidacyjna
```

Profile generuje skrypt `analyze/kalkulator/build_profiles.py` w prywatnym repozytorium
z danymi źródłowymi. Do tego repozytorium trafia wyłącznie gotowy, anonimowy artefakt -
bez adresu, numerów PPE, kwot faktur i numerów seryjnych.

## Źródła stawek

- Taryfa PGE Obrót dla grup taryfowych G, zatwierdzona przez Prezesa URE na 2026 r.
- Wyciąg z Taryfy PGE Dystrybucja S.A. obowiązujący od 1.02.2026 (pkt 7.9, 7.11-7.13)
- Ceny RCE: API PSE (`api.raporty.pse.pl`)
- Ceny instalacji: sześć ofert zebranych na tym osiedlu w 2025 r.

## Uruchomienie lokalnie

```bash
python -m http.server 8899
```

Testy:

```bash
node --test "test/*.test.mjs"
```
