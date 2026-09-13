#include "Core/Save/SDGameSettings.h"

#include "Core/TechTree/TechTreeTypes.h"

namespace SDTechTree
{
const TCHAR* ToString(ESDLanguage Value)
{
    switch (Value)
    {
    case ESDLanguage::Zh: return TEXT("zh");
    case ESDLanguage::En: return TEXT("en");
    case ESDLanguage::Fr: return TEXT("fr");
    case ESDLanguage::Ru: return TEXT("ru");
    default:              return TEXT("zh");
    }
}

bool ParseLanguage(const FString& Token, ESDLanguage& Out)
{
    if (Token.Equals(TEXT("zh"), ESearchCase::IgnoreCase))
    {
        Out = ESDLanguage::Zh;
        return true;
    }
    if (Token.Equals(TEXT("en"), ESearchCase::IgnoreCase))
    {
        Out = ESDLanguage::En;
        return true;
    }
    if (Token.Equals(TEXT("fr"), ESearchCase::IgnoreCase))
    {
        Out = ESDLanguage::Fr;
        return true;
    }
    if (Token.Equals(TEXT("ru"), ESearchCase::IgnoreCase))
    {
        Out = ESDLanguage::Ru;
        return true;
    }
    return false;
}

bool FSDSettingsService::Validate(const FSDSettings& Settings, FSDTechTreeLoadReport& Report)
{
    const int32 ErrorsAtEntry = Report.Errors.Num();

    const auto CheckVolume = [&Report](const TCHAR* Field, const float Value)
    {
        if (Value < 0.0f || Value > 1.0f || !FMath::IsFinite(Value))
        {
            Report.AddError(
                TEXT("INVALID_SETTINGS_VALUE"),
                Field,
                FString::Printf(TEXT("%s must be between 0 and 1"), Field));
        }
    };
    CheckVolume(TEXT("masterVolume"), Settings.MasterVolume);
    CheckVolume(TEXT("musicVolume"), Settings.MusicVolume);
    CheckVolume(TEXT("effectsVolume"), Settings.EffectsVolume);

    if (Settings.QualityPreset < MinQualityPreset || Settings.QualityPreset > MaxQualityPreset)
    {
        Report.AddError(
            TEXT("INVALID_SETTINGS_VALUE"),
            TEXT("qualityPreset"),
            FString::Printf(TEXT("qualityPreset must be %d..%d"),
                MinQualityPreset, MaxQualityPreset));
    }

    if (Settings.ResolutionScale < MinResolutionScale
        || Settings.ResolutionScale > MaxResolutionScale
        || !FMath::IsFinite(Settings.ResolutionScale))
    {
        Report.AddError(
            TEXT("INVALID_SETTINGS_VALUE"),
            TEXT("resolutionScale"),
            FString::Printf(TEXT("resolutionScale must be %.2f..%.2f"),
                MinResolutionScale, MaxResolutionScale));
    }

    return Report.Errors.Num() == ErrorsAtEntry;
}
}
