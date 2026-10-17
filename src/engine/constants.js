export const WORLD_UNITS_PER_SVG_UNIT = 1 / 1000;
export const PLATE_DEPTH = 2400;
export const SYNTHETIC_HEIGHT_GAIN = 1.6;
export const COUNT_HEIGHT_GAIN = 9;
export const RAISE_LIFT = 7000;
export const BORDER_OFFSET = 25;
export const LIFT_DURATION_MS = 180;
export const EASING_PER_FRAME = 0.14;
export const HEIGHT_EASING_PER_FRAME = 0.16;
export const MAX_TILT_RADIANS = (5 * Math.PI) / 180;
export const BASE_AZIMUTH_RADIANS = (-8 * Math.PI) / 180;
export const CAMERA_FOV_DEGREES = 30;
export const FIT_MARGIN = 0.95;
export const ZOOM_LEVELS = [1, 1.5, 2.25, 3.4, 5, 7];
export const SINGLE_CITY_SHARE_OF_MAP = 0.28;
export const GROUP_SHARE_OF_MAP = 0.7;
export const SINGLE_CITY_MIN_ZOOM = 2;
export const MAX_FRAMING_ZOOM = 7;
export const DRAG_THRESHOLD_PX = 5;
export const WHEEL_STEP_THRESHOLD = 100;
export const REGION_BORDER_OPACITY = 0.3;
export const FRAME_SAMPLE_SIZE = 90;
export const RANKING_SIZE = 12;
export const SELECTION_CHIP_LIMIT = 16;
export const HEAT_CLASS_COUNT = 7;
export const CAPITAL_CODE = "3550308";

/**
 * @returns {{ liftDurationMs: number; easingPerFrame: number; heightEasingPerFrame: number }}
 */
export function readAnimationConstants() {
  return {
    liftDurationMs: LIFT_DURATION_MS,
    easingPerFrame: EASING_PER_FRAME,
    heightEasingPerFrame: HEIGHT_EASING_PER_FRAME,
  };
}
