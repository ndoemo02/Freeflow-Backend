import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Zmiana zdania
const catA = Array.from({ length: 6 }, (_, i) => ({
    id: `A0${i + 1}`,
    category: "zmiana_zdania",
    description: "Zmiana jedzenia w trakcie wyszukiwania",
    session_id: `chaos-A0${i + 1}`,
    steps: [
        { input: "hej, jestem głodny i chcę pizzę", allowedIntents: ["find_nearby", "create_order"] },
        { input: "a jakie mają oceny te pizzerie?", allowedIntents: ["clarify_order", "find_nearby", "unknown", "smalltalk"] },
        { input: "właściwie to zmieniłem zdanie, wolałbym kebaba", allowedIntents: ["find_nearby", "create_order"] },
        { input: "z ostrym sosem", allowedIntents: ["find_nearby", "create_order", "clarify_order"] },
        { input: "dobra, to pokaz mi listę", allowedIntents: ["find_nearby", "menu_request", "show_menu", "clarify_order"] },
        { input: "ten pierwszy bym poprosił", allowedIntents: ["select_restaurant", "create_order", "clarify_order"] },
        { input: "albo nie! weźmy burgera jednak, sory", allowedIntents: ["find_nearby", "create_order"] },
        { input: "takiego dużego", allowedIntents: ["clarify_order", "create_order", "find_nearby"] }
    ]
}));

// Doprecyzowania
const catB = Array.from({ length: 6 }, (_, i) => ({
    id: `B0${i + 1}`,
    category: "doprecyzowania",
    description: "Ogólne zapytanie i mozolne doprecyzowanie",
    session_id: `chaos-B0${i + 1}`,
    steps: [
        { input: "coś bym zjadł taniego", allowedIntents: ["find_nearby", "clarify_order"] },
        { input: "no wiesz, chyba fastfood", allowedIntents: ["find_nearby", "clarify_order"] },
        { input: "niech będzie mcdonalds", allowedIntents: ["find_nearby", "create_order", "clarify_order", "select_restaurant"] },
        { input: "są jakieś blisko?", allowedIntents: ["find_nearby"] },
        { input: "to wybierz tego w centrum", allowedIntents: ["select_restaurant", "find_nearby", "clarify_order"] },
        { input: "pokaż mi zestaw drwala", allowedIntents: ["show_menu", "menu_request", "create_order", "clarify_order"] },
        { input: "2 sztuki wezme", allowedIntents: ["create_order", "clarify_order"] },
        { input: "bez frytek", allowedIntents: ["create_order", "clarify_order"] },
        { input: "potwierdzam", allowedIntents: ["confirm_order", "clarify_order", "unknown"] }
    ]
}));

// Skoki kontekstu
const catC = Array.from({ length: 6 }, (_, i) => ({
    id: `C0${i + 1}`,
    category: "skoki_kontekstu",
    description: "Pytania z kosmosu podczas zamawiania",
    session_id: `chaos-C0${i + 1}`,
    steps: [
        { input: "chce zamówić zapiekanki z krakowskiej", allowedIntents: ["find_nearby", "create_order"] },
        { input: "a do której oni mają otwarte?", allowedIntents: ["unknown", "smalltalk", "clarify_order", "find_nearby"] },
        { input: "no dobra, to biorę dwie", allowedIntents: ["create_order", "clarify_order"] },
        { input: "czy oni też mają lody?", allowedIntents: ["show_menu", "menu_request", "clarify_order", "unknown", "find_nearby"] },
        { input: "nie ważne, dodaj jeszcze pepsi", allowedIntents: ["create_order", "clarify_order"] },
        { input: "jak długo czeka się na dostawę ogólnie?", allowedIntents: ["unknown", "smalltalk", "clarify_order", "find_nearby"] },
        { input: "okej to wszystko", allowedIntents: ["confirm_order", "clarify_order"] },
        { input: "zatwierdzam ten koszyk", allowedIntents: ["confirm_order", "clarify_order"] }
    ]
}));

// Nawigacja
const catD = Array.from({ length: 6 }, (_, i) => ({
    id: `D0${i + 1}`,
    category: "nawigacja",
    description: "Cofanie i powtarzanie",
    session_id: `chaos-D0${i + 1}`,
    steps: [
        { input: "poszukaj mi sushi", allowedIntents: ["find_nearby", "create_order"] },
        { input: "jakie to było drugie miejsce?", allowedIntents: ["show_more_options", "repeat", "unknown", "clarify_order", "find_nearby"] },
        { input: "wróć", allowedIntents: ["back", "unknown", "clarify_order"] },
        { input: "jeszcze raz", allowedIntents: ["repeat", "show_more_options", "unknown", "clarify_order"] },
        { input: "nie podoba mi się, pokaż co innego", allowedIntents: ["show_more_options", "find_nearby", "clarify_order"] },
        { input: "pokaż mi pierwszą pozycję", allowedIntents: ["select_restaurant", "find_nearby", "clarify_order"] },
        { input: "cofnij", allowedIntents: ["back", "unknown", "clarify_order"] },
        { input: "dobra powtórz co tam miałeś na początku", allowedIntents: ["repeat", "unknown", "clarify_order"] }
    ]
}));

// Porównania
const catE = Array.from({ length: 6 }, (_, i) => ({
    id: `E0${i + 1}`,
    category: "porownanie",
    description: "Rozkminki pomiędzy opcjami",
    session_id: `chaos-E0${i + 1}`,
    steps: [
        { input: "chciałbym makaron albo ramen", allowedIntents: ["find_nearby", "create_order", "clarify_order"] },
        { input: "które szybciej dowiozą?", allowedIntents: ["unknown", "smalltalk", "clarify_order", "find_nearby"] },
        { input: "to chyba wolę ramen z tego co słyszę", allowedIntents: ["find_nearby", "select_restaurant", "clarify_order", "create_order"] },
        { input: "mają tam wersję wegańską?", allowedIntents: ["show_menu", "menu_request", "clarify_order", "unknown", "find_nearby"] },
        { input: "i jak jest lepiej oceniany ten makaron czy ramen?", allowedIntents: ["unknown", "smalltalk", "clarify_order", "find_nearby"] },
        { input: "okej to zaufam czi i biorę klasyczny tonkotsu ramen", allowedIntents: ["create_order", "select_restaurant", "clarify_order"] },
        { input: "dla pewności dopytam czy to duża porcja", allowedIntents: ["show_menu", "menu_request", "clarify_order", "unknown"] },
        { input: "zamawiam!", allowedIntents: ["confirm_order", "create_order", "clarify_order"] }
    ]
}));

// DEMO FLOW x3 (Te będą powtarzane w pętli przez testrunner)
const demoFlows = [
    {
        id: "DEMO_1",
        category: "demo_flow",
        description: "Pełen sukcesywny lejek od zera",
        session_id: "chaos-DEMO1",
        steps: [
            { input: "wyszukaj mi jakąś włoską restaurację", allowedIntents: ["find_nearby", "create_order"] },
            { input: "pokaż menu trzeciej", allowedIntents: ["select_restaurant", "show_menu", "menu_request", "clarify_order"] },
            { input: "poproszę spaghetti carbonara i tiramisu", allowedIntents: ["create_order", "clarify_order"] },
            { input: "czy mozna dodac extra ser do tego makaronu?", allowedIntents: ["create_order", "clarify_order", "show_menu", "menu_request"] },
            { input: "okej, to już wszystko. dorzuć ten extra ser", allowedIntents: ["create_order", "clarify_order"] },
            { input: "potwierdzam zamówienie", allowedIntents: ["confirm_order", "clarify_order"] }
        ]
    },
    {
        id: "DEMO_2",
        category: "demo_flow",
        description: "Szybki zamawiacz",
        session_id: "chaos-DEMO2",
        steps: [
            { input: "pizza hawajska w olsztynie", allowedIntents: ["find_nearby", "create_order"] },
            { input: "biorę tą blisko ronda", allowedIntents: ["select_restaurant", "find_nearby", "clarify_order"] },
            { input: "duża z podwójnym ananasem", allowedIntents: ["create_order", "clarify_order"] },
            { input: "potwierdzam koszyk", allowedIntents: ["confirm_order", "clarify_order"] }
        ]
    },
    {
        id: "DEMO_3",
        category: "demo_flow",
        description: "Zmiana zdania na pełnej: Kebab -> Burger -> OK",
        session_id: "chaos-DEMO3",
        steps: [
            { input: "chce najlepszego kebaba", allowedIntents: ["find_nearby", "create_order"] },
            { input: "dawaj menu", allowedIntents: ["show_menu", "menu_request", "clarify_order"] },
            { input: "jeden z falafelem i jeden z kurczakiem", allowedIntents: ["create_order", "clarify_order"] },
            { input: "stop stop, jednak burgery zamiast tego z kurczakiem", allowedIntents: ["create_order", "clarify_order", "find_nearby"] },
            { input: "tak, zamiast kebaba z kurczaka chce cheeseburgera", allowedIntents: ["create_order", "clarify_order"] },
            { input: "dobra, niech juz tak bedzie, potwierdzam", allowedIntents: ["confirm_order", "clarify_order"] }
        ]
    }
];

const allScenarios = [...catA, ...catB, ...catC, ...catD, ...catE, ...demoFlows];

const outputPath = path.resolve(__dirname, 'SCENARIOS.pl.json');
fs.writeFileSync(outputPath, JSON.stringify(allScenarios, null, 2));

console.log(`Generated ${allScenarios.length} scenarios at ${outputPath}`);
