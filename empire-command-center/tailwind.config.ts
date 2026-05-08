import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Empire theme — matches FDDY brand
        empire: {
          bg:         "#0a0a0a",
          surface:    "#121212",
          card:       "#1a1a1a",
          border:     "#2a2a2a",
          neon:       "#00D8FF",      // primary accent
          neonAlt:    "#00FFFF",
          pink:       "#FF2D87",
          green:      "#39FF14",
          violet:     "#9D4EDD",
          textPrimary:"#f5f5f5",
          textMuted:  "#9ca3af",
        },
      },
      boxShadow: {
        neon: "0 4px 12px rgba(0, 216, 255, 0.15)",
        neonStrong: "0 4px 24px rgba(0, 216, 255, 0.35)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
