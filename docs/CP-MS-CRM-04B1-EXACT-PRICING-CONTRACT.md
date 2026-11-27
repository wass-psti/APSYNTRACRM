# CP-MS-CRM-04B.1 — exact pricing engine and calculation contract

The approved independent repository checkpoint does not close the earlier
CP-MS-CRM-04A genuine signed runtime gate. Production activation is not part
of this candidate. No material rows, legacy rates, selling prices, grants,
roles or frontend behavior are changed.

## Contract

The pure PostgreSQL function private.mrh_calculate_pricing_v1(jsonb)
returns a versioned calculation envelope. It accepts quantity, buyingPrice,
currency, shipping, shipCurrency, usd, eur and optional source. All numeric
inputs must be plain nonnegative decimal strings, not JavaScript numbers;
quantity and both FX rates must be positive. Quantity and monetary inputs
match the standalone NUMERIC(20,6) domain; rates match NUMERIC(20,8).
Reject excess precision rather than round inputs. PHP/USD/EUR only.
Both rates remain required even for PHP-only items, matching the existing
paired FX contract. No default rates, date or provenance are invented.
The server must extract existing JSON numeric values as exact text before
any browser number conversion. That extraction and source revision binding
are future integration work, not implemented here.

Status complete = all inputs valid and source Local/Import. Partial =
landed costs valid but source missing, Unknown or unsupported legacy
string; selling and VAT-IN remain JSON null. Incomplete = required input
missing or null; no costs. Invalid = malformed, unknown field, bad type,
range or precision; no costs. Invalid takes precedence over missing; both
field arrays remain available. Costs use exact two-decimal strings.
The historical manually stored Selling Price (VAT-EX) is not an input or
a destination of this calculator. The caller must present it separately.

Calculate buying and shipping PHP equivalents independently, round each
to two decimal places; sum for landed unit cost; round landed times
quantity for total landed. Round landed times 1.30 Local or 1.69 Import for
unit selling; round selling times quantity times 1.12 for total VAT-IN.
These are existing reference markups and VAT factor, not live FX or a new
tax policy. No floating-point calculation, storage, external provider,
training, or model dependencies. Function is immutable and invoker-mode.

## Acceptance

Reuse pinned disposable PostgreSQL and standalone material_costs as
independent oracle for 81 source/currency/rounding cases. Additional
fixtures cover missing/null/invalid inputs, zero, unknown source, decimal
scale boundaries, exact large amounts, paired-rate semantics, historical
selling separation and deterministic receipts. Existing reconciliation,
CRUD and prior pricing tests remain in CI. Candidate lives outside the
production migration directory; no public RPC. B.2 must introduce verified
immutable FX provenance, B.3 must bind authoritative input/FX versions in
the atomic transaction, B.4 must display exact strings without numeric
coercion. Production activation remains subject to explicit approval and
signed CRUD/pricing acceptance. No operational data movement.
