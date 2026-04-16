const TOP_GROUP_KEYWORDS = {
  fast_food: [
    "fast food",
    "burger",
    "burgery",
    "hot dog",
    "hotdog",
    "zapiekanka",
    "frytki",
    "nuggets",
    "szybkie jedzenie",
    "na szybko"
  ],
  pizza_italian: [
    "pizza",
    "pizz\u0119",
    "pizzy",
    "pizzeria",
    "pizzerii",
    "pizzeri\u0119",
    "pasta",
    "spaghetti",
    "carbonara",
    "bolognese",
    "lasagne",
    "risotto",
    "w\u0142oska",
    "w\u0142oskie"
  ],
  asian: [
    "sushi",
    "ramen",
    "wok",
    "maki",
    "nigiri",
    "pho",
    "pad thai",
    "dim sum",
    "azjatyckie",
    "azja",
    "chi\u0144skie",
    "chinka",
    "tajskie",
    "japo\u0144skie",
    "wietnamskie"
  ],
  polish: [
    "pierogi",
    "\u017Curek",
    "barszcz",
    "schabowy",
    "bigos",
    "kotlet",
    "ros\xF3\u0142",
    "go\u0142\u0105bki",
    "polskie",
    "polska kuchnia",
    "domowe",
    "tradycyjne"
  ],
  grill: [
    "kebab",
    "d\xF6ner",
    "doner",
    "stek",
    "steki",
    "wo\u0142owina",
    "\u017Ceberka",
    "bbq",
    "z rusztu",
    "grill",
    "grillowane"
  ],
  desserts_cafe: [
    "kawa",
    "kaw\u0119",
    "cappuccino",
    "latte",
    "espresso",
    "ciasto",
    "tort",
    "lody",
    "nale\u015Bniki",
    "waffle",
    "gofry",
    "deser",
    "desery",
    "kawiarnia",
    "cukiernia"
  ]
};
const CATEGORY_KEYWORDS = {
  // fast_food
  burgers: ["burger", "burgery", "hamburger", "cheeseburger", "smash burger"],
  kebab: ["kebab", "d\xF6ner", "doner", "shawarma", "falafel", "gyros"],
  pizza_takeaway: ["pizza na wynos", "pizza z dostaw\u0105"],
  hot_snacks: ["frytki", "nuggets", "hot dog", "hotdog", "zapiekanka", "tortilla"],
  // pizza_italian
  pizza: ["pizza", "pizz\u0119", "pizzy", "pizzeria", "pizzerii", "pizzeri\u0119", "neapolita\u0144ska", "margarita"],
  pasta: ["pasta", "spaghetti", "carbonara", "bolognese", "lasagne", "tagliatelle"],
  risotto: ["risotto", "bruschetta", "tiramisu"],
  // asian
  sushi: ["sushi", "maki", "nigiri", "temaki", "sashimi", "uramaki", "japo\u0144skie"],
  ramen_noodles: ["ramen", "udon", "soba", "pad thai", "lo mein", "makaron azjatycki"],
  vietnamese: ["pho", "bun bo", "banh mi", "wietnamskie", "wietnam"],
  chinese: ["chi\u0144skie", "wok", "dim sum", "chow mein", "chinka"],
  thai: ["tajskie", "pad thai", "green curry", "tom yum"],
  // polish
  pierogi: ["pierogi", "kopytka", "uszka"],
  zupy: ["\u017Curek", "barszcz", "ros\xF3\u0142", "zupa", "flaki", "groch\xF3wka", "zupy"],
  tradycyjne: ["schabowy", "bigos", "kotlet", "go\u0142\u0105bki", "zrazy", "tradycyjne"],
  // grill
  kebab_grill: ["kebab z grilla", "kebab sit-down"],
  steak: ["stek", "steki", "wo\u0142owina", "t-bone", "ribeye", "antrykot"],
  bbq: ["bbq", "\u017Ceberka", "pulled pork", "smoker", "w\u0119dzony"],
  // desserts_cafe
  cafe: ["kawa", "kaw\u0119", "espresso", "cappuccino", "latte", "americano", "kawiarnia"],
  cake_bakery: ["ciasto", "tort", "croissant", "muffin", "chleb", "piekarnia", "cukiernia"],
  ice_cream: ["lody", "gelato", "nale\u015Bniki", "waffle", "gofry"]
};
const CORE_TAG_KEYWORDS = {
  spicy: ["ostre", "pikantne", "pikantny", "chilli", "sriracha", "piek\u0105ce"],
  vege: ["wege", "wegetaria\u0144skie", "wegetaria\u0144ski", "bez mi\u0119sa", "wega\u0144skie", "vegan", "ro\u015Blinne"],
  quick: ["szybko", "szybkie", "szybki", "na szybko", "express", "fast"],
  open_now: ["teraz", "otwarte", "otwarta", "czynne", "czynna", "otwarta teraz", "czy otwarte"],
  delivery: ["dostawa", "dow\xF3z", "przynie\u015B", "wolt", "uber eats", "glovo", "z dostaw\u0105", "na wynos z dostaw\u0105"]
};
export {
  CATEGORY_KEYWORDS,
  CORE_TAG_KEYWORDS,
  TOP_GROUP_KEYWORDS
};
