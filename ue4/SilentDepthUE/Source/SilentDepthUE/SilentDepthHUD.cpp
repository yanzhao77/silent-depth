#include "SilentDepthHUD.h"

#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/Font.h"
#include "SubmarinePawn.h"

void ASilentDepthHUD::DrawHUD()
{
    Super::DrawHUD();

    APawn* OwningPawn = GetOwningPlayerController() ? GetOwningPlayerController()->GetPawn() : nullptr;
    ASubmarinePawn* Sub = Cast<ASubmarinePawn>(OwningPawn);
    if (!Sub)
    {
        return;
    }

    const FString DepthText = FString::Printf(
        TEXT("DEPTH %d m  %s\nSPEED %.1f kt  BAT %.0f%%  NOISE %.0f"),
        FMath::RoundToInt(Sub->CurrentDepthM),
        *Sub->CurrentDepthLayer,
        Sub->CurrentSpeedKt,
        Sub->CurrentBattery,
        Sub->CurrentNoise
    );

    DrawText(
        DepthText,
        FLinearColor(0.80f, 0.92f, 1.0f, 1.0f),
        24.0f,
        24.0f,
        GEngine->GetSmallFont(),
        1.4f,
        true
    );
}
