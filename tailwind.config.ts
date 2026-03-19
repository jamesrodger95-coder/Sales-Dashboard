import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: '#111111',
        'surface-hover': '#161616',
        subtle: '#1A1A1A',
        'subtle-hover': '#222222',
        muted: '#888888',
        dim: '#555555',
        'data-blue': '#60A5FA',
        success: '#34D399',
        warning: '#FBBF24',
        danger: '#EF4444',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'Segoe UI',
          'system-ui',
          'sans-serif',
        ],
      },
      borderRadius: {
        'card': '14px',
      },
      fontSize: {
        'kpi': ['3rem', { lineHeight: '1', letterSpacing: '-0.02em', fontWeight: '700' }],
        'kpi-sm': ['2.5rem', { lineHeight: '1', letterSpacing: '-0.02em', fontWeight: '700' }],
      },
      letterSpacing: {
        'heading': '0.04em',
      },
    },
  },
  plugins: [],
};
export default config;
