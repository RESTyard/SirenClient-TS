import {Observable} from 'rxjs';
import {HttpResponse} from "./http-response";
import {HttpHeaders} from "./http-headers";

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