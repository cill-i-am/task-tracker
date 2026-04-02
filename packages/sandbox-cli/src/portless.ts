import type { SandboxPorts } from "@task-tracker/sandbox-core";

export interface BuildPortlessAliasCommandsInput {
  readonly hostnameSlug: string;
  readonly ports: SandboxPorts;
}

export interface PortlessAliasCommands {
  readonly add: readonly (readonly [string, ...string[]])[];
  readonly remove: readonly (readonly [string, ...string[]])[];
}

export function buildPortlessAliasCommands(
  input: BuildPortlessAliasCommandsInput
): PortlessAliasCommands {
  return {
    add: buildPortlessAliasAddCommands(input),
    remove: buildPortlessAliasRemoveCommands(input.hostnameSlug),
  };
}

export function buildPortlessAliasAddCommands(
  input: BuildPortlessAliasCommandsInput
): readonly (readonly [string, ...string[]])[] {
  const appName = `${input.hostnameSlug}.app.task-tracker`;
  const apiName = `${input.hostnameSlug}.api.task-tracker`;

  return [
    ["portless", "alias", appName, String(input.ports.app), "--force"],
    ["portless", "alias", apiName, String(input.ports.api), "--force"],
  ];
}

export function buildPortlessAliasRemoveCommands(
  hostnameSlug: string
): readonly (readonly [string, ...string[]])[] {
  const appName = `${hostnameSlug}.app.task-tracker`;
  const apiName = `${hostnameSlug}.api.task-tracker`;

  return [
    ["portless", "alias", "--remove", appName],
    ["portless", "alias", "--remove", apiName],
  ];
}
