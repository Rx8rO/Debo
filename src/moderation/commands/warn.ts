import { ChannelMessageCreatedEvent } from "@rootsdk/server-bot";
import { getMentionedUser, joinTokenText } from "../command-helpers";
import { reply, safeInlineText } from "../common";
import { getActionLogChannelOrReply, logActionAndReply } from "../logging";
import { addWarning, removeWarning } from "../storage";
import { CommandToken } from "../types";

export async function manageWarning(
  event: ChannelMessageCreatedEvent,
  args: CommandToken[],
): Promise<void> {
  const subcommand = typeof args[0] === "string" ? args[0].toLowerCase() : "";

  if (subcommand === "remove") {
    await removeMemberWarning(event, args.slice(1));
    return;
  }

  const target = getMentionedUser(event, args[0]);
  const reason = joinTokenText(args.slice(1));
  if (!target || !reason) {
    await reply(event, "Usage: !warn @user warning reason. A reason is required.");
    return;
  }

  const safeTargetName = safeInlineText(target.displayName, 100);
  const logChannelId = await getActionLogChannelOrReply(event);
  if (!logChannelId) return;

  const warningNumber = await addWarning(target.userId, {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    issuedAt: new Date().toISOString(),
    reason,
    moderatorId: event.userId,
    targetName: target.displayName,
  });

  await logActionAndReply(
    event,
    logChannelId,
    {
      action: "Warning issued",
      targetUserId: target.userId,
      targetName: target.displayName,
      reason,
    },
    `Saved warning #${warningNumber} for ${safeTargetName}. Use !warnings @user to view the history.`,
  );
}

async function removeMemberWarning(
  event: ChannelMessageCreatedEvent,
  args: CommandToken[],
): Promise<void> {
  const target = getMentionedUser(event, args[0]);
  const numberToken = args[1];

  if (
    !target ||
    typeof numberToken !== "string" ||
    !/^\d+$/.test(numberToken) ||
    args.length !== 2
  ) {
    await reply(event, "Usage: !warn remove @user warning-number.");
    return;
  }

  const warningNumber = Number(numberToken);
  if (!Number.isSafeInteger(warningNumber) || warningNumber < 1) {
    await reply(event, "Warning number must be a positive whole number.");
    return;
  }

  const safeTargetName = safeInlineText(target.displayName, 100);
  const logChannelId = await getActionLogChannelOrReply(event);
  if (!logChannelId) return;

  const removed = await removeWarning(target.userId, warningNumber);
  if (!removed) {
    await reply(
      event,
      `${safeTargetName} does not have a warning numbered ${warningNumber}. Run !warnings @user to see the current numbers.`,
    );
    return;
  }

  await logActionAndReply(
    event,
    logChannelId,
    {
      action: "Warning removed",
      targetUserId: target.userId,
      targetName: target.displayName,
      reason: removed.reason,
      details: `Removed warning #${warningNumber}, originally issued ${removed.issuedAt}`,
    },
    `Removed warning #${warningNumber} for ${safeTargetName}. Remaining warnings are renumbered when displayed.`,
  );
}
