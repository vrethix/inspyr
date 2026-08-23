import { loadEnv } from "../../packages/shared/src/env";

loadEnv(import.meta.dirname);

import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: [
    "@inspyr/shared", "@inspyr/db", "@inspyr/ai", "@inspyr/ingestion", "@inspyr/ranking", "@inspyr/pipeline",
  ],
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
};

export default config;
