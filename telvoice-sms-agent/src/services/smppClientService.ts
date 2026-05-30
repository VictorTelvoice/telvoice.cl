import smpp from "smpp";
import type { SmppSession } from "smpp";
import type { SmppBindType } from "../types/smpp-lab.js";
import { enquireLinkIntervalMs } from "../types/smpp-lab.js";

const SEND_TIMEOUT_MS = 25_000;
const DLR_WAIT_MS = 8_000;

const SMPP_STATUS_MESSAGES: Record<number, string> = {
  0x00000000: "OK",
  0x00000001: "Invalid message length",
  0x00000002: "Invalid command length",
  0x00000003: "Invalid command ID",
  0x00000004: "Incorrect bind status",
  0x00000005: "Already bound",
  0x0000000d: "Bind failed",
  0x0000000e: "Invalid password",
  0x0000000f: "Invalid system ID",
  0x00000011: "Invalid source address",
  0x00000014: "Message queue full",
  0x00000058: "Throttling error",
};

export function sanitizeSmppErrorMessage(
  code: number | null | undefined,
  fallback?: string,
): string {
  if (code != null && SMPP_STATUS_MESSAGES[code]) {
    return SMPP_STATUS_MESSAGES[code]!;
  }
  const raw = String(fallback ?? "").trim();
  if (!raw) return code != null ? `SMPP error ${code}` : "Unknown SMPP error";
  return raw.replace(/password[=:\s]\S+/gi, "[redacted]").slice(0, 240);
}

export interface SmppConnectionConfig {
  host: string;
  port: number;
  transmitter_port: number;
  receiver_port: number;
  system_id: string;
  password: string;
  system_type: string;
  bind_type: SmppBindType;
  addr_ton: number;
  addr_npi: number;
  source_addr_ton: number;
  source_addr_npi: number;
  dest_addr_ton: number;
  dest_addr_npi: number;
  source_address: string | null;
  enquire_link_interval: number;
  response_timeout_seconds: number;
  phone_number_prepend: string | null;
  sender_id_prefix: string | null;
  message_types_allowed: string;
  tlv_tag: string | null;
  tlv_value: string | null;
  send_validity_period_as_null: boolean;
}

export interface SmppBindTestOutcome {
  success: boolean;
  error_code: number | null;
  error_message: string | null;
  latency_ms: number;
}

export interface SmppSendTestOutcome {
  submit_status: "submitted" | "failed";
  provider_message_id: string | null;
  command_status: number | null;
  error_message: string | null;
  dlr_status: "pending" | "delivered" | "failed" | "unknown";
}

function bindParams(config: SmppConnectionConfig): Record<string, unknown> {
  return {
    system_id: config.system_id,
    password: config.password,
    system_type: config.system_type || "",
    interface_version: 0x34,
    addr_ton: config.addr_ton,
    addr_npi: config.addr_npi,
    address_range: config.source_address ?? "",
  };
}

function runBind(
  session: smpp.SmppSession,
  config: SmppConnectionConfig,
): Promise<SmppPduResult> {
  return new Promise((resolve) => {
    const params = bindParams(config);
    const cb = (pdu: { command_status: number }) => {
      resolve({ command_status: pdu?.command_status ?? 0x0000000d });
    };
    if (config.bind_type === "transmitter") {
      session.bind_transmitter(params, cb);
    } else if (config.bind_type === "receiver") {
      session.bind_receiver(params, cb);
    } else {
      session.bind_transceiver(params, cb);
    }
  });
}

interface SmppPduResult {
  command_status: number;
  message_id?: string;
}

function bindTimeoutMs(config: SmppConnectionConfig): number {
  const sec = config.response_timeout_seconds;
  if (Number.isFinite(sec) && sec > 0) {
    return Math.min(Math.max(sec * 1000, 5000), 120_000);
  }
  return 20_000;
}

function applyPhonePrepend(
  destination: string,
  prepend: string | null | undefined,
): string {
  const digits = destination.replace(/\D/g, "");
  const prefix = String(prepend ?? "").replace(/\D/g, "");
  if (!prefix) return digits;
  if (digits.startsWith(prefix)) return digits;
  return `${prefix}${digits}`;
}

function applySenderPrefix(
  source: string,
  prefix: string | null | undefined,
): string {
  const p = String(prefix ?? "").trim();
  if (!p) return source;
  if (source.startsWith(p)) return source;
  return `${p}${source}`;
}

function buildOptionalTlv(
  config: SmppConnectionConfig,
): Record<string, unknown> | undefined {
  const tagRaw = String(config.tlv_tag ?? "").trim();
  const value = String(config.tlv_value ?? "").trim();
  if (!tagRaw || !value) return undefined;
  const tag = Number.parseInt(tagRaw, 10);
  if (!Number.isFinite(tag) || tag <= 0) return undefined;
  return { [`tlv_${tag}`]: value };
}

export async function executeSmppBindTest(
  config: SmppConnectionConfig,
): Promise<SmppBindTestOutcome> {
  const started = Date.now();
  const timeoutMs = bindTimeoutMs(config);
  const enquireMs = config.enquire_link_interval || enquireLinkIntervalMs(45);

  return new Promise((resolve) => {
    let settled = false;
    let session: SmppSession | null = null;

    const finish = (outcome: SmppBindTestOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        session?.close();
      } catch {
        /* ignore */
      }
      resolve(outcome);
    };

    const timer = setTimeout(() => {
      finish({
        success: false,
        error_code: null,
        error_message: "Connection timeout",
        latency_ms: Date.now() - started,
      });
    }, timeoutMs);

    try {
      session = smpp.connect(
        {
          url: `smpp://${config.host}:${config.port}`,
          auto_enquire_link_period: enquireMs,
        },
        () => {
          if (!session) return;
          runBind(session, config)
            .then((pdu) => {
              const latency = Date.now() - started;
              if (pdu.command_status === 0) {
                finish({
                  success: true,
                  error_code: null,
                  error_message: null,
                  latency_ms: latency,
                });
              } else {
                finish({
                  success: false,
                  error_code: pdu.command_status,
                  error_message: sanitizeSmppErrorMessage(pdu.command_status),
                  latency_ms: latency,
                });
              }
            })
            .catch((err: unknown) => {
              finish({
                success: false,
                error_code: null,
                error_message: sanitizeSmppErrorMessage(
                  undefined,
                  err instanceof Error ? err.message : String(err),
                ),
                latency_ms: Date.now() - started,
              });
            });
        },
      );

      session.on("error", (err: unknown) => {
        finish({
          success: false,
          error_code: null,
          error_message: sanitizeSmppErrorMessage(
            undefined,
            err instanceof Error ? err.message : String(err),
          ),
          latency_ms: Date.now() - started,
        });
      });
    } catch (err: unknown) {
      finish({
        success: false,
        error_code: null,
        error_message: sanitizeSmppErrorMessage(
          undefined,
          err instanceof Error ? err.message : String(err),
        ),
        latency_ms: Date.now() - started,
      });
    }
  });
}

export async function executeSmppSendTest(
  config: SmppConnectionConfig,
  opts: {
    destination_number: string;
    source_address: string;
    message_text: string;
  },
): Promise<SmppSendTestOutcome> {
  const timeoutMs = bindTimeoutMs(config) + SEND_TIMEOUT_MS + DLR_WAIT_MS;
  const enquireMs = config.enquire_link_interval || enquireLinkIntervalMs(45);
  const destination = applyPhonePrepend(
    opts.destination_number,
    config.phone_number_prepend,
  );
  const source = applySenderPrefix(
    opts.source_address,
    config.sender_id_prefix,
  );

  const submitParams: Record<string, unknown> = {
    source_addr_ton: config.source_addr_ton,
    source_addr_npi: config.source_addr_npi,
    source_addr: source,
    dest_addr_ton: config.dest_addr_ton,
    dest_addr_npi: config.dest_addr_npi,
    destination_addr: destination,
    short_message: opts.message_text.slice(0, 160),
    ...buildOptionalTlv(config),
  };

  if (config.send_validity_period_as_null) {
    submitParams.validity_period = null;
  }

  return new Promise((resolve) => {
    let settled = false;
    let session: SmppSession | null = null;
    let dlrStatus: SmppSendTestOutcome["dlr_status"] = "pending";
    let dlrTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (outcome: SmppSendTestOutcome) => {
      if (settled) return;
      settled = true;
      if (dlrTimer) clearTimeout(dlrTimer);
      clearTimeout(timer);
      try {
        session?.close();
      } catch {
        /* ignore */
      }
      resolve(outcome);
    };

    const timer = setTimeout(() => {
      finish({
        submit_status: "failed",
        provider_message_id: null,
        command_status: null,
        error_message: "Send test timeout",
        dlr_status: dlrStatus,
      });
    }, timeoutMs);

    try {
      session = smpp.connect(
        {
          url: `smpp://${config.host}:${config.port}`,
          auto_enquire_link_period: enquireMs,
        },
        () => {
          if (!session) return;
          runBind(session, config)
            .then((bindPdu) => {
              if (bindPdu.command_status !== 0) {
                finish({
                  submit_status: "failed",
                  provider_message_id: null,
                  command_status: bindPdu.command_status,
                  error_message: sanitizeSmppErrorMessage(bindPdu.command_status),
                  dlr_status: "unknown",
                });
                return;
              }

              session!.on("deliver_sm", (pdu: unknown) => {
                const p = pdu as { short_message?: { message?: string } };
                const msg = String(p?.short_message?.message ?? "").toLowerCase();
                if (msg.includes("deliv") || msg.includes("success")) {
                  dlrStatus = "delivered";
                } else if (msg.includes("fail") || msg.includes("reject")) {
                  dlrStatus = "failed";
                }
              });

              session!.submit_sm(
                submitParams,
                (submitPdu: { command_status: number; message_id?: string }) => {
                  if (submitPdu.command_status === 0) {
                    dlrTimer = setTimeout(() => {
                      finish({
                        submit_status: "submitted",
                        provider_message_id: submitPdu.message_id ?? null,
                        command_status: 0,
                        error_message: null,
                        dlr_status: dlrStatus,
                      });
                    }, DLR_WAIT_MS);
                  } else {
                    finish({
                      submit_status: "failed",
                      provider_message_id: null,
                      command_status: submitPdu.command_status,
                      error_message: sanitizeSmppErrorMessage(
                        submitPdu.command_status,
                      ),
                      dlr_status: "unknown",
                    });
                  }
                },
              );
            })
            .catch((err: unknown) => {
              finish({
                submit_status: "failed",
                provider_message_id: null,
                command_status: null,
                error_message: sanitizeSmppErrorMessage(
                  undefined,
                  err instanceof Error ? err.message : String(err),
                ),
                dlr_status: "unknown",
              });
            });
        },
      );

      session.on("error", (err: unknown) => {
        finish({
          submit_status: "failed",
          provider_message_id: null,
          command_status: null,
          error_message: sanitizeSmppErrorMessage(
            undefined,
            err instanceof Error ? err.message : String(err),
          ),
          dlr_status: "unknown",
        });
      });
    } catch (err: unknown) {
      finish({
        submit_status: "failed",
        provider_message_id: null,
        command_status: null,
        error_message: sanitizeSmppErrorMessage(
          undefined,
          err instanceof Error ? err.message : String(err),
        ),
        dlr_status: "unknown",
      });
    }
  });
}
