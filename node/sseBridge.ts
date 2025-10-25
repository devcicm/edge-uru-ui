import express = require("express");

export interface RawBiometricEvent {
  eventType?: string;
  evt?: string;
  severity?: string;
  origin?: string;
  timestamp?: string;
  [key: string]: any;
}

export type EventProcessor = (event: RawBiometricEvent) => RawBiometricEvent | RawBiometricEvent[] | null;

type SseClient = { id: number; res: express.Response };

export class SseBridge {
  private clients = new Map<number, SseClient>();
  private processors: EventProcessor[] = [];
  private nextId = 1;

  constructor(private readonly logger: (message: string, ...meta: any[]) => void = () => undefined) {
    // Default processors
    this.registerProcessor(this.ensureEventType);
    this.registerProcessor(this.attachServerTimestamp);
  }

  attachClient(res: express.Response): () => void {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    if (typeof (res as any).flushHeaders === "function") {
      (res as any).flushHeaders();
    }

    const id = this.nextId++;
    this.clients.set(id, { id, res });
    this.logger(`[SSE] client connected (#${id})`);

    this.send(res, { evt: "hello", clientId: id });

    const detach = () => {
      if (this.clients.delete(id)) {
        this.logger(`[SSE] client disconnected (#${id})`);
      }
    };

    return detach;
  }

  registerProcessor(processor: EventProcessor): void {
    this.processors.push(processor);
  }

  emit(event: RawBiometricEvent, metadata: Record<string, any> = {}): void {
    let events: RawBiometricEvent[] = [{ ...event, ...metadata }];

    for (const processor of this.processors) {
      if (!events.length) {
        break;
      }

      const nextEvents: RawBiometricEvent[] = [];
      for (const current of events) {
        const processed = processor(current);
        if (processed === null) {
          continue;
        }
        if (Array.isArray(processed)) {
          for (const item of processed) {
            if (item) {
              nextEvents.push(item);
            }
          }
        } else {
          nextEvents.push(processed);
        }
      }
      events = nextEvents;
    }

    if (!events.length) {
      this.logger("[SSE] event dropped by processors", event);
      return;
    }

    for (const finalEvent of events) {
      const payload = `data: ${JSON.stringify(finalEvent)}\n\n`;
      for (const { res } of this.clients.values()) {
        res.write(payload);

        // 🔥 FLUSH inmediato para enviar eventos en tiempo real (sin buffering)
        if (typeof (res as any).flush === "function") {
          (res as any).flush();
        }
      }
    }
  }

  private send(res: express.Response, event: RawBiometricEvent): void {
    res.write(`data: ${JSON.stringify(event)}\n\n`);

    // Flush inmediato
    if (typeof (res as any).flush === "function") {
      (res as any).flush();
    }
  }

  private ensureEventType(event: RawBiometricEvent): RawBiometricEvent {
    if (!event.eventType && typeof event.evt === "string") {
      event.eventType = event.evt;
    }
    return event;
  }

  private attachServerTimestamp(event: RawBiometricEvent): RawBiometricEvent {
    if (!event.serverTimestamp) {
      event.serverTimestamp = new Date().toISOString();
    }
    return event;
  }
}
