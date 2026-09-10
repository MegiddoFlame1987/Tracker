# Dziennik Kalorii — wersja samodzielna

Ta wersja działa niezależnie od Claude — hostowana na Vercel, dane w
przeglądarce (localStorage), rozpoznawanie zdjęć przez własną funkcję
serwerową (Twój klucz API, nigdy nie widoczny w przeglądarce).

## Czego potrzebujesz

- Konto na [vercel.com](https://vercel.com) (darmowe, logowanie przez GitHub)
- Konto na [github.com](https://github.com) (darmowe)
- Klucz API Anthropic z [console.anthropic.com](https://console.anthropic.com)
  (zakładka "API Keys") — płacisz tylko za realne użycie, kilka $ na
  rozpoznawanie posiłków starczy na długo

## Krok po kroku

### 1. Wrzuć kod na GitHub

- Wejdź na github.com → "New repository" → nazwij np. `dziennik-kalorii` →
  Create
- Na stronie repo kliknij "uploading an existing file" i przeciągnij
  WSZYSTKIE pliki z tego folderu (zachowując strukturę: `src/`, `api/`,
  `package.json`, `index.html`, `vite.config.js`)
- Commit changes

### 2. Podłącz do Vercel

- Wejdź na vercel.com → "Add New..." → "Project"
- Wybierz repo `dziennik-kalorii` z listy → Import
- Framework Preset: Vercel powinien sam rozpoznać "Vite" — zostaw jak jest
- **Nie klikaj jeszcze Deploy** — najpierw krok 3

### 3. Dodaj klucz API

- W tym samym ekranie (przed deployem) rozwiń "Environment Variables"
- Name: `ANTHROPIC_API_KEY`
- Value: wklej swój klucz z console.anthropic.com
- Add

### 4. Deploy

- Kliknij "Deploy"
- Poczekaj ~1-2 minuty
- Dostaniesz link typu `dziennik-kalorii-xyz.vercel.app`

### 5. Zainstaluj na telefonie jak appkę

- Otwórz link w Safari (iPhone) albo Chrome (Android)
- Safari: przycisk Udostępnij → "Dodaj do ekranu głównego"
- Chrome: menu (⋮) → "Dodaj do ekranu głównego"

Gotowe — masz ikonkę jak zwykła appka, działa bez otwierania Claude.

## Ważne ograniczenia tej wersji

- **Dane są tylko w tej przeglądarce, na tym urządzeniu.** Wyczyszczenie
  danych przeglądarki = utrata danych. Rób regularny eksport (przycisk
  "Eksportuj" w apce) jako backup.
- Jeśli zmienisz telefon, dane nie przejdą same — trzeba by dodać
  prawdziwą bazę danych (Supabase) zamiast localStorage. Mogę to
  dograć później, jeśli okaże się potrzebne.

## Aktualizacja w przyszłości

Jeśli zechcesz coś zmienić w apce (a zapewne zechcesz), wróć do mnie w
Claude z prośbą o zmianę, dostaniesz nowy `App.jsx` — podmieniasz plik
w repo na GitHub (edytuj plik bezpośrednio na stronie GitHub albo
wgraj nowy), Vercel przebuduje stronę automatycznie w ~1 minutę.
