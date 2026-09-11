#pragma once

#include "CoreMinimal.h"

#include "GameFramework/SaveGame.h"

#include "SilentDepthSaveGame.generated.h"

/**
 * The UE save slot payload.
 *
 * The actual save data is the versioned JSON document produced by the
 * tech-tree save module: one format for a slot, a file and a browser export,
 * with one strict reader and one tamper check. This class is only the slot
 * container, plus two plain fields so a slot can be rejected without parsing
 * its payload.
 */
UCLASS()
class SILENTDEPTHUE_API USilentDepthSaveGame : public USaveGame
{
    GENERATED_BODY()

public:
    /** The save document, exactly as the module serialises it. */
    UPROPERTY()
    FString DocumentJson;

    /** Schema id and version, duplicated for a cheap compatibility gate. */
    UPROPERTY()
    FString DocumentSchema;

    UPROPERTY()
    int32 DocumentVersion = 0;
};
