#pragma once

#include "CoreMinimal.h"

/** Simulation tick rate (GAME_ARCHITECTURE §8: render 60 Hz / sim 20 Hz). */
static constexpr double SDFIXED_DT = 0.05;
static constexpr double SDMAX_FRAME_TIME_S = 0.25;

struct SILENTDEPTHUE_API FSDFixedStepResult
{
    int32 Steps = 0;
    double NextAccumulator = 0.0;
    double NextSimTime = 0.0;
};

/**
 * Pure fixed-timestep accumulator (mirrors src/core/time.ts computeFixedSteps).
 * Returns how many fixed steps to run this frame, and the carry-over.
 */
SILENTDEPTHUE_API FSDFixedStepResult ComputeFixedSteps(
    double Accumulator,
    double FrameDtSeconds,
    double Dt = SDFIXED_DT,
    double MaxFrameSeconds = SDMAX_FRAME_TIME_S,
    double SimTime = 0.0
);
