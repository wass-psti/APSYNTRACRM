# Material Request Hub — Reference-Aligned Add Material Form

Date: November 11, 2026.

## Visual contract

Material Sourcing has two in-app views: All items and Add Material. The Bulk Import option is removed from Material Tracker altogether.

The Add Material view follows the supplied reference's structure:
- White application header and a centered, responsive creation card.
- New Material heading and clear Identification, Pricing & Cost, and Supplier & Schedule sections.
- Item name, fixed Main group, Source Type, Brand, multiline description.
- Quantity, buying price, currency, shipping cost/currency, lead time.
- Vendor details, date required and RFQ reference.
- Single Create action, Cancel back to All items, validation status, keyboard-accessible controls and mobile stacking.

The screenshot's Engineering Services group is reference content only. The authoritative Main group ID, title, and position are preserved.

## Data contract and safe creation

- Existing signed createMaterialSourcingPart flow creates the item in the original group and verifies it through a server board read. No synthetic records are created automatically.
- Public columns are resolved only from the currently approved ordinary sourcing columns. Missing public columns are shown disabled with a clear note, rather than accepting and losing data. The original Quantity column remains usable.
- Protected commercial fields (Buying Price, Currency, Shipping Cost, Shipping Cost Currency, Vendor Details) use the existing signed item-scoped writeProtectedSourcingField RPC and revision contract. Protected data never enters the ordinary table projection.
- The form validates all requested writes before item creation. Subsequent writes are performed in order. If a field write or readback cannot be confirmed after item creation, the form explicitly identifies the partial-state risk and prevents submitting a duplicate item.
- No fabricated exchange rates, currency conversions or financial totals.
- No backend schema, group, roles, grants, RLS or other workspace modules changed.

## Verified

- Full frontend test suite includes Add Material layout, original group preservation, public-column allowlist, protected value validation, action routing, no Bulk Import and uncertain-save behavior.
- Chromium responsive visual checks at 1485, 1024, 768, 480 and 375 pixels: all three form sections, responsive fields, no horizontal page overflow, immutable Main group and no Bulk Import.
- No genuine signed production creation was executed as part of this visual/frontend implementation.

## Remaining independent dependency

The six public sourcing columns have not yet been fully activated in the authoritative board schema. Their form controls remain disabled until the existing controlled activation process makes them available. Activating them is a separate production schema change, not a visual styling prerequisite.
