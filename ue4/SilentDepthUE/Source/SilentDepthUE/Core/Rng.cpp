#include "Core/Rng.h"

// FNV-1a 32-bit over UTF-16 code units (matches JS charCodeAt for ASCII labels).
static uint32 Fnv1a32(const TCHAR* S, int32 Len)
{
    uint32 H = 2166136261u;
    for (int32 i = 0; i < Len; ++i)
    {
        H ^= static_cast<uint32>(static_cast<uint16>(S[i]));
        H *= 16777619u;
    }
    return H;
}

double FSDRng::Next()
{
    uint32 A = State;
    A = A + 0x6D2B79F5u;                                   // (a + 0x6d2b79f5) | 0
    uint32 T = (A ^ (A >> 15)) * (1u | A);                  // Math.imul(a ^ (a>>>15), 1|a)
    T = (T + ((T ^ (T >> 7)) * (61u | T))) ^ T;             // Math.imul(t ^ (t>>>7), 61|t)
    State = A;
    return static_cast<double>(T ^ (T >> 14)) / 4294967296.0;
}

double FSDRng::Range(double Min, double Max)
{
    return Min + Next() * (Max - Min);
}

int32 FSDRng::Int(int32 Min, int32 Max)
{
    const int32 Span = FMath::FloorToInt(static_cast<float>(Max)) - FMath::CeilToInt(static_cast<float>(Min)) + 1;
    return FMath::FloorToInt(static_cast<float>(Next() * static_cast<double>(Span))) + FMath::CeilToInt(static_cast<float>(Min));
}

bool FSDRng::Chance(double Probability)
{
    const double Prob = Probability <= 0 ? 0 : (Probability >= 1 ? 1 : Probability);
    return Next() < Prob;
}

int32 FSDRng::Sign()
{
    return Next() < 0.5 ? -1 : 1;
}

FSDRng FSDRng::Fork(const FString& Label) const
{
    // Deterministic derivation from (label, original seed, current state).
    // Mirrors src/core/rng.ts fork(): hashString(`${label}|${seed}`) ^ state.
    const FString Key = FString::Printf(TEXT("%s|%u"), *Label, Seed);
    const uint32 Derived = (Fnv1a32(*Key, Key.Len()) ^ State);
    return FSDRng(Derived);
}
