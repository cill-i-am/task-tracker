import { makeEffectLogEmitter } from "@ceird/observability-core";
import type { EffectLogEntry, EffectLogSink } from "@ceird/observability-core";

export type AppEffectLogEntry = EffectLogEntry;
export type AppEffectLogSink = EffectLogSink<AppEffectLogEntry>;

const appEffectLogger = makeEffectLogEmitter<AppEffectLogEntry>();
export function emitAppEffectLog(entry: AppEffectLogEntry) {
  appEffectLogger.emit(entry);
}

export async function withAppEffectLogSinkForTest<Result>(
  sink: AppEffectLogSink,
  execute: () => Result | Promise<Result>
): Promise<Result> {
  return await appEffectLogger.withSinkForTest(sink, execute);
}
