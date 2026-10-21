# Publication and community submission

## Owner and source

- GitHub owner and author: `Muel-Cassini`
- Repository: `https://github.com/Muel-Cassini/obsidian-month-planner`
- Proposed listing name: `Month Planner`
- Plugin ID: `month-planner` (keep unchanged to retain existing plugin data)
- License: MIT
- Payment type: Free
- Initial public distribution: `0.1.2`

## Build and GitHub release

1. Run `npm run build`, `npm test`, and `npm run check`.
2. Verify the plugin in a separate vault containing only `main.js`, `manifest.json`, and `styles.css`. Do not rely solely on a build or syntax check.
3. Commit only source, documentation, and metadata. Do not commit generated `main.js`, optional `ui.html`, vault data, profiles, or credentials.
4. Create a GitHub tag matching the manifest version exactly, such as `0.1.2` (without `v`).
5. Attach `main.js`, `manifest.json`, and `styles.css` individually to the corresponding GitHub Release. A ZIP by itself is insufficient for Obsidian or BRAT.
6. Verify public downloads before announcing the release.

## Submit to the current community directory

The official submission flow currently uses the Community directory rather than an old pull-request tutorial.

1. Sign in at <https://community.obsidian.md> using an Obsidian account.
2. In the community profile, connect GitHub account `Muel-Cassini`.
3. Open **Plugins > New plugin** and enter `https://github.com/Muel-Cassini/obsidian-month-planner`.
4. Set the owner, review the developer policies, and personally confirm the required commitment to support, remove, or transfer the plugin if maintenance stops.
5. Submit and inspect the automated manifest, release, source, and build checks. Resolve reported errors before publishing the directory listing.
6. Only call the plugin available in the Community Plugins browser after the listing actually becomes installable.

Current official references:

- <https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin>
- <https://docs.obsidian.md/community-directory/set-up-and-claim>
- <https://docs.obsidian.md/community-directory/submission-requirements-for-plugins>
- <https://docs.obsidian.md/community-directory/developer-policies>

## Before claiming mobile support is verified

Test the release on an actual iPhone and iPad. Check first installation, opening the embedded interface, category creation/deletion, date editing, text entry and keyboard dismissal, persistence after closing/reopening, and importing/exporting calendar files. Desktop narrow-window testing does not replace device testing.

## Listing copy

Short description:

Plan deadlines in a monthly calendar, organize custom categories, and record daily progress with manual iCalendar import and export.

Long description:

Month Planner keeps dated deadlines in a month grid, undated work in a sidebar, and actual completion history with handwritten progress in the selected day's details. Create custom category colors and show priority separately. Export selected deadlines as all-day iCalendar events or preview and import selected events from a file. The interface is currently Chinese. Everything is stored locally in the current vault; no account, payment, network connection, or telemetry is required by the plugin. Multi-device synchronization and Apple Calendar exchange are separate, manually configured workflows.
