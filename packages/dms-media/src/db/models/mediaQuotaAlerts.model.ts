import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { MEDIA_QUOTA_ALERTS_TABLE_NAME, MediaQuotaAlert } from "../tables";

export class MediaQuotaAlertModel extends BasicDataModel(
  MediaQuotaAlert,
  MEDIA_QUOTA_ALERTS_TABLE_NAME,
) {}
