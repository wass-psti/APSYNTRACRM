/** Return the externally reachable URL prefix for the deployed guest Edge Function. */
export function getGuestApiBaseUrl(supabaseUrl) {
  let projectUrl;
  try {
    projectUrl = new URL(String(supabaseUrl || ''));
  } catch {
    throw new TypeError('A valid Supabase project URL is required.');
  }
  if (!['http:', 'https:'].includes(projectUrl.protocol) || !projectUrl.hostname) {
    throw new TypeError('A valid Supabase project URL is required.');
  }
  return `${projectUrl.origin}/functions/v1/pdl-guest-api`;
}
