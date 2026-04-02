import { randomUUID } from "crypto";

import type { SearchRecord } from "@/lib/validations/routes";

declare global {
  var __easy2goSearches__: SearchRecord[] | undefined;
}

function getStore() {
  if (!globalThis.__easy2goSearches__) {
    globalThis.__easy2goSearches__ = [];
  }

  return globalThis.__easy2goSearches__;
}

export async function createSearchRecord(origin: string, destination: string) {
  const record: SearchRecord = {
    id: randomUUID(),
    origin,
    destination,
    createdAt: new Date().toISOString(),
  };

  const store = getStore();
  store.unshift(record);
  store.splice(12);

  return record;
}

export async function getRecentSearches() {
  return getStore().slice(0, 8);
}
