import { Logging } from "@antelopejs/interface-core/logging";
import type {
  JsonObject,
  JsonSchema,
  TriggerType,
} from "@antelopejs/interface-dms-automation";
import { admitAutomationEvent } from "./loop-guard";
import { automationOriginFields } from "./origin";

/** Settings every media trigger reads, besides its own filters. */
export interface TriggerSettings {
  /** Fires only for this tenant; empty fires for every tenant. */
  tenantId?: string;
  /** Also fires for changes a procedure's media action made. */
  includeAutomationWrites?: boolean;
}

/** What every media trigger hands the graph: one tenant's change. */
export type TriggerPayload = JsonObject & { tenantId: string };

/** A payload, with what the filters read besides it. */
export interface ChannelEvent<TPayload extends TriggerPayload> {
  payload: TPayload;
  /** Ancestor ids then the folder id of the change, for folder filters. */
  folderPathIds?: readonly string[];
}

type EventFilter<TConfig, TPayload extends TriggerPayload> = (
  config: Partial<TConfig>,
  event: ChannelEvent<TPayload>,
) => boolean;

interface Subscription<TConfig, TPayload> {
  config: Partial<TConfig>;
  emit: (payload: TPayload) => void;
}

/**
 * How a trigger treats a change a procedure's write caused: `filtered`
 * delivers it only with `includeAutomationWrites`, behind the loop guard;
 * `delivered` delivers it like any other change.
 */
export type AutomationWritePolicy = "filtered" | "delivered";

const channels = new Set<{ clear(): void; readonly isArmed: boolean }>();

/** Whether a tenant's events reach a subscription with these settings. */
export function acceptsTenant(
  config: TriggerSettings,
  tenantId: string,
): boolean {
  const wanted = config.tenantId?.trim();
  return !wanted || wanted === tenantId;
}

/** Whether a subscription with these settings takes an event a procedure caused or not. */
function acceptsOrigin(
  config: TriggerSettings,
  isAutomationWrite: boolean,
): boolean {
  return !isAutomationWrite || config.includeAutomationWrites === true;
}

/**
 * The in-process fan-out of one trigger: every armed subscription of this
 * instance receives the events its settings accept. A subscriber that throws
 * is logged and the others still receive the event. Subscribers deduplicate
 * on the payload's `deliveryId`.
 */
export class TriggerChannel<
  TConfig extends TriggerSettings,
  TPayload extends TriggerPayload,
> {
  private readonly subscriptions = new Map<
    string,
    Subscription<TConfig, TPayload>
  >();

  private nextIndex = 1;

  constructor(
    readonly id: string,
    private readonly accepts: EventFilter<TConfig, TPayload> = () => true,
    readonly automationWrites: AutomationWritePolicy = "filtered",
  ) {
    channels.add(this);
  }

  get isArmed(): boolean {
    return this.subscriptions.size > 0;
  }

  /** The settings of every armed subscription. */
  configs(): Partial<TConfig>[] {
    return [...this.subscriptions.values()].map(
      (subscription) => subscription.config,
    );
  }

  subscribe(
    config: Partial<TConfig> | undefined,
    emit: (payload: TPayload) => void,
  ): string {
    const handle = `${this.id}:${this.nextIndex}`;
    this.nextIndex += 1;
    this.subscriptions.set(handle, { config: config ?? {}, emit });
    return handle;
  }

  unsubscribe(handle: string): void {
    this.subscriptions.delete(handle);
  }

  /**
   * Emits a change: one a procedure's write caused carries the procedure and
   * its run and, on a `filtered` channel, passes the circuit breaker on
   * `subject` first, counted only when a subscription takes it.
   */
  emit(subject: string, event: ChannelEvent<TPayload>): void {
    const origin = automationOriginFields();
    const isFiltered = this.automationWrites === "filtered";
    const isAutomationWrite =
      isFiltered && origin.originProcedureId !== undefined;
    const payload = { ...event.payload, ...origin };
    const receivers = [...this.subscriptions].filter(
      ([, { config }]) =>
        acceptsTenant(config, payload.tenantId) &&
        acceptsOrigin(config, isAutomationWrite) &&
        this.accepts(config, { ...event, payload }),
    );
    if (receivers.length === 0) return;
    if (isAutomationWrite && !admitAutomationEvent(this.id, subject)) return;
    for (const [handle, subscription] of receivers)
      this.deliver(handle, subscription, payload);
  }

  clear(): void {
    this.subscriptions.clear();
  }

  private deliver(
    handle: string,
    subscription: Subscription<TConfig, TPayload>,
    payload: TPayload,
  ): void {
    try {
      subscription.emit(payload);
    } catch (error) {
      Logging.Warn(
        `[dms-media] Automation subscription "${handle}" failed on a "${this.id}" event:`,
        error,
      );
    }
  }
}

/** Whether any media trigger has a subscription on this instance. */
export function isAnyTriggerArmed(): boolean {
  return [...channels].some((channel) => channel.isArmed);
}

/** Drops every subscription of every trigger, so a restarted module starts from nothing. */
export function clearTriggerSubscriptions(): void {
  for (const channel of channels) channel.clear();
}

/** A trigger's texts and its own settings and outputs. */
export interface TriggerSpec {
  name: string;
  description: string;
  icon: string;
  configProperties: Record<string, JsonSchema>;
  outputProperties: Record<string, JsonSchema>;
}

const TENANT_CONFIG: JsonSchema = {
  type: "string",
  maxLength: 255,
  description:
    "Tenant id the trigger fires for. Leave empty to fire for every tenant.",
};

const AUTOMATION_WRITES_CONFIG: JsonSchema = {
  type: "boolean",
  default: false,
  description:
    "Also fire for changes a procedure's media action made. Off by default, so a procedure does not answer its own writes.",
};

const ACTOR_KINDS = ["member", "declared", "automation"];

const COMMON_OUTPUTS = {
  tenantId: { type: "string", description: "Tenant of the change" },
  deliveryId: {
    type: "string",
    description: "Same value for a repeated delivery of one change",
  },
  actorId: {
    type: "string",
    description:
      "Member user id, `dms-media:declared` or `dms-media:automation`",
  },
  actorName: {
    type: "string",
    description: "Member name, else email; `System`; `Automation`",
  },
  actorKind: { type: "string", enum: ACTOR_KINDS },
  at: { type: "string", description: "ISO time of the change" },
  originProcedureId: {
    type: "string",
    description: "Procedure whose write caused the change; absent otherwise",
  },
  originRunId: {
    type: "string",
    description: "Run of that procedure; absent otherwise",
  },
} satisfies Record<string, JsonSchema>;

/** The `includeAutomationWrites` setting, which only a `filtered` trigger offers. */
interface AutomationWritesSetting {
  includeAutomationWrites?: JsonSchema;
}

function automationWritesConfig(
  policy: AutomationWritePolicy,
): AutomationWritesSetting {
  if (policy === "filtered")
    return { includeAutomationWrites: AUTOMATION_WRITES_CONFIG };
  return {};
}

/**
 * The trigger type of a channel. Every media trigger arms on every instance
 * (`replicated`): the change exists only in the process that made it.
 */
export function channelTrigger<
  TConfig extends TriggerSettings,
  TPayload extends TriggerPayload,
>(
  channel: TriggerChannel<TConfig, TPayload>,
  spec: TriggerSpec,
): TriggerType<Partial<TConfig>, TPayload, string> {
  return {
    id: channel.id,
    name: spec.name,
    description: spec.description,
    icon: spec.icon,
    cluster: "replicated",
    configSchema: {
      type: "object",
      properties: {
        tenantId: TENANT_CONFIG,
        ...spec.configProperties,
        ...automationWritesConfig(channel.automationWrites),
      },
    },
    outputSchema: {
      type: "object",
      properties: { ...COMMON_OUTPUTS, ...spec.outputProperties },
    },
    activate(config, emit) {
      return Promise.resolve(channel.subscribe(config, emit));
    },
    deactivate(handle) {
      channel.unsubscribe(handle);
      return Promise.resolve();
    },
  };
}
