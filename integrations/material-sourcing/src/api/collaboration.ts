import type { Task } from "../utils/material.ts";

export type CollaborationAction =
  | { kind: "task.add"; id: string; title: string }
  | {
      kind: "task.status";
      id: string;
      expected: Task["status"];
      status: Task["status"];
    }
  | { kind: "task.remove"; id: string; expected: Task["status"] }
  | { kind: "task.reorder"; expected: string[]; order: string[] }
  | {
      kind: "comment.add";
      id: string;
      text: string;
      parentId: string | null;
      mentions: string[];
    }
  | {
      kind: "comment.edit";
      id: string;
      expected: string | null;
      text: string;
      mentions: string[];
    }
  | { kind: "comment.remove"; id: string; expected: string | null };

export type CollaborationCommand = {
  action: "collaborate";
  materialId: string;
  operationId: string;
  change: CollaborationAction;
};
export type Collaborate = (
  change: CollaborationAction,
  operationId?: string,
) => Promise<boolean>;
