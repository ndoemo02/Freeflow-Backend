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
- **Actual Intent:** select_restaurant
- **Status Code:** 200
- **Error details:**
```json
{
  "ok": true,
  "session_id": "chaos-A01-1777972818321",
  "text": "Nie wiem którą restaurację z listy masz na myśli. Wybierz numer od 1 do 4 lub powiedz \"cofnij\".",
  "reply": "Nie wiem którą restaurację z listy masz na myśli. Wybierz numer od 1 do 4 lub powiedz \"cofnij\".",
  "tts_text": "Nie wiem którą restaurację z listy masz na myśli. Wybierz numer od 1 do 4 lub powiedz \"cofnij\".",
  "audioContent": null,
  "intent": "select_restaurant",
  "phase": "idle",
  "should_reply": true,
  "actions": [],
  "restaurants": [],
  "menuItems": [],
  "menu": [],
  "cart": {
    "items": [],
    "total": 0
  },
  "recommendations": [],
  "meta": {
    "latency_total_ms": 98,
    "source": "context_lock",
    "styling_ms": 1,
    "tts_ms": 0,
    "cartHash": "empty",
    "state": {
      "conversationPhase": "idle",
      "currentRestaurant": null,
      "orderMode": "restaurant_selected"
    },
    "checkoutProgress": {
      "requiredFields": [
        "name",
        "phone",
        "address"
      ],
      "filledFields": [],
      "missingFields": [
        "name",
        "phone",
        "address"
      ],
      "completion": 0,
      "complete": false,
      "readyToSubmit": false,
      "cartItems": 0,
      "cartTotal": 0,
      "draft": {
        "name": "",
        "phone": "",
        "address": "",
        "notes": ""
      }
    },
    "guard_trace": [
      "preNluOverrideGuard",
      "transactionLockGuard",
      "orderingAffirmationGuard",
      "escapeOverrideGuard",
      "expectedContextGuard",
      "confidenceFloorGuard",
      "smartUnlockGuard",
      "continuityGuard",
      "strongContinuityGuard",
      "floatingOrderCleanupGuard",
      "cartMutationGuard",
      "uxGuard1",
      "uxGuard2",
      "confirmGuard"
    ],
    "pipeline_trace": [
      "hydrated",
      "menu_loaded",
      "intent_resolved:select_restaurant",
      "guard_override:none",
      "intent_finalized:select_restaurant",
      "handler:select_restaurant",
      "order_mode_event:SELECT_RESTAURANT",
      "order_mode_state:neutral->restaurant_selected",
      "ORDER_MODE_TRACE:{\"previousState\":\"neutral\",\"event\":\"SELECT_RESTAURANT\",\"nextState\":\"restaurant_selected\",\"allowed\":true,\"changed\":true,\"intent\":\"select_restaurant\"}",
      "CHECKOUT_PROGRESS_TRACE:{\"phase\":\"idle\",\"completion\":0,\"complete\":false,\"readyToSubmit\":false,\"missingFields\":[\"name\",\"phone\",\"address\"]}",
      "CART_EVENT_TRACE:{\"emitted\":false,\"stateMutationCompleted\":true,\"intent\":\"select_restaurant\",\"detectedBy\":\"whitelist\",\"pre\":{\"itemCount\":0,\"total\":0},\"post\":{\"itemCount\":0,\"total\":0},\"cartVersion\":null,\"totalItems\":null,\"totalPrice\":null}",
      "reco_skipped:general:state_ok"
    ],
    "orderModeTrace": {
      "previousState": "neutral",
      "event": "SELECT_RESTAURANT",
      "nextState": "restaurant_selected",
      "allowed": true,
      "changed": true,
      "intent": "select_restaurant"
    },
    "ORDER_MODE_TRACE": {
      "previousState": "neutral",
      "event": "SELECT_RESTAURANT",
      "nextState": "restaurant_selected",
      "allowed": true,
      "changed": true,
      "intent": "select_restaurant"
    },
    "checkoutProgressTrace": {
      "phase": "idle",
      "completion": 0,
      "complete": false,
      "readyToSubmit": false,
      "missingFields": [
        "name",
        "phone",
        "address"
      ]
    },
    "CHECKOUT_PROGRESS_TRACE": {
      "phase": "idle",
      "completion": 0,
      "complete": false,
      "readyToSubmit": false,
      "missingFields": [
        "name",
        "phone",
        "address"
      ]
    },
    "cartEventTrace": {
      "emitted": false,
      "stateMutationCompleted": true,
      "intent": "select_restaurant",
      "detectedBy": "whitelist",
      "pre": {
        "itemCount": 0,
        "total": 0
      },
      "post": {
        "itemCount": 0,
        "total": 0
      },
      "cartVersion": null,
      "totalItems": null,
      "totalPrice": null
    },
    "CART_EVENT_TRACE": {
      "emitted": false,
      "stateMutationCompleted": true,
      "intent": "select_restaurant",
      "detectedBy": "whitelist",
      "pre": {
        "itemCount": 0,
        "total": 0
      },
      "post": {
        "itemCount": 0,
        "total": 0
      },
      "cartVersion": null,
      "totalItems": null,
      "totalPrice": null
    },
    "recoContext": {
      "context": "browsing_menu",
      "mode": "ok",
      "reason": "menu_browsing",
      "cooldownRemainingMs": 0
    }
  },
  "context": {
    "status": "active",
    "closedReason": null,
    "closedAt": null,
    "conversationPhase": "idle",
    "expectedContext": null,
    "lastIntent": "select_restaurant",
    "lastRestaurant": null,
    "lastRestaurantsList": [],
    "lastRestaurants": [
      {
        "id": "[redacted]",
        "name": "Tasty King Kebab",
        "index": 1,
        "city": "Piekary Śląskie"
      },
      {
        "id": "[redacted]",
        "name": "Dwór Hubertus",
        "index": 2,
        "city": "Piekary Śląskie"
      },
      {
        "id": "[redacted]",
        "name": "Callzone",
        "index": 3,
        "city": "Piekary Śląskie"
      },
      {
        "id": "[redacted]",
        "name": "Klaps Burgers",
        "index": 4,
        "city": "Piekary Śląskie"
      }
    ],
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
        "text": "Mam 2 miejsc w Piekary Śląskie. Którą restaurację wybierasz? (Możesz powiedzieć numer albo nazwę.)",
        "surfaceKey": "CHOOSE_RESTAURANT",
        "entities": {
          "restaurants": [
            {
              "id": "[redacted]",
              "name": "Pizzeria Monte Carlo",
              "address": "Ul. Stanisława Maczka 22",
              "city": "Piekary Śląskie",
              "cuisine_type": null,
              "lat": null,
              "lng": null,
              "delivery_available": true,
              "price_level": 2,
              "taxonomy_groups": [
                "pizza_italian"
              ],
              "taxonomy_cats": [
                "pizza"
              ],
              "taxonomy_tags": [
                "delivery"
              ],
              "maps_rating": 4.3,
              "maps_ratings_total": 1675,
              "opening_hours": {
                "periods": [
                  {
                    "open": {
                      "day": 0,
                      "time": "1100"
                    },
                    "close": {
                      "day": 0,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 1,
                      "time": "1100"
                    },
                    "close": {
                      "day": 1,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 2,
                      "time": "1100"
                    },
                    "close": {
                      "day": 2,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 3,
                      "time": "1100"
                    },
                    "close": {
                      "day": 3,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 4,
                      "time": "1100"
                    },
                    "close": {
                      "day": 4,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 5,
                      "time": "1100"
                    },
                    "close": {
                      "day": 6,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 6,
                      "time": "1100"
                    },
                    "close": {
                      "day": 0,
                      "time": "0000"
                    }
                  }
                ],
                "open_now": true,
                "weekday_text": [
                  "Monday: 11:00 AM – 11:00 PM",
                  "Tuesday: 11:00 AM – 11:00 PM",
                  "Wednesday: 11:00 AM – 11:00 PM",
                  "Thursday: 11:00 AM – 11:00 PM",
                  "Friday: 11:00 AM – 12:00 AM",
                  "Saturday: 11:00 AM – 12:00 AM",
                  "Sunday: 11:00 AM – 11:00 PM"
                ]
              },
              "phone": "515 532 617",
              "website": "http://piekary.pubmontecarlo.pl/",
              "image_url": "/images/restaurants/83566974-1017-4408-90ee-2571ccc06978.jpg",
              "photo_gallery": [
                "/images/restaurants/83566974-1017-4408-90ee-2571ccc06978.jpg",
                "/images/restaurants/83566974-1017-4408-90ee-2571ccc06978_1.jpg",
                "/images/restaurants/83566974-1017-4408-90ee-2571ccc06978_2.jpg",
                "/images/restaurants/83566974-1017-4408-90ee-2571ccc06978_3.jpg",
                "/images/restaurants/83566974-1017-4408-90ee-2571ccc06978_4.jpg"
              ]
            },
            {
              "id": "[redacted]",
              "name": "Callzone",
              "address": "ul. Księdza Piotra Skargi 3",
              "city": "Piekary Śląskie",
              "cuisine_type": "Pizzeria",
              "lat": 50.38594,
              "lng": 18.95647,
              "delivery_available": true,
              "price_level": 2,
              "taxonomy_groups": [
                "pizza_italian"
              ],
              "taxonomy_cats": [
                "pizza"
              ],
              "taxonomy_tags": [
                "delivery"
              ],
              "maps_rating": 4.2,
              "maps_ratings_total": 1452,
              "opening_hours": {
                "periods": [
                  {
                    "open": {
                      "day": 0,
                      "time": "1200"
                    },
                    "close": {
                      "day": 0,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 1,
                      "time": "1200"
                    },
                    "close": {
                      "day": 1,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 2,
                      "time": "1200"
                    },
                    "close": {
                      "day": 2,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 3,
                      "time": "1200"
                    },
                    "close": {
                      "day": 3,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 4,
                      "time": "1200"
                    },
                    "close": {
                      "day": 4,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 5,
                      "time": "1200"
                    },
                    "close": {
                      "day": 5,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 6,
                      "time": "1200"
                    },
                    "close": {
                      "day": 6,
                      "time": "2300"
                    }
                  }
                ],
                "open_now": true,
                "weekday_text": [
                  "Monday: 12:00 – 10:00 PM",
                  "Tuesday: 12:00 – 10:00 PM",
                  "Wednesday: 12:00 – 10:00 PM",
                  "Thursday: 12:00 – 10:00 PM",
                  "Friday: 12:00 – 11:00 PM",
                  "Saturday: 12:00 – 11:00 PM",
                  "Sunday: 12:00 – 10:00 PM"
                ]
              },
              "phone": "32 288 64 71",
              "website": "http://kallzone.pl/",
              "image_url": "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70.jpg",
              "photo_gallery": [
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_1.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_2.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_3.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_4.jpg"
              ]
            }
          ],
          "menuItems": []
        },
        "timestamp": 1777972820617
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
        "timestamp": 1777972820734
      },
      {
        "role": "assistant",
        "text": "Mam 4 miejsc w Piekary Śląskie. Którą restaurację wybierasz? (Możesz powiedzieć numer albo nazwę.)",
        "surfaceKey": "CHOOSE_RESTAURANT",
        "entities": {
          "restaurants": [
            {
              "id": "[redacted]",
              "name": "Tasty King Kebab",
              "address": "ul. Bytomska 70",
              "city": "Piekary Śląskie",
              "cuisine_type": "Kebab",
              "lat": 50.38587,
              "lng": 18.94712,
              "delivery_available": true,
              "price_level": 2,
              "taxonomy_groups": [
                "grill"
              ],
              "taxonomy_cats": [
                "kebab"
              ],
              "taxonomy_tags": [
                "delivery"
              ],
              "maps_rating": 4.2,
              "maps_ratings_total": 1238,
              "opening_hours": {
                "periods": [
                  {
                    "open": {
                      "day": 0,
                      "time": "1000"
                    },
                    "close": {
                      "day": 1,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 1,
                      "time": "1000"
                    },
                    "close": {
                      "day": 2,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 2,
                      "time": "1000"
                    },
                    "close": {
                      "day": 3,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 3,
                      "time": "1000"
                    },
                    "close": {
                      "day": 4,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 4,
                      "time": "1000"
                    },
                    "close": {
                      "day": 5,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 5,
                      "time": "1000"
                    },
                    "close": {
                      "day": 6,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 6,
                      "time": "1000"
                    },
                    "close": {
                      "day": 0,
                      "time": "0000"
                    }
                  }
                ],
                "open_now": true,
                "weekday_text": [
                  "Monday: 10:00 AM – 12:00 AM",
                  "Tuesday: 10:00 AM – 12:00 AM",
                  "Wednesday: 10:00 AM – 12:00 AM",
                  "Thursday: 10:00 AM – 12:00 AM",
                  "Friday: 10:00 AM – 12:00 AM",
                  "Saturday: 10:00 AM – 12:00 AM",
                  "Sunday: 10:00 AM – 12:00 AM"
                ]
              },
              "phone": "729 324 218",
              "website": null,
              "image_url": "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7.jpg",
              "photo_gallery": [
                "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7.jpg",
                "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_1.jpg",
                "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_2.jpg",
                "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_3.jpg",
                "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_4.jpg"
              ],
              "item_match_score": 140,
              "matched_menu_items": [
                "Pita Rollo",
                "Kebab amerykański",
                "Pita Rollo z serem"
              ]
            },
            {
              "id": "[redacted]",
              "name": "Dwór Hubertus",
              "address": "ul. Inwalidów Wojennych 72",
              "city": "Piekary Śląskie",
              "cuisine_type": "Śląska / Europejska",
              "lat": 50.39233,
              "lng": 18.94243,
              "delivery_available": true,
              "price_level": 2,
              "taxonomy_groups": [],
              "taxonomy_cats": [],
              "taxonomy_tags": [
                "delivery"
              ],
              "maps_rating": 4.2,
              "maps_ratings_total": 785,
              "opening_hours": {
                "periods": [
                  {
                    "open": {
                      "day": 0,
                      "time": "1200"
                    },
                    "close": {
                      "day": 0,
                      "time": "2000"
                    }
                  },
                  {
                    "open": {
                      "day": 1,
                      "time": "1100"
                    },
                    "close": {
                      "day": 1,
                      "time": "2100"
                    }
                  },
                  {
                    "open": {
                      "day": 2,
                      "time": "1100"
                    },
                    "close": {
                      "day": 2,
                      "time": "2100"
                    }
                  },
                  {
                    "open": {
                      "day": 3,
                      "time": "1100"
                    },
                    "close": {
                      "day": 3,
                      "time": "2100"
                    }
                  },
                  {
                    "open": {
                      "day": 4,
                      "time": "1100"
                    },
                    "close": {
                      "day": 4,
                      "time": "2100"
                    }
                  },
                  {
                    "open": {
                      "day": 5,
                      "time": "1100"
                    },
                    "close": {
                      "day": 5,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 6,
                      "time": "1100"
                    },
                    "close": {
                      "day": 6,
                      "time": "2200"
                    }
                  }
                ],
                "open_now": true,
                "weekday_text": [
                  "Monday: 11:00 AM – 9:00 PM",
                  "Tuesday: 11:00 AM – 9:00 PM",
                  "Wednesday: 11:00 AM – 9:00 PM",
                  "Thursday: 11:00 AM – 9:00 PM",
                  "Friday: 11:00 AM – 10:00 PM",
                  "Saturday: 11:00 AM – 10:00 PM",
                  "Sunday: 12:00 – 8:00 PM"
                ]
              },
              "phone": "32 767 85 55",
              "website": "https://dworhubertus.pl/",
              "image_url": "/images/restaurants/af8448ef-974b-46c8-a4ae-b04b8dc7c9f8.jpg",
              "photo_gallery": null,
              "item_match_score": 140,
              "matched_menu_items": [
                "Gyros z frytkami i tzatziki"
              ]
            },
            {
              "id": "[redacted]",
              "name": "Callzone",
              "address": "ul. Księdza Piotra Skargi 3",
              "city": "Piekary Śląskie",
              "cuisine_type": "Pizzeria",
              "lat": 50.38594,
              "lng": 18.95647,
              "delivery_available": true,
              "price_level": 2,
              "taxonomy_groups": [
                "pizza_italian"
              ],
              "taxonomy_cats": [
                "pizza"
              ],
              "taxonomy_tags": [
                "delivery"
              ],
              "maps_rating": 4.2,
              "maps_ratings_total": 1452,
              "opening_hours": {
                "periods": [
                  {
                    "open": {
                      "day": 0,
                      "time": "1200"
                    },
                    "close": {
                      "day": 0,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 1,
                      "time": "1200"
                    },
                    "close": {
                      "day": 1,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 2,
                      "time": "1200"
                    },
                    "close": {
                      "day": 2,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 3,
                      "time": "1200"
                    },
                    "close": {
                      "day": 3,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 4,
                      "time": "1200"
                    },
                    "close": {
                      "day": 4,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 5,
                      "time": "1200"
                    },
                    "close": {
                      "day": 5,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 6,
                      "time": "1200"
                    },
                    "close": {
                      "day": 6,
                      "time": "2300"
                    }
                  }
                ],
                "open_now": true,
                "weekday_text": [
                  "Monday: 12:00 – 10:00 PM",
                  "Tuesday: 12:00 – 10:00 PM",
                  "Wednesday: 12:00 – 10:00 PM",
                  "Thursday: 12:00 – 10:00 PM",
                  "Friday: 12:00 – 11:00 PM",
                  "Saturday: 12:00 – 11:00 PM",
                  "Sunday: 12:00 – 10:00 PM"
                ]
              },
              "phone": "32 288 64 71",
              "website": "http://kallzone.pl/",
              "image_url": "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70.jpg",
              "photo_gallery": [
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_1.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_2.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_3.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_4.jpg"
              ],
              "item_match_score": 140,
              "matched_menu_items": [
                "Bowl Gyros-Halloumi"
              ]
            },
            {
              "id": "[redacted]",
              "name": "Klaps Burgers",
              "address": "ul. Piotra Skargi 15",
              "city": "Piekary Śląskie",
              "cuisine_type": "Amerykańska",
              "lat": 50.38643,
              "lng": 18.95422,
              "delivery_available": true,
              "price_level": 2,
              "taxonomy_groups": [
                "fast_food"
              ],
              "taxonomy_cats": [
                "burgers"
              ],
              "taxonomy_tags": [
                "quick",
                "delivery"
              ],
              "maps_rating": 4.3,
              "maps_ratings_total": 2693,
              "opening_hours": {
                "periods": [
                  {
                    "open": {
                      "day": 0,
                      "time": "1230"
                    },
                    "close": {
                      "day": 0,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 3,
                      "time": "1230"
                    },
                    "close": {
                      "day": 3,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 4,
                      "time": "1230"
                    },
                    "close": {
                      "day": 4,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 5,
                      "time": "1230"
                    },
                    "close": {
                      "day": 5,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 6,
                      "time": "1230"
                    },
                    "close": {
                      "day": 6,
                      "time": "2200"
                    }
                  }
                ],
                "open_now": true,
                "weekday_text": [
                  "Monday: Closed",
                  "Tuesday: Closed",
                  "Wednesday: 12:30 – 10:00 PM",
                  "Thursday: 12:30 – 10:00 PM",
                  "Friday: 12:30 – 10:00 PM",
                  "Saturday: 12:30 – 10:00 PM",
                  "Sunday: 12:30 – 10:00 PM"
                ]
              },
              "phone": "570 377 377",
              "website": "http://www.klapsbar.pl/",
              "image_url": "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea.jpg",
              "photo_gallery": [
                "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea.jpg",
                "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_1.jpg",
                "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_2.jpg",
                "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_3.jpg",
                "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_4.jpg"
              ],
              "item_match_score": 120,
              "matched_menu_items": [
                "Milczenie Wola"
              ]
            }
          ],
          "menuItems": []
        },
        "timestamp": 1777972821094
      },
      {
        "role": "user",
        "text": "z ostrym sosem",
        "entities": {
          "intent": "select_restaurant",
          "entities": {
            "location": null,
            "cuisine": null,
            "quantity": 1,
            "restaurant": null,
            "restaurantId": null,
            "dish": null,
            "items": null,
            "raw": "z ostrym sosem"
          }
        },
        "timestamp": 1777972821219
      },
      {
        "role": "assistant",
        "text": "Nie wiem którą restaurację z listy masz na myśli. Wybierz numer od 1 do 4 lub powiedz \"cofnij\".",
        "surfaceKey": null,
        "entities": {
          "restaurants": [],
          "menuItems": []
        },
        "timestamp": 1777972821223
      }
    ],
    "entityCache": {
      "restaurants": [
        {
          "id": "[redacted]",
          "name": "Tasty King Kebab",
          "position": 1,
          "timestamp": 1777972821094
        },
        {
          "id": "[redacted]",
          "name": "Dwór Hubertus",
          "position": 2,
          "timestamp": 1777972821094
        },
        {
          "id": "[redacted]",
          "name": "Callzone",
          "position": 3,
          "timestamp": 1777972821094
        },
        {
          "id": "[redacted]",
          "name": "Klaps Burgers",
          "position": 4,
          "timestamp": 1777972821094
        }
      ],
      "items": [],
      "lastListType": "restaurants"
    },
    "currentRestaurant": null,
    "lockedRestaurantId": null,
    "lastUpdated": 1777972821220,
    "last_location": "Piekary Śląskie",
    "last_restaurants_list": [
      {
        "id": "[redacted]",
        "name": "Tasty King Kebab",
        "address": "ul. Bytomska 70",
        "city": "Piekary Śląskie",
        "cuisine_type": "Kebab",
        "lat": 50.38587,
        "lng": 18.94712,
        "delivery_available": true,
        "price_level": 2,
        "taxonomy_groups": [
          "grill"
        ],
        "taxonomy_cats": [
          "kebab"
        ],
        "taxonomy_tags": [
          "delivery"
        ],
        "maps_rating": 4.2,
        "maps_ratings_total": 1238,
        "opening_hours": {
          "periods": [
            {
              "open": {
                "day": 0,
                "time": "1000"
              },
              "close": {
                "day": 1,
                "time": "0000"
              }
            },
            {
              "open": {
                "day": 1,
                "time": "1000"
              },
              "close": {
                "day": 2,
                "time": "0000"
              }
            },
            {
              "open": {
                "day": 2,
                "time": "1000"
              },
              "close": {
                "day": 3,
                "time": "0000"
              }
            },
            {
              "open": {
                "day": 3,
                "time": "1000"
              },
              "close": {
                "day": 4,
                "time": "0000"
              }
            },
            {
              "open": {
                "day": 4,
                "time": "1000"
              },
              "close": {
                "day": 5,
                "time": "0000"
              }
            },
            {
              "open": {
                "day": 5,
                "time": "1000"
              },
              "close": {
                "day": 6,
                "time": "0000"
              }
            },
            {
              "open": {
                "day": 6,
                "time": "1000"
              },
              "close": {
                "day": 0,
                "time": "0000"
              }
            }
          ],
          "open_now": true,
          "weekday_text": [
            "Monday: 10:00 AM – 12:00 AM",
            "Tuesday: 10:00 AM – 12:00 AM",
            "Wednesday: 10:00 AM – 12:00 AM",
            "Thursday: 10:00 AM – 12:00 AM",
            "Friday: 10:00 AM – 12:00 AM",
            "Saturday: 10:00 AM – 12:00 AM",
            "Sunday: 10:00 AM – 12:00 AM"
          ]
        },
        "phone": "729 324 218",
        "website": null,
        "image_url": "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7.jpg",
        "photo_gallery": [
          "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7.jpg",
          "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_1.jpg",
          "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_2.jpg",
          "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_3.jpg",
          "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_4.jpg"
        ],
        "item_match_score": 140,
        "matched_menu_items": [
          "Pita Rollo",
          "Kebab amerykański",
          "Pita Rollo z serem"
        ]
      },
      {
        "id": "[redacted]",
        "name": "Dwór Hubertus",
        "address": "ul. Inwalidów Wojennych 72",
        "city": "Piekary Śląskie",
        "cuisine_type": "Śląska / Europejska",
        "lat": 50.39233,
        "lng": 18.94243,
        "delivery_available": true,
        "price_level": 2,
        "taxonomy_groups": [],
        "taxonomy_cats": [],
        "taxonomy_tags": [
          "delivery"
        ],
        "maps_rating": 4.2,
        "maps_ratings_total": 785,
        "opening_hours": {
          "periods": [
            {
              "open": {
                "day": 0,
                "time": "1200"
              },
              "close": {
                "day": 0,
                "time": "2000"
              }
            },
            {
              "open": {
                "day": 1,
                "time": "1100"
              },
              "close": {
                "day": 1,
                "time": "2100"
              }
            },
            {
              "open": {
                "day": 2,
                "time": "1100"
              },
              "close": {
                "day": 2,
                "time": "2100"
              }
            },
            {
              "open": {
                "day": 3,
                "time": "1100"
              },
              "close": {
                "day": 3,
                "time": "2100"
              }
            },
            {
              "open": {
                "day": 4,
                "time": "1100"
              },
              "close": {
                "day": 4,
                "time": "2100"
              }
            },
            {
              "open": {
                "day": 5,
                "time": "1100"
              },
              "close": {
                "day": 5,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 6,
                "time": "1100"
              },
              "close": {
                "day": 6,
                "time": "2200"
              }
            }
          ],
          "open_now": true,
          "weekday_text": [
            "Monday: 11:00 AM – 9:00 PM",
            "Tuesday: 11:00 AM – 9:00 PM",
            "Wednesday: 11:00 AM – 9:00 PM",
            "Thursday: 11:00 AM – 9:00 PM",
            "Friday: 11:00 AM – 10:00 PM",
            "Saturday: 11:00 AM – 10:00 PM",
            "Sunday: 12:00 – 8:00 PM"
          ]
        },
        "phone": "32 767 85 55",
        "website": "https://dworhubertus.pl/",
        "image_url": "/images/restaurants/af8448ef-974b-46c8-a4ae-b04b8dc7c9f8.jpg",
        "photo_gallery": null,
        "item_match_score": 140,
        "matched_menu_items": [
          "Gyros z frytkami i tzatziki"
        ]
      },
      {
        "id": "[redacted]",
        "name": "Callzone",
        "address": "ul. Księdza Piotra Skargi 3",
        "city": "Piekary Śląskie",
        "cuisine_type": "Pizzeria",
        "lat": 50.38594,
        "lng": 18.95647,
        "delivery_available": true,
        "price_level": 2,
        "taxonomy_groups": [
          "pizza_italian"
        ],
        "taxonomy_cats": [
          "pizza"
        ],
        "taxonomy_tags": [
          "delivery"
        ],
        "maps_rating": 4.2,
        "maps_ratings_total": 1452,
        "opening_hours": {
          "periods": [
            {
              "open": {
                "day": 0,
                "time": "1200"
              },
              "close": {
                "day": 0,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 1,
                "time": "1200"
              },
              "close": {
                "day": 1,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 2,
                "time": "1200"
              },
              "close": {
                "day": 2,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 3,
                "time": "1200"
              },
              "close": {
                "day": 3,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 4,
                "time": "1200"
              },
              "close": {
                "day": 4,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 5,
                "time": "1200"
              },
              "close": {
                "day": 5,
                "time": "2300"
              }
            },
            {
              "open": {
                "day": 6,
                "time": "1200"
              },
              "close": {
                "day": 6,
                "time": "2300"
              }
            }
          ],
          "open_now": true,
          "weekday_text": [
            "Monday: 12:00 – 10:00 PM",
            "Tuesday: 12:00 – 10:00 PM",
            "Wednesday: 12:00 – 10:00 PM",
            "Thursday: 12:00 – 10:00 PM",
            "Friday: 12:00 – 11:00 PM",
            "Saturday: 12:00 – 11:00 PM",
            "Sunday: 12:00 – 10:00 PM"
          ]
        },
        "phone": "32 288 64 71",
        "website": "http://kallzone.pl/",
        "image_url": "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70.jpg",
        "photo_gallery": [
          "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70.jpg",
          "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_1.jpg",
          "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_2.jpg",
          "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_3.jpg",
          "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_4.jpg"
        ],
        "item_match_score": 140,
        "matched_menu_items": [
          "Bowl Gyros-Halloumi"
        ]
      },
      {
        "id": "[redacted]",
        "name": "Klaps Burgers",
        "address": "ul. Piotra Skargi 15",
        "city": "Piekary Śląskie",
        "cuisine_type": "Amerykańska",
        "lat": 50.38643,
        "lng": 18.95422,
        "delivery_available": true,
        "price_level": 2,
        "taxonomy_groups": [
          "fast_food"
        ],
        "taxonomy_cats": [
          "burgers"
        ],
        "taxonomy_tags": [
          "quick",
          "delivery"
        ],
        "maps_rating": 4.3,
        "maps_ratings_total": 2693,
        "opening_hours": {
          "periods": [
            {
              "open": {
                "day": 0,
                "time": "1230"
              },
              "close": {
                "day": 0,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 3,
                "time": "1230"
              },
              "close": {
                "day": 3,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 4,
                "time": "1230"
              },
              "close": {
                "day": 4,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 5,
                "time": "1230"
              },
              "close": {
                "day": 5,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 6,
                "time": "1230"
              },
              "close": {
                "day": 6,
                "time": "2200"
              }
            }
          ],
          "open_now": true,
          "weekday_text": [
            "Monday: Closed",
            "Tuesday: Closed",
            "Wednesday: 12:30 – 10:00 PM",
            "Thursday: 12:30 – 10:00 PM",
            "Friday: 12:30 – 10:00 PM",
            "Saturday: 12:30 – 10:00 PM",
            "Sunday: 12:30 – 10:00 PM"
          ]
        },
        "phone": "570 377 377",
        "website": "http://www.klapsbar.pl/",
        "image_url": "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea.jpg",
        "photo_gallery": [
          "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea.jpg",
          "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_1.jpg",
          "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_2.jpg",
          "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_3.jpg",
          "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_4.jpg"
        ],
        "item_match_score": 120,
        "matched_menu_items": [
          "Milczenie Wola"
        ]
      }
    ],
    "orderMode": "restaurant_selected",
    "dialogStack": [
      {
        "surfaceKey": "CHOOSE_RESTAURANT",
        "facts": {
          "city": "Piekary Śląskie",
          "restaurantCount": 2
        },
        "renderedText": "Mam 2 miejsc w Piekary Śląskie. Którą restaurację wybierasz? (Możesz powiedzieć numer albo nazwę.)",
        "timestamp": 1777972820212
      },
      {
        "surfaceKey": "CHOOSE_RESTAURANT",
        "facts": {
          "city": "Piekary Śląskie",
          "restaurantCount": 2
        },
        "renderedText": "Mam 2 miejsc w Piekary Śląskie. Którą restaurację wybierasz? (Możesz powiedzieć numer albo nazwę.)",
        "timestamp": 1777972820616
      },
      {
        "surfaceKey": "CHOOSE_RESTAURANT",
        "facts": {
          "city": "Piekary Śląskie",
          "restaurantCount": 4
        },
        "renderedText": "Mam 4 miejsc w Piekary Śląskie. Którą restaurację wybierasz? (Możesz powiedzieć numer albo nazwę.)",
        "timestamp": 1777972821092
      }
    ],
    "dialogStackIndex": 2
  },
  "locationRestaurants": [],
  "timestamp": "2026-05-05T09:20:21.223Z",
  "turn_id": "turn_1777972821223_hv60f"
}
```

### Scenariusz: A02 (Step 4)
- **Input:** "z ostrym sosem"
- **Expected (Allowed):** find_nearby, create_order, clarify_order
- **Actual Intent:** select_restaurant
- **Status Code:** 200
- **Error details:**
```json
{
  "ok": true,
  "session_id": "chaos-A02-1777972821258",
  "text": "Nie wiem którą restaurację z listy masz na myśli. Wybierz numer od 1 do 4 lub powiedz \"cofnij\".",
  "reply": "Nie wiem którą restaurację z listy masz na myśli. Wybierz numer od 1 do 4 lub powiedz \"cofnij\".",
  "tts_text": "Nie wiem którą restaurację z listy masz na myśli. Wybierz numer od 1 do 4 lub powiedz \"cofnij\".",
  "audioContent": null,
  "intent": "select_restaurant",
  "phase": "idle",
  "should_reply": true,
  "actions": [],
  "restaurants": [],
  "menuItems": [],
  "menu": [],
  "cart": {
    "items": [],
    "total": 0
  },
  "recommendations": [],
  "meta": {
    "latency_total_ms": 81,
    "source": "context_lock",
    "styling_ms": 0,
    "tts_ms": 0,
    "cartHash": "empty",
    "state": {
      "conversationPhase": "idle",
      "currentRestaurant": null,
      "orderMode": "restaurant_selected"
    },
    "checkoutProgress": {
      "requiredFields": [
        "name",
        "phone",
        "address"
      ],
      "filledFields": [],
      "missingFields": [
        "name",
        "phone",
        "address"
      ],
      "completion": 0,
      "complete": false,
      "readyToSubmit": false,
      "cartItems": 0,
      "cartTotal": 0,
      "draft": {
        "name": "",
        "phone": "",
        "address": "",
        "notes": ""
      }
    },
    "guard_trace": [
      "preNluOverrideGuard",
      "transactionLockGuard",
      "orderingAffirmationGuard",
      "escapeOverrideGuard",
      "expectedContextGuard",
      "confidenceFloorGuard",
      "smartUnlockGuard",
      "continuityGuard",
      "strongContinuityGuard",
      "floatingOrderCleanupGuard",
      "cartMutationGuard",
      "uxGuard1",
      "uxGuard2",
      "confirmGuard"
    ],
    "pipeline_trace": [
      "hydrated",
      "menu_loaded",
      "intent_resolved:select_restaurant",
      "guard_override:none",
      "intent_finalized:select_restaurant",
      "handler:select_restaurant",
      "order_mode_event:SELECT_RESTAURANT",
      "order_mode_state:neutral->restaurant_selected",
      "ORDER_MODE_TRACE:{\"previousState\":\"neutral\",\"event\":\"SELECT_RESTAURANT\",\"nextState\":\"restaurant_selected\",\"allowed\":true,\"changed\":true,\"intent\":\"select_restaurant\"}",
      "CHECKOUT_PROGRESS_TRACE:{\"phase\":\"idle\",\"completion\":0,\"complete\":false,\"readyToSubmit\":false,\"missingFields\":[\"name\",\"phone\",\"address\"]}",
      "CART_EVENT_TRACE:{\"emitted\":false,\"stateMutationCompleted\":true,\"intent\":\"select_restaurant\",\"detectedBy\":\"whitelist\",\"pre\":{\"itemCount\":0,\"total\":0},\"post\":{\"itemCount\":0,\"total\":0},\"cartVersion\":null,\"totalItems\":null,\"totalPrice\":null}",
      "reco_skipped:general:state_ok"
    ],
    "orderModeTrace": {
      "previousState": "neutral",
      "event": "SELECT_RESTAURANT",
      "nextState": "restaurant_selected",
      "allowed": true,
      "changed": true,
      "intent": "select_restaurant"
    },
    "ORDER_MODE_TRACE": {
      "previousState": "neutral",
      "event": "SELECT_RESTAURANT",
      "nextState": "restaurant_selected",
      "allowed": true,
      "changed": true,
      "intent": "select_restaurant"
    },
    "checkoutProgressTrace": {
      "phase": "idle",
      "completion": 0,
      "complete": false,
      "readyToSubmit": false,
      "missingFields": [
        "name",
        "phone",
        "address"
      ]
    },
    "CHECKOUT_PROGRESS_TRACE": {
      "phase": "idle",
      "completion": 0,
      "complete": false,
      "readyToSubmit": false,
      "missingFields": [
        "name",
        "phone",
        "address"
      ]
    },
    "cartEventTrace": {
      "emitted": false,
      "stateMutationCompleted": true,
      "intent": "select_restaurant",
      "detectedBy": "whitelist",
      "pre": {
        "itemCount": 0,
        "total": 0
      },
      "post": {
        "itemCount": 0,
        "total": 0
      },
      "cartVersion": null,
      "totalItems": null,
      "totalPrice": null
    },
    "CART_EVENT_TRACE": {
      "emitted": false,
      "stateMutationCompleted": true,
      "intent": "select_restaurant",
      "detectedBy": "whitelist",
      "pre": {
        "itemCount": 0,
        "total": 0
      },
      "post": {
        "itemCount": 0,
        "total": 0
      },
      "cartVersion": null,
      "totalItems": null,
      "totalPrice": null
    },
    "recoContext": {
      "context": "browsing_menu",
      "mode": "ok",
      "reason": "menu_browsing",
      "cooldownRemainingMs": 0
    }
  },
  "context": {
    "status": "active",
    "closedReason": null,
    "closedAt": null,
    "conversationPhase": "idle",
    "expectedContext": null,
    "lastIntent": "select_restaurant",
    "lastRestaurant": null,
    "lastRestaurantsList": [],
    "lastRestaurants": [
      {
        "id": "[redacted]",
        "name": "Tasty King Kebab",
        "index": 1,
        "city": "Piekary Śląskie"
      },
      {
        "id": "[redacted]",
        "name": "Dwór Hubertus",
        "index": 2,
        "city": "Piekary Śląskie"
      },
      {
        "id": "[redacted]",
        "name": "Callzone",
        "index": 3,
        "city": "Piekary Śląskie"
      },
      {
        "id": "[redacted]",
        "name": "Klaps Burgers",
        "index": 4,
        "city": "Piekary Śląskie"
      }
    ],
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
        "text": "Mam 2 miejsc w Piekary Śląskie. Którą restaurację wybierasz? (Możesz powiedzieć numer albo nazwę.)",
        "surfaceKey": "CHOOSE_RESTAURANT",
        "entities": {
          "restaurants": [
            {
              "id": "[redacted]",
              "name": "Pizzeria Monte Carlo",
              "address": "Ul. Stanisława Maczka 22",
              "city": "Piekary Śląskie",
              "cuisine_type": null,
              "lat": null,
              "lng": null,
              "delivery_available": true,
              "price_level": 2,
              "taxonomy_groups": [
                "pizza_italian"
              ],
              "taxonomy_cats": [
                "pizza"
              ],
              "taxonomy_tags": [
                "delivery"
              ],
              "maps_rating": 4.3,
              "maps_ratings_total": 1675,
              "opening_hours": {
                "periods": [
                  {
                    "open": {
                      "day": 0,
                      "time": "1100"
                    },
                    "close": {
                      "day": 0,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 1,
                      "time": "1100"
                    },
                    "close": {
                      "day": 1,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 2,
                      "time": "1100"
                    },
                    "close": {
                      "day": 2,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 3,
                      "time": "1100"
                    },
                    "close": {
                      "day": 3,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 4,
                      "time": "1100"
                    },
                    "close": {
                      "day": 4,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 5,
                      "time": "1100"
                    },
                    "close": {
                      "day": 6,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 6,
                      "time": "1100"
                    },
                    "close": {
                      "day": 0,
                      "time": "0000"
                    }
                  }
                ],
                "open_now": true,
                "weekday_text": [
                  "Monday: 11:00 AM – 11:00 PM",
                  "Tuesday: 11:00 AM – 11:00 PM",
                  "Wednesday: 11:00 AM – 11:00 PM",
                  "Thursday: 11:00 AM – 11:00 PM",
                  "Friday: 11:00 AM – 12:00 AM",
                  "Saturday: 11:00 AM – 12:00 AM",
                  "Sunday: 11:00 AM – 11:00 PM"
                ]
              },
              "phone": "515 532 617",
              "website": "http://piekary.pubmontecarlo.pl/",
              "image_url": "/images/restaurants/83566974-1017-4408-90ee-2571ccc06978.jpg",
              "photo_gallery": [
                "/images/restaurants/83566974-1017-4408-90ee-2571ccc06978.jpg",
                "/images/restaurants/83566974-1017-4408-90ee-2571ccc06978_1.jpg",
                "/images/restaurants/83566974-1017-4408-90ee-2571ccc06978_2.jpg",
                "/images/restaurants/83566974-1017-4408-90ee-2571ccc06978_3.jpg",
                "/images/restaurants/83566974-1017-4408-90ee-2571ccc06978_4.jpg"
              ]
            },
            {
              "id": "[redacted]",
              "name": "Callzone",
              "address": "ul. Księdza Piotra Skargi 3",
              "city": "Piekary Śląskie",
              "cuisine_type": "Pizzeria",
              "lat": 50.38594,
              "lng": 18.95647,
              "delivery_available": true,
              "price_level": 2,
              "taxonomy_groups": [
                "pizza_italian"
              ],
              "taxonomy_cats": [
                "pizza"
              ],
              "taxonomy_tags": [
                "delivery"
              ],
              "maps_rating": 4.2,
              "maps_ratings_total": 1452,
              "opening_hours": {
                "periods": [
                  {
                    "open": {
                      "day": 0,
                      "time": "1200"
                    },
                    "close": {
                      "day": 0,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 1,
                      "time": "1200"
                    },
                    "close": {
                      "day": 1,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 2,
                      "time": "1200"
                    },
                    "close": {
                      "day": 2,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 3,
                      "time": "1200"
                    },
                    "close": {
                      "day": 3,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 4,
                      "time": "1200"
                    },
                    "close": {
                      "day": 4,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 5,
                      "time": "1200"
                    },
                    "close": {
                      "day": 5,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 6,
                      "time": "1200"
                    },
                    "close": {
                      "day": 6,
                      "time": "2300"
                    }
                  }
                ],
                "open_now": true,
                "weekday_text": [
                  "Monday: 12:00 – 10:00 PM",
                  "Tuesday: 12:00 – 10:00 PM",
                  "Wednesday: 12:00 – 10:00 PM",
                  "Thursday: 12:00 – 10:00 PM",
                  "Friday: 12:00 – 11:00 PM",
                  "Saturday: 12:00 – 11:00 PM",
                  "Sunday: 12:00 – 10:00 PM"
                ]
              },
              "phone": "32 288 64 71",
              "website": "http://kallzone.pl/",
              "image_url": "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70.jpg",
              "photo_gallery": [
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_1.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_2.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_3.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_4.jpg"
              ]
            }
          ],
          "menuItems": []
        },
        "timestamp": 1777972822270
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
        "timestamp": 1777972822374
      },
      {
        "role": "assistant",
        "text": "Mam 4 miejsc w Piekary Śląskie. Którą restaurację wybierasz? (Możesz powiedzieć numer albo nazwę.)",
        "surfaceKey": "CHOOSE_RESTAURANT",
        "entities": {
          "restaurants": [
            {
              "id": "[redacted]",
              "name": "Tasty King Kebab",
              "address": "ul. Bytomska 70",
              "city": "Piekary Śląskie",
              "cuisine_type": "Kebab",
              "lat": 50.38587,
              "lng": 18.94712,
              "delivery_available": true,
              "price_level": 2,
              "taxonomy_groups": [
                "grill"
              ],
              "taxonomy_cats": [
                "kebab"
              ],
              "taxonomy_tags": [
                "delivery"
              ],
              "maps_rating": 4.2,
              "maps_ratings_total": 1238,
              "opening_hours": {
                "periods": [
                  {
                    "open": {
                      "day": 0,
                      "time": "1000"
                    },
                    "close": {
                      "day": 1,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 1,
                      "time": "1000"
                    },
                    "close": {
                      "day": 2,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 2,
                      "time": "1000"
                    },
                    "close": {
                      "day": 3,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 3,
                      "time": "1000"
                    },
                    "close": {
                      "day": 4,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 4,
                      "time": "1000"
                    },
                    "close": {
                      "day": 5,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 5,
                      "time": "1000"
                    },
                    "close": {
                      "day": 6,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 6,
                      "time": "1000"
                    },
                    "close": {
                      "day": 0,
                      "time": "0000"
                    }
                  }
                ],
                "open_now": true,
                "weekday_text": [
                  "Monday: 10:00 AM – 12:00 AM",
                  "Tuesday: 10:00 AM – 12:00 AM",
                  "Wednesday: 10:00 AM – 12:00 AM",
                  "Thursday: 10:00 AM – 12:00 AM",
                  "Friday: 10:00 AM – 12:00 AM",
                  "Saturday: 10:00 AM – 12:00 AM",
                  "Sunday: 10:00 AM – 12:00 AM"
                ]
              },
              "phone": "729 324 218",
              "website": null,
              "image_url": "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7.jpg",
              "photo_gallery": [
                "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7.jpg",
                "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_1.jpg",
                "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_2.jpg",
                "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_3.jpg",
                "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_4.jpg"
              ],
              "item_match_score": 140,
              "matched_menu_items": [
                "Pita Rollo",
                "Kebab amerykański",
                "Pita Rollo z serem"
              ]
            },
            {
              "id": "[redacted]",
              "name": "Dwór Hubertus",
              "address": "ul. Inwalidów Wojennych 72",
              "city": "Piekary Śląskie",
              "cuisine_type": "Śląska / Europejska",
              "lat": 50.39233,
              "lng": 18.94243,
              "delivery_available": true,
              "price_level": 2,
              "taxonomy_groups": [],
              "taxonomy_cats": [],
              "taxonomy_tags": [
                "delivery"
              ],
              "maps_rating": 4.2,
              "maps_ratings_total": 785,
              "opening_hours": {
                "periods": [
                  {
                    "open": {
                      "day": 0,
                      "time": "1200"
                    },
                    "close": {
                      "day": 0,
                      "time": "2000"
                    }
                  },
                  {
                    "open": {
                      "day": 1,
                      "time": "1100"
                    },
                    "close": {
                      "day": 1,
                      "time": "2100"
                    }
                  },
                  {
                    "open": {
                      "day": 2,
                      "time": "1100"
                    },
                    "close": {
                      "day": 2,
                      "time": "2100"
                    }
                  },
                  {
                    "open": {
                      "day": 3,
                      "time": "1100"
                    },
                    "close": {
                      "day": 3,
                      "time": "2100"
                    }
                  },
                  {
                    "open": {
                      "day": 4,
                      "time": "1100"
                    },
                    "close": {
                      "day": 4,
                      "time": "2100"
                    }
                  },
                  {
                    "open": {
                      "day": 5,
                      "time": "1100"
                    },
                    "close": {
                      "day": 5,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 6,
                      "time": "1100"
                    },
                    "close": {
                      "day": 6,
                      "time": "2200"
                    }
                  }
                ],
                "open_now": true,
                "weekday_text": [
                  "Monday: 11:00 AM – 9:00 PM",
                  "Tuesday: 11:00 AM – 9:00 PM",
                  "Wednesday: 11:00 AM – 9:00 PM",
                  "Thursday: 11:00 AM – 9:00 PM",
                  "Friday: 11:00 AM – 10:00 PM",
                  "Saturday: 11:00 AM – 10:00 PM",
                  "Sunday: 12:00 – 8:00 PM"
                ]
              },
              "phone": "32 767 85 55",
              "website": "https://dworhubertus.pl/",
              "image_url": "/images/restaurants/af8448ef-974b-46c8-a4ae-b04b8dc7c9f8.jpg",
              "photo_gallery": null,
              "item_match_score": 140,
              "matched_menu_items": [
                "Gyros z frytkami i tzatziki"
              ]
            },
            {
              "id": "[redacted]",
              "name": "Callzone",
              "address": "ul. Księdza Piotra Skargi 3",
              "city": "Piekary Śląskie",
              "cuisine_type": "Pizzeria",
              "lat": 50.38594,
              "lng": 18.95647,
              "delivery_available": true,
              "price_level": 2,
              "taxonomy_groups": [
                "pizza_italian"
              ],
              "taxonomy_cats": [
                "pizza"
              ],
              "taxonomy_tags": [
                "delivery"
              ],
              "maps_rating": 4.2,
              "maps_ratings_total": 1452,
              "opening_hours": {
                "periods": [
                  {
                    "open": {
                      "day": 0,
                      "time": "1200"
                    },
                    "close": {
                      "day": 0,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 1,
                      "time": "1200"
                    },
                    "close": {
                      "day": 1,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 2,
                      "time": "1200"
                    },
                    "close": {
                      "day": 2,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 3,
                      "time": "1200"
                    },
                    "close": {
                      "day": 3,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 4,
                      "time": "1200"
                    },
                    "close": {
                      "day": 4,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 5,
                      "time": "1200"
                    },
                    "close": {
                      "day": 5,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 6,
                      "time": "1200"
                    },
                    "close": {
                      "day": 6,
                      "time": "2300"
                    }
                  }
                ],
                "open_now": true,
                "weekday_text": [
                  "Monday: 12:00 – 10:00 PM",
                  "Tuesday: 12:00 – 10:00 PM",
                  "Wednesday: 12:00 – 10:00 PM",
                  "Thursday: 12:00 – 10:00 PM",
                  "Friday: 12:00 – 11:00 PM",
                  "Saturday: 12:00 – 11:00 PM",
                  "Sunday: 12:00 – 10:00 PM"
                ]
              },
              "phone": "32 288 64 71",
              "website": "http://kallzone.pl/",
              "image_url": "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70.jpg",
              "photo_gallery": [
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_1.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_2.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_3.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_4.jpg"
              ],
              "item_match_score": 140,
              "matched_menu_items": [
                "Bowl Gyros-Halloumi"
              ]
            },
            {
              "id": "[redacted]",
              "name": "Klaps Burgers",
              "address": "ul. Piotra Skargi 15",
              "city": "Piekary Śląskie",
              "cuisine_type": "Amerykańska",
              "lat": 50.38643,
              "lng": 18.95422,
              "delivery_available": true,
              "price_level": 2,
              "taxonomy_groups": [
                "fast_food"
              ],
              "taxonomy_cats": [
                "burgers"
              ],
              "taxonomy_tags": [
                "quick",
                "delivery"
              ],
              "maps_rating": 4.3,
              "maps_ratings_total": 2693,
              "opening_hours": {
                "periods": [
                  {
                    "open": {
                      "day": 0,
                      "time": "1230"
                    },
                    "close": {
                      "day": 0,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 3,
                      "time": "1230"
                    },
                    "close": {
                      "day": 3,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 4,
                      "time": "1230"
                    },
                    "close": {
                      "day": 4,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 5,
                      "time": "1230"
                    },
                    "close": {
                      "day": 5,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 6,
                      "time": "1230"
                    },
                    "close": {
                      "day": 6,
                      "time": "2200"
                    }
                  }
                ],
                "open_now": true,
                "weekday_text": [
                  "Monday: Closed",
                  "Tuesday: Closed",
                  "Wednesday: 12:30 – 10:00 PM",
                  "Thursday: 12:30 – 10:00 PM",
                  "Friday: 12:30 – 10:00 PM",
                  "Saturday: 12:30 – 10:00 PM",
                  "Sunday: 12:30 – 10:00 PM"
                ]
              },
              "phone": "570 377 377",
              "website": "http://www.klapsbar.pl/",
              "image_url": "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea.jpg",
              "photo_gallery": [
                "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea.jpg",
                "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_1.jpg",
                "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_2.jpg",
                "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_3.jpg",
                "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_4.jpg"
              ],
              "item_match_score": 120,
              "matched_menu_items": [
                "Milczenie Wola"
              ]
            }
          ],
          "menuItems": []
        },
        "timestamp": 1777972822645
      },
      {
        "role": "user",
        "text": "z ostrym sosem",
        "entities": {
          "intent": "select_restaurant",
          "entities": {
            "location": null,
            "cuisine": null,
            "quantity": 1,
            "restaurant": null,
            "restaurantId": null,
            "dish": null,
            "items": null,
            "raw": "z ostrym sosem"
          }
        },
        "timestamp": 1777972822755
      },
      {
        "role": "assistant",
        "text": "Nie wiem którą restaurację z listy masz na myśli. Wybierz numer od 1 do 4 lub powiedz \"cofnij\".",
        "surfaceKey": null,
        "entities": {
          "restaurants": [],
          "menuItems": []
        },
        "timestamp": 1777972822757
      }
    ],
    "entityCache": {
      "restaurants": [
        {
          "id": "[redacted]",
          "name": "Tasty King Kebab",
          "position": 1,
          "timestamp": 1777972822645
        },
        {
          "id": "[redacted]",
          "name": "Dwór Hubertus",
          "position": 2,
          "timestamp": 1777972822645
        },
        {
          "id": "[redacted]",
          "name": "Callzone",
          "position": 3,
          "timestamp": 1777972822645
        },
        {
          "id": "[redacted]",
          "name": "Klaps Burgers",
          "position": 4,
          "timestamp": 1777972822645
        }
      ],
      "items": [],
      "lastListType": "restaurants"
    },
    "currentRestaurant": null,
    "lockedRestaurantId": null,
    "lastUpdated": 1777972822756,
    "last_location": "Piekary Śląskie",
    "last_restaurants_list": [
      {
        "id": "[redacted]",
        "name": "Tasty King Kebab",
        "address": "ul. Bytomska 70",
        "city": "Piekary Śląskie",
        "cuisine_type": "Kebab",
        "lat": 50.38587,
        "lng": 18.94712,
        "delivery_available": true,
        "price_level": 2,
        "taxonomy_groups": [
          "grill"
        ],
        "taxonomy_cats": [
          "kebab"
        ],
        "taxonomy_tags": [
          "delivery"
        ],
        "maps_rating": 4.2,
        "maps_ratings_total": 1238,
        "opening_hours": {
          "periods": [
            {
              "open": {
                "day": 0,
                "time": "1000"
              },
              "close": {
                "day": 1,
                "time": "0000"
              }
            },
            {
              "open": {
                "day": 1,
                "time": "1000"
              },
              "close": {
                "day": 2,
                "time": "0000"
              }
            },
            {
              "open": {
                "day": 2,
                "time": "1000"
              },
              "close": {
                "day": 3,
                "time": "0000"
              }
            },
            {
              "open": {
                "day": 3,
                "time": "1000"
              },
              "close": {
                "day": 4,
                "time": "0000"
              }
            },
            {
              "open": {
                "day": 4,
                "time": "1000"
              },
              "close": {
                "day": 5,
                "time": "0000"
              }
            },
            {
              "open": {
                "day": 5,
                "time": "1000"
              },
              "close": {
                "day": 6,
                "time": "0000"
              }
            },
            {
              "open": {
                "day": 6,
                "time": "1000"
              },
              "close": {
                "day": 0,
                "time": "0000"
              }
            }
          ],
          "open_now": true,
          "weekday_text": [
            "Monday: 10:00 AM – 12:00 AM",
            "Tuesday: 10:00 AM – 12:00 AM",
            "Wednesday: 10:00 AM – 12:00 AM",
            "Thursday: 10:00 AM – 12:00 AM",
            "Friday: 10:00 AM – 12:00 AM",
            "Saturday: 10:00 AM – 12:00 AM",
            "Sunday: 10:00 AM – 12:00 AM"
          ]
        },
        "phone": "729 324 218",
        "website": null,
        "image_url": "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7.jpg",
        "photo_gallery": [
          "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7.jpg",
          "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_1.jpg",
          "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_2.jpg",
          "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_3.jpg",
          "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_4.jpg"
        ],
        "item_match_score": 140,
        "matched_menu_items": [
          "Pita Rollo",
          "Kebab amerykański",
          "Pita Rollo z serem"
        ]
      },
      {
        "id": "[redacted]",
        "name": "Dwór Hubertus",
        "address": "ul. Inwalidów Wojennych 72",
        "city": "Piekary Śląskie",
        "cuisine_type": "Śląska / Europejska",
        "lat": 50.39233,
        "lng": 18.94243,
        "delivery_available": true,
        "price_level": 2,
        "taxonomy_groups": [],
        "taxonomy_cats": [],
        "taxonomy_tags": [
          "delivery"
        ],
        "maps_rating": 4.2,
        "maps_ratings_total": 785,
        "opening_hours": {
          "periods": [
            {
              "open": {
                "day": 0,
                "time": "1200"
              },
              "close": {
                "day": 0,
                "time": "2000"
              }
            },
            {
              "open": {
                "day": 1,
                "time": "1100"
              },
              "close": {
                "day": 1,
                "time": "2100"
              }
            },
            {
              "open": {
                "day": 2,
                "time": "1100"
              },
              "close": {
                "day": 2,
                "time": "2100"
              }
            },
            {
              "open": {
                "day": 3,
                "time": "1100"
              },
              "close": {
                "day": 3,
                "time": "2100"
              }
            },
            {
              "open": {
                "day": 4,
                "time": "1100"
              },
              "close": {
                "day": 4,
                "time": "2100"
              }
            },
            {
              "open": {
                "day": 5,
                "time": "1100"
              },
              "close": {
                "day": 5,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 6,
                "time": "1100"
              },
              "close": {
                "day": 6,
                "time": "2200"
              }
            }
          ],
          "open_now": true,
          "weekday_text": [
            "Monday: 11:00 AM – 9:00 PM",
            "Tuesday: 11:00 AM – 9:00 PM",
            "Wednesday: 11:00 AM – 9:00 PM",
            "Thursday: 11:00 AM – 9:00 PM",
            "Friday: 11:00 AM – 10:00 PM",
            "Saturday: 11:00 AM – 10:00 PM",
            "Sunday: 12:00 – 8:00 PM"
          ]
        },
        "phone": "32 767 85 55",
        "website": "https://dworhubertus.pl/",
        "image_url": "/images/restaurants/af8448ef-974b-46c8-a4ae-b04b8dc7c9f8.jpg",
        "photo_gallery": null,
        "item_match_score": 140,
        "matched_menu_items": [
          "Gyros z frytkami i tzatziki"
        ]
      },
      {
        "id": "[redacted]",
        "name": "Callzone",
        "address": "ul. Księdza Piotra Skargi 3",
        "city": "Piekary Śląskie",
        "cuisine_type": "Pizzeria",
        "lat": 50.38594,
        "lng": 18.95647,
        "delivery_available": true,
        "price_level": 2,
        "taxonomy_groups": [
          "pizza_italian"
        ],
        "taxonomy_cats": [
          "pizza"
        ],
        "taxonomy_tags": [
          "delivery"
        ],
        "maps_rating": 4.2,
        "maps_ratings_total": 1452,
        "opening_hours": {
          "periods": [
            {
              "open": {
                "day": 0,
                "time": "1200"
              },
              "close": {
                "day": 0,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 1,
                "time": "1200"
              },
              "close": {
                "day": 1,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 2,
                "time": "1200"
              },
              "close": {
                "day": 2,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 3,
                "time": "1200"
              },
              "close": {
                "day": 3,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 4,
                "time": "1200"
              },
              "close": {
                "day": 4,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 5,
                "time": "1200"
              },
              "close": {
                "day": 5,
                "time": "2300"
              }
            },
            {
              "open": {
                "day": 6,
                "time": "1200"
              },
              "close": {
                "day": 6,
                "time": "2300"
              }
            }
          ],
          "open_now": true,
          "weekday_text": [
            "Monday: 12:00 – 10:00 PM",
            "Tuesday: 12:00 – 10:00 PM",
            "Wednesday: 12:00 – 10:00 PM",
            "Thursday: 12:00 – 10:00 PM",
            "Friday: 12:00 – 11:00 PM",
            "Saturday: 12:00 – 11:00 PM",
            "Sunday: 12:00 – 10:00 PM"
          ]
        },
        "phone": "32 288 64 71",
        "website": "http://kallzone.pl/",
        "image_url": "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70.jpg",
        "photo_gallery": [
          "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70.jpg",
          "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_1.jpg",
          "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_2.jpg",
          "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_3.jpg",
          "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_4.jpg"
        ],
        "item_match_score": 140,
        "matched_menu_items": [
          "Bowl Gyros-Halloumi"
        ]
      },
      {
        "id": "[redacted]",
        "name": "Klaps Burgers",
        "address": "ul. Piotra Skargi 15",
        "city": "Piekary Śląskie",
        "cuisine_type": "Amerykańska",
        "lat": 50.38643,
        "lng": 18.95422,
        "delivery_available": true,
        "price_level": 2,
        "taxonomy_groups": [
          "fast_food"
        ],
        "taxonomy_cats": [
          "burgers"
        ],
        "taxonomy_tags": [
          "quick",
          "delivery"
        ],
        "maps_rating": 4.3,
        "maps_ratings_total": 2693,
        "opening_hours": {
          "periods": [
            {
              "open": {
                "day": 0,
                "time": "1230"
              },
              "close": {
                "day": 0,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 3,
                "time": "1230"
              },
              "close": {
                "day": 3,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 4,
                "time": "1230"
              },
              "close": {
                "day": 4,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 5,
                "time": "1230"
              },
              "close": {
                "day": 5,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 6,
                "time": "1230"
              },
              "close": {
                "day": 6,
                "time": "2200"
              }
            }
          ],
          "open_now": true,
          "weekday_text": [
            "Monday: Closed",
            "Tuesday: Closed",
            "Wednesday: 12:30 – 10:00 PM",
            "Thursday: 12:30 – 10:00 PM",
            "Friday: 12:30 – 10:00 PM",
            "Saturday: 12:30 – 10:00 PM",
            "Sunday: 12:30 – 10:00 PM"
          ]
        },
        "phone": "570 377 377",
        "website": "http://www.klapsbar.pl/",
        "image_url": "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea.jpg",
        "photo_gallery": [
          "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea.jpg",
          "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_1.jpg",
          "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_2.jpg",
          "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_3.jpg",
          "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_4.jpg"
        ],
        "item_match_score": 120,
        "matched_menu_items": [
          "Milczenie Wola"
        ]
      }
    ],
    "orderMode": "restaurant_selected",
    "dialogStack": [
      {
        "surfaceKey": "CHOOSE_RESTAURANT",
        "facts": {
          "city": "Piekary Śląskie",
          "restaurantCount": 2
        },
        "renderedText": "Mam 2 miejsc w Piekary Śląskie. Którą restaurację wybierasz? (Możesz powiedzieć numer albo nazwę.)",
        "timestamp": 1777972821956
      },
      {
        "surfaceKey": "CHOOSE_RESTAURANT",
        "facts": {
          "city": "Piekary Śląskie",
          "restaurantCount": 2
        },
        "renderedText": "Mam 2 miejsc w Piekary Śląskie. Którą restaurację wybierasz? (Możesz powiedzieć numer albo nazwę.)",
        "timestamp": 1777972822269
      },
      {
        "surfaceKey": "CHOOSE_RESTAURANT",
        "facts": {
          "city": "Piekary Śląskie",
          "restaurantCount": 4
        },
        "renderedText": "Mam 4 miejsc w Piekary Śląskie. Którą restaurację wybierasz? (Możesz powiedzieć numer albo nazwę.)",
        "timestamp": 1777972822644
      }
    ],
    "dialogStackIndex": 2
  },
  "locationRestaurants": [],
  "timestamp": "2026-05-05T09:20:22.757Z",
  "turn_id": "turn_1777972822757_bqmdb"
}
```

### Scenariusz: A03 (Step 4)
- **Input:** "z ostrym sosem"
- **Expected (Allowed):** find_nearby, create_order, clarify_order
- **Actual Intent:** select_restaurant
- **Status Code:** 200
- **Error details:**
```json
{
  "ok": true,
  "session_id": "chaos-A03-1777972822769",
  "text": "Nie wiem którą restaurację z listy masz na myśli. Wybierz numer od 1 do 4 lub powiedz \"cofnij\".",
  "reply": "Nie wiem którą restaurację z listy masz na myśli. Wybierz numer od 1 do 4 lub powiedz \"cofnij\".",
  "tts_text": "Nie wiem którą restaurację z listy masz na myśli. Wybierz numer od 1 do 4 lub powiedz \"cofnij\".",
  "audioContent": null,
  "intent": "select_restaurant",
  "phase": "idle",
  "should_reply": true,
  "actions": [],
  "restaurants": [],
  "menuItems": [],
  "menu": [],
  "cart": {
    "items": [],
    "total": 0
  },
  "recommendations": [],
  "meta": {
    "latency_total_ms": 86,
    "source": "context_lock",
    "styling_ms": 0,
    "tts_ms": 0,
    "cartHash": "empty",
    "state": {
      "conversationPhase": "idle",
      "currentRestaurant": null,
      "orderMode": "restaurant_selected"
    },
    "checkoutProgress": {
      "requiredFields": [
        "name",
        "phone",
        "address"
      ],
      "filledFields": [],
      "missingFields": [
        "name",
        "phone",
        "address"
      ],
      "completion": 0,
      "complete": false,
      "readyToSubmit": false,
      "cartItems": 0,
      "cartTotal": 0,
      "draft": {
        "name": "",
        "phone": "",
        "address": "",
        "notes": ""
      }
    },
    "guard_trace": [
      "preNluOverrideGuard",
      "transactionLockGuard",
      "orderingAffirmationGuard",
      "escapeOverrideGuard",
      "expectedContextGuard",
      "confidenceFloorGuard",
      "smartUnlockGuard",
      "continuityGuard",
      "strongContinuityGuard",
      "floatingOrderCleanupGuard",
      "cartMutationGuard",
      "uxGuard1",
      "uxGuard2",
      "confirmGuard"
    ],
    "pipeline_trace": [
      "hydrated",
      "menu_loaded",
      "intent_resolved:select_restaurant",
      "guard_override:none",
      "intent_finalized:select_restaurant",
      "handler:select_restaurant",
      "order_mode_event:SELECT_RESTAURANT",
      "order_mode_state:neutral->restaurant_selected",
      "ORDER_MODE_TRACE:{\"previousState\":\"neutral\",\"event\":\"SELECT_RESTAURANT\",\"nextState\":\"restaurant_selected\",\"allowed\":true,\"changed\":true,\"intent\":\"select_restaurant\"}",
      "CHECKOUT_PROGRESS_TRACE:{\"phase\":\"idle\",\"completion\":0,\"complete\":false,\"readyToSubmit\":false,\"missingFields\":[\"name\",\"phone\",\"address\"]}",
      "CART_EVENT_TRACE:{\"emitted\":false,\"stateMutationCompleted\":true,\"intent\":\"select_restaurant\",\"detectedBy\":\"whitelist\",\"pre\":{\"itemCount\":0,\"total\":0},\"post\":{\"itemCount\":0,\"total\":0},\"cartVersion\":null,\"totalItems\":null,\"totalPrice\":null}",
      "reco_skipped:general:state_ok"
    ],
    "orderModeTrace": {
      "previousState": "neutral",
      "event": "SELECT_RESTAURANT",
      "nextState": "restaurant_selected",
      "allowed": true,
      "changed": true,
      "intent": "select_restaurant"
    },
    "ORDER_MODE_TRACE": {
      "previousState": "neutral",
      "event": "SELECT_RESTAURANT",
      "nextState": "restaurant_selected",
      "allowed": true,
      "changed": true,
      "intent": "select_restaurant"
    },
    "checkoutProgressTrace": {
      "phase": "idle",
      "completion": 0,
      "complete": false,
      "readyToSubmit": false,
      "missingFields": [
        "name",
        "phone",
        "address"
      ]
    },
    "CHECKOUT_PROGRESS_TRACE": {
      "phase": "idle",
      "completion": 0,
      "complete": false,
      "readyToSubmit": false,
      "missingFields": [
        "name",
        "phone",
        "address"
      ]
    },
    "cartEventTrace": {
      "emitted": false,
      "stateMutationCompleted": true,
      "intent": "select_restaurant",
      "detectedBy": "whitelist",
      "pre": {
        "itemCount": 0,
        "total": 0
      },
      "post": {
        "itemCount": 0,
        "total": 0
      },
      "cartVersion": null,
      "totalItems": null,
      "totalPrice": null
    },
    "CART_EVENT_TRACE": {
      "emitted": false,
      "stateMutationCompleted": true,
      "intent": "select_restaurant",
      "detectedBy": "whitelist",
      "pre": {
        "itemCount": 0,
        "total": 0
      },
      "post": {
        "itemCount": 0,
        "total": 0
      },
      "cartVersion": null,
      "totalItems": null,
      "totalPrice": null
    },
    "recoContext": {
      "context": "browsing_menu",
      "mode": "ok",
      "reason": "menu_browsing",
      "cooldownRemainingMs": 0
    }
  },
  "context": {
    "status": "active",
    "closedReason": null,
    "closedAt": null,
    "conversationPhase": "idle",
    "expectedContext": null,
    "lastIntent": "select_restaurant",
    "lastRestaurant": null,
    "lastRestaurantsList": [],
    "lastRestaurants": [
      {
        "id": "[redacted]",
        "name": "Tasty King Kebab",
        "index": 1,
        "city": "Piekary Śląskie"
      },
      {
        "id": "[redacted]",
        "name": "Dwór Hubertus",
        "index": 2,
        "city": "Piekary Śląskie"
      },
      {
        "id": "[redacted]",
        "name": "Callzone",
        "index": 3,
        "city": "Piekary Śląskie"
      },
      {
        "id": "[redacted]",
        "name": "Klaps Burgers",
        "index": 4,
        "city": "Piekary Śląskie"
      }
    ],
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
        "text": "Mam 2 miejsc w Piekary Śląskie. Którą restaurację wybierasz? (Możesz powiedzieć numer albo nazwę.)",
        "surfaceKey": "CHOOSE_RESTAURANT",
        "entities": {
          "restaurants": [
            {
              "id": "[redacted]",
              "name": "Pizzeria Monte Carlo",
              "address": "Ul. Stanisława Maczka 22",
              "city": "Piekary Śląskie",
              "cuisine_type": null,
              "lat": null,
              "lng": null,
              "delivery_available": true,
              "price_level": 2,
              "taxonomy_groups": [
                "pizza_italian"
              ],
              "taxonomy_cats": [
                "pizza"
              ],
              "taxonomy_tags": [
                "delivery"
              ],
              "maps_rating": 4.3,
              "maps_ratings_total": 1675,
              "opening_hours": {
                "periods": [
                  {
                    "open": {
                      "day": 0,
                      "time": "1100"
                    },
                    "close": {
                      "day": 0,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 1,
                      "time": "1100"
                    },
                    "close": {
                      "day": 1,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 2,
                      "time": "1100"
                    },
                    "close": {
                      "day": 2,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 3,
                      "time": "1100"
                    },
                    "close": {
                      "day": 3,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 4,
                      "time": "1100"
                    },
                    "close": {
                      "day": 4,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 5,
                      "time": "1100"
                    },
                    "close": {
                      "day": 6,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 6,
                      "time": "1100"
                    },
                    "close": {
                      "day": 0,
                      "time": "0000"
                    }
                  }
                ],
                "open_now": true,
                "weekday_text": [
                  "Monday: 11:00 AM – 11:00 PM",
                  "Tuesday: 11:00 AM – 11:00 PM",
                  "Wednesday: 11:00 AM – 11:00 PM",
                  "Thursday: 11:00 AM – 11:00 PM",
                  "Friday: 11:00 AM – 12:00 AM",
                  "Saturday: 11:00 AM – 12:00 AM",
                  "Sunday: 11:00 AM – 11:00 PM"
                ]
              },
              "phone": "515 532 617",
              "website": "http://piekary.pubmontecarlo.pl/",
              "image_url": "/images/restaurants/83566974-1017-4408-90ee-2571ccc06978.jpg",
              "photo_gallery": [
                "/images/restaurants/83566974-1017-4408-90ee-2571ccc06978.jpg",
                "/images/restaurants/83566974-1017-4408-90ee-2571ccc06978_1.jpg",
                "/images/restaurants/83566974-1017-4408-90ee-2571ccc06978_2.jpg",
                "/images/restaurants/83566974-1017-4408-90ee-2571ccc06978_3.jpg",
                "/images/restaurants/83566974-1017-4408-90ee-2571ccc06978_4.jpg"
              ]
            },
            {
              "id": "[redacted]",
              "name": "Callzone",
              "address": "ul. Księdza Piotra Skargi 3",
              "city": "Piekary Śląskie",
              "cuisine_type": "Pizzeria",
              "lat": 50.38594,
              "lng": 18.95647,
              "delivery_available": true,
              "price_level": 2,
              "taxonomy_groups": [
                "pizza_italian"
              ],
              "taxonomy_cats": [
                "pizza"
              ],
              "taxonomy_tags": [
                "delivery"
              ],
              "maps_rating": 4.2,
              "maps_ratings_total": 1452,
              "opening_hours": {
                "periods": [
                  {
                    "open": {
                      "day": 0,
                      "time": "1200"
                    },
                    "close": {
                      "day": 0,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 1,
                      "time": "1200"
                    },
                    "close": {
                      "day": 1,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 2,
                      "time": "1200"
                    },
                    "close": {
                      "day": 2,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 3,
                      "time": "1200"
                    },
                    "close": {
                      "day": 3,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 4,
                      "time": "1200"
                    },
                    "close": {
                      "day": 4,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 5,
                      "time": "1200"
                    },
                    "close": {
                      "day": 5,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 6,
                      "time": "1200"
                    },
                    "close": {
                      "day": 6,
                      "time": "2300"
                    }
                  }
                ],
                "open_now": true,
                "weekday_text": [
                  "Monday: 12:00 – 10:00 PM",
                  "Tuesday: 12:00 – 10:00 PM",
                  "Wednesday: 12:00 – 10:00 PM",
                  "Thursday: 12:00 – 10:00 PM",
                  "Friday: 12:00 – 11:00 PM",
                  "Saturday: 12:00 – 11:00 PM",
                  "Sunday: 12:00 – 10:00 PM"
                ]
              },
              "phone": "32 288 64 71",
              "website": "http://kallzone.pl/",
              "image_url": "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70.jpg",
              "photo_gallery": [
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_1.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_2.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_3.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_4.jpg"
              ]
            }
          ],
          "menuItems": []
        },
        "timestamp": 1777972823533
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
        "timestamp": 1777972823653
      },
      {
        "role": "assistant",
        "text": "Mam 4 miejsc w Piekary Śląskie. Którą restaurację wybierasz? (Możesz powiedzieć numer albo nazwę.)",
        "surfaceKey": "CHOOSE_RESTAURANT",
        "entities": {
          "restaurants": [
            {
              "id": "[redacted]",
              "name": "Tasty King Kebab",
              "address": "ul. Bytomska 70",
              "city": "Piekary Śląskie",
              "cuisine_type": "Kebab",
              "lat": 50.38587,
              "lng": 18.94712,
              "delivery_available": true,
              "price_level": 2,
              "taxonomy_groups": [
                "grill"
              ],
              "taxonomy_cats": [
                "kebab"
              ],
              "taxonomy_tags": [
                "delivery"
              ],
              "maps_rating": 4.2,
              "maps_ratings_total": 1238,
              "opening_hours": {
                "periods": [
                  {
                    "open": {
                      "day": 0,
                      "time": "1000"
                    },
                    "close": {
                      "day": 1,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 1,
                      "time": "1000"
                    },
                    "close": {
                      "day": 2,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 2,
                      "time": "1000"
                    },
                    "close": {
                      "day": 3,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 3,
                      "time": "1000"
                    },
                    "close": {
                      "day": 4,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 4,
                      "time": "1000"
                    },
                    "close": {
                      "day": 5,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 5,
                      "time": "1000"
                    },
                    "close": {
                      "day": 6,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 6,
                      "time": "1000"
                    },
                    "close": {
                      "day": 0,
                      "time": "0000"
                    }
                  }
                ],
                "open_now": true,
                "weekday_text": [
                  "Monday: 10:00 AM – 12:00 AM",
                  "Tuesday: 10:00 AM – 12:00 AM",
                  "Wednesday: 10:00 AM – 12:00 AM",
                  "Thursday: 10:00 AM – 12:00 AM",
                  "Friday: 10:00 AM – 12:00 AM",
                  "Saturday: 10:00 AM – 12:00 AM",
                  "Sunday: 10:00 AM – 12:00 AM"
                ]
              },
              "phone": "729 324 218",
              "website": null,
              "image_url": "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7.jpg",
              "photo_gallery": [
                "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7.jpg",
                "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_1.jpg",
                "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_2.jpg",
                "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_3.jpg",
                "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_4.jpg"
              ],
              "item_match_score": 140,
              "matched_menu_items": [
                "Pita Rollo",
                "Kebab amerykański",
                "Pita Rollo z serem"
              ]
            },
            {
              "id": "[redacted]",
              "name": "Dwór Hubertus",
              "address": "ul. Inwalidów Wojennych 72",
              "city": "Piekary Śląskie",
              "cuisine_type": "Śląska / Europejska",
              "lat": 50.39233,
              "lng": 18.94243,
              "delivery_available": true,
              "price_level": 2,
              "taxonomy_groups": [],
              "taxonomy_cats": [],
              "taxonomy_tags": [
                "delivery"
              ],
              "maps_rating": 4.2,
              "maps_ratings_total": 785,
              "opening_hours": {
                "periods": [
                  {
                    "open": {
                      "day": 0,
                      "time": "1200"
                    },
                    "close": {
                      "day": 0,
                      "time": "2000"
                    }
                  },
                  {
                    "open": {
                      "day": 1,
                      "time": "1100"
                    },
                    "close": {
                      "day": 1,
                      "time": "2100"
                    }
                  },
                  {
                    "open": {
                      "day": 2,
                      "time": "1100"
                    },
                    "close": {
                      "day": 2,
                      "time": "2100"
                    }
                  },
                  {
                    "open": {
                      "day": 3,
                      "time": "1100"
                    },
                    "close": {
                      "day": 3,
                      "time": "2100"
                    }
                  },
                  {
                    "open": {
                      "day": 4,
                      "time": "1100"
                    },
                    "close": {
                      "day": 4,
                      "time": "2100"
                    }
                  },
                  {
                    "open": {
                      "day": 5,
                      "time": "1100"
                    },
                    "close": {
                      "day": 5,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 6,
                      "time": "1100"
                    },
                    "close": {
                      "day": 6,
                      "time": "2200"
                    }
                  }
                ],
                "open_now": true,
                "weekday_text": [
                  "Monday: 11:00 AM – 9:00 PM",
                  "Tuesday: 11:00 AM – 9:00 PM",
                  "Wednesday: 11:00 AM – 9:00 PM",
                  "Thursday: 11:00 AM – 9:00 PM",
                  "Friday: 11:00 AM – 10:00 PM",
                  "Saturday: 11:00 AM – 10:00 PM",
                  "Sunday: 12:00 – 8:00 PM"
                ]
              },
              "phone": "32 767 85 55",
              "website": "https://dworhubertus.pl/",
              "image_url": "/images/restaurants/af8448ef-974b-46c8-a4ae-b04b8dc7c9f8.jpg",
              "photo_gallery": null,
              "item_match_score": 140,
              "matched_menu_items": [
                "Gyros z frytkami i tzatziki"
              ]
            },
            {
              "id": "[redacted]",
              "name": "Callzone",
              "address": "ul. Księdza Piotra Skargi 3",
              "city": "Piekary Śląskie",
              "cuisine_type": "Pizzeria",
              "lat": 50.38594,
              "lng": 18.95647,
              "delivery_available": true,
              "price_level": 2,
              "taxonomy_groups": [
                "pizza_italian"
              ],
              "taxonomy_cats": [
                "pizza"
              ],
              "taxonomy_tags": [
                "delivery"
              ],
              "maps_rating": 4.2,
              "maps_ratings_total": 1452,
              "opening_hours": {
                "periods": [
                  {
                    "open": {
                      "day": 0,
                      "time": "1200"
                    },
                    "close": {
                      "day": 0,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 1,
                      "time": "1200"
                    },
                    "close": {
                      "day": 1,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 2,
                      "time": "1200"
                    },
                    "close": {
                      "day": 2,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 3,
                      "time": "1200"
                    },
                    "close": {
                      "day": 3,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 4,
                      "time": "1200"
                    },
                    "close": {
                      "day": 4,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 5,
                      "time": "1200"
                    },
                    "close": {
                      "day": 5,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 6,
                      "time": "1200"
                    },
                    "close": {
                      "day": 6,
                      "time": "2300"
                    }
                  }
                ],
                "open_now": true,
                "weekday_text": [
                  "Monday: 12:00 – 10:00 PM",
                  "Tuesday: 12:00 – 10:00 PM",
                  "Wednesday: 12:00 – 10:00 PM",
                  "Thursday: 12:00 – 10:00 PM",
                  "Friday: 12:00 – 11:00 PM",
                  "Saturday: 12:00 – 11:00 PM",
                  "Sunday: 12:00 – 10:00 PM"
                ]
              },
              "phone": "32 288 64 71",
              "website": "http://kallzone.pl/",
              "image_url": "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70.jpg",
              "photo_gallery": [
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_1.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_2.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_3.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_4.jpg"
              ],
              "item_match_score": 140,
              "matched_menu_items": [
                "Bowl Gyros-Halloumi"
              ]
            },
            {
              "id": "[redacted]",
              "name": "Klaps Burgers",
              "address": "ul. Piotra Skargi 15",
              "city": "Piekary Śląskie",
              "cuisine_type": "Amerykańska",
              "lat": 50.38643,
              "lng": 18.95422,
              "delivery_available": true,
              "price_level": 2,
              "taxonomy_groups": [
                "fast_food"
              ],
              "taxonomy_cats": [
                "burgers"
              ],
              "taxonomy_tags": [
                "quick",
                "delivery"
              ],
              "maps_rating": 4.3,
              "maps_ratings_total": 2693,
              "opening_hours": {
                "periods": [
                  {
                    "open": {
                      "day": 0,
                      "time": "1230"
                    },
                    "close": {
                      "day": 0,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 3,
                      "time": "1230"
                    },
                    "close": {
                      "day": 3,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 4,
                      "time": "1230"
                    },
                    "close": {
                      "day": 4,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 5,
                      "time": "1230"
                    },
                    "close": {
                      "day": 5,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 6,
                      "time": "1230"
                    },
                    "close": {
                      "day": 6,
                      "time": "2200"
                    }
                  }
                ],
                "open_now": true,
                "weekday_text": [
                  "Monday: Closed",
                  "Tuesday: Closed",
                  "Wednesday: 12:30 – 10:00 PM",
                  "Thursday: 12:30 – 10:00 PM",
                  "Friday: 12:30 – 10:00 PM",
                  "Saturday: 12:30 – 10:00 PM",
                  "Sunday: 12:30 – 10:00 PM"
                ]
              },
              "phone": "570 377 377",
              "website": "http://www.klapsbar.pl/",
              "image_url": "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea.jpg",
              "photo_gallery": [
                "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea.jpg",
                "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_1.jpg",
                "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_2.jpg",
                "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_3.jpg",
                "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_4.jpg"
              ],
              "item_match_score": 120,
              "matched_menu_items": [
                "Milczenie Wola"
              ]
            }
          ],
          "menuItems": []
        },
        "timestamp": 1777972823947
      },
      {
        "role": "user",
        "text": "z ostrym sosem",
        "entities": {
          "intent": "select_restaurant",
          "entities": {
            "location": null,
            "cuisine": null,
            "quantity": 1,
            "restaurant": null,
            "restaurantId": null,
            "dish": null,
            "items": null,
            "raw": "z ostrym sosem"
          }
        },
        "timestamp": 1777972824057
      },
      {
        "role": "assistant",
        "text": "Nie wiem którą restaurację z listy masz na myśli. Wybierz numer od 1 do 4 lub powiedz \"cofnij\".",
        "surfaceKey": null,
        "entities": {
          "restaurants": [],
          "menuItems": []
        },
        "timestamp": 1777972824058
      }
    ],
    "entityCache": {
      "restaurants": [
        {
          "id": "[redacted]",
          "name": "Tasty King Kebab",
          "position": 1,
          "timestamp": 1777972823947
        },
        {
          "id": "[redacted]",
          "name": "Dwór Hubertus",
          "position": 2,
          "timestamp": 1777972823947
        },
        {
          "id": "[redacted]",
          "name": "Callzone",
          "position": 3,
          "timestamp": 1777972823947
        },
        {
          "id": "[redacted]",
          "name": "Klaps Burgers",
          "position": 4,
          "timestamp": 1777972823947
        }
      ],
      "items": [],
      "lastListType": "restaurants"
    },
    "currentRestaurant": null,
    "lockedRestaurantId": null,
    "lastUpdated": 1777972824057,
    "last_location": "Piekary Śląskie",
    "last_restaurants_list": [
      {
        "id": "[redacted]",
        "name": "Tasty King Kebab",
        "address": "ul. Bytomska 70",
        "city": "Piekary Śląskie",
        "cuisine_type": "Kebab",
        "lat": 50.38587,
        "lng": 18.94712,
        "delivery_available": true,
        "price_level": 2,
        "taxonomy_groups": [
          "grill"
        ],
        "taxonomy_cats": [
          "kebab"
        ],
        "taxonomy_tags": [
          "delivery"
        ],
        "maps_rating": 4.2,
        "maps_ratings_total": 1238,
        "opening_hours": {
          "periods": [
            {
              "open": {
                "day": 0,
                "time": "1000"
              },
              "close": {
                "day": 1,
                "time": "0000"
              }
            },
            {
              "open": {
                "day": 1,
                "time": "1000"
              },
              "close": {
                "day": 2,
                "time": "0000"
              }
            },
            {
              "open": {
                "day": 2,
                "time": "1000"
              },
              "close": {
                "day": 3,
                "time": "0000"
              }
            },
            {
              "open": {
                "day": 3,
                "time": "1000"
              },
              "close": {
                "day": 4,
                "time": "0000"
              }
            },
            {
              "open": {
                "day": 4,
                "time": "1000"
              },
              "close": {
                "day": 5,
                "time": "0000"
              }
            },
            {
              "open": {
                "day": 5,
                "time": "1000"
              },
              "close": {
                "day": 6,
                "time": "0000"
              }
            },
            {
              "open": {
                "day": 6,
                "time": "1000"
              },
              "close": {
                "day": 0,
                "time": "0000"
              }
            }
          ],
          "open_now": true,
          "weekday_text": [
            "Monday: 10:00 AM – 12:00 AM",
            "Tuesday: 10:00 AM – 12:00 AM",
            "Wednesday: 10:00 AM – 12:00 AM",
            "Thursday: 10:00 AM – 12:00 AM",
            "Friday: 10:00 AM – 12:00 AM",
            "Saturday: 10:00 AM – 12:00 AM",
            "Sunday: 10:00 AM – 12:00 AM"
          ]
        },
        "phone": "729 324 218",
        "website": null,
        "image_url": "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7.jpg",
        "photo_gallery": [
          "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7.jpg",
          "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_1.jpg",
          "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_2.jpg",
          "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_3.jpg",
          "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_4.jpg"
        ],
        "item_match_score": 140,
        "matched_menu_items": [
          "Pita Rollo",
          "Kebab amerykański",
          "Pita Rollo z serem"
        ]
      },
      {
        "id": "[redacted]",
        "name": "Dwór Hubertus",
        "address": "ul. Inwalidów Wojennych 72",
        "city": "Piekary Śląskie",
        "cuisine_type": "Śląska / Europejska",
        "lat": 50.39233,
        "lng": 18.94243,
        "delivery_available": true,
        "price_level": 2,
        "taxonomy_groups": [],
        "taxonomy_cats": [],
        "taxonomy_tags": [
          "delivery"
        ],
        "maps_rating": 4.2,
        "maps_ratings_total": 785,
        "opening_hours": {
          "periods": [
            {
              "open": {
                "day": 0,
                "time": "1200"
              },
              "close": {
                "day": 0,
                "time": "2000"
              }
            },
            {
              "open": {
                "day": 1,
                "time": "1100"
              },
              "close": {
                "day": 1,
                "time": "2100"
              }
            },
            {
              "open": {
                "day": 2,
                "time": "1100"
              },
              "close": {
                "day": 2,
                "time": "2100"
              }
            },
            {
              "open": {
                "day": 3,
                "time": "1100"
              },
              "close": {
                "day": 3,
                "time": "2100"
              }
            },
            {
              "open": {
                "day": 4,
                "time": "1100"
              },
              "close": {
                "day": 4,
                "time": "2100"
              }
            },
            {
              "open": {
                "day": 5,
                "time": "1100"
              },
              "close": {
                "day": 5,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 6,
                "time": "1100"
              },
              "close": {
                "day": 6,
                "time": "2200"
              }
            }
          ],
          "open_now": true,
          "weekday_text": [
            "Monday: 11:00 AM – 9:00 PM",
            "Tuesday: 11:00 AM – 9:00 PM",
            "Wednesday: 11:00 AM – 9:00 PM",
            "Thursday: 11:00 AM – 9:00 PM",
            "Friday: 11:00 AM – 10:00 PM",
            "Saturday: 11:00 AM – 10:00 PM",
            "Sunday: 12:00 – 8:00 PM"
          ]
        },
        "phone": "32 767 85 55",
        "website": "https://dworhubertus.pl/",
        "image_url": "/images/restaurants/af8448ef-974b-46c8-a4ae-b04b8dc7c9f8.jpg",
        "photo_gallery": null,
        "item_match_score": 140,
        "matched_menu_items": [
          "Gyros z frytkami i tzatziki"
        ]
      },
      {
        "id": "[redacted]",
        "name": "Callzone",
        "address": "ul. Księdza Piotra Skargi 3",
        "city": "Piekary Śląskie",
        "cuisine_type": "Pizzeria",
        "lat": 50.38594,
        "lng": 18.95647,
        "delivery_available": true,
        "price_level": 2,
        "taxonomy_groups": [
          "pizza_italian"
        ],
        "taxonomy_cats": [
          "pizza"
        ],
        "taxonomy_tags": [
          "delivery"
        ],
        "maps_rating": 4.2,
        "maps_ratings_total": 1452,
        "opening_hours": {
          "periods": [
            {
              "open": {
                "day": 0,
                "time": "1200"
              },
              "close": {
                "day": 0,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 1,
                "time": "1200"
              },
              "close": {
                "day": 1,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 2,
                "time": "1200"
              },
              "close": {
                "day": 2,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 3,
                "time": "1200"
              },
              "close": {
                "day": 3,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 4,
                "time": "1200"
              },
              "close": {
                "day": 4,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 5,
                "time": "1200"
              },
              "close": {
                "day": 5,
                "time": "2300"
              }
            },
            {
              "open": {
                "day": 6,
                "time": "1200"
              },
              "close": {
                "day": 6,
                "time": "2300"
              }
            }
          ],
          "open_now": true,
          "weekday_text": [
            "Monday: 12:00 – 10:00 PM",
            "Tuesday: 12:00 – 10:00 PM",
            "Wednesday: 12:00 – 10:00 PM",
            "Thursday: 12:00 – 10:00 PM",
            "Friday: 12:00 – 11:00 PM",
            "Saturday: 12:00 – 11:00 PM",
            "Sunday: 12:00 – 10:00 PM"
          ]
        },
        "phone": "32 288 64 71",
        "website": "http://kallzone.pl/",
        "image_url": "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70.jpg",
        "photo_gallery": [
          "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70.jpg",
          "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_1.jpg",
          "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_2.jpg",
          "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_3.jpg",
          "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_4.jpg"
        ],
        "item_match_score": 140,
        "matched_menu_items": [
          "Bowl Gyros-Halloumi"
        ]
      },
      {
        "id": "[redacted]",
        "name": "Klaps Burgers",
        "address": "ul. Piotra Skargi 15",
        "city": "Piekary Śląskie",
        "cuisine_type": "Amerykańska",
        "lat": 50.38643,
        "lng": 18.95422,
        "delivery_available": true,
        "price_level": 2,
        "taxonomy_groups": [
          "fast_food"
        ],
        "taxonomy_cats": [
          "burgers"
        ],
        "taxonomy_tags": [
          "quick",
          "delivery"
        ],
        "maps_rating": 4.3,
        "maps_ratings_total": 2693,
        "opening_hours": {
          "periods": [
            {
              "open": {
                "day": 0,
                "time": "1230"
              },
              "close": {
                "day": 0,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 3,
                "time": "1230"
              },
              "close": {
                "day": 3,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 4,
                "time": "1230"
              },
              "close": {
                "day": 4,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 5,
                "time": "1230"
              },
              "close": {
                "day": 5,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 6,
                "time": "1230"
              },
              "close": {
                "day": 6,
                "time": "2200"
              }
            }
          ],
          "open_now": true,
          "weekday_text": [
            "Monday: Closed",
            "Tuesday: Closed",
            "Wednesday: 12:30 – 10:00 PM",
            "Thursday: 12:30 – 10:00 PM",
            "Friday: 12:30 – 10:00 PM",
            "Saturday: 12:30 – 10:00 PM",
            "Sunday: 12:30 – 10:00 PM"
          ]
        },
        "phone": "570 377 377",
        "website": "http://www.klapsbar.pl/",
        "image_url": "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea.jpg",
        "photo_gallery": [
          "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea.jpg",
          "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_1.jpg",
          "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_2.jpg",
          "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_3.jpg",
          "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_4.jpg"
        ],
        "item_match_score": 120,
        "matched_menu_items": [
          "Milczenie Wola"
        ]
      }
    ],
    "orderMode": "restaurant_selected",
    "dialogStack": [
      {
        "surfaceKey": "CHOOSE_RESTAURANT",
        "facts": {
          "city": "Piekary Śląskie",
          "restaurantCount": 2
        },
        "renderedText": "Mam 2 miejsc w Piekary Śląskie. Którą restaurację wybierasz? (Możesz powiedzieć numer albo nazwę.)",
        "timestamp": 1777972823268
      },
      {
        "surfaceKey": "CHOOSE_RESTAURANT",
        "facts": {
          "city": "Piekary Śląskie",
          "restaurantCount": 2
        },
        "renderedText": "Mam 2 miejsc w Piekary Śląskie. Którą restaurację wybierasz? (Możesz powiedzieć numer albo nazwę.)",
        "timestamp": 1777972823532
      },
      {
        "surfaceKey": "CHOOSE_RESTAURANT",
        "facts": {
          "city": "Piekary Śląskie",
          "restaurantCount": 4
        },
        "renderedText": "Mam 4 miejsc w Piekary Śląskie. Którą restaurację wybierasz? (Możesz powiedzieć numer albo nazwę.)",
        "timestamp": 1777972823947
      }
    ],
    "dialogStackIndex": 2
  },
  "locationRestaurants": [],
  "timestamp": "2026-05-05T09:20:24.058Z",
  "turn_id": "turn_1777972824058_g0o9m"
}
```

### Scenariusz: A04 (Step 4)
- **Input:** "z ostrym sosem"
- **Expected (Allowed):** find_nearby, create_order, clarify_order
- **Actual Intent:** select_restaurant
- **Status Code:** 200
- **Error details:**
```json
{
  "ok": true,
  "session_id": "chaos-A04-1777972824072",
  "text": "Nie wiem którą restaurację z listy masz na myśli. Wybierz numer od 1 do 4 lub powiedz \"cofnij\".",
  "reply": "Nie wiem którą restaurację z listy masz na myśli. Wybierz numer od 1 do 4 lub powiedz \"cofnij\".",
  "tts_text": "Nie wiem którą restaurację z listy masz na myśli. Wybierz numer od 1 do 4 lub powiedz \"cofnij\".",
  "audioContent": null,
  "intent": "select_restaurant",
  "phase": "idle",
  "should_reply": true,
  "actions": [],
  "restaurants": [],
  "menuItems": [],
  "menu": [],
  "cart": {
    "items": [],
    "total": 0
  },
  "recommendations": [],
  "meta": {
    "latency_total_ms": 118,
    "source": "context_lock",
    "styling_ms": 0,
    "tts_ms": 0,
    "cartHash": "empty",
    "state": {
      "conversationPhase": "idle",
      "currentRestaurant": null,
      "orderMode": "restaurant_selected"
    },
    "checkoutProgress": {
      "requiredFields": [
        "name",
        "phone",
        "address"
      ],
      "filledFields": [],
      "missingFields": [
        "name",
        "phone",
        "address"
      ],
      "completion": 0,
      "complete": false,
      "readyToSubmit": false,
      "cartItems": 0,
      "cartTotal": 0,
      "draft": {
        "name": "",
        "phone": "",
        "address": "",
        "notes": ""
      }
    },
    "guard_trace": [
      "preNluOverrideGuard",
      "transactionLockGuard",
      "orderingAffirmationGuard",
      "escapeOverrideGuard",
      "expectedContextGuard",
      "confidenceFloorGuard",
      "smartUnlockGuard",
      "continuityGuard",
      "strongContinuityGuard",
      "floatingOrderCleanupGuard",
      "cartMutationGuard",
      "uxGuard1",
      "uxGuard2",
      "confirmGuard"
    ],
    "pipeline_trace": [
      "hydrated",
      "menu_loaded",
      "intent_resolved:select_restaurant",
      "guard_override:none",
      "intent_finalized:select_restaurant",
      "handler:select_restaurant",
      "order_mode_event:SELECT_RESTAURANT",
      "order_mode_state:neutral->restaurant_selected",
      "ORDER_MODE_TRACE:{\"previousState\":\"neutral\",\"event\":\"SELECT_RESTAURANT\",\"nextState\":\"restaurant_selected\",\"allowed\":true,\"changed\":true,\"intent\":\"select_restaurant\"}",
      "CHECKOUT_PROGRESS_TRACE:{\"phase\":\"idle\",\"completion\":0,\"complete\":false,\"readyToSubmit\":false,\"missingFields\":[\"name\",\"phone\",\"address\"]}",
      "CART_EVENT_TRACE:{\"emitted\":false,\"stateMutationCompleted\":true,\"intent\":\"select_restaurant\",\"detectedBy\":\"whitelist\",\"pre\":{\"itemCount\":0,\"total\":0},\"post\":{\"itemCount\":0,\"total\":0},\"cartVersion\":null,\"totalItems\":null,\"totalPrice\":null}",
      "reco_skipped:general:state_ok"
    ],
    "orderModeTrace": {
      "previousState": "neutral",
      "event": "SELECT_RESTAURANT",
      "nextState": "restaurant_selected",
      "allowed": true,
      "changed": true,
      "intent": "select_restaurant"
    },
    "ORDER_MODE_TRACE": {
      "previousState": "neutral",
      "event": "SELECT_RESTAURANT",
      "nextState": "restaurant_selected",
      "allowed": true,
      "changed": true,
      "intent": "select_restaurant"
    },
    "checkoutProgressTrace": {
      "phase": "idle",
      "completion": 0,
      "complete": false,
      "readyToSubmit": false,
      "missingFields": [
        "name",
        "phone",
        "address"
      ]
    },
    "CHECKOUT_PROGRESS_TRACE": {
      "phase": "idle",
      "completion": 0,
      "complete": false,
      "readyToSubmit": false,
      "missingFields": [
        "name",
        "phone",
        "address"
      ]
    },
    "cartEventTrace": {
      "emitted": false,
      "stateMutationCompleted": true,
      "intent": "select_restaurant",
      "detectedBy": "whitelist",
      "pre": {
        "itemCount": 0,
        "total": 0
      },
      "post": {
        "itemCount": 0,
        "total": 0
      },
      "cartVersion": null,
      "totalItems": null,
      "totalPrice": null
    },
    "CART_EVENT_TRACE": {
      "emitted": false,
      "stateMutationCompleted": true,
      "intent": "select_restaurant",
      "detectedBy": "whitelist",
      "pre": {
        "itemCount": 0,
        "total": 0
      },
      "post": {
        "itemCount": 0,
        "total": 0
      },
      "cartVersion": null,
      "totalItems": null,
      "totalPrice": null
    },
    "recoContext": {
      "context": "browsing_menu",
      "mode": "ok",
      "reason": "menu_browsing",
      "cooldownRemainingMs": 0
    }
  },
  "context": {
    "status": "active",
    "closedReason": null,
    "closedAt": null,
    "conversationPhase": "idle",
    "expectedContext": null,
    "lastIntent": "select_restaurant",
    "lastRestaurant": null,
    "lastRestaurantsList": [],
    "lastRestaurants": [
      {
        "id": "[redacted]",
        "name": "Tasty King Kebab",
        "index": 1,
        "city": "Piekary Śląskie"
      },
      {
        "id": "[redacted]",
        "name": "Dwór Hubertus",
        "index": 2,
        "city": "Piekary Śląskie"
      },
      {
        "id": "[redacted]",
        "name": "Callzone",
        "index": 3,
        "city": "Piekary Śląskie"
      },
      {
        "id": "[redacted]",
        "name": "Klaps Burgers",
        "index": 4,
        "city": "Piekary Śląskie"
      }
    ],
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
        "text": "Mam 2 miejsc w Piekary Śląskie. Którą restaurację wybierasz? (Możesz powiedzieć numer albo nazwę.)",
        "surfaceKey": "CHOOSE_RESTAURANT",
        "entities": {
          "restaurants": [
            {
              "id": "[redacted]",
              "name": "Pizzeria Monte Carlo",
              "address": "Ul. Stanisława Maczka 22",
              "city": "Piekary Śląskie",
              "cuisine_type": null,
              "lat": null,
              "lng": null,
              "delivery_available": true,
              "price_level": 2,
              "taxonomy_groups": [
                "pizza_italian"
              ],
              "taxonomy_cats": [
                "pizza"
              ],
              "taxonomy_tags": [
                "delivery"
              ],
              "maps_rating": 4.3,
              "maps_ratings_total": 1675,
              "opening_hours": {
                "periods": [
                  {
                    "open": {
                      "day": 0,
                      "time": "1100"
                    },
                    "close": {
                      "day": 0,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 1,
                      "time": "1100"
                    },
                    "close": {
                      "day": 1,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 2,
                      "time": "1100"
                    },
                    "close": {
                      "day": 2,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 3,
                      "time": "1100"
                    },
                    "close": {
                      "day": 3,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 4,
                      "time": "1100"
                    },
                    "close": {
                      "day": 4,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 5,
                      "time": "1100"
                    },
                    "close": {
                      "day": 6,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 6,
                      "time": "1100"
                    },
                    "close": {
                      "day": 0,
                      "time": "0000"
                    }
                  }
                ],
                "open_now": true,
                "weekday_text": [
                  "Monday: 11:00 AM – 11:00 PM",
                  "Tuesday: 11:00 AM – 11:00 PM",
                  "Wednesday: 11:00 AM – 11:00 PM",
                  "Thursday: 11:00 AM – 11:00 PM",
                  "Friday: 11:00 AM – 12:00 AM",
                  "Saturday: 11:00 AM – 12:00 AM",
                  "Sunday: 11:00 AM – 11:00 PM"
                ]
              },
              "phone": "515 532 617",
              "website": "http://piekary.pubmontecarlo.pl/",
              "image_url": "/images/restaurants/83566974-1017-4408-90ee-2571ccc06978.jpg",
              "photo_gallery": [
                "/images/restaurants/83566974-1017-4408-90ee-2571ccc06978.jpg",
                "/images/restaurants/83566974-1017-4408-90ee-2571ccc06978_1.jpg",
                "/images/restaurants/83566974-1017-4408-90ee-2571ccc06978_2.jpg",
                "/images/restaurants/83566974-1017-4408-90ee-2571ccc06978_3.jpg",
                "/images/restaurants/83566974-1017-4408-90ee-2571ccc06978_4.jpg"
              ]
            },
            {
              "id": "[redacted]",
              "name": "Callzone",
              "address": "ul. Księdza Piotra Skargi 3",
              "city": "Piekary Śląskie",
              "cuisine_type": "Pizzeria",
              "lat": 50.38594,
              "lng": 18.95647,
              "delivery_available": true,
              "price_level": 2,
              "taxonomy_groups": [
                "pizza_italian"
              ],
              "taxonomy_cats": [
                "pizza"
              ],
              "taxonomy_tags": [
                "delivery"
              ],
              "maps_rating": 4.2,
              "maps_ratings_total": 1452,
              "opening_hours": {
                "periods": [
                  {
                    "open": {
                      "day": 0,
                      "time": "1200"
                    },
                    "close": {
                      "day": 0,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 1,
                      "time": "1200"
                    },
                    "close": {
                      "day": 1,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 2,
                      "time": "1200"
                    },
                    "close": {
                      "day": 2,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 3,
                      "time": "1200"
                    },
                    "close": {
                      "day": 3,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 4,
                      "time": "1200"
                    },
                    "close": {
                      "day": 4,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 5,
                      "time": "1200"
                    },
                    "close": {
                      "day": 5,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 6,
                      "time": "1200"
                    },
                    "close": {
                      "day": 6,
                      "time": "2300"
                    }
                  }
                ],
                "open_now": true,
                "weekday_text": [
                  "Monday: 12:00 – 10:00 PM",
                  "Tuesday: 12:00 – 10:00 PM",
                  "Wednesday: 12:00 – 10:00 PM",
                  "Thursday: 12:00 – 10:00 PM",
                  "Friday: 12:00 – 11:00 PM",
                  "Saturday: 12:00 – 11:00 PM",
                  "Sunday: 12:00 – 10:00 PM"
                ]
              },
              "phone": "32 288 64 71",
              "website": "http://kallzone.pl/",
              "image_url": "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70.jpg",
              "photo_gallery": [
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_1.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_2.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_3.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_4.jpg"
              ]
            }
          ],
          "menuItems": []
        },
        "timestamp": 1777972824882
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
        "timestamp": 1777972824982
      },
      {
        "role": "assistant",
        "text": "Mam 4 miejsc w Piekary Śląskie. Którą restaurację wybierasz? (Możesz powiedzieć numer albo nazwę.)",
        "surfaceKey": "CHOOSE_RESTAURANT",
        "entities": {
          "restaurants": [
            {
              "id": "[redacted]",
              "name": "Tasty King Kebab",
              "address": "ul. Bytomska 70",
              "city": "Piekary Śląskie",
              "cuisine_type": "Kebab",
              "lat": 50.38587,
              "lng": 18.94712,
              "delivery_available": true,
              "price_level": 2,
              "taxonomy_groups": [
                "grill"
              ],
              "taxonomy_cats": [
                "kebab"
              ],
              "taxonomy_tags": [
                "delivery"
              ],
              "maps_rating": 4.2,
              "maps_ratings_total": 1238,
              "opening_hours": {
                "periods": [
                  {
                    "open": {
                      "day": 0,
                      "time": "1000"
                    },
                    "close": {
                      "day": 1,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 1,
                      "time": "1000"
                    },
                    "close": {
                      "day": 2,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 2,
                      "time": "1000"
                    },
                    "close": {
                      "day": 3,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 3,
                      "time": "1000"
                    },
                    "close": {
                      "day": 4,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 4,
                      "time": "1000"
                    },
                    "close": {
                      "day": 5,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 5,
                      "time": "1000"
                    },
                    "close": {
                      "day": 6,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 6,
                      "time": "1000"
                    },
                    "close": {
                      "day": 0,
                      "time": "0000"
                    }
                  }
                ],
                "open_now": true,
                "weekday_text": [
                  "Monday: 10:00 AM – 12:00 AM",
                  "Tuesday: 10:00 AM – 12:00 AM",
                  "Wednesday: 10:00 AM – 12:00 AM",
                  "Thursday: 10:00 AM – 12:00 AM",
                  "Friday: 10:00 AM – 12:00 AM",
                  "Saturday: 10:00 AM – 12:00 AM",
                  "Sunday: 10:00 AM – 12:00 AM"
                ]
              },
              "phone": "729 324 218",
              "website": null,
              "image_url": "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7.jpg",
              "photo_gallery": [
                "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7.jpg",
                "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_1.jpg",
                "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_2.jpg",
                "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_3.jpg",
                "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_4.jpg"
              ],
              "item_match_score": 140,
              "matched_menu_items": [
                "Pita Rollo",
                "Kebab amerykański",
                "Pita Rollo z serem"
              ]
            },
            {
              "id": "[redacted]",
              "name": "Dwór Hubertus",
              "address": "ul. Inwalidów Wojennych 72",
              "city": "Piekary Śląskie",
              "cuisine_type": "Śląska / Europejska",
              "lat": 50.39233,
              "lng": 18.94243,
              "delivery_available": true,
              "price_level": 2,
              "taxonomy_groups": [],
              "taxonomy_cats": [],
              "taxonomy_tags": [
                "delivery"
              ],
              "maps_rating": 4.2,
              "maps_ratings_total": 785,
              "opening_hours": {
                "periods": [
                  {
                    "open": {
                      "day": 0,
                      "time": "1200"
                    },
                    "close": {
                      "day": 0,
                      "time": "2000"
                    }
                  },
                  {
                    "open": {
                      "day": 1,
                      "time": "1100"
                    },
                    "close": {
                      "day": 1,
                      "time": "2100"
                    }
                  },
                  {
                    "open": {
                      "day": 2,
                      "time": "1100"
                    },
                    "close": {
                      "day": 2,
                      "time": "2100"
                    }
                  },
                  {
                    "open": {
                      "day": 3,
                      "time": "1100"
                    },
                    "close": {
                      "day": 3,
                      "time": "2100"
                    }
                  },
                  {
                    "open": {
                      "day": 4,
                      "time": "1100"
                    },
                    "close": {
                      "day": 4,
                      "time": "2100"
                    }
                  },
                  {
                    "open": {
                      "day": 5,
                      "time": "1100"
                    },
                    "close": {
                      "day": 5,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 6,
                      "time": "1100"
                    },
                    "close": {
                      "day": 6,
                      "time": "2200"
                    }
                  }
                ],
                "open_now": true,
                "weekday_text": [
                  "Monday: 11:00 AM – 9:00 PM",
                  "Tuesday: 11:00 AM – 9:00 PM",
                  "Wednesday: 11:00 AM – 9:00 PM",
                  "Thursday: 11:00 AM – 9:00 PM",
                  "Friday: 11:00 AM – 10:00 PM",
                  "Saturday: 11:00 AM – 10:00 PM",
                  "Sunday: 12:00 – 8:00 PM"
                ]
              },
              "phone": "32 767 85 55",
              "website": "https://dworhubertus.pl/",
              "image_url": "/images/restaurants/af8448ef-974b-46c8-a4ae-b04b8dc7c9f8.jpg",
              "photo_gallery": null,
              "item_match_score": 140,
              "matched_menu_items": [
                "Gyros z frytkami i tzatziki"
              ]
            },
            {
              "id": "[redacted]",
              "name": "Callzone",
              "address": "ul. Księdza Piotra Skargi 3",
              "city": "Piekary Śląskie",
              "cuisine_type": "Pizzeria",
              "lat": 50.38594,
              "lng": 18.95647,
              "delivery_available": true,
              "price_level": 2,
              "taxonomy_groups": [
                "pizza_italian"
              ],
              "taxonomy_cats": [
                "pizza"
              ],
              "taxonomy_tags": [
                "delivery"
              ],
              "maps_rating": 4.2,
              "maps_ratings_total": 1452,
              "opening_hours": {
                "periods": [
                  {
                    "open": {
                      "day": 0,
                      "time": "1200"
                    },
                    "close": {
                      "day": 0,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 1,
                      "time": "1200"
                    },
                    "close": {
                      "day": 1,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 2,
                      "time": "1200"
                    },
                    "close": {
                      "day": 2,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 3,
                      "time": "1200"
                    },
                    "close": {
                      "day": 3,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 4,
                      "time": "1200"
                    },
                    "close": {
                      "day": 4,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 5,
                      "time": "1200"
                    },
                    "close": {
                      "day": 5,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 6,
                      "time": "1200"
                    },
                    "close": {
                      "day": 6,
                      "time": "2300"
                    }
                  }
                ],
                "open_now": true,
                "weekday_text": [
                  "Monday: 12:00 – 10:00 PM",
                  "Tuesday: 12:00 – 10:00 PM",
                  "Wednesday: 12:00 – 10:00 PM",
                  "Thursday: 12:00 – 10:00 PM",
                  "Friday: 12:00 – 11:00 PM",
                  "Saturday: 12:00 – 11:00 PM",
                  "Sunday: 12:00 – 10:00 PM"
                ]
              },
              "phone": "32 288 64 71",
              "website": "http://kallzone.pl/",
              "image_url": "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70.jpg",
              "photo_gallery": [
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_1.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_2.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_3.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_4.jpg"
              ],
              "item_match_score": 140,
              "matched_menu_items": [
                "Bowl Gyros-Halloumi"
              ]
            },
            {
              "id": "[redacted]",
              "name": "Klaps Burgers",
              "address": "ul. Piotra Skargi 15",
              "city": "Piekary Śląskie",
              "cuisine_type": "Amerykańska",
              "lat": 50.38643,
              "lng": 18.95422,
              "delivery_available": true,
              "price_level": 2,
              "taxonomy_groups": [
                "fast_food"
              ],
              "taxonomy_cats": [
                "burgers"
              ],
              "taxonomy_tags": [
                "quick",
                "delivery"
              ],
              "maps_rating": 4.3,
              "maps_ratings_total": 2693,
              "opening_hours": {
                "periods": [
                  {
                    "open": {
                      "day": 0,
                      "time": "1230"
                    },
                    "close": {
                      "day": 0,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 3,
                      "time": "1230"
                    },
                    "close": {
                      "day": 3,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 4,
                      "time": "1230"
                    },
                    "close": {
                      "day": 4,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 5,
                      "time": "1230"
                    },
                    "close": {
                      "day": 5,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 6,
                      "time": "1230"
                    },
                    "close": {
                      "day": 6,
                      "time": "2200"
                    }
                  }
                ],
                "open_now": true,
                "weekday_text": [
                  "Monday: Closed",
                  "Tuesday: Closed",
                  "Wednesday: 12:30 – 10:00 PM",
                  "Thursday: 12:30 – 10:00 PM",
                  "Friday: 12:30 – 10:00 PM",
                  "Saturday: 12:30 – 10:00 PM",
                  "Sunday: 12:30 – 10:00 PM"
                ]
              },
              "phone": "570 377 377",
              "website": "http://www.klapsbar.pl/",
              "image_url": "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea.jpg",
              "photo_gallery": [
                "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea.jpg",
                "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_1.jpg",
                "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_2.jpg",
                "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_3.jpg",
                "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_4.jpg"
              ],
              "item_match_score": 120,
              "matched_menu_items": [
                "Milczenie Wola"
              ]
            }
          ],
          "menuItems": []
        },
        "timestamp": 1777972825284
      },
      {
        "role": "user",
        "text": "z ostrym sosem",
        "entities": {
          "intent": "select_restaurant",
          "entities": {
            "location": null,
            "cuisine": null,
            "quantity": 1,
            "restaurant": null,
            "restaurantId": null,
            "dish": null,
            "items": null,
            "raw": "z ostrym sosem"
          }
        },
        "timestamp": 1777972825426
      },
      {
        "role": "assistant",
        "text": "Nie wiem którą restaurację z listy masz na myśli. Wybierz numer od 1 do 4 lub powiedz \"cofnij\".",
        "surfaceKey": null,
        "entities": {
          "restaurants": [],
          "menuItems": []
        },
        "timestamp": 1777972825427
      }
    ],
    "entityCache": {
      "restaurants": [
        {
          "id": "[redacted]",
          "name": "Tasty King Kebab",
          "position": 1,
          "timestamp": 1777972825284
        },
        {
          "id": "[redacted]",
          "name": "Dwór Hubertus",
          "position": 2,
          "timestamp": 1777972825284
        },
        {
          "id": "[redacted]",
          "name": "Callzone",
          "position": 3,
          "timestamp": 1777972825284
        },
        {
          "id": "[redacted]",
          "name": "Klaps Burgers",
          "position": 4,
          "timestamp": 1777972825284
        }
      ],
      "items": [],
      "lastListType": "restaurants"
    },
    "currentRestaurant": null,
    "lockedRestaurantId": null,
    "lastUpdated": 1777972825426,
    "last_location": "Piekary Śląskie",
    "last_restaurants_list": [
      {
        "id": "[redacted]",
        "name": "Tasty King Kebab",
        "address": "ul. Bytomska 70",
        "city": "Piekary Śląskie",
        "cuisine_type": "Kebab",
        "lat": 50.38587,
        "lng": 18.94712,
        "delivery_available": true,
        "price_level": 2,
        "taxonomy_groups": [
          "grill"
        ],
        "taxonomy_cats": [
          "kebab"
        ],
        "taxonomy_tags": [
          "delivery"
        ],
        "maps_rating": 4.2,
        "maps_ratings_total": 1238,
        "opening_hours": {
          "periods": [
            {
              "open": {
                "day": 0,
                "time": "1000"
              },
              "close": {
                "day": 1,
                "time": "0000"
              }
            },
            {
              "open": {
                "day": 1,
                "time": "1000"
              },
              "close": {
                "day": 2,
                "time": "0000"
              }
            },
            {
              "open": {
                "day": 2,
                "time": "1000"
              },
              "close": {
                "day": 3,
                "time": "0000"
              }
            },
            {
              "open": {
                "day": 3,
                "time": "1000"
              },
              "close": {
                "day": 4,
                "time": "0000"
              }
            },
            {
              "open": {
                "day": 4,
                "time": "1000"
              },
              "close": {
                "day": 5,
                "time": "0000"
              }
            },
            {
              "open": {
                "day": 5,
                "time": "1000"
              },
              "close": {
                "day": 6,
                "time": "0000"
              }
            },
            {
              "open": {
                "day": 6,
                "time": "1000"
              },
              "close": {
                "day": 0,
                "time": "0000"
              }
            }
          ],
          "open_now": true,
          "weekday_text": [
            "Monday: 10:00 AM – 12:00 AM",
            "Tuesday: 10:00 AM – 12:00 AM",
            "Wednesday: 10:00 AM – 12:00 AM",
            "Thursday: 10:00 AM – 12:00 AM",
            "Friday: 10:00 AM – 12:00 AM",
            "Saturday: 10:00 AM – 12:00 AM",
            "Sunday: 10:00 AM – 12:00 AM"
          ]
        },
        "phone": "729 324 218",
        "website": null,
        "image_url": "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7.jpg",
        "photo_gallery": [
          "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7.jpg",
          "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_1.jpg",
          "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_2.jpg",
          "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_3.jpg",
          "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_4.jpg"
        ],
        "item_match_score": 140,
        "matched_menu_items": [
          "Pita Rollo",
          "Kebab amerykański",
          "Pita Rollo z serem"
        ]
      },
      {
        "id": "[redacted]",
        "name": "Dwór Hubertus",
        "address": "ul. Inwalidów Wojennych 72",
        "city": "Piekary Śląskie",
        "cuisine_type": "Śląska / Europejska",
        "lat": 50.39233,
        "lng": 18.94243,
        "delivery_available": true,
        "price_level": 2,
        "taxonomy_groups": [],
        "taxonomy_cats": [],
        "taxonomy_tags": [
          "delivery"
        ],
        "maps_rating": 4.2,
        "maps_ratings_total": 785,
        "opening_hours": {
          "periods": [
            {
              "open": {
                "day": 0,
                "time": "1200"
              },
              "close": {
                "day": 0,
                "time": "2000"
              }
            },
            {
              "open": {
                "day": 1,
                "time": "1100"
              },
              "close": {
                "day": 1,
                "time": "2100"
              }
            },
            {
              "open": {
                "day": 2,
                "time": "1100"
              },
              "close": {
                "day": 2,
                "time": "2100"
              }
            },
            {
              "open": {
                "day": 3,
                "time": "1100"
              },
              "close": {
                "day": 3,
                "time": "2100"
              }
            },
            {
              "open": {
                "day": 4,
                "time": "1100"
              },
              "close": {
                "day": 4,
                "time": "2100"
              }
            },
            {
              "open": {
                "day": 5,
                "time": "1100"
              },
              "close": {
                "day": 5,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 6,
                "time": "1100"
              },
              "close": {
                "day": 6,
                "time": "2200"
              }
            }
          ],
          "open_now": true,
          "weekday_text": [
            "Monday: 11:00 AM – 9:00 PM",
            "Tuesday: 11:00 AM – 9:00 PM",
            "Wednesday: 11:00 AM – 9:00 PM",
            "Thursday: 11:00 AM – 9:00 PM",
            "Friday: 11:00 AM – 10:00 PM",
            "Saturday: 11:00 AM – 10:00 PM",
            "Sunday: 12:00 – 8:00 PM"
          ]
        },
        "phone": "32 767 85 55",
        "website": "https://dworhubertus.pl/",
        "image_url": "/images/restaurants/af8448ef-974b-46c8-a4ae-b04b8dc7c9f8.jpg",
        "photo_gallery": null,
        "item_match_score": 140,
        "matched_menu_items": [
          "Gyros z frytkami i tzatziki"
        ]
      },
      {
        "id": "[redacted]",
        "name": "Callzone",
        "address": "ul. Księdza Piotra Skargi 3",
        "city": "Piekary Śląskie",
        "cuisine_type": "Pizzeria",
        "lat": 50.38594,
        "lng": 18.95647,
        "delivery_available": true,
        "price_level": 2,
        "taxonomy_groups": [
          "pizza_italian"
        ],
        "taxonomy_cats": [
          "pizza"
        ],
        "taxonomy_tags": [
          "delivery"
        ],
        "maps_rating": 4.2,
        "maps_ratings_total": 1452,
        "opening_hours": {
          "periods": [
            {
              "open": {
                "day": 0,
                "time": "1200"
              },
              "close": {
                "day": 0,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 1,
                "time": "1200"
              },
              "close": {
                "day": 1,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 2,
                "time": "1200"
              },
              "close": {
                "day": 2,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 3,
                "time": "1200"
              },
              "close": {
                "day": 3,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 4,
                "time": "1200"
              },
              "close": {
                "day": 4,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 5,
                "time": "1200"
              },
              "close": {
                "day": 5,
                "time": "2300"
              }
            },
            {
              "open": {
                "day": 6,
                "time": "1200"
              },
              "close": {
                "day": 6,
                "time": "2300"
              }
            }
          ],
          "open_now": true,
          "weekday_text": [
            "Monday: 12:00 – 10:00 PM",
            "Tuesday: 12:00 – 10:00 PM",
            "Wednesday: 12:00 – 10:00 PM",
            "Thursday: 12:00 – 10:00 PM",
            "Friday: 12:00 – 11:00 PM",
            "Saturday: 12:00 – 11:00 PM",
            "Sunday: 12:00 – 10:00 PM"
          ]
        },
        "phone": "32 288 64 71",
        "website": "http://kallzone.pl/",
        "image_url": "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70.jpg",
        "photo_gallery": [
          "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70.jpg",
          "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_1.jpg",
          "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_2.jpg",
          "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_3.jpg",
          "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_4.jpg"
        ],
        "item_match_score": 140,
        "matched_menu_items": [
          "Bowl Gyros-Halloumi"
        ]
      },
      {
        "id": "[redacted]",
        "name": "Klaps Burgers",
        "address": "ul. Piotra Skargi 15",
        "city": "Piekary Śląskie",
        "cuisine_type": "Amerykańska",
        "lat": 50.38643,
        "lng": 18.95422,
        "delivery_available": true,
        "price_level": 2,
        "taxonomy_groups": [
          "fast_food"
        ],
        "taxonomy_cats": [
          "burgers"
        ],
        "taxonomy_tags": [
          "quick",
          "delivery"
        ],
        "maps_rating": 4.3,
        "maps_ratings_total": 2693,
        "opening_hours": {
          "periods": [
            {
              "open": {
                "day": 0,
                "time": "1230"
              },
              "close": {
                "day": 0,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 3,
                "time": "1230"
              },
              "close": {
                "day": 3,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 4,
                "time": "1230"
              },
              "close": {
                "day": 4,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 5,
                "time": "1230"
              },
              "close": {
                "day": 5,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 6,
                "time": "1230"
              },
              "close": {
                "day": 6,
                "time": "2200"
              }
            }
          ],
          "open_now": true,
          "weekday_text": [
            "Monday: Closed",
            "Tuesday: Closed",
            "Wednesday: 12:30 – 10:00 PM",
            "Thursday: 12:30 – 10:00 PM",
            "Friday: 12:30 – 10:00 PM",
            "Saturday: 12:30 – 10:00 PM",
            "Sunday: 12:30 – 10:00 PM"
          ]
        },
        "phone": "570 377 377",
        "website": "http://www.klapsbar.pl/",
        "image_url": "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea.jpg",
        "photo_gallery": [
          "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea.jpg",
          "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_1.jpg",
          "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_2.jpg",
          "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_3.jpg",
          "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_4.jpg"
        ],
        "item_match_score": 120,
        "matched_menu_items": [
          "Milczenie Wola"
        ]
      }
    ],
    "orderMode": "restaurant_selected",
    "dialogStack": [
      {
        "surfaceKey": "CHOOSE_RESTAURANT",
        "facts": {
          "city": "Piekary Śląskie",
          "restaurantCount": 2
        },
        "renderedText": "Mam 2 miejsc w Piekary Śląskie. Którą restaurację wybierasz? (Możesz powiedzieć numer albo nazwę.)",
        "timestamp": 1777972824621
      },
      {
        "surfaceKey": "CHOOSE_RESTAURANT",
        "facts": {
          "city": "Piekary Śląskie",
          "restaurantCount": 2
        },
        "renderedText": "Mam 2 miejsc w Piekary Śląskie. Którą restaurację wybierasz? (Możesz powiedzieć numer albo nazwę.)",
        "timestamp": 1777972824882
      },
      {
        "surfaceKey": "CHOOSE_RESTAURANT",
        "facts": {
          "city": "Piekary Śląskie",
          "restaurantCount": 4
        },
        "renderedText": "Mam 4 miejsc w Piekary Śląskie. Którą restaurację wybierasz? (Możesz powiedzieć numer albo nazwę.)",
        "timestamp": 1777972825283
      }
    ],
    "dialogStackIndex": 2
  },
  "locationRestaurants": [],
  "timestamp": "2026-05-05T09:20:25.427Z",
  "turn_id": "turn_1777972825427_wsujs"
}
```

### Scenariusz: A05 (Step 4)
- **Input:** "z ostrym sosem"
- **Expected (Allowed):** find_nearby, create_order, clarify_order
- **Actual Intent:** select_restaurant
- **Status Code:** 200
- **Error details:**
```json
{
  "ok": true,
  "session_id": "chaos-A05-1777972825438",
  "text": "Nie wiem którą restaurację z listy masz na myśli. Wybierz numer od 1 do 4 lub powiedz \"cofnij\".",
  "reply": "Nie wiem którą restaurację z listy masz na myśli. Wybierz numer od 1 do 4 lub powiedz \"cofnij\".",
  "tts_text": "Nie wiem którą restaurację z listy masz na myśli. Wybierz numer od 1 do 4 lub powiedz \"cofnij\".",
  "audioContent": null,
  "intent": "select_restaurant",
  "phase": "idle",
  "should_reply": true,
  "actions": [],
  "restaurants": [],
  "menuItems": [],
  "menu": [],
  "cart": {
    "items": [],
    "total": 0
  },
  "recommendations": [],
  "meta": {
    "latency_total_ms": 95,
    "source": "context_lock",
    "styling_ms": 0,
    "tts_ms": 0,
    "cartHash": "empty",
    "state": {
      "conversationPhase": "idle",
      "currentRestaurant": null,
      "orderMode": "restaurant_selected"
    },
    "checkoutProgress": {
      "requiredFields": [
        "name",
        "phone",
        "address"
      ],
      "filledFields": [],
      "missingFields": [
        "name",
        "phone",
        "address"
      ],
      "completion": 0,
      "complete": false,
      "readyToSubmit": false,
      "cartItems": 0,
      "cartTotal": 0,
      "draft": {
        "name": "",
        "phone": "",
        "address": "",
        "notes": ""
      }
    },
    "guard_trace": [
      "preNluOverrideGuard",
      "transactionLockGuard",
      "orderingAffirmationGuard",
      "escapeOverrideGuard",
      "expectedContextGuard",
      "confidenceFloorGuard",
      "smartUnlockGuard",
      "continuityGuard",
      "strongContinuityGuard",
      "floatingOrderCleanupGuard",
      "cartMutationGuard",
      "uxGuard1",
      "uxGuard2",
      "confirmGuard"
    ],
    "pipeline_trace": [
      "hydrated",
      "menu_loaded",
      "intent_resolved:select_restaurant",
      "guard_override:none",
      "intent_finalized:select_restaurant",
      "handler:select_restaurant",
      "order_mode_event:SELECT_RESTAURANT",
      "order_mode_state:neutral->restaurant_selected",
      "ORDER_MODE_TRACE:{\"previousState\":\"neutral\",\"event\":\"SELECT_RESTAURANT\",\"nextState\":\"restaurant_selected\",\"allowed\":true,\"changed\":true,\"intent\":\"select_restaurant\"}",
      "CHECKOUT_PROGRESS_TRACE:{\"phase\":\"idle\",\"completion\":0,\"complete\":false,\"readyToSubmit\":false,\"missingFields\":[\"name\",\"phone\",\"address\"]}",
      "CART_EVENT_TRACE:{\"emitted\":false,\"stateMutationCompleted\":true,\"intent\":\"select_restaurant\",\"detectedBy\":\"whitelist\",\"pre\":{\"itemCount\":0,\"total\":0},\"post\":{\"itemCount\":0,\"total\":0},\"cartVersion\":null,\"totalItems\":null,\"totalPrice\":null}",
      "reco_skipped:general:state_ok"
    ],
    "orderModeTrace": {
      "previousState": "neutral",
      "event": "SELECT_RESTAURANT",
      "nextState": "restaurant_selected",
      "allowed": true,
      "changed": true,
      "intent": "select_restaurant"
    },
    "ORDER_MODE_TRACE": {
      "previousState": "neutral",
      "event": "SELECT_RESTAURANT",
      "nextState": "restaurant_selected",
      "allowed": true,
      "changed": true,
      "intent": "select_restaurant"
    },
    "checkoutProgressTrace": {
      "phase": "idle",
      "completion": 0,
      "complete": false,
      "readyToSubmit": false,
      "missingFields": [
        "name",
        "phone",
        "address"
      ]
    },
    "CHECKOUT_PROGRESS_TRACE": {
      "phase": "idle",
      "completion": 0,
      "complete": false,
      "readyToSubmit": false,
      "missingFields": [
        "name",
        "phone",
        "address"
      ]
    },
    "cartEventTrace": {
      "emitted": false,
      "stateMutationCompleted": true,
      "intent": "select_restaurant",
      "detectedBy": "whitelist",
      "pre": {
        "itemCount": 0,
        "total": 0
      },
      "post": {
        "itemCount": 0,
        "total": 0
      },
      "cartVersion": null,
      "totalItems": null,
      "totalPrice": null
    },
    "CART_EVENT_TRACE": {
      "emitted": false,
      "stateMutationCompleted": true,
      "intent": "select_restaurant",
      "detectedBy": "whitelist",
      "pre": {
        "itemCount": 0,
        "total": 0
      },
      "post": {
        "itemCount": 0,
        "total": 0
      },
      "cartVersion": null,
      "totalItems": null,
      "totalPrice": null
    },
    "recoContext": {
      "context": "browsing_menu",
      "mode": "ok",
      "reason": "menu_browsing",
      "cooldownRemainingMs": 0
    }
  },
  "context": {
    "status": "active",
    "closedReason": null,
    "closedAt": null,
    "conversationPhase": "idle",
    "expectedContext": null,
    "lastIntent": "select_restaurant",
    "lastRestaurant": null,
    "lastRestaurantsList": [],
    "lastRestaurants": [
      {
        "id": "[redacted]",
        "name": "Tasty King Kebab",
        "index": 1,
        "city": "Piekary Śląskie"
      },
      {
        "id": "[redacted]",
        "name": "Dwór Hubertus",
        "index": 2,
        "city": "Piekary Śląskie"
      },
      {
        "id": "[redacted]",
        "name": "Callzone",
        "index": 3,
        "city": "Piekary Śląskie"
      },
      {
        "id": "[redacted]",
        "name": "Klaps Burgers",
        "index": 4,
        "city": "Piekary Śląskie"
      }
    ],
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
        "text": "Mam 2 miejsc w Piekary Śląskie. Którą restaurację wybierasz? (Możesz powiedzieć numer albo nazwę.)",
        "surfaceKey": "CHOOSE_RESTAURANT",
        "entities": {
          "restaurants": [
            {
              "id": "[redacted]",
              "name": "Pizzeria Monte Carlo",
              "address": "Ul. Stanisława Maczka 22",
              "city": "Piekary Śląskie",
              "cuisine_type": null,
              "lat": null,
              "lng": null,
              "delivery_available": true,
              "price_level": 2,
              "taxonomy_groups": [
                "pizza_italian"
              ],
              "taxonomy_cats": [
                "pizza"
              ],
              "taxonomy_tags": [
                "delivery"
              ],
              "maps_rating": 4.3,
              "maps_ratings_total": 1675,
              "opening_hours": {
                "periods": [
                  {
                    "open": {
                      "day": 0,
                      "time": "1100"
                    },
                    "close": {
                      "day": 0,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 1,
                      "time": "1100"
                    },
                    "close": {
                      "day": 1,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 2,
                      "time": "1100"
                    },
                    "close": {
                      "day": 2,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 3,
                      "time": "1100"
                    },
                    "close": {
                      "day": 3,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 4,
                      "time": "1100"
                    },
                    "close": {
                      "day": 4,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 5,
                      "time": "1100"
                    },
                    "close": {
                      "day": 6,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 6,
                      "time": "1100"
                    },
                    "close": {
                      "day": 0,
                      "time": "0000"
                    }
                  }
                ],
                "open_now": true,
                "weekday_text": [
                  "Monday: 11:00 AM – 11:00 PM",
                  "Tuesday: 11:00 AM – 11:00 PM",
                  "Wednesday: 11:00 AM – 11:00 PM",
                  "Thursday: 11:00 AM – 11:00 PM",
                  "Friday: 11:00 AM – 12:00 AM",
                  "Saturday: 11:00 AM – 12:00 AM",
                  "Sunday: 11:00 AM – 11:00 PM"
                ]
              },
              "phone": "515 532 617",
              "website": "http://piekary.pubmontecarlo.pl/",
              "image_url": "/images/restaurants/83566974-1017-4408-90ee-2571ccc06978.jpg",
              "photo_gallery": [
                "/images/restaurants/83566974-1017-4408-90ee-2571ccc06978.jpg",
                "/images/restaurants/83566974-1017-4408-90ee-2571ccc06978_1.jpg",
                "/images/restaurants/83566974-1017-4408-90ee-2571ccc06978_2.jpg",
                "/images/restaurants/83566974-1017-4408-90ee-2571ccc06978_3.jpg",
                "/images/restaurants/83566974-1017-4408-90ee-2571ccc06978_4.jpg"
              ]
            },
            {
              "id": "[redacted]",
              "name": "Callzone",
              "address": "ul. Księdza Piotra Skargi 3",
              "city": "Piekary Śląskie",
              "cuisine_type": "Pizzeria",
              "lat": 50.38594,
              "lng": 18.95647,
              "delivery_available": true,
              "price_level": 2,
              "taxonomy_groups": [
                "pizza_italian"
              ],
              "taxonomy_cats": [
                "pizza"
              ],
              "taxonomy_tags": [
                "delivery"
              ],
              "maps_rating": 4.2,
              "maps_ratings_total": 1452,
              "opening_hours": {
                "periods": [
                  {
                    "open": {
                      "day": 0,
                      "time": "1200"
                    },
                    "close": {
                      "day": 0,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 1,
                      "time": "1200"
                    },
                    "close": {
                      "day": 1,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 2,
                      "time": "1200"
                    },
                    "close": {
                      "day": 2,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 3,
                      "time": "1200"
                    },
                    "close": {
                      "day": 3,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 4,
                      "time": "1200"
                    },
                    "close": {
                      "day": 4,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 5,
                      "time": "1200"
                    },
                    "close": {
                      "day": 5,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 6,
                      "time": "1200"
                    },
                    "close": {
                      "day": 6,
                      "time": "2300"
                    }
                  }
                ],
                "open_now": true,
                "weekday_text": [
                  "Monday: 12:00 – 10:00 PM",
                  "Tuesday: 12:00 – 10:00 PM",
                  "Wednesday: 12:00 – 10:00 PM",
                  "Thursday: 12:00 – 10:00 PM",
                  "Friday: 12:00 – 11:00 PM",
                  "Saturday: 12:00 – 11:00 PM",
                  "Sunday: 12:00 – 10:00 PM"
                ]
              },
              "phone": "32 288 64 71",
              "website": "http://kallzone.pl/",
              "image_url": "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70.jpg",
              "photo_gallery": [
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_1.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_2.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_3.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_4.jpg"
              ]
            }
          ],
          "menuItems": []
        },
        "timestamp": 1777972826218
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
        "timestamp": 1777972826347
      },
      {
        "role": "assistant",
        "text": "Mam 4 miejsc w Piekary Śląskie. Którą restaurację wybierasz? (Możesz powiedzieć numer albo nazwę.)",
        "surfaceKey": "CHOOSE_RESTAURANT",
        "entities": {
          "restaurants": [
            {
              "id": "[redacted]",
              "name": "Tasty King Kebab",
              "address": "ul. Bytomska 70",
              "city": "Piekary Śląskie",
              "cuisine_type": "Kebab",
              "lat": 50.38587,
              "lng": 18.94712,
              "delivery_available": true,
              "price_level": 2,
              "taxonomy_groups": [
                "grill"
              ],
              "taxonomy_cats": [
                "kebab"
              ],
              "taxonomy_tags": [
                "delivery"
              ],
              "maps_rating": 4.2,
              "maps_ratings_total": 1238,
              "opening_hours": {
                "periods": [
                  {
                    "open": {
                      "day": 0,
                      "time": "1000"
                    },
                    "close": {
                      "day": 1,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 1,
                      "time": "1000"
                    },
                    "close": {
                      "day": 2,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 2,
                      "time": "1000"
                    },
                    "close": {
                      "day": 3,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 3,
                      "time": "1000"
                    },
                    "close": {
                      "day": 4,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 4,
                      "time": "1000"
                    },
                    "close": {
                      "day": 5,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 5,
                      "time": "1000"
                    },
                    "close": {
                      "day": 6,
                      "time": "0000"
                    }
                  },
                  {
                    "open": {
                      "day": 6,
                      "time": "1000"
                    },
                    "close": {
                      "day": 0,
                      "time": "0000"
                    }
                  }
                ],
                "open_now": true,
                "weekday_text": [
                  "Monday: 10:00 AM – 12:00 AM",
                  "Tuesday: 10:00 AM – 12:00 AM",
                  "Wednesday: 10:00 AM – 12:00 AM",
                  "Thursday: 10:00 AM – 12:00 AM",
                  "Friday: 10:00 AM – 12:00 AM",
                  "Saturday: 10:00 AM – 12:00 AM",
                  "Sunday: 10:00 AM – 12:00 AM"
                ]
              },
              "phone": "729 324 218",
              "website": null,
              "image_url": "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7.jpg",
              "photo_gallery": [
                "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7.jpg",
                "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_1.jpg",
                "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_2.jpg",
                "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_3.jpg",
                "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_4.jpg"
              ],
              "item_match_score": 140,
              "matched_menu_items": [
                "Pita Rollo",
                "Kebab amerykański",
                "Pita Rollo z serem"
              ]
            },
            {
              "id": "[redacted]",
              "name": "Dwór Hubertus",
              "address": "ul. Inwalidów Wojennych 72",
              "city": "Piekary Śląskie",
              "cuisine_type": "Śląska / Europejska",
              "lat": 50.39233,
              "lng": 18.94243,
              "delivery_available": true,
              "price_level": 2,
              "taxonomy_groups": [],
              "taxonomy_cats": [],
              "taxonomy_tags": [
                "delivery"
              ],
              "maps_rating": 4.2,
              "maps_ratings_total": 785,
              "opening_hours": {
                "periods": [
                  {
                    "open": {
                      "day": 0,
                      "time": "1200"
                    },
                    "close": {
                      "day": 0,
                      "time": "2000"
                    }
                  },
                  {
                    "open": {
                      "day": 1,
                      "time": "1100"
                    },
                    "close": {
                      "day": 1,
                      "time": "2100"
                    }
                  },
                  {
                    "open": {
                      "day": 2,
                      "time": "1100"
                    },
                    "close": {
                      "day": 2,
                      "time": "2100"
                    }
                  },
                  {
                    "open": {
                      "day": 3,
                      "time": "1100"
                    },
                    "close": {
                      "day": 3,
                      "time": "2100"
                    }
                  },
                  {
                    "open": {
                      "day": 4,
                      "time": "1100"
                    },
                    "close": {
                      "day": 4,
                      "time": "2100"
                    }
                  },
                  {
                    "open": {
                      "day": 5,
                      "time": "1100"
                    },
                    "close": {
                      "day": 5,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 6,
                      "time": "1100"
                    },
                    "close": {
                      "day": 6,
                      "time": "2200"
                    }
                  }
                ],
                "open_now": true,
                "weekday_text": [
                  "Monday: 11:00 AM – 9:00 PM",
                  "Tuesday: 11:00 AM – 9:00 PM",
                  "Wednesday: 11:00 AM – 9:00 PM",
                  "Thursday: 11:00 AM – 9:00 PM",
                  "Friday: 11:00 AM – 10:00 PM",
                  "Saturday: 11:00 AM – 10:00 PM",
                  "Sunday: 12:00 – 8:00 PM"
                ]
              },
              "phone": "32 767 85 55",
              "website": "https://dworhubertus.pl/",
              "image_url": "/images/restaurants/af8448ef-974b-46c8-a4ae-b04b8dc7c9f8.jpg",
              "photo_gallery": null,
              "item_match_score": 140,
              "matched_menu_items": [
                "Gyros z frytkami i tzatziki"
              ]
            },
            {
              "id": "[redacted]",
              "name": "Callzone",
              "address": "ul. Księdza Piotra Skargi 3",
              "city": "Piekary Śląskie",
              "cuisine_type": "Pizzeria",
              "lat": 50.38594,
              "lng": 18.95647,
              "delivery_available": true,
              "price_level": 2,
              "taxonomy_groups": [
                "pizza_italian"
              ],
              "taxonomy_cats": [
                "pizza"
              ],
              "taxonomy_tags": [
                "delivery"
              ],
              "maps_rating": 4.2,
              "maps_ratings_total": 1452,
              "opening_hours": {
                "periods": [
                  {
                    "open": {
                      "day": 0,
                      "time": "1200"
                    },
                    "close": {
                      "day": 0,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 1,
                      "time": "1200"
                    },
                    "close": {
                      "day": 1,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 2,
                      "time": "1200"
                    },
                    "close": {
                      "day": 2,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 3,
                      "time": "1200"
                    },
                    "close": {
                      "day": 3,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 4,
                      "time": "1200"
                    },
                    "close": {
                      "day": 4,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 5,
                      "time": "1200"
                    },
                    "close": {
                      "day": 5,
                      "time": "2300"
                    }
                  },
                  {
                    "open": {
                      "day": 6,
                      "time": "1200"
                    },
                    "close": {
                      "day": 6,
                      "time": "2300"
                    }
                  }
                ],
                "open_now": true,
                "weekday_text": [
                  "Monday: 12:00 – 10:00 PM",
                  "Tuesday: 12:00 – 10:00 PM",
                  "Wednesday: 12:00 – 10:00 PM",
                  "Thursday: 12:00 – 10:00 PM",
                  "Friday: 12:00 – 11:00 PM",
                  "Saturday: 12:00 – 11:00 PM",
                  "Sunday: 12:00 – 10:00 PM"
                ]
              },
              "phone": "32 288 64 71",
              "website": "http://kallzone.pl/",
              "image_url": "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70.jpg",
              "photo_gallery": [
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_1.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_2.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_3.jpg",
                "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_4.jpg"
              ],
              "item_match_score": 140,
              "matched_menu_items": [
                "Bowl Gyros-Halloumi"
              ]
            },
            {
              "id": "[redacted]",
              "name": "Klaps Burgers",
              "address": "ul. Piotra Skargi 15",
              "city": "Piekary Śląskie",
              "cuisine_type": "Amerykańska",
              "lat": 50.38643,
              "lng": 18.95422,
              "delivery_available": true,
              "price_level": 2,
              "taxonomy_groups": [
                "fast_food"
              ],
              "taxonomy_cats": [
                "burgers"
              ],
              "taxonomy_tags": [
                "quick",
                "delivery"
              ],
              "maps_rating": 4.3,
              "maps_ratings_total": 2693,
              "opening_hours": {
                "periods": [
                  {
                    "open": {
                      "day": 0,
                      "time": "1230"
                    },
                    "close": {
                      "day": 0,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 3,
                      "time": "1230"
                    },
                    "close": {
                      "day": 3,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 4,
                      "time": "1230"
                    },
                    "close": {
                      "day": 4,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 5,
                      "time": "1230"
                    },
                    "close": {
                      "day": 5,
                      "time": "2200"
                    }
                  },
                  {
                    "open": {
                      "day": 6,
                      "time": "1230"
                    },
                    "close": {
                      "day": 6,
                      "time": "2200"
                    }
                  }
                ],
                "open_now": true,
                "weekday_text": [
                  "Monday: Closed",
                  "Tuesday: Closed",
                  "Wednesday: 12:30 – 10:00 PM",
                  "Thursday: 12:30 – 10:00 PM",
                  "Friday: 12:30 – 10:00 PM",
                  "Saturday: 12:30 – 10:00 PM",
                  "Sunday: 12:30 – 10:00 PM"
                ]
              },
              "phone": "570 377 377",
              "website": "http://www.klapsbar.pl/",
              "image_url": "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea.jpg",
              "photo_gallery": [
                "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea.jpg",
                "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_1.jpg",
                "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_2.jpg",
                "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_3.jpg",
                "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_4.jpg"
              ],
              "item_match_score": 120,
              "matched_menu_items": [
                "Milczenie Wola"
              ]
            }
          ],
          "menuItems": []
        },
        "timestamp": 1777972826603
      },
      {
        "role": "user",
        "text": "z ostrym sosem",
        "entities": {
          "intent": "select_restaurant",
          "entities": {
            "location": null,
            "cuisine": null,
            "quantity": 1,
            "restaurant": null,
            "restaurantId": null,
            "dish": null,
            "items": null,
            "raw": "z ostrym sosem"
          }
        },
        "timestamp": 1777972826722
      },
      {
        "role": "assistant",
        "text": "Nie wiem którą restaurację z listy masz na myśli. Wybierz numer od 1 do 4 lub powiedz \"cofnij\".",
        "surfaceKey": null,
        "entities": {
          "restaurants": [],
          "menuItems": []
        },
        "timestamp": 1777972826723
      }
    ],
    "entityCache": {
      "restaurants": [
        {
          "id": "[redacted]",
          "name": "Tasty King Kebab",
          "position": 1,
          "timestamp": 1777972826603
        },
        {
          "id": "[redacted]",
          "name": "Dwór Hubertus",
          "position": 2,
          "timestamp": 1777972826603
        },
        {
          "id": "[redacted]",
          "name": "Callzone",
          "position": 3,
          "timestamp": 1777972826603
        },
        {
          "id": "[redacted]",
          "name": "Klaps Burgers",
          "position": 4,
          "timestamp": 1777972826603
        }
      ],
      "items": [],
      "lastListType": "restaurants"
    },
    "currentRestaurant": null,
    "lockedRestaurantId": null,
    "lastUpdated": 1777972826723,
    "last_location": "Piekary Śląskie",
    "last_restaurants_list": [
      {
        "id": "[redacted]",
        "name": "Tasty King Kebab",
        "address": "ul. Bytomska 70",
        "city": "Piekary Śląskie",
        "cuisine_type": "Kebab",
        "lat": 50.38587,
        "lng": 18.94712,
        "delivery_available": true,
        "price_level": 2,
        "taxonomy_groups": [
          "grill"
        ],
        "taxonomy_cats": [
          "kebab"
        ],
        "taxonomy_tags": [
          "delivery"
        ],
        "maps_rating": 4.2,
        "maps_ratings_total": 1238,
        "opening_hours": {
          "periods": [
            {
              "open": {
                "day": 0,
                "time": "1000"
              },
              "close": {
                "day": 1,
                "time": "0000"
              }
            },
            {
              "open": {
                "day": 1,
                "time": "1000"
              },
              "close": {
                "day": 2,
                "time": "0000"
              }
            },
            {
              "open": {
                "day": 2,
                "time": "1000"
              },
              "close": {
                "day": 3,
                "time": "0000"
              }
            },
            {
              "open": {
                "day": 3,
                "time": "1000"
              },
              "close": {
                "day": 4,
                "time": "0000"
              }
            },
            {
              "open": {
                "day": 4,
                "time": "1000"
              },
              "close": {
                "day": 5,
                "time": "0000"
              }
            },
            {
              "open": {
                "day": 5,
                "time": "1000"
              },
              "close": {
                "day": 6,
                "time": "0000"
              }
            },
            {
              "open": {
                "day": 6,
                "time": "1000"
              },
              "close": {
                "day": 0,
                "time": "0000"
              }
            }
          ],
          "open_now": true,
          "weekday_text": [
            "Monday: 10:00 AM – 12:00 AM",
            "Tuesday: 10:00 AM – 12:00 AM",
            "Wednesday: 10:00 AM – 12:00 AM",
            "Thursday: 10:00 AM – 12:00 AM",
            "Friday: 10:00 AM – 12:00 AM",
            "Saturday: 10:00 AM – 12:00 AM",
            "Sunday: 10:00 AM – 12:00 AM"
          ]
        },
        "phone": "729 324 218",
        "website": null,
        "image_url": "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7.jpg",
        "photo_gallery": [
          "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7.jpg",
          "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_1.jpg",
          "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_2.jpg",
          "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_3.jpg",
          "/images/restaurants/fc844513-2869-4f42-b04f-c21e1e4cceb7_4.jpg"
        ],
        "item_match_score": 140,
        "matched_menu_items": [
          "Pita Rollo",
          "Kebab amerykański",
          "Pita Rollo z serem"
        ]
      },
      {
        "id": "[redacted]",
        "name": "Dwór Hubertus",
        "address": "ul. Inwalidów Wojennych 72",
        "city": "Piekary Śląskie",
        "cuisine_type": "Śląska / Europejska",
        "lat": 50.39233,
        "lng": 18.94243,
        "delivery_available": true,
        "price_level": 2,
        "taxonomy_groups": [],
        "taxonomy_cats": [],
        "taxonomy_tags": [
          "delivery"
        ],
        "maps_rating": 4.2,
        "maps_ratings_total": 785,
        "opening_hours": {
          "periods": [
            {
              "open": {
                "day": 0,
                "time": "1200"
              },
              "close": {
                "day": 0,
                "time": "2000"
              }
            },
            {
              "open": {
                "day": 1,
                "time": "1100"
              },
              "close": {
                "day": 1,
                "time": "2100"
              }
            },
            {
              "open": {
                "day": 2,
                "time": "1100"
              },
              "close": {
                "day": 2,
                "time": "2100"
              }
            },
            {
              "open": {
                "day": 3,
                "time": "1100"
              },
              "close": {
                "day": 3,
                "time": "2100"
              }
            },
            {
              "open": {
                "day": 4,
                "time": "1100"
              },
              "close": {
                "day": 4,
                "time": "2100"
              }
            },
            {
              "open": {
                "day": 5,
                "time": "1100"
              },
              "close": {
                "day": 5,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 6,
                "time": "1100"
              },
              "close": {
                "day": 6,
                "time": "2200"
              }
            }
          ],
          "open_now": true,
          "weekday_text": [
            "Monday: 11:00 AM – 9:00 PM",
            "Tuesday: 11:00 AM – 9:00 PM",
            "Wednesday: 11:00 AM – 9:00 PM",
            "Thursday: 11:00 AM – 9:00 PM",
            "Friday: 11:00 AM – 10:00 PM",
            "Saturday: 11:00 AM – 10:00 PM",
            "Sunday: 12:00 – 8:00 PM"
          ]
        },
        "phone": "32 767 85 55",
        "website": "https://dworhubertus.pl/",
        "image_url": "/images/restaurants/af8448ef-974b-46c8-a4ae-b04b8dc7c9f8.jpg",
        "photo_gallery": null,
        "item_match_score": 140,
        "matched_menu_items": [
          "Gyros z frytkami i tzatziki"
        ]
      },
      {
        "id": "[redacted]",
        "name": "Callzone",
        "address": "ul. Księdza Piotra Skargi 3",
        "city": "Piekary Śląskie",
        "cuisine_type": "Pizzeria",
        "lat": 50.38594,
        "lng": 18.95647,
        "delivery_available": true,
        "price_level": 2,
        "taxonomy_groups": [
          "pizza_italian"
        ],
        "taxonomy_cats": [
          "pizza"
        ],
        "taxonomy_tags": [
          "delivery"
        ],
        "maps_rating": 4.2,
        "maps_ratings_total": 1452,
        "opening_hours": {
          "periods": [
            {
              "open": {
                "day": 0,
                "time": "1200"
              },
              "close": {
                "day": 0,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 1,
                "time": "1200"
              },
              "close": {
                "day": 1,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 2,
                "time": "1200"
              },
              "close": {
                "day": 2,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 3,
                "time": "1200"
              },
              "close": {
                "day": 3,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 4,
                "time": "1200"
              },
              "close": {
                "day": 4,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 5,
                "time": "1200"
              },
              "close": {
                "day": 5,
                "time": "2300"
              }
            },
            {
              "open": {
                "day": 6,
                "time": "1200"
              },
              "close": {
                "day": 6,
                "time": "2300"
              }
            }
          ],
          "open_now": true,
          "weekday_text": [
            "Monday: 12:00 – 10:00 PM",
            "Tuesday: 12:00 – 10:00 PM",
            "Wednesday: 12:00 – 10:00 PM",
            "Thursday: 12:00 – 10:00 PM",
            "Friday: 12:00 – 11:00 PM",
            "Saturday: 12:00 – 11:00 PM",
            "Sunday: 12:00 – 10:00 PM"
          ]
        },
        "phone": "32 288 64 71",
        "website": "http://kallzone.pl/",
        "image_url": "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70.jpg",
        "photo_gallery": [
          "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70.jpg",
          "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_1.jpg",
          "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_2.jpg",
          "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_3.jpg",
          "/images/restaurants/bd9f2244-7618-4071-aa96-52616a7b4c70_4.jpg"
        ],
        "item_match_score": 140,
        "matched_menu_items": [
          "Bowl Gyros-Halloumi"
        ]
      },
      {
        "id": "[redacted]",
        "name": "Klaps Burgers",
        "address": "ul. Piotra Skargi 15",
        "city": "Piekary Śląskie",
        "cuisine_type": "Amerykańska",
        "lat": 50.38643,
        "lng": 18.95422,
        "delivery_available": true,
        "price_level": 2,
        "taxonomy_groups": [
          "fast_food"
        ],
        "taxonomy_cats": [
          "burgers"
        ],
        "taxonomy_tags": [
          "quick",
          "delivery"
        ],
        "maps_rating": 4.3,
        "maps_ratings_total": 2693,
        "opening_hours": {
          "periods": [
            {
              "open": {
                "day": 0,
                "time": "1230"
              },
              "close": {
                "day": 0,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 3,
                "time": "1230"
              },
              "close": {
                "day": 3,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 4,
                "time": "1230"
              },
              "close": {
                "day": 4,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 5,
                "time": "1230"
              },
              "close": {
                "day": 5,
                "time": "2200"
              }
            },
            {
              "open": {
                "day": 6,
                "time": "1230"
              },
              "close": {
                "day": 6,
                "time": "2200"
              }
            }
          ],
          "open_now": true,
          "weekday_text": [
            "Monday: Closed",
            "Tuesday: Closed",
            "Wednesday: 12:30 – 10:00 PM",
            "Thursday: 12:30 – 10:00 PM",
            "Friday: 12:30 – 10:00 PM",
            "Saturday: 12:30 – 10:00 PM",
            "Sunday: 12:30 – 10:00 PM"
          ]
        },
        "phone": "570 377 377",
        "website": "http://www.klapsbar.pl/",
        "image_url": "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea.jpg",
        "photo_gallery": [
          "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea.jpg",
          "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_1.jpg",
          "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_2.jpg",
          "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_3.jpg",
          "/images/restaurants/569a7d29-57be-4224-bdf3-09c483415cea_4.jpg"
        ],
        "item_match_score": 120,
        "matched_menu_items": [
          "Milczenie Wola"
        ]
      }
    ],
    "orderMode": "restaurant_selected",
    "dialogStack": [
      {
        "surfaceKey": "CHOOSE_RESTAURANT",
        "facts": {
          "city": "Piekary Śląskie",
          "restaurantCount": 2
        },
        "renderedText": "Mam 2 miejsc w Piekary Śląskie. Którą restaurację wybierasz? (Możesz powiedzieć numer albo nazwę.)",
        "timestamp": 1777972825943
      },
      {
        "surfaceKey": "CHOOSE_RESTAURANT",
        "facts": {
          "city": "Piekary Śląskie",
          "restaurantCount": 2
        },
        "renderedText": "Mam 2 miejsc w Piekary Śląskie. Którą restaurację wybierasz? (Możesz powiedzieć numer albo nazwę.)",
        "timestamp": 1777972826218
      },
      {
        "surfaceKey": "CHOOSE_RESTAURANT",
        "facts": {
          "city": "Piekary Śląskie",
          "restaurantCount": 4
        },
        "renderedText": "Mam 4 miejsc w Piekary Śląskie. Którą restaurację wybierasz? (Możesz powiedzieć numer albo nazwę.)",
        "timestamp": 1777972826603
      }
    ],
    "dialogStackIndex": 2
  },
  "locationRestaurants": [],
  "timestamp": "2026-05-05T09:20:26.723Z",
  "turn_id": "turn_1777972826723_muo8e"
}
```

