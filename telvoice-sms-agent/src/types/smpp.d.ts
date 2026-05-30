declare module "smpp" {
  export interface SmppPdu {
    command_status: number;
    message_id?: string;
    short_message?: { message?: string };
  }

  export interface SmppSession {
    bind_transceiver(
      params: Record<string, unknown>,
      cb: (pdu: SmppPdu) => void,
    ): void;
    bind_transmitter(
      params: Record<string, unknown>,
      cb: (pdu: SmppPdu) => void,
    ): void;
    bind_receiver(
      params: Record<string, unknown>,
      cb: (pdu: SmppPdu) => void,
    ): void;
    submit_sm(
      params: Record<string, unknown>,
      cb: (pdu: SmppPdu) => void,
    ): void;
    close(): void;
    on(event: "error" | "close" | "deliver_sm", cb: (...args: unknown[]) => void): void;
  }

  export function connect(
    options: { url: string; auto_enquire_link_period?: number },
    callback?: () => void,
  ): SmppSession;
}
