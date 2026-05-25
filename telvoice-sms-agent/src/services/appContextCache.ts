import type { CompanyRow } from "../types/tenant.js";
import type { UserProfileContext } from "../types/tenant.js";
import type { CompanyBalanceView } from "../types/wallet.js";
import { findCompanyById } from "./companyService.js";
import { getCompanyBalance } from "./smsWalletService.js";

export type AppContextCore = {
  profile: UserProfileContext;
  company: CompanyRow;
  balance: CompanyBalanceView;
};

const TTL_MS = 45_000;
const MAX_ENTRIES = 500;

type CacheEntry = {
  value: AppContextCore;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

function cacheKey(profile: UserProfileContext): string | null {
  if (!profile.companyId) {
    return null;
  }
  const actor =
    profile.profileId ?? profile.adminUserId ?? profile.email ?? "anon";
  return `${actor}:${profile.companyId}`;
}

function pruneIfNeeded(): void {
  if (cache.size <= MAX_ENTRIES) {
    return;
  }
  const now = Date.now();
  for (const [k, v] of cache) {
    if (v.expiresAt <= now) {
      cache.delete(k);
    }
  }
  if (cache.size > MAX_ENTRIES) {
    const drop = cache.size - MAX_ENTRIES;
    let i = 0;
    for (const k of cache.keys()) {
      cache.delete(k);
      if (++i >= drop) {
        break;
      }
    }
  }
}

export function invalidateAppContextCache(companyId?: string): void {
  if (!companyId) {
    cache.clear();
    return;
  }
  for (const [k] of cache) {
    if (k.endsWith(`:${companyId}`)) {
      cache.delete(k);
    }
  }
}

export async function loadAppContextCore(
  profile: UserProfileContext,
): Promise<AppContextCore | null> {
  if (!profile.companyId) {
    return null;
  }

  const key = cacheKey(profile);
  if (key) {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.value;
    }
  }

  const company = await findCompanyById(profile.companyId);
  if (!company) {
    return null;
  }

  const balance = await getCompanyBalance(profile.companyId);
  const value: AppContextCore = { profile, company, balance };

  if (key) {
    cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
    pruneIfNeeded();
  }

  return value;
}
