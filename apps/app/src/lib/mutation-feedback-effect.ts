"use client";
import { Effect } from "effect";

import { beginMutationFeedback } from "./mutation-feedback";

export function withMinimumMutationPendingDurationEffect<
  Success,
  Failure,
  Requirements,
>(effect: Effect.Effect<Success, Failure, Requirements>) {
  const feedback = beginMutationFeedback();

  return effect.pipe(
    Effect.tap(() => Effect.promise(() => feedback.waitForSuccess()))
  );
}
