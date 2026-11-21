/* CP03 read-only acceptance. Run ONLY in the existing signed APSYNTRA tab.
 * The only UI interactions are route navigation and opening/closing menus.
 * Never click a menu command or submit a form.
 */
(() => {
  if (window.__crmUI03Live?.status === 'running') return 'AUDIT_ALREADY_RUNNING';

  const routes = [
    '#/overview', '#/boards', '#/fm1', '#/time-tracker', '#/fund-tracker',
    '#/fueltrack', '#/tradelink', '#/talkbox', '#/user-role-management', '#/settings',
  ];
  const result = {
    status: 'running', originalRoute: location.hash, routes: [], menuChecks: [], errors: [],
  };
  window.__crmUI03Live = result;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function verifyVisibleMenus(route) {
    // A board-list refresh can replace an entire card during inspection.
    // Never validate ARIA or geometry against a detached old DOM node.
    const visibleMenus = () => [...document.querySelectorAll('.aps-action-surface')]
      .filter(menu => {
        if (!menu.isConnected) return false;
        const trigger = menu.querySelector('summary');
        const anchor = trigger?.getBoundingClientRect();
        return anchor && anchor.left >= 0 && anchor.right <= innerWidth &&
          anchor.top >= 0 && anchor.bottom <= innerHeight &&
          menu.querySelector('[role="menu"]');
      });
    const first = visibleMenus();
    if (!first.length) return;
    const positions = [...new Set([0, Math.floor(first.length / 2), first.length - 1])];
    for (const index of positions) {
      let checked = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        if (document.visibilityState !== 'visible') {
          result.menuChecks.push({route, index, skipped: 'TAB_NOT_FOREGROUND'});
          checked = true;
          break;
        }
        const candidates = visibleMenus();
        const menu = candidates[Math.min(index, candidates.length - 1)];
        if (!menu) {
          await delay(250);
          continue;
        }
        const trigger = menu.querySelector('summary');
        if (!menu.open) trigger.click();
        // Allow the same-tab foreground placement to settle, but do not
        // assume a menu node survived the async board refresh.
        await delay(350);
        if (document.visibilityState !== 'visible') {
          if (menu.isConnected && menu.open) trigger.click();
          result.menuChecks.push({route, index, skipped: 'TAB_LOST_FOREGROUND'});
          checked = true;
          break;
        }
        if (!menu.isConnected || !trigger.isConnected) {
          await delay(250);
          continue;
        }
        const popup = menu.querySelector('[role="menu"]');
        const rect = popup?.getBoundingClientRect();
        result.menuChecks.push({
          route, index, open: menu.open,
          expanded: trigger.getAttribute('aria-expanded'),
          fits: !!rect && rect.left >= 0 && rect.right <= innerWidth &&
            rect.top >= 0 && rect.bottom <= innerHeight,
          items: popup?.querySelectorAll('[role="menuitem"]').length || 0,
          connected: menu.isConnected,
        });
        if (menu.open) trigger.click();
        checked = true;
        await delay(90);
        break;
      }
      if (!checked)
        result.menuChecks.push({route, index, skipped: 'DOM_REPLACED_DURING_CHECK'});
    }
  }

  (async () => {
    try {
      for (const route of routes) {
        location.hash = route;
        await delay(1350);
        const app = document.querySelector('#app');
        result.routes.push({
          requested: route, actual: location.hash,
          overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
          viewport: innerWidth,
          menus: app?.querySelectorAll('.aps-action-surface').length || 0,
          controls: app?.querySelectorAll('button,input,select,textarea').length || 0,
          panelCount: app?.querySelectorAll('.fm1-panel,.ft3-panel,.tl-draft-panel,.tt-attendance-console,.tb-panel,.frt-ref-table-card,.panel').length || 0,
        });
        if (route === '#/overview' || route === '#/boards') await verifyVisibleMenus(route);
      }
    } catch (error) {
      result.errors.push(String(error?.message || error).slice(0, 180));
    } finally {
      location.hash = result.originalRoute;
      result.status = 'complete';
    }
  })();
  return 'AUDIT_STARTED';
})();
