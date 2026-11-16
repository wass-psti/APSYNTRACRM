/** CRM-native TimeTracker application route and existing-board discovery. */
export const TIMETRACKER_APPLICATION_ROUTE = "#/time-tracker";

/** Resolve the existing attendance board; this never creates or provisions a board. */
export function findTimeTrackerAttendanceBoard(boards, resolveModule) {
  if (!Array.isArray(boards) || typeof resolveModule !== "function")
    return null;
  return (
    boards.find((board) => resolveModule(board?.name)?.key === "timetracker") ||
    null
  );
}
