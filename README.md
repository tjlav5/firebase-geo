# firestore-geo

Query Firebase Firestore for documents in a collection that are within a certain distance.

## Usage

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

const {data: geohashRanges}: [string, string][] = getGeohashRanges({
    location: currentLocation,
    radius,
});

/**
 * 2. Fetch geohash ranges for a given location+radius
 */
const partitionedDocs = Promise.all(
    geohashRanges.map(async ([lower, upper]) => {
        const coll = await collectionRef
          .where("geohash", ">=", lower)
          .where("geohash", "<=", upper)
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
const nearDocs = docs.filter(d => distance(center, d['geoPointField']) <= radius);
```

### Advanced usage w/ observables

```typescript
import firebase from 'firebase';
import {distance} from 'firebase-geo';
import {merge, Observable} from 'rxjs';
import {concatMap, map, switchMap} from 'rxjs/operators';
...
const getGeohashRanges = firebase.functions().callable('getGeohashRanges');
const collectionRef = firebase.firestore().collection('places');

const currentLocation = new ReplaySubject<[firebase.firestore.GeoPoint, number]>();

currentLocation.pipe(
    switchMap(([center, radius]) => {
        // Fetch geohash-ranges for the given location
        const {data: geohashRanges}: [string, string][] = getGeohashRanges({
            location: [center.latitude, center.longitude],
            radius,
        });
        return {
            center,
            radius,
            geohashRanges,
        }
    }),
    concatMap(({center, radius, geohasRanges}) =>
        merge(
            geohashRanges.map(([lower, upper]) =>
                // Fetch all documents residing in neighbor geohash-cells
                obsFromCollectionRef(collectionRef
                    .where("geohash", ">=", lower)
                    .where("geohash", "<=", upper)
                ).pipe(map(docs => docs.map(d => d.data())))
            )
        ).pipe(
            map(partitionedDocs => partitionedDocs.flat()),
            // Optionally filter out all docs with euclidean distance
            map(allDocs => allDocs.filter(d =>
                distance(center, d["geoPointField"]) <= radius
            )),
        )
    )
).subscribe(nearDocs => {});

/**
 * Helper method to convert a Collection's snapshot-updates to an Observable
 */
function obsFromCollectionRef(ref: firebase.firestore.CollectionReference) {
    return new Observable(subscriber => {
        unsubscribe = ref.onSnapshot(subscriber);

        return () => {
            unsubscribe();
        };
    });
}
```

## Shout out

This is heavily leveraging work from others:

- [@puf - Querying Firebase and Firestore](https://jsbin.com/mosiza/53)
- [@MichaelSolati - geofirestore](https://github.com/MichaelSolati/geofirestore-js)
