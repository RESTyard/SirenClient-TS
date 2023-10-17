import { Observable, BehaviorSubject, of, tap, map, catchError, concatMap } from 'rxjs';
import { Result, Success, Failure } from 'fnxt/result';

import { SirenDeserializer } from './siren-deserializer';
import { ObservableLruCache } from './observable-lru-cache';
import { SirenClientObject } from './SirenModel/siren-client-object';
import { HypermediaAction, ActionType, HypermediaActionResult } from './SirenModel/hypermedia-action';
import { ApiPath } from './api-path';

import { HypermediaSettings } from './hypermedia-settings';

import { ProblemDetailsError } from './problem-details-error';
import { MediaTypes } from "./MediaTypes";
import { HttpClient, HttpResponse, HttpErrorResponse, HttpHeaders, HttpHeadersFactory } from './contracts/HttpClient';

const problemDetailsMimeType = "application/problem+json";
export class HypermediaClientService {
  private currentClientObject$: BehaviorSubject<SirenClientObject> = new BehaviorSubject<SirenClientObject>(new SirenClientObject());
  private currentClientObjectRaw$: BehaviorSubject<object | null> = new BehaviorSubject<object | null>({});
  private currentNavPaths$: BehaviorSubject<Array<string>> = new BehaviorSubject<Array<string>>(new Array<string>());
  private apiPath: ApiPath = new ApiPath();

  constructor(
    private httpClient: HttpClient,
    private httpHeadersFactory: HttpHeadersFactory,
    private schemaCache: ObservableLruCache<object>,
    private sirenDeserializer: SirenDeserializer,
    private settings: HypermediaSettings) {
  }

  getHypermediaObjectStream(): BehaviorSubject<SirenClientObject> {
    return this.currentClientObject$;
  }

  getHypermediaObjectRawStream(): BehaviorSubject<object | null> {
    return this.currentClientObjectRaw$;
  }

  getNavPathsStream(): BehaviorSubject<Array<string>> {
    return this.currentNavPaths$;
  }

  navigateToEntryPoint(): Observable<Result<SirenClientObject, ProblemDetailsError>> {
    return this.Navigate(this.apiPath.firstSegment);
  }

  NavigateToApiPath(apiPath: ApiPath): Observable<Result<SirenClientObject, ProblemDetailsError>> {
    this.apiPath = apiPath;
    return this.Navigate(this.apiPath.newestSegment);
  }

  get currentApiPath(): ApiPath {
    return this.apiPath;
  }

  Navigate(url: string): Observable<Result<SirenClientObject, ProblemDetailsError>> {
    this.apiPath.addStep(url);

    var headers = this.httpHeadersFactory.create().set('Accept', MediaTypes.Siren);
    // todo use media type of link if exists in siren, maybe check for supported types?
    var result = this.httpClient
      .get(url, {
        headers: headers,
        observe: 'response',
        // responseType:'blob' // use for generic access
      });
    result
      .subscribe({
        next: response =>
        {
          const sirenClientObject = this.MapResponse(response.body);

          this.currentClientObject$.next(sirenClientObject);
          this.currentClientObjectRaw$.next(response.body);
          this.currentNavPaths$.next(this.apiPath.fullPath);
        },
        error: (err: HttpErrorResponse) => { throw this.MapHttpErrorResponseToProblemDetails(err); }
      });
    return result.pipe(
      map((x) => Success(this.MapResponse(x.body))),
      catchError((error: HttpErrorResponse) => of(Failure(this.MapHttpErrorResponseToProblemDetails(error))))
    );
  }

  DownloadAsFile(downloadUrl: string): Observable<[content: Blob | null, filename: string | undefined]> {
    // this will break for large files
    // consider https://github.com/jimmywarting/StreamSaver.js
    return this.httpClient
      .get(downloadUrl, {
        observe: 'response',
        responseType: 'blob'
      })
      .pipe(
        map(response => {
          let fileName = response.headers.get('content-disposition')
            ?.split(';')[1]
            .split('=')[1];
          return [response.body, fileName];
      }))
  }

  createHeaders(withContentType: string | null = null): HttpHeaders {
    const headers = this.httpHeadersFactory.create();

    if (withContentType) {
      headers.set('Content-Type', withContentType);
    }
    headers.set('Accept', MediaTypes.Siren);

    return headers;
  }

  private OnActionResponse(response: HttpResponse<any>): HypermediaActionResult {
    const location = response.headers.get('Location');
    if (!response.headers || location === null) {
      console.log('No location header was in response for action.');
      return { resultLocation: null, content: response.body };
    }

    return { resultLocation: location, content: response.body };
  }

  private ExecuteRequest(action: HypermediaAction, headers: any, body: any | null) {
    return this.httpClient.request(
      action.method,
      action.href,
      {
        observe: "response",
        headers: headers,
        body: body
      });
  }

  createWaheStyleActionParameters(action: HypermediaAction, parameters: any): any {
    if (parameters === null) {
      throw new Error(`Action requires parameters but got none. ${action}`);
    }

    const result = new Array<any>();
    const internalObject: any = {};
    internalObject[action.waheActionParameterName!] = parameters;
    result.push(internalObject);

    return result;
  }

  executeAction(
    action: HypermediaAction,
    parameters?: any): Observable<Result<HypermediaActionResult, ProblemDetailsError>> {
    let requestBody = null;

    switch (action.actionType){
      case ActionType.NoParameters: {
        break;
      }
      case ActionType.FileUpload: {
        requestBody = this.BuildBodyForFileUpload(action)

        break;
      }
      case ActionType.JsonObjectParameters: {
        if (this.settings.useEmbeddingPropertyForActionParameters) {
          requestBody = this.createWaheStyleActionParameters(action, parameters);
        } else {
          requestBody = parameters;
        }
        break;
      }
    }

    const headers = this.createHeaders(action.type)

    // todo if action responds with a action resource, process body
    return this.ExecuteRequest(action, headers, requestBody)
      .pipe(
        map((response: HttpResponse<any>) => Success(this.OnActionResponse(response))),
        catchError((errorResponse: HttpErrorResponse) => of(Failure(this.MapHttpErrorResponseToProblemDetails(errorResponse))))
      );
  }

  private BuildBodyForFileUpload(action: HypermediaAction): any {
    if (action.files.length < 1) {
      throw new Error(`Can not execute file upload. No file specified`)
    }

    switch (action.type) {

      case MediaTypes.FormData:
        let formData = new FormData();
        action.files.forEach((file) => { formData.append('files', file); });
        return formData;
      case MediaTypes.OctetStream:
        if (action.files.length > 1) {
          throw new Error(`Can not execute file upload as ${MediaTypes.OctetStream} wit multiple files.`)
        }
        return action.files[0];
      default:
        throw new Error(`Can not execute file upload for encoding type: ${action.type}`)
    }
  }

  private MapHttpErrorResponseToProblemDetails(errorResponse: HttpErrorResponse): ProblemDetailsError {
    if (errorResponse.error && errorResponse.error.error instanceof SyntaxError) {
      // we did not receive a json
      console.error('Content error:', errorResponse.error.message);
      return new ProblemDetailsError({
        type: "Client.ContentError",
        title: "Content error",
        detail: "Server did not respond with expected content (json)",
        status: 406,
      });
    }

    if (errorResponse.error instanceof Error) {
      // A client-side or network error occurred. Handle it accordingly.
      console.error('Client-side error occurred:', errorResponse.error.message);
      return new ProblemDetailsError({
        type: "Client.RequestError",
        title: "Client error on request",
        detail: "Could not execute request.",
        status: 0,
      });
    }

    // https://stackoverflow.com/questions/54922985/getting-status-code-0-angular-httpclient
    // status code 0 clientside or network error
    if (errorResponse.status === 0) {
      let message = errorResponse.error.message ? ": " + errorResponse.error.message : "";
      console.error(`Client-side error occurred ${message}`, errorResponse.error);
      return new ProblemDetailsError({
        type: "Client.RequestError",
        title: "Client error on request",
        detail: 'Could not execute request. Check if the API is reachable and CORS settings.',
        status: 0,
      });
    }

    // try parse problem details
    if (errorResponse.headers) {
      const contentType = errorResponse.headers.get('Content-Type')
      if (contentType?.includes(problemDetailsMimeType)) {
        console.error("API Error:" + JSON.stringify(errorResponse.error, null, 4));
        return Object.assign(new ProblemDetailsError({ rawObject: errorResponse.error }), errorResponse.error);
      }
    }

    // generic error
    let rawBody = null;
    if (errorResponse.error) {
      rawBody = JSON.stringify(errorResponse.error, null, 4);
      console.error(`API Error ${errorResponse.status}: ${rawBody}`);
    }
    else {
      console.error(`API Error ${errorResponse.status}:`, errorResponse);
    }

    return new ProblemDetailsError({
      type: "ApiError",
      title: "API error",
      detail: "API returned a generic error.",
      status: errorResponse.status,
      rawObject: rawBody
    });
  }

  private MapResponse(response: any): SirenClientObject {
    const hco = this.sirenDeserializer.deserialize(response);
    return hco;
  }
}