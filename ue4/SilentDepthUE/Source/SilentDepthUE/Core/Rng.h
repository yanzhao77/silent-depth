#pragma once

#include "CoreMinimal.h"

/**
 * Deterministic mulberry32 RNG — the only random source in the simulation
 * (GAME_ARCHITECTURE ADR-004). Mirrors src/core/rng.ts exactly so the same
 * seed reproduces the same stream across the web and UE builds.
 */
struct SILENTDEPTHUE_API FSDRng
{
    explicit FSDRng(uint32 SeedValue) : Seed(SeedValue), State(SeedValue) {}

    /** Uniform float in [0, 1). */
    double Next();
    /** Uniform float in [Min, Max). Requires Max >= Min. */
    double Range(double Min, double Max);
    /** Uniform integer in [Min, Max], both ends inclusive. Requires Max >= Min. */
    int32 Int(int32 Min, int32 Max);
    /** True with probability Probability (clamped to [0, 1]). */
    bool Chance(double Probability);
    /** -1 or +1 with equal probability. */
    int32 Sign();
    /** Deterministic derived sub-stream (rng.fork("sonar") etc.). Does not consume parent. */
    FSDRng Fork(const FString& Label) const;

    uint32 GetSeed() const { return Seed; }
    uint32 GetState() const { return State; }

private:
    uint32 Seed;
    uint32 State;
};
