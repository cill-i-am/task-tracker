import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { Schema } from "effect";

import {
  AddJobCommentInputSchema,
  AddJobCommentResponseSchema,
  AddJobVisitInputSchema,
  AddJobVisitResponseSchema,
  CreateJobInputSchema,
  CreateJobResponseSchema,
  CreateServiceAreaInputSchema,
  CreateServiceAreaResponseSchema,
  CreateSiteInputSchema,
  CreateSiteResponseSchema,
  JobDetailResponseSchema,
  JobListQuerySchema,
  JobOptionsResponseSchema,
  JobListResponseSchema,
  PatchJobInputSchema,
  PatchJobResponseSchema,
  ReopenJobResponseSchema,
  ServiceAreaListResponseSchema,
  SitesOptionsResponseSchema,
  TransitionJobInputSchema,
  TransitionJobResponseSchema,
  UpdateServiceAreaInputSchema,
  UpdateServiceAreaResponseSchema,
  UpdateSiteInputSchema,
  UpdateSiteResponseSchema,
} from "./dto.js";
import {
  BlockedReasonRequiredError,
  ContactNotFoundError,
  CoordinatorMatchesAssigneeError,
  InvalidJobTransitionError,
  JobAccessDeniedError,
  JobListCursorInvalidError,
  JobNotFoundError,
  JobStorageError,
  OrganizationMemberNotFoundError,
  ServiceAreaNotFoundError,
  SiteGeocodingFailedError,
  SiteNotFoundError,
  VisitDurationIncrementError,
} from "./errors.js";
import { ServiceAreaId, SiteId, WorkItemId } from "./ids.js";

const jobsGroup = HttpApiGroup.make("jobs")
  .add(
    HttpApiEndpoint.get("listJobs", "/jobs")
      .setUrlParams(JobListQuerySchema)
      .addSuccess(JobListResponseSchema)
      .addError(JobListCursorInvalidError)
      .addError(JobAccessDeniedError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.get("getJobOptions", "/jobs/options")
      .addSuccess(JobOptionsResponseSchema)
      .addError(JobAccessDeniedError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.post("createJob", "/jobs")
      .setPayload(CreateJobInputSchema)
      .addSuccess(CreateJobResponseSchema, { status: 201 })
      .addError(JobAccessDeniedError)
      .addError(ServiceAreaNotFoundError)
      .addError(SiteNotFoundError)
      .addError(SiteGeocodingFailedError)
      .addError(ContactNotFoundError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.get("getJobDetail", "/jobs/:workItemId")
      .setPath(Schema.Struct({ workItemId: WorkItemId }))
      .addSuccess(JobDetailResponseSchema)
      .addError(JobNotFoundError)
      .addError(JobAccessDeniedError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.patch("patchJob", "/jobs/:workItemId")
      .setPath(Schema.Struct({ workItemId: WorkItemId }))
      .setPayload(PatchJobInputSchema)
      .addSuccess(PatchJobResponseSchema)
      .addError(JobNotFoundError)
      .addError(JobAccessDeniedError)
      .addError(CoordinatorMatchesAssigneeError)
      .addError(OrganizationMemberNotFoundError)
      .addError(SiteNotFoundError)
      .addError(ContactNotFoundError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.post("transitionJob", "/jobs/:workItemId/transitions")
      .setPath(Schema.Struct({ workItemId: WorkItemId }))
      .setPayload(TransitionJobInputSchema)
      .addSuccess(TransitionJobResponseSchema)
      .addError(JobNotFoundError)
      .addError(JobAccessDeniedError)
      .addError(InvalidJobTransitionError)
      .addError(BlockedReasonRequiredError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.post("reopenJob", "/jobs/:workItemId/reopen")
      .setPath(Schema.Struct({ workItemId: WorkItemId }))
      .addSuccess(ReopenJobResponseSchema)
      .addError(JobNotFoundError)
      .addError(JobAccessDeniedError)
      .addError(InvalidJobTransitionError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.post("addJobComment", "/jobs/:workItemId/comments")
      .setPath(Schema.Struct({ workItemId: WorkItemId }))
      .setPayload(AddJobCommentInputSchema)
      .addSuccess(AddJobCommentResponseSchema, { status: 201 })
      .addError(JobNotFoundError)
      .addError(JobAccessDeniedError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.post("addJobVisit", "/jobs/:workItemId/visits")
      .setPath(Schema.Struct({ workItemId: WorkItemId }))
      .setPayload(AddJobVisitInputSchema)
      .addSuccess(AddJobVisitResponseSchema, { status: 201 })
      .addError(JobNotFoundError)
      .addError(JobAccessDeniedError)
      .addError(VisitDurationIncrementError)
      .addError(JobStorageError)
  );

export const JobsApiGroup = jobsGroup;

const serviceAreasGroup = HttpApiGroup.make("serviceAreas")
  .add(
    HttpApiEndpoint.get("listServiceAreas", "/service-areas")
      .addSuccess(ServiceAreaListResponseSchema)
      .addError(JobAccessDeniedError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.post("createServiceArea", "/service-areas")
      .setPayload(CreateServiceAreaInputSchema)
      .addSuccess(CreateServiceAreaResponseSchema, { status: 201 })
      .addError(JobAccessDeniedError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.patch("updateServiceArea", "/service-areas/:serviceAreaId")
      .setPath(Schema.Struct({ serviceAreaId: ServiceAreaId }))
      .setPayload(UpdateServiceAreaInputSchema)
      .addSuccess(UpdateServiceAreaResponseSchema)
      .addError(JobAccessDeniedError)
      .addError(ServiceAreaNotFoundError)
      .addError(JobStorageError)
  );

export const ServiceAreasApiGroup = serviceAreasGroup;

const sitesGroup = HttpApiGroup.make("sites")
  .add(
    HttpApiEndpoint.get("getSiteOptions", "/sites/options")
      .addSuccess(SitesOptionsResponseSchema)
      .addError(JobAccessDeniedError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.post("createSite", "/sites")
      .setPayload(CreateSiteInputSchema)
      .addSuccess(CreateSiteResponseSchema, { status: 201 })
      .addError(JobAccessDeniedError)
      .addError(ServiceAreaNotFoundError)
      .addError(SiteGeocodingFailedError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.patch("updateSite", "/sites/:siteId")
      .setPath(Schema.Struct({ siteId: SiteId }))
      .setPayload(UpdateSiteInputSchema)
      .addSuccess(UpdateSiteResponseSchema)
      .addError(JobAccessDeniedError)
      .addError(ServiceAreaNotFoundError)
      .addError(SiteNotFoundError)
      .addError(SiteGeocodingFailedError)
      .addError(JobStorageError)
  );

export const SitesApiGroup = sitesGroup;

export const JobsApi = HttpApi.make("JobsApi")
  .add(JobsApiGroup)
  .add(ServiceAreasApiGroup)
  .add(SitesApiGroup);

export type JobsApiGroupType = typeof JobsApiGroup;
export type ServiceAreasApiGroupType = typeof ServiceAreasApiGroup;
export type SitesApiGroupType = typeof SitesApiGroup;
export type JobsApiType = typeof JobsApi;
