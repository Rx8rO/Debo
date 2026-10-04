import {
  ChannelMessageCreatedEvent,
  rootServer,
} from "@rootsdk/server-bot";
import { getMentionedUser, joinTokenText } from "../command-helpers";
import { reply, safeInlineText } from "../common";
import { getActionLogChannelOrReply, logActionAndReply } from "../logging";
import { CommandToken } from "../types";

export async function kickMember(
  event: ChannelMessageCreatedEvent,
  args: CommandToken[],
): Promise<void> {
  const target = getMentionedUser(event, args[0]);
  if (!target) {
    await reply(
      event,
      "Usage: !kick @user [reason]. Mention one member; the reason is optional.",
    );
    return;
  }

  if (target.userId === event.userId) {
    await reply(event, "You cannot kick yourself with Debo.");
    return;
  }

  const reason = joinTokenText(args.slice(1));
  const safeTargetName = safeInlineText(target.displayName, 100);
  const logChannelId = await getActionLogChannelOrReply(event);
  if (!logChannelId) return;

  await rootServer.community.communityMemberBans.kick({
    userId: target.userId,
  });

  await logActionAndReply(
    event,
    logChannelId,
    {
      action: "Member kicked",
      targetUserId: target.userId,
      targetName: target.displayName,
      reason: reason || "Not provided",
    },
    `Kicked ${safeTargetName}. They were not banned and may rejoin.`,
  );
}
