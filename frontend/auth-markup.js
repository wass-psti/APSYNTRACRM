/**
 * Login-only presentation. The IDs, field names, and data-action hooks are the
 * existing signed-auth contract; no credentials are processed in this module.
 * @typedef {{message?:string, year?:number}} AuthMarkupOptions
 */
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,
 char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
/** @param {AuthMarkupOptions} options */
export function renderAuthMarkup({message='',year=new Date().getFullYear()}={}){
 const error=message?'<div class="login-error" role="alert">'+escapeHtml(message)+'</div>':'';
 return `<div class="auth-layout aps-auth-v2">
  <div class="auth-left">
   <header class="auth-brandbar auth-reveal">
    <a href="#/login" class="brand" aria-label="APSYNTRA CRM login">
     <img class="brand-mark" src="./frontend/apsyntra-logo.webp" alt="" width="40" height="40" decoding="async"/>
     <span>APSYNTRA <span class="auth-brand-accent">CRM</span></span>
    </a>
    <span class="auth-brandbar-meta"><span class="auth-live-indicator" aria-hidden="true"></span>SECURE WORKSPACE</span>
   </header>
   <main class="auth-panel">
    <div class="auth-intro auth-reveal">
     <span class="eyebrow">Your connected workspace</span>
     <h1>Welcome back<span class="auth-heading-stop">.</span></h1>
     <p class="muted" id="auth-login-description">One secure sign-in to your projects, boards, and team. Continue with your existing WatchdogWorkspace account.</p>
    </div>
    <div class="auth-form-card auth-reveal">
     <div class="auth-form-card-header">
      <span class="auth-form-card-label">WORKSPACE ACCESS</span>
      <span class="auth-lock-visual" aria-hidden="true">
       <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/></svg>
      </span>
     </div>
     `+error+`
     <form id="login-form" aria-describedby="auth-login-description">
      <div class="field">
       <label for="email">Work email</label>
       <input id="email" name="email" type="email" placeholder="you@company.com" autocomplete="username" inputmode="email" required autofocus/>
      </div>
      <div class="field">
       <label for="password">Password</label>
       <div class="password-wrap">
        <input id="password" name="password" type="password" placeholder="Enter your password" autocomplete="current-password" required minlength="1"/>
        <button type="button" class="eye-btn" data-action="toggle-password" aria-controls="password" aria-label="Show password" aria-pressed="false">Show</button>
       </div>
      </div>
      <button class="primary wide auth-submit" type="submit" id="login-submit">
       <span>Sign in to workspace</span>
       <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>
      </button>
     </form>
     <div class="auth-access-note">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-9h.01"/></svg>
      <p>Access is managed by your organization. No new account is created.</p>
     </div>
    </div>
    <div class="auth-trust-line auth-reveal" aria-hidden="true">
     <span class="auth-trust-dot"></span><span>Centralized access</span><span class="auth-trust-separator">/</span><span>Connected teams</span>
    </div>
   </main>
   <footer class="auth-bottom">© ${escapeHtml(year)} APSYNTRA CRM <span aria-hidden="true">·</span> Secured by Supabase Authentication</footer>
  </div>
  <div class="auth-right">
   <div class="auth-ambient-fallback" aria-hidden="true"></div>
   <div class="auth-ambient-scene" data-auth-scene aria-hidden="true"></div>
   <svg class="auth-orbit-art" viewBox="0 0 760 760" fill="none" aria-hidden="true" focusable="false">
    <circle cx="580" cy="200" r="300" stroke="currentColor" stroke-opacity=".13"/>
    <circle cx="580" cy="200" r="380" stroke="currentColor" stroke-opacity=".075"/>
    <path d="M-130 670C80 420 310 500 520 760" stroke="currentColor" stroke-opacity=".12"/>
    <path d="M-70 90C190 260 420 120 740 410" stroke="currentColor" stroke-opacity=".09"/>
    <circle cx="392" cy="142" r="4" fill="#88efff" fill-opacity=".9"/>
    <circle cx="690" cy="434" r="3" fill="#9da7ff" fill-opacity=".8"/>
    <circle cx="124" cy="535" r="3" fill="#9da7ff" fill-opacity=".8"/>
   </svg>
   <section class="auth-pitch" aria-labelledby="auth-pitch-title">
    <div class="auth-pitch-copy auth-reveal">
     <span class="eyebrow auth-pitch-eyebrow">Built for better work</span>
     <h2 id="auth-pitch-title">One workspace.<br/><span>Every possibility.</span></h2>
     <p>Bring your boards, people, and progress into focus with a workspace built for clarity.</p>
    </div>
    <div class="auth-preview-wrap auth-reveal">
     <div class="auth-preview-badge" aria-hidden="true">
      <span class="auth-preview-badge-icon">
       <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 12 5 5L20 6"/></svg>
      </span>
      <span>Everything in sync</span>
     </div>
     <div class="auth-preview" aria-hidden="true">
      <div class="auth-preview-top">
       <div class="auth-preview-dots"><i></i><i></i><i></i></div>
       <strong>APSYNTRA / WORKSPACE</strong>
       <span class="auth-preview-top-tag">OVERVIEW</span>
      </div>
      <div class="auth-preview-body">
       <div class="auth-preview-header">
        <div><span class="auth-preview-overline">WORK MANAGEMENT</span><h3>Projects in motion</h3></div>
        <span class="auth-preview-symbol">◈</span>
       </div>
       <div class="auth-preview-metrics">
        <div><strong>12</strong><small>Connected boards</small></div>
        <div><strong>08</strong><small>Active workflows</small></div>
        <div><strong>94<span>%</span></strong><small>Team visibility</small></div>
       </div>
       <div class="auth-preview-section">TEAM PRIORITIES <span>THIS WEEK</span></div>
       <div class="auth-preview-task"><span class="auth-task-icon auth-task-indigo">▦</span><span class="auth-preview-task-name">Plan upcoming activities</span><span class="auth-task-chip auth-task-complete">Done</span></div>
       <div class="auth-preview-task"><span class="auth-task-icon auth-task-amber">◇</span><span class="auth-preview-task-name">Review team assignments</span><span class="auth-task-chip auth-task-working">In progress</span></div>
       <div class="auth-preview-task"><span class="auth-task-icon auth-task-cyan">◉</span><span class="auth-preview-task-name">Monitor active requests</span><span class="auth-task-chip auth-task-planned">Planned</span></div>
       <div class="auth-preview-bottom"><span class="auth-preview-bottom-dot"></span> Unified team view <span class="auth-preview-bottom-label">ILLUSTRATIVE PREVIEW</span></div>
      </div>
     </div>
    </div>
    <div class="auth-pitch-footer" aria-hidden="true"><span>PRECISION</span><span class="auth-pitch-footline"></span><span>CONNECTIVITY</span><span class="auth-pitch-footline"></span><span>CLARITY</span></div>
   </section>
  </div>
 </div>`;
}
