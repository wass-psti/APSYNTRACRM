import { useState, type FormEvent } from "react";
import { readDraft, saveDraft, clearDraft } from "../utils/drafts";
import {
  previewCosts,
  decimalInput,
  withDecimalInput,
  type FxReference,
  currencies,
  groups,
  money,
  validate,
  type Material,
} from "../utils/material";
type Props = {
  initial: Material;
  onSave: (item: Material) => boolean | Promise<boolean>;
  onCancel?: () => void;
  draftKey?: string;
  reference?: FxReference | null;
};
export default function MaterialForm({
  initial,
  onSave,
  onCancel,
  reference,
  draftKey = onCancel ? initial.id : "new",
}: Props) {
  const [recovered, setRecovered] = useState(() => !!readDraft(draftKey));
  const [item, setItem] = useState(() => ({
    ...initial,
    ...readDraft(draftKey),
  }));
  const [draftError, setDraftError] = useState("");
  const [dirty, setDirty] = useState(recovered);
  const [error, setError] = useState("");
  function change<K extends keyof Material>(
    key: K,
    value: Material[K],
    raw?: string,
  ) {
    if (saving) return;
    const next =
      raw === undefined
        ? { ...item, [key]: value }
        : withDecimalInput(
            item,
            key as "quantity" | "buyingPrice" | "shipping" | "leadWeeks",
            raw,
          );
    setItem(next);
    setDirty(true);
    try {
      saveDraft(draftKey, next);
      setDraftError("");
    } catch {
      setDraftError("Draft could not be stored in this browser.");
    }
    setError("");
  }
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const problem = validate(item);
    if (problem) {
      setError(problem);
      return;
    }
    if (draftKey.startsWith("database.")) {
      try {
        saveDraft(draftKey, item);
      } catch {
        setDraftError("Draft could not be stored in this browser.");
      }
    }
    setSaving(true);
    let success = false;
    try {
      success = await onSave({ ...pricedItem, name: item.name.trim() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
    if (!success) {
      setError(
        "Save not confirmed. Your input is retained. Review database state before retrying.",
      );
      return;
    }
    try {
      clearDraft(draftKey);
    } catch {
      setDraftError("Draft could not be cleared.");
    }
  }
  function discard() {
    try {
      clearDraft(draftKey);
      setDraftError("");
    } catch {
      setDraftError("Draft could not be cleared.");
    }
    setItem(initial);
    setRecovered(false);
    setDirty(false);
    setError("");
  }
  const pricedItem =
    reference && !onCancel
      ? {
          ...item,
          usd: Number(reference.usd),
          eur: Number(reference.eur),
          decimalInputs: {
            ...item.decimalInputs,
            usd: reference.usd,
            eur: reference.eur,
          },
          expectedFxId: reference.id,
        }
      : item;
  const c = previewCosts(pricedItem);
  const field = (
    label: string,
    key: "name" | "brand" | "vendor" | "rfq" | "account" | "supplierPo",
    placeholder = "",
    required = false,
  ) => (
    <label>
      <span>
        {label}
        {required && <b className="required"> *</b>}
      </span>
      <input
        required={required}
        value={item[key]}
        placeholder={placeholder}
        onChange={(e) => change(key, e.target.value)}
      />
    </label>
  );
  const number = (
    label: string,
    key: "quantity" | "buyingPrice" | "shipping" | "leadWeeks",
    required = false,
  ) => (
    <label>
      <span>
        {label}
        {required && <b className="required"> *</b>}
      </span>
      <input
        type="number"
        min={key === "quantity" ? "0.000001" : "0"}
        step="any"
        required={required}
        value={decimalInput(item, key) ?? ""}
        onChange={(e) =>
          change(
            key,
            e.target.value === "" && key === "leadWeeks"
              ? null
              : Number(e.target.value),
            e.target.value,
          )
        }
      />
    </label>
  );
  return (
    <form className="material-form" onSubmit={submit}>
      {recovered && (
        <div className="draft-banner" role="status">
          Unsaved draft restored.{" "}
          <button disabled={saving} type="button" onClick={discard}>
            Discard draft
          </button>
        </div>
      )}
      {draftError && (
        <p className="error" role="alert">
          {draftError}
        </p>
      )}
      <section>
        <h3>◇ Identification</h3>
        <div className="fields">
          {field("Part number", "name", "Part number", true)}
          <label>
            Group
            <select
              value={item.group}
              onChange={(e) =>
                change("group", e.target.value as Material["group"])
              }
            >
              {groups.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <label>
            <span>
              Source type <b className="required">*</b>
            </span>
            <select
              required
              value={item.source === "Unknown" ? "" : item.source}
              onChange={(e) =>
                change("source", e.target.value as Material["source"])
              }
            >
              <option value="" disabled>
                Select…
              </option>
              <option>Local</option>
              <option>Import</option>
            </select>
          </label>
          {field("Brand", "brand", "Manufacturer", true)}
          <label className="wide">
            <span>
              Material description <b className="required">*</b>
            </span>
            <textarea
              required
              rows={3}
              value={item.description}
              placeholder="Full material specification…"
              onChange={(e) => change("description", e.target.value)}
            />
          </label>
        </div>
      </section>
      <section>
        <h3>＄ Pricing &amp; cost</h3>
        <div className="fields">
          {number("Quantity", "quantity", true)}
          {number("Buying price", "buyingPrice", true)}
          <label>
            <span>
              Currency <b className="required">*</b>
            </span>
            <select
              value={item.currency}
              onChange={(e) =>
                change("currency", e.target.value as Material["currency"])
              }
            >
              {currencies.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          {number("Shipping cost / unit", "shipping")}
          <label>
            Ship. currency
            <select
              value={item.shipCurrency}
              onChange={(e) =>
                change(
                  "shipCurrency",
                  e.target.value as Material["shipCurrency"],
                )
              }
            >
              {currencies.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <small className="wide">
            {draftKey.startsWith("database.")
              ? "Stored reference rates"
              : "Demo rates"}
            : USD ₱{money(decimalInput(pricedItem, "usd"))} · EUR ₱
            {money(decimalInput(pricedItem, "eur"))}
          </small>
        </div>
        <div className="cost-preview">
          <span>
            Landed / unit<strong>₱{money(c.landed)}</strong>
          </span>
          <span>
            Selling / unit (VAT-ex)<strong>₱{money(c.selling)}</strong>
          </span>
          <span>
            Total landed<strong>₱{money(c.totalLanded)}</strong>
          </span>
        </div>
      </section>
      <section>
        <h3>◷ Supplier &amp; schedule</h3>
        <div className="fields">
          {number("Lead time (weeks)", "leadWeeks")}
          <label>
            Date required
            <input
              type="date"
              value={item.requiredDate}
              onChange={(e) => change("requiredDate", e.target.value)}
            />
          </label>
          {field("Vendor details", "vendor", "Supplier")}
          {field("RFQ ref no", "rfq", "Reference number")}
          {field("Account", "account")}
          {field("Supplier PO", "supplierPo")}
        </div>
      </section>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <footer className="actions">
        <button className="primary" type="submit" disabled={saving}>
          {onCancel ? "Save changes" : "+ Add material"}
        </button>
        {!onCancel && dirty && (
          <button disabled={saving} type="button" onClick={discard}>
            Discard draft
          </button>
        )}
        {onCancel && (
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              discard();
              onCancel();
            }}
          >
            Cancel
          </button>
        )}
      </footer>
    </form>
  );
}
