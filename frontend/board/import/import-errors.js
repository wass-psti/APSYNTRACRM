/** Normalize low-level token/JSON parsing failures at the import boundary.
 * A write response that cannot be decoded is indeterminate: callers must
 * reconcile the board before retrying to avoid duplicate commits.
 */
const tokenFailure=error=>{
 const message=String(error?.message||error||'');
 return error?.code==='INVALID_JSON_RESPONSE'||
  error instanceof SyntaxError||error?.name==='SyntaxError'||
  /invalid or unexpected token|unexpected token|unexpected end of json input/i.test(message);
};
export function normalizeImportFailure(error,phase='preflight'){
 const message=String(error?.message||error||'Import failed.');
 if(!tokenFailure(error))return {
  message,uncertain:error?.importOutcomeUncertain===true||
   error?.schemaOutcomeUncertain===true,code:''
 };
 if(phase==='file-read')return {
  message:'The selected workbook could not be decoded. No board changes were made. Save or export the file again as a standard .xlsx or .csv workbook, then retry. Details: '+message,
  uncertain:false,code:'BIMP_FILE_DECODE'
 };
 if(phase==='schema-write')return {
  message:'The Status/Dropdown creation response could not be decoded. The column may already exist. Refresh the board and check its columns before retrying. Details: '+message,
  uncertain:true,code:'BIMP_SCHEMA_RESPONSE'
 };
 if(phase==='record-write')return {
  message:'The import response could not be decoded. The records may already have been committed. Do not submit again yet; refresh the board and check the destination group first. Details: '+message,
  uncertain:true,code:'BIMP_IMPORT_RESPONSE'
 };
 return {message:'The import could not be completed because a response contained an invalid token. Retry only after reviewing the board state. Details: '+message,
  uncertain:false,code:'BIMP_PREFLIGHT_TOKEN'};
}
