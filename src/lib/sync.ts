import { supabase } from './supabase';
import type { Task, TimerSession } from '../store';

interface TaskRow {
  id: string;
  user_id: string;
  text: string;
  completed: boolean;
  sessions: number;
  created_at: string;
  project_id: string | null;
  due_date: string | null;
  priority: Task['priority'];
}

interface SessionRow {
  id: string;
  user_id: string;
  task_id: string | null;
  task_text: string | null;
  duration: number;
  completed: boolean;
  timestamp: string;
}

function taskFromRow(row: TaskRow): Task {
  return {
    id: row.id,
    text: row.text,
    completed: row.completed,
    sessions: row.sessions,
    createdAt: row.created_at,
    projectId: row.project_id ?? undefined,
    dueDate: row.due_date ?? undefined,
    priority: row.priority ?? undefined,
  };
}

function taskToRow(userId: string, task: Task) {
  return {
    id: task.id,
    user_id: userId,
    text: task.text,
    completed: task.completed,
    sessions: task.sessions,
    created_at: task.createdAt,
    project_id: task.projectId ?? null,
    due_date: task.dueDate ?? null,
    priority: task.priority ?? 'medium',
  };
}

function sessionFromRow(row: SessionRow): TimerSession {
  return {
    id: row.id,
    taskId: row.task_id,
    taskText: row.task_text,
    duration: row.duration,
    completed: row.completed,
    timestamp: row.timestamp,
  };
}

function sessionToRow(userId: string, session: TimerSession) {
  return {
    id: session.id,
    user_id: userId,
    task_id: session.taskId,
    task_text: session.taskText,
    duration: session.duration,
    completed: session.completed,
    timestamp: session.timestamp,
  };
}

// ── Reads ──
// Both readers return null when the request fails, so callers can tell
// "this account has no tasks yet" apart from "we couldn't reach the server"
// and avoid wiping good local data on a transient error.

export async function fetchUserTasks(userId: string): Promise<Task[] | null> {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('inserted_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch tasks:', error.message);
      return null;
    }
    return (data as TaskRow[]).map(taskFromRow);
  } catch (cause) {
    console.error('Failed to fetch tasks:', messageOf(cause));
    return null;
  }
}

export async function fetchUserSessions(userId: string): Promise<TimerSession[] | null> {
  try {
    const { data, error } = await supabase
      .from('timer_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Failed to fetch sessions:', error.message);
      return null;
    }
    return (data as SessionRow[]).map(sessionFromRow);
  } catch (cause) {
    console.error('Failed to fetch sessions:', messageOf(cause));
    return null;
  }
}

// ── Durable writes ──
// Every write is recorded in a local outbox before it is attempted and is only
// dropped once Supabase confirms it. A task added while offline — or during a
// dropped request — therefore still reaches the user's account on the next
// flush, instead of silently living in this browser until the next sign-in
// replaces it with server state.

const QUEUE_KEY = 'focusflow-pending-writes';
// A write that keeps failing for a non-transient reason must not block the
// queue forever; give up after this many flush attempts.
const MAX_ATTEMPTS = 8;

type WriteBody =
  | { kind: 'task-upsert'; task: Task }
  | { kind: 'task-delete'; taskId: string }
  | { kind: 'session-upsert'; session: TimerSession };

/** Rows sharing a `key` collapse to the newest one, so intents never replay stale state. */
type NewWrite = WriteBody & { key: string; userId: string };
type PendingWrite = NewWrite & { seq: number; attempts: number };

export interface SyncStatus {
  /** Writes still waiting to reach Supabase. */
  pending: number;
  flushing: boolean;
  /** Message from the most recent failed flush, cleared once one succeeds. */
  error: string | null;
}

type StatusListener = (status: SyncStatus) => void;

const statusListeners = new Set<StatusListener>();
let flushChain: Promise<unknown> = Promise.resolve();
let flushing = false;
let lastError: string | null = null;
let currentUserId: string | null = null;

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : 'Network request failed';
}

function readQueue(): PendingWrite[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingWrite[]) : [];
  } catch {
    return [];
  }
}

// Continue past the highest sequence already on disk so writes restored from a
// previous visit keep distinct ids from the ones made in this one.
let seqCounter = readQueue().reduce((max, write) => Math.max(max, write.seq ?? 0), 0);

function writeQueue(queue: PendingWrite[]) {
  try {
    if (queue.length === 0) localStorage.removeItem(QUEUE_KEY);
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (cause) {
    console.error('Failed to record pending change:', messageOf(cause));
  }
  notifyStatus();
}

function notifyStatus() {
  const status = getSyncStatus();
  statusListeners.forEach((listener) => listener(status));
}

export function getSyncStatus(): SyncStatus {
  return { pending: readQueue().length, flushing, error: lastError };
}

export function subscribeSyncStatus(listener: StatusListener) {
  statusListeners.add(listener);
  listener(getSyncStatus());
  return () => statusListeners.delete(listener);
}

function enqueue(write: NewWrite) {
  // Tasks share one key across upserts and deletes, so the newest intent for a
  // row always supersedes older queued ones.
  const queued: PendingWrite = { ...write, seq: (seqCounter += 1), attempts: 0 };
  writeQueue([...readQueue().filter((w) => w.key !== write.key), queued]);
}

function settle(write: PendingWrite) {
  writeQueue(readQueue().filter((w) => w.seq !== write.seq));
}

function recordAttempt(write: PendingWrite, attempts: number) {
  writeQueue(readQueue().map((w) => (w.seq === write.seq ? { ...w, attempts } : w)));
}

async function runWrite(write: PendingWrite): Promise<string | null> {
  try {
    if (write.kind === 'task-upsert') {
      const { error } = await supabase.from('tasks').upsert(taskToRow(write.userId, write.task));
      return error?.message ?? null;
    }
    if (write.kind === 'task-delete') {
      const { error } = await supabase.from('tasks').delete().eq('id', write.taskId);
      return error?.message ?? null;
    }
    // Upsert rather than insert: a retry after an ambiguous failure must not
    // trip the primary key when the first attempt actually landed.
    const { error } = await supabase
      .from('timer_sessions')
      .upsert(sessionToRow(write.userId, write.session));
    return error?.message ?? null;
  } catch (cause) {
    return messageOf(cause);
  }
}

/**
 * Send everything this browser still owes the server for `userId`.
 * Resolves true when that account's outbox is empty.
 *
 * Calls queue behind each other rather than running concurrently, so awaiting
 * this always means "the outbox has been drained" — sign-in can therefore read
 * the account back without racing a write that is still on the wire.
 */
export function flushPendingWrites(userId: string | null): Promise<boolean> {
  if (!userId) return Promise.resolve(true);
  const result = flushChain.then(() => drainOutbox(userId));
  // One failed flush must not break the chain for the next caller.
  flushChain = result.catch(() => undefined);
  return result;
}

async function drainOutbox(userId: string): Promise<boolean> {
  // Writes belonging to another account stay queued until that user signs back
  // in — row-level security would reject them under this session.
  const own = readQueue().filter((w) => w.userId === userId);
  if (own.length === 0) return true;

  flushing = true;
  notifyStatus();
  try {
    for (const write of own) {
      const error = await runWrite(write);
      if (!error) {
        settle(write);
        continue;
      }

      const attempts = write.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        console.error(`Giving up on pending ${write.kind} after ${attempts} attempts:`, error);
        settle(write);
        continue;
      }

      // Stop at the first failure so later writes can't overtake earlier ones.
      recordAttempt(write, attempts);
      lastError = error;
      return false;
    }
    lastError = null;
    return true;
  } finally {
    flushing = false;
    notifyStatus();
  }
}

/** Local edits that haven't reached Supabase yet, for merging over a fetch. */
export function getPendingTaskWrites(userId: string) {
  const own = readQueue().filter((w) => w.userId === userId);
  return {
    upserts: own.flatMap((w) => (w.kind === 'task-upsert' ? [w.task] : [])),
    deletedIds: own.flatMap((w) => (w.kind === 'task-delete' ? [w.taskId] : [])),
  };
}

export function saveTaskRemote(userId: string, task: Task) {
  enqueue({ kind: 'task-upsert', key: `task:${task.id}`, userId, task });
  return flushPendingWrites(userId);
}

export function deleteTaskRemote(userId: string, taskId: string) {
  enqueue({ kind: 'task-delete', key: `task:${taskId}`, userId, taskId });
  return flushPendingWrites(userId);
}

export function saveSessionRemote(userId: string, session: TimerSession) {
  enqueue({ kind: 'session-upsert', key: `session:${session.id}`, userId, session });
  return flushPendingWrites(userId);
}

// ── Connection check ──
// A real round trip against the user's project, so "my tasks aren't saving"
// produces the actual Postgres error instead of a shrug.

export interface SyncCheck {
  ok: boolean;
  signedIn: boolean;
  canRead: boolean;
  canWrite: boolean;
  /** Tasks Supabase currently holds for this account. */
  serverTaskCount: number | null;
  pending: number;
  error: string | null;
  /** Plain-language next step for the most common causes. */
  hint: string | null;
}

function hintFor(error: string): string {
  const text = error.toLowerCase();
  if (text.includes('does not exist') || text.includes('schema cache')) {
    return "The tasks table isn't in this Supabase project yet. Open the Supabase dashboard → SQL Editor and run supabase/schema.sql.";
  }
  if (text.includes('row-level security') || text.includes('violates row-level')) {
    return 'Row-level security is rejecting the write. Re-run the policy statements at the bottom of supabase/schema.sql.';
  }
  if (text.includes('jwt') || text.includes('not authenticated') || text.includes('invalid claim')) {
    return 'The session is no longer valid. Log out and log back in.';
  }
  if (text.includes('failed to fetch') || text.includes('networkerror')) {
    return 'The browser could not reach Supabase. Check the connection, and that VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set wherever the app is deployed.';
  }
  return 'Check the Supabase project URL and anon key, and that supabase/schema.sql has been run against this project.';
}

export async function checkSyncConnection(): Promise<SyncCheck> {
  const base: SyncCheck = {
    ok: false,
    signedIn: false,
    canRead: false,
    canWrite: false,
    serverTaskCount: null,
    pending: readQueue().length,
    error: null,
    hint: null,
  };

  try {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (authError || !userId) {
      const error = authError?.message ?? 'No signed-in user.';
      return { ...base, error, hint: hintFor(error) };
    }
    base.signedIn = true;

    const { count, error: readError } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (readError) return { ...base, error: readError.message, hint: hintFor(readError.message) };
    base.canRead = true;
    base.serverTaskCount = count ?? 0;

    // Prove the account can actually write. The probe is dated 1970 so it can
    // never surface in a day's task list even if the cleanup below fails.
    const probeId = crypto.randomUUID();
    const { error: writeError } = await supabase.from('tasks').insert({
      id: probeId,
      user_id: userId,
      text: 'FocusFlow connection check',
      completed: false,
      sessions: 0,
      created_at: '1970-01-01',
      priority: 'low',
    });
    if (writeError) return { ...base, error: writeError.message, hint: hintFor(writeError.message) };

    const { error: cleanupError } = await supabase.from('tasks').delete().eq('id', probeId);
    if (cleanupError) {
      return {
        ...base,
        canWrite: true,
        error: `Saved a test row but could not remove it: ${cleanupError.message}`,
        hint: 'Writes work; the delete policy in supabase/schema.sql may be missing.',
      };
    }

    return { ...base, ok: true, canWrite: true };
  } catch (cause) {
    const error = messageOf(cause);
    return { ...base, error, hint: hintFor(error) };
  }
}

export async function updateUserMetadata(data: Record<string, unknown>) {
  try {
    const { error } = await supabase.auth.updateUser({ data });
    if (error) console.error('Failed to save account data:', error.message);
  } catch (cause) {
    console.error('Failed to save account data:', messageOf(cause));
  }
}

/** Tells the retry hooks below which account's outbox to drain. */
export function setSyncUser(userId: string | null) {
  currentUserId = userId;
  if (userId) void flushPendingWrites(userId);
}

if (typeof window !== 'undefined') {
  // Retry as soon as the browser is back online, and once more when the tab
  // regains focus — an offline task then lands without the user doing anything.
  window.addEventListener('online', () => void flushPendingWrites(currentUserId));
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flushPendingWrites(currentUserId);
  });
}
