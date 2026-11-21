// Execute before the React Router bundle, preserving receipt fragment tokens.
(() => {
  const prefix = '/APSYNTRACRM/paseo/';
  if (window.location.pathname !== prefix) return;
  const params = new URLSearchParams(window.location.search);
  const route = params.get('_pdl_route');
  if (!route || route.length > 1024 || !/^\/[a-zA-Z0-9/_-]+(?:\?[a-zA-Z0-9_.?&=%-]*)?$/.test(route) ||
      route.includes('..') || route.includes('//')) return;
  history.replaceState(null, '', prefix.slice(0, -1) + route + window.location.hash);
})();
