"use client";

import { useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import type { Result } from "@effect-atom/atom-react";
import type { ServiceArea } from "@task-tracker/jobs-core";
import { Cause, Exit } from "effect";
import * as React from "react";

import { AppUtilityPanel } from "#/components/app-utility-panel";
import { Button } from "#/components/ui/button";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";

import {
  createServiceAreaMutationAtom,
  listServiceAreasAtom,
  organizationServiceAreasStateAtom,
  updateServiceAreaMutationAtomFamily,
} from "./organization-configuration-state";

interface ServiceAreaFormValues {
  readonly name: string;
  readonly description: string;
}

export function OrganizationServiceAreasSection() {
  const serviceAreas = useAtomValue(organizationServiceAreasStateAtom).items;
  const listResult = useAtomValue(listServiceAreasAtom);
  const createResult = useAtomValue(createServiceAreaMutationAtom);
  const loadServiceAreas = useAtomSet(listServiceAreasAtom, {
    mode: "promiseExit",
  });
  const createServiceArea = useAtomSet(createServiceAreaMutationAtom, {
    mode: "promiseExit",
  });
  const [values, setValues] = React.useState<ServiceAreaFormValues>({
    description: "",
    name: "",
  });
  const [nameError, setNameError] = React.useState<string | null>(null);
  const nameId = React.useId();
  const descriptionId = React.useId();

  React.useEffect(() => {
    void loadServiceAreas();
  }, [loadServiceAreas]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = buildServiceAreaPayload(values);

    if (!payload) {
      setNameError("Add a service area name.");
      return;
    }

    setNameError(null);
    const exit = await createServiceArea(payload);

    if (Exit.isSuccess(exit)) {
      setValues({ description: "", name: "" });
    }
  }

  return (
    <AppUtilityPanel
      title="Service areas"
      description="Maintain the named areas used for sites, filtering, and team planning."
      className="rounded-none border-x-0 border-t border-b bg-transparent p-0 pt-5 shadow-none supports-[backdrop-filter]:bg-transparent sm:p-0 sm:pt-5"
    >
      <form
        className="grid gap-3 lg:grid-cols-[minmax(12rem,0.8fr)_minmax(14rem,1fr)_auto]"
        method="post"
        noValidate
        onSubmit={handleSubmit}
      >
        <label
          className="flex min-w-0 flex-col gap-1.5 text-sm font-medium"
          htmlFor={nameId}
        >
          New service area name
          <Input
            id={nameId}
            value={values.name}
            aria-invalid={Boolean(nameError) || undefined}
            onChange={(event) => {
              setNameError(null);
              setValues((current) => ({
                ...current,
                name: event.target.value,
              }));
            }}
          />
        </label>
        <label
          className="flex min-w-0 flex-col gap-1.5 text-sm font-medium"
          htmlFor={descriptionId}
        >
          New service area description
          <Textarea
            id={descriptionId}
            className="min-h-9 py-2"
            value={values.description}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
        </label>
        <div className="flex items-end">
          <Button
            type="submit"
            className="w-full lg:w-auto"
            loading={createResult.waiting}
          >
            Add service area
          </Button>
        </div>
      </form>

      {nameError ? <FieldError>{nameError}</FieldError> : null}

      <AsyncResultError result={listResult} />
      <AsyncResultError result={createResult} />

      <ServiceAreasList
        serviceAreas={serviceAreas}
        waiting={listResult.waiting}
      />
    </AppUtilityPanel>
  );
}

function ServiceAreasList({
  serviceAreas,
  waiting,
}: {
  readonly serviceAreas: readonly ServiceArea[];
  readonly waiting: boolean;
}) {
  if (serviceAreas.length > 0) {
    return (
      <ul className="flex flex-col divide-y divide-border/60 border-y border-border/60">
        {serviceAreas.map((serviceArea) => (
          <li key={serviceArea.id} className="py-3">
            <ServiceAreaRow serviceArea={serviceArea} />
          </li>
        ))}
      </ul>
    );
  }

  if (waiting) {
    return (
      <p className="text-sm text-muted-foreground">Loading service areas...</p>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      No service areas have been added yet.
    </p>
  );
}

function ServiceAreaRow({
  serviceArea,
}: {
  readonly serviceArea: ServiceArea;
}) {
  const updateResult = useAtomValue(
    updateServiceAreaMutationAtomFamily(serviceArea.id)
  );
  const updateServiceArea = useAtomSet(
    updateServiceAreaMutationAtomFamily(serviceArea.id),
    { mode: "promiseExit" }
  );
  const [isEditing, setIsEditing] = React.useState(false);
  const [values, setValues] = React.useState<ServiceAreaFormValues>(() => ({
    description: serviceArea.description ?? "",
    name: serviceArea.name,
  }));
  const [nameError, setNameError] = React.useState<string | null>(null);
  const nameId = React.useId();
  const descriptionId = React.useId();

  React.useEffect(() => {
    if (!isEditing) {
      setValues({
        description: serviceArea.description ?? "",
        name: serviceArea.name,
      });
      setNameError(null);
    }
  }, [isEditing, serviceArea.description, serviceArea.name]);

  async function handleSave() {
    const payload = buildServiceAreaPayload(values);

    if (!payload) {
      setNameError("Add a service area name.");
      return;
    }

    setNameError(null);
    const exit = await updateServiceArea(payload);

    if (Exit.isSuccess(exit)) {
      setIsEditing(false);
    }
  }

  return (
    <article
      aria-label={`Service area ${serviceArea.name}`}
      className="flex flex-col gap-3"
    >
      {isEditing ? (
        <FieldGroup className="gap-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(12rem,0.8fr)_minmax(14rem,1fr)_auto]">
            <label
              className="flex min-w-0 flex-col gap-1.5 text-sm font-medium"
              htmlFor={nameId}
            >
              Area name for {serviceArea.name}
              <Input
                id={nameId}
                value={values.name}
                aria-invalid={Boolean(nameError) || undefined}
                onChange={(event) => {
                  setNameError(null);
                  setValues((current) => ({
                    ...current,
                    name: event.target.value,
                  }));
                }}
              />
            </label>
            <label
              className="flex min-w-0 flex-col gap-1.5 text-sm font-medium"
              htmlFor={descriptionId}
            >
              Description for {serviceArea.name}
              <Textarea
                id={descriptionId}
                className="min-h-9 py-2"
                value={values.description}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </label>
            <div className="flex items-end gap-2">
              <Button
                type="button"
                size="sm"
                loading={updateResult.waiting}
                onClick={() => void handleSave()}
              >
                Save {serviceArea.name}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={updateResult.waiting}
                onClick={() => setIsEditing(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
          {nameError ? <FieldError>{nameError}</FieldError> : null}
          <AsyncResultError result={updateResult} />
        </FieldGroup>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-foreground">
              {serviceArea.name}
            </h3>
            {serviceArea.description ? (
              <p className="text-sm/6 text-muted-foreground">
                {serviceArea.description}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setIsEditing(true)}
          >
            Edit {serviceArea.name}
          </Button>
        </div>
      )}
    </article>
  );
}

function buildServiceAreaPayload(values: ServiceAreaFormValues) {
  const name = values.name.trim();

  if (!name) {
    return null;
  }

  const description = values.description.trim();

  return {
    ...(description ? { description } : {}),
    name,
  };
}

function AsyncResultError({
  result,
}: {
  readonly result: Result.Result<unknown, unknown>;
}) {
  if (result._tag !== "Failure") {
    return null;
  }

  const error = Cause.squash(result.cause);

  return (
    <p role="alert" className="text-sm text-destructive">
      {error instanceof Error ? error.message : "Request failed."}
    </p>
  );
}
