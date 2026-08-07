import { createId } from "@paralleldrive/cuid2";

export function newId(prefix: string): string {
  return `${prefix}_${createId()}`;
}
