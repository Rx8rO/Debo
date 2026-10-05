# Debo App

Debo App is separate from the existing Debo Bot. It has exactly two top-level dashboards:

- **Member:** your level, total XP, and the top five or ten community members.
- **Admin / Mod:** automation and moderation configuration for authorized people.

The Admin / Mod dashboard is available to the configured **Admin Role** or **Owner**. Existing policy is preserved: the selected Owner alone can change XP, spam, reward, word-filter, and channel settings. The server checks this permission on every change; hiding a button in the client is not the security boundary.

## Build

From this folder:

```sh
npm install
npm run build
```

The build compiles the Protobuf service, App server, and client. The sandbox needed a local `protoc` binary because certificate verification blocked Root's compiler download. If your build reports that exact protoc TLS-certificate error, install a local compiler and retry:

```sh
npm install --no-save --package-lock=false --ignore-scripts protoc@35.1.0
npm run build
```

That workaround is local only and is not added to the App's runtime dependencies.

## Local testing

Run the Root App dev host and the client in separate terminals, following the Root App setup for your machine. The client command is:

```sh
npm run client --workspace client
```

The standalone browser preview is only a UI preview. Live member data and dashboard actions require the App to be connected through Root's App dev host.

**Verification note:** `npm run build` succeeded in this workspace. The sandbox could not fetch the native SQLite prebuild / Node headers during the initial install, so I did not run the Root dev host or test against a live community. A successful build is not a live test or a release.

Before release, test in a private test community. Configure the Admin Role and Owner in Root's App settings, verify each dashboard and permission boundary, and test commands, rewards, filter behavior, moderation reports, and audit logs. Do not continue to a public release until pre-release testing is complete.

## Existing Bot and data

The existing Bot registration and source stay separate and unchanged. The App has its own Root registration (`ADGtuq6yhgmzM5InhEGOTA`) and its own storage. Existing Bot XP, reward mappings, filtered terms, warnings, bans, and channel selections do **not** appear automatically in the App. Keep the Bot installed as a fallback until any data/configuration transfer has been deliberately handled and tested.

Keep local Root development credentials in the ignored environment file. Never put credentials in source control, screenshots, or chat.
