/** Exact source-row and committed-write reconciliation for successful imports. */
const integer=value=>Number.isSafeInteger(value)&&value>=0;
export function reconcileImportSummary({sourceRows,validRows,rejectedRows,
 excludedWorksheetRows=0,receipt={}}={}){
 const inserted=receipt.created??0,updated=receipt.updated??0,skipped=receipt.skipped??0;
 const duplicates=receipt.duplicates??0;
 const columnsCreated=receipt.columnsCreated??0,groupsCreated=receipt.groupsCreated??0;
 const inputs=[sourceRows,validRows,rejectedRows,excludedWorksheetRows,
  inserted,updated,skipped,duplicates,columnsCreated,groupsCreated];
 if(!inputs.every(integer))throw new TypeError('Import summary values must be non-negative safe integers.');
 const committedWrites=inserted+updated;
 const processedRows=committedWrites+skipped;
 const sourceRowsReconcile=sourceRows===validRows+rejectedRows+excludedWorksheetRows;
 const committedRowsReconcile=processedRows===validRows;
 const duplicateRowsReconcile=duplicates<=updated+skipped;
 const reconciliationIssues=[];
 if(!sourceRowsReconcile)reconciliationIssues.push('Source rows do not equal valid, rejected and excluded worksheet rows.');
 if(!committedRowsReconcile)reconciliationIssues.push('Valid rows do not equal inserted, updated and skipped rows.');
 if(!duplicateRowsReconcile)reconciliationIssues.push('Duplicate matches exceed updated and skipped rows.');
 const reconciled=reconciliationIssues.length===0;
 return {sourceRows,validRows,rejectedRows,excludedWorksheetRows,
  created:inserted,updated,skipped,duplicates,columnsCreated,groupsCreated,
  committedWrites,processedRows,reconciliationIssues,
  failedRows:reconciled?0:null,
  unreconciledRows:Math.max(0,validRows-processedRows),reconciled};
}
