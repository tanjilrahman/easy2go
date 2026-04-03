import { describe, expect, it } from "vitest";

import { searchLocalTransitSuggestions } from "@/lib/server/transit-resolver";

describe("transit resolver bus stop metadata", () => {
  it("matches bus stops by approved place-name aliases", () => {
    const suggestions = searchLocalTransitSuggestions("technical mor");

    expect(suggestions[0]?.type).toBe("bus_stop");
    expect(suggestions[0]?.name).toBe("Technical Mor Bus stop");
    expect(suggestions[0]?.address).toContain("Technical Mor Bus stop");
  });

  it("surfaces multiple boarding-point variants for grouped stops", () => {
    const suggestions = searchLocalTransitSuggestions("mirpur 1");
    const busStopNames = suggestions
      .filter((suggestion) => suggestion.type === "bus_stop")
      .map((suggestion) => suggestion.name);

    expect(busStopNames).toContain("Mirpur 1 Bus Stop");
    expect(busStopNames).toContain("Sony Hall / Mirpur 1");
  });
});
