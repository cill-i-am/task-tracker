import { Effect } from "effect";

import {
  makeEffectLogEmitter,
  readErrorName,
  readHttpStatus,
  readSafeCorrelationId,
  readSafeRequestPath,
  readStringProperty,
} from "./index.js";

describe(readSafeRequestPath, () => {
  it("keeps only the path for absolute URLs", () => {
    expect(
      readSafeRequestPath("https://app.ceird.app/jobs?token=secret#section")
    ).toBe("/jobs");
  });

  it("redacts query strings and fragments from relative paths", () => {
    expect(readSafeRequestPath("/jobs/123?token=secret#section")).toBe(
      "/jobs/123"
    );
  });

  it("uses root for absolute origins without a pathname", () => {
    expect(readSafeRequestPath("https://app.ceird.app?token=secret")).toBe("/");
  });
});

describe(makeEffectLogEmitter, () => {
  it("temporarily replaces the log sink for tests", async () => {
    const entries: unknown[] = [];
    const emitter = makeEffectLogEmitter();

    await emitter.withSinkForTest(
      (entry) =>
        Effect.sync(() => {
          entries.push(entry);
        }),
      () => {
        emitter.emit({
          level: "info",
          message: "test event",
        });
      }
    );

    expect(entries).toStrictEqual([
      {
        level: "info",
        message: "test event",
      },
    ]);
  });

  it("serializes temporary test sinks so concurrent captures do not bleed", async () => {
    const firstEntries: unknown[] = [];
    const secondEntries: unknown[] = [];
    const emitter = makeEffectLogEmitter();

    await Promise.all([
      emitter.withSinkForTest(
        (entry) =>
          Effect.sync(() => {
            firstEntries.push(entry);
          }),
        async () => {
          await Effect.sleep(1).pipe(Effect.runPromise);
          emitter.emit({
            level: "info",
            message: "first event",
          });
        }
      ),
      emitter.withSinkForTest(
        (entry) =>
          Effect.sync(() => {
            secondEntries.push(entry);
          }),
        () => {
          emitter.emit({
            level: "info",
            message: "second event",
          });
        }
      ),
    ]);

    expect(firstEntries).toStrictEqual([
      {
        level: "info",
        message: "first event",
      },
    ]);
    expect(secondEntries).toStrictEqual([
      {
        level: "info",
        message: "second event",
      },
    ]);
  });
});

describe(readSafeCorrelationId, () => {
  it("accepts generated request ids and Cloudflare Ray ids", () => {
    expect(readSafeCorrelationId("11111111-1111-4111-8111-111111111111")).toBe(
      "11111111-1111-4111-8111-111111111111"
    );
    expect(readSafeCorrelationId("0123456789abcdef-DUB")).toBe(
      "0123456789abcdef-DUB"
    );
  });

  it("rejects arbitrary, oversized, or sensitive-looking header values", () => {
    expect(readSafeCorrelationId("codex-e2e@example.com")).toBeUndefined();
    expect(readSafeCorrelationId("Bearer abc123")).toBeUndefined();
    expect(readSafeCorrelationId("a".repeat(129))).toBeUndefined();
    expect(readSafeCorrelationId("request-123")).toBeUndefined();
  });
});

describe(readErrorName, () => {
  it("returns safe names without exposing error messages", () => {
    expect(readErrorName(new TypeError("secret URL"))).toBe("TypeError");
    expect(readErrorName({ message: "secret" })).toBe("Object");
    expect(readErrorName("plain failure")).toBe("string");
  });
});

describe(readHttpStatus, () => {
  it("reads status and statusCode integer properties", () => {
    expect(readHttpStatus({ status: 503 })).toBe(503);
    expect(readHttpStatus({ statusCode: 404 })).toBe(404);
    expect(readHttpStatus({ status: 99 })).toBeUndefined();
  });
});

describe(readStringProperty, () => {
  it("reads non-empty string properties", () => {
    expect(readStringProperty({ _tag: "@ceird/test" }, "_tag")).toBe(
      "@ceird/test"
    );
    expect(readStringProperty({ _tag: "" }, "_tag")).toBeUndefined();
  });
});
