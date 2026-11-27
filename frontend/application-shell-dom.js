/**
 * Update the existing CRM shell for a same-scope route or data refresh.
 * The caller decides whether the current signed-in user/workspace may reuse
 * the shell; this function only reconciles its presentation DOM.
 */
export function updateExistingApplicationShell({
 existing,
 renderedSidebarSignature,
 sidebarSignature,
 renderSidebar,
 selectedNavigation,
 breadcrumb,
 avatarMarkup,
 body,
 preserveContent = false
} = {}) {
 const oldSidebar = existing.querySelector('.aps-sidebar');

 if (renderedSidebarSignature !== sidebarSignature) {
  const scroll = oldSidebar?.querySelector('.sidebar-nav-scroll')?.scrollTop || 0;
  const template = existing.ownerDocument.createElement('template');
  template.innerHTML = renderSidebar();
  oldSidebar?.replaceWith(template.content.firstElementChild);
  const navScroll = existing.querySelector('.sidebar-nav-scroll');
  if (navScroll) navScroll.scrollTop = scroll;
 } else {
  const activeHref = selectedNavigation.startsWith('recent:')
   ? '#/boards/' + selectedNavigation.slice(7)
   : selectedNavigation ? '#/' + selectedNavigation : '';
  for (const link of existing.querySelectorAll('.aps-sidebar a.nav-link')) {
   const path = link.getAttribute('href') || '';
   const active = !!activeHref && path === activeHref;
   link.classList.toggle('active', active);
   if (active) link.setAttribute('aria-current', 'page');
   else link.removeAttribute('aria-current');
  }
 }

 existing.querySelector('.breadcrumb strong').textContent = breadcrumb;
 existing.querySelector('.top-avatar').innerHTML = avatarMarkup;
 if (!preserveContent) existing.querySelector('.main-content').innerHTML = body;
}
