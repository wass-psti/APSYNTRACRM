import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";

const server = await createServer({
  configFile: "vite.config.js",
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, strictPort: false },
});
let browser;

try {
  await server.listen();
  const address = server.httpServer.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });

  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${origin}/frontend/workspace-application-routing.js`, {
    waitUntil: "domcontentloaded",
  });

  const result = await page.evaluate(async () => {
    const [routing, ownership, identity] = await Promise.all([
      import("/frontend/workspace-application-routing.js"),
      import("/frontend/workspace-application-ownership.js"),
      import("/frontend/workspace-identity.js"),
    ]);
    const otherWorkspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const boards = ownership.WORK_MANAGEMENT_BOARD_APPLICATIONS.map(
      (application) => ({
        id: application.boardId,
        name: application.name,
      }),
    );
    const workManagement = routing.workspaceApplicationsForNavigation(
      identity.WORK_MANAGEMENT_WORKSPACE_ID,
      boards,
    );
    const otherWorkspace = routing.workspaceApplicationsForNavigation(
      otherWorkspaceId,
      boards,
    );
    const navigation = document.createElement("nav");
    navigation.setAttribute("aria-label", "Workspace applications");
    for (const application of workManagement) {
      const link = document.createElement("a");
      link.href = application.href;
      link.dataset.applicationId = application.id;
      link.textContent = application.label;
      navigation.append(link);
    }
    document.body.replaceChildren(navigation);

    const nativeRoutes = ownership.WORK_MANAGEMENT_APPLICATIONS.filter(
      (application) => application.routeKind !== "board",
    ).map((application) => `${application.route}/deep-link`);
    const boardRoutes = ownership.WORK_MANAGEMENT_BOARD_APPLICATIONS.map(
      (application) => `#/boards/${application.boardId}/items`,
    );
    const deniedRoutes = [...nativeRoutes, ...boardRoutes].filter(
      (route) =>
        routing.workspaceApplicationRouteAccess(route, otherWorkspaceId)
          .allowed,
    );
    const allowedRoutes = [...nativeRoutes, ...boardRoutes].filter(
      (route) =>
        !routing.workspaceApplicationRouteAccess(
          route,
          identity.WORK_MANAGEMENT_WORKSPACE_ID,
        ).allowed,
    );
    return {
      workManagementCount: workManagement.length,
      workManagementIds: workManagement.map((application) => application.id),
      foreignWorkspaceCount: otherWorkspace.length,
      renderedLinkCount: navigation.querySelectorAll("a").length,
      deniedForeignRoutes: deniedRoutes.length,
      deniedOwnerRoutes: allowedRoutes.length,
      ordinaryRouteAllowed: routing.workspaceApplicationRouteAccess(
        "#/overview",
        otherWorkspaceId,
      ).allowed,
      customBoardRouteAllowed: routing.workspaceApplicationRouteAccess(
        "#/boards/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/items",
        otherWorkspaceId,
      ).allowed,
      talkboxDependencyRetained: workManagement.some(
        (application) =>
          application.id === "talkbox" && application.href === "#/talkbox",
      ),
    };
  });

  assert.equal(result.workManagementCount, 15);
  assert.equal(result.foreignWorkspaceCount, 0);
  assert.equal(result.renderedLinkCount, 15);
  assert.equal(result.deniedForeignRoutes, 0);
  assert.equal(result.deniedOwnerRoutes, 0);
  assert.equal(result.ordinaryRouteAllowed, true);
  assert.equal(result.customBoardRouteAllowed, true);
  assert.equal(result.talkboxDependencyRetained, true);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileLinkCount = await page
    .locator('nav[aria-label="Workspace applications"] a')
    .count();
  assert.equal(mobileLinkCount, 15);
  assert.deepEqual(pageErrors, []);

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        browser: "Chromium",
        desktopViewport: "1440x900",
        mobileViewport: "390x844",
        ...result,
        mobileLinkCount,
        pageErrors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  await server.close();
}
