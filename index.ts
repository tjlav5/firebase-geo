import firebase, { firestore } from "firebase";
import { collectionData } from "rxfire/firestore";
import { from, merge, pipe } from "rxjs";
import { map, mergeMap, scan, switchMap } from "rxjs/operators";

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversine(
  start: firebase.firestore.GeoPoint,
  end: firebase.firestore.GeoPoint
): number {
  const radius = 6371000; // Earth's radius in meters
  const dLat = toRad(end.latitude - start.latitude);
  const dLon = toRad(end.longitude - start.longitude);
  const lat1 = toRad(start.latitude);
  const lat2 = toRad(end.latitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radius * c;
}

interface GetGeohashRangesRequest {
  location: [number, number];
  radius: number;
}

interface GetGeohashRangesResponseData {
  geohashRanges: [string, string][];
  geohashField: string;
  geoPointField: string;
}

interface GetGeohashRangesResponse {
  data: GetGeohashRangesResponseData;
}

type GetGeohashRangesFn = (
  payload: GetGeohashRangesRequest
) => Promise<GetGeohashRangesResponse>;

interface FindCloseDocuments {
  collectionRef: firestore.CollectionReference;
  getGeoHashRangesFn: GetGeohashRangesFn;
  queryFn: (query: firebase.firestore.Query) => firebase.firestore.Query;
}

export function findCloseDocuments(foo: FindCloseDocuments) {
  return pipe(
    switchMap(([location, radius]: [firebase.firestore.GeoPoint, number]) => {
      // Fetch geohash-ranges for the given location
      return from(
        foo.getGeoHashRangesFn({
          location: [location.latitude, location.longitude],
          radius,
        })
      ).pipe(
        mergeMap(({ data: { geohashRanges, geoPointField, geohashField } }) => {
          return merge(
            geohashRanges.map(([lower, upper]) =>
              // Fetch all documents residing in neighbor geohash-cells
              collectionData(
                foo
                  .queryFn(foo.collectionRef)
                  .where(geohashField, ">=", lower)
                  .where(geohashField, "<=", upper)
              )
            )
          ).pipe(
            // Filter docs that are truly within the search-radius
            map((docs) =>
              docs.filter(
                (doc) => haversine(location, doc[geoPointField]) <= radius
              )
            ),
            scan((allFoundDocs, foundDocs) => [...allFoundDocs, ...foundDocs])
          );
        })
      );
    })
  );
}
