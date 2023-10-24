import {HttpHeaders} from "./http-headers";

export interface HttpErrorResponse extends Error {
    status: number;
    error: any | null;
    headers: HttpHeaders;
}