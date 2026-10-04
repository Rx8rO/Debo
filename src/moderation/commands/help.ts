import {
  ChannelMessageCreatedEvent,
  rootServer,
} from "@rootsdk/server-bot";
import {
  getCommunityMemberName,
  reply,
  rootUserMention,
} from "../common";
import { postTextToLogChannel } from "../logging";
import { getLogChannelId } from "../storage";

const HELP_TEXT = [
  "**Debo moderation commands**",
  "!kick @user [reason] — remove a member without banning them; reason is optional.",
  "!kick vc @user — remove a member from active voice channels Debo can access.",
  "!ban @user reason — permanently ban a member; reason is required.",
  "!purge count — delete up to 100 recent messages before this command.",
  "!purge @user count — delete up to 100 messages by that member, scanning older history as needed.",
  "!warn @user reason — save a dated warning; reason is required.",
  "!warnings — show warning totals; !warnings @user — show that member's warning history.",
  "!warn remove @user number — remove the numbered warning shown in the history.",
  "!role add @user role-name-or-mention — add a role.",
  "!role remove @user role-name-or-mention — remove a role.",
  "!setlogchannel — set this channel for kick/ban/role logs and warning-list results.",
  "!setlogchannel clear — remove this community's configured moderation log channel.",
  "!help — show this command list.",
].join("\n");

export async function showModerationHelp(
  event: ChannelMessageCreatedEvent,
): Promise<void> {
  const requesterName = await getCommunityMemberName(event.userId);
  const requester = rootUserMention(event.userId, requesterName);
  const logChannelId = await getLogChannelId();

  if (logChannelId) {
    try {
      const channel = await rootServer.community.channels.get({
        id: logChannelId,
      });
      if (channel.channelPermission.channelCreateMessage) {
        await postTextToLogChannel(
          logChannelId,
          `Help requested by ${requester}\n\n${HELP_TEXT}`,
        );
        await reply(event, "I posted the command list in the moderation log channel.");
        return;
      }
    } catch (error: unknown) {
      console.error("Could not send the help list to the moderation log channel:", error);
    }
  }

  await reply(
    event,
    `I could not access a configured moderation log channel, so here is the command list instead.\n\n${HELP_TEXT}`,
  );
}
