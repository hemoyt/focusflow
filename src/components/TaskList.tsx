import { useState, useMemo, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, Play, Plus, Sparkles, Check, Target, CloudOff, RefreshCw } from 'lucide-react';
import { useStore, getTodaysTasks } from '../store';
import type { Task } from '../store';
import { Link, useNavigate } from 'react-router-dom';

// ── Sortable Task Item ──
function SortableTask({
  task,
  onToggle,
  onDelete,
  onStart,
}: {
  task: Task;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onStart: (task: Task) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`task-item ${isDragging ? 'dragging' : ''} ${
        task.completed ? 'completed' : ''
      }`}
    >
      <div className="task-drag-handle" {...attributes} {...listeners}>
        <GripVertical size={16} />
      </div>

      <button
        className={`task-check ${task.completed ? 'done' : ''}`}
        onClick={() => onToggle(task.id)}
      >
        {task.completed && <Check size={12} strokeWidth={3} />}
      </button>

      <span className="task-text">{task.text}</span>

      <div className="task-meta">
        {task.priority && (
          <span
            className={`badge ${
              task.priority === 'high'
                ? 'badge-danger'
                : task.priority === 'medium'
                ? 'badge-warning'
                : 'badge-primary'
            }`}
          >
            {task.priority}
          </span>
        )}
        <span className="task-sessions">{task.sessions} sessions</span>

        {!task.completed && (
          <button
            className="btn btn-ghost btn-sm btn-icon"
            onClick={() => onStart(task)}
            title="Start focus session"
          >
            <Play size={14} />
          </button>
        )}

        <button
          className="task-delete"
          onClick={() => onDelete(task.id)}
          title="Delete task"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Main TaskList ──
export default function TaskList() {
  const {
    tasks,
    addTask,
    addTasks,
    toggleTask,
    deleteTask,
    reorderTasks,
    setActiveTaskId,
    setTimerMinutes,
    decomposeResult,
    clearDecompose,
    pendingWrites,
    syncError,
    retrySync,
  } = useStore();
  const navigate = useNavigate();

  const [newTaskText, setNewTaskText] = useState('');
  const [priority, setPriority] = useState<Task['priority']>('medium');
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  useEffect(() => {
    setSelectedIndices(new Set(decomposeResult.map((_, i) => i)));
  }, [decomposeResult]);

  const todaysTasks = getTodaysTasks(tasks);
  const active = todaysTasks.filter((t) => !t.completed);
  const completed = todaysTasks.filter((t) => t.completed);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Flatten today's incomplete tasks for DnD
  const activeIds = useMemo(() => active.map((t) => t.id), [active]);

  function handleDragEnd(event: DragEndEvent) {
    const { active: dragged, over } = event;
    if (!over || dragged.id === over.id) return;

    const oldIndex = activeIds.indexOf(String(dragged.id));
    const newIndex = activeIds.indexOf(String(over.id));
    if (oldIndex !== -1 && newIndex !== -1) {
      reorderTasks(oldIndex, newIndex);
    }
  }

  function handleAdd() {
    const text = newTaskText.trim();
    if (!text) return;
    addTask(text, priority);
    setNewTaskText('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleAdd();
  }

  function handleStartFocus(task: Task) {
    setActiveTaskId(task.id);
    setTimerMinutes(25);
    navigate('/app/timer');
  }

  function toggleDecomposedSelection(index: number) {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function handleAddDecomposed() {
    const selected = decomposeResult.filter((_, i) => selectedIndices.has(i));
    if (selected.length > 0) {
      addTasks(selected);
      clearDecompose();
    }
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-subtitle">
            {active.length} active, {completed.length} completed today
          </p>
        </div>
        <Link to="/app/ai-decompose" className="btn btn-primary">
          <Sparkles size={16} />
          AI Decompose
        </Link>
      </div>

      {/* Unsent changes — they're stored on this device and retried automatically */}
      {pendingWrites > 0 && (
        <div className="sync-banner" role="status">
          <CloudOff size={15} aria-hidden="true" />
          <span className="sync-banner-text">
            {pendingWrites === 1 ? '1 change is' : `${pendingWrites} changes are`} saved on this
            device and waiting to reach your account. They'll sync automatically once you're back
            online.
            {syncError && (
              <>
                {' '}
                Last error: <strong>{syncError}</strong> — Settings → Cloud sync has a connection
                check.
              </>
            )}
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void retrySync()}>
            <RefreshCw size={13} />
            Retry now
          </button>
        </div>
      )}

      {/* Decomposed results banner */}
      {decomposeResult.length > 0 && (
        <div
          className="ai-decompose-box"
          style={{
            borderColor: 'var(--color-primary)',
            boxShadow: 'var(--shadow-glow-primary)',
          }}
        >
          <div className="ai-decompose-header">
            <div className="ai-icon"><Sparkles size={18} /></div>
            <div>
              <h3 style={{ fontSize: '0.95rem' }}>AI Suggestions Ready</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                {selectedIndices.size} of {decomposeResult.length} selected
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm ai-select-toggle"
              onClick={() =>
                setSelectedIndices(
                  selectedIndices.size === decomposeResult.length
                    ? new Set()
                    : new Set(decomposeResult.map((_, i) => i))
                )
              }
            >
              {selectedIndices.size === decomposeResult.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <div className="ai-result-list">
            {decomposeResult.map((task, i) => (
              <div key={i} className="ai-result-item">
                <button
                  type="button"
                  className={`task-check ${selectedIndices.has(i) ? 'done' : ''}`}
                  onClick={() => toggleDecomposedSelection(i)}
                  aria-pressed={selectedIndices.has(i)}
                  aria-label={selectedIndices.has(i) ? 'Deselect task' : 'Select task'}
                >
                  {selectedIndices.has(i) && <Check size={12} strokeWidth={3} />}
                </button>
                <span className="ai-result-text">{task.text}</span>
                <span
                  className={`badge ${
                    task.priority === 'high'
                      ? 'badge-danger'
                      : task.priority === 'low'
                        ? 'badge-primary'
                        : 'badge-warning'
                  }`}
                >
                  {task.priority}
                </span>
                <span className="ai-result-sessions">
                  {task.estimatedSessions} {task.estimatedSessions === 1 ? 'session' : 'sessions'}
                </span>
              </div>
            ))}
          </div>
          <div className="ai-add-all" style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-primary" onClick={handleAddDecomposed} disabled={selectedIndices.size === 0}>
              <Plus size={14} />
              Add {selectedIndices.size > 0 ? selectedIndices.size : ''} to Today
            </button>
            <button className="btn btn-ghost" onClick={clearDecompose}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Add task */}
      <div className="task-input-row">
        <input
          className="input"
          placeholder="What do you want to accomplish?"
          value={newTaskText}
          onChange={(e) => setNewTaskText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <select
          className="btn btn-ghost btn-sm"
          value={priority}
          onChange={(e) => setPriority(e.target.value as Task['priority'])}
          style={{ minWidth: '100px' }}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <button className="btn btn-primary" onClick={handleAdd}>
          <Plus size={16} />
          Add
        </button>
      </div>

      {/* Active tasks */}
      {active.length === 0 && completed.length === 0 ? (
        <div className="empty-state">
          <Target className="empty-state-icon" size={34} aria-hidden="true" />
          <div className="empty-state-title">No tasks for today</div>
          <div className="empty-state-desc">
            Add a task above or use AI Decompose to break down a big goal.
          </div>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={activeIds} strategy={verticalListSortingStrategy}>
            <div className="task-list">
              {active.map((task) => (
                <SortableTask
                  key={task.id}
                  task={task}
                  onToggle={toggleTask}
                  onDelete={deleteTask}
                  onStart={handleStartFocus}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Completed tasks */}
      {completed.length > 0 && (
        <>
          <h3
            style={{
              marginTop: '2rem',
              marginBottom: '0.75rem',
              color: 'var(--text-tertiary)',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            Completed ({completed.length})
          </h3>
          <div className="task-list">
            {completed.map((task) => (
              <div key={task.id} className="task-item completed">
                <button
                  className="task-check done"
                  onClick={() => toggleTask(task.id)}
                >
                  <Check size={12} strokeWidth={3} />
                </button>
                <span className="task-text">{task.text}</span>
                <div className="task-meta">
                  <span className="task-sessions">{task.sessions} sessions</span>
                  <button className="task-delete" onClick={() => deleteTask(task.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
