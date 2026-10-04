import {
  ChannelMessageCreatedEvent,
  rootServer,
} from "@rootsdk/server-bot";
import { reply } from "../common";
import { clearLogChannelId, setLogChannelId } from "../storage";
import { CommandToken } from "../types";

export async function setModChannel(
  event: ChannelMessageCreatedEvent,
  args: CommandToken[],
): Promise<void> {
  if (
    args.length === 1 &&
    typeof args[0] === "string" &&
    args[0].toLowerCase() === "clear"
  ) {
    await clearLogChannelId();
    await reply(event, "The mod channel has been cleared for this community.");
    return;
  }

  if (args.length !== 0) {
    await reply(
      event,
      "Usage: run !setmodchannel in the channel you want to use, or run !setmodchannel clear to remove it.",
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
        "Debo cannot post in this channel, so it cannot be used as the mod channel.",
      );
      return;
    }
  } catch (error: unknown) {
    console.error("Could not validate the requested mod channel:", error);
    await reply(
      event,
      "Debo could not validate this channel. Try the command again in a text channel Debo can access.",
    );
    return;
  }

  await setLogChannelId(event.channelId);
  await reply(
    event,
    "This channel is now Debo's mod channel for moderation logs and reports.",
  );
}
