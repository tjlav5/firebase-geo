# firestore-geo

Query Firebase Firestore for documents in a collection that are within a certain distance.

## Usage

### Easy usage w/ observables

```typescript
import firebase from "firebase";
import { collectionData } from "rxfire/firestore";
import { ReplaySubject, from, merge } from "rxjs";
import { combineLatest, mergeMap, scan, switchMap } from "rxjs/operators";

const location$ = new ReplaySubject<firebase.firestore.GeoPoint>();
const radius$ = new ReplaySubject<number>();
const precision$ = new ReplaySubject<number>();

const restaurantsCollectionRef = firebase.firestore().collection("places");
const getGeohashRanges = firebase.functions().callable("getGeohashRanges");

combineLatest(location$, radius$, precision$)
  .pipe(
    switchMap(([{ latitude, longitude }, radius, precision]) => {
      return from(
        getGeohashRanges({
          center: [latitude, longitude],
          radius,
          precision,
        })
      );
    }),
    mergeMap(({ data: geohashRanges }) => {
      return merge(
        geohashRanges.map(([lower, upper]) =>
          collectionData(
            restaurantsCollectionRef
              .where("__geohash__.address", ">=", lower)
              .where("__geohash__.address", "<=", upper)
          )
        )
      );
    }),
    scan((allNearbyDocs, nearbyDocs) => [...allNearbyDocs, ...nearbyDocs]),
  )
  .subscribe((allNearbyDocs) => {});
```

### Advanced usage w/ promises

```typescript
import firebase from 'firebase';
...
const getGeohashRanges = firebase.functions().callable('getGeohashRanges');
const collectionRef = firebase.firestore().collection('places');

/**
 * 1. Fetch geohash-ranges for a given location+radius
 */
const currentLocation: [number, number] = [30.123456, 67.567890];
const radius = 1000; // 1km

const data = await getGeohashRanges({
    location: currentLocation,
    radius,
});

/**
 * 2. Fetch geohash ranges for a given location+radius
 */
const partitionedDocs = Promise.all(
    data.geohashRanges.map(async ([lower, upper]) => {
        const coll = await collectionRef
          .where(data.geohashField, ">=", lower)
          .where(data.geohashField, "<=", upper)
          .get();
        return coll.docs.map((d) => d.data());
    })));

/**
 * 3. Defrag the search results
 */
const docs = partitionedDocs.flat();

/**
 * 4. Optionally filter by _true_ near-ness
 */
import {distance} from 'firebase-geo';

const center = new firebase.firestore.GeoPoint(...currentLocation);
const nearDocs = docs.filter(d => haversine(center, d[data.geoPointField]) <= radius);
```

## Shout out

This is heavily leveraging work from others:

- [@puf - Querying Firebase and Firestore](https://jsbin.com/mosiza/53)
- [@MichaelSolati - geofirestore](https://github.com/MichaelSolati/geofirestore-js)
