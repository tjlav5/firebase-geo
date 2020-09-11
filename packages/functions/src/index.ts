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
import firebase from "firebase";
import ngeohash from "ngeohash";

import config from "./config";
import { getHashRangesForLocation, GetHashRangesRequest } from "./geohash";

// process.env.X_GOOGLE_NEW_FUNCTION_SIGNATURE = "true";

console.log(config);

export const getGeohashRange = functions.handler.https.onCall(
  (payload: GetHashRangesRequest) => getHashRangesForLocation(payload)
);

const GEOHASH_KEY = "_geo_";
type GeohashCache = { [field: string]: string };

/*
 * The `onCustomerDataDeleted` deletes their customer object in Stripe which immediately cancels all their subscriptions.
 */
export const onGeoPointWrite = functions.firestore
  .document(config.firestorePath)
  .onWrite(async (change, context) => {
    // stop worker if document got deleted
    if (!change.after.exists) return;

    const data = change.after.data() as firebase.firestore.DocumentData;

    const previousGeohashCache: GeohashCache = data[GEOHASH_KEY] || {};
    const updatedGohashCache: GeohashCache = {};

    for (const [key, value] of Object.entries(data)) {
      if (
        typeof value.latitude === "number" &&
        typeof value.longitude === "number"
      ) {
        updatedGohashCache[key] = ngeohash.encode(
          value.latitude,
          value.longitude,
          12
        );
      }
    }

    console.log(previousGeohashCache, updatedGohashCache);

    return change.after.ref.set(
      {
        _geo_: updatedGohashCache,
      },
      { merge: true }
    );
  });
