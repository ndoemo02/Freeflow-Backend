# Migration Notes — Discovery Schema Extension

> Status: DRAFT — NOT EXECUTED
> Date: 2026-04-09
> Files: `stage-a-restaurants.sql`, `stage-b-menu-items-v2.sql`, `rollback.sql`

---

## Kolejność wykonania

```
stage-a-restaurants.sql       ← uruchom pierwszy (niezależny)
stage-b-menu-items-v2.sql     ← uruchom drugi (niezależny od Stage A)
rollback.sql                  ← tylko w razie cofnięcia (nie uruchamiać normalnie)
```

Stage A i Stage B są od siebie niezależne — można uruchomić jeden bez drugiego.

---

## Nullability — decyzje

| Kolumna | Tabela | Nullable? | Powód |
|---|---|---|---|
| `description` | restaurants | **YES** | Treść wypełniana przez operatorów — wiele starych rekordów jej nie ma |
| `price_level` | restaurants | NO | Default 2, constraint 1–4. Bezpieczny default dla starych rekordów |
| `supports_delivery` | restaurants | NO | Default FALSE — konserwatywny, nie mylący |
| `taxonomy_groups` | restaurants | NO | Default `{}` — pusty array = niesklasyfikowany, nie null |
| `taxonomy_cats` | restaurants | NO | j.w. |
| `taxonomy_tags` | restaurants | NO | j.w. |
| `opening_hours` | restaurants | **YES** | NULL = godziny nieznane → `open_now` pozostaje boost-only (jak teraz) |
| `base_name` | menu_items_v2 | **YES** | Backfill z `name` — musi być nullable jako punkt startowy |
| `item_family` | menu_items_v2 | **YES** | Większość pozycji menu nie należy do żadnej rodziny (NULL = OK) |
| `item_variant` | menu_items_v2 | **YES** | Większość rodzin nie ma trackowanych wariantów |
| `item_aliases` | menu_items_v2 | NO | Default `{}` — empty = fallback do runtime `buildItemAliases()` |
| `item_tags` | menu_items_v2 | NO | Default `{}` — brak tagów to inna informacja niż null |
| `dietary_flags` | menu_items_v2 | NO | j.w. |
| `popularity_score` | menu_items_v2 | NO | Default 0 — brak advantage, nie wykluczony z wyników |

---

## Backfill — kolejność po migracji

### Stage A — restaurants

| Krok | Skrypt | Typ | Kiedy |
|---|---|---|---|
| 1 | `backfill-restaurants-taxonomy.ts` | Auto | Zaraz po migracji — bezpieczny, idempotentny |
| 2 | Weryfikacja próbki (ręczna) | Manual | Po backfill, przed rozszerzeniem SELECT |
| 3 | Rozszerzenie SELECT w `repository.js` | Code change | Po weryfikacji |
| 4 | Indeksy `idx_restaurants_taxonomy_*` | SQL | Po backfill, oddzielny krok |
| 5 | Uzupełnienie `opening_hours` | Manual | Bez automatyzacji |

### Stage B — menu_items_v2

| Krok | Skrypt | Typ | Kiedy |
|---|---|---|---|
| 1 | `backfill-menu-base-names.ts` | Auto | Zaraz po migracji — tylko NULL rows |
| 2 | `backfill-menu-item-families.ts` | Semi-auto | Po kroku 1 — score >= 100 only |
| 3 | Manual review `item_family` | Manual | Dla wierszy poniżej progu lub bez matchów |
| 4 | Manual `item_aliases`, `item_tags`, `dietary_flags` | Manual | Grupowo po rodzinie |
| 5 | Indeksy `idx_menu_item_*` | SQL | Po kroku 4 — nie wcześniej |
| 6 | `popularity_score` | Analytics | Zewnętrzna zależność |

---

## Bezpieczeństwo rollbacku

- **Przed backfillem**: rollback jest w pełni czysty — DROP COLUMN usuwa tylko dodane kolumny
- **Po backfill, bez index**: rollback czyści dane, ale nie jest potrzebny — można zostawić kolumny puste
- **Po backfill, z index**: użyj _Safe Partial Rollback_ z `rollback.sql` (zerowanie zamiast DROP)
- `base_name` w `rollback.sql`: sprawdź najpierw czy istniała przed migracją — jeśli tak, usuń ją z listy DROP

---

## Co NIE jest w tej migracji

| Element | Powód pominięcia |
|---|---|
| `open_now` jako kolumna | Zawsze runtime — zależy od aktualnej godziny |
| Zmiana istniejących kolumn | Zero modyfikacji — additive only |
| Nowe tabele | Nie projektujemy bridge layer ani nowej tabeli |
| Trigger / function SQL | Taxonomy computation pozostaje w Node.js |
| RLS policies | Poza zakresem tej migracji |
