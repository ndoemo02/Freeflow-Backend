import { describe, it, expect, beforeEach } from "vitest";
import { callBrain } from "./utils/testClient.js";

describe("Amber Brain - Logic Flow (Current Contract)", () => {
  let sessionId;

  beforeEach(() => {
    sessionId = `test_${Date.now()}`;
  });

  it("routes restaurant ordering requests into discovery when location is still needed", async () => {
    const result = await callBrain("Zamów kebaba w Piekarach", sessionId);

    expect(result.intent).toBe("find_nearby");
    expect(result.reply).toMatch(/Gdzie mam szukaæ|Podaj miasto|w pobli¿u/i);
    expect(result.context?.expectedContext).toBe("find_nearby_ask_location");
  });

  it("maps cancel phrases to dialog cancel when there is nothing actionable to cancel", async () => {
    await callBrain("Zamów pizzê w Bytomiu", sessionId);
    await callBrain("Tak, potwierdŸ", sessionId);

    const result = await callBrain("Anuluj zamówienie", sessionId);

    expect(result.intent).toBe("DIALOG_CANCEL");
    expect(result.reply).toMatch(/anuluj|anulujê|rozumiem/i);
    expect(result.meta).toBeDefined();
  });

  it("keeps restaurant selection context when user asks for more or the rest of the list", async () => {
    await callBrain("Poka¿ restauracje w Piekarach", sessionId);

    const more = await callBrain("Poka¿ wiêcej opcji", sessionId);
    expect(["DIALOG_NEXT", "show_more_options", "select_restaurant"]).toContain(more.intent);
    expect(more.context?.expectedContext).toBe("select_restaurant");

    const rest = await callBrain("Poka¿ resztê", sessionId);
    expect(rest.reply).toMatch(/Która Ciê interesuje|Któr¹ wybierasz|\d\./i);
    expect(rest.context?.expectedContext).toBe("select_restaurant");
  });

  it("interprets ordinal restaurant selection correctly", async () => {
    await callBrain("Poka¿ restauracje w Piekarach", sessionId);

    const result = await callBrain("pierwsz¹", sessionId);

    expect(result.intent).toBe("select_restaurant");
    expect(result.reply).toMatch(/wybrano|menu|restauracjê|Wybierz numer|z listy/i);
    expect(result.meta).toBeDefined();
  });

  it("returns validation feedback for empty text", async () => {
    const result = await callBrain("", sessionId);

    expect(result.ok).toBe(false);
    expect(result.error || result.reply).toMatch(/brak|tekst|pusty|400/i);
  });

  it("asks for location again when user confirms before giving a location", async () => {
    await callBrain("Zamów pizzê w Bytomiu", sessionId);
    await callBrain("Nie, inna restauracja", sessionId);
    await callBrain("Zamów burgera", sessionId);

    const result = await callBrain("Tak", sessionId);

    expect(result.intent).toBe("find_nearby_ask_location");
    expect(result.reply).toMatch(/powiedz mi miasto|¿ebym znalaz³a restauracje|Gdzie mam szukaæ/i);
    expect(result.context?.expectedContext).toBe("find_nearby_ask_location");
  });
});

