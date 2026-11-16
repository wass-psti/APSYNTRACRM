import { map } from "nanostores";

export const fm1Store = map({
  scopeKey: "",
  view: "overview",
  drafts: [],
  draftsLoaded: false,
  busy: false,
  notice: "",
  error: "",
});
