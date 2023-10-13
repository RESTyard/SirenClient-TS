export interface FileService {
    saveFile: (blob: string | Blob, fileName: string) => void;
}