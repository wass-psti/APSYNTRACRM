# Temporary ChatGPT/Codex Annotate CSP compatibility

**Scope:** The static APSYNTRA CRM GitHub Pages frontend only. **Status:** Temporary development workaround, not a browser fix or annotation acceptance result.

## Rationale

The ChatGPT/Codex built-in browser may render a tiny centered square instead of its annotation cursor when the page uses `style-src 'self'` and blocks the overlay's injected stylesheet. APSYNTRA CRM had that exact meta CSP. Similar behavior is documented in [openai/codex#36222](https://github.com/openai/codex/issues/36222) and [openai/codex#52941](https://github.com/openai/codex/issues/52941). This is supported by independent reproductions, but must still be retested in the actual APSYNTRA CRM signed-in browser.

## Temporary CSP diff

Only in `index.html`:

```diff
- style-src 'self';
+ style-src 'self' 'unsafe-inline'; style-src-attr 'none';
```

This allows the desktop annotation overlay's dynamic inline stylesheet while continuing to reject inline **style attributes**. **Inline scripts remain blocked** through `script-src 'self'`. The existing `default-src`, `connect-src`, `object-src`, `frame-src`, `base-uri`, `form-action`, and image/font policies are unchanged. Existing Supabase Auth, central RBAC, and RLS are not modified.

The exception expands the page's accepted CSS and can facilitate CSS injection if another vulnerability exists. It is knowingly authorized only for the development phase; do not treat it as a permanent production security baseline.

## Validation gates

- Run `node --test frontend/tests/*.test.mjs` and `node scripts/verify-pages-source.mjs` in CI.
- Confirm GitHub Pages deployment points to the merge commit and re-read the shipped `index.html` to verify the CSP exactly.
- In the ChatGPT desktop built-in browser, **hard reload** APSYNTRA CRM, activate Annotate, verify the centered square is gone, check cursor/element/region selection, and submit a short test annotation to the chat. Report any remaining problem before broader changes.
- If annotation still fails, restore the old CSP rather than relaxing `script-src` or allowing arbitrary hosts.
- After an upstream browser fix, replace `style-src 'self' 'unsafe-inline'; style-src-attr 'none';` with the original `style-src 'self';` and restore the strict CSP regression test.

**No backend or production data changes.** The workaround does not add a dependency or access another user's information.
