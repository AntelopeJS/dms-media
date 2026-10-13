import type { AxiosInstance } from "axios";

const HTTP_OK = 200;
const PAGE_LAYOUT_SUFFIX = "/pagelayout";
const OMIT_SHARED_PAGE = "false";

/** What a caller gets from each surface that serves a DMS page. */
export interface PageAccess {
  /** Status of the page's own layout route, which carries its auth guard. */
  ownRouteStatus: number;
  /** `hasAccess` of the page entry `/dms/page` answers, which the dashboard follows. */
  hasAccess: boolean;
  /** Blocks `/dms/pagelayout` serves once filtered by the caller's permissions. */
  servedBlocks: number;
}

function countBlocks(components: unknown): number {
  if (Array.isArray(components)) return components.length;
  return Object.keys(components ?? {}).length;
}

/** Reads a page through its guarded route, its page entry and its by-slug layout. */
export async function readPageAccess(
  client: AxiosInstance,
  slug: string,
): Promise<PageAccess> {
  const [ownRoute, page, layout] = await Promise.all([
    client.get(`${slug}${PAGE_LAYOUT_SUFFIX}`),
    client.get("/dms/page", {
      params: { path: slug, shared: OMIT_SHARED_PAGE },
    }),
    client.get("/dms/pagelayout", { params: { slug } }),
  ]);
  if (page.status !== HTTP_OK || layout.status !== HTTP_OK) {
    throw new Error(
      `Page ${slug} answered ${page.status} on /dms/page and ${layout.status} on /dms/pagelayout`,
    );
  }
  return {
    ownRouteStatus: ownRoute.status,
    hasAccess: page.data.route?.hasAccess === true,
    servedBlocks: countBlocks(layout.data.components),
  };
}
