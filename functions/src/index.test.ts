import * as firebase from "@firebase/testing";

function flatten(items: any[]) {
  const flat: any[] = [];

  items.forEach((item) => {
    if (Array.isArray(item)) {
      flat.push(...flatten(item));
    } else {
      flat.push(item);
    }
  });

  return flat;
}

function setup() {
  // const projectId = "geo";
  // const projectId = `geo-test-${Date.now()}`;
  const projectId = "geo-test";

  const app = firebase.initializeTestApp({
    projectId,
  });

  const functions = app.functions();
  functions.useFunctionsEmulator("http://localhost:5001");

  const firestore = app.firestore();
  firestore.settings({
    host: "0.0.0.0:8080",
    ssl: false,
  });

  const getGeohashRange = functions.httpsCallable("getGeohashRange");

  async function cleanup() {
    await firebase.clearFirestoreData({
      projectId,
    });
    return app.delete();
  }

  return { firestore, getGeohashRange, cleanup };
}

interface TestLocation {
  id: string;
  location: [number, number];
}

async function runIntegrationTest({
  currentLocation: {
    location: [latitude, longitude],
  },
  otherLocations,
  radius,
}: {
  currentLocation: TestLocation;
  otherLocations: TestLocation[];
  radius: number;
}) {
  jest.setTimeout(15000);

  const { firestore, getGeohashRange, cleanup } = setup();

  const collectionRef = firestore.collection("person");

  await Promise.all(
    otherLocations.map((l) =>
      collectionRef.doc(l.id).set({
        id: l.id,
        point: new firebase.firestore.GeoPoint(...l.location),
        // In --watch mode, tickle a doc-update
        _random_: Math.random(),
      })
    )
  );

  // Give a little bit of time for the Extension hook
  await new Promise((r) => setTimeout(r, 4000));

  let data = [];
  try {
    const response = await getGeohashRange({
      latitude,
      longitude,
      radius, // meters
    });
    data = response.data;
  } catch (e) {
    console.log(e);
  }

  console.log({ data });

  const partitionedDocs = await Promise.all(
    data.map(async ([lower, upper]: [number, number]) => {
      const coll = await collectionRef
        // .orderBy("geohash")
        // .startAt(lower)
        // .endAt(upper)
        // .get();
        .where("geohash", ">=", lower)
        .where("geohash", "<=", upper)
        .get();
      return coll.docs.map((d) => d.data());
    })
  );

  return {
    ids: flatten(partitionedDocs).map((d) => d.id),
    cleanup,
  };
}

const BANDSHELL: TestLocation = {
  id: "bandshell",
  location: [40.663438, -73.976687],
};

const NEATHERMEAD: TestLocation = {
  id: "neathermead",
  location: [40.660744, -73.968791],
};

const GRAND_ARMY_PLAZA: TestLocation = {
  id: "grand_army_plaza",
  location: [40.673884, -73.970135],
};

const ZOO: TestLocation = {
  id: "zoo",
  location: [40.665688, -73.964438],
};

const EMPIRE_STATE_BUILDING: TestLocation = {
  id: "empire_state_building",
  location: [40.748438, -73.985687],
};

const STATUE_OF_LIBERTY: TestLocation = {
  id: "statue_of_libery",
  location: [40.689188, -74.044062],
};

const WASHINGTON_SQUARE_PARK: TestLocation = {
  id: "washington_square_park",
  location: [40.730812, -73.997313],
};

test("no locations found", async () => {
  const { ids, cleanup } = await runIntegrationTest({
    currentLocation: BANDSHELL,
    otherLocations: [NEATHERMEAD /* 750m */],
    radius: 200,
  });

  expect(ids).toEqual([]);

  cleanup();
});

test("extra distance to cover all geohashes", async () => {
  const { ids, cleanup } = await runIntegrationTest({
    currentLocation: BANDSHELL,
    otherLocations: [
      NEATHERMEAD /* 750m */,
      ZOO /* 1km */,
      GRAND_ARMY_PLAZA /* 1.3km */,
    ],
    radius: 750,
  });

  expect(ids).toEqual([NEATHERMEAD.id, ZOO.id]);

  cleanup();
});

test("city-scale", async () => {
  const { ids, cleanup } = await runIntegrationTest({
    currentLocation: EMPIRE_STATE_BUILDING,
    otherLocations: [
      WASHINGTON_SQUARE_PARK /* 2.4km */,
      STATUE_OF_LIBERTY /* 8.2km */,
    ],
    radius: 3000,
  });

  expect(ids).toEqual([WASHINGTON_SQUARE_PARK.id]);

  cleanup();
});

describe("updating the hash when writing a document", () => {
  test("creating", () => {});
  test("updating", () => {});
  test("deleting", () => {});
});
