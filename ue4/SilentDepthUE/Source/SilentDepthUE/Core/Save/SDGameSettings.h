#pragma once

#include "CoreMinimal.h"

#include "Core/TechTree/TechTreeTypes.h"

/**
 * Player settings and the language token (SAVE-001).
 *
 * Every field has a declared range here and nowhere else: the settings screen
 * displays these rules and the save validator enforces them, so a hand-edited
 * file cannot push a value the runtime would then have to guess about.
 */
namespace SDTechTree
{
    /** Languages the save records. Tokens match the web save's app.language. */
    enum class ESDLanguage : uint8
    {
        Zh,
        En,
        Fr,
        Ru
    };

    /** The exact token written to the save; parse and write use this pair. */
    const TCHAR* ToString(ESDLanguage Value);
    bool ParseLanguage(const FString& Token, ESDLanguage& Out);

    /** Player settings. Defaults are the shipped values, not zeroes. */
    struct FSDSettings
    {
        float MasterVolume = 1.0f;
        float MusicVolume = 0.7f;
        float EffectsVolume = 1.0f;
        /** 0 = low, 1 = medium, 2 = high, 3 = epic. */
        int32 QualityPreset = 2;
        /** Render scale, applied by the video settings. */
        float ResolutionScale = 1.0f;
        bool bInvertRudder = false;
        ESDLanguage Language = ESDLanguage::Zh;
    };

    /** The only definition of the settings' legal range. */
    class FSDSettingsService
    {
    public:
        static constexpr int32 MinQualityPreset = 0;
        static constexpr int32 MaxQualityPreset = 3;
        static constexpr float MinResolutionScale = 0.5f;
        static constexpr float MaxResolutionScale = 1.0f;

        /**
         * Validates every field and adds one error per violation. Never
         * repairs a value: a bad setting is reported, not silently clamped.
         */
        static bool Validate(const FSDSettings& Settings, FSDTechTreeLoadReport& Report);
    };
}
