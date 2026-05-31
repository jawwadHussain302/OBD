import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class DiagnosisWidgetStateService {
  private readonly minimizedSubject = new BehaviorSubject<boolean>(false);

  readonly minimized$ = this.minimizedSubject.asObservable();

  setMinimized(minimized: boolean): void {
    this.minimizedSubject.next(minimized);
  }
}
