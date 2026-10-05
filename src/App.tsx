import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  FlaskConical,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Medal,
  Pencil,
  Save,
  Sigma,
  Trophy,
  UserRound,
  UsersRound,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Avatar } from "./components/Avatar";
import { AuthScreen } from "./components/AuthScreen";
import { formatShortDate, localDateString, weekStartString } from "./lib/date";
import { hasSupabaseConfig, supabase } from "./lib/supabase";
import type { DailyProgress, LeaderboardEntry, Profile, ProfileStats, Subject, SubjectCounts } from "./lib/types";

type Page = "dashboard" | "leaderboard" | "profile";
type LeaderboardMode = "today" | "week";

const subjectInfo: Record<Subject, { label: string; icon: typeof BookOpen; color: string }> = {
  physics: { label: "Physics", icon: Activity, color: "mint" },
  chemistry: { label: "Chemistry", icon: FlaskConical, color: "blue" },
  maths: { label: "Maths", icon: Sigma, color: "violet" },
};

const emptyCounts: SubjectCounts = { physics: 0, chemistry: 0, maths: 0 };
const emptyStats: ProfileStats = {
  total_questions: 0,
  current_streak: 0,
  active_days: 0,
  physics_total: 0,
  chemistry_total: 0,
  maths_total: 0,
};

function totalOf(counts: SubjectCounts) {
  return counts.physics + counts.chemistry + counts.maths;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [page, setPage] = useState<Page>("dashboard");
  const [leaderboardMode, setLeaderboardMode] = useState<LeaderboardMode>("today");
  const [viewedUserId, setViewedUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<ProfileStats>(emptyStats);
  const [todayCounts, setTodayCounts] = useState<SubjectCounts>(emptyCounts);
  const [history, setHistory] = useState<DailyProgress[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) setError(sessionError.message);
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setProfile(null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const targetUserId = page === "profile" ? (viewedUserId ?? user?.id) : user?.id;

  useEffect(() => {
    const client = supabase;
    const currentUser = user;
    if (!client || !currentUser) return;
    let cancelled = false;
    const loadData = async () => {
      setLoading(true);
      setError("");
      try {
        if (page === "leaderboard") {
          const today = localDateString();
          const result = leaderboardMode === "today"
            ? await client.rpc("daily_leaderboard", { p_date: today })
            : await client.rpc("weekly_leaderboard", { p_week_start: weekStartString() });
          if (result.error) throw result.error;
          if (!cancelled) setLeaderboard((result.data ?? []) as LeaderboardEntry[]);
        } else if (page === "profile" && targetUserId) {
          const [profileResult, statsResult, historyResult] = await Promise.all([
            client.from("profiles").select("id, username, display_name, avatar_url").eq("id", targetUserId).single(),
            client.rpc("profile_stats", { p_user_id: targetUserId, p_today: localDateString() }),
            client.rpc("profile_history", { p_user_id: targetUserId, p_to_date: localDateString() }),
          ]);
          if (profileResult.error) throw profileResult.error;
          if (statsResult.error) throw statsResult.error;
          if (historyResult.error) throw historyResult.error;
          if (!cancelled) {
            setProfile(profileResult.data as Profile);
            setStats((statsResult.data?.[0] ?? emptyStats) as ProfileStats);
            setHistory((historyResult.data ?? []) as DailyProgress[]);
          };
        } else if (page === "dashboard") {
          const today = localDateString();
          const [profileResult, statsResult, todayResult, historyResult] = await Promise.all([
            client.from("profiles").select("id, username, display_name, avatar_url").eq("id", currentUser.id).single(),
            client.rpc("profile_stats", { p_user_id: currentUser.id, p_today: today }),
            client.from("daily_progress").select("physics, chemistry, maths").eq("user_id", currentUser.id).eq("progress_date", today).maybeSingle(),
            client.from("daily_progress").select("progress_date, physics, chemistry, maths").eq("user_id", currentUser.id).order("progress_date", { ascending: false }).limit(7),
          ]);
          if (profileResult.error) throw profileResult.error;
          if (statsResult.error) throw statsResult.error;
          if (todayResult.error) throw todayResult.error;
          if (historyResult.error) throw historyResult.error;
          if (!cancelled) {
            setProfile(profileResult.data as Profile);
            setStats((statsResult.data?.[0] ?? emptyStats) as ProfileStats);
            setTodayCounts((todayResult.data as SubjectCounts | null) ?? emptyCounts);
            setHistory((historyResult.data ?? []) as DailyProgress[]);
          }
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load your study data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadData();
    return () => { cancelled = true; };
  }, [user?.id, page, leaderboardMode, targetUserId, refreshKey]);

  async function saveToday(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = supabase;
    const currentUser = user;
    if (!client || !currentUser) return;
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const { error: saveError } = await client.from("daily_progress").upsert(
        { user_id: currentUser.id, progress_date: localDateString(), ...todayCounts },
        { onConflict: "user_id,progress_date" },
      );
      if (saveError) throw saveError;
      setNotice("Today’s progress is saved.");
      setRefreshKey((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save today’s progress.");
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError(signOutError.message);
    else {
      setPage("dashboard");
      setViewedUserId(null);
      setNotice("");
    }
  }

  if (!hasSupabaseConfig) return <SetupScreen />;
  if (!authReady) return <LoadingScreen />;
  if (!user) return <AuthScreen />;

  function openProfile(id = user!.id) {
    setViewedUserId(id);
    setEditingProfile(false);
    setError("");
    setNotice("");
    setPage("profile");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand-lockup sidebar-brand" href="#" onClick={(event) => { event.preventDefault(); setPage("dashboard"); }}>
          <span className="brand-mark"><BookOpen size={19} /></span>
          <span>study<span className="brand-accent">tracker</span></span>
        </a>
        <div className="side-section-label">MENU</div>
        <nav className="side-nav" aria-label="Main navigation">
          <NavButton active={page === "dashboard"} icon={<LayoutDashboard size={18} />} label="Dashboard" onClick={() => setPage("dashboard")} />
          <NavButton active={page === "leaderboard"} icon={<Trophy size={18} />} label="Leaderboard" onClick={() => setPage("leaderboard")} />
          <NavButton active={page === "profile" && viewedUserId === user.id} icon={<UserRound size={18} />} label="My profile" onClick={() => openProfile(user.id)} />
        </nav>
        <div className="sidebar-spacer" />
        <div className="side-quote">
          <span className="quote-spark">✳</span>
          <p>Small steps, taken daily, lead to big results.</p>
          <span className="quote-author">A REMINDER FOR YOU</span>
        </div>
        <button className="sidebar-user" onClick={() => openProfile(user.id)}>
          <Avatar name={profile?.display_name ?? user.email ?? "You"} url={profile?.avatar_url} size="sm" />
          <span className="user-mini-copy"><strong>{profile?.display_name ?? "Your account"}</strong><small>@{profile?.username ?? "student"}</small></span>
          <ChevronRight size={16} />
        </button>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{pageLabel(page, viewedUserId, user.id)}</strong></div>
          <div className="topbar-actions">
            <span className="today-pill"><span className="live-dot" />{new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
            <button className="icon-button signout-button" onClick={() => void signOut()} aria-label="Log out" title="Log out"><LogOut size={18} /></button>
          </div>
        </header>

        <div className="mobile-brand-row">
          <a className="brand-lockup" href="#" onClick={(event) => { event.preventDefault(); setPage("dashboard"); }}>
            <span className="brand-mark"><BookOpen size={18} /></span><span>study<span className="brand-accent">tracker</span></span>
          </a>
          <button className="icon-button" onClick={() => void signOut()} aria-label="Log out"><LogOut size={17} /></button>
        </div>

        <section className="content-wrap">
          {error && <div className="notice error-notice" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
          {notice && <div className="notice success-notice" role="status"><Check size={16} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss message">×</button></div>}
          {loading && <div className="loading-line"><LoaderCircle className="spin" size={15} /> Updating your study space…</div>}
          {page === "dashboard" && (
            <Dashboard
              profile={profile}
              stats={stats}
              counts={todayCounts}
              history={history}
              saving={saving}
              onCountChange={(subject, value) => setTodayCounts((current) => ({ ...current, [subject]: value }))}
              onSave={saveToday}
              onSeeLeaderboard={() => setPage("leaderboard")}
            />
          )}
          {page === "leaderboard" && (
            <Leaderboard
              entries={leaderboard}
              mode={leaderboardMode}
              onModeChange={setLeaderboardMode}
              onOpenProfile={openProfile}
              currentUserId={user.id}
            />
          )}
          {page === "profile" && (
            <ProfilePage
              profile={profile}
              stats={stats}
              history={history}
              isOwnProfile={targetUserId === user.id}
              editing={editingProfile}
              onEdit={() => setEditingProfile(true)}
              onCancelEdit={() => setEditingProfile(false)}
              onSaved={(savedProfile) => { setProfile(savedProfile); setEditingProfile(false); setNotice("Your profile is updated."); }}
              onBack={() => setPage("leaderboard")}
              onError={setError}
            />
          )}
        </section>
      </main>

      <nav className="mobile-nav" aria-label="Main navigation">
        <NavButton active={page === "dashboard"} icon={<LayoutDashboard size={19} />} label="Home" onClick={() => setPage("dashboard")} />
        <NavButton active={page === "leaderboard"} icon={<Trophy size={19} />} label="Ranks" onClick={() => setPage("leaderboard")} />
        <NavButton active={page === "profile" && viewedUserId === user.id} icon={<UserRound size={19} />} label="Profile" onClick={() => openProfile(user.id)} />
      </nav>
    </div>
  );
}

function pageLabel(page: Page, viewedUserId: string | null, ownId: string) {
  if (page === "dashboard") return "Dashboard";
  if (page === "leaderboard") return "Leaderboard";
  return viewedUserId && viewedUserId !== ownId ? "Student profile" : "My profile";
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick} aria-current={active ? "page" : undefined}>{icon}<span>{label}</span></button>;
}

function Dashboard({
  profile,
  stats,
  counts,
  history,
  saving,
  onCountChange,
  onSave,
  onSeeLeaderboard,
}: {
  profile: Profile | null;
  stats: ProfileStats;
  counts: SubjectCounts;
  history: DailyProgress[];
  saving: boolean;
  onCountChange: (subject: Subject, value: number) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onSeeLeaderboard: () => void;
}) {
  const dailyTotal = totalOf(counts);
  const todayLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const maxHistory = Math.max(1, ...history.map((day) => totalOf(day)));
  return (
    <>
      <div className="welcome-row">
        <div>
          <div className="eyebrow"><span className="live-dot" /> YOUR DAILY OVERVIEW</div>
          <h1>Hey, {profile?.display_name?.split(" ")[0] ?? "there"} <span className="wave">✳</span></h1>
          <p className="page-subtitle">A little progress today goes a long way.</p>
        </div>
        <div className="date-card"><span>TODAY</span><strong>{todayLabel}</strong></div>
      </div>

      <div className="stat-grid">
        <StatCard icon={<BookOpen size={18} />} label="Questions solved" value={stats.total_questions} caption="All-time total" tone="mint" />
        <StatCard icon={<Flame size={18} />} label="Current streak" value={stats.current_streak} suffix="days" caption="Keep it going" tone="orange" />
        <StatCard icon={<Medal size={18} />} label="Active days" value={stats.active_days} caption="Days with progress" tone="violet" />
      </div>

      <div className="dashboard-grid">
        <section className="panel tracking-panel">
          <div className="panel-heading">
            <div><span className="section-kicker">DAILY CHECK-IN</span><h2>Log your questions</h2></div>
            <span className="today-small">{new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          </div>
          <p className="panel-description">How many did you solve today? You can update this anytime.</p>
          <form onSubmit={onSave}>
            <div className="subject-inputs">
              {(Object.keys(subjectInfo) as Subject[]).map((subject) => {
                const details = subjectInfo[subject];
                const Icon = details.icon;
                return (
                  <label className={`subject-input-row ${details.color}`} key={subject}>
                    <span className="subject-symbol"><Icon size={18} /></span>
                    <span className="subject-name">{details.label}</span>
                    <input
                      aria-label={`${details.label} questions solved today`}
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="1"
                      value={counts[subject]}
                      onChange={(event) => onCountChange(subject, Math.max(0, Number(event.target.value) || 0))}
                    />
                  </label>
                );
              })}
            </div>
            <div className="daily-total-row">
              <div><span className="total-caption">TODAY’S TOTAL</span><strong>{dailyTotal.toLocaleString()} <small>questions</small></strong></div>
              <button className="button-primary" type="submit" disabled={saving}>
                {saving ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}
                {saving ? "Saving…" : "Save progress"}
              </button>
            </div>
          </form>
        </section>

        <section className="panel week-panel">
          <div className="panel-heading">
            <div><span className="section-kicker">YOUR MOMENTUM</span><h2>Recent activity</h2></div>
            <span className="icon-chip mint-chip"><Activity size={16} /></span>
          </div>
          {history.length ? (
            <div className="activity-list">
              {history.slice(0, 5).map((day) => {
                const total = totalOf(day);
                return (
                  <div className="activity-row" key={day.progress_date}>
                    <span className="activity-date">{formatShortDate(day.progress_date)}</span>
                    <span className="activity-track"><span style={{ width: `${Math.max(total ? 5 : 0, (total / maxHistory) * 100)}%` }} /></span>
                    <strong>{total.toLocaleString()}</strong>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-activity"><span className="empty-icon"><ArrowDownRight size={20} /></span><p>Your recent study days will show up here.</p></div>
          )}
          <div className="activity-footer"><span>Recent days</span><span className="activity-legend"><i /> Questions</span></div>
        </section>
      </div>

      <section className="panel subject-summary">
        <div className="panel-heading">
          <div><span className="section-kicker">ALL-TIME BREAKDOWN</span><h2>By subject</h2></div>
          <button className="text-link" onClick={onSeeLeaderboard}>Leaderboard <ArrowRight size={15} /></button>
        </div>
        <div className="subject-summary-grid">
          {(Object.keys(subjectInfo) as Subject[]).map((subject) => {
            const details = subjectInfo[subject];
            const Icon = details.icon;
            const value = stats[`${subject}_total` as keyof ProfileStats] as number;
            const percent = stats.total_questions ? Math.round((value / stats.total_questions) * 100) : 0;
            return (
              <div className={`subject-summary-item ${details.color}`} key={subject}>
                <div className="summary-icon"><Icon size={18} /></div>
                <div className="summary-copy"><span>{details.label}</span><strong>{value.toLocaleString()}</strong></div>
                <span className="summary-percent">{percent}%</span>
                <div className="summary-progress"><span style={{ width: `${percent}%` }} /></div>
              </div>
            );
          })}
        </div>
      </section>
      <p className="privacy-note"><span className="privacy-dot" /> Your progress is visible to your study group.</p>
    </>
  );
}

function StatCard({ icon, label, value, suffix, caption, tone }: { icon: ReactNode; label: string; value: number; suffix?: string; caption: string; tone: string }) {
  return (
    <div className={`stat-card ${tone}`}>
      <div className="stat-top"><span className="stat-icon">{icon}</span><span className="stat-caption">{caption}</span></div>
      <div className="stat-number">{value.toLocaleString()}<small>{suffix}</small></div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function Leaderboard({
  entries,
  mode,
  onModeChange,
  onOpenProfile,
  currentUserId,
}: {
  entries: LeaderboardEntry[];
  mode: LeaderboardMode;
  onModeChange: (mode: LeaderboardMode) => void;
  onOpenProfile: (id: string) => void;
  currentUserId: string;
}) {
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  return (
    <>
      <div className="page-title-row">
        <div><div className="eyebrow"><span className="live-dot" /> FRIENDLY COMPETITION</div><h1>Leaderboard</h1><p className="page-subtitle">A little friendly motivation for your study streak.</p></div>
        <div className="leaderboard-mark"><Trophy size={24} /></div>
      </div>
      <div className="leaderboard-toolbar">
        <div className="segmented-control" role="tablist" aria-label="Leaderboard period">
          <button className={mode === "today" ? "selected" : ""} onClick={() => onModeChange("today")} role="tab" aria-selected={mode === "today"}>Today</button>
          <button className={mode === "week" ? "selected" : ""} onClick={() => onModeChange("week")} role="tab" aria-selected={mode === "week"}>This week</button>
        </div>
        <span className="leaderboard-date">{mode === "today" ? today : "Monday – Sunday"}</span>
      </div>
      <section className="panel leaderboard-panel">
        <div className="leaderboard-heading"><div><span className="section-kicker">{mode === "today" ? "DAILY RANKINGS" : "WEEKLY RANKINGS"}</span><h2>{mode === "today" ? "Today’s progress" : "This week’s progress"}</h2></div><span className="people-count"><UsersRound size={15} /> {entries.length} {entries.length === 1 ? "student" : "students"}</span></div>
        {entries.length ? (
          <div className="leaderboard-table-wrap">
            <table className="leaderboard-table">
              <thead><tr><th className="rank-col">Rank</th><th className="person-col">Student</th>{mode === "today" && <><th>Physics</th><th>Chemistry</th><th>Maths</th></>}<th className="total-col">Total</th><th aria-label="Open profile" /></tr></thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.user_id} className={entry.user_id === currentUserId ? "current-user-row" : ""}>
                    <td className="rank-col"><span className={`rank-badge ${entry.rank <= 3 ? `rank-${entry.rank}` : ""}`}>{entry.rank <= 3 ? <Medal size={15} /> : `#${entry.rank}`}</span></td>
                    <td className="person-col"><button className="person-button" onClick={() => onOpenProfile(entry.user_id)}><Avatar name={entry.display_name} url={entry.avatar_url} size="sm" /><span><strong>{entry.display_name}{entry.user_id === currentUserId && <small className="you-tag">YOU</small>}</strong><small>@{entry.username}</small></span></button></td>
                    {mode === "today" && <><td>{entry.physics.toLocaleString()}</td><td>{entry.chemistry.toLocaleString()}</td><td>{entry.maths.toLocaleString()}</td></>}
                    <td className="total-cell">{entry.total.toLocaleString()} <span>qs</span></td>
                    <td><button className="row-open" onClick={() => onOpenProfile(entry.user_id)} aria-label={`View ${entry.display_name}'s profile`}><ChevronRight size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state"><span className="empty-icon"><Trophy size={22} /></span><h3>No scores just yet</h3><p>Log some questions and your study group will show up here.</p></div>
        )}
      </section>
      <div className="leaderboard-foot"><span className="privacy-dot" /> Everyone in your study group can see these rankings.</div>
    </>
  );
}

function ProfilePage({
  profile,
  stats,
  history,
  isOwnProfile,
  editing,
  onEdit,
  onCancelEdit,
  onSaved,
  onBack,
  onError,
}: {
  profile: Profile | null;
  stats: ProfileStats;
  history: DailyProgress[];
  isOwnProfile: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaved: (profile: Profile) => void;
  onBack: () => void;
  onError: (error: string) => void;
}) {
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [username, setUsername] = useState(profile?.username ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? "");
  const [saving, setSaving] = useState(false);
  const totals = useMemo(() => ({
    physics: stats.physics_total,
    chemistry: stats.chemistry_total,
    maths: stats.maths_total,
  }), [stats]);
  useEffect(() => {
    setDisplayName(profile?.display_name ?? "");
    setUsername(profile?.username ?? "");
    setAvatarUrl(profile?.avatar_url ?? "");
  }, [profile]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !profile) return;
    onError("");
    setSaving(true);
    try {
      const cleanUsername = username.trim().toLowerCase();
      if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) throw new Error("Username must be 3–20 letters, numbers, or underscores.");
      if (displayName.trim().length === 0 || displayName.trim().length > 40) throw new Error("Display name must be between 1 and 40 characters.");
      if (avatarUrl.trim() && !/^https?:\/\//i.test(avatarUrl.trim())) throw new Error("Avatar URL must start with https:// or http://.");
      const updated = {
        ...profile,
        username: cleanUsername,
        display_name: displayName.trim(),
        avatar_url: avatarUrl.trim() || null,
      };
      const { error: updateError } = await supabase.from("profiles").update({
        username: updated.username,
        display_name: updated.display_name,
        avatar_url: updated.avatar_url,
      }).eq("id", profile.id);
      if (updateError) throw updateError;
      onSaved(updated);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Could not update your profile.");
    } finally {
      setSaving(false);
    }
  }

  if (!profile) return <div className="profile-loading"><LoaderCircle className="spin" size={20} />Loading profile…</div>;
  const maxDay = Math.max(1, ...history.map((day) => totalOf(day)));
  return (
    <>
      <div className="profile-back-row"><button className="back-link" onClick={onBack}><ChevronLeft size={16} /> Back</button><span>STUDENT PROFILE</span></div>
      <section className="panel profile-hero">
        <div className="profile-hero-glow" />
        <div className="profile-hero-main">
          <Avatar name={profile.display_name} url={profile.avatar_url} size="lg" />
          <div className="profile-name-block">
            {editing ? (
              <form className="profile-edit-form" onSubmit={saveProfile}>
                <label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} required /></label>
                <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={20} required /><span className="field-hint">3–20 letters, numbers, or underscores</span></label>
                <label>Avatar image URL<input value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} type="url" placeholder="https://…" /></label>
                <div className="edit-actions"><button className="button-quiet" type="button" onClick={onCancelEdit}>Cancel</button><button className="button-primary" disabled={saving}>{saving ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}{saving ? "Saving…" : "Save profile"}</button></div>
              </form>
            ) : (
              <>
                <h1>{profile.display_name}</h1>
                <p className="profile-handle">@{profile.username}</p>
                <span className="member-tag"><span className="live-dot" /> STUDY TRACKER MEMBER</span>
              </>
            )}
          </div>
          {isOwnProfile && !editing && <button className="button-quiet edit-profile-button" onClick={onEdit}><Pencil size={15} /> Edit profile</button>}
        </div>
        {!editing && (
          <div className="profile-stats">
            <div><span>TOTAL QUESTIONS</span><strong>{stats.total_questions.toLocaleString()}</strong></div>
            <div><span>CURRENT STREAK</span><strong>{stats.current_streak}<small> days</small></strong></div>
            <div><span>ACTIVE DAYS</span><strong>{stats.active_days.toLocaleString()}</strong></div>
          </div>
        )}
      </section>
      {!editing && (
        <div className="profile-detail-grid">
          <section className="panel history-panel">
            <div className="panel-heading"><div><span className="section-kicker">LAST 14 DAYS</span><h2>Recent progress</h2></div><span className="icon-chip mint-chip"><Activity size={16} /></span></div>
            {history.length ? (
              <div className="history-bars">
                {history.map((day) => {
                  const total = totalOf(day);
                  const height = total ? Math.max(8, (total / maxDay) * 100) : 3;
                  return <div className="history-bar-item" key={day.progress_date}><span className="history-value">{total || ""}</span><span className="history-bar-track"><span style={{ height: `${height}%` }} /></span><span className="history-date">{formatShortDate(day.progress_date)}</span></div>;
                })}
              </div>
            ) : <div className="empty-activity"><span className="empty-icon"><Activity size={19} /></span><p>No study days logged yet.</p></div>}
          </section>
          <section className="panel profile-subjects">
            <div className="panel-heading"><div><span className="section-kicker">ALL-TIME TOTALS</span><h2>Subject focus</h2></div><span className="icon-chip violet-chip"><Sigma size={16} /></span></div>
            <div className="profile-subject-list">
              {(Object.keys(subjectInfo) as Subject[]).map((subject) => {
                const details = subjectInfo[subject];
                const Icon = details.icon;
                const amount = totals[subject];
                const share = stats.total_questions ? Math.round((amount / stats.total_questions) * 100) : 0;
                return <div className={`profile-subject-row ${details.color}`} key={subject}><span className="subject-symbol"><Icon size={17} /></span><span className="profile-subject-copy"><span>{details.label}</span><strong>{amount.toLocaleString()} questions</strong></span><span className="profile-subject-share">{share}%</span></div>;
              })}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function SetupScreen() {
  return (
    <main className="setup-page">
      <div className="setup-card">
        <span className="brand-mark"><BookOpenCheckIcon /></span>
        <div className="eyebrow"><span className="live-dot" /> ONE QUICK SETUP</div>
        <h1>Your study space is almost ready.</h1>
        <p>Add your Supabase project URL and public anon key to the local environment file to connect your account and data.</p>
        <div className="setup-code">VITE_SUPABASE_URL=…<br />VITE_SUPABASE_ANON_KEY=…</div>
        <p className="setup-help">Need the database setup too? Run <strong>supabase/schema.sql</strong> in your Supabase SQL Editor. Full instructions are in the project README.</p>
      </div>
    </main>
  );
}

function BookOpenCheckIcon() {
  return <BookOpen size={20} />;
}

function LoadingScreen() {
  return <main className="loading-screen"><span className="brand-mark"><BookOpen size={20} /></span><LoaderCircle className="spin" size={19} />Connecting to your study space…</main>;
}

export default App;
