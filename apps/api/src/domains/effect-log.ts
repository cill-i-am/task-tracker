import { makeEffectLogEmitter } from "@ceird/observability-core";
import type { EffectLogEntry, EffectLogSink } from "@ceird/observability-core";

export type ApiEffectLogEntry = EffectLogEntry;
export type ApiEffectLogSink = EffectLogSink<ApiEffectLogEntry>;

const apiEffectLogger = makeEffectLogEmitter<ApiEffectLogEntry>();
export function emitApiEffectLog(entry: ApiEffectLogEntry) {
  apiEffectLogger.emit(entry);
}

export async function withApiEffectLogSinkForTest<Result>(
  sink: ApiEffectLogSink,
  execute: () => Result | Promise<Result>
): Promise<Result> {
  return await apiEffectLogger.withSinkForTest(sink, execute);
}
