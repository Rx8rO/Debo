# Privacy Policy for Debo

**Last updated: October 5, 2026**

Debo is a Root community bot operated by the developer using the Root username **rx8ro**. It provides moderation, configured word filtering, anti-spam, leveling, and related community features. This policy describes information Debo processes when a community installs and uses the bot.

## Information Debo processes

- **Community messages and commands:** Debo processes messages in community channels it can access to recognize commands, check the configured word filter and spam rules, and award XP; it is not designed to read private direct messages. Debo does not create a general archive of ordinary messages. If a message matches a configured filter term and a Logs channel is configured and accessible, Debo posts an audit there. The audit can include the original message text (truncated when long), the matched term or terms, the author's Root user ID and display name, the channel ID, and the time in UTC. Debo also replies in that channel with a temporary warning that mentions the author; the warning is deleted after 10 seconds.
- **Identifiers and profile details:** Debo uses Root user, role, and channel IDs and, where needed, member display names or nicknames to check access, respond to commands, manage roles, and create moderation records.
- **Leveling and configuration records:** Debo stores XP totals and related award timestamps/message IDs, configured filter terms, leveling and reward settings, spam settings, selected channel IDs, and active spam-timeout records.
- **Moderation records:** When moderators use warning, ban, kick, or role-management features, Debo may store or post records containing the affected member's ID and name, the moderator's ID, the action, its reason or details, and the time. Warning and ban records are retained in the community's Bot data store until removed or otherwise cleared. Moderation action reports are posted to the configured Logs channel.

## How information is used and stored

Debo uses this information only to provide its community features: command responses, XP and rank calculations, filtering, spam protection, role rewards, and moderation records. Persistent Bot data is stored separately for each community using Root's Bot data storage and is not shared between communities by Debo. Ordinary message text is processed for these features but is not kept by Debo as a general chat transcript; filtered-message audits are the exception described above.

Configuration and records generally remain until they are changed or removed by the community's administrators or through available bot controls. Active spam-timeout records are removed when the timeout expires. Messages posted in the community's Logs or Mod channels remain subject to that community's channel access, deletion, and Root's platform retention practices. Communities should restrict the Logs channel to trusted moderators because it may contain deleted-message text and moderation reasons.

## Sharing and third-party services

Debo does not sell personal information, use it for advertising or profiling, or intentionally send it to unrelated third-party services. Debo uses Root's platform and SDK to receive community events, store per-community Bot data, and carry out authorized community actions. Root's own privacy and retention policies also apply to information processed by the Root platform.

## Choices and contact

Community administrators configure Debo's settings and control access to its Mod and Logs channels. Members with questions or requests about information Debo has stored can contact the community's administrators or the Bot operator at **Root username: rx8ro**.

This policy describes Debo's current behavior and may be updated if the bot's features or data practices change.
