import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        oracle: {
          bg:      '#08080F',   // deep black page background
          panel:   '#0F0F1A',   // dark card background
          panel2:  '#14141F',   // slightly lighter panel
          border:  'rgba(255,255,255,0.08)',  // subtle white border
          accent:  '#7C3AED',   // violet-600
          accenthi:'#9D5CF5',   // violet lighter (hover)
          yes:     '#10B981',   // emerald-500
          no:      '#EF4444',   // red-500
          gold:    '#F59E0B',   // amber-500
          muted:   '#64748B',   // slate-500
          text:    '#F1F5F9',   // near-white main text
          subtext: '#94A3B8',   // slate-400 secondary text
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      }
    }
  },
  plugins: [],
}

export default config
