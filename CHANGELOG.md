# FocusFlow Changelog

All notable changes to the FocusFlow productivity platform.

---

## [Unreleased] — Durable task saving

### 💾 Tasks always reach your account
- Every task add, edit, completion, delete, and focus session is queued locally before it is sent and only dropped once Supabase confirms it — a task created offline or during a dropped request still lands in your account
- Queued changes are retried automatically when the browser comes back online, when the tab regains focus, and at the next sign-in; a banner on the Tasks page shows anything still waiting, with a "Retry now" button
- A failed load no longer blanks the app: tasks and sessions stay on screen when the fetch errors, and unconfirmed local edits are merged over the server's copy
- Cached tasks are tied to the account that created them, so a second account signing in on the same browser never sees the first one's data

---

## [1.1.0] — 2026-07-20 — Accounts, SEO & AI Provider Switch

### 🔐 Authentication & Authorization
- Email/password accounts via Supabase Auth (sign up, log in, log out)
- Protected `/app/*` routes — logged-out visitors are redirected to `/login`
- Per-user data isolation: `tasks` and `timer_sessions` scoped by `user_id` with row-level security
- Tasks and focus sessions sync live to Supabase per account

### 🏠 Landing Page
- New public marketing page at `/` with hero, feature grid, "how it works" steps, and FAQ
- Responsive nav with mobile menu

### 🔍 SEO / AIO / GEO
- Full meta tags: description, canonical URL, Open Graph, Twitter Cards
- JSON-LD structured data: `SoftwareApplication`, `Organization`, `FAQPage`
- `robots.txt` (with explicit AI-crawler allowances), `sitemap.xml`, `llms.txt`, and a web app manifest
- Per-route `<title>`/meta via a lightweight `Seo` component; private `/app/*` pages marked `noindex`

### 🧠 AI Task Decomposition
- Switched provider from OpenRouter to the OpenAI API directly (`OPENAI_API_KEY`, `OPENAI_MODEL`)

### 📱 Responsive fixes
- iOS safe-area padding for the mobile bottom nav and toasts
- Overflow fixes on narrow phones across Analytics, Timer, Settings, and Calendar

---

## [1.0.0] — 2026-07-13 — Initial Release 🚀

### Complete Rewrite from Promda
- Complete architecture upgrade from single HTML file to React 18 + TypeScript + Vite
- Premium dark-themed design system with custom CSS (Linear/Things 3 inspired)
- State management via Zustand with localStorage persistence
- Client-side routing with React Router v7

### 🎯 Focus Timer
- Circular SVG progress ring with smooth animations
- Work/Break cycle automation with audio chimes
- Quick presets: 25m, 45m, 60m focus / 5m, 10m, 15m break
- Task-linked sessions — select what you're working on
- Pause, resume, stop, skip break controls
- Auto-records completed sessions to analytics

### 🧠 AI Task Decomposition
- OpenRouter API integration (GPT-4o-mini by default)
- Natural language goal input → AI generates 4-8 actionable subtasks
- Example goals to try (Launch store, Plan wedding, Learn TS, etc.)
- One-click "Add All to Today" into task list
- API key management in Settings
- Fallback parsing for resilient JSON extraction

### 📋 Task Manager
- Drag-and-drop reordering via @dnd-kit
- Priority levels: Low, Medium, High with color badges
- Task completion tracking with session counts (🍅)
- Active/Completed task sections
- One-click "Start Focus" jumps to timer with task pre-selected
- AI-generated tasks appear as banner with Add All / Dismiss

### 📊 Dashboard & Analytics
- Live stats: Tasks Done, Total Sessions, Focus Time, Active Tasks
- Weekly bar chart (Sessions + Completed per day) via Recharts
- Priority breakdown pie chart
- Weekly breakdown table with per-day metrics
- Quick-launch to Focus Timer from dashboard

### 📅 Calendar
- Monthly calendar grid with navigation
- Task dot indicators on days with activity
- Click any day to see tasks created on that date
- "Today" quick-jump button

### ⚙️ Settings
- OpenRouter API key configuration
- Default timer/break duration preferences
- Data export (JSON backup download)
- Full data reset with confirmation
- About section with app info

### 🎨 Design & UX
- Dark theme (Linear-inspired) with CSS custom properties
- Glass morphism surfaces with backdrop blur
- Smooth transitions and hover effects (150ms-400ms cubic-bezier)
- Animated page transitions (fadeIn)
- Pulsing glow effects on active states
- Custom scrollbar styling
- Inter + JetBrains Mono typography
- Lucide React icon set throughout
- Fully responsive: sidebar collapses on mobile, grid adapts
- Tabular-nums for all number displays

### 🏗️ Architecture
- React 18 + TypeScript + Vite 8
- Zustand store with persist middleware
- @dnd-kit/core + @dnd-kit/sortable for drag-and-drop
- Recharts for data visualization
- Framer Motion (available for future animations)
- date-fns for date utilities
- OpenRouter REST API for AI features
- Zero backend dependencies — 100% client-side

### 📦 Build
- Production bundle: 15KB CSS + 694KB JS (208KB gzipped)
- TypeScript strict mode, zero errors
- Vite code-splitting ready

---

## Prior History (Promda)

### [Unreleased] — 2026-07-07
- Minor maintenance and housekeeping

### Initial
- Single-file HTML Pomodoro timer + task manager
- Vanilla JS with localStorage persistence
- 25min work / 5min break cycles
- Task CRUD with session tracking
- Glassmorphism UI with Inter font
