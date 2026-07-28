<p align="center">
  <img src="public/brand/focusflow-logo.png" alt="FocusFlow" width="64" height="64" />
</p>

<h1 align="center">FocusFlow</h1>

<p align="center">
  <strong>AI-powered productivity platform. Decompose goals, focus deep, track progress.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-6366f1?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-6.0-3178c6?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-8-646cff?logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
</p>

<p align="center">
  <a href="https://prmoda.netlify.app">Live demo</a>
</p>

---

## ✨ What is FocusFlow?

FocusFlow bridges the gap between simple to-do lists and complex project management. The core innovation is **AI Task Decomposition** — paste a vague goal like "Launch a Shopify Store" and the AI breaks it into actionable, bite-sized subtasks.

Combined with a built-in **Pomodoro focus timer**, **drag-and-drop task organization**, and **Supabase-backed accounts**, FocusFlow transforms chaotic mental load into structured, executable flow.

## 🎯 Features

| Feature | Description |
|---------|-------------|
| 🔐 **Accounts** | Email/password auth via Supabase, with row-level security isolating each user's data |
| 💾 **Durable saving** | Tasks and sessions are queued locally and retried until Supabase confirms them, so nothing is lost offline |
| 🧠 **AI Task Breakdown** | OpenAI-powered decomposition of complex projects into manageable steps |
| ⏱️ **Focus Timer** | Pomodoro timer with presets, custom durations, and break tracking |
| 📋 **Drag & Drop Tasks** | Reactive fluid UI with DND Kit for effortless prioritization |
| 📊 **Analytics** | Recharts-powered dashboards — weekly sessions, priority breakdowns |
| 📅 **Calendar** | Monthly calendar with task indicators and daily task view |
| 🎨 **Premium UI** | Calm, glass-morphism design system with light/dark themes and 5 accent colors |

## 🚀 Quick Start

```bash
# Clone
git clone https://github.com/ibrahembuilds/focusflow.git
cd focusflow

# Install
npm install

# Configure environment (see .env.example)
cp .env.example .env

# Develop
npm run dev

# Build
npm run build
```

## 🔑 Environment setup

FocusFlow needs two services configured — see [`.env.example`](.env.example) for the full list:

1. **Supabase** — create a project, run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor, then set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
2. **OpenAI** — used by the AI task breakdown feature. The app deploys to Netlify; set `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`) as environment variables in Netlify's site settings — they're read server-side by the edge function at [`netlify/edge-functions/decompose.ts`](netlify/edge-functions/decompose.ts), never exposed to the browser.

## 🏗️ Architecture

```
src/
├── components/
│   ├── auth/                # Login, Signup, ProtectedRoute, AuthLayout
│   ├── Landing.tsx           # Public marketing page
│   ├── Timer.tsx              # Pomodoro with SVG ring
│   ├── TaskList.tsx           # DND Kit drag-and-drop
│   ├── AIDecompose.tsx        # OpenAI API integration
│   ├── Dashboard.tsx          # Stats + weekly charts
│   ├── CalendarView.tsx       # Monthly calendar
│   ├── Analytics.tsx          # Recharts charts
│   ├── Sidebar.tsx            # Navigation + account menu
│   ├── Settings.tsx           # Config + data management
│   └── Seo.tsx                # Per-route meta tags
├── lib/
│   ├── auth.tsx               # Supabase Auth context
│   ├── supabase.ts            # Supabase client
│   ├── sync.ts                # Task/session sync with Supabase (offline-safe write queue)
│   └── api.ts                 # AI decompose API client
├── store.ts                   # Zustand state management
└── index.css                  # Full design system
```

## 📦 Tech Stack

- **React 19** + **TypeScript** + **Vite 8**
- **React Router 7** — routing and protected routes
- **Supabase** — auth and Postgres-backed data storage
- **Zustand** — state management
- **DND Kit** — drag and drop
- **Recharts** — data visualization
- **Lucide React** — icons
- **OpenAI API** — AI task decomposition

## 📄 License

MIT © Ibrahem Ahmed
