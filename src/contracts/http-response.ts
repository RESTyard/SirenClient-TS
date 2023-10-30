import {HttpHeaders} from "./http-headers";

export interface HttpResponse<T> {
    body: T | null;
    headers: HttpHeaders;
}