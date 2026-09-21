'use strict';
/**
 * Generation stamp written to `risks.source`.
 *
 * Scores from different generations are not comparable: a row written when a
 * dimension was min-max normalised means something different from one written
 * against fixed anchors, even for the same country on the same data. Anything
 * that plots a series over time must filter to a single generation, or it
 * draws a step that looks like a real change in the world.
 *
 * Bump this whenever the scale of a dimension or the composite formula changes.
 *
 *   v1  min-max per batch, five dimensions          (unstamped: 'weekly-cron')
 *   v2  fixed anchors, per-capita conflict, crime,
 *       road, FIES food, nullable dimensions
 */
const PIPELINE_VERSION = 'pipeline-v2';

module.exports = { PIPELINE_VERSION };
