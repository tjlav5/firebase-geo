# firestore-geo

Query Firebase Firestore for documents in a collection that are within a certain distance.

## Usage

### Easy usage w/ observables

```typescript
import firebase from "firebase";
import { createFindNearByDocumentsOperator } from "fire-geo";
import { ReplaySubject } from "rxjs";
import { combineLatest } from "rxjs/operators";

const location$ = new ReplaySubject<firebase.firestore.GeoPoint>();
const radius$ = new ReplaySubject<number>();

const getGeohashRanges = firebase.functions().callable("getGeohashRanges");
const findNearByDocuments = createFindNearByDocumentsOperator(getGeohashRanges);

combineLatest(location$, radius$)
  .pipe(
    findNearByDocuments({
      collectionRef: firebase.firestore().collection("restaurants"),
      field: "location",
      // Limit to pizzerias
      queryFn: (query) => query.where("cuisine", "==", "pizza"),
    })
  )
  .subscribe((nearByDocs) => {});
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

### Advanced usage w/ observables

```typescript
import firebase from "firebase";
import { collectionData } from "rxfire/firestore";
import { ReplaySubject, combineLatest, from, merge } from "rxjs";
import { map, mergeMap, scan, switchMap } from "rxjs/operators";

const getGeohashRanges = firebase.functions().callable("getGeohashRanges");
const collectionRef = firebase.firestore().collection("places");

const location$ = new ReplaySubject<firebase.firestore.GeoPoint>();
const radius$ = new ReplaySubject<number>();

combineLatest(location$, radius$)
  .pipe(
    switchMap(([{ latitude, longitude }, radius]) => {
      // Fetch geohash-ranges for the given location
      return from(
        getGeohashRanges({
          location: [latitude, longitude],
          radius,
        })
      ).pipe(
        mergeMap(({ data: { geohashRanges, geoPointField, geohashField } }) => {
          return merge(
            geohashRanges.map(([lower, upper]) =>
              // Fetch all documents residing in neighbor geohash-cells
              collectionData(
                collectionRef
                  .where(geohashField, ">=", lower)
                  .where(geohashField, "<=", upper)
              )
            )
          ).pipe(
            // Filter docs that are truly within the search-radius
            map((docs) =>
              docs.filter((doc) => {
                const { latitude: docLat, longitude: docLong } = doc[
                  geoPointField
                ];
                return (
                  haversine([latitude, longitude], [docLat, docLong]) <= radius
                );
              })
            ),
            scan((allFoundDocs, foundDocs) => [...allFoundDocs, ...foundDocs])
          );
        })
      );
    })
  )
  .subscribe((nearDocs) => {});
```

## Shout out

This is heavily leveraging work from others:

- [@puf - Querying Firebase and Firestore](https://jsbin.com/mosiza/53)
- [@MichaelSolati - geofirestore](https://github.com/MichaelSolati/geofirestore-js)
