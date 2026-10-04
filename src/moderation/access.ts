import {
  ReadOnlyMemberGroup,
  rootServer,
  UserGuid,
} from "@rootsdk/server-bot";

const SETTINGS_GROUP = "moderation";
const ADMIN_ROLE_SETTING = "adminRole";

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
