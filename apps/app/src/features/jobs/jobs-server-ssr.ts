import type {
  JobDetailResponse,
  JobExternalMemberOptionsResponse,
  JobListItem,
  JobListQuery,
  JobListResponse,
  JobMemberOptionsResponse,
  JobOptionsResponse,
  OrganizationActivityListResponse,
  OrganizationActivityQuery,
  WorkItemIdType,
} from "@ceird/jobs-core";

import { AppApiRequestError } from "#/features/api/app-api-errors";
import { runAppApiClient } from "#/features/api/app-api-server-client";
import { readServerAppApiRequestStrict } from "#/features/api/app-api-server-ssr";

const MAX_ALL_JOB_PAGES = 1000;

export async function listCurrentServerJobsDirect(
  query: JobListQuery = {}
): Promise<JobListResponse> {
  const request = await readServerAppApiRequestStrict();

  return await runAppApiClient(request, "JobsServer.listJobs", (client) =>
    client.jobs.listJobs({
      urlParams: query,
    })
  );
}

export async function listAllCurrentServerJobsDirect(
  query: JobListQuery = {}
): Promise<JobListResponse> {
  const request = await readServerAppApiRequestStrict();
  const items: JobListItem[] = [];
  const { cursor: initialCursor, ...staticQuery } = query;
  const seenCursors = new Set<string>();
  let cursor = initialCursor;
  let pageCount = 0;

  if (cursor !== undefined) {
    seenCursors.add(cursor);
  }

  while (true) {
    pageCount += 1;
    ensureJobPageLimit(pageCount);

    const urlParams = cursor ? { ...staticQuery, cursor } : staticQuery;
    // Cursor pagination must await each page before requesting its next cursor.
    // react-doctor-disable-next-line
    const page = await runAppApiClient(
      request,
      "JobsServer.listAllJobs.page",
      (client) =>
        client.jobs.listJobs({
          urlParams,
        })
    );

    items.push(...page.items);

    if (!page.nextCursor) {
      return {
        items,
        nextCursor: undefined,
      };
    }

    ensureJobCursorProgress(page.nextCursor, seenCursors);
    cursor = page.nextCursor;
  }
}

export async function listCurrentServerOrganizationActivityDirect(
  query: OrganizationActivityQuery = {}
): Promise<OrganizationActivityListResponse> {
  const request = await readServerAppApiRequestStrict();

  return await runAppApiClient(
    request,
    "JobsServer.listOrganizationActivity",
    (client) =>
      client.jobs.listOrganizationActivity({
        urlParams: query,
      })
  );
}

export async function getCurrentServerJobDetailDirect(
  workItemId: WorkItemIdType
): Promise<JobDetailResponse> {
  const request = await readServerAppApiRequestStrict();

  return await runAppApiClient(request, "JobsServer.getJobDetail", (client) =>
    client.jobs.getJobDetail({ path: { workItemId } })
  );
}

export async function getCurrentServerJobOptionsDirect(): Promise<JobOptionsResponse> {
  const request = await readServerAppApiRequestStrict();

  return await runAppApiClient(request, "JobsServer.getJobOptions", (client) =>
    client.jobs.getJobOptions()
  );
}

export async function getCurrentServerJobMemberOptionsDirect(): Promise<JobMemberOptionsResponse> {
  const request = await readServerAppApiRequestStrict();

  return await runAppApiClient(
    request,
    "JobsServer.getJobMemberOptions",
    (client) => client.jobs.getJobMemberOptions()
  );
}

export async function getCurrentServerJobExternalMemberOptionsDirect(): Promise<JobExternalMemberOptionsResponse> {
  const request = await readServerAppApiRequestStrict();

  return await runAppApiClient(
    request,
    "JobsServer.getJobExternalMemberOptions",
    (client) => client.jobs.getJobExternalMemberOptions()
  );
}

function ensureJobPageLimit(pageCount: number) {
  if (pageCount > MAX_ALL_JOB_PAGES) {
    throw new AppApiRequestError({
      message: "Job pagination exceeded the maximum page count.",
    });
  }
}

function ensureJobCursorProgress(
  nextCursor: NonNullable<JobListResponse["nextCursor"]>,
  seenCursors: Set<string>
) {
  if (seenCursors.has(nextCursor)) {
    throw new AppApiRequestError({
      message: "Job pagination returned a repeated cursor.",
    });
  }

  seenCursors.add(nextCursor);
}
