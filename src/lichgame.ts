export interface LichessGame {
    id: string;
    players: {
        white: { user: { name: string }; rating: number; ratingDiff: number };
        black: { user: { name: string }; rating: number; ratingDiff: number };
    };
    createdAt: number;
    winner?: string;
}

export default async function import_games(nick: string, since_t: number, until_t: number): Promise<LichessGame[]> {
    const res = await fetch(
        `https://lichess.org/api/games/user/${nick}?since=${since_t}&until=${until_t}`,
        {
            headers: {
                Accept: "application/x-ndjson",
            },
        }
    );

    const text: string = await res.text();

    if (!text.trim()) return [];

    const games: LichessGame[] = text.trim().split("\n").map((line) => JSON.parse(line));
    return games;
}


