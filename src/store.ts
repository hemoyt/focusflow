import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  fetchUserTasks,
  fetchUserSessions,
  saveTaskRemote,
  deleteTaskRemote,
  saveSessionRemote,
  updateUserMetadata,
  flushPendingWrites,
  getPendingTaskWrites,
  setSyncUser,
  subscribeSyncStatus,
} from './lib/sync';

export interface AuthUser {
  id: string;
  user_metadata?: Record<string, unknown>;
}

// ── Types ──
export interface Task {
  id: string;
  text: string;
  completed: boolean;
  sessions: number;
  createdAt: string; // ISO date
  projectId?: string;
  dueDate?: string;
  priority?: 'low' | 'medium' | 'high';
}

export interface TimerSession {
  id: string;
  taskId: string | null;
  taskText: string | null;
  duration: number; // seconds
  completed: boolean;
  timestamp: string;
}

export type AccentColor = 'forest' | 'ocean' | 'violet' | 'rose' | 'amber';

export interface DecomposedTask {
  text: string;
  priority: NonNullable<Task['priority']>;
  estimatedSessions: number;
}

export interface FocusFlowState {
  // Appearance
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  accentColor: AccentColor;
  setAccentColor: (color: AccentColor) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  hasCompletedOnboarding: boolean;
  setHasCompletedOnboarding: (completed: boolean) => void;

  // Auth-scoped data sync
  userId: string | null;
  isSyncing: boolean;
  /** Changes saved locally that haven't reached the user's account yet. */
  pendingWrites: number;
  syncError: string | null;
  hydrateForUser: (user: AuthUser | null) => Promise<void>;
  retrySync: () => Promise<void>;

  // Tasks
  tasks: Task[];
  addTask: (text: string, priority?: Task['priority']) => void;
  addTasks: (items: { text: string; priority?: Task['priority'] }[]) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  reorderTasks: (fromIndex: number, toIndex: number) => void;
  incrementTaskSession: (id: string) => void;

  // Timer
  timerRunning: boolean;
  timerPaused: boolean;
  timerMinutes: number;
  breakMinutes: number;
  activeTaskId: string | null;
  setTimerRunning: (running: boolean) => void;
  setTimerPaused: (paused: boolean) => void;
  setTimerMinutes: (minutes: number) => void;
  setBreakMinutes: (minutes: number) => void;
  setActiveTaskId: (id: string | null) => void;

  // Sessions history
  sessions: TimerSession[];
  addSession: (session: TimerSession) => void;

  // AI Decompose
  isDecomposing: boolean;
  decomposeResult: DecomposedTask[];
  setDecomposing: (v: boolean) => void;
  setDecomposeResult: (results: DecomposedTask[]) => void;
  clearDecompose: () => void;

}

// Helper
const today = () => toLocalDateString(new Date());
const uid = () => crypto.randomUUID();

export const useStore = create<FocusFlowState>()(
  persist(
    (set, get) => ({
      // Appearance
      theme: 'light',
      setTheme: (theme) => {
        set({ theme });
        if (get().userId) void updateUserMetadata({ theme });
      },
      accentColor: 'forest',
      setAccentColor: (accentColor) => {
        set({ accentColor });
        if (get().userId) void updateUserMetadata({ accentColor });
      },
      sidebarCollapsed: false,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      hasCompletedOnboarding: false,
      setHasCompletedOnboarding: (hasCompletedOnboarding) => {
        set({ hasCompletedOnboarding });
        if (get().userId) void updateUserMetadata({ hasCompletedOnboarding });
      },

      // ── Auth-scoped data sync ──
      userId: null,
      isSyncing: false,
      pendingWrites: 0,
      syncError: null,

      retrySync: async () => {
        await flushPendingWrites(get().userId);
      },

      hydrateForUser: async (user) => {
        setSyncUser(user?.id ?? null);
        if (!user) {
          set({ userId: null, tasks: [], sessions: [] });
          return;
        }
        // Preferences and onboarding state are tied to the account, not the
        // browser, so they follow a user across devices. Only apply a value
        // from the server when it's actually been set — otherwise keep
        // whatever this browser already has (e.g. a brand-new account).
        const metadata = user.user_metadata ?? {};
        const patch: Partial<FocusFlowState> = { userId: user.id, isSyncing: true };
        // Never let one account see what another one left in this browser's
        // local storage.
        const previousUserId = get().userId;
        if (previousUserId && previousUserId !== user.id) {
          patch.tasks = [];
          patch.sessions = [];
        }
        if (typeof metadata.hasCompletedOnboarding === 'boolean') {
          patch.hasCompletedOnboarding = metadata.hasCompletedOnboarding;
        }
        if (metadata.theme === 'light' || metadata.theme === 'dark') {
          patch.theme = metadata.theme;
        }
        if (typeof metadata.accentColor === 'string') {
          patch.accentColor = metadata.accentColor as AccentColor;
        }
        if (typeof metadata.timerMinutes === 'number') {
          patch.timerMinutes = metadata.timerMinutes;
        }
        if (typeof metadata.breakMinutes === 'number') {
          patch.breakMinutes = metadata.breakMinutes;
        }
        set(patch);

        // Push anything this browser still owes the server before reading it
        // back, so a task created offline isn't erased by the fetch below.
        await flushPendingWrites(user.id);

        const [tasks, sessions] = await Promise.all([
          fetchUserTasks(user.id),
          fetchUserSessions(user.id),
        ]);
        // Bail if the user switched again while this fetch was in flight.
        if (get().userId !== user.id) return;
        // A failed fetch returns null — keep what we already have rather than
        // blanking the app because the network hiccuped.
        set({
          tasks: tasks ? mergePendingTasks(tasks, user.id) : get().tasks,
          sessions: sessions ?? get().sessions,
          isSyncing: false,
        });
      },

      // ── Tasks ──
      tasks: [],

      addTask: (text, priority = 'medium') => {
        const newTask: Task = { id: uid(), text, completed: false, sessions: 0, createdAt: today(), priority };
        set((s) => ({ tasks: [newTask, ...s.tasks] }));
        const userId = get().userId;
        if (userId) void saveTaskRemote(userId, newTask);
      },

      addTasks: (items) => {
        const newTasks: Task[] = items.map((item) => ({
          id: uid(),
          text: item.text,
          completed: false,
          sessions: 0,
          createdAt: today(),
          priority: item.priority ?? 'medium',
        }));
        set((s) => ({ tasks: [...newTasks, ...s.tasks] }));
        const userId = get().userId;
        if (userId) newTasks.forEach((t) => void saveTaskRemote(userId, t));
      },

      toggleTask: (id) => {
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
        }));
        const userId = get().userId;
        const updated = get().tasks.find((t) => t.id === id);
        if (userId && updated) void saveTaskRemote(userId, updated);
      },

      deleteTask: (id) => {
        set((s) => ({
          tasks: s.tasks.filter((t) => t.id !== id),
          activeTaskId: s.activeTaskId === id ? null : s.activeTaskId,
        }));
        const userId = get().userId;
        if (userId) void deleteTaskRemote(userId, id);
      },

      reorderTasks: (fromIndex, toIndex) =>
        set((s) => {
          const todaysTasks = s.tasks.filter((t) => t.createdAt === today());
          const others = s.tasks.filter((t) => t.createdAt !== today());
          const [moved] = todaysTasks.splice(fromIndex, 1);
          todaysTasks.splice(toIndex, 0, moved);
          return { tasks: [...todaysTasks, ...others] };
        }),

      incrementTaskSession: (id) => {
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, sessions: t.sessions + 1 } : t
          ),
        }));
        const userId = get().userId;
        const updated = get().tasks.find((t) => t.id === id);
        if (userId && updated) void saveTaskRemote(userId, updated);
      },

      // ── Timer ──
      timerRunning: false,
      timerPaused: false,
      timerMinutes: 25,
      breakMinutes: 5,
      activeTaskId: null,

      setTimerRunning: (running) => set({ timerRunning: running }),
      setTimerPaused: (paused) => set({ timerPaused: paused }),
      setTimerMinutes: (minutes) => {
        set({ timerMinutes: minutes });
        if (get().userId) void updateUserMetadata({ timerMinutes: minutes });
      },
      setBreakMinutes: (minutes) => {
        set({ breakMinutes: minutes });
        if (get().userId) void updateUserMetadata({ breakMinutes: minutes });
      },
      setActiveTaskId: (id) => set({ activeTaskId: id }),

      // ── Sessions ──
      sessions: [],
      addSession: (session) => {
        set((s) => ({ sessions: [session, ...s.sessions] }));
        const userId = get().userId;
        if (userId) void saveSessionRemote(userId, session);
      },

      // ── AI ──
      isDecomposing: false,
      decomposeResult: [],
      setDecomposing: (v) => set({ isDecomposing: v }),
      setDecomposeResult: (results) => set({ decomposeResult: results }),
      clearDecompose: () => set({ decomposeResult: [], isDecomposing: false }),

    }),
    {
      name: 'focusflow-storage',
      partialize: (state) => ({
        // Remembering who the cached tasks belong to lets the next sign-in
        // tell "my data" from "the previous account's data".
        userId: state.userId,
        tasks: state.tasks,
        sessions: state.sessions,
        timerMinutes: state.timerMinutes,
        breakMinutes: state.breakMinutes,
        theme: state.theme,
        accentColor: state.accentColor,
        sidebarCollapsed: state.sidebarCollapsed,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
      }),
    }
  )
);

// Keep the store's view of the outbox in step with the sync layer so the UI can
// tell the user whether their tasks have actually reached their account.
subscribeSyncStatus(({ pending, error }) => {
  useStore.setState({ pendingWrites: pending, syncError: error });
});

/**
 * Lay local edits that haven't been confirmed yet over the server's copy, so a
 * task added offline stays visible instead of vanishing on the next fetch.
 */
function mergePendingTasks(serverTasks: Task[], userId: string): Task[] {
  const { upserts, deletedIds } = getPendingTaskWrites(userId);
  if (upserts.length === 0 && deletedIds.length === 0) return serverTasks;

  const pendingById = new Map(upserts.map((task) => [task.id, task]));
  const merged = serverTasks
    .filter((task) => !deletedIds.includes(task.id))
    .map((task) => pendingById.get(task.id) ?? task);

  const onServer = new Set(merged.map((task) => task.id));
  const notYetSaved = upserts.filter((task) => !onServer.has(task.id));
  return [...notYetSaved, ...merged];
}

// ── Derived helpers (not stored) ──
export function getTodaysTasks(tasks: Task[]) {
  return tasks.filter((t) => t.createdAt === today());
}

export function getCompletedToday(tasks: Task[]) {
  return tasks.filter((t) => t.completed && t.createdAt === today()).length;
}

export function getTotalSessions(sessions: TimerSession[]) {
  return sessions.filter((s) => s.completed).length;
}

export function getTotalFocusTime(sessions: TimerSession[]) {
  return sessions.filter((s) => s.completed).reduce((acc, s) => acc + s.duration, 0);
}

export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function getWeeklyData(tasks: Task[], sessions: TimerSession[]) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const data = days.map((name, i) => {
    const date = new Date();
    date.setDate(date.getDate() - date.getDay() + i);
    const ds = toLocalDateString(date);
    return {
      name,
      tasks: tasks.filter((t) => t.createdAt === ds).length,
      completed: tasks.filter((t) => t.completed && t.createdAt === ds).length,
      sessions: sessions.filter(
        (s) => s.completed && toLocalDateString(new Date(s.timestamp)) === ds,
      ).length,
      minutes: Math.round(
        sessions
          .filter(
            (s) => s.completed && toLocalDateString(new Date(s.timestamp)) === ds,
          )
          .reduce((acc, s) => acc + s.duration, 0) / 60
      ),
    };
  });
  return data;
}

function getActivityDates(tasks: Task[], sessions: TimerSession[]) {
  const dates = new Set<string>();

  tasks.forEach((task) => {
    if (task.completed) dates.add(task.createdAt);
  });

  sessions.forEach((session) => {
    if (session.completed) dates.add(toLocalDateString(new Date(session.timestamp)));
  });

  return dates;
}

function toLocalDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCurrentStreak(tasks: Task[], sessions: TimerSession[]) {
  const activityDates = getActivityDates(tasks, sessions);
  const cursor = new Date();

  if (!activityDates.has(toLocalDateString(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  while (activityDates.has(toLocalDateString(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export function getLongestStreak(tasks: Task[], sessions: TimerSession[]) {
  const dates = [...getActivityDates(tasks, sessions)].sort();
  if (dates.length === 0) return 0;

  let longest = 1;
  let current = 1;

  for (let index = 1; index < dates.length; index += 1) {
    const previous = new Date(`${dates[index - 1]}T00:00:00`);
    const next = new Date(`${dates[index]}T00:00:00`);
    const difference = Math.round((next.getTime() - previous.getTime()) / 86_400_000);

    if (difference === 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else if (difference > 1) {
      current = 1;
    }
  }

  return longest;
}

export function getRecentActivity(tasks: Task[], sessions: TimerSession[], days = 7) {
  const activityDates = getActivityDates(tasks, sessions);

  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - index - 1));
    const dateString = toLocalDateString(date);

    return {
      date: dateString,
      label: date.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1),
      active: activityDates.has(dateString),
      isToday: index === days - 1,
    };
  });
}
