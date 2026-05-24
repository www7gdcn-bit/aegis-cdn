import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0B0B0F",        // 近黑,Hero / 深色区
        surface: "#0F1117",
        brand: {
          DEFAULT: "#0A84FF",  // 科技蓝
          600: "#0066d6",
        },
        accent: "#30D158",     // 强调青绿
        mist: "#F5F5F7",       // 浅灰内容区(Apple)
      },
      fontFamily: {
        sans: [
          "-apple-system", "BlinkMacSystemFont", "SF Pro Display", "SF Pro Text",
          "Segoe UI", "Roboto", "Helvetica Neue", "PingFang SC",
          "Microsoft YaHei", "Arial", "sans-serif",
        ],
      },
      maxWidth: {
        container: "1180px",
      },
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        pulseGlow: {
          "0%, 100%": { opacity: "0.4", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.25)" },
        },
      },
      animation: {
        marquee: "marquee 32s linear infinite",
        float: "float 6s ease-in-out infinite",
        pulseGlow: "pulseGlow 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
