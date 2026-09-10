#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "SilentDepthHUD.generated.h"

UCLASS()
class SILENTDEPTHUE_API ASilentDepthHUD : public AHUD
{
    GENERATED_BODY()

public:
    virtual void DrawHUD() override;
};
