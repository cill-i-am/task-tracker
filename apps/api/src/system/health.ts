import { Schema } from "effect";

export const HealthPayload = Schema.Struct({
  ok: Schema.Literal(true),
  service: Schema.Literal("api"),
  stage: Schema.String,
});
export type HealthPayload = Schema.Schema.Type<typeof HealthPayload>;

export function makeHealthPayload(stage: string): HealthPayload {
  return {
    ok: true,
    service: "api",
    stage: stage.length > 0 ? stage : "local",
  };
}
