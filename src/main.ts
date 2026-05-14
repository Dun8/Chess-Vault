import {
    App,
    Plugin,
    SuggestModal,
    TFile,
    PluginSettingTab,
    Setting,
    Notice,
    TFolder,
    TAbstractFile,
} from "obsidian";
import import_games_lichess, { LichessGame } from "./lichgame.js";
import { obrab_date_lichess, obrab_id_lichess, obrab_ratingDiff_lichess, calcStat_lichess, obrab_date_chesscom, obrab_id_chesscom, calcStat_chesscom } from "./obrab_games.js";
import import_games_chesscom, { ChesscomGame } from "./chesscomgames.js";

interface ChessVaultSettings {
    nick_lichess: string;
    nick_chesscom: string;
    targetFilePath: string;
    last_update: number;
    fileMode: "single" | "daily";
    dailyFolder: string;
    show_date: boolean;
    show_ratingDiff: boolean;
    fm_show_games: boolean;
    fm_show_wins: boolean;
    fm_show_defeats: boolean;
    fm_show_draws: boolean;
    fm_show_win_rate: boolean;
    fm_show_colors: boolean;
}

const DEFAULT_SETTINGS: ChessVaultSettings = {
    nick_lichess: "",
    nick_chesscom: "",
    targetFilePath: "",
    last_update: Date.now() - 30 * 24 * 60 * 60 * 1000,
    fileMode: "single",
    dailyFolder: "",
    show_date: false,
    show_ratingDiff: false,
    fm_show_games: true,
    fm_show_wins: true,
    fm_show_defeats: true,
    fm_show_draws: true,
    fm_show_win_rate: true,
    fm_show_colors: false,
};

export default class LichessVaultPlugin extends Plugin {
    settings: ChessVaultSettings;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new LichessVaultSettingTab(this.app, this));
        this.addCommand({
            id: "sync-chess-games",
            name: "Sync games",
            callback: () => this.syncGames(),
        });
    }

    onunload() {}

    async loadSettings() {
        const saved = await this.loadData() as Partial<ChessVaultSettings>;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async ensureFolder(folderPath: string): Promise<void> {
        const parts = folderPath.split("/").filter(Boolean);
        let current = "";
        for (const part of parts) {
            current = current ? `${current}/${part}` : part;
            const existing: TAbstractFile | null = this.app.vault.getAbstractFileByPath(current);
            if (!existing) {
                await this.app.vault.adapter.mkdir(current);
            }
        }
    }

    async syncGames() {
        let games_lichess: LichessGame[] = [];
        let games_chesscom: ChesscomGame[] = [];

        if (this.settings.nick_lichess === "" && this.settings.nick_chesscom === "") {
            new Notice("Enter your Lichess/Chesscom username in settings.");
            return;
        }
        if (this.settings.fileMode === "single" && this.settings.targetFilePath === "") {
            new Notice("Enter the target file path in settings.");
            return;
        }
        if (this.settings.fileMode === "daily" && this.settings.dailyFolder === "") {
            new Notice("Enter the daily folder path in settings.");
            return;
        }

        if (this.settings.nick_lichess !== "") {
            games_lichess = await import_games_lichess(this.settings.nick_lichess, this.settings.last_update, Date.now());
        }
        if (this.settings.nick_chesscom !== "") {
            games_chesscom = await import_games_chesscom(this.settings.nick_chesscom, this.settings.last_update, Date.now());
        }

        if (games_lichess.length === 0 && games_chesscom.length === 0) {
            new Notice("No new games found.");
            this.settings.last_update = Date.now();
            await this.saveSettings();
            return;
        }

        const game_id_lichess: string[] = obrab_id_lichess(games_lichess);
        const game_date_lichess: string[] = obrab_date_lichess(games_lichess);
        const game_ratingDiff_lichess: number[] = obrab_ratingDiff_lichess(this.settings.nick_lichess, games_lichess);
        const game_id_chesscom: string[] = obrab_id_chesscom(games_chesscom);
        const game_date_chesscom: string[] = obrab_date_chesscom(games_chesscom);

        if (this.settings.fileMode === "daily") {
            const byDay_lichess = new Map<string, LichessGame[]>();
            const byDay_chesscom = new Map<string, ChesscomGame[]>();

            for (const game of games_lichess) {
                const d = new Date(game.lastMoveAt);
                const dateString = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                if (!byDay_lichess.has(dateString)) byDay_lichess.set(dateString, []);
                byDay_lichess.get(dateString)!.push(game);
            }
            for (const game of games_chesscom) {
                const d = new Date(game.end_time * 1000);
                const dateString = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                if (!byDay_chesscom.has(dateString)) byDay_chesscom.set(dateString, []);
                byDay_chesscom.get(dateString)!.push(game);
            }
            
            const allDates = new Set([...byDay_lichess.keys(), ...byDay_chesscom.keys()]);

            for (const dateString of allDates) {
                const filePath = `${this.settings.dailyFolder}/${dateString}.md`;
                const abstract = this.app.vault.getAbstractFileByPath(filePath);
                let File: TFile | null = null;

                const dayGames_lichess = byDay_lichess.get(dateString) ?? [];
                const dayGames_chesscom = byDay_chesscom.get(dateString) ?? [];

                const stat_lichess = calcStat_lichess(this.settings.nick_lichess, dayGames_lichess);
                const stat_chesscom = calcStat_chesscom(this.settings.nick_chesscom, dayGames_chesscom);

                const totalGames = stat_lichess.number_of_games_played + stat_chesscom.number_of_games_played;
                const totalWins = stat_lichess.wins + stat_chesscom.wins;
                const totalDefeats = stat_lichess.defeats + stat_chesscom.defeats;
                const totalDraws = stat_lichess.draws + stat_chesscom.draws;
                const totalWinRate = totalGames ? totalWins / totalGames : 0;
                const totalWhite = stat_lichess.number_of_games_for_white + stat_chesscom.number_of_games_for_white;
                const totalBlack = stat_lichess.number_of_games_for_black + stat_chesscom.number_of_games_for_black;

                const fmLines = ["---", `date: ${dateString}`];
                if (this.settings.fm_show_games)   fmLines.push(`games: ${totalGames}`);
                if (this.settings.fm_show_wins)     fmLines.push(`wins: ${totalWins}`);
                if (this.settings.fm_show_defeats)  fmLines.push(`defeats: ${totalDefeats}`);
                if (this.settings.fm_show_draws)    fmLines.push(`draws: ${totalDraws}`);
                if (this.settings.fm_show_win_rate) fmLines.push(`win_rate: ${Math.round(totalWinRate * 100)}%`);
                if (this.settings.fm_show_colors) {
                    fmLines.push(`games_as_white: ${totalWhite}`);
                    fmLines.push(`games_as_black: ${totalBlack}`);
                }
                fmLines.push("---");
                const frontmatter = fmLines.join("\n");

                const iframes_lichess = dayGames_lichess.map((game) => {
                    const ratingDiff = game.players.white.user.name === this.settings.nick_lichess
                        ? game.players.white.ratingDiff
                        : game.players.black.ratingDiff;

                    let prefix = "";
                    if (this.settings.show_date) {
                        const dt = new Date(game.lastMoveAt);
                        prefix += `\n> 📅 ${dt.toLocaleString()}\n`;
                    }
                    if (this.settings.show_ratingDiff) prefix += `\n> 📈 Rating diff: \`${ratingDiff}\`\n`;

                    return `\n${prefix}<iframe src="https://lichess.org/embed/game/${game.id}?theme=auto&bg=auto" width=600 height=397 frameborder=0></iframe>\n`;
                }).join("");

                const iframes_chesscom = dayGames_chesscom.map((game) => {
                    let prefix = "";
                    if (this.settings.show_date) {
                        const dt = new Date(game.end_time * 1000);
                        prefix += `\n> 📅 ${dt.toLocaleString()}\n`;
                    }

                    return `\n${prefix}<iframe src="https://www.chess.com/game/live/${game.uuid}" width=600 height=397 frameborder=0></iframe>\n`;
                }).join("");

                if (abstract instanceof TFile) {
                    File = abstract;
                }

                const newContent = frontmatter + "\n" + iframes_lichess + iframes_chesscom;

                if (File === null) {
                    await this.ensureFolder(this.settings.dailyFolder);
                    await this.app.vault.create(filePath, newContent);
                } else {
                    const existing = await this.app.vault.read(File);
                    const withoutFrontmatter = existing.startsWith("---")
                        ? existing.replace(/^---[\s\S]*?---\n/, "")
                        : existing;
                    await this.app.vault.modify(File, frontmatter + "\n" + withoutFrontmatter + iframes_lichess + iframes_chesscom);
                }
            }

        } else if (this.settings.fileMode === "single") {
            const abstract = this.app.vault.getAbstractFileByPath(this.settings.targetFilePath);
            let File: TFile | null = null;

            if (abstract instanceof TFile) {
                File = abstract;
            } else if (abstract !== null) {
                new Notice("The specified path is a folder, not a file.");
                return;
            }

            if (File === null) {
                const folderPath = this.settings.targetFilePath.includes("/")
                    ? this.settings.targetFilePath.substring(0, this.settings.targetFilePath.lastIndexOf("/"))
                    : "";
                if (folderPath) await this.ensureFolder(folderPath);
                File = await this.app.vault.create(this.settings.targetFilePath, "");
            }

            // Lichess
            for (let i = 0; i < game_id_lichess.length; i++) {
                let prefix = "";
                if (this.settings.show_date) prefix += `\n> 📅 ${game_date_lichess[i]}\n`;
                if (this.settings.show_ratingDiff) prefix += `\n> 📈 Rating diff: \`${game_ratingDiff_lichess[i]}\`\n`;

                const block = `\n${prefix}<iframe src="https://lichess.org/embed/game/${game_id_lichess[i]}?theme=auto&bg=auto" width=600 height=397 frameborder=0></iframe>\n`;
                const existing = await this.app.vault.read(File);
                await this.app.vault.modify(File, existing + block);
            }

            // Chess.com
            for (let i = 0; i < game_id_chesscom.length; i++) {
                let prefix = "";
                if (this.settings.show_date) prefix += `\n> 📅 ${game_date_chesscom[i]}\n`;

                const block = `\n${prefix}<iframe src="https://www.chess.com/game/live/${game_id_chesscom[i]}" width=600 height=397 frameborder=0></iframe>\n`;
                const existing = await this.app.vault.read(File);
                await this.app.vault.modify(File, existing + block);
            }
        }

        this.settings.last_update = Date.now();
        await this.saveSettings();
        new Notice(`Added ${games_lichess.length + games_chesscom.length} games.`);
    }
}

// Автодополнение файлов

class FileSuggestModal extends SuggestModal<TFile> {
    private onSelect: (file: TFile) => void;

    constructor(app: App, onSelect: (file: TFile) => void) {
        super(app);
        this.onSelect = onSelect;
    }

    getSuggestions(query: string): TFile[] {
        const q = query.toLowerCase();
        return this.app.vault.getMarkdownFiles().filter(
            (f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)
        );
    }

    renderSuggestion(file: TFile, el: HTMLElement): void {
        el.createDiv({ text: file.name });
        el.createEl("small", { text: file.path, cls: "suggestion-note" });
    }

    onChooseSuggestion(file: TFile): void {
        this.onSelect(file);
    }
}

// Автодополнение папок

class FolderSuggestModal extends SuggestModal<TFolder> {
    private onSelect: (folder: TFolder) => void;

    constructor(app: App, onSelect: (folder: TFolder) => void) {
        super(app);
        this.onSelect = onSelect;
    }

    getSuggestions(query: string): TFolder[] {
        const q = query.toLowerCase();
        return this.app.vault
            .getAllLoadedFiles()
            .filter((f): f is TFolder => f instanceof TFolder)
            .filter((f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q));
    }

    renderSuggestion(folder: TFolder, el: HTMLElement): void {
        el.createDiv({ text: folder.name });
        if (folder.path !== "/") {
            el.createEl("small", { text: folder.path, cls: "suggestion-note" });
        }
    }

    onChooseSuggestion(folder: TFolder): void {
        this.onSelect(folder);
    }
}

// Разворачивающаяся секция

function createCollapsible(containerEl: HTMLElement, title: string, buildContent: (el: HTMLElement) => void): void {
    const header = containerEl.createDiv({ cls: "chess-collapsible-header" });
    const arrow = header.createSpan({ cls: "chess-collapsible-arrow" });
    arrow.setText("▶");
    header.createSpan({ text: title });
    const content = containerEl.createDiv({ cls: "chess-collapsible-content" });
    buildContent(content);
    header.addEventListener("click", () => {
        const isOpen = content.classList.contains("open");
        content.toggleClass("open", !isOpen);
        arrow.toggleClass("open", !isOpen);
    });
}

// Вкладка настроек

class LichessVaultSettingTab extends PluginSettingTab {
    plugin: LichessVaultPlugin;

    constructor(app: App, plugin: LichessVaultPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName("Chesscom username")
            .setDesc("Your login on chess.com")
            .addText((text) =>
                text
                    .setPlaceholder("e.g. MagnusCarlsen")
                    .setValue(this.plugin.settings.nick_chesscom)
                    .onChange((value) => {
                        this.plugin.settings.nick_chesscom = value;
                        void this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Lichess username")
            .setDesc("Your login on lichess.org")
            .addText((text) =>
                text
                    .setPlaceholder("e.g. MagnusCarlsen")
                    .setValue(this.plugin.settings.nick_lichess)
                    .onChange((value) => {
                        this.plugin.settings.nick_lichess = value;
                        void this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Save mode")
            .setDesc("Save all games to one file or to a separate file for each day.")
            .addDropdown((drop) =>
                drop
                    .addOption("single", "Single file")
                    .addOption("daily", "Daily files")
                    .setValue(this.plugin.settings.fileMode)
                    .onChange((value) => {
                        this.plugin.settings.fileMode = value as "single" | "daily";
                        void this.plugin.saveSettings();
                        this.display();
                    })
            );

        if (this.plugin.settings.fileMode === "single") {
            new Setting(containerEl)
                .setName("Target file")
                .setDesc("File where games will be appended. Click 🔍 to browse.")
                .addText((text) => {
                    text
                        .setPlaceholder("Enter path, e.g. Chess/games.md")
                        .setValue(this.plugin.settings.targetFilePath)
                        .onChange((value) => {
                            this.plugin.settings.targetFilePath = value;
                            void this.plugin.saveSettings();
                        });
                })
                .addButton((btn) => {
                    btn.setButtonText("🔍").onClick(() => {
                        new FileSuggestModal(this.app, (file) => {
                            this.plugin.settings.targetFilePath = file.path;
                            void this.plugin.saveSettings();
                            this.display();
                        }).open();
                    });
                });
        } else {
            new Setting(containerEl)
                .setName("Daily folder")
                .setDesc("Folder where daily files will be created. Click 🔍 to browse.")
                .addText((text) => {
                    text
                        .setPlaceholder("Enter path, e.g. Chess/Daily")
                        .setValue(this.plugin.settings.dailyFolder)
                        .onChange((value) => {
                            this.plugin.settings.dailyFolder = value;
                            void this.plugin.saveSettings();
                        });
                })
                .addButton((btn) => {
                    btn.setButtonText("🔍").onClick(() => {
                        new FolderSuggestModal(this.app, (folder) => {
                            this.plugin.settings.dailyFolder = folder.path;
                            void this.plugin.saveSettings();
                            this.display();
                        }).open();
                    });
                });
        }

        createCollapsible(containerEl, "⚙️ Show before each game", (el) => {
            new Setting(el)
                .setName("Game date")
                .addToggle((toggle) =>
                    toggle
                        .setValue(this.plugin.settings.show_date)
                        .onChange((value) => {
                            this.plugin.settings.show_date = value;
                            void this.plugin.saveSettings();
                        })
                );

            new Setting(el)
                .setName("Rating diff")
                .setDesc("Lichess only")
                .addToggle((toggle) =>
                    toggle
                        .setValue(this.plugin.settings.show_ratingDiff)
                        .onChange((value) => {
                            this.plugin.settings.show_ratingDiff = value;
                            void this.plugin.saveSettings();
                        })
                );
        });

        if (this.plugin.settings.fileMode === "daily") {
            createCollapsible(containerEl, "📊 File properties (frontmatter)", (el) => {
                new Setting(el)
                    .setName("Number of games")
                    .addToggle((toggle) =>
                        toggle
                            .setValue(this.plugin.settings.fm_show_games)
                            .onChange((value) => {
                                this.plugin.settings.fm_show_games = value;
                                void this.plugin.saveSettings();
                            })
                    );
                new Setting(el)
                    .setName("Wins")
                    .addToggle((toggle) =>
                        toggle
                            .setValue(this.plugin.settings.fm_show_wins)
                            .onChange((value) => {
                                this.plugin.settings.fm_show_wins = value;
                                void this.plugin.saveSettings();
                            })
                    );
                new Setting(el)
                    .setName("Defeats")
                    .addToggle((toggle) =>
                        toggle
                            .setValue(this.plugin.settings.fm_show_defeats)
                            .onChange((value) => {
                                this.plugin.settings.fm_show_defeats = value;
                                void this.plugin.saveSettings();
                            })
                    );
                new Setting(el)
                    .setName("Draws")
                    .addToggle((toggle) =>
                        toggle
                            .setValue(this.plugin.settings.fm_show_draws)
                            .onChange((value) => {
                                this.plugin.settings.fm_show_draws = value;
                                void this.plugin.saveSettings();
                            })
                    );
                new Setting(el)
                    .setName("Win rate")
                    .addToggle((toggle) =>
                        toggle
                            .setValue(this.plugin.settings.fm_show_win_rate)
                            .onChange((value) => {
                                this.plugin.settings.fm_show_win_rate = value;
                                void this.plugin.saveSettings();
                            })
                    );
                new Setting(el)
                    .setName("Games as white / black")
                    .addToggle((toggle) =>
                        toggle
                            .setValue(this.plugin.settings.fm_show_colors)
                            .onChange((value) => {
                                this.plugin.settings.fm_show_colors = value;
                                void this.plugin.saveSettings();
                            })
                    );
            });
        }

        const lastSync = this.plugin.settings.last_update;
        const lastSyncText = lastSync > 0 ? new Date(lastSync).toLocaleString() : "Never";

        new Setting(containerEl)
            .setName("Last sync")
            .setDesc(lastSyncText)
            .addButton((btn) =>
                btn
                    .setButtonText("Reset (30 days)")
                    .onClick(() => {
                        this.plugin.settings.last_update = Date.now() - 30 * 24 * 60 * 60 * 1000;
                        void this.plugin.saveSettings();
                        this.display();
                        new Notice("Reset to 30 days ago. Will load games from the last 30 days.");
                    })
            )
            .addButton((btn) =>
                btn
                    .setButtonText("Reset (all time) ⚠️")
                    .setWarning()
                    .onClick(() => {
                        this.plugin.settings.last_update = 0;
                        void this.plugin.saveSettings();
                        this.display();
                        new Notice("Warning: all games will be loaded. This may cause errors if you have many games.");
                    })
            );

        containerEl.createEl("p", {
            text: "⚠️ Importing a large number of games (1000+) may cause errors due to Lichess API limits.",
            cls: "setting-item-description",
        });
    }
}