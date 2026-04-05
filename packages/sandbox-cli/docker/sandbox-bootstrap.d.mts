export function getInstallLockTimeoutMs(env: NodeJS.ProcessEnv): number;

export function acquireInstallLock(input: {
  readonly installLock: string;
  readonly timeoutMs: number;
  readonly mkdir: (path: string) => Promise<void>;
  readonly sleep: (durationMs: number) => Promise<void>;
  readonly now: () => number;
}): Promise<void>;
