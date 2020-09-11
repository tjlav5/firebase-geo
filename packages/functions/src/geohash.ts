import ngeohash from "ngeohash";
import { Coord, point } from "@turf/helpers";
import distance from "@turf/distance";

type HashCache = { [hash: string]: number };
const BASE32_CODES = "0123456789bcdefghjkmnpqrstuvwxyz";

function isInRadius(from: Coord, to: Coord, radius: number) {
  return radius / 1000 >= distance(from, to);
}

function getHashesNear(
  coord: { latitude: number; longitude: number },
  precision: number,
  radius: number
) {
  const { latitude, longitude } = coord;
  const origin = point([longitude, latitude]);
  const encodedOrigin = ngeohash.encode(latitude, longitude, precision);

  const checked = new Set<string>();
  const toCheck = new Set<string>();
  const valid = new Set<string>([encodedOrigin]);

  for (const hash of ngeohash.neighbors(encodedOrigin)) {
    toCheck.add(hash);
  }

  while (toCheck.size > 0) {
    const [hash] = Array.from(toCheck);
    const {
      latitude: destLatitude,
      longitude: destLongitude,
    } = ngeohash.decode(hash);
    const destination = point([destLongitude, destLatitude]);
    if (isInRadius(origin, destination, radius)) {
      valid.add(hash);

      for (const h of ngeohash.neighbors(hash)) {
        if (!checked.has(h)) {
          toCheck.add(h);
        }
      }
    }
    toCheck.delete(hash);
    checked.add(hash);
  }
  return [...valid];
}

export function countHashes(
  hashes: string[],
  precision: number
): [[string, number][], string[]] {
  const cache: HashCache = {};
  const leafHashes: string[] = [];
  for (const hash of hashes) {
    for (let i = 1; i <= hash.length; i++) {
      const prefix = hash.substring(0, i);
      if (prefix.length === precision) {
        leafHashes.push(prefix);
        continue;
      }
      cache[prefix] = (cache[prefix] || 0) + 1;
    }
  }
  return [Object.entries(cache), leafHashes];
}

export function findSuperHashes(
  hashCounts: [string, number][],
  precision: number
) {
  const superHashes = new Set<string>();
  for (const [prefix, count] of hashCounts) {
    const allCount = Math.pow(BASE32_CODES.length, precision - prefix.length);
    if (count !== 1 && count === allCount) {
      superHashes.add(prefix);
    }
  }
  return superHashes;
}

export function filterHashes(
  hashCounts: [string, number][],
  superHashes: Set<string>,
  precision: number
) {
  console.time("filter:filter");

  const re = new RegExp([...superHashes].map((s) => `${s}\\w+`).join("|"));

  const filter = hashCounts.filter(([prefix, count]) => {
    const allCount = Math.pow(BASE32_CODES.length, precision - prefix.length);

    if (count !== allCount) {
      return false;
    }

    if (!superHashes.has(prefix) && re.test(prefix)) {
      return false;
    }

    return true;
  });
  console.timeEnd("filter:filter");

  return filter.map(([key]) => key);
}

function firstChar(word: string): string {
  return word[0];
}

function lastChar(word: string): string {
  return word[word.length - 1];
}

function removeMatchingStem(wordA: string, wordB: string): [string, string] {
  let index = 0;
  for (; index < wordA.length; index++) {
    if (wordA.substring(0, index) !== wordB.substring(0, index)) {
      break;
    }
  }
  return [wordA.substring(index - 1), wordB.substring(index - 1)];
}

function idx(char: string): number {
  return BASE32_CODES.indexOf(char);
}

function nextIdx(char: string): number {
  const index = idx(char);
  return index === BASE32_CODES.length - 1 ? 0 : index + 1;
}

function nextCode(char: string): [string, boolean] {
  const nextIndex = nextIdx(char);
  const bumped = nextIndex === 0;
  return [BASE32_CODES[nextIndex], bumped];
}

function follows(firstHash: string, secondHash: string) {
  const [firstLeaf, secondLeaf] = removeMatchingStem(firstHash, secondHash);

  for (let i = 0; i < Math.max(firstLeaf.length, secondLeaf.length); i++) {
    const diff = idx(secondLeaf[i]) - idx(firstLeaf[i]);
    if (diff === 1 || diff === BASE32_CODES.length) {
      continue;
    }

    if (firstLeaf[i] === lastChar(BASE32_CODES) && !secondLeaf[i]) {
      continue;
    }

    if (secondLeaf[i] === firstChar(BASE32_CODES) && !firstLeaf[i]) {
      continue;
    }

    return false;
  }

  return true;
}

function getHashRanges(hashes: string[]): [string, string][] {
  const ranges: [string, string][] = [];

  for (let i = 0; i < hashes.length; i++) {
    let startHash = hashes[i];
    let endHash = startHash;

    for (let j = i + 1; j < hashes.length; j++) {
      const nextHash = hashes[j];

      if (follows(endHash, nextHash)) {
        endHash = nextHash;
        i = j + 1;
        continue;
      }

      i = j - 1;
      break;
    }

    ranges.push([startHash, bumpRange(endHash)]);
  }

  return ranges;
}

/**
 * 7zy -> 7zz
 * 7zz -> 800
 *
 * @param hash
 */
function bumpRange(hash: string): string {
  const reversedHash = hash.split("").reverse();
  const reverseBumpedHash: string[] = [];

  let bump = true;
  for (const char of reversedHash) {
    if (bump) {
      let [code, bumped] = nextCode(char);
      reverseBumpedHash.push(code);
      bump = bumped;
    } else {
      reverseBumpedHash.push(char);
      bump = false;
    }
  }

  const bumpedHash = reverseBumpedHash.reverse().join("");
  // console.log({ hash, bumpedHash });
  return bumpedHash;
}

export interface GetHashRangesRequest {
  location: [number, number];
  radius: number;
  precision: number;
}

export interface GetHashRangesResponse {
  ranges: [string, string][];
}

/**
 * Example request against local-emulator, near Grand Army Plaza, BK, NY
 *
   curl --request POST \
   --url http://localhost:5001/geo-test/us-central1/getGeohashRange \
   --header 'content-type: application/json' \
   --data '{"data": {"location": [40.673754, -73.970097], "precision": 7, "radius": 1000}}'
 */

export function getHashRangesForLocation(
  request: GetHashRangesRequest
): GetHashRangesResponse {
  // request validation...
  // default precision?
  // https://en.wikipedia.org/wiki/Geohash#Digits_and_precision_in_km

  console.time("total");

  console.time("getHashesNear");
  const allHashes = getHashesNear(
    {
      latitude: request.location[0],
      longitude: request.location[1],
    },
    request.precision,
    request.radius
  );
  console.timeEnd("getHashesNear");

  // console.time("hashCounts");
  // const [hashCounts, leafHashes] = countHashes(allHashes, request.precision);
  // console.timeEnd("hashCounts");

  // console.time("superHashes");
  // const superHashes = findSuperHashes(hashCounts, request.precision);
  // console.timeEnd("superHashes");

  // console.time("filteredHashes");
  // const filteredHashes = filterHashes(
  //   hashCounts,
  //   superHashes,
  //   request.precision
  // );
  // console.timeEnd("filteredHashes");

  // const allFilterdHashes = [...filteredHashes, ...leafHashes].sort((a, b) =>
  //   a.localeCompare(b)
  // );

  const foo = allHashes.sort((a, b) => a.localeCompare(b));

  console.time("hashRanges");
  // const hashRanges = getHashRanges(allFilterdHashes);
  const hashRanges = getHashRanges(foo);

  // upper-range needs to be +1'd...
  // when we are searching for '7zzz',
  // our range should be: >= 7zz && < 800

  console.timeEnd("hashRanges");

  console.timeEnd("total");

  return {
    ranges: hashRanges,
  };
}
