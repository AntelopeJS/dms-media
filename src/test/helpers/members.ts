import { randomUUID } from "node:crypto";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { RoleModel, UserInviteModel } from "@antelopejs/interface-dms/db";
import type { AxiosInstance } from "axios";
import { authorizedClient, createClient } from "./http";

const MEMBER_PASSWORD = "TestPassw0rd!";
const MEMBER_LANGUAGE = "en";
const INVITE_LIFETIME_MS = 3_600_000;
const HTTP_BAD_REQUEST = 400;

export interface MemberSession {
  client: AxiosInstance;
  accessToken: string;
  userId: string;
  email: string;
}

export async function createRole(
  name: string,
  permissions: string[],
): Promise<string> {
  const model = GetModel(RoleModel, DEFAULT_TENANT_ID);
  const [roleId] = await model.insert({ name, permissions });
  return roleId;
}

export async function setRolePermissions(
  roleId: string,
  permissions: string[],
): Promise<void> {
  await GetModel(RoleModel, DEFAULT_TENANT_ID).update(roleId, { permissions });
}

async function seedMemberInvite(
  email: string,
  roleIds: string[],
): Promise<string> {
  const token = randomUUID();
  await GetModel(UserInviteModel, DEFAULT_TENANT_ID).insert({
    email,
    roles_ids: roleIds,
    language: MEMBER_LANGUAGE,
    token,
    asTenantOwner: false,
    expiresAt: new Date(Date.now() + INVITE_LIFETIME_MS),
    skipEmailValidation: true,
  });
  return token;
}

export async function registerMember(
  name: string,
  roleIds: string[],
): Promise<MemberSession> {
  const email = `${name.toLowerCase()}-${randomUUID()}@test.local`;
  const token = await seedMemberInvite(email, roleIds);
  const client = createClient();
  const signup = await client.post("/api/auth/signup", {
    name,
    email,
    password: MEMBER_PASSWORD,
    lang: MEMBER_LANGUAGE,
    token,
  });
  if (signup.status >= HTTP_BAD_REQUEST) {
    throw new Error(
      `Member signup failed [${signup.status}]: ${JSON.stringify(signup.data)}`,
    );
  }
  return {
    client: authorizedClient(signup.data.access_token),
    accessToken: signup.data.access_token,
    userId: signup.data.user?._id,
    email,
  };
}
