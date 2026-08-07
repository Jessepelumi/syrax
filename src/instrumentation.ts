import { getEnvironment, isNodeRuntime } from "@/lib/env";

export function register(): void {
  if (isNodeRuntime()) {
    getEnvironment();
  }
}
