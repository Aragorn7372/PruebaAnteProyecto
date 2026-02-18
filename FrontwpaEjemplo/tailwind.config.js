/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{html,ts}',
  ],
  theme: {
    extend: {},
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: [
      {
        dark: {
          "primary": "#7c3aed",
          "primary-content": "#ffffff",
          "secondary": "#ec4899",
          "secondary-content": "#ffffff",
          "accent": "#06b6d4",
          "accent-content": "#ffffff",
          "neutral": "#1f2937",
          "neutral-content": "#e5e7eb",
          "base-100": "#111827",
          "base-200": "#1f2937",
          "base-300": "#374151",
          "base-content": "#e5e7eb",
          "info": "#3b82f6",
          "info-content": "#ffffff",
          "success": "#10b981",
          "success-content": "#ffffff",
          "warning": "#f59e0b",
          "warning-content": "#111827",
          "error": "#ef4444",
          "error-content": "#ffffff",
        },
      },
    ],
    darkTheme: "dark",
    base: true,
    styled: true,
    utils: true,
    prefix: '',
    logs: false,
  },
};
