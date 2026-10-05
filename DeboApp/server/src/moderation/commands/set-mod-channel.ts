import {
  ChannelMessageCreatedEvent,
  rootServer,
} from "@rootsdk/server-app";
import { reply } from "../common";
import {
  clearModChannelId,
  getLogChannelId,
  setModChannelId,
} from "../storage";
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
    await clearModChannelId();
    await reply(event, "The mod channel has been cleared for this community.");
    return;
  }

  if (args.length !== 0) {
    await reply(
      event,
      "Usage: run !setmodchannel in the channel for private moderator reports, or run !setmodchannel clear to remove it.",
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

  if ((await getLogChannelId()) === event.channelId) {
    await reply(event, "The Mod and Logs channels must be different. Run !setmodchannel in another channel.");
    return;
  }

  await setModChannelId(event.channelId);
  await reply(
    event,
    "This channel is now Debo's private Mod channel for reports and !modhelp.",
  );
}
