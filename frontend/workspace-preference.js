/** Account-specific last-selected workspace preference for this browser profile. */
const PREFIX = "apsyntra.crm.workspace.preference.v1:";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validUuid(value) {
  return typeof value === "string" && UUID.test(value);
}
function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function workspacePreferenceKey(userId) {
  if (!validUuid(userId)) return null;
  return PREFIX + userId.toLowerCase();
}

export function readWorkspacePreference(userId, storage = browserStorage()) {
  const key = workspacePreferenceKey(userId);
  if (!key || !storage) return null;
  try {
    const workspaceId = storage.getItem(key);
    return validUuid(workspaceId) ? workspaceId.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function writeWorkspacePreference(
  userId,
  workspaceId,
  storage = browserStorage(),
) {
  const key = workspacePreferenceKey(userId);
  if (!key || !validUuid(workspaceId) || !storage) return false;
  try {
    storage.setItem(key, workspaceId.toLowerCase());
    return true;
  } catch {
    return false;
  }
}

export function watchWorkspacePreference({
  onChange,
  window = globalThis.window,
} = {}) {
  if (
    typeof onChange !== "function" ||
    typeof window?.addEventListener !== "function"
  )
    return () => {};
  const handleStorage = (event) => {
    if (
      typeof event?.key !== "string" ||
      !event.key.startsWith(PREFIX) ||
      typeof event.newValue !== "string" ||
      !validUuid(event.newValue)
    )
      return;
    const userId = event.key.slice(PREFIX.length);
    if (!validUuid(userId)) return;
    onChange({
      userId: userId.toLowerCase(),
      workspaceId: event.newValue.toLowerCase(),
    });
  };
  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
}

export { validUuid as isWorkspacePreferenceUuid };

/** Restore a saved choice through the existing signed workspace lifecycle. */
export async function restoreWorkspacePreference({
  auth,
  lifecycle,
  api,
  storage = browserStorage(),
} = {}) {
  const actor = auth?.userId;
  const preferred = readWorkspacePreference(actor, storage);
  if (!auth?.isSignedIn || !actor || !preferred)
    return { status: "NO_PREFERENCE" };
  let catalog;
  try {
    catalog = await lifecycle?.discover?.();
  } catch (error) {
    return { status: "UNAVAILABLE", error };
  }
  if (
    !auth.isSignedIn ||
    auth.userId !== actor ||
    catalog?.status !== "SIGNED_MEMBER_DISCOVERY" ||
    !Array.isArray(catalog.rows)
  )
    return { status: "UNAVAILABLE" };
  const active = catalog.rows.filter(
    (row) => row.active === true && row.verifiedScope === "SIGNED_MEMBER_RPC",
  );
  if (active.length !== 1) return { status: "UNAVAILABLE" };
  if (active[0].id === preferred) return { status: "ALREADY_ACTIVE" };
  const target = catalog.rows.find(
    (row) =>
      row.id === preferred &&
      row.active === false &&
      row.verifiedScope === "SIGNED_MEMBER_RPC",
  );
  if (!target) return { status: "PREFERENCE_UNAVAILABLE" };
  try {
    const receipt = await lifecycle.select(preferred, active[0].id);
    return receipt?.workspaceId === preferred &&
      receipt?.previousWorkspaceId === active[0].id &&
      receipt?.switched === true
      ? { status: "RESTORED" }
      : { status: "UNCONFIRMED" };
  } catch (error) {
    // A timeout may follow a committed selection. Read back once; never retry
    // the potentially committed selection RPC automatically.
    const confirmed = await Promise.resolve()
      .then(() => api?.context?.())
      .catch(() => null);
    if (confirmed?.user_id === actor && confirmed?.workspace_id === preferred)
      return { status: "RESTORED_AFTER_READBACK" };
    return { status: "FALLBACK", error };
  }
}
