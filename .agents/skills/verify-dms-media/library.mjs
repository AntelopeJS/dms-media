import { check, fixture, isText, list, media, pick, raw, text, TENANT } from "./media.mjs";

/**
 * @typedef {import("./media.mjs").Ctx} Ctx
 * @typedef {import("./media.mjs").Answer} Answer
 * @typedef {import("./media.mjs").Raw} Raw
 * @typedef {import("./media.mjs").Row} Row
 * @typedef {{ presign: Answer, put: Raw | null, confirm: Answer | null, id: string, asset: unknown }} Upload
 */

/**
 * Creates a folder through the library API.
 *
 * @param {Ctx} ctx The journey
 * @param {string} name The folder name
 * @param {{ parentId?: string, as?: string }} [options] Where, and as whom
 * @returns {Promise<{ answer: Answer, id: string }>} The answer and the new folder id, empty when refused
 */
export async function createFolder(ctx, name, options = {}) {
  const answer = await media(ctx, `create the folder ${name}`, "POST", "/folders", { body: { name, parentId: options.parentId }, as: options.as });
  const id = text(answer.body, "folder", "id") || text(answer.body, "id");
  return { answer, id };
}

/**
 * Uploads a file the way the dashboard does: `presign`, a `PUT` of the bytes to the storage URL it answered, then
 * `confirm`. A step that is refused stops there and leaves the later ones null, so the journey checks the refusal.
 *
 * @param {Ctx} ctx The journey
 * @param {{ folderId: string, name: string, mimetype: string, bytes: Buffer, as?: string, batchId?: string, size?: number }} file The file
 * @returns {Promise<Upload>} What each step answered
 */
export async function upload(ctx, file) {
  const presign = await media(ctx, `presign ${file.name}`, "POST", "/upload/presign", {
    body: { folderId: file.folderId, filename: file.name, size: file.size ?? file.bytes.byteLength, mimetype: file.mimetype },
    as: file.as,
  });
  if (presign.status !== 200) return { presign, put: null, confirm: null, id: "", asset: undefined };
  /** @type {Record<string, string>} */
  const headers = {};
  for (const [name, value] of Object.entries(pick(presign.body, "headers") ?? {})) if (isText(value)) headers[name] = value;
  const put = await raw(ctx, `PUT ${file.name} to the storage`, { url: text(presign.body, "uploadUrl"), method: "PUT", headers, body: file.bytes });
  const confirm = await media(ctx, `confirm ${file.name}`, "POST", "/upload/confirm", {
    body: { folderId: file.folderId, resourceKey: text(presign.body, "resourceKey"), filename: file.name, batchId: file.batchId },
    as: file.as,
  });
  const asset = pick(confirm.body, "asset");
  return { presign, put, confirm, id: text(asset, "id"), asset };
}

/**
 * Uploads a file and records that every step succeeded, as one check of the journey.
 *
 * @param {Ctx} ctx The journey
 * @param {{ folderId: string, name: string, mimetype: string, bytes: Buffer, as?: string, batchId?: string }} file The file
 * @returns {Promise<Upload>} What each step answered
 */
export async function uploaded(ctx, file) {
  const done = await upload(ctx, file);
  await ctx.verify(`${file.name} is uploaded`, [
    check("presign answers 200", done.presign.status === 200, done.presign.body),
    check("the storage takes the PUT", (done.put?.status ?? 0) >= 200 && (done.put?.status ?? 0) < 300, done.put?.status),
    check("confirm answers the asset", done.confirm?.status === 200 && done.id !== "", done.confirm?.body),
  ]);
  return done;
}

/**
 * Creates a member of the default tenant whose role holds the given permissions, and signs them up, so journeys
 * act as `name` with `ctx.api(..., { as: name })` and `ctx.tab(name)`.
 *
 * @param {Ctx} ctx The journey
 * @param {string} name The account name
 * @param {string[]} permissions The role's permission ids
 * @param {string} [language] The member's language, `en` by default
 * @returns {Promise<{ roleId: string, userId: string }>} The role and the user
 */
export async function member(ctx, name, permissions, language = "en") {
  const invite = await fixture(ctx, `invite ${name}`, "POST", "/member", { name, permissions, language });
  const email = text(invite.body, "email");
  const password = ctx.password();
  const signup = await ctx.api(`${name} signs up`, {
    method: "POST",
    path: "/api/auth/signup",
    body: { name, email, password, lang: language, token: text(invite.body, "token") },
    as: "anon",
  });
  const userId = text(signup.body, "user", "_id");
  ctx.addAccount(name, { email, password, userId });
  await ctx.verify(`${name} is a member`, [check("the signup answers a session", signup.status === 200 && userId !== "", signup.status)], { critical: true });
  return { roleId: text(invite.body, "roleId"), userId };
}

/**
 * The library tree as an account sees it.
 *
 * @param {Ctx} ctx The journey
 * @param {string} [as] The account
 * @returns {Promise<{ answer: Answer, folders: Row[] }>} The answer and its folders
 */
export async function tree(ctx, as) {
  const answer = await media(ctx, `read the tree as ${as ?? "admin"}`, "GET", "/tree", { as });
  return { answer, folders: list(answer.body, "folders") };
}

/**
 * The files of a folder as an account sees them.
 *
 * @param {Ctx} ctx The journey
 * @param {string} folderId The folder
 * @param {{ as?: string, query?: string }} [options] As whom, and the query string
 * @returns {Promise<{ answer: Answer, assets: Row[] }>} The answer and its files
 */
export async function folderAssets(ctx, folderId, options = {}) {
  const answer = await media(ctx, `list the folder as ${options.as ?? "admin"}`, "GET", `/folders/${folderId}/assets${options.query ? `?${options.query}` : ""}`, { as: options.as });
  return { answer, assets: list(answer.body, "assets") };
}

/**
 * Declares a folder through `EnsureMediaFolder` in the trusted backend.
 *
 * @param {Ctx} ctx The journey
 * @param {Row} declaration The declaration; `tenantId` defaults to the default tenant
 * @returns {Promise<Answer>} `{ ok, result | error }`
 */
export function declareFolder(ctx, declaration) {
  return fixture(ctx, `EnsureMediaFolder ${String(declaration.key)}`, "POST", "/folder", { tenantId: TENANT, ...declaration });
}

/**
 * Declares a file through `ImportMediaAsset` in the trusted backend.
 *
 * @param {Ctx} ctx The journey
 * @param {Row} declaration The declaration; `source` is `{ kind: "bytes" | "load", base64 }` or `{ kind: "filePath", filePath }`
 * @returns {Promise<Answer>} `{ ok, result | error, loads }`
 */
export function declareAsset(ctx, declaration) {
  return fixture(ctx, `ImportMediaAsset ${String(declaration.key)}`, "POST", "/asset", { tenantId: TENANT, ...declaration });
}

/**
 * Follows a delivery link to its bytes: the `/media/...` answer, then the storage URL it redirects to.
 *
 * @param {Ctx} ctx The journey
 * @param {string} path The delivery path
 * @param {{ as?: string, headers?: Record<string, string> }} [options] As whom
 * @returns {Promise<{ link: Raw, file: Raw | null }>} Both answers; `file` is null when the link does not redirect
 */
export async function follow(ctx, path, options = {}) {
  const link = await raw(ctx, `GET ${path}`, { path, as: options.as, headers: options.headers });
  const location = link.headers.location ?? "";
  if (link.status !== 302 || location === "") return { link, file: null };
  const url = new URL(location, ctx.state.apiUrl).href;
  return { link, file: await raw(ctx, `follow the redirect of ${path}`, { url }) };
}

/**
 * The delivery path of an asset as the API lists it.
 *
 * @param {unknown} asset The asset as an answer holds it
 * @returns {string} Its `/media/<id>/<name>` path
 */
export function deliveryPath(asset) {
  const url = text(asset, "url");
  return url.startsWith("http") ? new URL(url).pathname : url;
}

/**
 * Restarts the backend with `VERIFY_MEDIA_*` variables set (see `playground/antelope.config.ts`), runs `body`, then
 * restarts it with the variables it had, so later journeys get the module's defaults back.
 *
 * @param {Ctx} ctx The journey
 * @param {Record<string, string>} env The variables
 * @param {() => Promise<void>} body What to do under that configuration
 * @returns {Promise<void>}
 */
export async function withConfig(ctx, env, body) {
  const previous = { ...ctx.state.extraEnv };
  ctx.state.extraEnv = { ...previous, ...env };
  try {
    await ctx.restartBackend();
    await body();
  } finally {
    ctx.state.extraEnv = previous;
    await ctx.restartBackend();
  }
}

/**
 * Makes a folder public, private or back to inheriting, as the owner.
 *
 * @param {Ctx} ctx The journey
 * @param {"folders" | "assets"} kind A folder or a file
 * @param {string} id Its id
 * @param {string} visibility `public`, `private` or, for a file, `inherit`
 * @param {string} [as] The account
 * @returns {Promise<Answer>} The answer
 */
export function setVisibility(ctx, kind, id, visibility, as) {
  return media(ctx, `make the ${kind === "folders" ? "folder" : "file"} ${visibility}`, "POST", `/${kind}/${id}/visibility`, { body: { visibility }, as });
}

/**
 * Signs an account in on the dashboard's origin the way the hydrated sign-in form does, and returns the session
 * cookies, so a journey sends requests to the dashboard's origin as that account.
 *
 * @param {Ctx} ctx The journey
 * @param {string} [account] The account
 * @returns {Promise<string>} The `cookie` header of the session
 */
export async function dashboardSession(ctx, account = "admin") {
  const folder = ctx.step(`sign ${account} in on the dashboard origin`);
  const credentials = ctx.state.accounts?.[account];
  const response = await fetch(`${ctx.state.webUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ctx.state.webUrl },
    body: JSON.stringify({ email: credentials?.email, password: credentials?.password }),
  });
  const cookies = response.headers.getSetCookie().map((cookie) => cookie.split(";")[0] ?? "");
  const cookieNames = cookies.map((cookie) => cookie.split("=")[0]);
  ctx.record(folder, [check("the dashboard opens a session", response.ok && cookieNames.some((name) => name?.startsWith("dms_session")), `${response.status} ${cookieNames.join(", ")}`)], { critical: true });
  return cookies.join("; ");
}
