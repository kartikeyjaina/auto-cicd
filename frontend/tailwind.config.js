/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#101417",
          900: "#162028",
          800: "#1d2d38"
        },
        sea: {
          500: "#19b8a0",
          400: "#32d1b8",
          300: "#6be7d1"
        },
        sand: {
          100: "#f5efe2",
          200: "#e8dbc1"
        },
        coral: {
          400: "#ff7e6b"
        }
      },
      boxShadow: {
        glow: "0 20px 80px rgba(25, 184, 160, 0.18)"
      },
      fontFamily: {
        display: ['"Trebuchet MS"', '"Segoe UI"', "sans-serif"],
        body: ['"Segoe UI"', "sans-serif"],
        mono: ['"Cascadia Code"', '"Courier New"', "monospace"]
      }
    }
  },
  plugins: []
};
