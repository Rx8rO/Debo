import {
  ChannelMessageCreatedEvent,
  rootServer,
} from "@rootsdk/server-bot";
import {
  getCommunityMemberName,
  reply,
  replyUnlessInChannel,
  rootUserMention,
} from "../common";
import { postTextToLogChannel } from "../logging";
import { getLogChannelId } from "../storage";

const HELP_TEXT = [
  "**Debo moderation commands**",
  "!kick @user [reason] — remove a member without banning them; reason is optional.",
  "!kick vc @user — remove a member from active voice channels Debo can access.",
  "!ban @user reason — permanently ban a member; reason is required.",
  "!unban userID — unban the active ban for a Root user ID (parentheses are optional).",
  "!bans — list currently banned users, user IDs, reasons, and ban dates when available.",
  "!purge count — delete up to 100 recent messages before this command.",
  "!purge @user count — delete up to 100 messages by that member, scanning older history as needed.",
  "!warn @user reason — save a dated warning; reason is required.",
  "!warnings — show warning totals; !warnings @user — show that member's warning history.",
  "!warn remove @user number — remove the numbered warning shown in the history.",
  "!role add @user role-name-or-mention — add a role.",
  "!role remove @user role-name-or-mention — remove a role.",
  "!setmodchannel — set this channel for moderation logs and reports.",
  "!setmodchannel clear — remove this community's configured mod channel.",
  "!help — show this command list.",
].join("\n");

export async function showModerationHelp(
  event: ChannelMessageCreatedEvent,
): Promise<void> {
  const requesterName = await getCommunityMemberName(event.userId);
  const requester = rootUserMention(event.userId, requesterName);
  const modChannelId = await getLogChannelId();

  if (modChannelId) {
    try {
      const channel = await rootServer.community.channels.get({
        id: modChannelId,
      });
      if (channel.channelPermission.channelCreateMessage) {
        await postTextToLogChannel(
          modChannelId,
          `Help requested by ${requester}\n\n${HELP_TEXT}`,
        );
        await replyUnlessInChannel(
          event,
          modChannelId,
          "I posted the command list in the mod channel.",
        );
        return;
      }
    } catch (error: unknown) {
      console.error("Could not send the help list to the mod channel:", error);
    }
  }

  await reply(
    event,
    `I could not access a configured mod channel, so here is the command list instead.\n\n${HELP_TEXT}`,
  );
}
