import { ChannelMessageCreatedEvent, rootServer } from "@rootsdk/server-app";
import {
  getCommunityMemberName,
  reply,
  replyUnlessInChannel,
  rootUserMention,
  safeInlineText,
} from "../common";
import { getModChannelOrReply, postTextToChannel } from "../logging";
import { CommandToken } from "../types";

export async function showRoles(
  event: ChannelMessageCreatedEvent,
  args: CommandToken[],
): Promise<void> {
  if (args.length !== 0) {
    await reply(event, "Usage: !roles.");
    return;
  }

  const modChannelId = await getModChannelOrReply(event);
  if (!modChannelId) return;

  const [roles, requesterName] = await Promise.all([
    rootServer.community.communityRoles.list(),
    getCommunityMemberName(event.userId),
  ]);
  const sortedRoles = roles.sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const roleLines = sortedRoles.map(
    (role) => `- ${safeInlineText(role.name, 100)} — ${role.id}`,
  );
  const report =
    roleLines.length > 0
      ? [`**Community roles (${roleLines.length})**`, ...roleLines].join("\n")
      : "**Community roles**\nNo roles were returned.";
  const content = [
    `Requested by ${rootUserMention(event.userId, requesterName)}`,
    report,
  ].join("\n\n");

  await postTextToChannel(modChannelId, content);
  await replyUnlessInChannel(
    event,
    modChannelId,
    "I posted the community role list in the mod channel.",
  );
}
