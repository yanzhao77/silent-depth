#pragma once

#include "CoreMinimal.h"
#include "Core/GameState.h"

/**
 * Deterministic game state machine (GAME_ARCHITECTURE §4).
 * Mirrors src/core/stateMachine.ts. The TS throws GameStateTransitionError on
 * an illegal transition; here Transition() returns false (state unchanged),
 * which is the safe C++ equivalent for failure-fast guarding.
 */
struct SILENTDEPTHUE_API FSDGameStateMachine
{
    explicit FSDGameStateMachine(ESDGameState Initial = ESDGameState::Boot);

    ESDGameState GetState() const { return Current; }
    bool CanTransition(ESDGameState Target) const;
    /** Returns false (state unchanged) on an illegal transition. */
    bool Transition(ESDGameState Target);
    void Reset();

private:
    ESDGameState Current;
};
