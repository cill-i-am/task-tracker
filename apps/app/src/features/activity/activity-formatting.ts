import type { JobActivityPayload } from "@task-tracker/jobs-core";

const PRIORITY_LABELS = {
  none: "No priority",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
} as const;

const STATUS_LABELS = {
  blocked: "Blocked",
  canceled: "Canceled",
  completed: "Completed",
  in_progress: "In progress",
  new: "New",
  triaged: "Triaged",
} as const;

export function describeJobActivity(
  actorName: string | undefined,
  payload: JobActivityPayload
) {
  const actorPrefix = actorName ? `${actorName} ` : "";

  switch (payload.eventType) {
    case "assignee_changed": {
      return `${actorPrefix}updated the assignee.`;
    }
    case "blocked_reason_changed": {
      return `${actorPrefix}updated the blocked reason.`;
    }
    case "contact_changed": {
      return `${actorPrefix}updated the contact.`;
    }
    case "coordinator_changed": {
      return `${actorPrefix}updated the coordinator.`;
    }
    case "job_created": {
      return `${actorPrefix}created the job.`;
    }
    case "job_reopened": {
      return `${actorPrefix}reopened the job.`;
    }
    case "priority_changed": {
      return `${actorPrefix}changed priority from ${PRIORITY_LABELS[payload.fromPriority]} to ${PRIORITY_LABELS[payload.toPriority]}.`;
    }
    case "site_changed": {
      return `${actorPrefix}updated the site.`;
    }
    case "status_changed": {
      return `${actorPrefix}changed status from ${STATUS_LABELS[payload.fromStatus]} to ${STATUS_LABELS[payload.toStatus]}.`;
    }
    case "visit_logged": {
      return `${actorPrefix}logged a visit.`;
    }
    default: {
      return assertNever(payload);
    }
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled job activity payload: ${JSON.stringify(value)}`);
}
