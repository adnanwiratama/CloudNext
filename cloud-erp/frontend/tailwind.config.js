/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd',
          400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
          800: '#1e40af', 900: '#1e3a8a', 950: '#172554',
        },
        erp: {
          // Oracle NetSuite Blue - darker shade untuk menu tab
          nav:              '#2b5d7f',  // Darker Oracle blue
          'nav-hover':      '#346a8f',
          'nav-active':     '#4291c9',
          'nav-border':     '#1e4a66',
          'nav-text':       '#e0eef7',
          'nav-text-hover': '#ffffff',
          // Sub nav (second row) - Oracle blue
          subnav:           '#2e729f',  // Oracle NetSuite blue
          'subnav-hover':   '#3a89b8',
          // Header
          header:           '#ffffff',
          border:           '#d0d5dd',
          'border-light':   '#e4e7ec',
          // Backgrounds - white grey untuk badan halaman
          'bg-page':        '#f0f2f5',  // Light grey background
          'bg-light':       '#fafbfc',
          'bg-white':       '#ffffff',
          // Text
          'text-primary':   '#101828',
          'text-secondary': '#344054',
          'text-muted':     '#667085',
          'text-light':     '#98a2b3',
          // Kept for compatibility
          sidebar:          '#2b5d7f',
          'sidebar-hover':  '#346a8f',
          'sidebar-active': '#4291c9',
          // Portlet
          'portlet-head':   '#f7f9fb',
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem',  { lineHeight: '1rem' }],     // 10px
        xs:    ['0.75rem',   { lineHeight: '1rem' }],     // 12px
        sm:    ['0.8125rem', { lineHeight: '1.25rem' }],  // 13px
        base:  ['0.875rem',  { lineHeight: '1.375rem' }], // 14px - BASE SIZE
        lg:    ['1rem',      { lineHeight: '1.5rem' }],   // 16px
        xl:    ['1.125rem',  { lineHeight: '1.75rem' }],  // 18px
        '2xl': ['1.25rem',   { lineHeight: '1.875rem' }], // 20px
      },
      boxShadow: {
        'nav':     '0 2px 4px rgba(0,0,0,0.3)',
        'mega':    '0 8px 24px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.1)',
        'card':    '0 1px 2px rgba(0,0,0,0.05), 0 1px 4px rgba(0,0,0,0.08)',
        'portlet': '0 1px 3px rgba(0,0,0,0.10)',
        'header':  '0 1px 3px rgba(0,0,0,0.08)',
        'dropdown':'0 4px 16px rgba(0,0,0,0.12)',
      },
    },
  },
  plugins: [],
};
