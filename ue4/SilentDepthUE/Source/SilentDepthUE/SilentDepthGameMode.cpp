#include "SilentDepthGameMode.h"

#include "SilentDepthHUD.h"
#include "SubmarinePawn.h"

ASilentDepthGameMode::ASilentDepthGameMode()
{
    DefaultPawnClass = ASubmarinePawn::StaticClass();
    HUDClass = ASilentDepthHUD::StaticClass();
}
