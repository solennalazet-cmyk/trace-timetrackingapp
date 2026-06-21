import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Android System WebView ≥ Chromium 80 ships with most evergreen JS;
    // target es2019 to keep helpers small without breaking older devices.
    target: "es2019",
    cssCodeSplit: true,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Split heavy / rarely-used deps into their own chunks so the initial
        // route doesn't have to parse them on Android cold start.
        manualChunks: (id) => {
          // Keep Rollup's CommonJS interop helper out of the charts chunk.
          // If it lands in charts, react-vendor imports charts while charts
          // imports react-vendor, causing a production startup TDZ crash.
          if (id.includes("commonjsHelpers")) return "react-vendor";
          if (!id.includes("node_modules")) return;
          if (id.includes("jspdf") || id.includes("jspdf-autotable")) return "pdf";
          if (id.includes("recharts") || id.includes("d3-")) return "charts";
          if (id.includes("react-day-picker") || id.includes("date-fns")) return "dates";
          if (id.includes("@radix-ui")) return "radix";
          if (id.includes("@supabase")) return "supabase";
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("react-router") ||
            id.includes("scheduler")
          ) return "react-vendor";
        },
      },
    },
  },
}));
