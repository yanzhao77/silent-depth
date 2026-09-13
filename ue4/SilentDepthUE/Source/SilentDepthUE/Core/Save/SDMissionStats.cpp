#include "Core/Save/SDMissionStats.h"

namespace SDTechTree
{
void FSDMissionStatsService::NormalizeMissions(TArray<FSDMissionRecord>& InOutMissions)
{
    InOutMissions.Sort([](const FSDMissionRecord& A, const FSDMissionRecord& B)
    {
        return A.MissionId.Compare(B.MissionId, ESearchCase::CaseSensitive) < 0;
    });
}

int32 FSDMissionStatsService::CountCleared(const TArray<FSDMissionRecord>& Missions)
{
    int32 Count = 0;
    for (const FSDMissionRecord& Record : Missions)
    {
        Count += Record.bCleared ? 1 : 0;
    }
    return Count;
}

int32 FSDMissionStatsService::BestOfRecords(const TArray<FSDMissionRecord>& Missions)
{
    int32 Best = 0;
    for (const FSDMissionRecord& Record : Missions)
    {
        Best = FMath::Max(Best, Record.BestScore);
    }
    return Best;
}

const FSDMissionRecord* FSDMissionStatsService::Find(
    const TArray<FSDMissionRecord>& Missions,
    const FString& MissionId)
{
    for (const FSDMissionRecord& Record : Missions)
    {
        if (Record.MissionId.Equals(MissionId, ESearchCase::CaseSensitive))
        {
            return &Record;
        }
    }
    return nullptr;
}

bool FSDMissionStatsService::ApplyResult(
    const FSDMissionResult& Result,
    TArray<FSDMissionRecord>& InOutMissions,
    FSDStatistics& InOutStatistics)
{
    if (Result.MissionId.IsEmpty() || Result.Score < 0)
    {
        return false;
    }

    int32 Index = INDEX_NONE;
    for (int32 Candidate = 0; Candidate < InOutMissions.Num(); ++Candidate)
    {
        if (InOutMissions[Candidate].MissionId.Equals(Result.MissionId, ESearchCase::CaseSensitive))
        {
            Index = Candidate;
            break;
        }
    }
    if (Index == INDEX_NONE)
    {
        InOutMissions.AddDefaulted();
        Index = InOutMissions.Num() - 1;
        InOutMissions[Index].MissionId = Result.MissionId;
    }

    FSDMissionRecord& Record = InOutMissions[Index];
    const bool bFirstClear = Result.bCompleted && !Record.bCleared;
    Record.BestScore = FMath::Max(Record.BestScore, Result.Score);
    Record.bCleared = Record.bCleared || Result.bCompleted;

    ++InOutStatistics.MissionsPlayed;
    if (bFirstClear)
    {
        ++InOutStatistics.MissionsCleared;
    }
    if (!Result.bCompleted)
    {
        ++InOutStatistics.MissionsFailed;
    }
    InOutStatistics.TotalScore += Result.Score;
    InOutStatistics.BestScore = FMath::Max(InOutStatistics.BestScore, Result.Score);
    InOutStatistics.LastMissionId = Result.MissionId;

    // Canonical order last, so the caller always sees a sorted record list.
    NormalizeMissions(InOutMissions);
    return true;
}
}
