# Debo — Root Moderation and Automation Bot

Debo provides community-configurable moderation, word filtering, leveling, and anti-spam features. Each community selects an **Admin Role** and one **Owner** member in Global Settings. Admin Role members can use normal moderator commands; only the selected Owner can use sensitive configuration commands, including the word filter. Public rank lookups are available to everyone. XP, filter terms, channel settings, spam settings, and active spam timeouts are stored per community in Root `appData` and survive bot restarts.

## Commands

Use a Root user mention for `@user` and either an exact role name or a Root role mention for `role`. `userID` is the user's Root ID, not the ID of the ban record.

| Command | Who can use it | Behavior |
| --- | --- | --- |
| `!rank` | Everyone | Shows your rank, level, and XP. |
| `!rank @user` | Everyone | Shows the mentioned member's rank, level, and XP. |
| `!ranks` | Everyone | Shows up to the top 5 members with their level and XP. |
| `!ranks10` | Everyone | Shows up to the top 10 members with their level and XP. |
| `!level` | Everyone | Shows your level only. |
| `!level @user` | Everyone | Shows the mentioned member's level only. |
| `!levelconfig` | Owner | Shows the current random XP range, cooldown, and reward settings. |
| `!levelconfig xp min max` | Owner | Sets the inclusive random XP range per eligible message (each value 1–10,000). |
| `!levelconfig cooldown seconds` | Owner | Sets the per-member XP cooldown (0–86,400 seconds; 0 means no cooldown). |
| `!levelconfig reward add level @role` | Owner | Adds a role to grant when a member reaches that level (1–1,000). |
| `!levelconfig reward list` | Owner | Lists all configured level reward roles. |
| `!levelconfig reward remove level @role` | Owner | Removes a role from the reward list for that level. |
| `!levelconfig reward clear level` | Owner | Clears all configured rewards for that level. |
| `!xp add amount @user` | Admin Role | Adds XP to a member (1–1,000,000 XP per command) and applies any newly reached reward roles. |
| `!levelreset @user` | Admin Role | Resets a member's XP to 0 (level 1); already-earned roles are not removed. |
| `!spamconfig` | Owner | Shows the current spam limits and timeout setup. |
| `!spamconfig limit messages` | Owner | Sets how many messages are allowed in the configured time window (1–1,000). Messages above the limit are deleted. |
| `!spamconfig window seconds` | Owner | Sets the rolling spam window (0.1–60 seconds; decimals are allowed). |
| `!spamconfig timeout seconds` | Owner | Sets the post-trigger suppression period (0–86,400 seconds; 0 disables the extra timeout). |
| `!filter add word1,word2` | Owner | Adds one or more comma-separated words or phrases to the filter. |
| `!filter list` | Owner | Lists the configured filter terms. |
| `!filter remove word1,word2` | Owner | Removes one or more terms from the filter. |
| `!filter clear` | Owner | Removes all terms and disables word filtering. |
| `!kick @user [reason]` | Admin Role | Kicks without creating a ban; reason is optional and the action is logged in the Logs channel. |
| `!ban @user reason` | Owner | Creates a permanent ban; a reason is required and the action is logged in the Logs channel. |
| `!unban userID` | Owner | Removes an active ban by the user's Root ID and logs the action. Parentheses are also accepted: `!unban (userID)`. |
| `!bans` | Admin Role | Posts active-ban details in the Mod channel. |
| `!purge count` | Admin Role | Deletes up to 100 messages before the command in the current channel. |
| `!purge @user count` | Admin Role | Deletes up to 100 messages by that member, paging older history until it finds enough or reaches the beginning. |
| `!warn @user reason` | Admin Role | Saves a warning with its UTC date, reason, and moderator; logs it in the Logs channel. |
| `!warnings` | Admin Role | Posts warning totals in the Mod channel. |
| `!warnings @user` | Admin Role | Posts that member's numbered warning history in the Mod channel. |
| `!warn remove @user number` | Admin Role | Removes the numbered warning and logs the action in the Logs channel. |
| `!role add @user role-name-or-mention` | Admin Role | Adds the named/mentioned role and logs the change in the Logs channel. |
| `!role remove @user role-name-or-mention` | Admin Role | Removes the named/mentioned role and logs the change in the Logs channel. |
| `!roles` | Admin Role | Lists all community roles and their Root IDs in the Mod channel. |
| `!setmodchannel` | Owner | Sets the private Mod channel where reports and `!modhelp` are posted. |
| `!setmodchannel clear` | Owner | Clears the configured Mod channel. |
| `!setlogchannel` | Owner | Sets the separate Logs channel for moderation actions and automatic filter audits. |
| `!setlogchannel clear` | Owner | Clears the configured Logs channel. |
| `!help` | Everyone | Shows only commands available to everyone in the current channel. |
| `!modhelp` | Admin Role | Posts the full command list in the configured Mod channel. |

Every command message is excluded from XP.

## Automatic word filter

The filter has **no built-in words** and is disabled until the Owner adds at least one term. Manage it with Owner-only commands: `!filter add fuck,shit,hoe` adds several comma-separated terms at once, `!filter list` displays the list, `!filter remove term1,term2` removes selected terms, and `!filter clear` empties the list. Terms are stored per community and persist across restarts. Existing words configured in the removed Global Settings field are not migrated; re-enter any terms you still want with `!filter add`.

Matching is case-insensitive, so a configured `boom` matches `boom`, `BOOM`, and `Boom!`. Unicode compatibility forms, accents, common Greek/Cyrillic lookalikes, common leetspeak or censor substitutions, repeated letters, and punctuation, symbols, numbers, or spaces inserted between letters are normalized for matching; numeric suffixes such as `fuck123` are also caught. Matching still avoids a letter suffix such as `fuckery`. Because stronger obfuscation matching can create false positives, test new terms in an isolated community. When any member's message matches—including messages from Admin Role members and the Owner—Debo deletes it and sends an audit entry to the configured **Logs channel** with the member, channel ID, detected term(s), original message text, and UTC time. It does not repost the message in public chat. Ordinary messages from every member receive the same filtering checks; only valid Owner `!filter` management commands are exempt so they can still add or remove listed terms. The existing spam protection still applies as before. Make sure the Logs channel is configured and restricted to the moderators who should see deleted-message content.

## Leveling and spam protection

- A non-command member message in a community can earn XP, subject to the per-member cooldown. Defaults are a **random 5–10 XP per eligible message** and a **60-second cooldown**. Set the inclusive XP range with `!levelconfig xp min max`.
- Members start at **Level 1 with 0 XP**. Reaching Level 2 takes 100 XP; each later level requires 100 more XP than the previous level. Existing XP totals are not reset by the level-number change. `!rank` shows only rank, level, and XP; `!level` shows only the level. `!ranks` and `!ranks10` show up to the top 5 and top 10 XP earners, respectively.
- All level rewards are configured with Owner-only commands, not Global Settings. For example, `!levelconfig reward add 2 @Level2Role` and `!levelconfig reward add 5 @Level5Role` assign different roles at Levels 2 and 5. Use `reward list`, `reward remove`, and `reward clear` to manage mappings; they are saved per community. Existing command-configured mappings are migrated automatically. If you previously selected a role only in the removed Global Settings picker, add it again with `!levelconfig reward add <level> @role`. Members receive a congratulations message when Debo successfully grants them a reward role. Removing a mapping does not strip roles already awarded.
- Spam protection counts each member's messages across the community over a rolling time window. By default, the first **5 messages per 1 second** are allowed; the 6th and later messages in that window are deleted. Configure the count and window with `!spamconfig limit` and `!spamconfig window`.
- The default additional spam timeout is **10 seconds**. Root's Bot SDK does not expose a direct text-chat timeout endpoint. Select an optional **Spam Timeout Role** in **Global Settings → Automation**, then configure that role to deny sending messages in the channels you want protected. Debo applies the role temporarily and removes it when the timeout ends. If no role is selected (or Root cannot apply it), Debo still deletes that member's messages for the timeout period, but Root will not stop them from attempting to send messages. Role permissions must be configured separately; selecting the role does not configure channel permissions.
- If a member already had the timeout role before the spam trigger, Debo leaves it in place rather than removing a role it did not add. Active timeout records are restored after a Debo restart.

`!levelconfig` and `!spamconfig` require the single member selected as **Owner** in Global Settings; they fail closed if Owner is unset or cannot be matched. `!ban`, `!unban`, `!setmodchannel`, and `!setlogchannel` are also Owner-only. Other moderator commands, including `!modhelp`, `!warn`, `!kick`, `!xp add`, and `!levelreset`, continue to require the configured **Admin Role**. Permission-denial replies disappear after 5 seconds. Numeric values are set with commands because Root's current clients do not render editable numeric Global Settings controls.

`!purge` does not count or delete its own command message. Targeted purge uses Root message-history pagination and Root GUID timestamps; it has no arbitrary age cutoff. Deleting 100 messages is paced to stay under Root's approximate API rate limit, so a full purge can take a short while.

The **Mod channel** is reserved for private reports: `!warnings`, `!bans`, `!roles`, and the Admin Role-only `!modhelp` report there. If `!modhelp` is used elsewhere, Debo sends a brief confirmation that is deleted after 15 seconds. The separate **Logs channel** receives action logs for `!ban`, `!unban`, `!kick`, `!warn`/`!warn remove`, and role changes. `!help` is public and responds in the channel where it was used with only public commands. Original command messages are not deleted.

`!bans` reads Root's current active-ban list, so a successful `!unban userID` removes that user from the next list. Debo stores ban dates for bans it creates and for new ban events it observes while running. Root's current Ban API response does not include a creation date, so older bans (or bans created while Debo was offline) remain listed with their IDs/reasons but display the date as unavailable. Their reasons are displayed when Root provides one.

Warning records, Debo-tracked ban dates, and the Mod and Logs channel choices are stored per community and survive bot restarts. Dates are displayed in UTC. The old shared-channel setting is kept as a fallback for the Mod channel, so existing `!warnings`, `!bans`, `!roles`, and `!modhelp` reports keep their destination. Configure a separate Logs channel with `!setlogchannel`. In DevHost, deleting `rootsdk.sqlite3` resets this local data too; do not delete it unless you intend to clear those records.

`!help` posts the public command list in the channel where it is used. Admin Role-only `!modhelp` posts the complete command list in the configured Mod channel and never falls back to posting admin commands in a public channel. If the Mod channel is missing or inaccessible, Debo tells the admin how to fix the setup.

## Community setup

1. Install dependencies once, then build:

   ```powershell
   npm.cmd install
   npm.cmd run build
   ```

   If you already ran `npm.cmd install` in this same project folder, and `package.json` has not changed, skip it on later updates and just run `npm.cmd run build`. This update adds no dependencies.

2. Install/update Debo to manifest version **1.12.0**. Keep the requested permissions enabled: community `kick`, `createBan`, `manageBans`, and `manageRoles`; channel `createMessage`, `deleteMessageOther`, and `viewMessageHistory`. Open Debo's **Global Settings** and select one role in **Admin Role** plus the single member in **Owner**. The Admin Role gates standard moderator commands; Owner gates the high-impact commands listed above. These settings do not grant additional Root permissions. Both checks fail closed if their setting is missing.
3. In **Global Settings → Automation**, optionally select a **Spam Timeout Role**. For that role to block messages, separately configure it to deny sending messages in the channels you want protected. The configured Owner adds filter terms with `!filter add word1,word2` and checks them with `!filter list`; the list starts empty, and no built-in words are filtered. Level reward roles are configured with `!levelconfig reward add`, not Global Settings. Make sure Debo can manage roles.
4. An Owner configures two separate channels by running `!setmodchannel` in the private channel for reports and `!modhelp`, then running `!setlogchannel` in the channel for moderation-action logs. The old shared destination is retained as the Mod channel for existing communities. Make sure Debo can access and post in both channels.
5. Only the selected Owner can review or change XP and spam configuration values. Run these commands from a channel where Debo can reply:

   ```text
   !levelconfig
   !spamconfig
   ```

6. Everyone can run `!help` to see public commands, `!rank`/`!rank @user`, `!level`/`!level @user`, `!ranks` (top 5), and `!ranks10` (top 10). An Admin Role member can run `!modhelp` to post the full list in the mod channel.

## Update an existing local checkout

In PowerShell, open the Debo project folder (the folder containing `package.json`) and run:

```powershell
git fetch origin
git switch arena/01a10771-debo
git pull --ff-only origin arena/01a10771-debo
npm.cmd run build
```

If `git switch` says that branch is not available locally, run this once instead, then continue with `git pull` and the build:

```powershell
git switch --track -c arena/01a10771-debo origin/arena/01a10771-debo
```

For a brand-new checkout, run `npm.cmd install` before the build. Do not replace or share your local `.env` file while updating.

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

Use an isolated test community such as **Debo-Test**, not a real community. After building, updating the test installation, selecting an Admin Role and Owner, and starting DevHost:

1. From the account selected as Owner, temporarily speed up leveling:

   ```text
   !levelconfig xp 100 100
   !levelconfig cooldown 0
   ```

2. Send one ordinary chat message (not a `!` command), then run `!rank`. You should have 100 XP and be level 2.
3. To test an additional level reward, run `!levelconfig reward add 3 @role` using a test role mention, then send two more ordinary messages. At 300 XP you should reach level 3 and receive that role. Check the saved mapping with `!levelconfig reward list`.
4. Test another member's public lookup with `!rank @user`. Try the admin XP commands on a test member with `!xp add 50 @user`, then `!levelreset @user`; rank should return to level 1 with 0 XP.
5. Set a private Logs channel with `!setlogchannel`, then as the configured Owner add the harmless test term with `!filter add filtertest` and verify it with `!filter list`. Send `FILTERTEST!` and `F-I-L-T-E-R-T-E-S-T!` as a regular member, an Admin Role member, and the Owner; each message should be deleted and logged with the matched term and original text. Run `!filter remove filtertest` (or `!filter clear`) and send `FILTERTEST!` again; it should remain because an empty list disables word filtering. Spam protection still applies as before.
6. As the configured Owner, test spam deletion with:

   ```text
   !spamconfig limit 5
   !spamconfig window 1
   !spamconfig timeout 10
   ```

   Send more than five messages quickly from a test member. The 6th message in the one-second window should be deleted; further messages should also be hidden during the 10-second timeout. To verify a real Root mute as well, configure the selected Spam Timeout Role to deny message sending in the test channel.
7. Clear the temporary level-3 test reward and restore normal settings when finished, for example:

   ```text
   !levelconfig reward clear 3
   !levelconfig xp 5 10
   !levelconfig cooldown 60
   !spamconfig limit 5
   !spamconfig window 1
   !spamconfig timeout 10
   ```

The manifest permissions are the narrow permissions Debo needs; it does not request Community Full Control. For the local DevHost test only, Root's tutorial says its bot inherits permissions from `EVERYONE` and recommends **Community Full Control** on that role as a testing workaround. Keep that broad setting only in an isolated test community such as `Debo-Test`; never ask a real community to grant Full Control to `EVERYONE`. Our test also showed the manifest permission request alone was not effective in the current local DevHost setup. Before publishing, the approved install/update flow still needs to be verified so real communities can grant the declared narrow permissions instead.

PowerShell may block `npm.ps1`; use the `npm.cmd` commands above. Command Prompt can use `npm` without `.cmd`.
