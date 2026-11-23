import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const entry = resolve(root, "frontend/auth/supabase-auth-entry.js");
const output = resolve(root, "frontend/vendor");

await build({
  configFile: false,
  root,
  publicDir: false,
  logLevel: "warn",
  build: {
    outDir: output,
    emptyOutDir: false,
    minify: "oxc",
    sourcemap: false,
    target: "es2022",
    lib: { entry, formats: ["es"], fileName: () => "supabase-auth.js" },
    rollupOptions: { output: { codeSplitting: false } },
  },
});
console.log("Built frontend/vendor/supabase-auth.js from @supabase/auth-js.");
