# Debo — Root Moderation Bot

Debo provides community-configurable moderation commands. Each community selects its own **Admin Role** in Global Settings; command users are checked against that role before any moderation action runs. Kick, ban, and role changes are sent to that community's configured moderation log channel. Warnings are stored persistently in Root `appData`.

## Commands

Use a Root user mention for `@user` and either an exact role name or a Root role mention for `role`.

| Command | Behavior |
| --- | --- |
| `!kick @user [reason]` | Kicks without creating a ban; reason is optional. |
| `!kick vc @user` | Finds the member in voice channels Debo can access, then kicks them from those voice sessions. |
| `!ban @user reason` | Creates a permanent ban; a reason is required. |
| `!purge count` | Deletes up to 100 messages before the command in the current channel. |
| `!purge @user count` | Deletes up to 100 messages by that member, paging older history until it finds enough or reaches the beginning. |
| `!warn @user reason` | Saves a warning with its UTC date, reason, and moderator. Does not create a moderation log entry. |
| `!warnings` | Posts a warning count for each warned member in the configured log channel; the report and confirmation disappear after 15 seconds. |
| `!warnings @user` | Posts that member's numbered warning history, dates, and reasons in the log channel; the report and confirmation disappear after 15 seconds. |
| `!warn remove @user number` | Removes the numbered warning shown by `!warnings @user`. Remaining warnings are renumbered when shown. |
| `!role add @user role-name-or-mention` | Adds the named/mentioned role and logs the change. |
| `!role remove @user role-name-or-mention` | Removes the named/mentioned role and logs the change. |
| `!setlogchannel` | Sets the channel where this command is run as this community's moderation log channel. |
| `!setlogchannel clear` | Clears the configured log channel. |
| `!help` | Posts the command list in the moderation log channel and replies to the request. |

`!purge` does not count or delete its own command message. Targeted purge uses Root message-history pagination and Root GUID timestamps; it has no arbitrary age cutoff. Deleting 100 messages is paced to stay under Root's approximate API rate limit, so a full purge can take a short while.

`!warnings` reports include a mention of the moderator who requested them. The report in the log channel and the bot's confirmation reply are automatically deleted after 15 seconds; the user's original `!warnings` command remains. `!warn` and `!warn remove` do not create logs. Warning records and the log-channel choice are stored per community and survive bot restarts. Dates are displayed in UTC. In DevHost, deleting `rootsdk.sqlite3` resets this local data too, including warnings and the saved log channel; do not delete it unless you intend to clear those records.

Root's Bot SDK does not expose a direct-message channel for sending a full help list. Therefore `!help` posts the list in the configured log channel, mentions the requester there, and replies to the original command. If the log channel is not set or Debo cannot access it, help falls back to the channel where `!help` was used.

## Community setup

1. Install dependencies and build:

   ```powershell
   npm.cmd install
   npm.cmd run build
   ```

2. In Root, open Debo's **Global Settings** and select one role in **Admin Role**. Members need that role to run moderation commands. This setting only gates Debo's commands; it does not grant extra permissions in Root. If the setting is missing, commands fail closed.
3. In the channel you want to use for moderation logs, an authorized moderator runs:

   ```text
   !setlogchannel
   ```

   The channel ID is saved separately for each community. Root's current Global Settings docs say the client does not render a channel-picker control, so Debo uses this command rather than relying on an unrendered Global Settings dropdown. If the log channel is private, make sure Debo can access and post in it. For `!kick vc`, Debo also needs visibility to the voice channel and the channel-level `voiceKick` permission; access-rule overlays can remove declared channel permissions.
4. Run `!help` in Root to see the command list.

## Local development and permissions

Keep your Root `DEV_TOKEN` in a local `.env` file at the project root. Never share the token or commit `.env`; `.gitignore` excludes it. If your existing `.env` is still in the older sibling folder `C:\Users\rx8ro\Desktop\Debo`, copy the file locally into the current repo without opening or pasting its contents:

```powershell
Copy-Item "$HOME\Desktop\Debo\.env" "$HOME\Desktop\Debo-work\.env"
```

Start the local DevHost with:

```powershell
npm.cmd run bot
```

The manifest requests the narrow permissions this feature set needs: community `kick`, `createBan`, and `manageRoles`; channel `createMessage`, `deleteMessageOther`, `viewMessageHistory`, and `voiceKick`. It does not request `manageBans` because Debo does not yet implement an unban command.

For the local DevHost test only, Root's tutorial says its bot inherits permissions from `EVERYONE` and recommends **Community Full Control** on that role as a testing workaround. Keep that broad setting only in an isolated test community such as `Debo-Test`; never ask a real community to grant Full Control to `EVERYONE`. Our test also showed the manifest permission request alone was not effective in the current local DevHost setup. Before publishing, the approved install/update flow still needs to be verified so real communities can grant the declared narrow permissions instead.

PowerShell may block `npm.ps1`; use the `npm.cmd` commands above. Command Prompt can use `npm` without `.cmd`.
