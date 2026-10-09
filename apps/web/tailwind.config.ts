import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // "Sangam" brand palette - saffron/marigold primary, indigo ink
        brand: {
          50: "#fff7ed",
          100: "#ffedd5",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c"
        },
        ink: {
          900: "#0f172a",
          700: "#334155",
          500: "#64748b"
        }
      }
    }
  },
  plugins: []
};
export default config;
