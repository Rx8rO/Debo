import {
  ChannelMessageCreatedEvent,
  rootServer,
} from "@rootsdk/server-bot";
import { getMentionedUser, joinTokenText } from "../command-helpers";
import { reply, safeInlineText } from "../common";
import { getLogChannelOrReply, logActionAndReply } from "../logging";
import { CommandToken } from "../types";

export async function banMember(
  event: ChannelMessageCreatedEvent,
  args: CommandToken[],
): Promise<void> {
  const target = getMentionedUser(event, args[0]);
  const reason = joinTokenText(args.slice(1));

  if (!target || !reason) {
    await reply(event, "Usage: !ban @user reason. A reason is required.");
    return;
  }

  if (target.userId === event.userId) {
    await reply(event, "You cannot ban yourself with Debo.");
    return;
  }

  const safeTargetName = safeInlineText(target.displayName, 100);
  const logChannelId = await getLogChannelOrReply(event);
  if (!logChannelId) return;

  await rootServer.community.communityMemberBans.create({
    userId: target.userId,
    reason,
  });

  await logActionAndReply(
    event,
    logChannelId,
    {
      action: "Member banned",
      targetUserId: target.userId,
      targetName: target.displayName,
      reason,
    },
    `Banned ${safeTargetName}.`,
  );
}
