# PhraseGenerator — Architectural Contract
### FreeFlow / v1.0.1 / 2026-04-06

---

## Rola modułu

`PhraseGenerator.js` to jedyna warstwa LLM w ścieżce odpowiedzi.

Jego zadaniem jest wyłącznie **zmiana stylu** — przeformułowanie zdeterministycznie wygenerowanego tekstu (`SurfaceRenderer`) na naturalną mowę polską.

**PhraseGenerator nie podejmuje decyzji. Nie zmienia faktów. Nie generuje treści.**

---

## Zasada nadrzędna: FACTS ARE IMMUTABLE

Fakty wchodzące do PhraseGenerator (przez `facts` i `templateText`) są **niezmienne**.
Gemini/OpenAI może zmieniać tylko formę językową — nigdy treść.

To jest kontrakt architektoniczny, nie zalecenie.
Naruszenie skutkuje odrzuceniem output przez `validateParaphrase` i powrotem do template.

---

## Co PhraseGenerator MOŻE robić

| Dozwolone | Przykład |
|---|---|
| Zmienić szyk zdania | "Dodałam pizzę" → "Pizzę dodałam" |
| Ocieplić ton | "Dodano do koszyka" → "Dodałam do koszyka" |
| Skrócić | "W tej chwili mam dla ciebie" → "Mam" |
| Zmienić formę gramatyczną | "Vege Burger" → "Vege Burgera" (biernik) |
| Uprościć formę CTA | "Czy dodać do koszyka?" → "Dodać do koszyka?" |
| Uprościć formę CTA | "Czy potwierdzasz zamówienie?" → "Potwierdzamy?" |

---

## Co PhraseGenerator NIE MOŻE robić

| Zabronione | Przykład naruszenia |
|---|---|
| Zmieniać liczb | "25 zł" → "26 zł" ❌ |
| Zmieniać ilości | "2 pozycje" → "3 pozycje" ❌ |
| Zmieniać nazw własnych dań | "Vege Burger" → "wegetariański burger" ❌ |
| Zastępować nazwy restauracji zaimkiem | "w Starej Kamienicy" → "w tej restauracji" ❌ — szczególnie gdy nazwa jest częścią kontekstu akcji |
| Dopisywać nowych dań | dodanie pozycji której nie było w template ❌ |
| Dopisywać nowych cen | dodanie ceny której nie było w template ❌ |
| Dopisywać nowych restauracji | dodanie nazwy której nie było w template ❌ |
| Dodawać nowych pytań | template bez pytania → parafraz z nowym pytaniem ❌ |
| Zmieniać intencji pytania | "Dodać do koszyka?" → "Dodać do koszyka i potwierdzić?" ❌ |

---

## Mechanizmy egzekwowania kontraktu

### 1. System prompt (instrukcja LLM)
Explicit zasady w SYSTEM_PROMPT z przykładami dozwolonych i niedozwolonych transformacji.
Temperatura: `0.3` (niska — ogranicza kreatywność, wzmacnia precyzję).

### 2. validateParaphrase (programatyczna weryfikacja)
Po każdej odpowiedzi LLM, przed użyciem output:

```
a) Ekstrakcja wszystkich liczb z templateText
b) Weryfikacja że każda liczba z oryginału jest w parafrazie
c) Weryfikacja że parafraz nie zawiera liczb których nie było w oryginale
d) Weryfikacja liczby pytań (parafraz nie może DODAĆ pytania — może tylko uprościć formę istniejącego)
e) Weryfikacja długości — surface-aware:
     default:       max 40 słów, max 2 zdania
     DISH_DETAIL:   max 60 słów
     CART_SUMMARY:  max 60 słów
     MENU_OVERVIEW: max 55 słów
f) Weryfikacja named entities — ekstrakcja chronionych encji z facts:
     - nazwy dań (facts.dish, facts.items[].name, itp.)
     - nazwy restauracji (facts.restaurant.name, itp.)
     Każda encja obecna w templateText musi być obecna w parafrazie
     (case-insensitive, substring match — uwzględnia polską odmianę)
```

Jeśli którykolwiek check nie przejdzie → output odrzucony → fallback do template.
Każde odrzucenie logowane z `console.warn` + konkretna wartość która nie przeszła.

### 3. Fallback (SurfaceRenderer)
Każda ścieżka błędu wraca do deterministycznego template z `SurfaceRenderer`.
LLM nie jest wymagany do działania systemu — to warstwa stylistyczna, nie funkcjonalna.

---

## Granice modułu

```
INPUT (niezmienne, przychodzą z deterministycznego pipeline):
  templateText  — tekst wygenerowany przez SurfaceRenderer
  facts         — dane z sesji (ceny, dania, restauracje)
  surfaceKey    — klucz surface context

OUTPUT (tylko forma, nie treść):
  spokenText    — sparafrazowany tekst do TTS
  ssml          — SSML wrapper
  fromLLM       — bool czy LLM był użyty

NIE MA DOSTĘPU DO:
  session       — brak możliwości mutacji stanu
  intent        — nie może zmienić intencji
  FSM           — nie widzi FSM
```

---

## Kiedy PhraseGenerator jest aktywny

```
EXPERT_MODE=true   → PhraseGenerator aktywny
EXPERT_MODE=false  → PhraseGenerator pominięty, SurfaceRenderer bezpośrednio
NODE_ENV=test      → PhraseGenerator pominięty zawsze
skipLLM=true       → PhraseGenerator pominięty (per-call override)
```

---

## Pozycja w pipeline

```
SurfaceRenderer (deterministyczny)
  → templateText
    → PhraseGenerator (styl tylko)
      → validateParaphrase (fakty niezmienne?)
        TAK → spokenText do TTS
        NIE → fallback do templateText
```

---

## Historia kontraktu

| Wersja | Data | Zmiana |
|---|---|---|
| v1.0.1 | 2026-04-06 | Named entity guard (f), surface-aware word limits, CTA simplification rule, restaurant name pronoun ban |
| v1.0 | 2026-04-06 | Inicjalny kontrakt — immutable facts rule, walidacja liczb, temperatura 0.3 |
