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
import import_games, { LichessGame } from "./lichgame.js";
import { obrab_date, obrab_id, obrab_ratingDiff, calcStat } from "./obrab_games.js";

// Настройки

interface ChessVaultSettings {
    nick: string;
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
    nick: "",
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

// Основной класс

export default class LichessVaultPlugin extends Plugin {
    settings: ChessVaultSettings;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new LichessVaultSettingTab(this.app, this));

        this.addCommand({
            id: "sync-chess-games",
            name: "Sync games from Lichess",
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
        let games: LichessGame[] = [];

        if (this.settings.nick === "") {
            new Notice("Enter your Lichess username in settings.");
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

        games = await import_games(this.settings.nick, this.settings.last_update, Date.now());

        if (games.length === 0) {
            new Notice("No new games found.");
            this.settings.last_update = Date.now();
            await this.saveSettings();
            return;
        }

        const game_id: string[] = obrab_id(games);
        const game_date: string[] = obrab_date(games);
        const game_ratingDiff: number[] = obrab_ratingDiff(this.settings.nick, games);

        if (this.settings.fileMode === "daily") {

            const byDay = new Map<string, LichessGame[]>();
            for (const game of games) {
                const d = new Date(game.createdAt);
                const dateString = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                if (!byDay.has(dateString)) byDay.set(dateString, []);
                byDay.get(dateString)!.push(game);
            }

            for (const [dateString, dayGames] of byDay) {
                const filePath = `${this.settings.dailyFolder}/${dateString}.md`;
                const abstract = this.app.vault.getAbstractFileByPath(filePath);
                let File: TFile | null = null;

                const stat = calcStat(this.settings.nick, dayGames);

                const fmLines = ["---", `date: ${dateString}`];
                if (this.settings.fm_show_games)   fmLines.push(`games: ${stat.number_of_games_played}`);
                if (this.settings.fm_show_wins)     fmLines.push(`wins: ${stat.wins}`);
                if (this.settings.fm_show_defeats)  fmLines.push(`defeats: ${stat.defeats}`);
                if (this.settings.fm_show_draws)    fmLines.push(`draws: ${stat.draws}`);
                if (this.settings.fm_show_win_rate) fmLines.push(`win_rate: ${Math.round(stat.winning_percentage * 100)}%`);
                if (this.settings.fm_show_colors) {
                    fmLines.push(`games_as_white: ${stat.number_of_games_for_white}`);
                    fmLines.push(`games_as_black: ${stat.number_of_games_for_black}`);
                }
                fmLines.push("---");
                const frontmatter = fmLines.join("\n");

                const iframes = dayGames.map((game) => {
                    const ratingDiff = game.players.white.user.name === this.settings.nick
                        ? game.players.white.ratingDiff
                        : game.players.black.ratingDiff;

                    let prefix = "";
                    if (this.settings.show_date) {
                        const dt = new Date(game.createdAt);
                        prefix += `\n> 📅 ${dt.toLocaleString()}\n`;
                    }
                    if (this.settings.show_ratingDiff) prefix += `\n> 📈 Rating diff: \`${ratingDiff}\`\n`;

                    return `\n${prefix}<iframe src="https://lichess.org/embed/game/${game.id}?theme=auto&bg=auto" width=600 height=397 frameborder=0></iframe>\n`;
                }).join("");

                if (abstract instanceof TFile) {
                    File = abstract;
                }

                if (File === null) {
                    await this.ensureFolder(this.settings.dailyFolder);
                    await this.app.vault.create(filePath, frontmatter + "\n" + iframes);
                } else {
                    const existing = await this.app.vault.read(File);
                    const withoutFrontmatter = existing.startsWith("---")
                        ? existing.replace(/^---[\s\S]*?---\n/, "")
                        : existing;
                    await this.app.vault.modify(File, frontmatter + "\n" + withoutFrontmatter + iframes);
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

            for (let i = 0; i < game_id.length; i++) {
                let prefix = "";
                if (this.settings.show_date) prefix += `\n> 📅 ${game_date[i]}\n`;
                if (this.settings.show_ratingDiff) prefix += `\n> 📈 Rating diff: \`${game_ratingDiff[i]}\`\n`;

                const block = `\n${prefix}<iframe src="https://lichess.org/embed/game/${game_id[i]}?theme=auto&bg=auto" width=600 height=397 frameborder=0></iframe>\n`;
                const existing = await this.app.vault.read(File);
                await this.app.vault.modify(File, existing + block);
            }
        }

        this.settings.last_update = Date.now();
        await this.saveSettings();
        new Notice(`Added ${games.length} games.`);
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
            .setName("Lichess username")
            .setDesc("Your login on lichess.org")
            .addText((text) =>
                text
                    .setPlaceholder("e.g. MagnusCarlsen")
                    .setValue(this.plugin.settings.nick)
                    .onChange((value) => {
                        this.plugin.settings.nick = value;
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