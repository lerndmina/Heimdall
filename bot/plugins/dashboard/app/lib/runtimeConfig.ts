import { z } from "zod";

export const RuntimeConfigSchema = z.object({
  wsUrl: z.string().url(),
  enabledPlugins: z.array(z.string()),
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

export async function fetchRuntimeConfig(): Promise<RuntimeConfig | null> {
  try {
    const res = await fetch("/api/runtime-config", { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    return RuntimeConfigSchema.parse(json);
  } catch {
    return null;
  }
}
