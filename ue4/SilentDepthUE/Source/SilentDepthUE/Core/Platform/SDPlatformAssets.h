#pragma once

#include "CoreMinimal.h"

#include "Core/TechTree/TechTreeTypes.h"

/**
 * SUB-001: which imported presentation assets belong to which submarine.
 *
 * The table is hand-written (Config/SilentDepth/platform_assets.json) and lists
 * only assets that were really imported. Nothing here is derived by string
 * concatenation, so a missing platform can never silently borrow another
 * boat's meshes: it resolves to the documented fallback platform and reports
 * that it did.
 */
struct SILENTDEPTHUE_API FSDPlatformAssetSet
{
    FString PlatformId;
    FString Hull;
    FString Propulsor;
    FString Rudder;
    FString SternPlanes;
    FString BowPlanes;
    FString Periscope;
    /**
     * Where each movable part's pivot sits on the hull, in centimetres and
     * relative to the hull origin (because UE places the component there and
     * rotates it). Taken from the hull's own ASSEMBLY.json, never assumed: the
     * hand-built Akula values would put a Virginia's rudder 13 m out of place.
     */
    TMap<FString, FSDVec3> PartOffsetsCm;

    bool HasHull() const { return !Hull.IsEmpty(); }
};

/** The whole table plus the platform used when a request cannot be honoured. */
struct SILENTDEPTHUE_API FSDPlatformAssetsTable
{
    FString FallbackPlatformId;
    TMap<FString, FSDPlatformAssetSet> ByPlatform;

    /** Platform ids in id order, so tools and tests iterate deterministically. */
    void SortedIds(TArray<FString>& OutIds) const;
};

/** The outcome of a lookup, including which platform's assets were used. */
struct SILENTDEPTHUE_API FSDResolvedPlatformAssets
{
    FSDPlatformAssetSet Assets;
    /** The caller asked for a platform the table describes. */
    bool bExactMatch = false;
    /** The documented fallback was substituted. */
    bool bUsedFallback = false;
    FString RequestedPlatformId;
};

namespace SDPlatform
{
    /** Config/SilentDepth/platform_assets.json next to the project's Config. */
    FString DefaultPlatformAssetsPath();

    /**
     * Reads the table. Fails closed on a missing file, a wrong version, a
     * fallback that is not itself a usable entry, or a path that is not a
     * /Game/ asset path (a disk path would leak the authoring machine).
     */
    bool LoadPlatformAssets(
        const FString& JsonPath,
        FSDPlatformAssetsTable& OutTable,
        FSDTechTreeLoadReport& Report);

    /**
     * Resolves a request. An unknown platform, an empty id or an entry without
     * a hull all resolve to the fallback entry with bUsedFallback set; when the
     * table has no usable fallback the result is empty and both flags are
     * false, so the caller must not show a hull it cannot vouch for.
     */
    FSDResolvedPlatformAssets ResolvePlatformAssets(
        const FSDPlatformAssetsTable& Table,
        const FString& PlatformId);
}
