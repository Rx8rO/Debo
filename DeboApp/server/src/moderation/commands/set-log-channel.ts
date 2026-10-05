import {
  ChannelMessageCreatedEvent,
  rootServer,
} from "@rootsdk/server-app";
import { reply } from "../common";
import {
  clearLogChannelId,
  getModChannelId,
  setLogChannelId,
} from "../storage";
import { CommandToken } from "../types";

export async function setLogChannel(
  event: ChannelMessageCreatedEvent,
  args: CommandToken[],
): Promise<void> {
  if (
    args.length === 1 &&
    typeof args[0] === "string" &&
    args[0].toLowerCase() === "clear"
  ) {
    await clearLogChannelId();
    await reply(event, "The logs channel has been cleared for this community.");
    return;
  }

  if (args.length !== 0) {
    await reply(
      event,
      "Usage: run !setlogchannel in the channel for action logs, or run !setlogchannel clear to remove it.",
    );
    return;
  }

  try {
    const channel = await rootServer.community.channels.get({
      id: event.channelId,
    });
    if (!channel.channelPermission.channelCreateMessage) {
      await reply(
        event,
        "Debo cannot post in this channel, so it cannot be used as the logs channel.",
      );
      return;
    }
  } catch (error: unknown) {
    console.error("Could not validate the requested logs channel:", error);
    await reply(
      event,
      "Debo could not validate this channel. Try the command again in a text channel Debo can access.",
    );
    return;
  }

  if ((await getModChannelId()) === event.channelId) {
    await reply(event, "The Logs and Mod channels must be different. Run !setlogchannel in another channel.");
    return;
  }

  await setLogChannelId(event.channelId);
  await reply(
    event,
    "This channel is now Debo's Logs channel for moderation action logs.",
  );
}
