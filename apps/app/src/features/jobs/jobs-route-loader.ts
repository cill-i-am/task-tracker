import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";
import type {
  JobContactOption,
  JobDetailResponse,
  JobListResponse,
  JobOptionsResponse,
  UserIdType,
} from "@ceird/jobs-core";
import type { Label } from "@ceird/labels-core";
import type { ServiceAreaOption, SiteOption } from "@ceird/sites-core";
import { Cause, Effect, Exit } from "effect";

import { observeAppRouteOperation } from "#/features/api/app-route-observability";
import {
  getCurrentServerJobDetail,
  getCurrentServerJobOptions,
  listAllCurrentServerJobs,
} from "#/features/jobs/jobs-server";
import {
  canUseInternalJobOptions,
  decodeJobsViewerUserId,
  isExternalJobsViewer,
} from "#/features/jobs/jobs-viewer";
import type { JobsViewer } from "#/features/jobs/jobs-viewer";
import type { ActiveOrganizationSync } from "#/features/organizations/organization-access";
import {
  ensureActiveOrganizationId,
  getCurrentOrganizationMemberRole,
} from "#/features/organizations/organization-access";

const EMPTY_JOBS_OPTIONS: JobOptionsResponse = {
  contacts: [],
  labels: [],
  members: [],
  serviceAreas: [],
  sites: [],
};

const EMPTY_JOBS_LIST: JobListResponse = {
  items: [],
  nextCursor: undefined,
};
const EXTERNAL_JOB_DETAIL_CONCURRENCY = 4;

interface JobsRouteOrganizationAccess {
  readonly activeOrganizationId: OrganizationId;
  readonly activeOrganizationSync: ActiveOrganizationSync;
  readonly currentOrganizationRole?: OrganizationRole | undefined;
  readonly currentUserId: UserIdType;
}

function toJobsRouteOrganizationAccess(
  organizationAccess: Awaited<ReturnType<typeof ensureActiveOrganizationId>>
): JobsRouteOrganizationAccess {
  return {
    activeOrganizationId: organizationAccess.activeOrganizationId,
    activeOrganizationSync: organizationAccess.activeOrganizationSync,
    currentUserId: decodeJobsViewerUserId(organizationAccess.session.user.id),
  };
}

export async function loadJobsRouteData(
  organizationAccess?: JobsRouteOrganizationAccess
) {
  return await observeAppRouteOperation(
    {
      activeOrganizationSyncRequired:
        organizationAccess?.activeOrganizationSync.required,
      currentOrganizationRole: organizationAccess?.currentOrganizationRole,
      operation: "loadJobsRouteData",
      routeId: "/jobs",
    },
    async () => {
      const resolvedOrganizationAccess =
        organizationAccess ??
        toJobsRouteOrganizationAccess(await ensureActiveOrganizationId());

      if (resolvedOrganizationAccess.activeOrganizationSync.required) {
        return {
          list: EMPTY_JOBS_LIST,
          options: EMPTY_JOBS_OPTIONS,
          viewer: {
            role: "member",
            userId: resolvedOrganizationAccess.currentUserId,
          } satisfies JobsViewer,
        };
      }

      const listPromise = listAllCurrentServerJobs({});
      const activeRole = await resolveJobsRouteOrganizationRole(
        resolvedOrganizationAccess
      );
      const viewer = {
        role: activeRole,
        userId: resolvedOrganizationAccess.currentUserId,
      } satisfies JobsViewer;
      const internalOptionsPromise = canUseInternalJobOptions(viewer)
        ? getCurrentServerJobOptions()
        : undefined;
      const list = await listPromise;
      let options = EMPTY_JOBS_OPTIONS;

      if (internalOptionsPromise) {
        options = await internalOptionsPromise;
      } else if (isExternalJobsViewer(viewer)) {
        options = await loadExternalJobsScopedOptions(list);
      }

      return {
        list,
        options,
        viewer,
      };
    }
  );
}

async function loadExternalJobsScopedOptions(
  list: JobListResponse
): Promise<JobOptionsResponse> {
  const detailsExit = await Effect.forEach(
    list.items,
    (item) => Effect.promise(() => getCurrentServerJobDetail(item.id)),
    { concurrency: EXTERNAL_JOB_DETAIL_CONCURRENCY }
  ).pipe(Effect.runPromiseExit);

  if (Exit.isFailure(detailsExit)) {
    throw Cause.squash(detailsExit.cause);
  }

  return deriveExternalJobsScopedOptions(detailsExit.value);
}

function deriveExternalJobsScopedOptions(
  details: readonly JobDetailResponse[]
): JobOptionsResponse {
  const contactsById = new Map<JobContactOption["id"], JobContactOption>();
  const labelsById = new Map<Label["id"], Label>();
  const serviceAreasById = new Map<
    ServiceAreaOption["id"],
    ServiceAreaOption
  >();
  const sitesById = new Map<SiteOption["id"], SiteOption>();

  for (const detail of details) {
    for (const label of detail.job.labels) {
      labelsById.set(label.id, label);
    }

    if (detail.site !== undefined) {
      sitesById.set(detail.site.id, detail.site);

      const { serviceAreaId, serviceAreaName } = detail.site;

      if (serviceAreaId !== undefined && serviceAreaName !== undefined) {
        serviceAreasById.set(serviceAreaId, {
          id: serviceAreaId,
          name: serviceAreaName,
        });
      }
    }

    if (detail.contact !== undefined) {
      contactsById.set(detail.contact.id, {
        email: detail.contact.email,
        id: detail.contact.id,
        name: detail.contact.name,
        phone: detail.contact.phone,
        siteIds: detail.job.siteId === undefined ? [] : [detail.job.siteId],
      });
    }
  }

  return {
    contacts: [...contactsById.values()],
    labels: [...labelsById.values()],
    members: [],
    serviceAreas: [...serviceAreasById.values()],
    sites: [...sitesById.values()],
  };
}

async function resolveJobsRouteOrganizationRole(
  organizationAccess: JobsRouteOrganizationAccess
) {
  if (organizationAccess.currentOrganizationRole !== undefined) {
    return organizationAccess.currentOrganizationRole;
  }

  const role = await getCurrentOrganizationMemberRole(
    organizationAccess.activeOrganizationId
  );

  return role.role;
}
