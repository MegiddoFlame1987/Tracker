# Tracker

Dziennik jedzenia i treningu. PWA (Vite + React), dane w przeglądarce
(localStorage), funkcje serwerowe na Vercel. Klucze API nigdy nie trafiają
do przeglądarki.

## Co jest w środku

| Element | Plik | Rola |
|---|---|---|
| Aplikacja | `src/App.jsx` | cały UI, plan treningowy, dziennik, wykresy |
| Zapis danych | `src/storage.js` | localStorage z prefiksem |
| Rozpoznawanie posiłków i ocena tygodnia | `api/analyze.js` | Claude API: zdjęcie, opis tekstowy, `review` tygodnia |
| Dane z zegarka | `api/garmin.js` | most do intervals.icu: HRV, tętno spoczynkowe, sen, CTL/ATL, VO2max |
| Ikony, manifest PWA | `public/` | instalacja na telefonie |

## Zakładki

| Zakładka | Co robi |
|---|---|
| Dzień | zasady programu na górze, podpowiedź trenera na dziś, liczby dnia, priorytety, trening, pomiary; jedzenie i materiały referencyjne zwinięte na dole |
| Cele | priorytety dnia, jedna rzecz tygodnia + zadania, cele długie z terminem |
| Tydzień / Miesiąc | podsumowania, wykresy, eksport do oceny przez AI |
| Plan | periodyzacja 24 tygodni |

## Progresja ciężarów (bez AI)

`suggestLoads()` w `src/App.jsx` liczy propozycje lokalnie, z ostatnich sesji
tego samego dnia tygodnia:

- podwyżka **tylko** po dwóch sesjach na tym samym ciężarze z trafionym górnym
  zakresem powtórzeń (+5 kg dół ciała, +2,5 kg reszta),
- poniżej dolnego zakresu → −10%,
- tydzień deload albo sen poniżej 6 h → blokada podwyżki,
- progresuje ciężar, nie objętość: siłownia ma wspierać bieganie.

Test AMRAP pokazuje się tylko w tygodniu deload (co 4.), poza nim jest zwinięty
z datą ostatniego pomiaru.

Przepływ danych z zegarka: Garmin Connect → intervals.icu (oficjalne OAuth
Garmina) → `/api/garmin` → aplikacja.

## Zmienne środowiskowe (Vercel → Settings → Environment Variables)

| Nazwa | Wymagane | Po co |
|---|---|---|
| `ANTHROPIC_API_KEY` | tak | rozpoznawanie posiłków i ocena tygodnia |
| `INTERVALS_API_KEY` | do danych z zegarka | intervals.icu → Settings → Developer |
| `INTERVALS_ATHLETE_ID` | nie | np. `i123456`, domyślnie `0` = właściciel klucza |
| `APP_TOKEN` | zalecane | blokuje obcych przed paleniem Twoich kredytów |

Po ustawieniu `APP_TOKEN` wpisz ten sam ciąg raz w przeglądarce, w konsoli:

```js
localStorage.setItem("appToken", "TWÓJ_CIĄG")
```

Bez tego `/api/analyze` i `/api/garmin` zwrócą 401.

## Deploy

1. Vercel → Add New → Project → zaimportuj to repo.
2. Framework Preset: Vite (wykrywa się sam).
3. Dodaj zmienne środowiskowe z tabeli powyżej.
4. Deploy. Po ~1-2 min dostajesz link.

Każdy push na `main` przebudowuje stronę automatycznie.

## Instalacja na telefonie

- iPhone (Safari): Udostępnij → „Dodaj do ekranu głównego".
- Android (Chrome): menu ⋮ → „Dodaj do ekranu głównego".

## Lokalnie

```bash
npm install
npm run dev     # tylko frontend, /api nie działa
npm run build
```

Żeby mieć działające `/api` lokalnie: `npx vercel dev` i `.env.local` ze
zmiennymi z tabeli.

## Ograniczenia, o których warto pamiętać

- **Dane siedzą tylko w tej przeglądarce, na tym urządzeniu.** Wyczyszczenie
  danych przeglądarki = utrata wszystkiego. Rób eksport z apki jako backup.
- Zmiana telefonu nie przenosi danych. Przeniesienie wymagałoby prawdziwej
  bazy (np. Supabase) zamiast localStorage.
- Bundle ~600 kB — działa, ale przy dalszej rozbudowie wymaga code-splittingu.
