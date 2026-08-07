import "server-only";

import { google } from "googleapis";

import { getEnvironment } from "@/lib/env";
import {
  getActiveDriveConnection,
  markDriveConnectionStatus,
} from "@/server/auth/auth-repository";
import { createGoogleOAuthClient } from "@/server/auth/google-oauth";
import { createTokenVault } from "@/server/auth/token-vault";

export class DriveNotConnectedError extends Error {
  constructor() {
    super("Google Drive is not connected");
    this.name = "DriveNotConnectedError";
  }
}

export class DriveAuthorizationError extends Error {
  constructor() {
    super("Google Drive authorization failed");
    this.name = "DriveAuthorizationError";
  }
}

export async function getAuthorizedGoogleClient(adminId: string) {
  const connection = await getActiveDriveConnection(adminId);

  if (!connection) {
    throw new DriveNotConnectedError();
  }

  try {
    const tokenVault = createTokenVault(getEnvironment().TOKEN_ENCRYPTION_KEY);
    const refreshToken = tokenVault.decrypt(connection.encryptedRefreshToken);
    const oauthClient = createGoogleOAuthClient();
    oauthClient.setCredentials({ refresh_token: refreshToken });
    const accessTokenResult = await oauthClient.getAccessToken();

    if (!accessTokenResult.token) {
      throw new DriveAuthorizationError();
    }

    return {
      accessToken: accessTokenResult.token,
      connection,
      expiresAt: oauthClient.credentials.expiry_date ?? null,
      oauthClient,
    };
  } catch {
    await markDriveConnectionStatus(connection.id, "ERROR");
    throw new DriveAuthorizationError();
  }
}

export async function getDriveClient(adminId: string) {
  const authorization = await getAuthorizedGoogleClient(adminId);

  return {
    ...authorization,
    drive: google.drive({ auth: authorization.oauthClient, version: "v3" }),
  };
}
