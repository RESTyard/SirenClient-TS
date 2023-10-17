import { Observable, OperatorFunction, concatMap, of } from "rxjs";
import { Result, Failure, isSuccess } from 'fnxt/result'
import { ProblemDetailsError } from "./problem-details-error";

export function navigate<T, R>(project: (value: T, index: number) => Observable<Result<R, ProblemDetailsError>>): OperatorFunction<Result<T, ProblemDetailsError>, Result<R, ProblemDetailsError>> {
    return concatMap((result: Result<T, ProblemDetailsError>, index: number): Observable<Result<R, ProblemDetailsError>> => {
        if (isSuccess(result)) {
            return project(result.value, index);
        } else {
            return of(Failure(result.value))
        }
    })
}