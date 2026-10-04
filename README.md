# Debo — Root Bot

This repository contains the TypeScript starter project for Debo, created with Root's official `create-root` tool. The starter listens for `/echo <text>` in the bot's test community and replies with the same text. We will verify this basic bot first, then follow Root's Welcome Bot tutorial to count messages and assign a role.

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

5. Open the Root desktop app, enter the test community associated with the token, and send `/echo hello` in a channel the bot can access.

The `npm.cmd` form avoids PowerShell's script execution-policy issue. Command Prompt can use `npm` without the `.cmd` suffix.
