// GitHub Pages serves the repository root 404 for unknown Paseo deep links.
// Restore only our booking subpath; never redirect CRM or unrelated URLs.
(() => {
  const prefix = '/APSYNTRACRM/paseo/';
  const pathname = window.location.pathname;
  if (!pathname.startsWith(prefix) || pathname === prefix) return;
  const suffix = pathname.slice(prefix.length);
  if (!/^[a-zA-Z0-9/_-]{1,240}$/.test(suffix)) return;
  const target = new URL(prefix, window.location.origin);
  target.searchParams.set('_pdl_route', '/' + suffix + window.location.search);
  target.hash = window.location.hash;
  window.location.replace(target.href);
})();
