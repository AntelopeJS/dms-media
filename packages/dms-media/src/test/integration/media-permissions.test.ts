import { assert, expect } from "chai";
import { rawGet, type UploadedAsset, uploadTextAsset } from "../helpers/assets";

import {
  assets,
  fetchTree,
  findById,
  folders,
  HTTP_FORBIDDEN,
  HTTP_FOUND,
  HTTP_NOT_FOUND,
  HTTP_OK,
  owner,
  requireById,
  ROTATE_QUARTER_TURN,
  sessions,
  setUpPermissionsWorld,
  tearDownPermissionsWorld,
} from "../helpers/permissions-world";
import {
  folderManagementSuites,
  laterPermissionSuites,
} from "./permissions-management";

const SETUP_TIMEOUT_MS = 120_000;

describe("[integration] media permissions — multi-actor ACL enforcement", () => {
  let stockAssetId: string;

  before(async function () {
    this.timeout(SETUP_TIMEOUT_MS);
    await setUpPermissionsWorld();
  });

  after(async () => {
    await tearDownPermissionsWorld();
  });

  describe("tree visibility", () => {
    it("shows nothing to a member with no roles", async () => {
      const tree = await fetchTree(sessions.outsider.client);
      expect(tree.folders).to.deep.equal([]);
      expect(tree.root).to.include({ write: false, manage: false });
    });

    it("grants nothing through the All files page permission", async () => {
      const tree = await fetchTree(sessions.pageHolder.client);
      expect(tree.folders).to.deep.equal([]);
      expect(tree.root).to.include({ write: false, manage: false });
    });

    it("shows only root-inherited folders to a holder of a root read grant", async () => {
      const tree = await fetchTree(sessions.viewer.client);
      const library = findById(tree, folders.library);
      assert.isDefined(library, "library");
      expect(library.rights).to.deep.equal({
        read: true,
        write: false,
        manage: false,
      });
      expect(library.shell).to.equal(false);
      for (const hiddenId of [
        folders.restricted,
        folders.deep,
        folders.vault,
        folders.pocket,
        folders.stock,
        folders.contentRoot,
      ]) {
        expect(findById(tree, hiddenId), `folder ${hiddenId}`).to.equal(
          undefined,
        );
      }
    });

    it("grants folder access through a role subject alone", async () => {
      const tree = await fetchTree(sessions.secretMember.client);
      expect(requireById(tree, folders.restricted).rights).to.deep.equal({
        read: true,
        write: true,
        manage: false,
      });
      expect(requireById(tree, folders.deep).rights.write).to.equal(true);
      const pocket = requireById(tree, folders.pocket);
      expect(pocket.rights).to.deep.equal({
        read: true,
        write: false,
        manage: false,
      });
      const vault = requireById(tree, folders.vault);
      expect(vault.shell, "vault is a traverse-only shell").to.equal(true);
      expect(vault.rights.read).to.equal(false);
      expect(findById(tree, folders.library)).to.equal(undefined);
      expect(tree.root).to.include({ write: false, manage: false });
    });

    it("auto-grants the linked folder to consumer permission holders", async () => {
      const tree = await fetchTree(sessions.clerk.client);
      const stock = findById(tree, folders.stock);
      assert.isDefined(stock, "linked stock folder");
      expect(stock.rights).to.deep.equal({
        read: true,
        write: true,
        manage: false,
      });
      const contentRoot = requireById(tree, folders.contentRoot);
      expect(contentRoot.shell, "content root is a shell").to.equal(true);
      expect(findById(tree, folders.library)).to.equal(undefined);
    });

    it("unions permission and role subjects across multiple roles", async () => {
      const tree = await fetchTree(sessions.hybrid.client);
      const library = findById(tree, folders.library);
      assert.isDefined(library, "library via the root read grant");
      expect(library.rights.read).to.equal(true);
      const restricted = findById(tree, folders.restricted);
      assert.isDefined(restricted, "restricted via secret-team");
      expect(restricted.rights.write).to.equal(true);
    });

    it("expands implied rights for uploader and folder manager", async () => {
      const uploaderTree = await fetchTree(sessions.uploader.client);
      expect(uploaderTree.root).to.include({ write: true, manage: false });
      expect(requireById(uploaderTree, folders.library).rights).to.deep.equal({
        read: true,
        write: true,
        manage: false,
      });

      const managerTree = await fetchTree(sessions.folderManager.client);
      expect(managerTree.root).to.include({ write: true, manage: true });
      expect(requireById(managerTree, folders.library).rights).to.deep.equal({
        read: true,
        write: true,
        manage: true,
      });
      expect(
        findById(managerTree, folders.stock),
        "linked folders stay with the owner and their consumers",
      ).to.equal(undefined);
    });
  });

  describe("listing, search and read paths", () => {
    it("hides unreadable folder listings behind 404", async () => {
      const listing = await sessions.viewer.client.get(
        `/api/media/folders/${folders.restricted}/assets`,
      );
      expect(listing.status).to.equal(HTTP_NOT_FOUND);
      const vaultListing = await sessions.viewer.client.get(
        `/api/media/folders/${folders.vault}/assets`,
      );
      expect(vaultListing.status).to.equal(HTTP_NOT_FOUND);
    });

    it("refuses to list a traverse-only shell with 403", async () => {
      const listing = await sessions.secretMember.client.get(
        `/api/media/folders/${folders.vault}/assets`,
      );
      expect(listing.status).to.equal(HTTP_FORBIDDEN);
    });

    it("lists readable folders and their assets", async () => {
      const listing = await sessions.secretMember.client.get(
        `/api/media/folders/${folders.restricted}/assets`,
      );
      expect(listing.status).to.equal(HTTP_OK);
      const names = listing.data.assets.map(
        (asset: UploadedAsset) => asset.name,
      );
      expect(names).to.include("secret.txt");
    });

    it("hides unreadable assets behind 404 on detail and read-url", async () => {
      const detail = await sessions.viewer.client.get(
        `/api/media/assets/${assets.secretText.id}`,
      );
      expect(detail.status).to.equal(HTTP_NOT_FOUND);
      const readUrl = await sessions.viewer.client.get(
        `/api/media/assets/${assets.secretText.id}/read-url`,
      );
      expect(readUrl.status).to.equal(HTTP_NOT_FOUND);
      const allowed = await sessions.secretMember.client.get(
        `/api/media/assets/${assets.secretText.id}`,
      );
      expect(allowed.status).to.equal(HTTP_OK);
    });

    it("scopes search results to readable folders", async () => {
      const blind = await sessions.viewer.client.get(
        "/api/media/assets/search?q=secret",
      );
      expect(blind.status).to.equal(HTTP_OK);
      expect(blind.data.assets).to.deep.equal([]);
      const sighted = await sessions.secretMember.client.get(
        "/api/media/assets/search?q=secret",
      );
      expect(sighted.status).to.equal(HTTP_OK);
      const names = sighted.data.assets.map(
        (asset: UploadedAsset) => asset.name,
      );
      expect(names).to.include("secret.txt");
    });

    it("guards folder-scoped search like a listing", async () => {
      const hidden = await sessions.viewer.client.get(
        `/api/media/assets/search?folderId=${folders.restricted}`,
      );
      expect(hidden.status).to.equal(HTTP_NOT_FOUND);
      const shell = await sessions.secretMember.client.get(
        `/api/media/assets/search?folderId=${folders.vault}`,
      );
      expect(shell.status).to.equal(HTTP_FORBIDDEN);
      const readable = await sessions.secretMember.client.get(
        `/api/media/assets/search?folderId=${folders.pocket}`,
      );
      expect(readable.status).to.equal(HTTP_OK);
    });

    it("filters unreadable assets out of preview batches", async () => {
      const previews = await sessions.viewer.client.post(
        "/api/media/previews",
        { ids: [assets.libraryPng.id, assets.secretPng.id] },
      );
      expect(previews.status).to.equal(HTTP_OK);
      expect(previews.data.previews[assets.libraryPng.id]).to.be.a("string");
      expect(previews.data.previews[assets.secretPng.id]).to.equal(undefined);
    });
  });

  describe("write rights", () => {
    it("refuses presign without the write right", async () => {
      const denied = await sessions.viewer.client.post(
        "/api/media/upload/presign",
        {
          folderId: folders.library,
          filename: "nope.txt",
          size: 1,
          mimetype: "text/plain",
        },
      );
      expect(denied.status).to.equal(HTTP_FORBIDDEN);
    });

    it("hides invisible upload targets behind 404", async () => {
      const denied = await sessions.clerk.client.post(
        "/api/media/upload/presign",
        {
          folderId: folders.library,
          filename: "nope.txt",
          size: 1,
          mimetype: "text/plain",
        },
      );
      expect(denied.status).to.equal(HTTP_NOT_FOUND);
    });

    it("lets an uploader run the full upload/delete cycle", async () => {
      const uploaded = await uploadTextAsset(
        sessions.uploader.client,
        folders.library,
        "uploader-cycle.txt",
      );
      const deleted = await sessions.uploader.client.delete(
        `/api/media/assets/${uploaded.id}`,
      );
      expect(deleted.status).to.equal(HTTP_OK);
    });

    it("applies folder ACL writes for role members and linked consumers", async () => {
      await uploadTextAsset(
        sessions.secretMember.client,
        folders.restricted,
        "secret-upload.txt",
      );
      const readOnly = await sessions.secretMember.client.post(
        "/api/media/upload/presign",
        {
          folderId: folders.pocket,
          filename: "nope.txt",
          size: 1,
          mimetype: "text/plain",
        },
      );
      expect(readOnly.status).to.equal(HTTP_FORBIDDEN);
      const stockAsset = await uploadTextAsset(
        sessions.clerk.client,
        folders.stock,
        "stock-item.txt",
      );
      stockAssetId = stockAsset.id;
    });

    it("requires write to update or delete an asset", async () => {
      const denied = await sessions.viewer.client.post(
        `/api/media/assets/${assets.notes.id}/update`,
        { alt: "sneaky" },
      );
      expect(denied.status).to.equal(HTTP_FORBIDDEN);
      const deniedDelete = await sessions.viewer.client.delete(
        `/api/media/assets/${assets.notes.id}`,
      );
      expect(deniedDelete.status).to.equal(HTTP_FORBIDDEN);
      const allowed = await sessions.uploader.client.post(
        `/api/media/assets/${assets.notes.id}/update`,
        { alt: "notes alt" },
      );
      expect(allowed.status).to.equal(HTTP_OK);
    });

    it("checks both source and target folders on asset moves", async () => {
      const invisibleTarget = await sessions.uploader.client.post(
        `/api/media/assets/${assets.notes.id}/move`,
        { folderId: folders.restricted },
      );
      expect(invisibleTarget.status).to.equal(HTTP_NOT_FOUND);
      const readOnlyTarget = await sessions.uploader.client.post(
        `/api/media/assets/${assets.notes.id}/move`,
        { folderId: folders.readOnlyCorner },
      );
      expect(readOnlyTarget.status).to.equal(HTTP_FORBIDDEN);
      const allowed = await sessions.uploader.client.post(
        `/api/media/assets/${assets.notes.id}/move`,
        { folderId: folders.depot },
      );
      expect(allowed.status).to.equal(HTTP_OK);
      const back = await sessions.uploader.client.post(
        `/api/media/assets/${assets.notes.id}/move`,
        { folderId: folders.library },
      );
      expect(back.status).to.equal(HTTP_OK);
    });

    it("blocks moves that would flip effective visibility", async () => {
      const exfiltration = await sessions.uploader.client.post(
        `/api/media/assets/${assets.notes.id}/move`,
        { folderId: folders.publicZone },
      );
      expect(exfiltration.status).to.equal(HTTP_FORBIDDEN);
      const ownerMove = await owner.post(
        `/api/media/assets/${assets.notes.id}/move`,
        { folderId: folders.publicZone },
      );
      expect(ownerMove.status).to.equal(HTTP_OK);
      const ownerMoveBack = await owner.post(
        `/api/media/assets/${assets.notes.id}/move`,
        { folderId: folders.library },
      );
      expect(ownerMoveBack.status).to.equal(HTTP_OK);
    });

    it("allows a move into a public folder when effective visibility is unchanged", async () => {
      const pinned = await uploadTextAsset(
        sessions.uploader.client,
        folders.library,
        "pinned-private.txt",
      );
      const pin = await owner.post(
        `/api/media/assets/${pinned.id}/visibility`,
        { visibility: "private" },
      );
      expect(pin.status).to.equal(HTTP_OK);
      const move = await sessions.uploader.client.post(
        `/api/media/assets/${pinned.id}/move`,
        { folderId: folders.publicZone },
      );
      expect(move.status).to.equal(HTTP_OK);
    });
  });

  describe("transform rights", () => {
    it("requires the write right to transform an image", async () => {
      const denied = await sessions.viewer.client.post(
        `/api/media/assets/${assets.libraryPng.id}/transform`,
        { rotate: ROTATE_QUARTER_TURN },
      );
      expect(denied.status).to.equal(HTTP_FORBIDDEN);
      const allowed = await sessions.uploader.client.post(
        `/api/media/assets/${assets.libraryPng.id}/transform`,
        { rotate: ROTATE_QUARTER_TURN },
      );
      expect(allowed.status).to.equal(HTTP_OK);
      expect(allowed.data.asset.hasOriginal).to.equal(true);
    });

    it("requires the write right to revert an edited image", async () => {
      const denied = await sessions.viewer.client.post(
        `/api/media/assets/${assets.libraryPng.id}/revert`,
      );
      expect(denied.status).to.equal(HTTP_FORBIDDEN);
      const allowed = await sessions.uploader.client.post(
        `/api/media/assets/${assets.libraryPng.id}/revert`,
      );
      expect(allowed.status).to.equal(HTTP_OK);
    });

    it("hides transforms on unreadable assets behind 404", async () => {
      const denied = await sessions.viewer.client.post(
        `/api/media/assets/${assets.secretPng.id}/transform`,
        { rotate: ROTATE_QUARTER_TURN },
      );
      expect(denied.status).to.equal(HTTP_NOT_FOUND);
    });
  });

  folderManagementSuites();

  describe("delivery", () => {
    it("enforces folder read rights on the private delivery route", async () => {
      const path = `/media/${assets.secretPng.id}/pixel.png`;
      const denied = await rawGet(path, sessions.viewer.accessToken);
      expect(denied.status).to.equal(HTTP_FORBIDDEN);
      const allowed = await rawGet(path, sessions.secretMember.accessToken);
      expect(allowed.status).to.equal(HTTP_FOUND);
      expect(allowed.cacheControl).to.equal("no-store");
    });

    it("serves linked-folder assets to the consumer permission holder", async () => {
      const path = `/media/${stockAssetId}/stock-item.txt`;
      const allowed = await rawGet(path, sessions.clerk.accessToken);
      expect(allowed.status).to.equal(HTTP_FOUND);
      const denied = await rawGet(path, sessions.viewer.accessToken);
      expect(denied.status).to.equal(HTTP_FORBIDDEN);
    });

    it("applies the same ACL to derivative delivery", async () => {
      const path = `/media/${assets.secretPng.id}/thumb/pixel.png`;
      const denied = await rawGet(path, sessions.viewer.accessToken);
      expect(denied.status).to.equal(HTTP_FORBIDDEN);
      const allowed = await rawGet(path, sessions.secretMember.accessToken);
      expect(allowed.status).to.equal(HTTP_FOUND);
      expect(allowed.cacheControl).to.equal("no-store");
    });
  });

  laterPermissionSuites();
});
