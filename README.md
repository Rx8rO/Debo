# Debo — Root Moderation and Automation Bot

Debo provides community-configurable moderation, leveling, and anti-spam features. Each community selects its own **Admin Role** in Global Settings; moderation commands and automation settings are checked against that role. Public rank lookups are available to everyone. XP, spam settings, and active spam timeouts are stored with a community-specific key in Root `appData` and survive bot restarts.

## Commands

Use a Root user mention for `@user` and either an exact role name or a Root role mention for `role`. `userID` is the user's Root ID, not the ID of the ban record.

| Command | Who can use it | Behavior |
| --- | --- | --- |
| `!rank` | Everyone | Shows your community rank, level, total XP, and progress to the next level. |
| `!rank @user` | Everyone | Shows the mentioned member's rank, level, XP, and progress. |
| `!levelconfig` | Admin Role | Shows the current random XP range, cooldown, and reward settings. |
| `!levelconfig xp min max` | Admin Role | Sets the inclusive random XP range per eligible message (each value 1–10,000). |
| `!levelconfig cooldown seconds` | Admin Role | Sets the per-member XP cooldown (0–86,400 seconds; 0 means no cooldown). |
| `!levelconfig rolelevel level` | Admin Role | Sets the level at which the primary Global Settings reward role is assigned (1–1,000). |
| `!levelconfig reward add level @role` | Admin Role | Adds a role to grant when a member reaches that level (1–1,000). |
| `!levelconfig reward list` | Admin Role | Lists primary and additional level reward roles. |
| `!levelconfig reward remove level @role` | Admin Role | Removes a role from the additional reward list for that level. |
| `!levelconfig reward clear level` | Admin Role | Clears all additional reward roles for that level; the primary Global Settings reward is unchanged. |
| `!spamconfig` | Admin Role | Shows the current spam limits and timeout setup. |
| `!spamconfig limit messages` | Admin Role | Sets how many messages are allowed in the configured time window (1–1,000). Messages above the limit are deleted. |
| `!spamconfig window seconds` | Admin Role | Sets the rolling spam window (0.1–60 seconds; decimals are allowed). |
| `!spamconfig timeout seconds` | Admin Role | Sets the post-trigger suppression period (0–86,400 seconds; 0 disables the extra timeout). |
| `!kick @user [reason]` | Admin Role | Kicks without creating a ban; reason is optional. |
| `!ban @user reason` | Admin Role | Creates a permanent ban; a reason is required. The moderation log includes the user's Root ID. |
| `!unban userID` | Admin Role | Removes an active ban by the user's Root ID. Parentheses are also accepted: `!unban (userID)`. |
| `!bans` | Admin Role | Lists active bans in the mod channel, including user IDs and reasons. Dates are shown when Debo has recorded them. |
| `!purge count` | Admin Role | Deletes up to 100 messages before the command in the current channel. |
| `!purge @user count` | Admin Role | Deletes up to 100 messages by that member, paging older history until it finds enough or reaches the beginning. |
| `!warn @user reason` | Admin Role | Saves a warning with its UTC date, reason, and moderator. Does not create a moderation log entry. |
| `!warnings` | Admin Role | Posts a warning count for each warned member in the mod channel. The report stays there. |
| `!warnings @user` | Admin Role | Posts that member's numbered warning history, dates, and reasons in the mod channel. The report stays there. |
| `!warn remove @user number` | Admin Role | Removes the numbered warning shown by `!warnings @user`. |
| `!role add @user role-name-or-mention` | Admin Role | Adds the named/mentioned role and logs the change. |
| `!role remove @user role-name-or-mention` | Admin Role | Removes the named/mentioned role and logs the change. |
| `!roles` | Admin Role | Lists all community roles and their Root IDs in the mod channel. |
| `!setmodchannel` | Admin Role | Sets the channel where this command is run as this community's mod channel. |
| `!setmodchannel clear` | Admin Role | Clears the configured mod channel. |
| `!help` | Everyone | Posts the command list in the mod channel; the list stays there. |

`!setlogchannel` remains as a compatibility alias for `!setmodchannel`, so existing setup commands still work. Every command message is excluded from XP.

## Leveling and spam protection

- A non-command member message in a community can earn XP, subject to the per-member cooldown. Defaults are a **random 5–10 XP per eligible message** and a **60-second cooldown**. Set the inclusive XP range with `!levelconfig xp min max`.
- Level 1 takes 100 XP, level 2 takes 200 additional XP, level 3 takes 300 additional XP, and so on. `!rank` reports total XP and progress within the current level. The community leaderboard ranks members who have earned XP.
- The optional primary **Level Reward Role** is selected in Debo's **Global Settings → Automation**. `!levelconfig rolelevel` chooses its threshold. To assign different roles at multiple levels, an Admin Role member can run `!levelconfig reward add <level> @role`; use `reward list`, `reward remove`, and `reward clear` to manage those extra rewards. Reward mappings are saved per community.
- Spam protection counts each member's messages across the community over a rolling time window. By default, the first **5 messages per 1 second** are allowed; the 6th and later messages in that window are deleted. Configure the count and window with `!spamconfig limit` and `!spamconfig window`.
- The default additional spam timeout is **10 seconds**. Root's Bot SDK does not expose a direct text-chat timeout endpoint. Select an optional **Spam Timeout Role** in **Global Settings → Automation**, then configure that role to deny sending messages in the channels you want protected. Debo applies the role temporarily and removes it when the timeout ends. If no role is selected (or Root cannot apply it), Debo still deletes that member's messages for the timeout period, but Root will not stop them from attempting to send messages. Role permissions must be configured separately; selecting the role does not configure channel permissions.
- If a member already had the timeout role before the spam trigger, Debo leaves it in place rather than removing a role it did not add. Active timeout records are restored after a Debo restart.

All numeric configuration commands require the configured **Admin Role** and fail closed if no Admin Role is selected or its membership cannot be verified. Non-admin command replies say “You are not an admin meow 🐾” and disappear after 5 seconds. The role pickers are optional. Numeric values are set with commands because Root's current clients do not render editable numeric Global Settings controls.

`!purge` does not count or delete its own command message. Targeted purge uses Root message-history pagination and Root GUID timestamps; it has no arbitrary age cutoff. Deleting 100 messages is paced to stay under Root's approximate API rate limit, so a full purge can take a short while.

`!warnings`, `!bans`, `!roles`, and `!help` reports are persistent messages in the mod channel. If one of these commands is run outside the mod channel, Debo sends a brief confirmation reply that is deleted after 15 seconds. If the command is run inside the mod channel, Debo skips that redundant confirmation. The original command message is not deleted. Reports mention who requested them. `!warn` and `!warn remove` do not create logs.

`!bans` reads Root's current active-ban list, so a successful `!unban userID` removes that user from the next list. Debo stores ban dates for bans it creates and for new ban events it observes while running. Root's current Ban API response does not include a creation date, so older bans (or bans created while Debo was offline) remain listed with their IDs/reasons but display the date as unavailable. Their reasons are displayed when Root provides one.

Warning records, Debo-tracked ban dates, and the mod-channel choice are stored per community and survive bot restarts. Dates are displayed in UTC. In DevHost, deleting `rootsdk.sqlite3` resets this local data too, including warnings, tracked ban dates, the saved mod channel, automation settings, XP, and active timeout records; do not delete it unless you intend to clear those records.

Root's Bot SDK does not expose a direct-message channel for sending a full help list. Therefore `!help` posts the list in the configured mod channel, mentions the requester there, and replies to the original command when they asked elsewhere. If the mod channel is not set or Debo cannot access it, help falls back to the channel where `!help` was used.

## Community setup

1. Install dependencies once, then build:

   ```powershell
   npm.cmd install
   npm.cmd run build
   ```

   If you already ran `npm.cmd install` in this same project folder, and `package.json` has not changed, skip it on later updates and just run `npm.cmd run build`. This update adds no dependencies.

2. Install/update Debo to manifest version **1.6.0**. Keep the requested permissions enabled: community `kick`, `createBan`, `manageBans`, and `manageRoles`; channel `createMessage`, `deleteMessageOther`, and `viewMessageHistory`. Open Debo's **Global Settings** and select one role in **Admin Role**. Members need that role to use moderation and numeric configuration commands. This setting only gates Debo's commands; it does not grant additional Root permissions. If it is missing, those commands fail closed.
3. Still in **Global Settings → Automation**, optionally select a **Level Reward Role** and/or **Spam Timeout Role**. For the spam role to block messages, separately configure it to deny sending messages in the channels you want protected. Make sure Debo can manage roles.
4. In the channel you want to use for moderation logs and reports, an authorized moderator runs:

   ```text
   !setmodchannel
   ```

   The saved destination is retained from earlier versions of Debo. Root's current Global Settings docs say the client does not render a channel-picker control, so Debo uses this command rather than relying on an unrendered Global Settings dropdown. Make sure Debo can access and post in the mod channel.
5. An Admin Role member can review or change defaults in any channel where Debo can reply:

   ```text
   !levelconfig
   !spamconfig
   ```

6. Run `!help` in Root to see the complete command list. Everyone can run `!rank` or `!rank @user`.

## Local development and permissions

Keep your Root `DEV_TOKEN` in a local `.env` file at the project root. Never share the token or commit `.env`; `.gitignore` excludes it. If your existing `.env` is still in the older sibling folder `C:\Users\rx8ro\Desktop\Debo`, copy the file locally into the current repo without opening or pasting its contents:

```powershell
Copy-Item "$HOME\Desktop\Debo\.env" "$HOME\Desktop\Debo-work\.env"
```

Start the local DevHost with:

```powershell
npm.cmd run bot
```

### Safe automation test in Debo-Test

Use an isolated test community such as **Debo-Test**, not a real community. After building, updating the test installation, selecting an Admin Role, and starting DevHost:

1. From an account with the Admin Role, temporarily speed up leveling:

   ```text
   !levelconfig xp 100 100
   !levelconfig cooldown 0
   !levelconfig rolelevel 1
   ```

2. Send one ordinary chat message (not a `!` command), then run `!rank`. You should have 100 XP and be level 1. If a Level Reward Role is selected, Debo should assign it after that XP award.
3. To test an additional level reward, run `!levelconfig reward add 2 @role` using a test role mention, then send two more ordinary messages. At 300 XP you should reach level 2 and receive that role. Check the saved mapping with `!levelconfig reward list`.
4. Test another member's public lookup with `!rank @user`.
5. Test spam deletion with:

   ```text
   !spamconfig limit 5
   !spamconfig window 1
   !spamconfig timeout 10
   ```

   Send more than five messages quickly from a test member. The 6th message in the one-second window should be deleted; further messages should also be hidden during the 10-second timeout. To verify a real Root mute as well, configure the selected Spam Timeout Role to deny message sending in the test channel.
6. Clear the temporary level-2 test reward and restore normal settings when finished, for example:

   ```text
   !levelconfig reward clear 2
   !levelconfig xp 5 10
   !levelconfig cooldown 60
   !levelconfig rolelevel 5
   !spamconfig limit 5
   !spamconfig window 1
   !spamconfig timeout 10
   ```

The manifest permissions are the narrow permissions Debo needs; it does not request Community Full Control. For the local DevHost test only, Root's tutorial says its bot inherits permissions from `EVERYONE` and recommends **Community Full Control** on that role as a testing workaround. Keep that broad setting only in an isolated test community such as `Debo-Test`; never ask a real community to grant Full Control to `EVERYONE`. Our test also showed the manifest permission request alone was not effective in the current local DevHost setup. Before publishing, the approved install/update flow still needs to be verified so real communities can grant the declared narrow permissions instead.

PowerShell may block `npm.ps1`; use the `npm.cmd` commands above. Command Prompt can use `npm` without `.cmd`.
