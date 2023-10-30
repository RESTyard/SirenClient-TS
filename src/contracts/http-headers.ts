export interface HttpHeaders {
    get(name: string): string | null;

    set(name: string, value: string | string[]): HttpHeaders;
}