import {
    App,
    Plugin,
    AbstractInputSuggest,
    TFile,
    PluginSettingTab,
    Setting,
    Notice, TFolder,
} from "obsidian";
import import_games, {LichessGame} from "./lichgame.js";
import {obrab_date, obrab_id, obrab_ratingDiff, calcStat} from "./obrab_games.js";

// Настройки

interface MyPluginSettings {
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

const DEFAULT_SETTINGS: MyPluginSettings = {
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

export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new MySettingTab(this.app, this));

        this.addCommand({
            id: "sync-chess-games",
            name: "Синхронизировать партии с Lichess",
            callback: () => this.syncGames(),
        });
    }

    onunload() {}

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async ensureFolder(folderPath: string): Promise<void> {
        const parts = folderPath.split("/").filter(Boolean);
        let current = "";
        for (const part of parts) {
            current = current ? `${current}/${part}` : part;
            const existing = this.app.vault.getAbstractFileByPath(current);
            if (!existing) {
                await this.app.vault.createFolder(current);
            }
        }
    }

    async syncGames() {

        let games: LichessGame[] = [];

        if (this.settings.nick == "") {
            new Notice('Впишите свой ник в настройки!');
            return;
        }
        if (this.settings.fileMode === "single" && this.settings.targetFilePath == "") {
            new Notice('Впишите путь куда сохранять партии!');
            return;
        }
        if (this.settings.fileMode === "daily" && this.settings.dailyFolder == "") {
            new Notice('Впишите папку для ежедневных файлов!');
            return;
        }

        games = await import_games(this.settings.nick, this.settings.last_update, Date.now())

        if (games.length === 0) {
            new Notice('Новых партий нет!');
            this.settings.last_update = Date.now();
            await this.saveSettings();
            return;
        }

        let game_id: string[] = obrab_id(games);
        let game_date: string[] = obrab_date(games);
        let game_ratingDiff: number[] = obrab_ratingDiff(this.settings.nick, games);

        if (this.settings.fileMode == "daily") {

            const byDay = new Map<string, LichessGame[]>();
            for (const game of games) {
                const d = new Date(game.createdAt);
                const dateString = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
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
                    if (this.settings.show_ratingDiff) prefix += `\n> 📈 RatingDiff: \`${ratingDiff}\`\n`;

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

        } else if (this.settings.fileMode == "single") {
            const abstract = this.app.vault.getAbstractFileByPath(this.settings.targetFilePath);
            let File: TFile | null = null;

            if (abstract instanceof TFile) {
                File = abstract;
            } else if (abstract !== null) {
                new Notice("Указанный путь — это папка, а не файл.");
                return;
            }

            if (File === null) {
                const folderPath = this.settings.targetFilePath.includes("/")
                    ? this.settings.targetFilePath.substring(0, this.settings.targetFilePath.lastIndexOf("/"))
                    : "";
                if (folderPath) await this.ensureFolder(folderPath);
                File = await this.app.vault.create(this.settings.targetFilePath, '');
            }

            for (let i = 0; i < game_id.length; i++) {
                let prefix = "";
                if (this.settings.show_date) prefix += `\n> 📅 ${game_date[i]}\n`;
                if (this.settings.show_ratingDiff) prefix += `\n> 📈 RatingDiff: \`${game_ratingDiff[i]}\`\n`;

                const block = `\n${prefix}<iframe src="https://lichess.org/embed/game/${game_id[i]}?theme=auto&bg=auto" width=600 height=397 frameborder=0></iframe>\n`;
                const existing = await this.app.vault.read(File);
                await this.app.vault.modify(File, existing + block);
            }
        }

        this.settings.last_update = Date.now();
        await this.saveSettings();
        new Notice(`Добавлено ${games.length} партий.`);
    }
}

//Предложение выбора файлов/папок в настройках

class FileSuggest extends AbstractInputSuggest<TFile> {
    constructor(app: App, private inputEl: HTMLInputElement) {
        super(app, inputEl);
    }

    getSuggestions(inputStr: string): TFile[] {
        const files = this.app.vault.getMarkdownFiles();
        const q = inputStr.toLowerCase();
        return files.filter(
            (f) =>
                f.name.toLowerCase().includes(q) ||
                f.path.toLowerCase().includes(q)
        );
    }

    renderSuggestion(file: TFile, el: HTMLElement): void {
        el.createEl("div", { text: file.name });
        el.createEl("small", { text: file.path, cls: "suggestion-note" });
    }

    selectSuggestion(file: TFile): void {
        this.inputEl.value = file.path;
        this.inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        this.inputEl.dispatchEvent(new Event("change", { bubbles: true }));
        this.close();
    }
}

class FolderSuggest extends AbstractInputSuggest<TFolder> {
    constructor(app: App, private inputEl: HTMLInputElement) {
        super(app, inputEl);
    }

    getSuggestions(inputStr: string): TFolder[] {
        const files = this.app.vault.getAllLoadedFiles().filter(f => f instanceof TFolder) as TFolder[];
        const q = inputStr.toLowerCase();
        return files.filter(
            (f) =>
                f.name.toLowerCase().includes(q) ||
                f.path.toLowerCase().includes(q)
        );
    }

    renderSuggestion(file: TFolder, el: HTMLElement): void {
        el.createEl("div", { text: file.name });
        if (file.path === "/") {
            el.createEl("small", { text: file.path, cls: "suggestion-note" });
        }
    }

    selectSuggestion(file: TFolder): void {
        this.inputEl.value = file.path;
        this.inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        this.inputEl.dispatchEvent(new Event("change", { bubbles: true }));
        this.close();
    }
}

// Разворачивающаяся секция
function createCollapsible(containerEl: HTMLElement, title: string, buildContent: (el: HTMLElement) => void): void {
    const header = containerEl.createEl("div", { cls: "chess-collapsible-header" });
    header.style.cssText = "display:flex; align-items:center; cursor:pointer; padding: 8px 0; font-weight:600; border-bottom: 1px solid var(--background-modifier-border);";

    const arrow = header.createEl("span");
    arrow.style.cssText = "margin-right: 8px; transition: transform 0.2s;";
    arrow.setText("▶");

    header.createEl("span", { text: title });

    const content = containerEl.createEl("div");
    content.style.cssText = "display:none; padding-left: 12px;";

    buildContent(content);

    header.addEventListener("click", () => {
        const isOpen = content.style.display !== "none";
        content.style.display = isOpen ? "none" : "block";
        arrow.style.transform = isOpen ? "" : "rotate(90deg)";
    });
}

// Настройки

class MySettingTab extends PluginSettingTab {
    plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName("Никнейм на Lichess")
            .setDesc("Твой логин на lichess.org")
            .addText((text) =>
                text
                    .setPlaceholder("например: MagnusCarlsen")
                    .setValue(this.plugin.settings.nick)
                    .onChange(async (value) => {
                        this.plugin.settings.nick = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Вид сохранения")
            .addDropdown(drop => drop
                .addOption("single", "В один файл")
                .addOption("daily", "В файлы по дням")
                .setValue(this.plugin.settings.fileMode)
                .onChange(async (value) => {
                    this.plugin.settings.fileMode = value as "single" | "daily";
                    await this.plugin.saveSettings();
                    this.display();
                })
            );

        if (this.plugin.settings.fileMode === "single") {
            new Setting(containerEl)
                .setName("Файл для партий")
                .setDesc("Файл, в который будут добавляться партии.")
                .addSearch((search) => {
                    search
                        .setPlaceholder("Введите имя или путь...")
                        .setValue(this.plugin.settings.targetFilePath)
                        .onChange(async (value) => {
                            this.plugin.settings.targetFilePath = value;
                            await this.plugin.saveSettings();
                        });
                    new FileSuggest(this.app, search.inputEl);
                });
        } else {
            new Setting(containerEl)
                .setName("Папка для партий")
                .setDesc("Папка, в которую будут добавляться файлы с ежедневными партиями.")
                .addSearch((search) => {
                    search
                        .setPlaceholder("Введите имя или путь...")
                        .setValue(this.plugin.settings.dailyFolder)
                        .onChange(async (value) => {
                            this.plugin.settings.dailyFolder = value;
                            await this.plugin.saveSettings();
                        });
                    new FolderSuggest(this.app, search.inputEl);
                });
        }

        // Секция

        createCollapsible(containerEl, "⚙️ Что показывать перед каждой партией", (el) => {
            new Setting(el)
                .setName("Дату партии")
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.show_date)
                    .onChange(async (value) => {
                        this.plugin.settings.show_date = value;
                        await this.plugin.saveSettings();
                    })
                );

            new Setting(el)
                .setName("Изменение рейтинга")
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.show_ratingDiff)
                    .onChange(async (value) => {
                        this.plugin.settings.show_ratingDiff = value;
                        await this.plugin.saveSettings();
                    })
                );
        });

        if (this.plugin.settings.fileMode === "daily") {
            createCollapsible(containerEl, "📊 Свойства файла (frontmatter)", (el) => {
                new Setting(el)
                    .setName("Количество партий")
                    .addToggle(toggle => toggle
                        .setValue(this.plugin.settings.fm_show_games)
                        .onChange(async (value) => {
                            this.plugin.settings.fm_show_games = value;
                            await this.plugin.saveSettings();
                        })
                    );

                new Setting(el)
                    .setName("Победы")
                    .addToggle(toggle => toggle
                        .setValue(this.plugin.settings.fm_show_wins)
                        .onChange(async (value) => {
                            this.plugin.settings.fm_show_wins = value;
                            await this.plugin.saveSettings();
                        })
                    );

                new Setting(el)
                    .setName("Поражения")
                    .addToggle(toggle => toggle
                        .setValue(this.plugin.settings.fm_show_defeats)
                        .onChange(async (value) => {
                            this.plugin.settings.fm_show_defeats = value;
                            await this.plugin.saveSettings();
                        })
                    );

                new Setting(el)
                    .setName("Ничьи")
                    .addToggle(toggle => toggle
                        .setValue(this.plugin.settings.fm_show_draws)
                        .onChange(async (value) => {
                            this.plugin.settings.fm_show_draws = value;
                            await this.plugin.saveSettings();
                        })
                    );

                new Setting(el)
                    .setName("Процент побед")
                    .addToggle(toggle => toggle
                        .setValue(this.plugin.settings.fm_show_win_rate)
                        .onChange(async (value) => {
                            this.plugin.settings.fm_show_win_rate = value;
                            await this.plugin.saveSettings();
                        })
                    );

                new Setting(el)
                    .setName("Партии за белых / чёрных")
                    .addToggle(toggle => toggle
                        .setValue(this.plugin.settings.fm_show_colors)
                        .onChange(async (value) => {
                            this.plugin.settings.fm_show_colors = value;
                            await this.plugin.saveSettings();
                        })
                    );
            });
        }

        // Синхронизация

        const lastSync = this.plugin.settings.last_update;
        const lastSyncText = lastSync > 0 ? new Date(lastSync).toLocaleString() : "ещё не было";

        new Setting(containerEl)
            .setName("Последняя синхронизация")
            .setDesc(lastSyncText)
            .addButton((btn) =>
                btn
                    .setButtonText("Сбросить (30 дней)")
                    .setTooltip("Загрузит партии за последние 30 дней")
                    .onClick(async () => {
                        this.plugin.settings.last_update = Date.now() - 30 * 24 * 60 * 60 * 1000;
                        await this.plugin.saveSettings();
                        this.display();
                        new Notice("Дата сброшена на 30 дней назад.");
                    })
            )
            .addButton((btn) =>
                btn
                    .setButtonText("Сбросить (всё время)")
                    .setWarning()
                    .setTooltip("⚠️ Осторожно: если партий много — возможна ошибка!")
                    .onClick(async () => {
                        this.plugin.settings.last_update = 0;
                        await this.plugin.saveSettings();
                        this.display();
                        new Notice("⚠️ Будут загружены все партии за всё время. Это может вызвать ошибку если их очень много.");
                    })
            );

        containerEl.createEl("p", {
            text: "⚠️ Импорт большого количества партий (1000+) может привести к ошибке из-за ограничений Lichess API и размера файла.",
            cls: "setting-item-description"
        });
    }
}