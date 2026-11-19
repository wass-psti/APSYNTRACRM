/** CRM-native TimeTracker application route and existing-board discovery. */
export const TIMETRACKER_APPLICATION_ROUTE = "#/time-tracker";
export const TIMETRACKER_ATTENDANCE_BOARD_ID =
  "46bf4ee7-368a-4c35-842c-8593ea1f6ac3";

/** Prefer the canonical attendance board; never substitute a legacy board. */
export function findTimeTrackerAttendanceBoard(boards, resolveModule) {
  if (!Array.isArray(boards) || typeof resolveModule !== "function")
    return null;
  return (
    boards.find(
      (board) =>
        board?.id === TIMETRACKER_ATTENDANCE_BOARD_ID &&
        board.name === "TimeTracker Attendance" &&
        board.status === "active" &&
        resolveModule(board.name)?.key === "timetracker",
    ) || null
  );
}
