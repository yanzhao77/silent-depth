#pragma once

#include "CoreMinimal.h"

/** FR-19 game states — mirrors src/core/types.ts GameState (GAME_DESIGN §3.3). */
enum class ESDGameState : uint8
{
    Boot,
    Menu,
    MissionLoading,
    MissionRunning,
    Paused,
    Victory,
    Defeat,
    MissionResult
};
