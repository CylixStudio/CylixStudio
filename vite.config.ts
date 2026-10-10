import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

function nitroDeployPreset(): "netlify" | "vercel" | "node-server" {
  if (process.env["NETLIFY"]) return "netlify";
  if (process.env["VERCEL"]) return "vercel";
  return "node-server";
}

function pickEnv(env: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return "";
}

export default defineConfig(({ mode }) => {
  // Load every env key (not only VITE_) so host dashboards that only set
  // SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY still populate the client bundle.
  const env = loadEnv(mode, rootDir, "");
  const supabaseUrl = pickEnv(env, "VITE_SUPABASE_URL", "SUPABASE_URL");
  const supabaseKey = pickEnv(
    env,
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "SUPABASE_ANON_KEY",
  );

  return {
    base: "/",
    server: {
      port: 3000,
      host: true,
      watch: {
        // Browser profiles dropped here lock cache.db and crash the file watcher.
        ignored: ["**/.tmp-ui/**"],
      },
    },
    resolve: {
      alias: {
        "@": path.join(rootDir, "src"),
      },
      dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-query"],
    },
    // Bake public Supabase credentials into the client at build time.
    // Required on Vercel/Cloudflare: env must be available during `vite build`.
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabaseKey),
    },
    plugins: [
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        srcDirectory: "src",
        // Explicit paths keep route-tree crawling deterministic on Vercel CI
        // (same layout as local: src/routes → src/routeTree.gen.ts).
        router: {
          routesDirectory: "routes",
          generatedRouteTree: "routeTree.gen.ts",
        },
        server: {
          // Resolved from srcDirectory → src/server.ts
          entry: "server",
          build: {
            // Embed route CSS in the SSR HTML so a hashed /assets/*.css 404 cannot
            // leave production unstyled (common with styles.css?url + Nitro/Vercel).
            inlineCss: true,
          },
        },
      }),
      nitro({
        // Vercel → `.vercel/output` (Build Output API). Netlify → `dist` + functions-internal.
        // Local `npm start` → `.output/public` + `.output/server`. Never set Vercel/Netlify
        // publish/output to `.output/public` — that is static-only and every SSR route 404s.
        preset: nitroDeployPreset(),
      }),
      viteReact(),
      tailwindcss(),
    ],
  };
});
