import { listProviders } from "../config/providers.js";
import { runDoctor } from "../doctor/checks.js";
import { theme } from "../ui/theme.js";

export async function doctorFlow(): Promise<void> {
  console.log(theme.heading("\nDiagnóstico (Doctor)"));
  const results = await runDoctor(listProviders());
  for (const result of results) {
    const status = result.ok ? theme.ok("OK") : theme.fail("FALHA");
    console.log(`[${status}] ${result.label} — ${result.detail}`);
  }
}
