# Debo — Root Moderation Bot

Debo provides community-configurable moderation commands. Each community selects its own **Admin Role** in Global Settings; command users are checked against that role before any moderation command runs. Kick, ban, unban, role changes, and information reports use the community's configured **mod channel**. Warning and Debo-observed ban metadata are stored in Root `appData`.

## Commands

Use a Root user mention for `@user` and either an exact role name or a Root role mention for `role`. `userID` is the user's Root ID, not the ID of the ban record.

| Command | Behavior |
| --- | --- |
| `!kick @user [reason]` | Kicks without creating a ban; reason is optional. |
| `!ban @user reason` | Creates a permanent ban; a reason is required. The moderation log includes the user's Root ID. |
| `!unban userID` | Removes an active ban by the user's Root ID. Parentheses are also accepted: `!unban (userID)`. |
| `!bans` | Lists active bans in the mod channel, including user IDs and reasons. Dates are shown when Debo has recorded them. |
| `!purge count` | Deletes up to 100 messages before the command in the current channel. |
| `!purge @user count` | Deletes up to 100 messages by that member, paging older history until it finds enough or reaches the beginning. |
| `!warn @user reason` | Saves a warning with its UTC date, reason, and moderator. Does not create a moderation log entry. |
| `!warnings` | Posts a warning count for each warned member in the mod channel. The report stays there. |
| `!warnings @user` | Posts that member's numbered warning history, dates, and reasons in the mod channel. The report stays there. |
| `!warn remove @user number` | Removes the numbered warning shown by `!warnings @user`. |
| `!role add @user role-name-or-mention` | Adds the named/mentioned role and logs the change. |
| `!role remove @user role-name-or-mention` | Removes the named/mentioned role and logs the change. |
| `!roles` | Lists all community roles and their Root IDs in the mod channel. |
| `!setmodchannel` | Sets the channel where this command is run as this community's mod channel. |
| `!setmodchannel clear` | Clears the configured mod channel. |
| `!help` | Posts the command list in the mod channel; the list stays there. |

`!setlogchannel` remains as a compatibility alias for `!setmodchannel`, so existing setup commands still work.

`!purge` does not count or delete its own command message. Targeted purge uses Root message-history pagination and Root GUID timestamps; it has no arbitrary age cutoff. Deleting 100 messages is paced to stay under Root's approximate API rate limit, so a full purge can take a short while.

`!warnings`, `!bans`, `!roles`, and `!help` reports are persistent messages in the mod channel. If one of these commands is run outside the mod channel, Debo sends a brief confirmation reply that is deleted after 15 seconds. If the command is run inside the mod channel, Debo skips that redundant confirmation. The original command message is not deleted. Reports mention who requested them. `!warn` and `!warn remove` do not create logs.

`!bans` reads Root's current active-ban list, so a successful `!unban userID` removes that user from the next list. Debo stores ban dates for bans it creates and for new ban events it observes while running. Root's current Ban API response does not include a creation date, so older bans (or bans created while Debo was offline) remain listed with their IDs/reasons but display the date as unavailable. Their reasons are displayed when Root provides one.

Warning records, Debo-tracked ban dates, and the mod-channel choice are stored per community and survive bot restarts. Dates are displayed in UTC. In DevHost, deleting `rootsdk.sqlite3` resets this local data too, including warnings, tracked ban dates, and the saved mod channel; do not delete it unless you intend to clear those records.

Root's Bot SDK does not expose a direct-message channel for sending a full help list. Therefore `!help` posts the list in the configured mod channel, mentions the requester there, and replies to the original command when they asked elsewhere. If the mod channel is not set or Debo cannot access it, help falls back to the channel where `!help` was used.

## Community setup

1. Install dependencies once, then build:

   ```powershell
   npm.cmd install
   npm.cmd run build
   ```

   If you already ran `npm.cmd install` in this same project folder, and `package.json` has not changed, skip it on later updates and just run `npm.cmd run build`. This update adds no dependencies.

2. Install/update Debo to manifest version **1.4.1** and approve the new community `manageBans` permission; `!bans` and `!unban` need it. Then open Debo's **Global Settings** and select one role in **Admin Role**. Members need that role to run moderation commands. This setting only gates Debo's commands; it does not grant additional Root permissions. If the setting is missing, commands fail closed.
3. In the channel you want to use for moderation logs and reports, an authorized moderator runs:

   ```text
   !setmodchannel
   ```

   The saved destination is retained from earlier versions of Debo. Root's current Global Settings docs say the client does not render a channel-picker control, so Debo uses this command rather than relying on an unrendered Global Settings dropdown. Make sure Debo can access and post in the mod channel.
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

The manifest requests the narrow permissions this feature set needs: community `kick`, `createBan`, `manageBans`, and `manageRoles`; channel `createMessage`, `deleteMessageOther`, and `viewMessageHistory`. `manageBans` is needed to list and remove bans.

For the local DevHost test only, Root's tutorial says its bot inherits permissions from `EVERYONE` and recommends **Community Full Control** on that role as a testing workaround. Keep that broad setting only in an isolated test community such as `Debo-Test`; never ask a real community to grant Full Control to `EVERYONE`. Our test also showed the manifest permission request alone was not effective in the current local DevHost setup. Before publishing, the approved install/update flow still needs to be verified so real communities can grant the declared narrow permissions instead.

PowerShell may block `npm.ps1`; use the `npm.cmd` commands above. Command Prompt can use `npm` without `.cmd`.
