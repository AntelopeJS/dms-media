import { observeMediaEvents } from "../library/events";
import { createFileAction } from "./actions/create-file";
import { createReadUrlAction } from "./actions/create-read-url";
import { deleteFileAction } from "./actions/delete-file";
import { deleteFolderAction } from "./actions/delete-folder";
import { ensureFolderAction } from "./actions/ensure-folder";
import { updateFileDetailsAction } from "./actions/file-details";
import { setFileVisibilityAction } from "./actions/file-visibility";
import { setFolderVisibilityAction } from "./actions/folder-visibility";
import { getFileAction } from "./actions/get-file";
import { getStorageUsageAction } from "./actions/get-storage-usage";
import { listFolderFilesAction } from "./actions/list-folder-files";
import { moveFileAction } from "./actions/move-file";
import { searchFilesAction } from "./actions/search-files";
import { transformImageAction } from "./actions/transform-image";
import { clearTriggerSubscriptions } from "./channel";
import { bindingFolderIdData } from "./data/binding-folder-id";
import { dashboardLinkData } from "./data/dashboard-link";
import { deliveryUrlData } from "./data/delivery-url";
import { typeGroupData } from "./data/type-group";
import { automationLoopGuard } from "./loop-guard";
import { notifyMediaEvent } from "./media-events";
import { AutomationRegistrationLifecycle } from "./registration-lifecycle";
import { fileDeletedTrigger } from "./triggers/file-deleted";
import { filePublishedTrigger } from "./triggers/file-published";
import { fileUploadedTrigger } from "./triggers/file-uploaded";
import { libraryEventTrigger } from "./triggers/library-event";
import { storageThresholdTrigger } from "./triggers/storage-threshold";

const AUTOMATION_INTERFACE_PACKAGE = "@antelopejs/interface-dms-automation";

type AutomationInterface =
  typeof import("@antelopejs/interface-dms-automation");

interface ModuleLoadError extends Error {
  code?: string;
}

export const MEDIA_TRIGGERS = [
  fileUploadedTrigger,
  fileDeletedTrigger,
  filePublishedTrigger,
  storageThresholdTrigger,
  libraryEventTrigger,
];

export const MEDIA_ACTIONS = [
  createFileAction,
  ensureFolderAction,
  updateFileDetailsAction,
  moveFileAction,
  setFileVisibilityAction,
  deleteFileAction,
  transformImageAction,
  setFolderVisibilityAction,
  deleteFolderAction,
  getFileAction,
  createReadUrlAction,
  listFolderFilesAction,
  getStorageUsageAction,
  searchFilesAction,
];

export const MEDIA_DATA_NODES = [
  deliveryUrlData,
  dashboardLinkData,
  typeGroupData,
  bindingFolderIdData,
];

let automationInterfacePromise: Promise<AutomationInterface | undefined>;
const automationLifecycle = new AutomationRegistrationLifecycle();

function isMissingAutomationInterface(error: ModuleLoadError): boolean {
  const firstLine = error.message.split("\n", 1)[0] ?? "";
  return (
    ["MODULE_NOT_FOUND", "ERR_MODULE_NOT_FOUND"].includes(error.code ?? "") &&
    (firstLine === `Cannot find module '${AUTOMATION_INTERFACE_PACKAGE}'` ||
      firstLine.startsWith(
        `Cannot find package '${AUTOMATION_INTERFACE_PACKAGE}' imported from `,
      ))
  );
}

async function loadAutomationInterface(): Promise<
  AutomationInterface | undefined
> {
  try {
    return await import("@antelopejs/interface-dms-automation");
  } catch (error) {
    if (error instanceof Error && isMissingAutomationInterface(error))
      return undefined;
    throw error;
  }
}

function getAutomationInterface(): Promise<AutomationInterface | undefined> {
  automationInterfacePromise ??= loadAutomationInterface();
  return automationInterfacePromise;
}

function collectErrors(operations: (() => void)[]): unknown[] {
  const errors: unknown[] = [];
  for (const operation of operations) {
    try {
      operation();
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

function cleanupAutomationNodes(automation: AutomationInterface): unknown[] {
  return collectErrors([
    ...MEDIA_TRIGGERS.map((trigger) => () => {
      automation.UnregisterTriggerType(trigger.id);
    }),
    ...MEDIA_ACTIONS.map((action) => () => {
      automation.UnregisterActionType(action.id);
    }),
    ...MEDIA_DATA_NODES.map((node) => () => {
      automation.UnregisterDataNodeType(node.id);
    }),
  ]);
}

function resetTriggers(): void {
  observeMediaEvents(undefined);
  clearTriggerSubscriptions();
  automationLoopGuard.reset();
}

/**
 * Declares the media automation node types when the optional automation
 * interface package is installed, and hands the library's writes to the
 * triggers. Without a module implementing the interface, the registrations
 * are inert.
 */
export async function registerAutomationNodes(): Promise<void> {
  const automation = await getAutomationInterface();
  if (!automation || !automationLifecycle.beginRegistration()) return;
  observeMediaEvents(notifyMediaEvent);
  try {
    for (const trigger of MEDIA_TRIGGERS)
      automation.RegisterTriggerType(trigger);
    for (const action of MEDIA_ACTIONS) automation.RegisterActionType(action);
    for (const node of MEDIA_DATA_NODES) automation.RegisterDataNodeType(node);
  } catch (error) {
    automationLifecycle.cleanup(() => cleanupAutomationNodes(automation));
    resetTriggers();
    throw error;
  }
}

/** Withdraws the node types and drops every trigger subscription. */
export async function unregisterAutomationNodes(): Promise<void> {
  resetTriggers();
  const automation = await getAutomationInterface();
  if (!automation || !automationLifecycle.isCleanupPending) return;
  const errors = automationLifecycle.cleanup(() =>
    cleanupAutomationNodes(automation),
  );
  if (errors.length > 0)
    throw new AggregateError(
      errors,
      "Failed to unregister media automation nodes",
    );
}
