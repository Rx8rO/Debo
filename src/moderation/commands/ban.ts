import {
  ChannelMessageCreatedEvent,
  rootServer,
} from "@rootsdk/server-bot";
import { getMentionedUser, joinTokenText } from "../command-helpers";
import { reply, safeInlineText } from "../common";
import { getLogChannelOrReply, logActionAndReply } from "../logging";
import { saveBanRecord } from "../storage";
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

  const ban = await rootServer.community.communityMemberBans.create({
    userId: target.userId,
    reason,
  });
  const issuedAt = new Date().toISOString();

  try {
    await saveBanRecord({
      banId: ban.id,
      userId: target.userId,
      issuedAt,
      reason,
      moderatorId: event.userId,
      targetName: target.displayName,
    });
  } catch (error: unknown) {
    // The Root ban already succeeded; keep logging it even if local metadata fails.
    console.error("The ban succeeded, but Debo could not save its date metadata:", error);
  }

  await logActionAndReply(
    event,
    logChannelId,
    {
      action: "Member banned",
      targetUserId: target.userId,
      targetName: target.displayName,
      reason,
    },
    `Banned ${safeTargetName} (user ID: ${target.userId}).`,
  );
}
