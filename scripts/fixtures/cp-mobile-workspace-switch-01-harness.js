import {
  closeWorkspacePanels,
  openWorkspaceSelector,
} from "/frontend/workspace-ui.js";

const root = document.getElementById("app");
const actorId = "10000000-0000-4000-8000-000000000001";
const workspaces = [
  {
    id: "20000000-0000-4000-8000-000000000001",
    name: "Main Workspace",
    relation: "owner",
  },
  {
    id: "20000000-0000-4000-8000-000000000002",
    name: "Operations Workspace",
    relation: "member",
  },
];
let activeWorkspaceId = workspaces[0].id;
let switchCount = 0;
const currentWorkspace = () =>
  workspaces.find((row) => row.id === activeWorkspaceId);
const lifecycle = {
  async discover() {
    return {
      status: "SIGNED_MEMBER_DISCOVERY",
      rows: workspaces.map((row) => ({
        ...row,
        privacy: "closed",
        active: row.id === activeWorkspaceId,
        verifiedScope: "SIGNED_MEMBER_RPC",
      })),
    };
  },
  async select(targetWorkspaceId, expectedWorkspaceId) {
    if (activeWorkspaceId !== expectedWorkspaceId) {
      const error = new Error("Stale workspace context");
      error.status = 409;
      throw error;
    }
    const previousWorkspaceId = activeWorkspaceId;
    activeWorkspaceId = targetWorkspaceId;
    return {
      workspaceId: targetWorkspaceId,
      previousWorkspaceId,
      switched: true,
    };
  },
};

root.addEventListener("click", (event) => {
  const trigger = event.target.closest('[data-action="ws01-open"]');
  if (!trigger) return;
  event.preventDefault();
  openWorkspaceSelector(
    { id: currentWorkspace().id, name: currentWorkspace().name },
    {
      lifecycle,
      signedUserId: actorId,
      switchingEnabled: true,
      configurationEnabled: false,
      invitationEnabled: false,
      managementEnabled: false,
      onOpenCurrent() {},
      async onWorkspaceSwitched(receipt, targetWorkspace) {
        if (receipt.workspaceId !== targetWorkspace.id) {
          throw new Error("Selection receipt and target did not match");
        }
        document.querySelector(".aps-sidebar .workspace-name").textContent =
          targetWorkspace.name;
        switchCount += 1;
        window.__workspaceSwitchResult = {
          count: switchCount,
          workspaceId: receipt.workspaceId,
          workspaceName: targetWorkspace.name,
        };
        closeWorkspacePanels();
      },
    },
  );
});
