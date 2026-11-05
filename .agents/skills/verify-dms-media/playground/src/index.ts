import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { Hook, RegisterHook } from "@antelopejs/interface-dms/hooks";
import {
  EnsureMediaFolder,
  ImportMediaAsset,
} from "@antelopejs/interface-dms-media";
import "./fixture";
import "./pages";

/** The text file the provisioning hook ships as code: not an image, so a fresh library holds none. */
const PROCEDURE = Buffer.from("Check the harness before you climb.\n", "utf8");

/**
 * Declares a folder and a file for every tenant the DMS provisions, as the
 * docs tell a project to: from `Hook.TENANT_BEING_PROVISIONED`, registered in
 * `construct()`, parents first, each call awaited.
 */
export function construct(): void {
  RegisterHook(Hook.TENANT_BEING_PROVISIONED, async ({ tenantId }) => {
    if (tenantId !== DEFAULT_TENANT_ID) return;
    await EnsureMediaFolder({
      tenantId,
      key: "verify.provisioned",
      name: "Provisioned",
    });
    await ImportMediaAsset({
      tenantId,
      key: "verify.provisioned.procedure",
      folder: { key: "verify.provisioned" },
      name: "procedure.txt",
      mimetype: "text/plain",
      source: { bytes: new Uint8Array(PROCEDURE) },
    });
  });
}

export function start(): void {}
