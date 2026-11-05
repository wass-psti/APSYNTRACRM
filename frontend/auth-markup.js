/**
 * Login, registration-admission and password-recovery presentation. The IDs, field names, and data-action hooks are the
 * existing signed-auth contract; no credentials are processed in this module.
 * @typedef {{message?:string,notice?:string,year?:number,mode?:string,resetReady?:boolean}} AuthMarkupOptions
 */
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,
 char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
/** @param {AuthMarkupOptions} options */
export function renderAuthMarkup({message='',notice='',year=new Date().getFullYear(),mode='login',resetReady=false}={}){
 const error=message?'<div class="login-error" role="alert">'+escapeHtml(message)+'</div>':'';
 const confirmation=notice?'<div class="auth-message" role="status">'+escapeHtml(notice)+'</div>':'';
 const loginForm=`     <form id="login-form" aria-describedby="auth-login-description">
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
     </form>`;
 const registerForm=`<div class="auth-admission-warning" role="status" id="auth-registration-status"><strong>Self-service registration is being secured</strong>
      <p>Legacy signup triggers must be replaced before activation. Verified new accounts will receive their own Main Workspace, without gaining platform-administrator privileges.</p></div>
     <form id="register-form" aria-describedby="auth-registration-status">
      <div class="field"><label for="register-name">Full name</label><input id="register-name" name="name" type="text" autocomplete="name" minlength="2" maxlength="120" required placeholder="Your full name"/></div>
      <div class="field"><label for="register-email">Work email</label><input id="register-email" name="email" type="email" autocomplete="email" inputmode="email" maxlength="254" required placeholder="you@company.com"/></div>
      <div class="field"><label for="register-password">Password</label><div class="password-wrap"><input id="register-password" name="password" type="password" autocomplete="new-password" minlength="12" maxlength="72" required placeholder="At least 12 characters"/><button type="button" class="eye-btn" data-action="toggle-password" data-password-target="register-password" aria-controls="register-password" aria-label="Show password" aria-pressed="false">Show</button></div></div>
      <div class="field"><label for="register-confirm">Confirm password</label><div class="password-wrap"><input id="register-confirm" name="confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="72" required placeholder="Repeat password"/><button type="button" class="eye-btn" data-action="toggle-password" data-password-target="register-confirm" aria-controls="register-confirm" aria-label="Show password" aria-pressed="false">Show</button></div></div>
      <button type="submit" class="primary wide auth-submit" disabled aria-describedby="auth-registration-status">Create account — pending activation</button>
     </form>`;
 const forgotForm=`<form id="forgot-form">
      <p class="auth-form-explanation">Enter your work email. If an eligible account exists, a recovery link will be sent. We never disclose account existence.</p>
      <div class="field"><label for="recovery-email">Work email</label><input id="recovery-email" name="email" type="email" autocomplete="email" inputmode="email" maxlength="254" placeholder="you@company.com" required autofocus/></div>
      <button type="submit" class="primary wide auth-submit">Send recovery instructions</button>
     </form>`;
 const resetForm=`<form id="reset-form" aria-describedby="reset-guidance">
      <p id="reset-guidance" class="auth-form-explanation">Choose a new password with at least 12 characters, one letter, and one number. A verified recovery link is required.</p>
      <div class="field"><label for="reset-password">New password</label><div class="password-wrap"><input id="reset-password" name="password" type="password" autocomplete="new-password" minlength="12" maxlength="72" required placeholder="New password" ${resetReady?'':'disabled'}/><button type="button" class="eye-btn" data-action="toggle-password" data-password-target="reset-password" aria-controls="reset-password" aria-label="Show password" aria-pressed="false" ${resetReady?'':'disabled'}>Show</button></div></div>
      <div class="field"><label for="reset-confirm">Confirm new password</label><div class="password-wrap"><input id="reset-confirm" name="confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="72" required placeholder="Repeat new password" ${resetReady?'':'disabled'}/><button type="button" class="eye-btn" data-action="toggle-password" data-password-target="reset-confirm" aria-controls="reset-confirm" aria-label="Show password" aria-pressed="false" ${resetReady?'':'disabled'}>Show</button></div></div>
      <button type="submit" class="primary wide auth-submit" ${resetReady?'':'disabled'}>Update password</button>
      ${resetReady?'':'<p class="auth-form-explanation" role="alert">Your recovery link is unavailable or expired. Request a new link.</p>'}
     </form>`;
 const view=['login','register','forgot','reset'].includes(mode)?mode:'login';
 const copy={
 login:{eyebrow:'Your connected workspace',title:'Welcome back',description:'One secure sign-in to your projects, boards, and team. Continue with your existing WatchdogWorkspace account.',label:'WORKSPACE ACCESS',note:'Access is managed by your organization. No new account is created on sign in.'},
 register:{eyebrow:'Your personal workspace',title:'Create an account',description:'Self-service signup will include email verification and an automatically provisioned Main Workspace. Registration is temporarily disabled during backend security activation.',label:'ACCOUNT REGISTRATION',note:'Workspace ownership never grants global platform-administrator privileges.'},
 forgot:{eyebrow:'Secure account recovery',title:'Forgot password',description:'Request a time-limited recovery link for your existing APSYNTRA CRM account.',label:'PASSWORD RECOVERY',note:'Recovery never modifies roles, memberships, or board permissions.'},
 reset:{eyebrow:'Protected password update',title:'Reset password',description:'Verify your recovery link and choose a new password.',label:'PASSWORD RESET',note:'Sign in again after changing your password.'}
 }[view];
 const form=view==='register'?registerForm:view==='forgot'?forgotForm:view==='reset'?resetForm:loginForm;
 const links=[['login','Sign in','#/login'],['register','Create account','#/register'],['forgot','Forgot password?','#/forgot-password']]
  .map(([key,label,url])=>'<a href="'+url+'"'+(view===key?' aria-current="page"':'')+'>'+label+'</a>').join('');
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
     <span class="eyebrow">${escapeHtml(copy.eyebrow)}</span>
     <h1>${escapeHtml(copy.title)}<span class="auth-heading-stop">.</span></h1>
     <p class="muted" id="auth-login-description">${escapeHtml(copy.description)}</p>
    </div>
    <div class="auth-form-card auth-reveal">
     <div class="auth-form-card-header">
      <span class="auth-form-card-label">${escapeHtml(copy.label)}</span>
      <span class="auth-lock-visual" aria-hidden="true">
       <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/></svg>
      </span>
     </div>
     `+error+confirmation+`
     ${form}
     <nav class="auth-access-links" aria-label="Account access options">${links}</nav>
     <div class="auth-access-note">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-9h.01"/></svg>
      <p>${escapeHtml(copy.note)}</p>
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
