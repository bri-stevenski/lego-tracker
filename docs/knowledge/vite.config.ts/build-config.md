---
type: business_concept
domain: vite.config.ts
tags: [build, vite, react]
---

# Vite Build Configuration

The `vite.config.ts` file configures the Vite build tool for the Anti-Kragle React application.

Uses `@vitejs/plugin-react` for JSX/TSX transformation and React fast refresh. The configuration is minimal with no custom aliases, environment variables, or build optimizations needed for this local-first app.

The dev server is launched via `npm run dev` which runs `vite --host 0.0.0.0`, allowing network access from other devices. Production builds via `npm run build` run TypeScript compilation then Vite bundling, outputting to `dist/`.
