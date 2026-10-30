/** CP-HULY-SB07: bounded, fail-closed native Huly Issue update operators.
 * Reference: foundations/core/packages/core/src/operator.ts and tx.ts (EPL-2.0).
 * Only direct fields are accepted; nested paths and client-supplied JS prototypes are not.
 */
import { Denied } from './sb02.js';
const RESERVED = new Set(['_id', '_class', 'space', 'attachedTo', 'attachedToClass', 'collection', 'createdBy', 'createdOn', 'modifiedBy', 'modifiedOn', 'parents', 'subIssues']);
const KEY = /^[A-Za-z][A-Za-z0-9_]{0,95}$/;
const OPERATORS = new Set(['$inc', '$unset', '$push', '$pull', '$update', '$rename']);
type JsonObject = Record<string, unknown>;
function object(v: unknown): v is JsonObject { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function key(name: string): void {
  if (!KEY.test(name) || RESERVED.has(name) || name === 'constructor' || name === 'prototype' || name === '__proto__') throw new Denied();
}
function clone<T>(v: T): T {
  let raw: string | undefined;
  try { raw = JSON.stringify(v); } catch { throw new Denied(); }
  if (raw === undefined || new TextEncoder().encode(raw).length > 225000) throw new Denied();
  return JSON.parse(raw) as T;
}
function numeric(v: unknown): v is number { return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER; }
function equivalent(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }
function safeFields(v: unknown, nonempty = true): asserts v is JsonObject {
  if (!object(v) || (nonempty && Object.keys(v).length === 0)) throw new Denied();
  for (const k of Object.keys(v)) key(k);
}
/** Query-based embedded array updates mirror Huly's $update equality matching.
 * For security, this subset accepts primitive query values and direct embedded keys.
 */
function embeddedUpdate(current: unknown, value: unknown): unknown[] {
  if (!Array.isArray(current) || current.length > 10000 || current.some(item => !object(item)) || !object(value) || Object.keys(value).some(k => !['$query', '$update'].includes(k))) throw new Denied();
  safeFields(value.$query);
  safeFields(value.$update);
  const query = value.$query, updates = value.$update;
  for (const v of Object.values(query)) if (v !== null && typeof v === 'object') throw new Denied();
  return current.map((item: unknown) => {
    if (!object(item) || !Object.entries(query).every(([k, v]) => equivalent(item[k], v))) return item;
    return {...item, ...clone(updates)};
  });
}
/** Applies a validated operator map without mutating the original snapshot. */
export function applyIssueOperations(source: JsonObject, operations: unknown): JsonObject {
  if (!object(operations) || Object.keys(operations).length === 0) throw new Denied();
  const doc = clone(source);
  const touched = new Set<string>();
  const claim = (k: string): void => { key(k); if (touched.has(k)) throw new Denied(); touched.add(k); };
  for (const [operator, fields] of Object.entries(operations)) {
    if (!operator.startsWith('$')) { claim(operator); doc[operator] = clone(fields); continue; }
    if (!OPERATORS.has(operator) || !object(fields) || Object.keys(fields).length === 0) throw new Denied();
    for (const [field, input] of Object.entries(fields)) {
      claim(field);
      const current = doc[field];
      switch (operator) {
        case '$inc': {
          if (!numeric(input) || (current !== undefined && !numeric(current))) throw new Denied();
          const result = (current === undefined ? 0 : current as number) + input;
          if (!numeric(result)) throw new Denied();
          doc[field] = result;
          break;
        }
        case '$unset': {
          if (input !== true && input !== 1) throw new Denied();
          delete doc[field];
          break;
        }
        case '$push': {
          if (current !== undefined && !Array.isArray(current)) throw new Denied();
          let items: unknown[]; let position = 0;
          if (object(input) && Object.hasOwn(input, '$each')) {
            if (!Array.isArray(input.$each) || Object.keys(input).some(k => k !== '$each' && k !== '$position')) throw new Denied();
            items = input.$each;
            if (input.$position !== undefined) {
              if (!Number.isSafeInteger(input.$position) || Number(input.$position) < 0) throw new Denied();
              position = Number(input.$position);
            }
          } else { items = [input]; position = Array.isArray(current) ? current.length : 0; }
          const arr = current === undefined ? [] : [...current];
          if (position > arr.length || arr.length + items.length > 10000) throw new Denied();
          arr.splice(position, 0, ...clone(items)); doc[field] = arr;
          break;
        }
        case '$pull': {
          if (current === undefined) { doc[field] = []; break; }
          if (!Array.isArray(current)) throw new Denied();
          if (object(input)) {
            if (Object.hasOwn(input, '$in')) {
              if (!Array.isArray(input.$in) || Object.keys(input).length !== 1) throw new Denied();
              const targets = input.$in as unknown[];
              doc[field] = current.filter(v => !targets.some(target => equivalent(v, target)));
            } else {
              safeFields(input);
              for (const v of Object.values(input)) if (v !== null && typeof v === 'object') throw new Denied();
              doc[field] = current.filter(v => !object(v) || !Object.entries(input).every(([k, target]) => equivalent(v[k], target)));
            }
          } else { doc[field] = current.filter(v => !equivalent(v, input)); }
          break;
        }
        case '$update': { doc[field] = embeddedUpdate(current === undefined ? [] : current, input); break; }
        case '$rename': {
          if (typeof input !== 'string') throw new Denied();
          key(input);
          if (input === field || touched.has(input) || Object.hasOwn(doc, input)) throw new Denied();
          touched.add(input);
          if (Object.hasOwn(doc, field)) { doc[input] = doc[field]; delete doc[field]; }
          break;
        }
      }
    }
  }
  clone(doc); // reject oversized result, including array expansion
  return doc;
}
