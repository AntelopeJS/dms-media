import { createClient } from "./http";

const OWNER_EMAIL = "owner@test.local";
const OWNER_PASSWORD = "TestPassw0rd!";
const OWNER_NAME = "Test Owner";
const HTTP_BAD_REQUEST = 400;

export interface OwnerSession {
  accessToken: string;
  email: string;
}

export async function ensureOwnerSession(): Promise<OwnerSession> {
  const client = createClient();
  const registration = await client.post("/api/onboarding/register", {
    name: OWNER_NAME,
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
  });
  const isRegistered = registration.status < HTTP_BAD_REQUEST;
  const isAlreadyRegistered = registration.status === HTTP_BAD_REQUEST;
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
