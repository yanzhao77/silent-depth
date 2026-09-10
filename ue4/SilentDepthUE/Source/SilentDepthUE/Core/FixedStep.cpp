#include "Core/FixedStep.h"

FSDFixedStepResult ComputeFixedSteps(
    double Accumulator,
    double FrameDtSeconds,
    double Dt,
    double MaxFrameSeconds,
    double SimTime
)
{
    const double DtSafe = Dt > 0 ? Dt : SDFIXED_DT;
    const double Acc = FMath::Min(
        FMath::Max(0.0, Accumulator) + FMath::Max(0.0, FrameDtSeconds),
        MaxFrameSeconds
    );
    const int32 Steps = static_cast<int32>(FMath::FloorToDouble(Acc / DtSafe + 1e-9));

    FSDFixedStepResult Result;
    Result.Steps = Steps;
    Result.NextAccumulator = FMath::Max(0.0, Acc - Steps * DtSafe);
    Result.NextSimTime = SimTime + Steps * DtSafe;
    return Result;
}
