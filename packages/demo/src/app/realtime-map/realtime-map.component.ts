import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  NgZone,
  ContentChild,
  ViewChild,
} from '@angular/core';
import {
  BehaviorSubject,
  combineLatest,
  ReplaySubject,
  SchedulerLike,
  asyncScheduler,
  SchedulerAction,
  Subscription,
  merge,
} from 'rxjs';
import {
  switchMap,
  map,
  tap,
  startWith,
  observeOn,
  mergeMap,
  scan,
  mergeAll,
  debounceTime,
  take,
  concatMap,
} from 'rxjs/operators';
import { AngularFireFunctions } from '@angular/fire/functions';
import { AngularFirestore } from '@angular/fire/firestore';
import { GoogleMap } from '@angular/google-maps';

interface GetGeohashRangeRequest {
  location: [number, number];
  radius: number;
  precision: number;
}

interface GetGeohashRangeResponse {
  ranges: [string, string][];
}

interface Restaurant {
  location: {
    latitude: string;
    longitude: string;
  };
}

class ZoneScheduler implements SchedulerLike {
  constructor(private zone: any) {}
  now(): number {
    return asyncScheduler.now();
  }
  schedule<T>(
    work: (this: SchedulerAction<T>, state?: T) => void,
    delay?: number,
    state?: T
  ): Subscription {
    const targetZone = this.zone;
    const workInZone = function (this: SchedulerAction<any>, state?: any) {
      targetZone.runGuarded(() => {
        work.apply(this, [state]);
      });
    };
    return asyncScheduler.schedule(workInZone, delay, state);
  }
}

@Component({
  selector: 'app-realtime-map',
  templateUrl: './realtime-map.component.html',
  styleUrls: ['./realtime-map.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RealtimeMapComponent {
  private readonly location$ = new BehaviorSubject<[number, number]>([
    40.673754,
    -73.970097,
  ]);
  private readonly radius$ = new BehaviorSubject<number>(1_000);
  private readonly precision$ = new BehaviorSubject(7);

  private readonly inAngularScheduler = new ZoneScheduler(this.ngZone);

  readonly zoom = 14;

  @ViewChild(GoogleMap)
  private googleMap: GoogleMap;

  foo = [1, 2, 3];

  private readonly callable = this.fns.httpsCallable<
    GetGeohashRangeRequest,
    GetGeohashRangeResponse
  >('getGeohashRange');

  private readonly ranges$ = combineLatest([
    this.location$,
    this.radius$,
    this.precision$,
  ]).pipe(
    debounceTime(100),
    // tap((f) => console.log(f)),
    mergeMap(([location, radius, precision]) => {
      return this.callable({
        location,
        radius,
        precision,
      }).pipe(
        // https://github.com/angular/angularfire/issues/2384#issuecomment-655637597
        observeOn(this.inAngularScheduler),
        map(({ ranges }) => ranges),
        mergeMap((ranges) =>
          merge(
            ranges.map(([lower, upper]) =>
              this.afs
                .collection<Restaurant>('restaurants', (ref) =>
                  ref
                    .where('_geo_.location', '>=', lower)
                    .where('_geo_.location', '<=', upper)
                )
                .valueChanges()
            )
          )
        ),
        mergeAll(),
        scan(
          (allNearbyDocs, nearbyDocs) => [...allNearbyDocs, ...nearbyDocs],
          [] as Restaurant[]
        )
      );
    })
  );

  // private readonly documents$ = this.ranges$.pipe(
  //
  //   // tap((e) => console.log(e))
  // );

  readonly nearby$ = this.ranges$.pipe(
    map((documents) =>
      documents.map((d) => ({
        position: { lat: d.location.latitude, lng: d.location.longitude },
      }))
    ),
    tap((e) => console.log(e))
  );

  readonly searchRadius$ = combineLatest([this.location$, this.radius$]).pipe(
    map(([location, radius]) => ({
      center: { lat: location[0], lng: location[1] },
      radius,
    }))
    // tap((e) => console.log(e))
  );

  readonly startCenter$ = this.searchRadius$.pipe(
    take(1),
    map((l) => l.center)
  );

  constructor(
    private readonly fns: AngularFireFunctions,
    private readonly afs: AngularFirestore,
    private readonly ngZone: NgZone
  ) {}

  centerChanged(event) {
    if (!this.googleMap) {
      return;
    }
    // console.log(event);
    // console.log(this.googleMap?.getCenter());
    const { lat, lng } = this.googleMap.getCenter();
    this.location$.next([lat(), lng()]);
  }
}
