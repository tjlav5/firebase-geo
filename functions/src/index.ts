/*
 * This template contains a HTTP function that responds with a greeting when called
 *
 * Always use the FUNCTIONS HANDLER NAMESPACE
 * when writing Cloud Functions for extensions.
 * Learn more about the handler namespace in the docs
 *
 * Reference PARAMETERS in your functions code with:
 * `process.env.<parameter-name>`
 * Learn more about parameters in the docs
 */

import * as functions from "firebase-functions";
// import * as geohash from "ngeohash";
import { geohashQueries } from "./utils";
import * as firebase from "firebase";
import { hash } from "geokit";

process.env.X_GOOGLE_NEW_FUNCTION_SIGNATURE = "true";

exports.greetTheWorld = functions.handler.https.onRequest((req, res) => {
  // Here we reference a user-provided parameter (its value is provided by the user during installation)
  const consumerProvidedGreeting = process.env.GREETING;

  // And here we reference an auto-populated parameter (its value is provided by Firebase after installation)
  const instanceId = process.env.EXT_INSTANCE_ID;

  const greeting = `${consumerProvidedGreeting} test World from ${instanceId}`;

  res.send(greeting);
});

interface GetGeohashRangeProps {
  latitude: number;
  longitude: number;
  radius: number; // km?
}

export const getGeohashRange = functions.handler.https.onCall(
  ({ latitude, longitude, radius }: GetGeohashRangeProps) => {
    // const lat = 0.0144927536231884; // degrees latitude per mile
    // const lon = 0.0181818181818182; // degrees longitude per mile
    // const lowerLat = latitude - lat * radius;
    // const lowerLon = longitude - lon * radius;
    // const upperLat = latitude + lat * radius;
    // const upperLon = longitude + lon * radius;
    // const lower = geohash.encode(lowerLat, lowerLon);
    // const upper = geohash.encode(upperLat, upperLon);
    // return [lower, upper];

    // console.log({ latitude, longitude, radius });

    const foo = geohashQueries(
      new firebase.firestore.GeoPoint(latitude, longitude),
      radius
    );
    return foo;
  }
);

/*
 * The `onCustomerDataDeleted` deletes their customer object in Stripe which immediately cancels all their subscriptions.
 */
export const onPersonWrite = functions.firestore
  .document(`/person/{uid}`)
  .onWrite(async (change, context) => {
    // const { location } = snap.data();
    const data = change.after.data();
    const previousData = change.before.data();

    // console.log({
    //   data,
    //   previousData,
    // });

    // console.log(data, previousData);
    // We'll only update if the name has changed.
    // This is crucial to prevent infinite loops.
    if (data?.geohash && data?.geohash === previousData?.geohash) {
      return null;
    }

    // Do nothing for DELETE
    if (!data?.point) {
      return null;
    }

    // const hash = geohash.encode(data.point.latitude, data.point.longitude);
    // console.log("foo", data, data.point);
    const geohash = hash({
      lat: data.point.latitude,
      lng: data.point.longitude,
    });

    // console.log(hash);

    // console.log("updating foo");
    // await deleteStripeCustomer({ uid: context.params.uid, stripeId });
    return change.after.ref.set(
      {
        geohash,
      },
      { merge: true }
    );
  });
