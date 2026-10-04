import {
  ChannelMessageCreatedEvent,
  ChannelMessageEvent,
  CommunityMemberRoleAddRequest,
  CommunityRoleGuid,
  MessageType,
  ReadOnlyMemberGroup,
  RootApiException,
  rootServer,
  UserGuid,
} from "@rootsdk/server-bot";

const MESSAGES_REQUIRED = 5;
const SETTINGS_GROUP = "welcome";
const ROLE_SETTING = "participantRole";

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

    // The community-configured role is assigned on the member's fifth message.
    if (count === MESSAGES_REQUIRED) {
      const roleId: CommunityRoleGuid = getConfiguredRoleId();
      await assignRole(evt.userId, roleId);
      console.log(`Assigned configured role ${roleId} to ${evt.userId}`);
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

function getConfiguredRoleId(): CommunityRoleGuid {
  const selectedRoleGroup = rootServer.globalSettings?.[SETTINGS_GROUP]?.[
    ROLE_SETTING
  ] as ReadOnlyMemberGroup | undefined;
  const roleId = selectedRoleGroup?.communityRoleIds[0];

  if (!roleId) {
    throw new Error(
      'No role selected. Open Debo\'s Global Settings and choose a role for "Role to assign".',
    );
  }

  return roleId;
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
