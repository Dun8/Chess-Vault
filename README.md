
# Chess Vault

A plugin for Obsidian that syncs your chess games from Lichess and Chess.com directly into your vault. Games are saved as embedded boards — you can view and analyze them right inside your notes.

---

## Features

* Sync games from **Lichess** and **Chess.com** simultaneously
* Two saving modes: single file or separate file per day
* Incremental sync — only new games are fetched each time
* Optional prefix before each game: date and/or rating change (rating change — Lichess only)
* Frontmatter with combined daily statistics (wins, losses, draws, win rate, etc.) — available in daily mode only
* Automatic creation of folders and files
* Settings with collapsible sections

---

## Installation

### Manual

1. Download or clone the repository
2. Install dependencies and build the plugin:

   ```bash
   npm install
   npm run build
   ```
3. Copy the following three files into your vault's plugin folder:

   ```
   vault/
   └── .obsidian/
       └── plugins/
           └── obsidian-chess-vault/
               ├── main.js
               ├── manifest.json
               └── data.json
   ```
4. In Obsidian: **Settings → Community Plugins → enable Obsidian Chess Vault**

> The `.obsidian` folder may be hidden — enable hidden files in your file explorer.

---

## Usage

### Setup

Open **Settings → Obsidian Chess Vault** and fill in:

| Field              | Description                          |
| ------------------ | ------------------------------------ |
| Chess.com Username | Your username on chess.com           |
| Lichess Username   | Your username on lichess.org         |
| Save Mode          | Single file or separate file per day |
| Games File         | Path to file (single file mode)      |
| Games Folder       | Folder for daily files (daily mode)  |

You can fill in one or both usernames — the plugin will only fetch from services where a username is provided.

---

### Sync

Open the Command Palette (`Ctrl+P` / `Cmd+P`) and select:

```
Sync games
```

Or assign a hotkey in **Settings → Hotkeys**.

---

## Saving Modes

### Single File

All games are appended to the end of one selected file — first Lichess games, then Chess.com games.

### Daily Files

A separate file is created for each day in the selected folder.
File name format: `YYYY-MM-DD.md`, for example `2026-04-25.md`.

Each file starts with frontmatter containing **combined** daily statistics from both platforms:

```yaml
---
date: 2026-04-25
games: 6
wins: 4
defeats: 1
draws: 1
win_rate: 67%
---
```

The set of fields can be configured in the **📊 File Properties (frontmatter)** section.

Lichess games are shown as embedded boards. Chess.com games are shown as links (Chess.com does not support public iframe embedding):

```
[♟ Chess.com — открыть партию](https://www.chess.com/game/live/uuid)
```

---

## Prefix Settings

In the section **⚙️ Show before each game**, you can enable:

* **Game Date** — end time of the game (both platforms)
* **Rating Diff** — rating change after the game *(Lichess only)*

Example with both enabled (Lichess):

```
> 📅 25.04.2026, 19:58:00
> 📈 Rating diff: `+5`
<iframe ...></iframe>
```

---

## Sync & Reset

By default, on first launch the plugin loads games from the **last 30 days**.

The settings display the date of the last sync. Reset options:

* **Reset (30 days)** — next sync will load games from the past month
* **Reset (all time)** — loads all games ever played

> ⚠️ Importing a large number of games (1000+) may cause errors due to Lichess API limits and file size. Use "all time" reset carefully.

---

## Project Structure

```
src/
├── main.ts           — main plugin class, settings UI
├── lichgame.ts       — Lichess API requests
├── chesscomgames.ts  — Chess.com API requests
└── obrab_games.ts    — game processing, statistics
data.json             — saved plugin settings
manifest.json         — plugin metadata
```

---

## Development

```bash
npm install       # install dependencies
npm run dev       # build in watch mode
npm run build     # production build
```

---

## Requirements

* Obsidian 0.15.0+
* Node.js 18+ (for building)
* Lichess and/or Chess.com account
```