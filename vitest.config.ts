import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"], globals: false },
  resolve: {
    alias: {
      "@inspyr/shared": r("./packages/shared/src/index.ts"),
      "@inspyr/db": r("./packages/db/src/index.ts"),
      "@inspyr/ai": r("./packages/ai/src/index.ts"),
      "@inspyr/ingestion": r("./packages/ingestion/src/index.ts"),
      "@inspyr/ranking": r("./packages/ranking/src/index.ts"),
      "@inspyr/pipeline": r("./packages/pipeline/src/index.ts"),
    },
  },
});
