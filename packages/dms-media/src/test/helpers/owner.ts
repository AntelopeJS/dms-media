import { createClient } from "./http";

const OWNER_EMAIL = "owner@test.local";
const OWNER_PASSWORD = "TestPassw0rd!";
const OWNER_FIRST_NAME = "Test";
const OWNER_LAST_NAME = "Owner";
const ADMIN_ALREADY_SET = "error.admin_already_set";
const HTTP_BAD_REQUEST = 400;

export interface OwnerSession {
  accessToken: string;
  email: string;
}

export async function ensureOwnerSession(): Promise<OwnerSession> {
  const client = createClient();
  const registration = await client.post("/api/onboarding/register", {
    firstName: OWNER_FIRST_NAME,
    lastName: OWNER_LAST_NAME,
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
  });
  const isRegistered = registration.status < HTTP_BAD_REQUEST;
  const isAlreadyRegistered =
    registration.status === HTTP_BAD_REQUEST &&
    JSON.stringify(registration.data).includes(ADMIN_ALREADY_SET);
  if (!isRegistered && !isAlreadyRegistered) {
    throw new Error(
      `Onboarding failed [${registration.status}]: ${JSON.stringify(registration.data)}`,
    );
  }
  const login = await client.post("/api/auth/login", {
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
  });
  if (login.status >= HTTP_BAD_REQUEST) {
    throw new Error(
      `Login failed [${login.status}]: ${JSON.stringify(login.data)}`,
    );
  }
  return { accessToken: login.data.access_token, email: OWNER_EMAIL };
}
