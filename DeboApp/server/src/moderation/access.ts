import {
  ReadOnlyMemberGroup,
  rootServer,
  UserGuid,
} from "@rootsdk/server-app";

const SETTINGS_GROUP = "moderation";
const ADMIN_ROLE_SETTING = "adminRole";
const OWNER_SETTING = "owner";

export type AuthorizationResult = {
  allowed: boolean;
  reason?: "not-configured" | "not-member";
};

/** Fail closed unless a single moderator role has been selected in Global Settings. */
export async function checkModeratorRole(
  userId: UserGuid,
): Promise<AuthorizationResult> {
  const rawSetting = rootServer.globalSettings?.[SETTINGS_GROUP]?.[
    ADMIN_ROLE_SETTING
  ];
  if (!rawSetting || typeof rawSetting !== "object") {
    return { allowed: false, reason: "not-configured" };
  }

  const setting = rawSetting as ReadOnlyMemberGroup;
  if (
    !Array.isArray(setting.communityRoleIds) ||
    setting.communityRoleIds.length === 0
  ) {
    return { allowed: false, reason: "not-configured" };
  }

  try {
    if (typeof setting.isMember === "function") {
      return (await setting.isMember({ userId }))
        ? { allowed: true }
        : { allowed: false, reason: "not-member" };
    }

    return Array.isArray(setting.memberUserIds) &&
      setting.memberUserIds.includes(userId)
      ? { allowed: true }
      : { allowed: false, reason: "not-member" };
  } catch (error: unknown) {
    // A failed membership lookup must never grant moderation access.
    console.error("Could not verify the configured moderator role:", error);
    return { allowed: false, reason: "not-configured" };
  }
}

/** Fail closed unless exactly one Owner member is selected in Global Settings. */
export async function checkOwner(userId: UserGuid): Promise<AuthorizationResult> {
  const rawSetting = rootServer.globalSettings?.[SETTINGS_GROUP]?.[OWNER_SETTING];
  if (!rawSetting || typeof rawSetting !== "object") {
    return { allowed: false, reason: "not-configured" };
  }

  const setting = rawSetting as ReadOnlyMemberGroup;
  if (!Array.isArray(setting.userIds) || setting.userIds.length !== 1) {
    return { allowed: false, reason: "not-configured" };
  }

  const selectedOwnerId = normalizeUserId(setting.userIds[0]);
  return normalizeUserId(userId) === selectedOwnerId
    ? { allowed: true }
    : { allowed: false, reason: "not-member" };
}

function normalizeUserId(userId: UserGuid): string {
  return String(userId).trim().replace(/[{}]/g, "").toLowerCase();
}
