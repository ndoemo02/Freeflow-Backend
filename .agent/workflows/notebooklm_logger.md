---
description: Aktualizacja dokumentacji w Notatniku Freeflow (NotebookLM)
---
Należy uaktualniać ten notatnik za pomocą narzędzi MCP NotebookLM każdorazowo po wprowadzeniu istotnych zmian w projekcie (przy każdym zakończeniu "tasku"). 

### Krok po kroku:
1. Pobierz ID notatnika z tytułem "Freeflow" używając: `mcp_notebooklm_notebook_list`.
2. Stwórz nową lub zaktualizuj istniejącą notatkę, podając zwięzły opis co zostało zaimplementowane, naprawione bądź zmienione. 
3. Użyj narzędzia: `mcp_notebooklm_note(notebook_id="TWÓJ_ID", action="create", title="Podsumowanie zmian z [Data]", content="[Szczegóły...]")`
4. Sprawdź, czy notatka została zapisana pomyślnie.
