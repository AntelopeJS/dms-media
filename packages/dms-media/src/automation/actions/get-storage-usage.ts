import { z } from "zod";
import { ASSET_TYPE_GROUPS } from "../../library/type-groups";
import { readStorageUsage, usedPercent } from "../../services/listing";
import {
  objectSchema,
  readAction,
  TENANT_INPUT,
  tenantIdField,
} from "./support";

export const getStorageUsageAction = readAction({
  id: "media.get-storage-usage",
  name: "Get storage usage",
  description:
    "Reads how much storage a tenant's media library uses, against its storage plan, by type of file.",
  icon: "i-lucide-hard-drive",
  inputSchema: objectSchema({ tenantId: TENANT_INPUT }),
  outputSchema: objectSchema({
    usedBytes: {
      type: "number",
      description:
        "Bytes kept, edited originals included: the figure the plan is checked against",
    },
    fileCount: { type: "number", description: "Live files" },
    quotaBytes: {
      type: ["number", "null"],
      description: "The storage plan; null when none",
    },
    percent: {
      type: ["number", "null"],
      description: "One decimal; null without a plan",
    },
    remainingBytes: { type: ["number", "null"] },
    byType: {
      type: "array",
      items: {
        type: "object",
        properties: {
          group: { type: "string", enum: [...ASSET_TYPE_GROUPS] },
          files: { type: "number" },
          bytes: { type: "number" },
        },
      },
    },
  }),
  input: z.object({ tenantId: tenantIdField }),
  async read(context) {
    const usage = await readStorageUsage(context);
    const quota = usage.quotaBytes;
    return {
      ...usage,
      percent: quota ? usedPercent(usage.usedBytes, quota) : null,
      remainingBytes: quota ? Math.max(quota - usage.usedBytes, 0) : null,
    };
  },
});
