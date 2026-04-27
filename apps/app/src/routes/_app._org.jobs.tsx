import {
  Outlet,
  createFileRoute,
  useNavigate,
  useRouteContext,
} from "@tanstack/react-router";
import type { OrganizationId } from "@task-tracker/identity-core";
import type {
  JobListResponse,
  JobOptionsResponse,
} from "@task-tracker/jobs-core";
import { ParseResult, Schema } from "effect";

import { JobsRouteContent } from "#/features/jobs/jobs-route-content";
import {
  getCurrentServerJobOptions,
  listAllCurrentServerJobs,
} from "#/features/jobs/jobs-server";
import type { JobsViewer } from "#/features/jobs/jobs-viewer";
import type { ActiveOrganizationSync } from "#/features/organizations/organization-access";
import {
  ensureActiveOrganizationId,
  getCurrentOrganizationMemberRole,
} from "#/features/organizations/organization-access";

const EMPTY_JOBS_OPTIONS: JobOptionsResponse = {
  contacts: [],
  members: [],
  regions: [],
  sites: [],
};

const EMPTY_JOBS_LIST: JobListResponse = {
  items: [],
  nextCursor: undefined,
};

const RawJobsSearch = Schema.Struct({
  view: Schema.optional(Schema.Unknown),
});

const JobsSearch = Schema.transform(
  RawJobsSearch,
  Schema.Struct({
    view: Schema.optional(Schema.Literal("list", "map")),
  }),
  {
    strict: true,
    decode: ({ view }) => {
      if (view === "list") {
        return { view: "list" as const };
      }

      if (view === "map") {
        return { view: "map" as const };
      }

      return {};
    },
    encode: (search) => search,
  }
);

type JobsSearch = typeof JobsSearch.Type;

function decodeJobsSearch(input: unknown): JobsSearch {
  return ParseResult.decodeUnknownSync(JobsSearch)(input);
}

interface JobsRouteOrganizationAccess {
  readonly activeOrganizationId: OrganizationId;
  readonly activeOrganizationSync: ActiveOrganizationSync;
  readonly currentUserId: string;
}

function toJobsRouteOrganizationAccess(
  organizationAccess: Awaited<ReturnType<typeof ensureActiveOrganizationId>>
): JobsRouteOrganizationAccess {
  return {
    activeOrganizationId: organizationAccess.activeOrganizationId,
    activeOrganizationSync: organizationAccess.activeOrganizationSync,
    currentUserId: organizationAccess.session.user.id,
  };
}

export async function loadJobsRouteData(
  organizationAccess?: JobsRouteOrganizationAccess
) {
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

  const [activeRole, list, options] = await Promise.all([
    getCurrentOrganizationMemberRole(
      resolvedOrganizationAccess.activeOrganizationId
    ),
    listAllCurrentServerJobs({}),
    getCurrentServerJobOptions(),
  ]);

  return {
    list,
    options,
    viewer: {
      role: activeRole.role,
      userId: resolvedOrganizationAccess.currentUserId,
    } satisfies JobsViewer,
  };
}

export const Route = createFileRoute("/_app/_org/jobs")({
  staticData: {
    breadcrumb: {
      label: "Jobs",
      to: "/jobs",
    },
  },
  validateSearch: decodeJobsSearch,
  loader: ({ context }) => loadJobsRouteData(context),
  component: JobsRoute,
});

function JobsRoute() {
  const { activeOrganization, activeOrganizationId } = useRouteContext({
    from: "/_app/_org",
  });
  const { list, options, viewer } = Route.useLoaderData();
  const navigate = useNavigate({ from: "/jobs" });
  const search = Route.useSearch();

  return (
    <JobsRouteContent
      activeOrganizationName={activeOrganization.name}
      activeOrganizationId={activeOrganizationId}
      list={list}
      onViewModeChange={(viewMode) => {
        navigate({
          search: (current) => ({
            ...current,
            view: viewMode === "list" ? undefined : viewMode,
          }),
        });
      }}
      options={options}
      viewMode={search.view ?? "list"}
      viewer={viewer}
    >
      <Outlet />
    </JobsRouteContent>
  );
}
