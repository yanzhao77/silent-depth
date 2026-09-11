#include "Core/TechTree/TechTreeLoaderInternal.h"

#include "Core/TechTree/TechTreeSchema.h"
#include "Dom/JsonValue.h"

namespace SDTechTree
{
namespace Internal
{
bool BuildSubmarineNodes(
    const TSharedPtr<FJsonObject>& Catalogue,
    const FString& Where,
    FSDTechTree& Tree,
    FSDTechTreeLoadReport& Report)
{
    const TArray<TSharedPtr<FJsonValue>>* Assets = FindArray(Catalogue, TEXT("assets"));
    if (Assets == nullptr)
    {
        Report.AddError(TEXT("MISSING_FIELD"), Where, TEXT("assets[] is required"));
        return false;
    }
    for (const TSharedPtr<FJsonValue>& Value : *Assets)
    {
        const TSharedPtr<FJsonObject> Entry = Value->AsObject();
        if (!Entry.IsValid())
        {
            continue;
        }
        FSDTechNode Node;
        Node.Category = ESDTechCategory::Submarine;
        if (!RequireId(Entry, TEXT("asset_id"), Where, Report, Node.Id))
        {
            continue;
        }
        const FString Subject = Node.Id;
        Entry->TryGetStringField(TEXT("class"), Node.DisplayName);
        Entry->TryGetStringField(TEXT("country"), Node.Country);
        Entry->TryGetStringField(TEXT("variant_of"), Node.Detail.Submarine.VariantOfId);
        Entry->TryGetStringField(TEXT("type"), Node.Detail.Submarine.HullType);
        Entry->TryGetStringField(TEXT("project"), Node.Detail.Submarine.ProjectCode);
        Node.Detail.Category = ESDTechCategory::Submarine;
        Node.Detail.Submarine.ClassName = Node.DisplayName;
        Node.FamilyId = Node.Detail.Submarine.VariantOfId.IsEmpty()
            ? Node.DisplayName
            : Node.Detail.Submarine.VariantOfId;

        MapProduction(Entry, TEXT("status"), ESDTechCategory::Submarine, Subject, Report, Node.Production);
        MapTier(Entry, TEXT("tier"), Subject, Report, Node.Tier);
        Node.Unlock.RequiredTier = Node.Tier;
        Node.bDatabaseOnly = IsDatabaseOnlyStatus(Node.Production);

        ApplyFlatAssetPaths(Entry, Node.Asset);
        Entry->TryGetStringField(TEXT("collision"), Node.Asset.CollisionPath);
        Tree.Nodes.Add(MoveTemp(Node));
    }
    return true;
}

bool BuildWeaponNodes(
    const TSharedPtr<FJsonObject>& Catalogue,
    const FString& Where,
    FSDTechTree& Tree,
    FSDTechTreeLoadReport& Report)
{
    const TArray<TSharedPtr<FJsonValue>>* Weapons = FindArray(Catalogue, TEXT("weapons"));
    if (Weapons == nullptr)
    {
        Report.AddError(TEXT("MISSING_FIELD"), Where, TEXT("weapons[] is required"));
        return false;
    }
    for (const TSharedPtr<FJsonValue>& Value : *Weapons)
    {
        const TSharedPtr<FJsonObject> Entry = Value->AsObject();
        if (!Entry.IsValid())
        {
            continue;
        }
        FSDTechNode Node;
        Node.Category = ESDTechCategory::Weapon;
        if (!RequireId(Entry, TEXT("weapon_id"), Where, Report, Node.Id))
        {
            continue;
        }
        const FString Subject = Node.Id;
        Entry->TryGetStringField(TEXT("display_name"), Node.DisplayName);
        Entry->TryGetStringField(TEXT("short_name"), Node.ShortName);
        Entry->TryGetStringField(TEXT("country"), Node.Country);
        Entry->TryGetStringField(TEXT("era"), Node.Era);
        Entry->TryGetStringField(TEXT("family"), Node.FamilyId);
        Entry->TryGetStringField(TEXT("role"), Node.RoleText);

        Node.Detail.Category = ESDTechCategory::Weapon;
        Entry->TryGetStringField(TEXT("category"), Node.Detail.Weapon.WeaponCategory);
        Entry->TryGetStringField(TEXT("variant_of"), Node.Detail.Weapon.VariantOfId);
        if (const TArray<TSharedPtr<FJsonValue>>* Launches = FindArray(Entry, TEXT("launch_methods")))
        {
            for (const TSharedPtr<FJsonValue>& Launch : *Launches)
            {
                if (Launch->Type == EJson::String)
                {
                    Node.Detail.Weapon.LaunchMethods.Add(Launch->AsString());
                }
            }
        }

        MapProduction(Entry, TEXT("asset_status"), ESDTechCategory::Weapon, Subject, Report, Node.Production);
        MapServiceStatus(Entry, TEXT("status"), Subject, Report, Node.Service);
        MapEvidence(Entry, TEXT("confidence"), ESDTechCategory::Weapon, Subject, Report, Node.Evidence);
        MapTier(Entry, TEXT("tier"), Subject, Report, Node.Tier);
        Node.Unlock.RequiredTier = Node.Tier;

        // asset_priority currently mixes an ordering axis with DATABASE_ONLY
        // (DATA-003). The coverage meaning is preserved; the ordering value is
        // deliberately left Unknown rather than guessed.
        FString PriorityToken;
        if (Entry->TryGetStringField(TEXT("asset_priority"), PriorityToken) && !PriorityToken.IsEmpty())
        {
            if (PriorityToken.Equals(TEXT("DATABASE_ONLY"), ESearchCase::IgnoreCase))
            {
                Node.bDatabaseOnly = true;
            }
            else if (!MapPriorityField(Entry, TEXT("asset_priority"), Subject, Report, Node.Priority))
            {
                continue;
            }
        }
        Node.bDatabaseOnly = Node.bDatabaseOnly || IsDatabaseOnlyStatus(Node.Production);

        ApplyFlatAssetPaths(Entry, Node.Asset);
        Entry->TryGetStringField(TEXT("collision"), Node.Asset.CollisionPath);
        Entry->TryGetStringField(TEXT("spec"), Node.Asset.SpecPath);
        Entry->TryGetStringField(TEXT("preview_dir"), Node.Asset.PreviewDir);
        Tree.Nodes.Add(MoveTemp(Node));
    }
    return true;
}

bool BuildSensorNodes(
    const TSharedPtr<FJsonObject>& Catalogue,
    const FString& Where,
    FSDTechTree& Tree,
    FSDTechTreeLoadReport& Report)
{
    const TArray<TSharedPtr<FJsonValue>>* Entries = FindArray(Catalogue, TEXT("entries"));
    if (Entries == nullptr)
    {
        Report.AddError(TEXT("MISSING_FIELD"), Where, TEXT("entries[] is required"));
        return false;
    }
    for (const TSharedPtr<FJsonValue>& Value : *Entries)
    {
        const TSharedPtr<FJsonObject> Entry = Value->AsObject();
        if (!Entry.IsValid())
        {
            continue;
        }
        FSDTechNode Node;
        Node.Category = ESDTechCategory::Sensor;
        if (!RequireId(Entry, TEXT("sensor_id"), Where, Report, Node.Id))
        {
            continue;
        }
        const FString Subject = Node.Id;
        Entry->TryGetStringField(TEXT("name"), Node.DisplayName);
        Entry->TryGetStringField(TEXT("country"), Node.Country);
        Entry->TryGetStringField(TEXT("era"), Node.Era);
        Entry->TryGetStringField(TEXT("family"), Node.FamilyId);

        Node.Detail.Category = ESDTechCategory::Sensor;
        Entry->TryGetStringField(TEXT("branch"), Node.Detail.Sensor.BranchId);
        Entry->TryGetStringField(TEXT("sub_category"), Node.Detail.Sensor.SubCategory);
        Entry->TryGetStringField(TEXT("mount_type"), Node.Detail.Sensor.MountType);
        FString Socket;
        if (Entry->TryGetStringField(TEXT("socket"), Socket) && !Socket.IsEmpty())
        {
            Node.SocketNames.Add(Socket);
            Node.Detail.Sensor.bHasPhysicalMount = true;
        }

        MapProduction(Entry, TEXT("asset_status"), ESDTechCategory::Sensor, Subject, Report, Node.Production);
        MapServiceStatus(Entry, TEXT("status"), Subject, Report, Node.Service);
        MapEvidence(Entry, TEXT("confidence"), ESDTechCategory::Sensor, Subject, Report, Node.Evidence);
        MapVerification(Entry, TEXT("verification"), Subject, Report, Node.Detail.Sensor.Verification);
        MapTier(Entry, TEXT("tier"), Subject, Report, Node.Tier);
        Node.Unlock.RequiredTier = Node.Tier;
        Node.bDatabaseOnly = IsDatabaseOnlyStatus(Node.Production);

        Entry->TryGetStringField(TEXT("asset_path"), Node.Asset.AssetDir);
        Tree.Nodes.Add(MoveTemp(Node));
    }
    return true;
}

bool BuildDefensiveNodes(
    const TSharedPtr<FJsonObject>& Catalogue,
    const FString& Where,
    FSDTechTree& Tree,
    FSDTechTreeLoadReport& Report)
{
    const TArray<TSharedPtr<FJsonValue>>* Assets = FindArray(Catalogue, TEXT("assets"));
    if (Assets == nullptr)
    {
        Report.AddError(TEXT("MISSING_FIELD"), Where, TEXT("assets[] is required"));
        return false;
    }
    for (const TSharedPtr<FJsonValue>& Value : *Assets)
    {
        const TSharedPtr<FJsonObject> Entry = Value->AsObject();
        if (!Entry.IsValid())
        {
            continue;
        }
        FSDTechNode Node;
        Node.Category = ESDTechCategory::Defensive;
        if (!RequireId(Entry, TEXT("asset_id"), Where, Report, Node.Id))
        {
            continue;
        }
        const FString Subject = Node.Id;
        Entry->TryGetStringField(TEXT("label"), Node.DisplayName);
        Entry->TryGetStringField(TEXT("label_zh"), Node.DisplayNameZh);
        Entry->TryGetStringField(TEXT("country"), Node.Country);
        Entry->TryGetStringField(TEXT("family_id"), Node.FamilyId);
        Entry->TryGetStringField(TEXT("asset_dir"), Node.Asset.AssetDir);

        Node.Detail.Category = ESDTechCategory::Defensive;
        FString Branch;
        if (Entry->TryGetStringField(TEXT("branch"), Branch) && !Branch.IsEmpty())
        {
            Node.Detail.Defensive.BranchIds.Add(Branch);
        }
        if (const TArray<TSharedPtr<FJsonValue>>* Sockets = FindArray(Entry, TEXT("sockets")))
        {
            for (const TSharedPtr<FJsonValue>& Socket : *Sockets)
            {
                if (Socket->Type == EJson::String)
                {
                    Node.SocketNames.Add(Socket->AsString());
                }
            }
        }

        MapProduction(Entry, TEXT("status"), ESDTechCategory::Defensive, Subject, Report, Node.Production);
        MapPriorityField(Entry, TEXT("priority"), Subject, Report, Node.Priority);
        Node.bDatabaseOnly = IsDatabaseOnlyStatus(Node.Production);

        // Defensive assets reference their geometry through nested objects.
        if (const TSharedPtr<FJsonObject> Master = FindObjectField(Entry, TEXT("master")))
        {
            Master->TryGetStringField(TEXT("path"), Node.Asset.MasterPath);
        }
        if (const TSharedPtr<FJsonObject> Collision = FindObjectField(Entry, TEXT("collision")))
        {
            Collision->TryGetStringField(TEXT("path"), Node.Asset.CollisionPath);
        }
        if (const TSharedPtr<FJsonObject> Lods = FindObjectField(Entry, TEXT("lod_fbx")))
        {
            static const TCHAR* const LodFields[] = { TEXT("LOD0"), TEXT("LOD1"), TEXT("LOD2"), TEXT("LOD3") };
            FString* const Targets[] = { &Node.Asset.Lod0, &Node.Asset.Lod1, &Node.Asset.Lod2, &Node.Asset.Lod3 };
            for (int32 LodIndex = 0; LodIndex < 4; ++LodIndex)
            {
                if (const TSharedPtr<FJsonObject> Lod = FindObjectField(Lods, LodFields[LodIndex]))
                {
                    Lod->TryGetStringField(TEXT("path"), *Targets[LodIndex]);
                    ++Node.Asset.LodCount;
                }
            }
        }
        Tree.Nodes.Add(MoveTemp(Node));
    }
    return true;
}

bool BuildPropulsionNodes(
    const TSharedPtr<FJsonObject>& Catalogue,
    const FString& Where,
    FSDTechTree& Tree,
    FSDTechTreeLoadReport& Report)
{
    const TArray<TSharedPtr<FJsonValue>>* Assets = FindArray(Catalogue, TEXT("assets"));
    if (Assets == nullptr)
    {
        Report.AddError(TEXT("MISSING_FIELD"), Where, TEXT("assets[] is required"));
        return false;
    }
    for (const TSharedPtr<FJsonValue>& Value : *Assets)
    {
        const TSharedPtr<FJsonObject> Entry = Value->AsObject();
        if (!Entry.IsValid())
        {
            continue;
        }
        FSDTechNode Node;
        Node.Category = ESDTechCategory::Propulsion;
        if (!RequireId(Entry, TEXT("asset_id"), Where, Report, Node.Id))
        {
            continue;
        }
        const FString Subject = Node.Id;
        Entry->TryGetStringField(TEXT("display_name"), Node.DisplayName);
        Entry->TryGetStringField(TEXT("country"), Node.Country);
        Entry->TryGetStringField(TEXT("era"), Node.Era);
        Entry->TryGetStringField(TEXT("family_id"), Node.FamilyId);

        Node.Detail.Category = ESDTechCategory::Propulsion;
        Entry->TryGetStringField(TEXT("kind"), Node.Detail.Propulsion.Kind);
        Entry->TryGetStringField(TEXT("technology_route"), Node.Detail.Propulsion.TechnologyRoute);
        if (const TArray<TSharedPtr<FJsonValue>>* Sockets = FindArray(Entry, TEXT("sockets")))
        {
            for (const TSharedPtr<FJsonValue>& Socket : *Sockets)
            {
                if (Socket->Type == EJson::String)
                {
                    Node.SocketNames.Add(Socket->AsString());
                }
            }
        }

        MapProduction(Entry, TEXT("status"), ESDTechCategory::Propulsion, Subject, Report, Node.Production);
        MapCoverage(Entry, TEXT("coverage"), Subject, Report, Node.Detail.Propulsion.Coverage);
        MapTier(Entry, TEXT("tier"), Subject, Report, Node.Tier);
        Node.Unlock.RequiredTier = Node.Tier;
        Node.bDatabaseOnly = IsDatabaseOnlyStatus(Node.Production);

        if (const TSharedPtr<FJsonObject> Paths = FindObjectField(Entry, TEXT("paths")))
        {
            Paths->TryGetStringField(TEXT("blend"), Node.Asset.MasterPath);
            Paths->TryGetStringField(TEXT("lod0"), Node.Asset.Lod0);
            Paths->TryGetStringField(TEXT("lod1"), Node.Asset.Lod1);
            Paths->TryGetStringField(TEXT("lod2"), Node.Asset.Lod2);
            Paths->TryGetStringField(TEXT("lod3"), Node.Asset.Lod3);
            Paths->TryGetStringField(TEXT("collision"), Node.Asset.CollisionPath);
            Paths->TryGetStringField(TEXT("spec"), Node.Asset.SpecPath);
        }
        if (const TSharedPtr<FJsonObject> Lods = FindObjectField(Entry, TEXT("lods")))
        {
            Node.Asset.LodCount = Lods->Values.Num();
            double Triangles = 0.0;
            if (Lods->TryGetNumberField(TEXT("0"), Triangles))
            {
                Node.Asset.TrianglesLod0 = static_cast<int32>(Triangles);
            }
        }
        Tree.Nodes.Add(MoveTemp(Node));
    }
    return true;
}
}
}
