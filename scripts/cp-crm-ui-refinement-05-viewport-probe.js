/* Read-only UI sampling in the existing signed CRM tab.
 * Never extracts identity tokens or changes application records.
 */
(() => {
  if (window.__crmUI05?.status === "running") return "AUDIT_ALREADY_RUNNING";
  const routes = [
    "#/overview",
    "#/boards",
    "#/fm1",
    "#/time-tracker",
    "#/fund-tracker",
    "#/fueltrack",
    "#/tradelink",
    "#/talkbox",
    "#/user-role-management",
    "#/settings",
  ];
  const initialRoute = location.hash;
  const report = {
    status: "running",
    initialRoute,
    width: innerWidth,
    screenWidth: screen.width,
    visibility: document.visibilityState,
    routes: [],
    errors: [],
  };
  window.__crmUI05 = report;
  const pause = (duration) =>
    new Promise((resolve) => setTimeout(resolve, duration));

  (async () => {
    try {
      if (document.visibilityState !== "visible") {
        report.errors.push("CURRENT_TAB_NOT_VISIBLE");
        return;
      }
      for (const requested of routes) {
        location.hash = requested;
        await pause(1000);
        if (document.visibilityState !== "visible") {
          report.errors.push("TAB_LOST_FOREGROUND");
          break;
        }
        const app = document.querySelector("#app");
        const scrollables = [...(app?.querySelectorAll("*") || [])]
          .filter((el) => {
            const css = getComputedStyle(el);
            return (
              ["auto", "scroll"].includes(css.overflowX) &&
              el.scrollWidth > el.clientWidth + 2
            );
          })
          .slice(0, 12)
          .map((el) => ({
            className: String(el.className || el.tagName).slice(0, 65),
            viewport: el.clientWidth,
            content: el.scrollWidth,
          }));
        const documentOverflow = Math.max(
          0,
          document.documentElement.scrollWidth - innerWidth,
        );
        const dialogs = [
          ...document.querySelectorAll('[role="dialog"],dialog'),
        ].filter((el) => el.getBoundingClientRect().height > 0).length;
        const visibleButtons = [
          ...(app?.querySelectorAll("button:not(:disabled)") || []),
        ].filter((el) => {
          const box = el.getBoundingClientRect();
          return box.width > 0 && box.height > 0;
        });
        report.routes.push({
          requested,
          actual: location.hash,
          width: innerWidth,
          documentOverflow,
          scrollables,
          dialogs,
          buttons: visibleButtons.length,
          headings:
            app?.querySelector("h1")?.textContent?.trim().slice(0, 90) || null,
        });
      }
    } catch (error) {
      report.errors.push(String(error?.message || error).slice(0, 180));
    } finally {
      location.hash = initialRoute;
      report.status = "complete";
    }
  })();
  return "LIVE_VIEWPORT_AUDIT_STARTED";
})();
