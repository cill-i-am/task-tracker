import { readServerApiForwardedHeaders } from "./server-api-forwarded-headers";

describe(readServerApiForwardedHeaders, () => {
  it("defaults production hosts to https when no forwarded protocol is present", () => {
    expect(
      readServerApiForwardedHeaders({
        forwardedHost: undefined,
        forwardedProto: undefined,
        host: "app.ceird.app",
        origin: undefined,
      })
    ).toStrictEqual({
      origin: "https://app.ceird.app",
      "x-forwarded-host": "api.ceird.app",
      "x-forwarded-proto": "https",
    });
  });

  it("keeps loopback hosts on http when no forwarded protocol is present", () => {
    expect(
      readServerApiForwardedHeaders({
        forwardedHost: undefined,
        forwardedProto: undefined,
        host: "127.0.0.1:3000",
        origin: undefined,
      })
    ).toStrictEqual({
      origin: "http://127.0.0.1:3000",
      "x-forwarded-host": "127.0.0.1:3001",
      "x-forwarded-proto": "http",
    });
  });

  it("drops unsafe request ids before forwarding to the API", () => {
    expect(
      readServerApiForwardedHeaders({
        cfRay: "0123456789abcdef-DUB",
        forwardedHost: undefined,
        forwardedProto: undefined,
        host: "app.ceird.app",
        origin: undefined,
        requestId: "codex-e2e@example.com",
      })
    ).toStrictEqual({
      origin: "https://app.ceird.app",
      "x-ceird-request-id": "0123456789abcdef-DUB",
      "x-forwarded-host": "api.ceird.app",
      "x-forwarded-proto": "https",
    });
  });
});
