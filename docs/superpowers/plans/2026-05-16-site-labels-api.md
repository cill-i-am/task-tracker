# Site Labels API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support assigning the existing organization-scoped labels to sites through the API layer, matching the way jobs assign labels without creating site-specific label definitions.

**Architecture:** Keep `packages/labels-core` as the single source of truth for label definitions. Add site-owned label assignment contracts in `packages/sites-core`, a `site_labels` join table in the sites domain, repository/service methods for assigning and removing labels, and site API endpoints that return site DTOs with their assigned labels. Do not implement UI controls or site atoms in this pass.

**Tech Stack:** TypeScript, Effect `Schema`, Effect `HttpApi`, Effect services, Drizzle/Postgres, Vitest, pnpm workspace filters.

---

## Scope Notes

- Organization labels remain the only label definitions. Do not add `site_labels` as a label-definition table, and do not add a `site_label_definitions` concept.
- Site label assignment is site-owned, like job label assignment is job-owned.
- The new API surface should be:
  - `POST /sites/:siteId/labels` with `{ labelId }`
  - `DELETE /sites/:siteId/labels/:labelId`
  - both return the updated `SiteDetail`/`SiteOption` shape with `labels`
- `GET /sites/options`, `POST /sites`, and `PATCH /sites/:siteId` should return sites with `labels: Label[]`.
- No UI first. Do not add picker UI, list badges, or route UX. Existing app code may need type-test updates if the contract shape changes, but no product UI behavior belongs in this plan.
- No separate frontend atoms are needed for the API-only pass. Later UI work can add site label mutation atoms in `apps/app/src/features/sites/sites-state.ts` once these endpoints exist.

## File Structure

- Modify `packages/sites-core/package.json`: add `@ceird/labels-core` dependency.
- Modify `packages/sites-core/src/dto.ts`: import `LabelId`/`LabelSchema`, add `labels` to site responses, add `AssignSiteLabelInputSchema`.
- Modify `packages/sites-core/src/http-api.ts`: add assign/remove site label endpoints and errors.
- Modify `packages/sites-core/src/index.ts`: export new assignment DTO types.
- Modify `packages/sites-core/src/index.test.ts`: decode label-bearing site DTOs and assert OpenAPI paths/operation ids.
- Modify `apps/api/src/domains/sites/schema.ts`: add `siteLabel` join table and relations.
- Modify `apps/api/src/platform/database/schema.ts`: export `siteLabel` and `siteLabelRelations`.
- Modify `apps/api/src/domains/sites/repositories.ts`: load labels for sites, add assignment repository methods.
- Modify `apps/api/src/domains/sites/service.ts`: add `assignLabel` and `removeLabel` use cases.
- Modify `apps/api/src/domains/sites/http.ts`: bind the new site label endpoints.
- Modify `apps/api/src/domains/sites/service.test.ts`: test service authorization and assignment behavior.
- Modify `apps/api/src/domains/persistence.integration.test.ts`: exercise database assignment, same-org enforcement, archive filtering, and idempotency.
- Modify `apps/api/src/domains/domain-boundaries.test.ts`: preserve label ownership and assert sites do not own label CRUD.
- Generate a Drizzle migration under `apps/api/drizzle`.
- Modify `docs/architecture/api.md` and `docs/architecture/packages.md`: document site label assignment.

---

### Task 1: Extend `@ceird/sites-core` Contracts

**Files:**

- Modify: `packages/sites-core/package.json`
- Modify: `packages/sites-core/src/dto.ts`
- Modify: `packages/sites-core/src/http-api.ts`
- Modify: `packages/sites-core/src/index.ts`
- Test: `packages/sites-core/src/index.test.ts`

- [ ] **Step 1: Add the package dependency**

In `packages/sites-core/package.json`, add:

```json
"@ceird/labels-core": "workspace:*"
```

inside `dependencies`, alongside `@ceird/identity-core`.

- [ ] **Step 2: Write failing DTO and contract tests**

In `packages/sites-core/src/index.test.ts`, add imports:

```ts
import { LabelId } from "@ceird/labels-core";
import { OpenApi } from "@effect/platform";
```

Update the representative `site` object in the response test to include:

```ts
labels: [
  {
    createdAt: "2026-05-16T10:00:00.000Z",
    id: "11111111-1111-4111-8111-111111111111",
    name: "High priority",
    updatedAt: "2026-05-16T10:00:00.000Z",
  },
],
```

Add a test for the assignment payload and endpoints:

```ts
it("accepts site label assignment payloads and documents label endpoints", () => {
  expect(
    Schema.decodeUnknownSync(AssignSiteLabelInputSchema)({
      labelId: "11111111-1111-4111-8111-111111111111",
    })
  ).toStrictEqual({
    labelId: "11111111-1111-4111-8111-111111111111" as Schema.Schema.Type<
      typeof LabelId
    >,
  });

  const spec = OpenApi.fromApi(SitesApi);

  expect(spec.paths["/sites/{siteId}/labels"]?.post?.operationId).toBe(
    "sites.assignSiteLabel"
  );
  expect(
    spec.paths["/sites/{siteId}/labels/{labelId}"]?.delete?.operationId
  ).toBe("sites.removeSiteLabel");
});
```

- [ ] **Step 3: Run the failing package test**

Run:

```bash
pnpm --filter @ceird/sites-core test -- src/index.test.ts
```

Expected: FAIL because `AssignSiteLabelInputSchema` and the site label endpoints do not exist.

- [ ] **Step 4: Implement DTO changes**

In `packages/sites-core/src/dto.ts`, add:

```ts
import { LabelId, LabelSchema } from "@ceird/labels-core";
```

Update `SiteOptionSchema`:

```ts
export const SiteOptionSchema = Schema.Struct({
  id: SiteId,
  name: Schema.String,
  labels: Schema.Array(LabelSchema),
  serviceAreaId: Schema.optional(ServiceAreaId),
  serviceAreaName: Schema.optional(Schema.String),
  addressLine1: Schema.String,
  addressLine2: Schema.optional(Schema.String),
  town: Schema.optional(Schema.String),
  county: Schema.String,
  country: SiteCountrySchema,
  eircode: Schema.optional(Schema.String),
  accessNotes: Schema.optional(Schema.String),
  latitude: SiteLatitudeSchema,
  longitude: SiteLongitudeSchema,
  geocodingProvider: SiteGeocodingProviderSchema,
  geocodedAt: IsoDateTimeString,
});
```

Add near the site response schemas:

```ts
export const AssignSiteLabelInputSchema = Schema.Struct({
  labelId: LabelId,
}).annotations({
  parseOptions: { onExcessProperty: "error" },
});
export type AssignSiteLabelInput = Schema.Schema.Type<
  typeof AssignSiteLabelInputSchema
>;
```

- [ ] **Step 5: Implement HTTP contract changes**

In `packages/sites-core/src/http-api.ts`, import:

```ts
import { LabelId, LabelNotFoundError } from "@ceird/labels-core";
```

Import `AssignSiteLabelInputSchema`, `SiteDetailSchema`.

Add to `sitesGroup` after `updateSite`:

```ts
.add(
  HttpApiEndpoint.post("assignSiteLabel", "/sites/:siteId/labels")
    .setPath(Schema.Struct({ siteId: SiteId }))
    .setPayload(AssignSiteLabelInputSchema)
    .addSuccess(SiteDetailSchema)
    .addError(SiteAccessDeniedError)
    .addError(SiteNotFoundError)
    .addError(LabelNotFoundError)
    .addError(SiteStorageError)
)
.add(
  HttpApiEndpoint.del("removeSiteLabel", "/sites/:siteId/labels/:labelId")
    .setPath(Schema.Struct({ siteId: SiteId, labelId: LabelId }))
    .addSuccess(SiteDetailSchema)
    .addError(SiteAccessDeniedError)
    .addError(SiteNotFoundError)
    .addError(LabelNotFoundError)
    .addError(SiteStorageError)
)
```

- [ ] **Step 6: Export the new DTO**

In `packages/sites-core/src/index.ts`, export `AssignSiteLabelInputSchema` and `AssignSiteLabelInput`.

- [ ] **Step 7: Verify sites-core**

Run:

```bash
pnpm --filter @ceird/sites-core test
pnpm --filter @ceird/sites-core check-types
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/sites-core
git commit -m "feat: add site label API contract"
```

---

### Task 2: Add Site Label Persistence

**Files:**

- Modify: `apps/api/src/domains/sites/schema.ts`
- Modify: `apps/api/src/platform/database/schema.ts`
- Generate: `apps/api/drizzle/*.sql`
- Generate: `apps/api/drizzle/meta/*.json`
- Test: `apps/api/src/domains/persistence.integration.test.ts`

- [ ] **Step 1: Write failing persistence coverage**

In `apps/api/src/domains/persistence.integration.test.ts`, add a test named:

```ts
it("assigns organization labels to sites and hides archived labels from site options", async (context: {
  skip: (note?: string) => never;
}) => {
  const testDatabase = await createTestDatabase({ prefix: "site_labels" });
  cleanup.push(testDatabase.cleanup);

  const databaseUrl = testDatabase.url;
  const canReachDatabase = await withPool(
    databaseUrl,
    async (pool) => await canConnect(pool)
  );

  if (!canReachDatabase) {
    context.skip(
      "Integration database unavailable; skipping site label coverage"
    );
  }

  await applyAllMigrations(databaseUrl);
  const identity = await seedIdentityRecords(databaseUrl);
  const foreignIdentity = await seedIdentityRecords(databaseUrl);

  const siteId = await runJobsEffect(
    databaseUrl,
    SitesRepository.create({
      addressLine1: "1 Custom House Quay",
      country: "IE",
      county: "Dublin",
      eircode: "D01 X2X2",
      geocodedAt: "2026-05-16T10:00:00.000Z",
      geocodingProvider: "stub",
      latitude: 53.3498,
      longitude: -6.2603,
      name: "Docklands Campus",
      organizationId: identity.organizationId,
      town: "Dublin",
    })
  );

  const label = await runJobsEffect(
    databaseUrl,
    LabelsRepository.create({
      name: "Requires induction",
      organizationId: identity.organizationId,
    })
  );

  const assigned = await runJobsEffect(
    databaseUrl,
    SiteLabelAssignmentsRepository.assignToSite({
      labelId: label.id,
      organizationId: identity.organizationId,
      siteId,
    })
  );

  expect(assigned).toStrictEqual({ changed: true, label });

  const duplicateAssigned = await runJobsEffect(
    databaseUrl,
    SiteLabelAssignmentsRepository.assignToSite({
      labelId: label.id,
      organizationId: identity.organizationId,
      siteId,
    })
  );

  expect(duplicateAssigned).toStrictEqual({ changed: false, label });

  const site = expectSome(
    await runJobsEffect(
      databaseUrl,
      SitesRepository.getOptionById(identity.organizationId, siteId)
    )
  );
  expect(site.labels.map((siteLabel) => siteLabel.name)).toStrictEqual([
    "Requires induction",
  ]);

  const foreignLabel = await runJobsEffect(
    databaseUrl,
    LabelsRepository.create({
      name: "Foreign label",
      organizationId: foreignIdentity.organizationId,
    })
  );

  const foreignAssignExit = await runJobsEffectExit(
    databaseUrl,
    SiteLabelAssignmentsRepository.assignToSite({
      labelId: foreignLabel.id,
      organizationId: identity.organizationId,
      siteId,
    })
  );
  expectFailureTag(foreignAssignExit, LABEL_NOT_FOUND_ERROR_TAG);

  await runJobsEffect(
    databaseUrl,
    LabelsRepository.archive(identity.organizationId, label.id)
  );

  const afterArchive = expectSome(
    await runJobsEffect(
      databaseUrl,
      SitesRepository.getOptionById(identity.organizationId, siteId)
    )
  );
  expect(afterArchive.labels).toStrictEqual([]);
}, 30_000);
```

Add imports for `SiteLabelAssignmentsRepository` and `LABEL_NOT_FOUND_ERROR_TAG`.

- [ ] **Step 2: Run the failing integration test**

Run:

```bash
pnpm --filter api test -- src/domains/persistence.integration.test.ts
```

Expected: FAIL because `SiteLabelAssignmentsRepository` and `site_labels` do not exist.

- [ ] **Step 3: Add the `site_labels` Drizzle table**

In `apps/api/src/domains/sites/schema.ts`, import `primaryKey` and `foreignKey` from `drizzle-orm/pg-core`, and import the label table:

```ts
import { label } from "../labels/schema.js";
```

Add:

```ts
export const siteLabel = pgTable(
  "site_labels",
  {
    siteId: uuid("site_id").notNull(),
    labelId: uuid("label_id").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdAt: sitesTimestamp("created_at"),
  },
  (table) => [
    primaryKey({ columns: [table.siteId, table.labelId] }),
    foreignKey({
      columns: [table.siteId, table.organizationId],
      foreignColumns: [site.id, site.organizationId],
      name: "site_labels_site_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.labelId, table.organizationId],
      foreignColumns: [label.id, label.organizationId],
      name: "site_labels_label_org_fk",
    }).onDelete("cascade"),
    index("site_labels_label_site_idx").on(
      table.organizationId,
      table.labelId,
      table.siteId
    ),
  ]
);
```

Update relations:

```ts
export const siteRelations = relations(site, ({ many, one }) => ({
  organization: one(organization, {
    fields: [site.organizationId],
    references: [organization.id],
  }),
  serviceArea: one(serviceArea, {
    fields: [site.serviceAreaId],
    references: [serviceArea.id],
  }),
  labels: many(siteLabel),
}));

export const siteLabelRelations = relations(siteLabel, ({ one }) => ({
  label: one(label, {
    fields: [siteLabel.labelId],
    references: [label.id],
  }),
  site: one(site, {
    fields: [siteLabel.siteId],
    references: [site.id],
  }),
}));
```

Include `siteLabel` in `sitesSchema`.

- [ ] **Step 4: Export database schema additions**

In `apps/api/src/platform/database/schema.ts`, export `siteLabel` and `siteLabelRelations`.

- [ ] **Step 5: Generate and inspect the migration**

Run:

```bash
pnpm --filter api db:generate
```

Expected migration content includes:

```sql
CREATE TABLE "site_labels" (
  "site_id" uuid NOT NULL,
  "label_id" uuid NOT NULL,
  "organization_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "site_labels_site_id_label_id_pk" PRIMARY KEY("site_id","label_id")
);
```

and foreign keys named `site_labels_site_org_fk` and `site_labels_label_org_fk`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/domains/sites/schema.ts apps/api/src/platform/database/schema.ts apps/api/drizzle
git commit -m "feat: add site label persistence"
```

---

### Task 3: Teach Sites Repository To Read And Mutate Labels

**Files:**

- Modify: `apps/api/src/domains/sites/repositories.ts`
- Test: `apps/api/src/domains/persistence.integration.test.ts`

- [ ] **Step 1: Add label imports and row types**

In `apps/api/src/domains/sites/repositories.ts`, add imports:

```ts
import {
  LabelId as LabelIdSchema,
  LabelNotFoundError,
  LabelSchema,
} from "@ceird/labels-core";
import type { Label, LabelIdType as LabelId } from "@ceird/labels-core";
```

Add interfaces:

```ts
interface LabelRow {
  readonly created_at: Date;
  readonly id: string;
  readonly name: string;
  readonly updated_at: Date;
}

interface LabelAssignmentRow extends LabelRow {
  readonly inserted_count: number;
  readonly site_id: string | null;
}

export interface AssignSiteLabelRecordInput {
  readonly labelId: LabelId;
  readonly organizationId: OrganizationId;
  readonly siteId: SiteId;
}

export interface SiteLabelAssignmentResult {
  readonly changed: boolean;
  readonly label: Label;
}
```

Add decoders:

```ts
const decodeLabel = Schema.decodeUnknownSync(LabelSchema);
const decodeLabelId = Schema.decodeUnknownSync(LabelIdSchema);
```

- [ ] **Step 2: Load labels for site option rows**

Add helper functions near the existing row mappers:

```ts
function mapLabelRow(row: LabelRow): Label {
  return decodeLabel({
    createdAt: row.created_at.toISOString(),
    id: decodeLabelId(row.id),
    name: row.name,
    updatedAt: row.updated_at.toISOString(),
  });
}

function mapSiteOptionRow(
  row: SiteOptionRow,
  labels: readonly Label[] = []
): SiteOption {
  return decodeSiteOption({
    accessNotes: row.access_notes ?? undefined,
    addressLine1: row.address_line_1,
    addressLine2: row.address_line_2 ?? undefined,
    country: row.country,
    county: row.county,
    eircode: row.eircode ?? undefined,
    geocodedAt: decodeIsoDateTimeString(row.geocoded_at.toISOString()),
    geocodingProvider: row.geocoding_provider,
    id: decodeSiteId(row.id),
    labels,
    latitude: row.latitude,
    longitude: row.longitude,
    name: row.name,
    serviceAreaId:
      row.service_area_id === null ? undefined : row.service_area_id,
    serviceAreaName: row.service_area_name ?? undefined,
    town: row.town ?? undefined,
  });
}
```

Keep the current mapping fields intact; only add the `labels` parameter and `labels` property.

Inside `SitesRepositoryLive`, add:

```ts
const listLabelsForSites = Effect.fn("SitesRepository.listLabelsForSites")(
  function* (organizationId: OrganizationId, siteIds: readonly SiteId[]) {
    if (siteIds.length === 0) {
      return new Map<string, Label[]>();
    }

    const rows = yield* sql<LabelRow & { readonly site_id: string }>`
      select
        site_labels.site_id,
        labels.id,
        labels.created_at,
        labels.name,
        labels.updated_at
      from site_labels
      join labels on labels.id = site_labels.label_id
      join sites on sites.id = site_labels.site_id
      where labels.organization_id = ${organizationId}
        and sites.organization_id = ${organizationId}
        and site_labels.site_id in ${sql.in(siteIds)}
        and labels.archived_at is null
      order by labels.name asc, labels.id asc
    `;

    const labelsBySiteId = new Map<string, Label[]>();

    for (const row of rows) {
      const labels = labelsBySiteId.get(row.site_id) ?? [];
      labels.push(mapLabelRow(row));
      labelsBySiteId.set(row.site_id, labels);
    }

    return labelsBySiteId;
  }
);
```

Update `listOptions` and `getOptionById` to call `listLabelsForSites` and pass labels into `mapSiteOptionRow`.

- [ ] **Step 3: Add site label assignment repository**

In `apps/api/src/domains/sites/repositories.ts`, add:

```ts
export class SiteLabelAssignmentsRepository extends Effect.Service<SiteLabelAssignmentsRepository>()(
  "@ceird/domains/sites/SiteLabelAssignmentsRepository",
  {
    accessors: true,
    effect: Effect.gen(function* SiteLabelAssignmentsRepositoryLive() {
      const sql = yield* SqlClient.SqlClient;

      const ensureSiteOrganizationMatches = Effect.fn(
        "SiteLabelAssignmentsRepository.ensureSiteOrganizationMatches"
      )(function* (organizationId: OrganizationId, siteId: SiteId) {
        const rows = yield* sql<IdRow>`
          select id
          from sites
          where organization_id = ${organizationId}
            and id = ${siteId}
            and archived_at is null
          limit 1
        `;

        if (rows[0] === undefined) {
          return yield* Effect.fail(
            new SiteNotFoundError({
              message: "Site does not exist",
              siteId,
            })
          );
        }

        return siteId;
      });

      const getActiveLabelOrFail = Effect.fn(
        "SiteLabelAssignmentsRepository.getActiveLabelOrFail"
      )(function* (organizationId: OrganizationId, labelId: LabelId) {
        const rows = yield* sql<LabelRow>`
          select id, created_at, name, updated_at
          from labels
          where organization_id = ${organizationId}
            and id = ${labelId}
            and archived_at is null
          limit 1
        `;

        if (rows[0] === undefined) {
          return yield* Effect.fail(
            new LabelNotFoundError({
              labelId,
              message: "Label does not exist in the organization",
            })
          );
        }

        return mapLabelRow(rows[0]);
      });

      const assignToSite = Effect.fn(
        "SiteLabelAssignmentsRepository.assignToSite"
      )(function* (input: AssignSiteLabelRecordInput) {
        const rows = yield* sql<LabelAssignmentRow>`
          with active_label as (
            select id, created_at, name, updated_at, organization_id
            from labels
            where organization_id = ${input.organizationId}
              and id = ${input.labelId}
              and archived_at is null
            for share
          ),
          organization_site as (
            select id
            from sites
            where organization_id = ${input.organizationId}
              and id = ${input.siteId}
              and archived_at is null
          ),
          inserted_label as (
            insert into site_labels (
              site_id,
              label_id,
              organization_id
            )
            select
              organization_site.id,
              active_label.id,
              active_label.organization_id
            from active_label
            join organization_site on true
            on conflict do nothing
            returning label_id
          )
          select
            active_label.id,
            active_label.created_at,
            active_label.name,
            active_label.updated_at,
            organization_site.id as site_id,
            (select count(*) from inserted_label)::integer as inserted_count
          from active_label
          left join organization_site on true
          limit 1
        `;

        const row = rows[0];

        if (row === undefined) {
          return yield* Effect.fail(
            new LabelNotFoundError({
              labelId: input.labelId,
              message: "Label does not exist in the organization",
            })
          );
        }

        if (row.site_id === null) {
          yield* ensureSiteOrganizationMatches(
            input.organizationId,
            input.siteId
          );
        }

        return {
          changed: row.inserted_count > 0,
          label: mapLabelRow(row),
        };
      });

      const removeFromSite = Effect.fn(
        "SiteLabelAssignmentsRepository.removeFromSite"
      )(function* (input: AssignSiteLabelRecordInput) {
        const label = yield* getActiveLabelOrFail(
          input.organizationId,
          input.labelId
        );
        yield* ensureSiteOrganizationMatches(
          input.organizationId,
          input.siteId
        );

        const rows = yield* sql<IdRow>`
          delete from site_labels
          using labels, sites
          where site_labels.label_id = labels.id
            and site_labels.site_id = sites.id
            and labels.organization_id = ${input.organizationId}
            and labels.id = ${input.labelId}
            and sites.organization_id = ${input.organizationId}
            and sites.id = ${input.siteId}
          returning site_labels.label_id as id
        `;

        return {
          changed: rows.length > 0,
          label,
        };
      });

      return {
        assignToSite,
        removeFromSite,
      };
    }),
  }
) {}
```

- [ ] **Step 4: Run persistence test**

Run:

```bash
pnpm --filter api test -- src/domains/persistence.integration.test.ts
```

Expected: PASS or SKIP if the integration database is unavailable.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/sites/repositories.ts apps/api/src/domains/persistence.integration.test.ts
git commit -m "feat: persist site label assignments"
```

---

### Task 4: Add Site Label Service And HTTP Handlers

**Files:**

- Modify: `apps/api/src/domains/sites/service.ts`
- Modify: `apps/api/src/domains/sites/http.ts`
- Test: `apps/api/src/domains/sites/service.test.ts`

- [ ] **Step 1: Write service tests**

In `apps/api/src/domains/sites/service.test.ts`, add imports:

```ts
import { LabelId } from "@ceird/labels-core";
import type { Label } from "@ceird/labels-core";
```

Add a label id beside the existing test ids:

```ts
const labelId = "11111111-1111-4111-8111-111111111111" as Schema.Schema.Type<
  typeof LabelId
>;
```

Extend the harness call counters with:

```ts
assignLabel: number;
removeLabel: number;
```

Define a shared test label inside `makeHarness`:

```ts
const organizationLabel: Label = {
  createdAt: "2026-05-16T10:00:00.000Z",
  id: labelId,
  name: "Requires induction",
  updatedAt: "2026-05-16T10:00:00.000Z",
};
```

Update `createdSiteOption` so its default shape has labels:

```ts
const createdSiteOption: JobSiteOption = {
  addressLine1: "1 Custom House Quay",
  country: "IE",
  county: "Dublin",
  eircode: "D01 X2X2",
  geocodedAt,
  geocodingProvider: "stub",
  id: siteId,
  labels: [],
  latitude: 53.3498,
  longitude: -6.2603,
  name: "Docklands Campus",
  serviceAreaId,
  serviceAreaName: "Dublin",
  town: "Dublin",
};
```

Add a repository mock in `makeHarness`:

```ts
const siteLabelAssignmentsRepository = SiteLabelAssignmentsRepository.make({
  assignToSite: (input: {
    readonly labelId: Label["id"];
    readonly organizationId: OrganizationId;
    readonly siteId: SiteId;
  }) =>
    Effect.sync(() => {
      calls.assignLabel += 1;
      expect(input).toStrictEqual({
        labelId,
        organizationId: actor.organizationId,
        siteId,
      });

      return {
        changed: true,
        label: organizationLabel,
      };
    }),
  removeFromSite: (input: {
    readonly labelId: Label["id"];
    readonly organizationId: OrganizationId;
    readonly siteId: SiteId;
  }) =>
    Effect.sync(() => {
      calls.removeLabel += 1;
      expect(input).toStrictEqual({
        labelId,
        organizationId: actor.organizationId,
        siteId,
      });

      return {
        changed: true,
        label: organizationLabel,
      };
    }),
});
```

Update the `getOptionById` mock to return labels according to the last mutation:

```ts
return Option.some({
  ...createdSiteOption,
  labels: calls.assignLabel > calls.removeLabel ? [organizationLabel] : [],
});
```

Add `Layer.succeed(SiteLabelAssignmentsRepository, siteLabelAssignmentsRepository)` to the `Layer.mergeAll(...)` that provides service dependencies.

Add `SiteLabelAssignmentsRepository` to the repository import:

```ts
import {
  ServiceAreasRepository,
  SiteLabelAssignmentsRepository,
  SitesRepository,
} from "./repositories.js";
```

Add tests:

```ts
it("lets elevated members assign and remove site labels", async () => {
  const harness = makeHarness({ actor: makeActor("owner") });

  const result = await Effect.gen(function* () {
    const sites = yield* SitesService;
    const assigned = yield* sites.assignLabel(siteId, { labelId });
    const removed = yield* sites.removeLabel(siteId, labelId);
    return { assigned, removed };
  }).pipe(Effect.provide(harness.layer), Effect.runPromise);

  expect(result.assigned.labels.map((label) => label.name)).toStrictEqual([
    "Requires induction",
  ]);
  expect(result.removed.labels).toStrictEqual([]);
  expect(harness.calls.assignLabel).toBe(1);
  expect(harness.calls.removeLabel).toBe(1);
});

it("rejects external collaborators assigning site labels", async () => {
  const harness = makeHarness({ actor: makeActor("external") });

  const exit = await SitesService.assignLabel(siteId, { labelId }).pipe(
    Effect.provide(harness.layer),
    Effect.exit,
    Effect.runPromise
  );

  expect(Exit.isFailure(exit)).toBe(true);
});
```

- [ ] **Step 2: Run failing service tests**

Run:

```bash
pnpm --filter api test -- src/domains/sites/service.test.ts
```

Expected: FAIL because `assignLabel` and `removeLabel` are not implemented.

- [ ] **Step 3: Implement service methods**

In `apps/api/src/domains/sites/service.ts`, import:

```ts
import type { LabelIdType as LabelId } from "@ceird/labels-core";
import type { AssignSiteLabelInput } from "@ceird/sites-core";
```

Import `SiteLabelAssignmentsRepository`.

Add `SiteLabelAssignmentsRepository.Default` to service dependencies.

Inside `SitesServiceLive`, bind:

```ts
const siteLabelAssignmentsRepository = yield * SiteLabelAssignmentsRepository;
```

Add methods:

```ts
const assignLabel = Effect.fn("SitesService.assignLabel")(function* (
  siteId: SiteId,
  input: AssignSiteLabelInput
) {
  const actor = yield* loadActor();
  yield* authorization
    .ensureCanCreateSite(actor)
    .pipe(
      Effect.catchTag(
        ORGANIZATION_AUTHORIZATION_DENIED_ERROR_TAG,
        failSiteAccessDenied
      )
    );

  yield* Effect.annotateCurrentSpan("action", "assignLabel");
  yield* Effect.annotateCurrentSpan("organizationId", actor.organizationId);
  yield* Effect.annotateCurrentSpan("siteId", siteId);
  yield* Effect.annotateCurrentSpan("labelId", input.labelId);

  yield* sitesRepository
    .withTransaction(
      siteLabelAssignmentsRepository.assignToSite({
        labelId: input.labelId,
        organizationId: actor.organizationId,
        siteId,
      })
    )
    .pipe(Effect.catchTag("SqlError", failSitesStorageError));

  return yield* loadSiteDetailOrFail(
    actor.organizationId,
    siteId,
    sitesRepository
  );
});

const removeLabel = Effect.fn("SitesService.removeLabel")(function* (
  siteId: SiteId,
  labelId: LabelId
) {
  const actor = yield* loadActor();
  yield* authorization
    .ensureCanCreateSite(actor)
    .pipe(
      Effect.catchTag(
        ORGANIZATION_AUTHORIZATION_DENIED_ERROR_TAG,
        failSiteAccessDenied
      )
    );

  yield* Effect.annotateCurrentSpan("action", "removeLabel");
  yield* Effect.annotateCurrentSpan("organizationId", actor.organizationId);
  yield* Effect.annotateCurrentSpan("siteId", siteId);
  yield* Effect.annotateCurrentSpan("labelId", labelId);

  yield* sitesRepository
    .withTransaction(
      siteLabelAssignmentsRepository.removeFromSite({
        labelId,
        organizationId: actor.organizationId,
        siteId,
      })
    )
    .pipe(Effect.catchTag("SqlError", failSitesStorageError));

  return yield* loadSiteDetailOrFail(
    actor.organizationId,
    siteId,
    sitesRepository
  );
});
```

Add helper:

```ts
function loadSiteDetailOrFail(
  organizationId: OrganizationActor["organizationId"],
  siteId: SiteId,
  sitesRepository: SitesRepository
) {
  return sitesRepository.getOptionById(organizationId, siteId).pipe(
    Effect.catchTag("SqlError", failSitesStorageError),
    Effect.flatMap(
      Option.match({
        onNone: () =>
          Effect.fail(
            new SiteNotFoundError({
              message: "Site does not exist",
              siteId,
            })
          ),
        onSome: Effect.succeed,
      })
    )
  );
}
```

Return `assignLabel` and `removeLabel` from the service object.

- [ ] **Step 4: Bind HTTP handlers**

In `apps/api/src/domains/sites/http.ts`, add:

```ts
.handle("assignSiteLabel", ({ path, payload }) =>
  sitesService
    .assignLabel(path.siteId, payload)
    .pipe(observeSitesOperation("assignSiteLabel"))
)
.handle("removeSiteLabel", ({ path }) =>
  sitesService
    .removeLabel(path.siteId, path.labelId)
    .pipe(observeSitesOperation("removeSiteLabel"))
)
```

Add `SiteLabelAssignmentsRepository.Default` to the `SitesHttpLive` layer if it is not provided through `SitesService.Default`.

- [ ] **Step 5: Run API service tests**

Run:

```bash
pnpm --filter api test -- src/domains/sites/service.test.ts
pnpm --filter api test -- src/domains/http.integration.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/domains/sites/service.ts apps/api/src/domains/sites/http.ts apps/api/src/domains/sites/service.test.ts
git commit -m "feat: expose site label assignment API"
```

---

### Task 5: Update Boundary Tests And Architecture Docs

**Files:**

- Modify: `apps/api/src/domains/domain-boundaries.test.ts`
- Modify: `docs/architecture/api.md`
- Modify: `docs/architecture/packages.md`

- [ ] **Step 1: Preserve label ownership boundary tests**

In `apps/api/src/domains/domain-boundaries.test.ts`, update the label boundary test to allow assignment repositories but reject label CRUD ownership in sites:

```ts
it("keeps sites code free of organization label CRUD ownership", async () => {
  const sitesSources = await readDomainSources("sites");

  expect(sitesSources).not.toMatch(/\bcreateSiteLabel\b/);
  expect(sitesSources).not.toMatch(/\blistSiteLabels\b/);
  expect(sitesSources).not.toMatch(/\bupdateSiteLabel\b/);
  expect(sitesSources).not.toMatch(/\barchiveSiteLabel\b/);
  expect(sitesSources).not.toMatch(/pgTable\(\s*"labels"/);
});
```

Keep the existing organization table-name test and extend it:

```ts
expect(source).toContain('"labels"');
expect(source).toContain('"site_labels"');
expect(source).toContain('"work_item_labels"');
expect(source).not.toContain('"job_labels"');
```

- [ ] **Step 2: Document API architecture**

In `docs/architecture/api.md`, update:

- Sites domain file table: mention site-label assignment rows in `schema.ts` and assignment methods in `repositories.ts`.
- Sites endpoints table: add `POST /sites/:siteId/labels` and `DELETE /sites/:siteId/labels/:labelId`.
- Labels domain section: state labels are organization-level definitions and both jobs and sites assign those labels through owning-domain join tables.
- Data layer section: mention `site_labels` joins `sites` and organization `labels` using composite organization foreign keys.

- [ ] **Step 3: Document package architecture**

In `docs/architecture/packages.md`, update:

- `@ceird/sites-core`: note it imports `@ceird/labels-core` for label IDs/schemas and exports site label assignment endpoints.
- `@ceird/labels-core`: update the note from "Jobs may assign labels" to "Jobs and sites may assign labels".
- Dependency diagram: add `packages/sites-core -> packages/labels-core`.

- [ ] **Step 4: Run docs-adjacent tests**

Run:

```bash
pnpm --filter api test -- src/domains/domain-boundaries.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/domain-boundaries.test.ts docs/architecture/api.md docs/architecture/packages.md
git commit -m "docs: document site label API boundaries"
```

---

### Task 6: Full Verification

**Files:**

- All changed files from Tasks 1-5.

- [ ] **Step 1: Run focused package checks**

```bash
pnpm --filter @ceird/sites-core test
pnpm --filter @ceird/sites-core check-types
pnpm --filter api test -- src/domains/sites/service.test.ts src/domains/persistence.integration.test.ts src/domains/domain-boundaries.test.ts src/domains/http.integration.test.ts
pnpm --filter api check-types
```

Expected: PASS, except `persistence.integration.test.ts` may SKIP database-backed cases if no integration database is reachable.

- [ ] **Step 2: Run broadened handoff checks**

```bash
pnpm check-types
pnpm test
pnpm lint
pnpm format
```

Expected: PASS.

- [ ] **Step 3: Review generated migration**

Inspect the generated `apps/api/drizzle/*.sql` migration and confirm:

- `site_labels` has primary key `(site_id, label_id)`.
- `site_labels_site_org_fk` references `(sites.id, sites.organization_id)` with cascade delete.
- `site_labels_label_org_fk` references `(labels.id, labels.organization_id)` with cascade delete.
- There is an index on `(organization_id, label_id, site_id)`.
- No new label definition table was generated.

- [ ] **Step 4: Commit verification fixes**

If verification required formatting or small fixes:

```bash
git add .
git commit -m "chore: verify site label API"
```

If no files changed, do not create an empty commit.

---

## Later UI Follow-Up

When the API is merged, add a separate UI plan for:

- Site label badges in site list/detail surfaces.
- A label picker in site detail.
- Site label mutation atoms in `apps/app/src/features/sites/sites-state.ts`, with the same mutation/result-state conventions used by existing site create/update atoms.
- Shared label picker extraction only if it reduces duplication between jobs and sites after both UI flows exist.

Do not do that work in this API-layer plan.
