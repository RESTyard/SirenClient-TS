import {HttpHeaders} from "./http-headers";

export interface HttpHeadersFactory {
    create(): HttpHeaders;
}