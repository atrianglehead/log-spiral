export function createAxisRotationContext(stationaryPoint, copyCenter) {
  if (!stationaryPoint || !copyCenter) {
    return {
      axisPoint: stationaryPoint ? { x: stationaryPoint.x, y: stationaryPoint.y } : null,
      axisUnit: null,
    };
  }

  const axisVector = {
    x: copyCenter.x - stationaryPoint.x,
    y: copyCenter.y - stationaryPoint.y,
  };
  const axisLength = Math.hypot(axisVector.x, axisVector.y);

  if (!(axisLength > 0)) {
    return {
      axisPoint: { x: stationaryPoint.x, y: stationaryPoint.y },
      axisUnit: null,
    };
  }

  return {
    axisPoint: { x: stationaryPoint.x, y: stationaryPoint.y },
    axisUnit: { x: axisVector.x / axisLength, y: axisVector.y / axisLength },
  };
}

export function rotatePointAroundAxisOnPlane(point, context, angle) {
  if (!point) {
    return { x: 0, y: 0, height: 0 };
  }

  if (!context || !context.axisPoint || !context.axisUnit) {
    return { x: point.x, y: point.y, height: 0 };
  }

  if (!Number.isFinite(angle) || Math.abs(angle) < 1e-12) {
    return { x: point.x, y: point.y, height: 0 };
  }

  const { axisPoint, axisUnit } = context;
  const relativeX = point.x - axisPoint.x;
  const relativeY = point.y - axisPoint.y;

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dot = relativeX * axisUnit.x + relativeY * axisUnit.y;
  const crossZ = axisUnit.x * relativeY - axisUnit.y * relativeX;

  const rotatedX = relativeX * cos + axisUnit.x * dot * (1 - cos);
  const rotatedY = relativeY * cos + axisUnit.y * dot * (1 - cos);
  const rotatedHeight = crossZ * sin;

  return {
    x: axisPoint.x + rotatedX,
    y: axisPoint.y + rotatedY,
    height: rotatedHeight,
  };
}
