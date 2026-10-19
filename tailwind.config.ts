import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          300: '#93a8c8',
          400: '#6b88b0',
          500: '#3b5998',
          600: '#2d4a7a',
          700: '#1e3459',
          800: '#172a47',
          900: '#111f35',
          950: '#0a1525',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
