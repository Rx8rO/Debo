# Debo — Root Welcome Bot

Debo is being built in two stages:

1. Verify Root's tutorial behavior in the `Debo-Test` community: count a member's messages and assign the `Participant` role after their fifth message.
2. Make the bot community-configurable with a Root global-setting role picker, so each community can choose its own role instead of relying on a role name in code.

The current tutorial implementation stores counts in Root's persistent `appData` key-value store. It uses the incoming event's member ID, not a hardcoded user ID. For this tutorial stage only, it finds the role named `Participant` in the current community at runtime; it does not hardcode a role ID. We will replace this name lookup with a per-community setting after verifying the tutorial end to end.

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

4. Start the local development bot:

   ```powershell
   npm.cmd run bot
   ```

5. In the `Debo-Test` community, post five messages as a member. Check the bot terminal for the count logs and verify that the member receives the `Participant` role after message five.

For the tutorial test only, follow Root's role-permission setup in the disposable test community. Do not grant broad permissions such as Community Full Control in a real community. The final version should request only the permissions it needs and use community-level settings for each community's role choice.

The `npm.cmd` form avoids PowerShell's script execution-policy issue. Command Prompt can use `npm` without the `.cmd` suffix.
