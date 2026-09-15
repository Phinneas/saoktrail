import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineMiles,
  sampleRoute,
  nearestRoutePoint,
  routeBoundingBox,
  parseRoutePoints,
} from './routeGeometry.ts';

test('haversineMiles: one degree of latitude is about 69 miles', () => {
  const d = haversineMiles(40, -105, 41, -105);
  assert.ok(Math.abs(d - 69) < 1, `expected ~69 miles, got ${d}`);
});

test('haversineMiles: same point is zero', () => {
  assert.equal(haversineMiles(40, -105, 40, -105), 0);
});

test('sampleRoute: leaves short routes untouched', () => {
  const points = [{ lat: 0, lon: 0 }, { lat: 1, lon: 1 }, { lat: 2, lon: 2 }];
  assert.deepEqual(sampleRoute(points, 10), points);
});

test('sampleRoute: downsamples while keeping first and last point', () => {
  const points = Array.from({ length: 100 }, (_, i) => ({ lat: i, lon: i }));
  const sampled = sampleRoute(points, 10);
  assert.equal(sampled.length, 10);
  assert.deepEqual(sampled[0], points[0]);
  assert.deepEqual(sampled[sampled.length - 1], points[points.length - 1]);
});

test('nearestRoutePoint: finds the closest vertex and its index', () => {
  const route = [{ lat: 40, lon: -105 }, { lat: 41, lon: -105 }, { lat: 42, lon: -105 }];
  const result = nearestRoutePoint(41.001, -105, route);
  assert.equal(result.index, 1);
  assert.ok(result.distanceMiles < 0.1);
});

test('routeBoundingBox: covers all points plus padding', () => {
  const route = [{ lat: 40, lon: -105 }, { lat: 41, lon: -104 }];
  const box = routeBoundingBox(route, 0);
  assert.equal(box.swLat, 40);
  assert.equal(box.neLat, 41);
  assert.equal(box.swLon, -105);
  assert.equal(box.neLon, -104);

  const padded = routeBoundingBox(route, 69);
  assert.equal(padded.swLat, 39);
  assert.equal(padded.neLat, 42);
});

test('parseRoutePoints: parses "lon,lat;lon,lat" pairs', () => {
  const parsed = parseRoutePoints('-105.5,40.1;-106,40.5');
  assert.deepEqual(parsed, [{ lat: 40.1, lon: -105.5 }, { lat: 40.5, lon: -106 }]);
});

test('parseRoutePoints: throws on malformed input', () => {
  assert.throws(() => parseRoutePoints('not-a-point'), /Invalid route point/);
});
