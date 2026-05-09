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
- **Actual Intent:** safety_guard_blocked
- **Status Code:** 200
- **Error details:**
```json
{
  "ok": true,
  "session_id": "chaos-A01-1778238637094",
  "intent": "safety_guard_blocked",
  "reply": "Pomagam w zamówieniu. Powiedz proszę, co chcesz dodać lub zmienić.",
  "should_reply": true,
  "stopTTS": false,
  "meta": {
    "source": "intent_whitelist_block"
  },
  "context": {
    "status": "active",
    "closedReason": null,
    "closedAt": null,
    "conversationPhase": "idle",
    "expectedContext": "neutral",
    "lastIntent": "find_nearby",
    "lastRestaurant": null,
    "lastRestaurantsList": [],
    "lastRestaurants": [],
    "lastRestaurantsTimestamp": null,
    "lastMenu": [],
    "locationOverride": null,
    "history": [],
    "pendingDish": null,
    "awaiting": null,
    "pendingOrder": null,
    "turnBuffer": [
      {
        "role": "assistant",
        "text": "Mam problem z bazą danych. Spróbuj później.",
        "surfaceKey": null,
        "entities": {
          "restaurants": [],
          "menuItems": []
        },
        "timestamp": 1778238637933
      },
      {
        "role": "user",
        "text": "a jakie mają oceny te pizzerie?",
        "entities": {
          "intent": "find_nearby",
          "entities": {
            "location": null,
            "cuisine": "Pizzeria",
            "quantity": 1,
            "restaurant": null,
            "restaurantId": null,
            "dish": null,
            "items": null
          }
        },
        "timestamp": 1778238638162
      },
      {
        "role": "assistant",
        "text": "Mam problem z bazą danych. Spróbuj później.",
        "surfaceKey": null,
        "entities": {
          "restaurants": [],
          "menuItems": []
        },
        "timestamp": 1778238638305
      },
      {
        "role": "user",
        "text": "właściwie to zmieniłem zdanie, wolałbym kebaba",
        "entities": {
          "intent": "find_nearby",
          "entities": {
            "location": null,
            "cuisine": "Kebab",
            "quantity": 1,
            "restaurant": null,
            "restaurantId": null,
            "dish": "kebab",
            "items": null
          }
        },
        "timestamp": 1778238638471
      },
      {
        "role": "assistant",
        "text": "Mam problem z bazą danych. Spróbuj później.",
        "surfaceKey": null,
        "entities": {
          "restaurants": [],
          "menuItems": []
        },
        "timestamp": 1778238638768
      }
    ],
    "entityCache": {
      "restaurants": [],
      "items": [],
      "lastListType": null
    },
    "currentRestaurant": null,
    "lockedRestaurantId": null,
    "lastUpdated": 1778238638471,
    "orderMode": "neutral"
  }
}
```

### Scenariusz: A02 (Step 4)
- **Input:** "z ostrym sosem"
- **Expected (Allowed):** find_nearby, create_order, clarify_order
- **Actual Intent:** safety_guard_blocked
- **Status Code:** 200
- **Error details:**
```json
{
  "ok": true,
  "session_id": "chaos-A02-1778238639758",
  "intent": "safety_guard_blocked",
  "reply": "Pomagam w zamówieniu. Powiedz proszę, co chcesz dodać lub zmienić.",
  "should_reply": true,
  "stopTTS": false,
  "meta": {
    "source": "intent_whitelist_block"
  },
  "context": {
    "status": "active",
    "closedReason": null,
    "closedAt": null,
    "conversationPhase": "idle",
    "expectedContext": "neutral",
    "lastIntent": "find_nearby",
    "lastRestaurant": null,
    "lastRestaurantsList": [],
    "lastRestaurants": [],
    "lastRestaurantsTimestamp": null,
    "lastMenu": [],
    "locationOverride": null,
    "history": [],
    "pendingDish": null,
    "awaiting": null,
    "pendingOrder": null,
    "turnBuffer": [
      {
        "role": "assistant",
        "text": "Mam problem z bazą danych. Spróbuj później.",
        "surfaceKey": null,
        "entities": {
          "restaurants": [],
          "menuItems": []
        },
        "timestamp": 1778238640269
      },
      {
        "role": "user",
        "text": "a jakie mają oceny te pizzerie?",
        "entities": {
          "intent": "find_nearby",
          "entities": {
            "location": null,
            "cuisine": "Pizzeria",
            "quantity": 1,
            "restaurant": null,
            "restaurantId": null,
            "dish": null,
            "items": null
          }
        },
        "timestamp": 1778238640474
      },
      {
        "role": "assistant",
        "text": "Mam problem z bazą danych. Spróbuj później.",
        "surfaceKey": null,
        "entities": {
          "restaurants": [],
          "menuItems": []
        },
        "timestamp": 1778238640598
      },
      {
        "role": "user",
        "text": "właściwie to zmieniłem zdanie, wolałbym kebaba",
        "entities": {
          "intent": "find_nearby",
          "entities": {
            "location": null,
            "cuisine": "Kebab",
            "quantity": 1,
            "restaurant": null,
            "restaurantId": null,
            "dish": "kebab",
            "items": null
          }
        },
        "timestamp": 1778238640823
      },
      {
        "role": "assistant",
        "text": "Mam problem z bazą danych. Spróbuj później.",
        "surfaceKey": null,
        "entities": {
          "restaurants": [],
          "menuItems": []
        },
        "timestamp": 1778238641071
      }
    ],
    "entityCache": {
      "restaurants": [],
      "items": [],
      "lastListType": null
    },
    "currentRestaurant": null,
    "lockedRestaurantId": null,
    "lastUpdated": 1778238640823,
    "orderMode": "neutral"
  }
}
```

### Scenariusz: A03 (Step 4)
- **Input:** "z ostrym sosem"
- **Expected (Allowed):** find_nearby, create_order, clarify_order
- **Actual Intent:** safety_guard_blocked
- **Status Code:** 200
- **Error details:**
```json
{
  "ok": true,
  "session_id": "chaos-A03-1778238641941",
  "intent": "safety_guard_blocked",
  "reply": "Pomagam w zamówieniu. Powiedz proszę, co chcesz dodać lub zmienić.",
  "should_reply": true,
  "stopTTS": false,
  "meta": {
    "source": "intent_whitelist_block"
  },
  "context": {
    "status": "active",
    "closedReason": null,
    "closedAt": null,
    "conversationPhase": "idle",
    "expectedContext": "neutral",
    "lastIntent": "find_nearby",
    "lastRestaurant": null,
    "lastRestaurantsList": [],
    "lastRestaurants": [],
    "lastRestaurantsTimestamp": null,
    "lastMenu": [],
    "locationOverride": null,
    "history": [],
    "pendingDish": null,
    "awaiting": null,
    "pendingOrder": null,
    "turnBuffer": [
      {
        "role": "assistant",
        "text": "Mam problem z bazą danych. Spróbuj później.",
        "surfaceKey": null,
        "entities": {
          "restaurants": [],
          "menuItems": []
        },
        "timestamp": 1778238642496
      },
      {
        "role": "user",
        "text": "a jakie mają oceny te pizzerie?",
        "entities": {
          "intent": "find_nearby",
          "entities": {
            "location": null,
            "cuisine": "Pizzeria",
            "quantity": 1,
            "restaurant": null,
            "restaurantId": null,
            "dish": null,
            "items": null
          }
        },
        "timestamp": 1778238642656
      },
      {
        "role": "assistant",
        "text": "Mam problem z bazą danych. Spróbuj później.",
        "surfaceKey": null,
        "entities": {
          "restaurants": [],
          "menuItems": []
        },
        "timestamp": 1778238642770
      },
      {
        "role": "user",
        "text": "właściwie to zmieniłem zdanie, wolałbym kebaba",
        "entities": {
          "intent": "find_nearby",
          "entities": {
            "location": null,
            "cuisine": "Kebab",
            "quantity": 1,
            "restaurant": null,
            "restaurantId": null,
            "dish": "kebab",
            "items": null
          }
        },
        "timestamp": 1778238642992
      },
      {
        "role": "assistant",
        "text": "Mam problem z bazą danych. Spróbuj później.",
        "surfaceKey": null,
        "entities": {
          "restaurants": [],
          "menuItems": []
        },
        "timestamp": 1778238643288
      }
    ],
    "entityCache": {
      "restaurants": [],
      "items": [],
      "lastListType": null
    },
    "currentRestaurant": null,
    "lockedRestaurantId": null,
    "lastUpdated": 1778238642992,
    "orderMode": "neutral"
  }
}
```

### Scenariusz: A04 (Step 4)
- **Input:** "z ostrym sosem"
- **Expected (Allowed):** find_nearby, create_order, clarify_order
- **Actual Intent:** safety_guard_blocked
- **Status Code:** 200
- **Error details:**
```json
{
  "ok": true,
  "session_id": "chaos-A04-1778238643980",
  "intent": "safety_guard_blocked",
  "reply": "Pomagam w zamówieniu. Powiedz proszę, co chcesz dodać lub zmienić.",
  "should_reply": true,
  "stopTTS": false,
  "meta": {
    "source": "intent_whitelist_block"
  },
  "context": {
    "status": "active",
    "closedReason": null,
    "closedAt": null,
    "conversationPhase": "idle",
    "expectedContext": "neutral",
    "lastIntent": "find_nearby",
    "lastRestaurant": null,
    "lastRestaurantsList": [],
    "lastRestaurants": [],
    "lastRestaurantsTimestamp": null,
    "lastMenu": [],
    "locationOverride": null,
    "history": [],
    "pendingDish": null,
    "awaiting": null,
    "pendingOrder": null,
    "turnBuffer": [
      {
        "role": "assistant",
        "text": "Mam problem z bazą danych. Spróbuj później.",
        "surfaceKey": null,
        "entities": {
          "restaurants": [],
          "menuItems": []
        },
        "timestamp": 1778238644488
      },
      {
        "role": "user",
        "text": "a jakie mają oceny te pizzerie?",
        "entities": {
          "intent": "find_nearby",
          "entities": {
            "location": null,
            "cuisine": "Pizzeria",
            "quantity": 1,
            "restaurant": null,
            "restaurantId": null,
            "dish": null,
            "items": null
          }
        },
        "timestamp": 1778238644621
      },
      {
        "role": "assistant",
        "text": "Mam problem z bazą danych. Spróbuj później.",
        "surfaceKey": null,
        "entities": {
          "restaurants": [],
          "menuItems": []
        },
        "timestamp": 1778238644733
      },
      {
        "role": "user",
        "text": "właściwie to zmieniłem zdanie, wolałbym kebaba",
        "entities": {
          "intent": "find_nearby",
          "entities": {
            "location": null,
            "cuisine": "Kebab",
            "quantity": 1,
            "restaurant": null,
            "restaurantId": null,
            "dish": "kebab",
            "items": null
          }
        },
        "timestamp": 1778238644889
      },
      {
        "role": "assistant",
        "text": "Mam problem z bazą danych. Spróbuj później.",
        "surfaceKey": null,
        "entities": {
          "restaurants": [],
          "menuItems": []
        },
        "timestamp": 1778238645197
      }
    ],
    "entityCache": {
      "restaurants": [],
      "items": [],
      "lastListType": null
    },
    "currentRestaurant": null,
    "lockedRestaurantId": null,
    "lastUpdated": 1778238644889,
    "orderMode": "neutral"
  }
}
```

### Scenariusz: A05 (Step 4)
- **Input:** "z ostrym sosem"
- **Expected (Allowed):** find_nearby, create_order, clarify_order
- **Actual Intent:** safety_guard_blocked
- **Status Code:** 200
- **Error details:**
```json
{
  "ok": true,
  "session_id": "chaos-A05-1778238646041",
  "intent": "safety_guard_blocked",
  "reply": "Pomagam w zamówieniu. Powiedz proszę, co chcesz dodać lub zmienić.",
  "should_reply": true,
  "stopTTS": false,
  "meta": {
    "source": "intent_whitelist_block"
  },
  "context": {
    "status": "active",
    "closedReason": null,
    "closedAt": null,
    "conversationPhase": "idle",
    "expectedContext": "neutral",
    "lastIntent": "find_nearby",
    "lastRestaurant": null,
    "lastRestaurantsList": [],
    "lastRestaurants": [],
    "lastRestaurantsTimestamp": null,
    "lastMenu": [],
    "locationOverride": null,
    "history": [],
    "pendingDish": null,
    "awaiting": null,
    "pendingOrder": null,
    "turnBuffer": [
      {
        "role": "assistant",
        "text": "Mam problem z bazą danych. Spróbuj później.",
        "surfaceKey": null,
        "entities": {
          "restaurants": [],
          "menuItems": []
        },
        "timestamp": 1778238646777
      },
      {
        "role": "user",
        "text": "a jakie mają oceny te pizzerie?",
        "entities": {
          "intent": "find_nearby",
          "entities": {
            "location": null,
            "cuisine": "Pizzeria",
            "quantity": 1,
            "restaurant": null,
            "restaurantId": null,
            "dish": null,
            "items": null
          }
        },
        "timestamp": 1778238646919
      },
      {
        "role": "assistant",
        "text": "Mam problem z bazą danych. Spróbuj później.",
        "surfaceKey": null,
        "entities": {
          "restaurants": [],
          "menuItems": []
        },
        "timestamp": 1778238647051
      },
      {
        "role": "user",
        "text": "właściwie to zmieniłem zdanie, wolałbym kebaba",
        "entities": {
          "intent": "find_nearby",
          "entities": {
            "location": null,
            "cuisine": "Kebab",
            "quantity": 1,
            "restaurant": null,
            "restaurantId": null,
            "dish": "kebab",
            "items": null
          }
        },
        "timestamp": 1778238647224
      },
      {
        "role": "assistant",
        "text": "Mam problem z bazą danych. Spróbuj później.",
        "surfaceKey": null,
        "entities": {
          "restaurants": [],
          "menuItems": []
        },
        "timestamp": 1778238647498
      }
    ],
    "entityCache": {
      "restaurants": [],
      "items": [],
      "lastListType": null
    },
    "currentRestaurant": null,
    "lockedRestaurantId": null,
    "lastUpdated": 1778238647224,
    "orderMode": "neutral"
  }
}
```

