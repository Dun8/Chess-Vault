import { requestUrl } from "obsidian";

export interface LichessGame {
    id: string;
    players: {
        white: { user: { name: string }; rating: number; ratingDiff: number };
        black: { user: { name: string }; rating: number; ratingDiff: number };
    };
    createdAt: number;
    winner?: string;
}