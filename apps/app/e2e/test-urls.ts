export const DEFAULT_APP_ORIGIN = "http://127.0.0.1:4173";
export const DEFAULT_API_ORIGIN = "http://127.0.0.1:3001";
export const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:5439/ceird";

export const APP_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? DEFAULT_APP_ORIGIN;

export const API_ORIGIN = process.env.PLAYWRIGHT_API_URL ?? DEFAULT_API_ORIGIN;

export const DATABASE_URL =
  process.env.PLAYWRIGHT_DATABASE_URL ??
  process.env.DATABASE_URL ??
  DEFAULT_DATABASE_URL;
