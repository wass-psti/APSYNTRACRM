import { useState } from "react";
import type { FxReference, Material } from "../utils/material";
import {parseBulkImport,splitTsv} from "../utils/bulkImport";
export default function BulkImport({onImport,reference,raw,setRaw,pending=false}:{
  reference?:FxReference|null;
  onImport:(items:Material[])=>boolean|Promise<boolean>;
  raw:string;setRaw:(raw:string)=>void;pending?:boolean;
}){
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);
  let count=0;try{count=splitTsv(raw).length;}catch{}
  return (
    <section className="surface import-form">
      <h2>Bulk import</h2>
      <p>
        Paste tab-separated rows from a spreadsheet without a header. All rows
        must pass validation before import.
      </p>
      <pre>
        Part number | Description | Brand | Source | Quantity | Buying price |
        Currency | Shipping | Ship currency | Vendor
      </pre>
      <textarea
        aria-label="Paste material rows"
        rows={12}
        placeholder={
          "PART-001\tControl relay\tDemo brand\tLocal\t2\t150\tPHP\t0\tPHP\tDemo supplier"
        }
        value={raw}
        disabled={saving||pending}
        onChange={(e) => {
          setRaw(e.target.value);
          setError("");
        }}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button disabled={saving||pending}
          onClick={() => {
            setRaw(
              "PART-001\tControl relay\tDemo brand\tLocal\t2\t150\tPHP\t0\tPHP\tDemo supplier",
            );
            setError("");
          }}
        >
          Use example
        </button>
        <button
          className="primary"
          disabled={saving||pending}
          onClick={async () => {
            setSaving(true);
            try {
              if (await onImport(parseBulkImport(raw,reference))) setRaw("");
              else setError("Import not confirmed. Input retained.");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          Import {count || ""} rows
        </button>
      </div>
    </section>
  );
}
