import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { AsyncValidatorFn, AbstractControl } from "@angular/forms";
import { Observable, timer } from "rxjs";
import { switchMap, map } from "rxjs/operators";

@Injectable()
export class CheckDuplicateService {
  constructor(private http: HttpClient) {}

  public checkUsername(username: string) {
    return timer(1000).pipe(
      switchMap(() => {
        // Check if username is available
        return this.http.get<any>("/api/checkusername?username=" + username);
      })
    );
  }

  usernameValidator(): AsyncValidatorFn {
    return (
      control: AbstractControl
    ): Observable<{ [key: string]: any } | null> => {
      return this.checkUsername(control.value).pipe(
        map((res) => {
          // if username is already taken
          if (res.usernameExists) {
            // return error
            return { usernameExists: true };
          }
          return null;
        })
      );
    };
  }
}
