import smpp from "smpp";
import type { SmppSession } from "smpp";
import type { SmppBindType } from "../types/smpp-lab.js";

const BIND_TIMEOUT_MS = 20_000;
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
  system_id: string;
  password: string;
  system_type: string;
  bind_type: SmppBindType;
  source_addr_ton: number;
  source_addr_npi: number;
  source_address: string | null;
  enquire_link_interval: number;
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
    addr_ton: config.source_addr_ton,
    addr_npi: config.source_addr_npi,
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

export async function executeSmppBindTest(
  config: SmppConnectionConfig,
): Promise<SmppBindTestOutcome> {
  const started = Date.now();
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
    }, BIND_TIMEOUT_MS);

    try {
      session = smpp.connect(
        {
          url: `smpp://${config.host}:${config.port}`,
          auto_enquire_link_period: config.enquire_link_interval || 30_000,
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
    }, SEND_TIMEOUT_MS + DLR_WAIT_MS);

    try {
      session = smpp.connect(
        {
          url: `smpp://${config.host}:${config.port}`,
          auto_enquire_link_period: config.enquire_link_interval || 30_000,
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
                {
                  source_addr_ton: config.source_addr_ton,
                  source_addr_npi: config.source_addr_npi,
                  source_addr: opts.source_address,
                  dest_addr_ton: 1,
                  dest_addr_npi: 1,
                  destination_addr: opts.destination_number.replace(/\D/g, ""),
                  short_message: opts.message_text.slice(0, 160),
                },
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
