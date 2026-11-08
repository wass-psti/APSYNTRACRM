// Shared Supabase storage.objects policies must have EXECUTE grants on their
// authenticated-only authorization helpers. Never bypass RLS or retry a write.
export function storageRequestError22(data,status){
 const source=(data && typeof data==='object' && (data.message||data.error||data.error_description))||'';
 const original=typeof source==='string'?source:'';
 const match=/permission denied for function ([a-z][a-z0-9_]*)/i.exec(original);
 if(match){
  const error=new Error(`Storage access blocked by a shared policy function (${match[1]}). The operation is unconfirmed; inspect authorized evidence before retrying and contact the administrator to verify function EXECUTE grants.`);
  error.code='STORAGE_POLICY_FUNCTION_EXECUTE_DENIED';
  return error;
 }
 return new Error(original||`Evidence request denied (${status})`);
}
