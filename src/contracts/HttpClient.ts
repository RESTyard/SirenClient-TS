import { Observable } from 'rxjs';

export interface HttpClient {
    get(
        url: string,
        options?: {
            headers?: HttpHeaders;
            observe?: "body";
            responseType?: "json";
        }
    ): Observable<Object>

    get(
        url: string,
        options: {
            headers?: HttpHeaders;
            observe?: "response";
            responseType?: "json";
        }
    ): Observable<HttpResponse<Object>>;

    get(
        url: string,
        options: {
            headers?: HttpHeaders;
            observe?: "response";
            responseType: "blob";
        }
    ): Observable<HttpResponse<Blob>>;

    request(
        method: string,
        url: string,
        options: {
            body?: any;
            headers?: HttpHeaders;
            observe: "response";
            responseType?: "json";
        }
    ): Observable<HttpResponse<Object>>
}

export interface HttpResponse<T> {
    body: T | null;
    headers: HttpHeaders;
}

export interface HttpErrorResponse extends Error {
    status: number;
    error: any | null;
    headers: HttpHeaders;
}

export interface HttpHeaders {
    get(name: string) : string | null;
    set(name: string, value: string | string[]): HttpHeaders;
}

export interface HttpHeadersFactory {
    create(): HttpHeaders;
}