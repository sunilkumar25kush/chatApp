/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/components/ui/**/*.{js,jsx,ts,tsx}',
    './src/lib/**/*.{js,jsx,ts,tsx}',
    './src/pages/Login.jsx',
  ],
  darkMode: 'class',
  // Scope every generated utility to the auth UI so the legacy stylesheet and
  // the rest of the app are untouched. The prefix also raises specificity over
  // the global reset in index.css.
  important: '.auth-ui-root',
  corePlugins: {
    // Keep the existing app-wide reset (index.css) in charge outside the auth UI.
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        border: 'rgb(var(--auth-border) / <alpha-value>)',
        input: 'rgb(var(--auth-input) / <alpha-value>)',
        ring: 'rgb(var(--auth-ring) / <alpha-value>)',
        background: 'rgb(var(--auth-background) / <alpha-value>)',
        foreground: 'rgb(var(--auth-foreground) / <alpha-value>)',
        primary: {
          DEFAULT: 'rgb(var(--auth-primary) / <alpha-value>)',
          foreground: 'rgb(var(--auth-primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--auth-secondary) / <alpha-value>)',
          foreground: 'rgb(var(--auth-secondary-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'rgb(var(--auth-destructive) / <alpha-value>)',
          foreground: 'rgb(var(--auth-destructive-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'rgb(var(--auth-muted) / <alpha-value>)',
          foreground: 'rgb(var(--auth-muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--auth-accent) / <alpha-value>)',
          foreground: 'rgb(var(--auth-accent-foreground) / <alpha-value>)',
        },
      },
      borderRadius: {
        lg: 'var(--auth-radius)',
        md: 'calc(var(--auth-radius) - 2px)',
        sm: 'calc(var(--auth-radius) - 4px)',
      },
    },
  },
  plugins: [],
};
