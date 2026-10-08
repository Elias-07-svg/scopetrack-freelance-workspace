import { useEffect, useMemo, useState } from 'react';

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...options.headers }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || 'Something went wrong. Please try again.');
  return data;
}

const dateLabel = (date) => date ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${date}`.slice(0, 10) + 'T12:00:00')) : 'No due date';
const pretty = (value = '') => value.replaceAll('_', ' ');
const todayLabel = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date()).toUpperCase();

export default function App() {
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(null);
  const [page, setPage] = useState('overview');
  const [authMode, setAuthMode] = useState('login');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteToken, setInviteToken] = useState(new URLSearchParams(location.search).get('invite'));

  async function refreshProjects(preferredId) {
    const result = await api('/projects');
    setProjects(result.projects);
    const id = preferredId || project?.id;
    if (id) {
      const match = result.projects.find((item) => String(item.id) === String(id));
      if (match) await openProject(match.id);
      else setProject(null);
    }
  }

  async function openProject(id) {
    const result = await api(`/projects/${id}`);
    setProject(result);
    setPage('project');
  }

  useEffect(() => {
    api('/auth/me').then(async ({ user: current }) => {
      setUser(current);
      await refreshProjects();
      if (inviteToken) await acceptInvite(inviteToken);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function acceptInvite(token) {
    try {
      const result = await api(`/auth/invites/${encodeURIComponent(token)}/accept`, { method: 'POST' });
      setInviteToken(null);
      history.replaceState({}, '', location.pathname);
      await refreshProjects(result.projectId);
      setNotice('You joined the project. Welcome!');
    } catch (e) { setError(e.message); }
  }

  async function submitAuth(event) {
    event.preventDefault(); setError('');
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      const { user: current } = await api(`/auth/${authMode === 'register' ? 'register' : 'login'}`, { method: 'POST', body: JSON.stringify(body) });
      setUser(current);
      await refreshProjects();
      if (inviteToken) await acceptInvite(inviteToken);
    } catch (e) { setError(e.message); }
  }

  async function signOut() {
    try { await api('/auth/logout', { method: 'POST' }); } catch {}
    setUser(null); setProjects([]); setProject(null); setPage('overview');
  }

  async function createProject(event) {
    event.preventDefault(); setError('');
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const { project: created } = await api('/projects', { method: 'POST', body: JSON.stringify(body) });
      setDialog(''); await refreshProjects(created.id); setNotice('Project created. Add a milestone to define the first delivery.');
    } catch (e) { setError(e.message); }
  }

  async function inviteClient(event) {
    event.preventDefault(); setError('');
    const email = new FormData(event.currentTarget).get('email');
    try {
      const { invite } = await api(`/projects/${project.project.id}/invites`, { method: 'POST', body: JSON.stringify({ email }) });
      setInviteUrl(invite.url);
      try { await navigator.clipboard.writeText(invite.url); setNotice(`Invite link copied. It expires ${dateLabel(invite.expiresAt)}. Send it privately to ${invite.email}.`); }
      catch { setNotice(`Invite link created for ${invite.email}. Copy it from the dialog; it expires ${dateLabel(invite.expiresAt)}.`); }
    } catch (e) {
      if (e.name === 'NotAllowedError') setError('Clipboard access was blocked. Try copying the invite link from the dialog again.');
      else setError(e.message);
    }
  }

  async function addMilestone(event) {
    event.preventDefault(); setError('');
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    try { await api(`/projects/${project.project.id}/milestones`, { method: 'POST', body: JSON.stringify(body) }); setDialog(''); await openProject(project.project.id); setNotice('Milestone added.'); }
    catch (e) { setError(e.message); }
  }

  async function addTask(event) {
    event.preventDefault(); setError('');
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    try { await api(`/projects/${project.project.id}/tasks`, { method: 'POST', body: JSON.stringify(body) }); setDialog(''); await openProject(project.project.id); setNotice('Task added.'); }
    catch (e) { setError(e.message); }
  }

  async function moveMilestone(milestone, status) {
    setError('');
    try { await api(`/projects/${project.project.id}/milestones/${milestone.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); await openProject(project.project.id); setNotice(`Milestone moved to ${pretty(status)}.`); }
    catch (e) { setError(e.message); }
  }

  async function moveTask(task, status) {
    setError('');
    try { await api(`/projects/${project.project.id}/tasks/${task.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); await openProject(project.project.id); }
    catch (e) { setError(e.message); }
  }

  const summary = useMemo(() => ({
    active: projects.filter((item) => item.status === 'active').length,
    milestoneCount: projects.reduce((sum, item) => sum + Number(item.milestone_count || 0), 0),
    openTasks: projects.reduce((sum, item) => sum + Number(item.open_tasks || 0), 0),
  }), [projects]);

  if (loading) return <div className="loading-screen"><div className="brand-mark">S</div><p>Opening your workspace…</p></div>;
  if (!user) return <AuthScreen mode={authMode} setMode={setAuthMode} onSubmit={submitAuth} error={error} inviteToken={inviteToken} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview" onClick={(e) => { e.preventDefault(); setPage('overview'); setProject(null); }}><span className="brand-mark">S</span><span>scope<span className="brand-light">track</span><small>FREELANCE WORKSPACE</small></span></a>
        <div className="workspace-switch"><span className="workspace-avatar">{user.full_name.slice(0, 1).toUpperCase()}</span><span><b>{user.full_name}</b><small>Personal workspace</small></span><span className="chevron">⌄</span></div>
        <p className="nav-label">WORKSPACE</p>
        <nav className="main-nav">
          <button className={page === 'overview' ? 'selected' : ''} onClick={() => { setPage('overview'); setProject(null); }}><span>▦</span> Overview</button>
          <button className={page === 'project' ? 'selected' : ''} onClick={() => project ? setPage('project') : setPage('overview')}><span>◫</span> Projects <span className="nav-count">{projects.length}</span></button>
        </nav>
        <div className="sidebar-projects"><div className="project-heading"><p className="nav-label">YOUR PROJECTS</p><button className="icon-button" aria-label="Create project" onClick={() => { setError(''); setDialog('project'); }}>+</button></div>
          {projects.slice(0, 5).map((item) => <button key={item.id} className={`project-nav-item ${String(project?.project?.id) === String(item.id) ? 'active' : ''}`} onClick={() => openProject(item.id)}><span className="tiny-dot" />{item.name}</button>)}
          {!projects.length && <p className="sidebar-empty">Your projects will appear here.</p>}
        </div>
        <div className="sidebar-bottom"><div className="help-card"><span className="help-spark">✳</span><b>Clear work, calm minds.</b><p>Keep deliverables and approvals in one shared place.</p></div><button className="user-menu" onClick={signOut}><span className="avatar">{user.full_name.slice(0, 1).toUpperCase()}</span><span><b>{user.full_name}</b><small>Sign out</small></span><span className="dots">···</span></button></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><i>/</i><b>{page === 'project' ? project?.project.name : 'Overview'}</b></div><div className="topbar-actions"><span className="online-indicator"><i /> All changes saved</span><button className="avatar top-avatar" title={user.full_name}>{user.full_name.slice(0,1).toUpperCase()}</button></div></header>
        {error && <div className="toast error-toast" role="alert"><span>!</span>{error}<button onClick={() => setError('')}>×</button></div>}
        {notice && <div className="toast success-toast" role="status"><span>✓</span>{notice}<button onClick={() => setNotice('')}>×</button></div>}
        {page === 'overview' ? <Overview user={user} projects={projects} summary={summary} onCreate={() => { setError(''); setDialog('project'); }} onOpen={openProject} /> : project && <ProjectPage data={project} user={user} onInvite={() => { setError(''); setDialog('invite'); }} onMilestone={() => { setError(''); setDialog('milestone'); }} onTask={() => { setError(''); setDialog('task'); }} onMoveMilestone={moveMilestone} onMoveTask={moveTask} />}
      </main>
      {dialog && <Modal title={{ project: 'Create a project', invite: 'Invite your client', milestone: 'Add a milestone', task: 'Add a task' }[dialog]} close={() => { setDialog(''); setInviteUrl(''); }} error={error}>
        {dialog === 'project' && <form onSubmit={createProject} className="form-stack"><label>Project name<input name="name" required minLength="2" maxLength="140" placeholder="e.g. Northstar Studio website" autoFocus /></label><label>Short description<textarea name="description" rows="3" placeholder="What are you building together?" /></label><label>Target delivery date<input name="dueDate" type="date" /></label><button className="primary-button full-button">Create project <span>→</span></button></form>}
        {dialog === 'invite' && (inviteUrl ? <div className="form-stack"><p className="modal-copy">Share this private link with your client. They must sign in with the email you invited. It expires in 7 days.</p><label>Invitation link<input readOnly value={inviteUrl} onFocus={(e) => e.target.select()} /></label><button className="primary-button full-button" onClick={() => navigator.clipboard.writeText(inviteUrl).then(() => setNotice('Invitation link copied.'))}>Copy invitation link <span>↗</span></button></div> : <form onSubmit={inviteClient} className="form-stack"><p className="modal-copy">We’ll create a private invitation link for this project. Share it only with your client; it expires in 7 days.</p><label>Client email<input name="email" type="email" required placeholder="client@example.com" autoFocus /></label><button className="primary-button full-button">Create invitation link <span>→</span></button></form>)}
        {dialog === 'milestone' && <form onSubmit={addMilestone} className="form-stack"><label>Milestone name<input name="title" required minLength="2" maxLength="160" placeholder="e.g. Design handoff" autoFocus /></label><label>What will be delivered?<textarea name="description" rows="3" placeholder="Describe the outcome the client will review." /></label><label>Due date<input name="dueDate" type="date" /></label><button className="primary-button full-button">Add milestone <span>→</span></button></form>}
        {dialog === 'task' && <form onSubmit={addTask} className="form-stack"><label>Task name<input name="title" required minLength="2" maxLength="180" placeholder="e.g. Build responsive header" autoFocus /></label><label>Milestone<select name="milestoneId" required defaultValue=""><option value="" disabled>Select a milestone</option>{project.milestones.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>Priority<select name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></label><label>Due date<input name="dueDate" type="date" /></label><button className="primary-button full-button">Add task <span>→</span></button></form>}
      </Modal>}
    </div>
  );
}

function AuthScreen({ mode, setMode, onSubmit, error, inviteToken }) {
  return <main className="auth-screen"><div className="auth-brand"><span className="brand-mark">S</span><b>scope<span className="brand-light">track</span></b></div><div className="auth-card"><div className="auth-symbol">✳</div><p className="eyebrow">A BETTER WAY TO WORK TOGETHER</p><h1>{inviteToken ? 'You’re invited.' : mode === 'register' ? 'Create your workspace.' : 'Welcome back.'}</h1><p className="auth-subtitle">{inviteToken ? 'Sign in or create an account with the invited email to join your project.' : mode === 'register' ? 'A clear home for freelance work and client approvals.' : 'Sign in to pick up where your projects left off.'}</p>
    <form onSubmit={onSubmit} className="form-stack auth-form">{mode === 'register' && <label>Your name<input name="fullName" required minLength="2" maxLength="120" autoComplete="name" placeholder="Your full name" /></label>}<label>Email address<input name="email" type="email" required autoComplete="email" placeholder="you@example.com" /></label><label>Password<input name="password" type="password" minLength={mode === 'register' ? 10 : 1} required autoComplete={mode === 'register' ? 'new-password' : 'current-password'} placeholder={mode === 'register' ? 'At least 10 characters' : 'Your password'} /></label>{error && <p className="form-error">{error}</p>}<button className="primary-button full-button">{mode === 'register' ? 'Create account' : 'Sign in'} <span>→</span></button></form>
    <p className="auth-switch">{mode === 'register' ? 'Already have an account?' : 'New to ScopeTrack?'} <button onClick={() => setMode(mode === 'register' ? 'login' : 'register')}>{mode === 'register' ? 'Sign in' : 'Create an account'}</button></p></div><p className="auth-foot">Built for clear scope, thoughtful delivery, and better client relationships.</p></main>;
}

function Overview({ user, projects, summary, onCreate, onOpen }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return <div className="page-wrap"><section className="welcome-row"><div><p className="eyebrow">{todayLabel} <span className="eyebrow-dot">•</span> YOUR WORKSPACE</p><h1>{greeting}, {user.full_name.split(' ')[0]}<span className="heading-period">.</span></h1><p className="page-subtitle">A thoughtful overview of the work you’re moving forward.</p></div><button className="primary-button" onClick={onCreate}><span className="plus">＋</span> New project</button></section>
    <section className="stats-grid"><Stat icon="◫" label="Active projects" value={summary.active} detail="Across your workspace" tone="green" /><Stat icon="◷" label="Milestones" value={summary.milestoneCount} detail="Defined outcomes" tone="peach" /><Stat icon="☷" label="Open tasks" value={summary.openTasks} detail="Still to move forward" tone="blue" /></section>
    <section className="section-heading"><div><p className="eyebrow">YOUR PORTFOLIO OF WORK</p><h2>Projects <span>{projects.length}</span></h2></div><button className="text-button" onClick={onCreate}>＋ Start a project</button></section>
    {projects.length ? <div className="project-grid">{projects.map((project) => <ProjectCard key={project.id} project={project} onOpen={onOpen} />)}</div> : <div className="empty-state"><div className="empty-art"><span>◫</span><i>✳</i><b>✦</b></div><p className="eyebrow">A FRESH START</p><h3>Your next great project starts here.</h3><p>Create a workspace for a client engagement. Add milestones, assign tasks, and keep approvals moving with clarity.</p><button className="primary-button" onClick={onCreate}>Create your first project <span>→</span></button></div>}
    <div className="quote-strip"><span>✳</span><p>“Clarity is a kindness you can build into the work.”</p><small>THE SCOPETRACK PRINCIPLE</small></div></div>;
}

function Stat({ icon, label, value, detail, tone }) { return <article className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div><span className="stat-arrow">↗</span></article>; }

function ProjectCard({ project, onOpen }) {
  const people = project.members || [];
  return <button className="project-card" onClick={() => onOpen(project.id)}><div className="project-card-top"><span className="project-cover"><span>{project.name.slice(0,1).toUpperCase()}</span><i>✳</i></span><span className="status-pill active"><i /> {pretty(project.status)}</span></div><div className="project-card-content"><p className="project-type">{project.role === 'client' ? 'CLIENT PROJECT' : 'FREELANCE ENGAGEMENT'}</p><h3>{project.name}</h3><p className="project-description">{project.description || 'A focused workspace for planning, progress, and clear approvals.'}</p><div className="project-card-meta"><span>◷ &nbsp;{project.milestone_count} milestones</span><span>☷ &nbsp;{project.open_tasks} open tasks</span></div></div><div className="project-card-bottom"><div className="avatar-stack">{people.slice(0,3).map((person) => <span key={person.id} title={person.name}>{person.name.slice(0,1).toUpperCase()}</span>)}</div><small>Due {dateLabel(project.due_date)}</small><span className="card-arrow">↗</span></div></button>;
}

function ProjectPage({ data, user, onInvite, onMilestone, onTask, onMoveMilestone, onMoveTask }) {
  const { project, milestones, tasks, members } = data;
  const canEdit = project.role === 'freelancer';
  const doneCount = tasks.filter((task) => task.status === 'done').length;
  const percentage = tasks.length ? Math.round(doneCount / tasks.length * 100) : 0;
  const milestonesWithTasks = milestones.map((milestone) => ({ ...milestone, tasks: tasks.filter((task) => String(task.milestone_id) === String(milestone.id)) }));
  return <div className="page-wrap project-page"><section className="project-hero"><div className="project-hero-top"><div><div className="breadcrumbs-inline"><span>Projects</span><i>/</i><b>{project.name}</b></div><div className="project-title-row"><span className="project-cover large"><span>{project.name.slice(0,1).toUpperCase()}</span><i>✳</i></span><div><p className="eyebrow">{project.role === 'client' ? 'CLIENT WORKSPACE' : 'FREELANCE ENGAGEMENT'}</p><h1>{project.name}</h1></div></div></div><div className="hero-actions">{canEdit && <button className="secondary-button" onClick={onInvite}>↗ Invite client</button>}<button className="primary-button" onClick={onMilestone}>＋ Add milestone</button></div></div>
    <p className="hero-description">{project.description || 'A shared workspace for clear goals, visible progress, and thoughtful delivery.'}</p><div className="hero-meta"><span className="status-pill active"><i /> {pretty(project.status)}</span><span>⌁ &nbsp;Delivery {dateLabel(project.due_date)}</span><span>♙ &nbsp;{members.length} collaborators</span></div>
    <div className="project-progress"><div><span>Overall progress</span><b>{percentage}%</b></div><div className="progress-track"><span style={{ width: `${percentage}%` }} /></div><small>{doneCount} of {tasks.length} tasks complete</small></div></section>
    <div className="project-columns"><section className="milestone-section"><div className="section-heading compact"><div><p className="eyebrow">THE DELIVERY PLAN</p><h2>Milestones <span>{milestones.length}</span></h2></div><button className="text-button" onClick={onMilestone}>＋ Add</button></div>
      {!milestones.length ? <div className="small-empty"><span>◷</span><b>No milestones yet</b><p>Break the project into clear outcomes the client can review.</p><button className="text-button" onClick={onMilestone}>Add the first milestone →</button></div> : <div className="milestone-list">{milestonesWithTasks.map((milestone, index) => <article className="milestone-card" key={milestone.id}><div className="milestone-index">{String(index + 1).padStart(2,'0')}</div><div className="milestone-main"><div className="milestone-title-row"><div><p className="eyebrow">MILESTONE {String(index + 1).padStart(2,'0')}</p><h3>{milestone.title}</h3></div><span className={`status-pill ${milestone.status === 'approved' ? 'approved' : milestone.status === 'in_review' ? 'review' : milestone.status === 'changes_requested' ? 'changes' : 'active'}`}>{pretty(milestone.status)}</span></div>{milestone.description && <p className="milestone-description">{milestone.description}</p>}<div className="milestone-footer"><span>◷ &nbsp;Due {dateLabel(milestone.due_date)}</span><span>☷ &nbsp;{milestone.tasks.length} tasks</span></div>
        {milestone.status === 'planned' && canEdit && <button className="workflow-button" onClick={() => onMoveMilestone(milestone, 'in_progress')}>Start milestone <span>→</span></button>}
        {milestone.status === 'in_progress' && canEdit && <button className="workflow-button" onClick={() => onMoveMilestone(milestone, 'in_review')}>Submit for client review <span>→</span></button>}
        {milestone.status === 'in_review' && project.role === 'client' && <div className="review-actions"><button onClick={() => onMoveMilestone(milestone, 'changes_requested')}>Request changes</button><button onClick={() => onMoveMilestone(milestone, 'approved')}>Approve delivery ✓</button></div>}
        {milestone.status === 'changes_requested' && canEdit && <button className="workflow-button" onClick={() => onMoveMilestone(milestone, 'in_progress')}>Resume revisions <span>→</span></button>}
        {milestone.tasks.length > 0 && <div className="task-list">{milestone.tasks.map((task) => <div className="task-row" key={task.id}><span className={`task-check ${task.status === 'done' ? 'checked' : ''}`}>{task.status === 'done' ? '✓' : ''}</span><span className="task-title">{task.title}</span><span className={`priority ${task.priority}`}>{task.priority}</span>{canEdit && <select aria-label={`Update ${task.title} status`} value={task.status} onChange={(event) => onMoveTask(task, event.target.value)}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="in_review">In review</option><option value="done">Done</option></select>}</div>)}</div>}
      </div></article>)}</div>}
      {canEdit && milestones.length > 0 && <button className="add-task-button" onClick={onTask}>＋ Add a task</button>}
    </section><aside className="project-side"><section className="side-card"><div className="side-card-heading"><div><p className="eyebrow">PEOPLE</p><h3>Collaborators</h3></div><span className="people-count">{members.length}</span></div>{members.map((member) => <div className="member-row" key={member.id}><span className="avatar member-avatar">{member.name.slice(0,1).toUpperCase()}</span><span><b>{member.name}{String(member.id) === String(user.id) ? ' (you)' : ''}</b><small>{member.email || pretty(member.role)}</small></span><span className="role-tag">{pretty(member.role)}</span></div>)}{canEdit && <button className="invite-side-button" onClick={onInvite}>＋ Invite your client</button>}</section>
      <section className="side-card focus-card"><p className="eyebrow">THE WORKFLOW</p><h3>From first draft to final sign-off.</h3><div className="flow-step"><span className="flow-number">01</span><div><b>Plan milestones</b><small>Agree on clear outcomes.</small></div></div><div className="flow-step"><span className="flow-number">02</span><div><b>Move tasks forward</b><small>Keep delivery visible.</small></div></div><div className="flow-step"><span className="flow-number">03</span><div><b>Request review</b><small>Make approval part of the work.</small></div></div></section></aside></div>
  </div>;
}

function Modal({ title, close, children }) { return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><div><p className="eyebrow">SCOPETRACK WORKSPACE</p><h2>{title}</h2></div><button className="modal-close" onClick={close} aria-label="Close">×</button></div>{children}</section></div>; }
