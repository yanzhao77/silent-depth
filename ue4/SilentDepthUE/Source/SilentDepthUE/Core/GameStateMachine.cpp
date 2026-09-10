#include "Core/GameStateMachine.h"

FSDGameStateMachine::FSDGameStateMachine(ESDGameState Initial)
    : Current(Initial)
{
}

bool FSDGameStateMachine::CanTransition(ESDGameState Target) const
{
    switch (Current)
    {
    case ESDGameState::Boot:
        return Target == ESDGameState::Menu;
    case ESDGameState::Menu:
        return Target == ESDGameState::MissionLoading;
    case ESDGameState::MissionLoading:
        return Target == ESDGameState::MissionRunning || Target == ESDGameState::Menu;
    case ESDGameState::MissionRunning:
        return Target == ESDGameState::Paused || Target == ESDGameState::Victory ||
               Target == ESDGameState::Defeat || Target == ESDGameState::Menu;
    case ESDGameState::Paused:
        return Target == ESDGameState::MissionRunning || Target == ESDGameState::Menu;
    case ESDGameState::Victory:
        return Target == ESDGameState::MissionResult;
    case ESDGameState::Defeat:
        return Target == ESDGameState::MissionResult;
    case ESDGameState::MissionResult:
        return Target == ESDGameState::Menu;
    default:
        return false;
    }
}

bool FSDGameStateMachine::Transition(ESDGameState Target)
{
    if (!CanTransition(Target))
    {
        return false;
    }
    Current = Target;
    return true;
}

void FSDGameStateMachine::Reset()
{
    Current = ESDGameState::Boot;
}
