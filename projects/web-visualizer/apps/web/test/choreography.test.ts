import assert from "node:assert/strict";
import { test } from "node:test";
import { sampleChoreography } from "../src/choreography.ts";
import type { RhythmAnalysis } from "../src/rhythm.ts";

const score = {
  bpm: 120,
  kicks: Array.from({ length: 32 }, (_, i) => ({ time: 1 + i * 0.5, strength: 1 })),
} as RhythmAnalysis;

test("a cue plays anticipation, reach, grip, and recovery after the drum transient", () => {
  const anticipation = sampleChoreography(score, 1.35, 1);
  const reach = sampleChoreography(score, 2.4, 3);
  const grip = sampleChoreography(score, 2.8, 4);
  const recovery = sampleChoreography(score, 4.5, 8);
  assert.ok(anticipation.reachLeft < 0);
  assert.equal(reach.reachLeft, 1);
  assert.equal(reach.grip, 0);
  assert.ok(grip.grip > 0.95);
  assert.equal(recovery.reachLeft, 0);
  assert.equal(recovery.jawOpen, 0);
  assert.equal(recovery.lunge, 0);
});

test("seeking samples the same joint pose without replaying previous frames", () => {
  const pose = sampleChoreography(score, 6.3, 11);
  sampleChoreography(score, 12.2, 23);
  assert.deepEqual(sampleChoreography(score, 6.3, 11), pose);
  assert.notEqual(pose.reachLeft, pose.reachRight);
});

test("reduced motion damps actions and locks the laser chase", () => {
  const normal = sampleChoreography(score, 6.5, 12);
  const reduced = sampleChoreography(score, 6.5, 12, true);
  assert.ok(reduced.reachLeft <= normal.reachLeft * 0.081);
  assert.equal(reduced.laserCue, 0);
  assert.equal(reduced.laserPhase, 0);
});

test("the preview starts a new action immediately at each eight-beat boundary", () => {
  const first = sampleChoreography(null, 0.15, 0);
  const next = sampleChoreography(null, 3.9, 8);
  assert.ok(first.reachLeft < 0);
  assert.ok(Math.abs(first.reachLeft - next.reachLeft) < 0.000001);
  assert.ok(Math.abs(first.titleScatter - next.titleScatter) < 0.000001);
  assert.notEqual(first.laserCue, next.laserCue);
});
