import { buildPortlessAliasCommands } from "./portless.js";
describe("buildPortlessAliasCommands()", () => {
  it("builds deterministic add and remove alias commands for app and api", () => {
    expect(
      buildPortlessAliasCommands({
        hostnameSlug: "agent-one",
        ports: {
          app: 4300,
          api: 4301,
          postgres: 5439,
        },
      })
    ).toStrictEqual({
      add: [
        ["portless", "alias", "agent-one.app.task-tracker", "4300", "--force"],
        ["portless", "alias", "agent-one.api.task-tracker", "4301", "--force"],
      ],
      remove: [
        ["portless", "alias", "--remove", "agent-one.app.task-tracker"],
        ["portless", "alias", "--remove", "agent-one.api.task-tracker"],
      ],
    });
  }, 10_000);
});
