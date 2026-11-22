/**
 * APSYNTRA mobile destination shell.
 * Presentation only: the authenticated host remains the source of routes,
 * workspace-scoped boards, permissions, session state, and application content.
 * No sample users, synthetic activity, API calls, or navigation remapping.
 */
const root = document.getElementById('app');
const HOME = '#/overview';
const glyphs = Object.freeze({
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  search: '<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="m10 2-.5 2.1-2 1.2-2.1-.7-2.2 3.8 1.6 1.5v2.2l-1.6 1.5 2.2 3.8 2.1-.7 2 1.2L10 20h4l.5-2.1 2-1.2 2.1.7 2.2-3.8-1.6-1.5V9.9l1.6-1.5-2.2-3.8-2.1.7-2-1.2L14 2h-4Z"/>',
  arrow: '<path d="m15 18-6-6 6-6"/>',
  open: '<path d="m5 12 14 0m-6-6 6 6-6 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  board: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>',
  briefcase: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M3 13h18"/>'
});
const svg = (kind, size = 22) =>
  '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size +
  '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"' +
  ' stroke-linejoin="round" aria-hidden="true">' + (glyphs[kind] || glyphs.grid) + '</svg>';
const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, char =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const safeRoute = href => typeof href === 'string' &&
  /^#\/[a-zA-Z0-9_+.%/?=&-]+$/.test(href) && href.length < 400;
const path = () => (location.hash || HOME).split('?')[0].replace(/\/$/, '') || HOME;
const isHome = () => [HOME, '#', '#/'].includes(path());
const mobile = () => window.matchMedia('(max-width: 810px)').matches;

// This state is deliberately session-local and revalidated against currently
// rendered signed links after every workspace/account navigation.
let favorites = null;
let visited = [];
let lastShell = null;
let lastContext = '';
let searchText = '';
let renderQueued = false;

function catalog(shell) {
  const apps = [], boards = [], seen = new Set();
  function add(link, destination) {
    const href = link.getAttribute('href') || '';
    const label = (link.querySelector('.nav-label')?.textContent ||
      link.getAttribute('aria-label') || link.textContent || '').trim();
    if (!safeRoute(href) || !label || seen.has(href) ||
        [HOME, '#/boards', '#/settings'].includes(href)) return;
    seen.add(href);
    destination.push({ href, label, type: destination === boards ? 'Board' : 'Application' });
  }
  for (const link of shell.querySelectorAll('.aps-sidebar nav[aria-label="Primary"] a.nav-link')) {
    add(link, apps);
  }
  for (const link of shell.querySelectorAll('.aps-sidebar .sidebar-recent-list a.sidebar-recent-link')) {
    add(link, boards);
  }
  return {apps, boards, all: [...apps, ...boards]};
}

function iconFor(item) {
  if (item.type === 'Board') return 'board';
  if (/time.?tracker/i.test(item.label)) return 'clock';
  if (/fund|finance|ticket|trade/i.test(item.label)) return 'briefcase';
  return 'grid';
}
function itemCard(item, index) {
  const fav = favorites.has(item.href);
  return '<article class="apsm-card apsm-tone-' + index % 6 + '" data-apsm-filter-name="' +
    escapeHtml(item.label.toLowerCase()) + '">' +
    '<a class="apsm-card-open" href="' + escapeHtml(item.href) + '" aria-label="Open ' +
    escapeHtml(item.label) + '">' +
    '<span class="apsm-card-icon">' + svg(iconFor(item), 26) + '</span>' +
    '<span class="apsm-card-meta">' + escapeHtml(item.type) + '</span>' +
    '<strong>' + escapeHtml(item.label) + '</strong>' +
    '<span class="apsm-card-footer">Open ' + svg('open', 19) + '</span></a>' +
    '<button class="apsm-star" type="button" data-apsm-favorite="' + escapeHtml(item.href) +
    '" aria-label="' + (fav ? 'Remove ' : 'Add ') + escapeHtml(item.label) +
    (fav ? ' from favorites' : ' to favorites') + '" aria-pressed="' + fav +
    '" title="' + (fav ? 'Remove from favorites' : 'Add to favorites') + '">' +
    svg('star', 20) + '</button></article>';
}
function itemRow(item, index) {
  const fav = favorites.has(item.href);
  return '<div class="apsm-list-row" data-apsm-filter-name="' +
    escapeHtml(item.label.toLowerCase()) + '">' +
    '<span class="apsm-list-icon apsm-tone-' + index % 6 + '">' +
    svg(iconFor(item), 22) + '</span>' +
    '<a class="apsm-list-link" href="' + escapeHtml(item.href) + '">' +
    '<strong>' + escapeHtml(item.label) + '</strong><small>' +
    escapeHtml(item.type) + '</small></a>' +
    '<button class="apsm-list-star" type="button" data-apsm-favorite="' + escapeHtml(item.href) +
    '" aria-label="' + (fav ? 'Remove ' : 'Add ') + escapeHtml(item.label) +
    (fav ? ' from favorites' : ' to favorites') + '" aria-pressed="' + fav + '">' +
    svg('star', 18) + '</button></div>';
}
function recentRow(item) {
  return '<a class="apsm-recent-row" href="' + escapeHtml(item.href) + '">' +
    '<span class="apsm-recent-icon">' + svg(iconFor(item), 22) + '</span>' +
    '<span><strong>' + escapeHtml(item.label) + '</strong><small>' +
    escapeHtml(item.type) + ' · Visited this session</small></span>' +
    '<span class="apsm-recent-arrow">' + svg('open', 19) + '</span></a>';
}
function bottomNavigation() {
  return '<nav class="apsm-bottom-nav" aria-label="Mobile navigation">' +
    '<a href="#/overview" class="selected" aria-current="page" aria-label="Home">' + svg('home') + '<span>Home</span></a>' +
    '<a href="#/boards" aria-label="Boards">' + svg('board') + '<span>Boards</span></a>' +
    '<button type="button" data-apsm-focus-search aria-label="Search apps and boards">' + svg('search') + '<span>Search</span></button>' +
    '<button type="button" data-apsm-scroll-favorites aria-label="Go to favorites">' + svg('star') + '<span>Favorites</span></button>' +
    '<a href="#/settings" aria-label="Settings">' + svg('settings') + '<span>Settings</span></a></nav>';
}
function renderHome(shell, items) {
  const home = shell.querySelector(':scope > .apsm-home');
  if (!home) return;
  const workspace = shell.querySelector('.aps-sidebar .workspace-name')?.textContent?.trim() || 'Your workspace';
  const monogram = shell.querySelector('.top-avatar [data-avatar-initials]')?.textContent?.trim() || 'A';
  const signature = JSON.stringify([workspace, monogram,
    items.all.map(item => [item.href,item.label,item.type]), [...favorites],
    visited.map(item => item.href)]);
  if (home.dataset.apsmSignature === signature) return;
  home.dataset.apsmSignature = signature;
  const favoritesList = items.all.filter(item => favorites.has(item.href));
  const recentList = visited.map(entry => items.all.find(item => item.href === entry.href)).filter(Boolean);
  home.innerHTML =
    '<div class="apsm-hero">' +
      '<div class="apsm-identity"><span class="apsm-avatar" aria-hidden="true">' +
      escapeHtml(monogram) + '</span><div><span class="apsm-eyebrow">APSYNTRA CRM</span>' +
      '<h1>Your workspace</h1><p>' + escapeHtml(workspace) + '</p></div></div>' +
      '<a href="#/settings" class="apsm-settings" aria-label="Open account settings">' +
      svg('settings') + '</a></div>' +
    '<div class="apsm-search" role="search">' + svg('search', 20) +
      '<input type="text" inputmode="search" autocomplete="off" data-apsm-search' +
      ' aria-label="Search applications and boards" placeholder="Search apps and boards…" value="' +
      escapeHtml(searchText) + '"></div>' +
    '<section class="apsm-section apsm-favorites" id="apsm-favorites" data-apsm-collection>' +
      '<div class="apsm-heading"><div><span>YOUR SHORTCUTS</span><h2>My favorites</h2></div>' +
      '<span class="apsm-count">' + favoritesList.length + '</span></div>' +
      (favoritesList.length ? '<div class="apsm-carousel">' + favoritesList.map(itemCard).join('') + '</div>' :
        '<p class="apsm-empty">Select a star on any application or board to add it here.</p>') +
    '</section>' +
    '<section class="apsm-section apsm-recents" data-apsm-collection>' +
      '<div class="apsm-heading"><div><span>PICK UP WHERE YOU LEFT OFF</span>' +
      '<h2>Recently visited</h2></div></div>' +
      (recentList.length ? '<div class="apsm-recent-list">' + recentList.map(recentRow).join('') + '</div>' :
        '<p class="apsm-empty">Applications and boards you open will appear here during this session.</p>') +
    '</section>' +
    '<section class="apsm-section apsm-applications" data-apsm-collection>' +
      '<div class="apsm-heading"><div><span>EXPLORE</span><h2>Applications</h2></div>' +
      '<span class="apsm-count">' + items.apps.length + '</span></div>' +
      (items.apps.length ? '<div class="apsm-list">' + items.apps.map(itemRow).join('') + '</div>' :
        '<p class="apsm-empty">No applications available in this workspace.</p>') + '</section>' +
    '<section class="apsm-section apsm-boards" data-apsm-collection>' +
      '<div class="apsm-heading"><div><span>YOUR TEAM</span><h2>Boards</h2></div>' +
      '<a href="#/boards" class="apsm-all-boards">Browse all</a></div>' +
      (items.boards.length ? '<div class="apsm-list">' + items.boards.map(itemRow).join('') + '</div>' :
        '<p class="apsm-empty">No workspace boards in the current catalog.</p>') + '</section>' +
    '<p class="apsm-no-results" data-apsm-no-results hidden>No matching apps or boards.</p>' +
    bottomNavigation();
  applyFilter(home);
}
function applyFilter(home) {
  const q = searchText.trim().toLocaleLowerCase();
  let matches = 0;
  for (const entry of home.querySelectorAll('[data-apsm-filter-name]')) {
    const found = !q || entry.dataset.apsmFilterName.includes(q);
    entry.hidden = !found;
    if (found) matches++;
  }
  // Recent routes are true session visits; hide only the route collections
  // that do not contain a matching destination.
  for (const section of home.querySelectorAll('[data-apsm-collection]')) {
    if (!q) { section.hidden = false; continue; }
    if (section.classList.contains('apsm-recents')) { section.hidden = true; continue; }
    section.hidden = !section.querySelector('[data-apsm-filter-name]:not([hidden])');
  }
  const none = home.querySelector('[data-apsm-no-results]');
  if (none) none.hidden = !q || matches > 0;
}
function titleFor(route, items, shell) {
  const matched = items.all.find(item => route === item.href || route.startsWith(item.href + '/'));
  if (matched) return matched.label;
  if (route === '#/boards' || route.startsWith('#/boards/')) return 'Boards';
  if (route.startsWith('#/settings')) return 'Settings';
  return shell.querySelector('.breadcrumb strong')?.textContent?.trim() || 'APSYNTRA CRM';
}
function synchronize() {
  const shell = root?.querySelector(':scope > .shell');
  if (!shell) { lastShell = null; lastContext = ''; favorites = null; visited = []; return; }
  const workspace = shell.querySelector('.aps-sidebar .workspace-name')?.textContent?.trim() || '';
  // A replaced authenticated shell indicates a different account or workspace.
  // Never carry a board history into another signed context.
  if (shell !== lastShell || workspace !== lastContext) {
    lastShell = shell;
    lastContext = workspace;
    favorites = null;
    visited = [];
    searchText = '';
  }
  let header = shell.querySelector(':scope > .apsm-app-header');
  if (!header) {
    header = document.createElement('header');
    header.className = 'apsm-app-header';
    header.innerHTML = '<a href="#/overview" aria-label="Back to mobile home" class="apsm-back">' +
      svg('arrow') + '<span>Home</span></a><strong data-apsm-route-title>APSYNTRA CRM</strong>' +
      '<a href="#/overview" class="apsm-header-home" aria-label="Go to home">' + svg('home', 20) + '</a>';
    shell.insertBefore(header, shell.querySelector(':scope > .main'));
  }
  let home = shell.querySelector(':scope > .apsm-home');
  if (!home) {
    home = document.createElement('main');
    home.className = 'apsm-home';
    home.setAttribute('aria-label', 'Mobile workspace home');
    shell.append(home);
  }
  const items = catalog(shell);
  if (favorites === null) favorites = new Set(items.apps.slice(0, 3).map(item => item.href));
  const homeRoute = isHome();
  shell.classList.add('apsm-shell');
  shell.classList.toggle('apsm-home-route', homeRoute);
  shell.classList.toggle('apsm-destination-route', !homeRoute);
  const title = header.querySelector('[data-apsm-route-title]');
  const nextTitle = titleFor(path(), items, shell);
  if (title && title.textContent !== nextTitle) title.textContent = nextTitle;
  if (homeRoute) renderHome(shell, items);
}
function scheduleSync() {
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(() => { renderQueued = false; synchronize(); });
}
if (root) {
  const observer = new MutationObserver(records => {
    if (records.some(record => record.target === root ||
      record.target.classList?.contains('shell') ||
      record.target.closest?.('.aps-sidebar'))) scheduleSync();
  });
  observer.observe(root, {childList: true, subtree: true});
  window.addEventListener('hashchange', scheduleSync);
  root.addEventListener('input', event => {
    if (!event.target.matches?.('[data-apsm-search]')) return;
    searchText = event.target.value;
    applyFilter(event.target.closest('.apsm-home'));
  });
  root.addEventListener('click', event => {
    const button = event.target.closest?.('[data-apsm-favorite], [data-apsm-focus-search], [data-apsm-scroll-favorites]');
    if (button?.hasAttribute('data-apsm-favorite')) {
      const href = button.getAttribute('data-apsm-favorite');
      const shell = root.querySelector(':scope > .shell');
      if (!catalog(shell).all.some(item => item.href === href)) return;
      if (favorites.has(href)) favorites.delete(href); else favorites.add(href);
      shell.querySelector('.apsm-home')?.removeAttribute('data-apsm-signature');
      scheduleSync();
      return;
    }
    if (button?.hasAttribute('data-apsm-focus-search')) {
      const search = root.querySelector('.apsm-home [data-apsm-search]');
      search?.focus();
      search?.scrollIntoView({block: 'center', behavior: 'smooth'});
      return;
    }
    if (button?.hasAttribute('data-apsm-scroll-favorites')) {
      root.querySelector('.apsm-favorites')?.scrollIntoView({block: 'start', behavior: 'smooth'});
      return;
    }
    const anchor = event.target.closest?.('a[href^="#/"]');
    if (!anchor || !mobile()) return;
    const href = anchor.getAttribute('href');
    const shell = root.querySelector(':scope > .shell');
    if (!shell || href === HOME) return;
    const items = catalog(shell).all;
    const matched = items.find(item => item.href === href);
    if (!matched) return;
    visited = [{href, when: Date.now()}, ...visited.filter(item => item.href !== href)].slice(0, 8);
  });
  scheduleSync();
}
