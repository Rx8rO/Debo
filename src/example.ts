import {
  ChannelMessageCreatedEvent,
  ChannelMessageEvent,
  CommunityMemberRoleAddRequest,
  CommunityRole,
  CommunityRoleGuid,
  MessageType,
  RootApiException,
  rootServer,
  UserGuid,
} from "@rootsdk/server-bot";

// This is the tutorial's temporary role-name lookup. Once the tutorial works,
// we will replace it with a per-community role picker in root-manifest.json.
const PARTICIPANT_ROLE_NAME = "Participant";
const MESSAGES_REQUIRED = 5;

// Register for new channel messages when the bot starts.
export function initializeWelcomeBot(): void {
  rootServer.community.channelMessages.on(
    ChannelMessageEvent.ChannelMessageCreated,
    onMessage,
  );
}

async function onMessage(evt: ChannelMessageCreatedEvent): Promise<void> {
  // System events are not member messages and should not count.
  if (evt.messageType === MessageType.System) return;

  try {
    // appData is Root's persistent key-value store. The key is the actual
    // member ID from this event, so we do not hardcode a user ID.
    const count: number = await rootServer.dataStore.appData.update(
      evt.userId,
      (previousCount: number) => previousCount + 1,
      0,
    );

    console.log(`Message count for ${evt.userId}: ${count}`);

    // The tutorial assigns Participant on the member's fifth message.
    if (count === MESSAGES_REQUIRED) {
      const roleId: CommunityRoleGuid = await getParticipantRoleId();
      await assignRole(evt.userId, roleId);
      console.log(`Assigned ${PARTICIPANT_ROLE_NAME} to ${evt.userId}`);
    }
  } catch (error: unknown) {
    if (error instanceof RootApiException) {
      console.error("Root API error while processing message:", error.errorCode);
    } else if (error instanceof Error) {
      console.error("Error while processing message:", error.message);
    } else {
      console.error("Unknown error while processing message:", error);
    }
  }
}

async function getParticipantRoleId(): Promise<CommunityRoleGuid> {
  const roles: CommunityRole[] =
    await rootServer.community.communityRoles.list();
  const participantRole = roles.find(
    (role: CommunityRole) => role.name === PARTICIPANT_ROLE_NAME,
  );

  if (!participantRole) {
    throw new Error(
      `Role "${PARTICIPANT_ROLE_NAME}" was not found in this community.`,
    );
  }

  return participantRole.id;
}

async function assignRole(
  userId: UserGuid,
  roleId: CommunityRoleGuid,
): Promise<void> {
  const request: CommunityMemberRoleAddRequest = {
    communityRoleId: roleId,
    userIds: [userId],
  };

  await rootServer.community.communityMemberRoles.add(request);
}
