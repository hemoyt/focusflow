import { useState, useEffect } from 'react';
import {
  Trash2,
  Download,
  AlertTriangle,
  Sun,
  Moon,
  Palette,
  Check,
  CircleHelp,
  CloudCheck,
  CloudAlert,
  RefreshCw,
} from 'lucide-react';
import { useStore } from '../store';
import { useAuth } from '../lib/auth';
import { checkSyncConnection } from '../lib/sync';
import type { SyncCheck } from '../lib/sync';

const COLOR_OPTIONS = [
  { id: 'forest', label: 'Forest' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'violet', label: 'Violet' },
  { id: 'rose', label: 'Rose' },
  { id: 'amber', label: 'Amber' },
] as const;

export default function Settings() {
  const {
    tasks,
    sessions,
    timerMinutes,
    breakMinutes,
    setTimerMinutes,
    setBreakMinutes,
    theme,
    setTheme,
    accentColor,
    setAccentColor,
    setHasCompletedOnboarding,
    pendingWrites,
    syncError,
    retrySync,
  } = useStore();
  const { user, updateProfile } = useAuth();
  const [showReset, setShowReset] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<SyncCheck | null>(null);
  const [fullName, setFullName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  useEffect(() => {
    const metadataName = user?.user_metadata?.fullName;
    setFullName(typeof metadataName === 'string' ? metadataName : '');
  }, [user]);

  async function handleSaveProfile() {
    setSavingProfile(true);
    await updateProfile({ fullName: fullName.trim() });
    setSavingProfile(false);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  }

  async function handleCheckSync() {
    setChecking(true);
    await retrySync();
    setCheckResult(await checkSyncConnection());
    setChecking(false);
  }

  function handleExport() {
    const data = {
      tasks,
      sessions,
      exportedAt: new Date().toISOString(),
      version: '1.0',
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `focusflow-backup-${new Date().toISOString().split('T')[0]}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handleReset() {
    localStorage.removeItem('focusflow-storage');
    window.location.reload();
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Tune the workspace to fit the way you focus.</p>
        </div>
      </div>

      <div className="settings-stack">
        <section className="card" aria-labelledby="profile-title">
          <h2 className="settings-title" id="profile-title">Profile</h2>
          <p className="settings-description">Your name shows up in the sidebar and your dashboard greeting.</p>
          <div className="settings-fields">
            <div>
              <label className="field-label" htmlFor="profile-name">Name</label>
              <input
                id="profile-name"
                className="input"
                type="text"
                maxLength={60}
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Add your name"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="profile-email">Email</label>
              <input id="profile-email" className="input" type="email" value={user?.email ?? ''} readOnly />
            </div>
          </div>
          <div className="profile-actions">
            <button
              className="btn btn-primary btn-sm"
              onClick={handleSaveProfile}
              disabled={savingProfile}
            >
              {savingProfile ? 'Saving…' : 'Save name'}
            </button>
            {profileSaved && <span className="profile-saved-note">Saved</span>}
          </div>
          {user?.created_at && (
            <small className="profile-member-since">
              Member since {new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </small>
          )}
        </section>

        <section className="card" aria-labelledby="appearance-title">
          <h2 className="settings-title" id="appearance-title">Appearance</h2>
          <p className="settings-description">Choose a theme and one app color. Changes apply instantly.</p>
          <div className="theme-options" role="group" aria-label="Color theme">
            <button
              type="button"
              className={`theme-option${theme === 'light' ? ' active' : ''}`}
              onClick={() => setTheme('light')}
              aria-pressed={theme === 'light'}
            >
              <Sun size={18} />
              <span><strong>Light</strong><small>Bright and clear</small></span>
            </button>
            <button
              type="button"
              className={`theme-option${theme === 'dark' ? ' active' : ''}`}
              onClick={() => setTheme('dark')}
              aria-pressed={theme === 'dark'}
            >
              <Moon size={18} />
              <span><strong>Dark</strong><small>Calm in low light</small></span>
            </button>
          </div>
          <div className="color-setting-heading">
            <Palette size={17} aria-hidden="true" />
            <span>App color</span>
          </div>
          <div className="color-options" role="group" aria-label="App color">
            {COLOR_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`color-option color-${option.id}${accentColor === option.id ? ' active' : ''}`}
                onClick={() => setAccentColor(option.id)}
                aria-pressed={accentColor === option.id}
              >
                <span className="color-swatch" aria-hidden="true" />
                <span>{option.label}</span>
                {accentColor === option.id && <Check size={14} aria-hidden="true" />}
              </button>
            ))}
          </div>
        </section>

        <section className="card" aria-labelledby="timer-title">
          <h2 className="settings-title" id="timer-title">Default timer durations</h2>
          <div className="settings-fields">
            <div>
              <label className="field-label" htmlFor="focus-minutes">Focus minutes</label>
              <input
                id="focus-minutes"
                className="input"
                type="number"
                min={1}
                max={240}
                value={timerMinutes}
                onChange={(event) => setTimerMinutes(Math.max(1, Math.min(240, parseInt(event.target.value) || 25)))}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="break-minutes">Break minutes</label>
              <input
                id="break-minutes"
                className="input"
                type="number"
                min={1}
                max={30}
                value={breakMinutes}
                onChange={(event) => setBreakMinutes(Math.max(1, Math.min(30, parseInt(event.target.value) || 5)))}
              />
            </div>
          </div>
        </section>

        <section className="card" aria-labelledby="sync-title">
          <h2 className="settings-title" id="sync-title">Cloud sync</h2>
          <p className="settings-description">
            Tasks and focus sessions are saved to your account so they follow you to any device.
            Run a check if something looks like it hasn't synced.
          </p>

          <dl className="sync-facts">
            <div>
              <dt>Waiting to sync</dt>
              <dd>{pendingWrites === 0 ? 'Nothing — everything is saved' : `${pendingWrites} change${pendingWrites === 1 ? '' : 's'}`}</dd>
            </div>
            <div>
              <dt>On this device</dt>
              <dd>{tasks.length} tasks · {sessions.length} sessions</dd>
            </div>
            {checkResult?.serverTaskCount !== null && checkResult !== null && (
              <div>
                <dt>In your account</dt>
                <dd>{checkResult.serverTaskCount} tasks</dd>
              </div>
            )}
          </dl>

          {syncError && !checkResult && (
            <p className="sync-detail sync-detail-bad">
              <CloudAlert size={15} aria-hidden="true" />
              <span>Last error: {syncError}</span>
            </p>
          )}

          {checkResult && (
            <p className={`sync-detail ${checkResult.ok ? 'sync-detail-good' : 'sync-detail-bad'}`} role="status">
              {checkResult.ok ? <CloudCheck size={15} aria-hidden="true" /> : <CloudAlert size={15} aria-hidden="true" />}
              <span>
                {checkResult.ok ? (
                  <>Connected. Reading and writing to your account both work.</>
                ) : (
                  <>
                    <strong>{checkResult.error}</strong>
                    {checkResult.hint && <><br />{checkResult.hint}</>}
                  </>
                )}
              </span>
            </p>
          )}

          <div className="settings-actions">
            <button className="btn btn-ghost" onClick={handleCheckSync} disabled={checking}>
              <RefreshCw size={16} />
              {checking ? 'Checking…' : 'Check connection'}
            </button>
          </div>
        </section>

        <section className="card" aria-labelledby="data-title">
          <h2 className="settings-title" id="data-title">Data management</h2>
          <div className="settings-actions">
            <button className="btn btn-ghost" onClick={handleExport}>
              <Download size={16} />
              Export data
            </button>

            {!showReset ? (
              <button className="btn btn-danger" onClick={() => setShowReset(true)}>
                <Trash2 size={16} />
                Reset all data
              </button>
            ) : (
              <div className="danger-confirmation" role="alert">
                <div className="danger-message">
                  <AlertTriangle size={17} />
                  <span>This deletes every task and focus session. It cannot be undone.</span>
                </div>
                <div className="danger-actions">
                  <button className="btn btn-danger btn-sm" onClick={handleReset}>Reset everything</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowReset(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="card about-card" aria-labelledby="about-title">
          <h2 className="settings-title" id="about-title">About FocusFlow</h2>
          <p>
            FocusFlow brings tasks, focus sessions, planning, and AI-assisted task breakdowns into one calm workspace.
          </p>
          <button
            type="button"
            className="btn btn-ghost btn-sm onboarding-replay"
            onClick={() => setHasCompletedOnboarding(false)}
          >
            <CircleHelp size={15} />
            Show welcome guide
          </button>
          <small>Version 1.0.0</small>
        </section>
      </div>
    </div>
  );
}
