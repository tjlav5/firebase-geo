import firebase from "firebase";

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function distance(
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
