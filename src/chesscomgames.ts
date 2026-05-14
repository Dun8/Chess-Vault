import { requestUrl } from "obsidian";

export interface ChesscomGame {
    uuid: string;
    end_time: number;
    white: { username: string; result: string };
    black: { username: string; result: string };
}

interface ArchivesResponse {
    archives: string[];
}

interface GamesResponse {
    games: ChesscomGame[];
}

function archiveUrlToDate(url: string): Date {
    const parts = url.split("/");
    const month = parseInt(parts.at(-1)!);
    const year  = parseInt(parts.at(-2)!);
    return new Date(year, month - 1, 1);
}

export default async function import_games_chesscom(
    nick: string,
    since_t: number,
    until_t: number
): Promise<ChesscomGame[]> {
    const sinceDate = new Date(since_t);
    const untilDate = new Date(until_t);

    const archivesRes = await requestUrl({
        url: `https://api.chess.com/pub/player/${nick}/games/archives`,
    });
    const { archives }: ArchivesResponse = archivesRes.json;

    const relevantUrls = archives.filter((url) => {
        const d = archiveUrlToDate(url);
        const archiveStart = d;
        const archiveEnd   = new Date(d.getFullYear(), d.getMonth() + 1, 0); // последний день месяца
        return archiveEnd >= sinceDate && archiveStart <= untilDate;
    });

    const months = await Promise.all(
        relevantUrls.map((url) =>
            requestUrl({ url }).then((r) => r.json as GamesResponse)
        )
    );

    const result = months
        .flatMap((data) => data.games)
        .filter(({ end_time }) => {
            const t = end_time * 1000;
            return t >= since_t && t <= until_t;
        });

    console.log(result);
    return result;
}

// export interface ChesscomGame {
//     uuid: string;
//     end_time: number;
//     white: { username: string; result: string };
//     black: { username: string; result: string };
// }
//
// interface ArchivesResponse {
//     archives: string[];
// }
//
// interface GamesResponse {
//     games: ChesscomGame[];
// }
//
// function archiveUrlToDate(url: string): Date {
//     const parts = url.split("/");
//     const month = parseInt(parts.at(-1)!);
//     const year  = parseInt(parts.at(-2)!);
//     return new Date(year, month - 1, 1);
// }
//
// async function fetchJson<T>(url: string): Promise<T> {
//     const res = await fetch(url);
//     if (!res.ok) throw new Error(HTTP ${res.status}: ${url});
//     return res.json() as Promise<T>;
// }
//
// export async function getGamesBetween(
//     nick: string,
//     since_t: number,
//     until_t: number
// ): Promise<ChesscomGame[]> {
//     const sinceDate = new Date(since_t);
//     const untilDate = new Date(until_t);
//
//     const { archives } = await fetchJson<ArchivesResponse>(
//         https://api.chess.com/pub/player/${nick}/games/archives
//     );
//
//     const relevantUrls = archives.filter((url) => {
//         const d = archiveUrlToDate(url);
//         const archiveEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
//         return archiveEnd >= sinceDate && d <= untilDate;
//     });
//
//     const months = await Promise.all(
//         relevantUrls.map((url) => fetchJson<GamesResponse>(url))
//     );
//
//     const result = months
//         .flatMap((data) => data.games)
//         .filter(({ end_time }) => {
//             const t = end_time * 1000;
//             return t >= since_t && t <= until_t;
//         });
//
//     console.log(result);
//     return result;
// }
//
// await getGamesBetween("hikaru", new Date("2024-01-01").getTime(), new Date("2024-02-01").getTime());