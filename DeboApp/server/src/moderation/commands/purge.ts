import {
  ChannelMessage,
  ChannelMessageCreatedEvent,
  MessageDirectionTake,
  MessageType,
  RootGuidUtils,
  rootServer,
} from "@rootsdk/server-app";
import { reply, sleep } from "../common";
import { getMentionedUser } from "../command-helpers";
import { CommandToken } from "../types";

const MAX_PURGE_COUNT = 100;
const PAGE_SIZE = 100;

export async function purgeMessages(
  event: ChannelMessageCreatedEvent,
  args: CommandToken[],
): Promise<void> {
  let targetUserId: string | undefined;
  let countToken: CommandToken | undefined;

  if (args.length === 1) {
    countToken = args[0];
  } else if (args.length === 2) {
    const target = getMentionedUser(event, args[0]);
    if (!target) {
      await reply(event, "Usage: !purge count, or !purge @user count.");
      return;
    }
    targetUserId = target.userId;
    countToken = args[1];
  } else {
    await reply(event, "Usage: !purge count, or !purge @user count.");
    return;
  }

  if (typeof countToken !== "string" || !/^\d+$/.test(countToken)) {
    await reply(event, `Purge count must be a whole number from 1 to ${MAX_PURGE_COUNT}.`);
    return;
  }

  const requestedCount = Number(countToken);
  if (
    !Number.isSafeInteger(requestedCount) ||
    requestedCount < 1 ||
    requestedCount > MAX_PURGE_COUNT
  ) {
    await reply(event, `Purge count must be from 1 to ${MAX_PURGE_COUNT}.`);
    return;
  }

  const candidates = await findMessagesToPurge(
    event,
    requestedCount,
    targetUserId,
  );

  if (candidates.length === 0) {
    await reply(event, "No matching messages were found before this command.");
    return;
  }

  let deleted = 0;
  let failed = 0;

  for (let index = 0; index < candidates.length; index += 1) {
    const message = candidates[index];
    try {
      await rootServer.community.channelMessages.delete({
        channelId: event.channelId,
        id: message.id,
      });
      deleted += 1;
    } catch (error: unknown) {
      failed += 1;
      console.error(`Could not delete message ${message.id} during purge:`, error);
    }

    if (index < candidates.length - 1) {
      // Message deletions are mutations; stay below Root's approximate 5/sec limit.
      await sleep(250);
    }
  }

  const scope = targetUserId ? "matching member messages" : "messages";
  const requestedText = deleted < requestedCount ? ` (requested ${requestedCount})` : "";
  const failureText = failed > 0 ? ` ${failed} could not be deleted.` : "";
  await reply(
    event,
    `Deleted ${deleted} ${scope}${requestedText}.${failureText} The command message was not counted or deleted.`,
  );
}

/**
 * Read backward from the purge command's Root GUID timestamp. For a targeted
 * purge, keep paging until enough messages by that user are found or history
 * is exhausted; there is intentionally no fixed-age cutoff.
 */
async function findMessagesToPurge(
  event: ChannelMessageCreatedEvent,
  count: number,
  targetUserId?: string,
): Promise<ChannelMessage[]> {
  const selected: ChannelMessage[] = [];
  const selectedIds = new Set<string>();
  const seenPageSignatures = new Set<string>();
  let cursorMilliseconds = RootGuidUtils.toMilliseconds(event.id);

  while (selected.length < count) {
    const page = await rootServer.community.channelMessages.list({
      channelId: event.channelId,
      dateAt: new Date(cursorMilliseconds),
      messageDirectionTake: MessageDirectionTake.Older,
      limit: PAGE_SIZE,
    });

    if (page.messages.length === 0) break;

    const orderedMessages = [...page.messages].sort(
      (left, right) =>
        RootGuidUtils.toMilliseconds(right.id) -
        RootGuidUtils.toMilliseconds(left.id),
    );

    for (const message of orderedMessages) {
      if (
        message.id === event.id ||
        message.deletedAt ||
        message.messageType !== MessageType.UserMessage ||
        (targetUserId && message.userId !== targetUserId) ||
        selectedIds.has(message.id)
      ) {
        continue;
      }

      selectedIds.add(message.id);
      selected.push(message);
      if (selected.length >= count) break;
    }

    if (selected.length >= count || page.oldCount <= 0) break;

    const signature = orderedMessages.map((message) => message.id).join(",");
    const oldestMilliseconds = Math.min(
      ...orderedMessages.map((message) => RootGuidUtils.toMilliseconds(message.id)),
    );

    let nextCursor = oldestMilliseconds;
    if (seenPageSignatures.has(signature) || nextCursor >= cursorMilliseconds) {
      // A timestamp page can repeat at a boundary. Move one millisecond older
      // rather than looping forever on the same set of message IDs.
      nextCursor = Math.min(cursorMilliseconds - 1, oldestMilliseconds - 1);
    }
    seenPageSignatures.add(signature);

    if (nextCursor >= cursorMilliseconds) break;
    cursorMilliseconds = nextCursor;

    // History reads are queries; a small pause leaves headroom under Root's limit.
    await sleep(60);
  }

  return selected;
}
