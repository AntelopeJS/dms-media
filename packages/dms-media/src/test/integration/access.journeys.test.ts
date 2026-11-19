import { RegisterAssetBinding } from "@antelopejs/interface-dms-media";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import {
  GetPermissionId,
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import type { AxiosInstance } from "axios";
import { assert, expect } from "chai";
import { z } from "zod";
import type { AclEntry } from "../../types";
import { createdBody, readBody } from "../helpers/bodies";
import { fetchFolderNodes } from "../helpers/folders";
import { authorizedClient } from "../helpers/http";
import {
  aclFolder,
  isAllowed,
  isRefused,
  memberHolding,
  probeRights,
  uploadPng,
} from "../helpers/member-rights";
import { withMediaConfig } from "../helpers/media-config";
import { createRole, registerMember } from "../helpers/members";
import { ensureOwnerSession } from "../helpers/owner";
import { createFolder } from "../helpers/permissions-world";

const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const SETUP_TIMEOUT_MS = 120_000;
const SMALL_PNG = { width: 4, height: 4 };

const WRITE_BINDING_ID = "access-journeys.write";
const WRITE_FOLDER_NAME = "Access journeys write mapping";
const WRITE_PERMISSION = "access-journeys.writer";
const PAGE_BINDING_ID = "access-journeys.page";
const PAGE_FOLDER_NAME = "Access journeys page fallback";

@RegisterPage()
class AccessJourneysProbePage extends PageController("access-journeys-probe", {
  displayName: "Access journeys probe",
  description: "Probe page whose members reach a linked folder",
  icon: "i-ph-images",
  category: pagesCategory,
}) {
  static content = CustomComponent("dms-media-access-journeys-probe");
}

const listedBody = z.object({ assets: z.array(z.object({ id: z.string() })) });

type Rights = "none" | "read" | "write";

const OBSERVED_RIGHTS: Record<Rights, { read: boolean; write: boolean }> = {
  none: { read: false, write: false },
  read: { read: true, write: false },
  write: { read: true, write: true },
};

let owner: AxiosInstance;

async function expectRights(
  client: AxiosInstance,
  folderId: string,
  wanted: Rights,
  label: string,
): Promise<void> {
  expect(await probeRights(client, folderId), label).to.deep.equal(
    OBSERVED_RIGHTS[wanted],
  );
}

async function ownedRoot(name: string, parentId?: string): Promise<string> {
  return createFolder(owner, name, parentId);
}

async function removeRoots(rootIds: string[]): Promise<void> {
  for (const rootId of rootIds) {
    await owner.delete(`/api/media/folders/${rootId}`);
  }
}

function rightsIncludeTheWeakerOnes(): void {
  describe("rights-include-the-weaker-ones", () => {
    const roots: string[] = [];

    after(async () => {
      await removeRoots(roots);
    });

    it("rights-include-the-weaker-ones: read lists, write lists and uploads, manage lists and uploads and changes the structure", async () => {
      const readFolder = await aclFolder(owner, "Rights read", "access.r", [
        "read",
      ]);
      const writeFolder = await aclFolder(owner, "Rights write", "access.w", [
        "write",
      ]);
      const manageFolder = await aclFolder(owner, "Rights manage", "access.m", [
        "manage",
      ]);
      roots.push(readFolder, writeFolder, manageFolder);
      const { client } = await memberHolding("Rights", [
        "access.r",
        "access.w",
        "access.m",
      ]);
      await expectRights(client, readFolder, "read", "read");
      await expectRights(client, writeFolder, "write", "write");
      await expectRights(
        client,
        manageFolder,
        "write",
        "manage includes write",
      );
      const underWrite = await client.post("/api/media/folders", {
        name: "Sub",
        parentId: writeFolder,
      });
      expect(underWrite.status, "write cannot add a subfolder").to.equal(
        HTTP_FORBIDDEN,
      );
      const underManage = await client.post("/api/media/folders", {
        name: "Sub",
        parentId: manageFolder,
      });
      expect(underManage.status, "manage adds a subfolder").to.equal(HTTP_OK);
      const renamed = await client.post(
        `/api/media/folders/${readBody(underManage, createdBody).id}/rename`,
        { name: "Renamed" },
      );
      expect(renamed.status, "manage renames it").to.equal(HTTP_OK);
    });
  });
}

function folderInheritance(): void {
  describe("a-folder-without-an-acl-takes-its-parents", () => {
    const roots: string[] = [];

    after(async () => {
      await removeRoots(roots);
    });

    it("a-folder-without-an-acl-takes-its-parents: a subfolder takes its parent's read, a root grants nothing by default, a rootAcl entry reaches every folder below a root without an ACL, and a folder with its own ACL keeps it", async () => {
      const parent = await aclFolder(owner, "Inherit parent", "access.parent", [
        "read",
      ]);
      const child = await ownedRoot("Child", parent);
      const plain = await ownedRoot("Inherit plain");
      const plainChild = await ownedRoot("Plain child", plain);
      const plainGrandchild = await ownedRoot("Plain grandchild", plainChild);
      roots.push(parent, plain);
      const { client } = await memberHolding("Inheritor", [
        "access.parent",
        "access.root",
      ]);
      await expectRights(
        client,
        child,
        "read",
        "the subfolder takes its parent's read",
      );
      await withMediaConfig({ rootAcl: [] }, async () => {
        await expectRights(
          client,
          plain,
          "none",
          "the default rootAcl grants nothing",
        );
      });
      const rootAcl: AclEntry[] = [
        {
          subject: { kind: "permission", id: "access.root" },
          rights: ["write"],
        },
      ];
      await withMediaConfig({ rootAcl }, async () => {
        await expectRights(
          client,
          plain,
          "write",
          "a rootAcl entry reaches a root folder without an ACL",
        );
        await expectRights(
          client,
          plainChild,
          "write",
          "and its subfolder, which sets no ACL either",
        );
        await expectRights(
          client,
          plainGrandchild,
          "write",
          "and the subfolder below that",
        );
        await expectRights(
          client,
          parent,
          "read",
          "a folder with its own ACL keeps it",
        );
      });
    });
  });
}

function visibilityIsTheOwners(): void {
  describe("only-the-owner-changes-visibility", () => {
    const roots: string[] = [];

    after(async () => {
      await removeRoots(roots);
    });

    it("only-the-owner-changes-visibility: a member managing the folders cannot change a folder's or a file's visibility nor move a file where its visibility would change, but moves it where it stays the same", async () => {
      const permission = "access.vis";
      const privateA = await aclFolder(owner, "Vis A", permission, ["manage"]);
      const privateB = await aclFolder(owner, "Vis B", permission, ["manage"]);
      const publicC = await aclFolder(owner, "Vis C", permission, ["manage"]);
      roots.push(privateA, privateB, publicC);
      const publish = await owner.post(
        `/api/media/folders/${publicC}/visibility`,
        { visibility: "public" },
      );
      expect(publish.status, "the owner publishes C").to.equal(HTTP_OK);
      const file = await uploadPng(owner, privateA, "m.png", SMALL_PNG);
      const { client } = await memberHolding("Manager", [permission]);
      const folderVisibility = await client.post(
        `/api/media/folders/${privateA}/visibility`,
        { visibility: "public" },
      );
      const fileVisibility = await client.post(
        `/api/media/assets/${file.id}/visibility`,
        { visibility: "public" },
      );
      const toPublic = await client.post(`/api/media/assets/${file.id}/move`, {
        folderId: publicC,
      });
      const toPrivate = await client.post(`/api/media/assets/${file.id}/move`, {
        folderId: privateB,
      });
      expect(folderVisibility.status, "folder visibility").to.equal(
        HTTP_FORBIDDEN,
      );
      expect(fileVisibility.status, "file visibility").to.equal(HTTP_FORBIDDEN);
      expect(toPublic.status, "a move that makes it public").to.equal(
        HTTP_FORBIDDEN,
      );
      expect(toPrivate.status, "a move that keeps it private").to.equal(
        HTTP_OK,
      );
      const ownerMove = await owner.post(`/api/media/assets/${file.id}/move`, {
        folderId: publicC,
      });
      expect(ownerMove.status, "the owner may").to.equal(HTTP_OK);
    });
  });
}

function roleSubjects(): void {
  describe("a-role-subject-grants-its-holders", () => {
    const roots: string[] = [];

    after(async () => {
      await removeRoots(roots);
    });

    it("a-role-subject-grants-its-holders: a rootAcl role entry grants its rights to the holders of that role and nothing to a member with another role", async () => {
      const folder = await ownedRoot("Roles");
      roots.push(folder);
      const roleId = await createRole("access-roleholder-role", [
        "unrelated.page",
      ]);
      const holder = await registerMember("RoleHolder", [roleId]);
      const other = await memberHolding("OtherRole", ["unrelated.page"]);
      expect(roleId, "the role has an id").to.not.equal("");
      const rootAcl: AclEntry[] = [
        { subject: { kind: "role", id: roleId }, rights: ["read"] },
      ];
      await withMediaConfig({ rootAcl }, async () => {
        await expectRights(
          holder.client,
          folder,
          "read",
          "the member holding the role",
        );
        await expectRights(
          other.client,
          folder,
          "none",
          "a member with another role",
        );
      });
    });
  });
}

function writeMappings(): void {
  describe("a-write-mapping-grants-write-only", () => {
    const cases = [
      {
        label: "write mapping",
        member: "MappingWriter",
        folderName: WRITE_FOLDER_NAME,
        permission: () => WRITE_PERMISSION,
      },
      {
        label: "page fallback",
        member: "PageWriter",
        folderName: PAGE_FOLDER_NAME,
        permission: () => {
          const permission = GetPermissionId(AccessJourneysProbePage);
          assert.isDefined(permission, "probe page permission");
          return permission;
        },
      },
    ];

    before(() => {
      RegisterAssetBinding({
        id: WRITE_BINDING_ID,
        folderName: WRITE_FOLDER_NAME,
        permissionMapping: { write: [WRITE_PERMISSION] },
        subfolders: true,
      });
      RegisterAssetBinding({
        id: PAGE_BINDING_ID,
        folderName: PAGE_FOLDER_NAME,
        permissionsFromPage: AccessJourneysProbePage,
        subfolders: true,
      });
    });

    for (const { label, member, folderName, permission } of cases) {
      it(`a-write-mapping-grants-write-only: the ${label} lets the member upload and rename files but answers 403 to creating or renaming a folder, even with subfolders allowed`, async () => {
        const linked = (await fetchFolderNodes(owner)).find(
          (folder) => folder.name === folderName,
        );
        assert.isDefined(linked, `provisioned ${folderName}`);
        const { client } = await memberHolding(member, [permission()]);
        const put = await uploadPng(client, linked.id, "writer.png", SMALL_PNG);
        const listed = await client.get(
          `/api/media/folders/${linked.id}/assets`,
        );
        expect(listed.status, "the member lists the folder").to.equal(HTTP_OK);
        expect(
          readBody(listed, listedBody).assets.map((asset) => asset.id),
          "the upload is listed",
        ).to.include(put.id);
        const rename = await client.post(`/api/media/assets/${put.id}/update`, {
          name: "writer renamed.png",
        });
        expect(rename.status, "the member renames a file").to.equal(HTTP_OK);
        const created = await client.post("/api/media/folders", {
          name: "Sous",
          parentId: linked.id,
        });
        expect(created.status, "creating a subfolder").to.equal(HTTP_FORBIDDEN);
        const own = await ownedRoot("Owner-made", linked.id);
        const folderRename = await client.post(
          `/api/media/folders/${own}/rename`,
          { name: "Renamed" },
        );
        expect(folderRename.status, "renaming a subfolder").to.equal(
          HTTP_FORBIDDEN,
        );
      });
    }
  });
}

function readRoutes(): void {
  describe("every-route-needs-its-documented-right", () => {
    const roots: string[] = [];

    after(async () => {
      await removeRoots(roots);
    });

    it("every-route-needs-its-documented-right: GET /assets/:id and /read-url are refused without the read right and answered with it", async () => {
      const other = await aclFolder(
        owner,
        "Reads other",
        "access.reads.other",
        ["read"],
      );
      const readFolder = await aclFolder(owner, "Reads read", "access.reads", [
        "read",
      ]);
      roots.push(other, readFolder);
      const inOther = await uploadPng(owner, other, "n.png", SMALL_PNG);
      const inRead = await uploadPng(owner, readFolder, "r.png", SMALL_PNG);
      const { client } = await memberHolding("Reader", ["access.reads"]);
      for (const suffix of ["", "/read-url"]) {
        const below = await client.get(
          `/api/media/assets/${inOther.id}${suffix}`,
        );
        const at = await client.get(`/api/media/assets/${inRead.id}${suffix}`);
        expect(
          isRefused(below),
          `GET ${suffix} below read: ${below.status}`,
        ).to.equal(true);
        expect(isAllowed(at), `GET ${suffix} at read: ${at.status}`).to.equal(
          true,
        );
      }
    });
  });
}

describe("[integration] access journeys — member rights, inheritance, role subjects and write mappings", () => {
  before(async function () {
    this.timeout(SETUP_TIMEOUT_MS);
    owner = authorizedClient((await ensureOwnerSession()).accessToken);
  });

  rightsIncludeTheWeakerOnes();
  folderInheritance();
  visibilityIsTheOwners();
  roleSubjects();
  writeMappings();
  readRoutes();
});
