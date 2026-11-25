/**
 * APSYNTRA CRM — Monday-inspired presentation layer.
 * No extra API, role, workspace membership, or data persistence authority.
 * Never renders fabricated notifications or activity records.
 */
const app = document.getElementById('app');
const THEME_KEY = 'apsyntra.monday-ui-theme';
const allowedThemes = new Set(['dark', 'light']);
let theme = 'light';
try {
  const stored = localStorage.getItem(THEME_KEY);
  if (allowedThemes.has(stored)) theme = stored;
} catch { /* Private-mode storage may be unavailable. */ }
document.documentElement.dataset.apsMondayTheme = theme;

const glyph = (path) => '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
const icons = {
  grid: glyph('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
  boards: glyph('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M10 10v10"/>'),
  clock: glyph('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  settings: glyph('<circle cx="12" cy="12" r="3"/><path d="M4.4 9.4 3 12l1.4 2.6 2.5.5 1.4 2.2L11 19h2l2.7-1.7 1.4-2.2 2.5-.5L21 12l-1.4-2.6-2.5-.5-1.4-2.2L13 5h-2L8.3 6.7 6.9 8.9z"/>'),
  bell: glyph('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>'),
  sun: glyph('<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>'),
  moon: glyph('<path d="M20.5 14.4A8.5 8.5 0 0 1 9.6 3.5 8.5 8.5 0 1 0 20.5 14.4z"/>'),
  history: glyph('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>')
};
const links = [
  {href:'#/overview', label:'Workspace', icon:'grid'},
  {href:'#/boards', label:'My boards', icon:'boards'},
  {href:'#/time-tracker', label:'TimeTracker', icon:'clock'},
  {href:'#/settings', label:'Settings', icon:'settings'}
];
const railMarkup =
  '<nav class="aps-monday-rail-nav" aria-label="Quick navigation">' +
  links.map(link => '<a class="aps-monday-rail-link" href="' + link.href +
    '" data-aps-monday-link title="' + link.label + '" aria-label="' + link.label +
    '">' + icons[link.icon] + '<span>' + link.label + '</span></a>').join('') + '</nav>';

let trigger = null;
const overlay = document.createElement('div');
overlay.className = 'aps-monday-drawer-backdrop';
overlay.hidden = true;
const drawer = document.createElement('aside');
drawer.className = 'aps-monday-notifications';
drawer.id = 'aps-monday-notifications';
drawer.hidden = true;
drawer.setAttribute('role', 'dialog');
drawer.setAttribute('aria-modal', 'true');
drawer.setAttribute('aria-labelledby', 'aps-monday-notifications-title');
drawer.innerHTML = '<header class="aps-monday-drawer-head"><h2 id="aps-monday-notifications-title">Notifications</h2>' +
  '<button type="button" class="aps-monday-close" data-aps-monday-close aria-label="Close notifications">×</button></header>' +
  '<div class="aps-monday-notification-tabs" role="tablist" aria-label="Notification filters">' +
  '<button type="button" role="tab" data-aps-monday-filter="all" aria-selected="true">All</button>' +
  '<button type="button" role="tab" data-aps-monday-filter="mentioned" aria-selected="false">Mentioned</button>' +
  '<button type="button" role="tab" data-aps-monday-filter="assigned" aria-selected="false">Assigned to me</button></div>' +
  '<section class="aps-monday-notification-body" role="tabpanel" aria-live="polite">' +
  '<div class="aps-monday-notification-empty"><span aria-hidden="true">' + icons.bell + '</span>' +
  '<h3>Global notifications are not connected yet</h3>' +
  '<p data-aps-monday-notice>When an authorized notification service is integrated, your inbox will appear here. No messages or unread counts have been simulated.</p>' +
  '<p class="aps-monday-notification-hint">For verified board changes, open the board’s Activity history.</p></div></section>';
document.body.append(overlay, drawer);

function updateLinks() {
  const hash = window.location.hash || '#/overview';
  for (const link of app.querySelectorAll('[data-aps-monday-link]')) {
    const href = link.getAttribute('href');
    const active = href === '#/boards' ? hash.startsWith('#/boards') :
      href === '#/time-tracker' ? hash.startsWith('#/time-tracker') :
      hash === href;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  const activity = app.querySelector('[data-aps-monday-activity]');
  if (activity) {
    activity.hidden = !hash.startsWith('#/boards/');
    activity.setAttribute('aria-hidden', String(activity.hidden));
  }
}
function updateThemeButton() {
  const button = app.querySelector('[data-aps-monday-theme-toggle]');
  if (!button) return;
  const next = theme === 'dark' ? 'light' : 'dark';
  button.innerHTML = theme === 'dark' ? icons.sun : icons.moon;
  button.setAttribute('aria-label', 'Switch to ' + next + ' appearance');
  button.title = 'Switch to ' + next + ' appearance';
  button.setAttribute('aria-pressed', String(theme === 'dark'));
}
function mountShell() {
  const shell = app?.querySelector(':scope > .shell');
  if (!shell) {
    closeNotifications(false);
    return;
  }
  shell.querySelector('.aps-sidebar .ws02-sidebar-action')?.remove();
  shell.querySelector('.aps-sidebar .side-bottom')?.remove();
  const actions = shell.querySelector('.topbar .top-actions');
  if (actions && !actions.querySelector('.aps-monday-top-tools')) {
    const tools = document.createElement('div');
    tools.className = 'aps-monday-top-tools';
    tools.innerHTML = '<button type="button" class="aps-monday-top-icon" data-aps-monday-activity title="Board activity history" aria-label="Board activity history">' +
      icons.history + '</button>' +
      '<button type="button" class="aps-monday-top-icon" data-aps-monday-notifications aria-haspopup="dialog" aria-controls="aps-monday-notifications" aria-expanded="false" title="Notifications (UI preview)">' +
      icons.bell + '</button>' +
      '<button type="button" class="aps-monday-top-icon" data-aps-monday-theme-toggle title="Change appearance" aria-pressed="true"></button>';
    const avatar = actions.querySelector('.top-avatar');
    if (avatar) actions.insertBefore(tools, avatar);
    else actions.append(tools);
  }
  updateThemeButton();
  updateLinks();
}
function setTheme(next) {
  if (!allowedThemes.has(next)) return;
  theme = next;
  document.documentElement.dataset.apsMondayTheme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* Preference is optional. */ }
  updateThemeButton();
}
function closeNotifications(restoreFocus = true) {
  if (drawer.hidden) return;
  drawer.hidden = true;
  overlay.hidden = true;
  app?.querySelector('[data-aps-monday-notifications]')?.setAttribute('aria-expanded', 'false');
  if (restoreFocus && trigger?.isConnected) trigger.focus();
  trigger = null;
}
function openNotifications(button) {
  trigger = button;
  drawer.hidden = false;
  overlay.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  drawer.querySelector('[data-aps-monday-close]')?.focus();
}
function setFilter(value) {
  if (!['all', 'mentioned', 'assigned'].includes(value)) return;
  for (const tab of drawer.querySelectorAll('[data-aps-monday-filter]')) {
    const selected = tab.dataset.apsMondayFilter === value;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  const detail = {
    all: 'When an authorized notification service is integrated, your inbox will appear here. No messages or unread counts have been simulated.',
    mentioned: 'Mentions will appear here after a signed mentions service is connected. This is a presentation preview, not a live inbox.',
    assigned: 'Assigned-item alerts will appear here after a signed assignment notification service is connected. No alerts are simulated.'
  };
  drawer.querySelector('[data-aps-monday-notice]').textContent = detail[value];
}
document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-aps-monday-notifications], [data-aps-monday-activity], [data-aps-monday-theme-toggle], [data-aps-monday-close], [data-aps-monday-filter]');
  if (!target) return;
  if (target.hasAttribute('data-aps-monday-close')) closeNotifications();
  if (target.hasAttribute('data-aps-monday-notifications')) {
    if (drawer.hidden) openNotifications(target); else closeNotifications();
  }
  if (target.hasAttribute('data-aps-monday-theme-toggle')) setTheme(theme === 'dark' ? 'light' : 'dark');
  if (target.hasAttribute('data-aps-monday-filter')) setFilter(target.dataset.apsMondayFilter);
  if (target.hasAttribute('data-aps-monday-activity')) {
    const boardAction = app?.querySelector('.main-content [data-action="board-activity"]');
    if (boardAction) boardAction.click(); // Reuses existing signed event reader.
  }
});
overlay.addEventListener('click', () => closeNotifications());
document.addEventListener('keydown', (event) => {
  if (drawer.hidden) return;
  if (event.key === 'Escape') {event.preventDefault();closeNotifications();return;}
  if (event.key !== 'Tab') return;
  const items = [...drawer.querySelectorAll('button:not([disabled]):not([hidden]), a[href], input:not([disabled])')].filter(node => node.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {event.preventDefault();last.focus();}
  else if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first.focus();}
});
window.addEventListener('hashchange', () => {
  closeNotifications(false);
  queueMicrotask(updateLinks);
});
if (app) {
  const observer = new MutationObserver(mountShell);
  observer.observe(app, {childList:true});
  mountShell();
}

/* APSYNTRA_SIDEBAR_V3 */
(() => {
  const host = document.getElementById('app');
  let lastSidebar = null;
  let keyword = '';

  function filterBoards(sidebar) {
    const list = sidebar.querySelector('.sidebar-recent-list');
    if (!list) return;

    let count = 0;
    const term = keyword.trim().toLocaleLowerCase();

    for (const link of list.querySelectorAll('.sidebar-recent-link')) {
      const match = link.textContent.toLocaleLowerCase().includes(term);
      link.hidden = !match;
      if (match) count++;
    }

    let empty = list.querySelector('[data-board-filter-empty]');
    if (!empty) {
      empty = document.createElement('div');
      empty.dataset.boardFilterEmpty = '';
      empty.textContent = 'No matching boards';
      list.append(empty);
    }
    empty.hidden = !term || count > 0;
  }

  function mount() {
    const sidebar = host?.querySelector('.aps-sidebar');
    if (!sidebar || sidebar === lastSidebar) return;
    lastSidebar = sidebar;

    // Remove previously added popup-search controls
    sidebar.querySelectorAll(
      '.sidebar-search-slot, .aps-inline-board-search, [data-global-search-open]'
    ).forEach(el => el.remove());

    // Native search field above Current workspace
    const switcher = sidebar.querySelector('.workspace-switcher');
    if (switcher) {
      const slot = document.createElement('div');
      slot.className = 'aps-board-search-v3';
      slot.innerHTML =
        '<label class="aps-board-search-field">' +
        '<svg viewBox="0 0 24 24" width="17" height="17" ' +
        'fill="none" stroke="currentColor" stroke-width="2" ' +
        'aria-hidden="true"><circle cx="11" cy="11" r="7"/>' +
        '<path d="m16 16 5 5"/></svg>' +
        '<input type="search" id="aps-sidebar-board-search" placeholder="Search boards..." ' +
        'aria-label="Search boards in sidebar" data-aps-search-native="true" autocomplete="off">' +
        '</label>';

      switcher.before(slot);

      const input = slot.querySelector('input');
      input.value = keyword;
      input.addEventListener('input', () => {
        keyword = input.value;
        filterBoards(sidebar);
      });

      // Reuse APSYNTRA's existing new-board action
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'aps-workspace-add-board';
      add.dataset.action = 'new-board';
      add.textContent = '+';
      add.title = 'Create board in current workspace';
      add.setAttribute('aria-label', add.title);
      switcher.append(add);
    }

    // The signed host owns navigation and capabilities. Rename only the
    // Overview label; never prune native applications or CRM Admin actions.
    const overview = sidebar.querySelector('nav[aria-label="Primary"] a[href="#/overview"]');
    if (overview) {
      const label = overview.querySelector('.nav-label');
      if (label) label.textContent = 'Dashboard';
      overview.setAttribute('aria-label', 'Dashboard');
      overview.title = 'Dashboard';
    }

    // Keep existing host navigation and board catalog intact
    sidebar.querySelector('.ws02-sidebar-action')?.remove();
    sidebar.querySelector('.side-bottom')?.remove();

    const heading = sidebar.querySelector('.sidebar-recent-heading');
    if (heading?.firstChild) heading.firstChild.textContent = 'Boards';

    filterBoards(sidebar);
  }

  // Global search owns Cmd/Ctrl+K. Sidebar filtering remains available by click.
  if (!host) return;

  const observer = new MutationObserver(() => {
    const current = host.querySelector('.aps-sidebar');
    if (current !== lastSidebar) mount();
  });

  observer.observe(host, {childList: true, subtree: true});
  mount();
})();