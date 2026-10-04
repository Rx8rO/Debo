import {
  ChannelMessageCreatedEvent,
  rootServer,
} from "@rootsdk/server-bot";
import { getMentionedUser, resolveRole } from "../command-helpers";
import { reply, safeInlineText } from "../common";
import { getActionLogChannelOrReply, logActionAndReply } from "../logging";
import { CommandToken } from "../types";

export async function changeMemberRole(
  event: ChannelMessageCreatedEvent,
  args: CommandToken[],
): Promise<void> {
  const operation = typeof args[0] === "string" ? args[0].toLowerCase() : "";
  const target = getMentionedUser(event, args[1]);
  const roleTokens = args.slice(2);

  if (
    (operation !== "add" && operation !== "remove") ||
    !target ||
    roleTokens.length === 0
  ) {
    await reply(
      event,
      "Usage: !role add @user role-name-or-mention, or !role remove @user role-name-or-mention.",
    );
    return;
  }

  const role = await resolveRole(roleTokens);
  if (!role) {
    await reply(
      event,
      "I could not identify that role. Use its exact role name or mention the role; names must match exactly.",
    );
    return;
  }

  if (role.roleName.toLowerCase() === "everyone") {
    await reply(event, "Debo will not add or remove the EVERYONE role.");
    return;
  }

  const safeTargetName = safeInlineText(target.displayName, 100);
  const safeRoleName = safeInlineText(role.roleName, 100);
  const logChannelId = await getActionLogChannelOrReply(event);
  if (!logChannelId) return;

  if (operation === "add") {
    await rootServer.community.communityMemberRoles.add({
      communityRoleId: role.roleId,
      userIds: [target.userId],
    });
  } else {
    await rootServer.community.communityMemberRoles.remove({
      communityRoleId: role.roleId,
      userIds: [target.userId],
    });
  }

  const action = operation === "add" ? "Role added" : "Role removed";
  const success =
    operation === "add"
      ? `Added the ${safeRoleName} role to ${safeTargetName}.`
      : `Removed the ${safeRoleName} role from ${safeTargetName}.`;

  await logActionAndReply(
    event,
    logChannelId,
    {
      action,
      targetUserId: target.userId,
      targetName: target.displayName,
      details: `${operation} role: ${role.roleName}`,
    },
    success,
  );
}
