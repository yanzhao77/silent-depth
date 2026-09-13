#pragma once

#include "CoreMinimal.h"

/**
 * Mission results, best scores and the statistics roll-up (SAVE-001).
 *
 * This is the only producer of the statistics section: a finished mission goes
 * in, the record list and the counters come out. The rules are pure functions
 * so they are testable without a world, a widget or a frame, and applying the
 * same result twice can never lower a score.
 */
namespace SDTechTree
{
    /** What one mission recorded, keyed by mission id. */
    struct FSDMissionRecord
    {
        FString MissionId;
        /** Highest score the mission ever reached. */
        int32 BestScore = 0;
        /** True once the mission has been cleared at least once. */
        bool bCleared = false;
    };

    /** The roll-up the statistics screen reads. */
    struct FSDStatistics
    {
        /** Every settled result counts as one play, replays included. */
        int32 MissionsPlayed = 0;
        /** Distinct missions cleared; matches the records, never the plays. */
        int32 MissionsCleared = 0;
        /** Results that did not complete the mission. */
        int32 MissionsFailed = 0;
        int32 TotalScore = 0;
        int32 BestScore = 0;
        FString LastMissionId;
    };

    /** One finished mission; the only input the producer takes. */
    struct FSDMissionResult
    {
        FString MissionId;
        int32 Score = 0;
        bool bCompleted = false;
    };

    /** Deterministic settlement of a mission result. */
    class FSDMissionStatsService
    {
    public:
        /**
         * Records a result. An empty mission id, a negative score or an empty
         * id field is refused and changes nothing.
         */
        static bool ApplyResult(
            const FSDMissionResult& Result,
            TArray<FSDMissionRecord>& InOutMissions,
            FSDStatistics& InOutStatistics);

        /** Sorts the records into mission-id order. */
        static void NormalizeMissions(TArray<FSDMissionRecord>& InOutMissions);

        /** Distinct cleared missions in the records. */
        static int32 CountCleared(const TArray<FSDMissionRecord>& Missions);

        /** Highest single-mission score in the records. */
        static int32 BestOfRecords(const TArray<FSDMissionRecord>& Missions);

        /** The record for a mission, or nullptr. */
        static const FSDMissionRecord* Find(
            const TArray<FSDMissionRecord>& Missions,
            const FString& MissionId);
    };
}
