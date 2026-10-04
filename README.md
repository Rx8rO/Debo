# Debo — Root Welcome Bot

Debo counts each member's non-system channel messages and assigns a community-selected role after the fifth message. Message counts are kept in Root's persistent `appData` store and keyed by the incoming event's user ID, so the code does not hardcode member IDs.

Each community chooses the role in Root's **Global Settings**. The choice is declared in `root-manifest.json` and read at runtime; the bot does not assume that every community uses the same role name or role ID.

## Local development

1. Install Node.js 22 or newer and the Root desktop app.
2. Keep your Root `DEV_TOKEN` in a local `.env` file at the project root:

   ```text
   DEV_TOKEN=your-private-token
   ```

   Never share this token or commit `.env` to Git. The repository's `.gitignore` excludes it.

3. In PowerShell, from this folder, install dependencies and build:

   ```powershell
   npm.cmd install
   npm.cmd run build
   ```

4. In the Root client, open the community connected to the token, go to Debo's **Global Settings**, select the role to assign, and save it.
5. Start the local development bot:

   ```powershell
   npm.cmd run bot
   ```

6. After a clean test reset, post five messages as a member and verify that the selected role is assigned after message five.

For development, the test community may follow Root's tutorial permission setup. Never grant broad permissions such as Community Full Control in a real community. The manifest requests the narrower `manageRoles` permission needed to assign roles.

The `npm.cmd` form avoids PowerShell's script execution-policy issue. Command Prompt can use `npm` without the `.cmd` suffix.
