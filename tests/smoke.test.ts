import { describe, expect, it } from "vitest";
import type { Provider } from "../src/types.js";

describe("types", () => {
  it("Provider shape compiles and holds values", () => {
    const provider: Provider = {
      id: "1",
      name: "test",
      baseUrl: "https://example.com",
      apiKey: "sk-test",
      createdAt: new Date().toISOString(),
    };
    expect(provider.name).toBe("test");
  });
});
