# Raport z testów Chaos V2

| Status | Ilość |
|--------|-------|
| :white_check_mark: Zakończone sukcesem | 0 |
| :x: Zakończone błędem | 30 |
| :warning: Pomięte | 0 |

## Stabilność DEMO FLOW x5
Wykonano 15 iteracji pętli demowej. Z tego udane: 0. Flaky: 15

## Top 5 Fail Transcripts

### Scenariusz: A01 (Step 4)
- **Input:** "z ostrym sosem"
- **Expected (Allowed):** find_nearby, create_order, clarify_order
- **Actual Intent:** UNKNOWN_INTENT
- **Status Code:** 200
- **Error details:**
```json
{
  "ok": true,
  "session_id": "chaos-A01-1772145684057",
  "intent": "UNKNOWN_INTENT",
  "reply": "Mogę pokazać restauracje w pobliżu albo pomóc w wyborze dania.",
  "should_reply": true,
  "stopTTS": false,
  "meta": {
    "source": "safe_unknown_handler"
  }
}
```

### Scenariusz: A02 (Step 4)
- **Input:** "z ostrym sosem"
- **Expected (Allowed):** find_nearby, create_order, clarify_order
- **Actual Intent:** UNKNOWN_INTENT
- **Status Code:** 200
- **Error details:**
```json
{
  "ok": true,
  "session_id": "chaos-A02-1772145696357",
  "intent": "UNKNOWN_INTENT",
  "reply": "Mogę pokazać restauracje w pobliżu albo pomóc w wyborze dania.",
  "should_reply": true,
  "stopTTS": false,
  "meta": {
    "source": "safe_unknown_handler"
  }
}
```

### Scenariusz: A03 (Step 4)
- **Input:** "z ostrym sosem"
- **Expected (Allowed):** find_nearby, create_order, clarify_order
- **Actual Intent:** UNKNOWN_INTENT
- **Status Code:** 200
- **Error details:**
```json
{
  "ok": true,
  "session_id": "chaos-A03-1772145702532",
  "intent": "UNKNOWN_INTENT",
  "reply": "Mogę pokazać restauracje w pobliżu albo pomóc w wyborze dania.",
  "should_reply": true,
  "stopTTS": false,
  "meta": {
    "source": "safe_unknown_handler"
  }
}
```

### Scenariusz: A04 (Step 4)
- **Input:** "z ostrym sosem"
- **Expected (Allowed):** find_nearby, create_order, clarify_order
- **Actual Intent:** UNKNOWN_INTENT
- **Status Code:** 200
- **Error details:**
```json
{
  "ok": true,
  "session_id": "chaos-A04-1772145708827",
  "intent": "UNKNOWN_INTENT",
  "reply": "Mogę pokazać restauracje w pobliżu albo pomóc w wyborze dania.",
  "should_reply": true,
  "stopTTS": false,
  "meta": {
    "source": "safe_unknown_handler"
  }
}
```

### Scenariusz: A05 (Step 4)
- **Input:** "z ostrym sosem"
- **Expected (Allowed):** find_nearby, create_order, clarify_order
- **Actual Intent:** UNKNOWN_INTENT
- **Status Code:** 200
- **Error details:**
```json
{
  "ok": true,
  "session_id": "chaos-A05-1772145714529",
  "intent": "UNKNOWN_INTENT",
  "reply": "Mogę pokazać restauracje w pobliżu albo pomóc w wyborze dania.",
  "should_reply": true,
  "stopTTS": false,
  "meta": {
    "source": "safe_unknown_handler"
  }
}
```

