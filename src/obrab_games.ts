import { LichessGame } from "./lichgame.js";
import { ChesscomGame } from "./chesscomgames.js";

export interface GameStat {
    wins: number;
    defeats: number;
    draws: number;
    winning_percentage: number;
    percentage_of_defeats: number;
    percentage_of_draws: number;
    number_of_games_played: number;
    number_of_games_for_white: number;
    number_of_games_for_black: number;
    percentage_of_games_for_white: number;
    percentage_of_games_for_black: number;
    player_colors: Array<"white" | "black">;
}
//chesscom

export function obrab_id_chesscom(games: ChesscomGame[]): string[] {
    return games.map((game) => game.uuid);
}

export function obrab_date_chesscom(games: ChesscomGame[]) :string[] {
    return games.map((game) => new Date(game.end_time).toLocaleString());
}


export function calcStat_chesscom(nick: string, games: ChesscomGame[]): GameStat {
    let wins = 0;
    let defeats = 0;
    let draws = 0;
    const player_colors: Array<"white" | "black"> = [];
    const total = games.length;

    games.forEach((game) => {
        const color: "white" | "black" =
            game.white.username === nick ? "white" : "black";
        player_colors.push(color);

        let result:string;
        if (color === "white") {
            result = game.white.result;
        }
        else {
            result = game.black.result;
        }

        const win = result === "win";

        const loss = [
            "checkmated",
            "timeout",
            "resigned",
            "lose"
        ].includes(result);

        const draw = [
            "agreed",
            "repetition",
            "stalemate",
            "insufficient",
            "timevsinsufficient",
            "50move"
        ].includes(result);

        if (win) wins++;
        if (loss) defeats++;
        if (draw) draws++;
    });

    const number_of_games_for_white = player_colors.filter(
        (c) => c === "white"
    ).length;
    const number_of_games_for_black = total - number_of_games_for_white;
    return {
        wins,
        defeats,
        draws,
        winning_percentage: total ? wins / total : 0,
        percentage_of_defeats: total ? defeats / total : 0,
        percentage_of_draws: total ? draws / total : 0,
        number_of_games_played: total,
        number_of_games_for_white,
        number_of_games_for_black,
        percentage_of_games_for_white: total
            ? number_of_games_for_white / total
            : 0,
        percentage_of_games_for_black: total
            ? number_of_games_for_black / total
            : 0,
        player_colors,
    };
}
//lichess

export function obrab_id_lichess(games: LichessGame[]): string[] {
    return games.map((game) => game.id);
}

export function obrab_date_lichess(games: LichessGame[]): string[] {
    return games.map((game) => new Date(game.lastMoveAt).toLocaleString());
}

export function obrab_ratingDiff_lichess(nick: string, games: LichessGame[]): number[] {
    return games.map((game) => {
        const color = game.players.white.user.name === nick ? "white" : "black";
        return game.players[color].ratingDiff;
    });
}

export function calcStat_lichess(nick: string, games: LichessGame[]): GameStat {
    let wins = 0;
    let defeats = 0;
    let draws = 0;
    const player_colors: Array<"white" | "black"> = [];
    const total = games.length;

    games.forEach((game) => {
        const color: "white" | "black" =
            game.players.white.user.name === nick ? "white" : "black";
        player_colors.push(color);

        if (game.winner === undefined || game.winner === null) {
            draws++;
        } else if (game.winner === color) {
            wins++;
        } else {
            defeats++;
        }
    });

    const number_of_games_for_white = player_colors.filter(
        (c) => c === "white"
    ).length;
    const number_of_games_for_black = total - number_of_games_for_white;

    return {
        wins,
        defeats,
        draws,
        winning_percentage: total ? wins / total : 0,
        percentage_of_defeats: total ? defeats / total : 0,
        percentage_of_draws: total ? draws / total : 0,
        number_of_games_played: total,
        number_of_games_for_white,
        number_of_games_for_black,
        percentage_of_games_for_white: total
            ? number_of_games_for_white / total
            : 0,
        percentage_of_games_for_black: total
            ? number_of_games_for_black / total
            : 0,
        player_colors,
    };
}