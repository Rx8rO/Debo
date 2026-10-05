import {
  CommunityRoleGuid,
  rootServer,
} from "@rootsdk/server-app";
import { getMentionedUser, getRoleMention } from "./common";
import { joinTokenText } from "./parser";
import { CommandToken } from "./types";

export { getMentionedUser, getRoleMention, joinTokenText };

export type ResolvedRole = {
  roleId: CommunityRoleGuid;
  roleName: string;
};

export async function resolveRole(
  tokens: CommandToken[],
): Promise<ResolvedRole | undefined> {
  if (tokens.length === 1) {
    const mention = getRoleMention(tokens[0]);
    if (mention) {
      const role = await rootServer.community.communityRoles.get({
        id: mention.roleId as CommunityRoleGuid,
      });
      return { roleId: role.id, roleName: role.name };
    }
  }

  if (tokens.some((token) => typeof token !== "string")) {
    return undefined;
  }

  const requestedName = joinTokenText(tokens).toLocaleLowerCase();
  if (!requestedName) return undefined;

  const roles = await rootServer.community.communityRoles.list();
  const matches = roles.filter(
    (role) => role.name.toLocaleLowerCase() === requestedName,
  );

  if (matches.length !== 1) return undefined;
  return { roleId: matches[0].id, roleName: matches[0].name };
}
