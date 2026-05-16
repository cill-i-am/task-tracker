"use client";
import type { OrganizationId } from "@ceird/identity-core";
import type { Label } from "@ceird/labels-core";
import { Atom } from "@effect-atom/atom-react";

export interface OrganizationLabelsState {
  readonly labels: readonly Label[];
  readonly organizationId: OrganizationId | null;
}

export const organizationLabelsStateAtom = Atom.make<OrganizationLabelsState>({
  labels: [],
  organizationId: null,
}).pipe(Atom.keepAlive);

export function seedOrganizationLabelsState(
  organizationId: OrganizationId,
  labels: readonly Label[]
): OrganizationLabelsState {
  return {
    labels,
    organizationId,
  };
}

export function upsertOrganizationLabel(
  labels: readonly Label[],
  label: Label
) {
  return [
    label,
    ...labels.filter((currentLabel) => currentLabel.id !== label.id),
  ].toSorted(compareLabels);
}

function compareLabels(left: Label, right: Label) {
  const nameComparison = left.name.localeCompare(right.name);

  return nameComparison === 0
    ? left.id.localeCompare(right.id)
    : nameComparison;
}
