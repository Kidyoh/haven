# hug-heart-flow

A personal safety web app with SOS alerting, incident tracking, and organization management — built as a Progressive Web App (PWA).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript |
| Build | Vite |
| Styling | Tailwind CSS + shadcn/ui |
| Backend | Supabase |
| PWA | vite-plugin-pwa |
| Forms | React Hook Form + Zod |
| Routing | React Router v6 |

## Getting Started

**Prerequisites:** Node.js 18+ and pnpm (or npm)

```sh
# Clone the repo
git clone <YOUR_GIT_URL>
cd hug-heart-flow

# Install dependencies
pnpm install   # or: npm install

# Start the dev server
pnpm dev       # or: npm run dev
```

The app will be available at `http://localhost:8080`.

## Available Scripts

```sh
pnpm dev          # Start development server
pnpm build        # Production build
pnpm build:dev    # Development build
pnpm preview      # Preview production build locally
pnpm lint         # Run ESLint
pnpm test         # Run tests (Vitest)
pnpm test:watch   # Run tests in watch mode
```

## Project Structure

```
src/
├── components/       # Shared components (SOS button, alerts, wizard, etc.)
│   └── ui/           # shadcn/ui primitives
├── pages/            # Route-level page components
├── hooks/            # Custom React hooks
└── main.tsx          # App entry point
```

## Environment Variables

Create a `.env` file at the project root and add your Supabase credentials:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Deployment

Build the project and deploy the `dist/` folder to any static hosting provider (Vercel, Netlify, Cloudflare Pages, etc.):

```sh
pnpm build
# deploy the dist/ directory
```
