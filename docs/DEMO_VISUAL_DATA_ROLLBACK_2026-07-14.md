# Demo visual data rollback — 2026-07-14

Zakres: odwracalne ukrycie fikcyjnego tenanta oraz korekta mapowań obrazów wykrytych w audycie Anti-Gravity. Dokument nie zawiera sekretów.

## Restauracja

| ID | Nazwa | Przed | Po |
|---|---|---:|---:|
| `4ad6b301-671b-4343-bf91-9bab7cda37b4` | Kebab u Orła | `is_active=true` | `is_active=false` |

## Pozycje menu

| ID | Nazwa | Stare `image_url` | Nowe `image_url` |
|---|---|---|---|
| `98f101f9-5890-41ea-826a-1341b9f82d23` | Pulled Pork Bowl Pikantny | `/menu/5/image-1077480255451094.jpeg` | `null` |
| `fc4bcc1b-b736-483d-b08f-0ec209170a09` | Sos Tzatziki | `/menu/5/image-1077484085450711.jpeg` | `null` |
| `83f38f19-0286-46bf-9c47-833f0033b2ce` | Cappuccino | `/menu/5/image-1077485265450593.jpeg` | `/images/assets/gen/kawa.png` |
| `bf4a9202-2e13-4b5c-91cb-37a06f633f5d` | Sos Jogurtowy | `/menu/5/image-1077482172117569.jpeg` | `null` |
| `680c91fe-4d3e-47d0-a485-74361b01c2b8` | Sos Pikantny | `/menu/5/image-1077483208784132.jpeg` | `null` |
| `d8d17836-68be-45ba-a00d-a67f039a296d` | Flat White | `/menu/5/image-1077486195450500.jpeg` | `/images/assets/gen/kawa.png` |
| `e092d885-7e8b-4ce6-841f-c5d6d9e25329` | Wołowina z warzywami | `/menu/7/image-1077581322107654.jpeg` | `/menu/7/image-1077574858774967.jpeg` |
| `541e5bfd-0aa0-4eea-9aae-ff1421b9727a` | Wieprzowina Curry | `/menu/7/image-1077583775440742.jpeg` | `null` |
| `73cc8a65-ece9-45e6-96c4-07361dc5c8cd` | Kurczak na gorącym półmisku | `/menu/7/image-1077574858774967.jpeg` | `null` |
| `3a0647be-3058-4e37-abab-e10b20ce4034` | Wołowina 5 smaków | `/menu/7/image-1077574858774967.jpeg` | `null` |
| `f9327ddd-1e36-48b0-a7c1-ea07bc95e991` | Szarlotka | `/menu/5/image-1077439169666060.jpeg` | `null` |
| `b3952092-d7bf-4752-a894-56cd476065c7` | Sernik z Musem Malinowym | `/menu/5/image-1077440181514336.jpeg` | `null` |
| `8492d2e8-fc47-4381-af16-8ef4e1aa7b04` | Panna Cotta | `/menu/5/image-1077442205210888.jpeg` | `null` |
| `2eb16558-be15-4453-bda1-a2996ad97670` | Pierogi z mięsem | `/menu/5/image-1077473187212456.jpeg` | `null` |
| `0659a1fa-61a0-40f7-a27c-904b70cb83be` | Pierogi ruskie | `/menu/5/image-1077474219462104.jpeg` | `null` |
| `501ca22c-591d-42e1-8e67-f8aafe7716d8` | Krem borowikowy | `/menu/5/image-1077480215167568.jpeg` | `null` |
| `fb7dd1db-85ce-4163-8174-1bbdfedf80d4` | Rolada wołowa | `/menu/5/image-1077481187424696.jpeg` | `null` |

Poprawne oryginalne przypisania (Wodzionka, Ozór wołowy, Gęsie żołądki, Ćwiartka kaczki, Stek z halibuta, Fondant, Żur i Dzikie placki) pozostają bez zmian.

## Rollback

Rollback polega na przywróceniu wartości z kolumn „Przed” / „Stare `image_url`” dla dokładnie wskazanych identyfikatorów. Nie należy przywracać zmian po nazwach, ponieważ nazwy tenanta i dań mogą zostać później zmienione.
