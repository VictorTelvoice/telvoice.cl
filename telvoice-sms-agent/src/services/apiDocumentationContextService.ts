import type { ApiDocContentOptions } from "../views/app-ui/api-documentation-content.js";
import { resolveClientApiProductionStatus } from "./clientApiProductionStatusService.js";
import { listClientApiKeys } from "./clientApiKeyService.js";
import {
  buildApiDocContentOptions,
  resolveApiDocMode,
} from "../views/app-ui/api-documentation-content.js";

export async function resolveApiDocContentForCompany(
  companyId: string,
): Promise<ApiDocContentOptions> {
  const status = await resolveClientApiProductionStatus(companyId);
  let keyMaskedHint: string | null = null;

  if (resolveApiDocMode(status) === "production" && status.primaryProductionKeyId) {
    const listed = await listClientApiKeys(companyId);
    if (listed.ok) {
      const primary = listed.data.find((k) => k.id === status.primaryProductionKeyId);
      keyMaskedHint = primary?.keyMasked ?? null;
    }
    if (!keyMaskedHint && status.primaryProductionKeyPrefix) {
      keyMaskedHint = `${status.primaryProductionKeyPrefix.slice(0, 8)}••••••••••••xxxx`;
    }
  }

  return buildApiDocContentOptions(status, keyMaskedHint);
}
