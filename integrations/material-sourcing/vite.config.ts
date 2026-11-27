import { defineConfig } from "vite";
export default defineConfig({
  optimizeDeps: {
    include: [
      "react",
      "react-dom/client",
      "react/jsx-dev-runtime",
      "write-excel-file/browser",
      "jspdf",
      "jspdf-autotable",
    ],
  },
  server: {
    watch: { ignored: ["**/tests/**"] },
    proxy: {
      "/api/materials": {
        target: "http://127.0.0.1:" + (process.env.MS_API_PORT ?? "5181"),
        changeOrigin: true,
      },
    },
  },
  preview: {
    proxy: {
      "/api/materials": {
        target: "http://127.0.0.1:" + (process.env.MS_API_PORT ?? "5181"),
        changeOrigin: true,
      },
    },
  },
});
