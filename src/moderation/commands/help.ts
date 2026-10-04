import { ChannelMessageCreatedEvent } from "@rootsdk/server-bot";
import { reply } from "../common";

export async function showModerationHelp(
  event: ChannelMessageCreatedEvent,
): Promise<void> {
  await reply(
    event,
    [
      "**Debo moderation commands**",
      "!kick @user [reason] — remove a member without banning them; reason is optional.",
      "!ban @user reason — permanently ban a member; reason is required.",
      "!purge count — delete up to 100 recent messages before this command.",
      "!purge @user count — delete up to 100 messages by that member, scanning older history as needed.",
      "!warn @user reason — save a dated warning; reason is required.",
      "!warnings — show warning totals; !warnings @user — show that member's warning history.",
      "!warn remove @user number — remove the numbered warning shown in the history.",
      "!role add @user role-name-or-mention — add a role.",
      "!role remove @user role-name-or-mention — remove a role.",
      "!setlogchannel — set this channel for kick/ban/role logs and warning-list results.",
    ].join("\n"),
  );
}
