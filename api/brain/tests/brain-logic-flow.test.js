import { describe, it, expect, beforeEach } from "vitest";
import { callBrain } from "./utils/testClient.js";

// Requires a running backend on localhost:3000.
// Skip when not in integration mode: BRAIN_INTEGRATION=1 npx vitest
const runIntegration = !!process.env.BRAIN_INTEGRATION;

describe.skipIf(!runIntegration)("Amber Brain - Logic Flow (Current Contract)", () => {
  let sessionId;

  beforeEach(() => {
    sessionId = `test_${Date.now()}`;
  });

  it("routes restaurant ordering requests into discovery when location is still needed", async () => {
    const result = await callBrain("Zam�w kebaba w Piekarach", sessionId);

    expect(result.intent).toBe("find_nearby");
    expect(result.reply).toMatch(/Gdzie mam szuka�|Podaj miasto|w pobli�u/i);
    expect(result.context?.expectedContext).toBe("find_nearby_ask_location");
  });

  it("maps cancel phrases to dialog cancel when there is nothing actionable to cancel", async () => {
    await callBrain("Zam�w pizz� w Bytomiu", sessionId);
    await callBrain("Tak, potwierd�", sessionId);

    const result = await callBrain("Anuluj zam�wienie", sessionId);

    expect(result.intent).toBe("DIALOG_CANCEL");
    expect(result.reply).toMatch(/anuluj|anuluj�|rozumiem/i);
    expect(result.meta).toBeDefined();
  });

  it("keeps restaurant selection context when user asks for more or the rest of the list", async () => {
    await callBrain("Poka� restauracje w Piekarach", sessionId);

    const more = await callBrain("Poka� wi�cej opcji", sessionId);
    expect(["DIALOG_NEXT", "show_more_options", "select_restaurant"]).toContain(more.intent);
    expect(more.context?.expectedContext).toBe("select_restaurant");

    const rest = await callBrain("Poka� reszt�", sessionId);
    expect(rest.reply).toMatch(/Kt�ra Ci� interesuje|Kt�r� wybierasz|\d\./i);
    expect(rest.context?.expectedContext).toBe("select_restaurant");
  });

  it("interprets ordinal restaurant selection correctly", async () => {
    await callBrain("Poka� restauracje w Piekarach", sessionId);

    const result = await callBrain("pierwsz�", sessionId);

    expect(result.intent).toBe("select_restaurant");
    expect(result.reply).toMatch(/wybrano|menu|restauracj�|Wybierz numer|z listy/i);
    expect(result.meta).toBeDefined();
  });

  it("returns validation feedback for empty text", async () => {
    const result = await callBrain("", sessionId);

    expect(result.ok).toBe(false);
    expect(result.error || result.reply).toMatch(/brak|tekst|pusty|400/i);
  });

  it("asks for location again when user confirms before giving a location", async () => {
    await callBrain("Zam�w pizz� w Bytomiu", sessionId);
    await callBrain("Nie, inna restauracja", sessionId);
    await callBrain("Zam�w burgera", sessionId);

    const result = await callBrain("Tak", sessionId);

    expect(result.intent).toBe("find_nearby_ask_location");
    expect(result.reply).toMatch(/powiedz mi miasto|�ebym znalaz�a restauracje|Gdzie mam szuka�/i);
    expect(result.context?.expectedContext).toBe("find_nearby_ask_location");
  });
});

