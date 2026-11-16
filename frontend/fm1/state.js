const listeners = new Set();

let state = Object.freeze({
  scopeKey: "",
  view: "overview",
  drafts: [],
  draftsLoaded: false,
  busy: false,
  notice: "",
  error: "",
});

function notify() {
  for (const listener of [...listeners]) {
    listener(state);
  }
}

export const fm1Store = Object.freeze({
  get() {
    return state;
  },

  set(nextState) {
    state = Object.freeze({ ...nextState });
    notify();
    return state;
  },

  setKey(key, value) {
    if (Object.is(state[key], value)) return state;
    state = Object.freeze({ ...state, [key]: value });
    notify();
    return state;
  },

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("FM1 store subscriber must be a function.");
    }
    listeners.add(listener);
    listener(state);
    return () => listeners.delete(listener);
  },
});
