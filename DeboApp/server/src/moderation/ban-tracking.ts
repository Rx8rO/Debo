import {
  CommunityMemberBanCreatedEvent,
  CommunityMemberBanEvent,
  rootServer,
} from "@rootsdk/server-app";
import { saveBanRecordIfMissing } from "./storage";

/** Record dates for bans Debo observes, including bans issued outside commands. */
export function initializeBanTracking(): void {
  rootServer.community.communityMemberBans.on(
    CommunityMemberBanEvent.CommunityMemberBanCreated,
    (event) => {
      void recordObservedBan(event);
    },
  );
}

async function recordObservedBan(
  event: CommunityMemberBanCreatedEvent,
): Promise<void> {
  try {
    const ban = await rootServer.community.communityMemberBans.get({
      userId: event.userId,
    });
    await saveBanRecordIfMissing({
      banId: ban.id,
      userId: ban.userId,
      issuedAt: new Date().toISOString(),
      reason: event.reason || ban.reason || "",
      moderatorId: ban.agentUserId,
      targetName: String(ban.userId),
    });
  } catch (error: unknown) {
    console.warn("Debo could not record metadata for a newly observed ban:", error);
  }
}
