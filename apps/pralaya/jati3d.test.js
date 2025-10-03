import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAxisRotationContext,
  rotatePointAroundAxisOnPlane,
} from './jati3dGeometry.js';

function projectPointToIsometricForTest(point, baseCenter, origin, scale, height = 0) {
  const dx = (point.x - baseCenter.x) * scale;
  const dy = (point.y - baseCenter.y) * scale;
  const x = origin.x + dx - dy;
  const y = origin.y + (dx + dy) * 0.5 - height;
  return { x, y };
}

test('stationary sound circles coincide for gati=3 and jati=7 copies', () => {
  const quadrantWidth = 480;
  const quadrantHeight = 420;
  const baseCenter = { x: quadrantWidth / 2, y: quadrantHeight / 2 };
  const isoOrigin = { x: quadrantWidth * 0.46, y: quadrantHeight * 0.72 };
  const scale = 0.82;
  const baseRadius = Math.min(quadrantWidth, quadrantHeight) * 0.32;

  const project = (point, height = 0) =>
    projectPointToIsometricForTest(point, baseCenter, isoOrigin, scale, height);

  const baseCorners = [
    { x: baseCenter.x - baseRadius, y: baseCenter.y - baseRadius },
    { x: baseCenter.x + baseRadius, y: baseCenter.y - baseRadius },
    { x: baseCenter.x + baseRadius, y: baseCenter.y + baseRadius },
    { x: baseCenter.x - baseRadius, y: baseCenter.y + baseRadius },
  ];
  const isoCorners = baseCorners.map((corner) => project(corner, 0));
  const farTopIndex = isoCorners.reduce(
    (best, corner, index) => (corner.y < isoCorners[best].y ? index : best),
    0,
  );
  const farRightIndex = isoCorners.reduce(
    (best, corner, index) => (corner.x > isoCorners[best].x ? index : best),
    0,
  );
  const farTopCorner = baseCorners[farTopIndex];
  const farRightCorner = baseCorners[farRightIndex];
  const topEdgeMidpoint = {
    x: farTopCorner.x + (farRightCorner.x - farTopCorner.x) * 0.5,
    y: farTopCorner.y + (farRightCorner.y - farTopCorner.y) * 0.5,
  };
  const radialMargin = 0.16;
  const directionToTop = {
    x: topEdgeMidpoint.x - baseCenter.x,
    y: topEdgeMidpoint.y - baseCenter.y,
  };
  const directionLength = Math.hypot(directionToTop.x, directionToTop.y) || 1;
  const directionUnit = {
    x: directionToTop.x / directionLength,
    y: directionToTop.y / directionLength,
  };
  const baseShapeRadius = directionLength * (1 - radialMargin);
  const baseOrientationAngle = Math.atan2(directionUnit.y, directionUnit.x);

  const gatiCount = 3;
  const copyCount = gatiCount;
  const angleStep = copyCount > 1 ? (Math.PI * 2) / copyCount : 0;
  const axisRotationStep = (Math.PI * 2) / gatiCount;
  const radiusScale =
    copyCount === 1 ? 1 : Math.max(0.32, 1 / (1 + (copyCount - 1) * 0.55));
  const shapeRadius = baseShapeRadius * radiusScale;
  const stationaryPoint = baseCenter;

  const rotatedPositions = [];

  for (let copyIndex = 0; copyIndex < copyCount; copyIndex += 1) {
    const rotation = baseOrientationAngle + angleStep * copyIndex;
    const direction = { x: Math.cos(rotation), y: Math.sin(rotation) };
    const copyCenter = {
      x: baseCenter.x - direction.x * shapeRadius,
      y: baseCenter.y - direction.y * shapeRadius,
    };
    const rotationContext = createAxisRotationContext(stationaryPoint, copyCenter);
    const rotationAngle = axisRotationStep * copyIndex;
    rotatedPositions.push(
      rotatePointAroundAxisOnPlane(stationaryPoint, rotationContext, rotationAngle),
    );
  }

  const first = rotatedPositions[0];
  const epsilon = 1e-9;
  rotatedPositions.forEach((position) => {
    assert(Math.abs(position.x - first.x) < epsilon, 'x coordinate should match');
    assert(Math.abs(position.y - first.y) < epsilon, 'y coordinate should match');
    assert(Math.abs(position.height) < epsilon, 'height should remain zero');
  });
});
