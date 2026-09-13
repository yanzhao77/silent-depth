#include "SubmarinePawn.h"

#include "Camera/CameraComponent.h"
#include "Components/InputComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Core/Platform/SDPlatformAssets.h"
#include "Engine/GameInstance.h"
#include "Engine/StaticMesh.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "Misc/Paths.h"
#include "NiagaraComponent.h"
#include "NiagaraSystem.h"
#include "SilentDepthSaveSubsystem.h"
#include "TechTreeSubsystem.h"
#include "UObject/ConstructorHelpers.h"

DEFINE_LOG_CATEGORY_STATIC(LogSilentDepthPawn, Log, All);

namespace
{
constexpr double SD_FIXED_DT = 0.05;
constexpr double SD_CM_PER_KM = 100000.0;
constexpr float SD_WAKE_SPEED_THRESHOLD_KT = 0.5f;  // propeller "on" and wake visible above this
constexpr float SD_WAKE_MIN_SCALE = 0.4f;            // size at near-zero speed
constexpr float SD_WAKE_MAX_SCALE = 1.3f;            // size at full speed
constexpr float SD_WAKE_SURFACE_FULL_M = 10.0f;      // wake fully visible at/above periscope depth
constexpr float SD_WAKE_SURFACE_HIDE_M = 20.0f;      // wake fully hidden below this (shallow and deeper)

// The hull and its movable parts are resolved at BeginPlay from the platform
// table (Config/SilentDepth/platform_assets.json) plus the saved platform id.
// Nothing here builds an asset path by string concatenation: an unlisted
// platform resolves to the table's documented fallback and reports that it did
// (SUB-001).

// Shaft position along the hull, in centimetres; the Blender master puts the
// propeller hub at x = -54.4 m. Only meaningful for a separately exported prop.
constexpr float SD_PLAYER_PROP_SHAFT_CM = -5440.0f;

// Hinge lines of the control surfaces, from the Blender master: each fin hinges
// at its root leading edge.
constexpr float SD_PLAYER_RUDDER_HINGE_CM = -3880.0f;
constexpr float SD_PLAYER_STERN_PLANE_HINGE_CM = -3860.0f;
constexpr float SD_PLAYER_BOW_PLANE_HINGE_CM = 4340.0f;

// Surface deflection at full command. A real boat uses roughly 20-30 degrees.
constexpr float SD_RUDDER_MAX_DEG = 25.0f;
constexpr float SD_PLANE_MAX_DEG = 18.0f;

// Periscope: bbox centre in the Blender master is (2.40, 0.35, 15.59) m and the
// mast is 9.4 m tall, so retracting it by its own height stows it inside the
// sail. It rides up at periscope depth and down everywhere else, taking a couple
// of seconds either way.
constexpr float SD_PLAYER_PERISCOPE_X_CM = 240.0f;
constexpr float SD_PLAYER_PERISCOPE_Y_CM = 35.0f;
constexpr float SD_PLAYER_PERISCOPE_Z_CM = 1559.0f;
constexpr float SD_PERISCOPE_TRAVEL_CM = 940.0f;
constexpr float SD_PERISCOPE_TRAVEL_SECONDS = 2.5f;

// Yaw applied to the hull mesh so its bow lines up with the pawn's +X forward.
// The submarine assets are exported bow on +X, so this is zero; set it to 180
// if a hull ever arrives pointing the other way.
constexpr float SD_PLAYER_HULL_YAW_DEG = 0.0f;

// Layout ratios applied to the hull's half length / half height.
constexpr float SD_FALLBACK_HALF_LENGTH_CM = 1800.0f;
constexpr float SD_FALLBACK_HALF_HEIGHT_CM = 1500.0f;
constexpr float SD_CAMERA_ARM_RATIO = 2.4f;
constexpr float SD_CAMERA_HEIGHT_RATIO = 0.35f;
constexpr float SD_BOW_FOAM_RATIO = 1.0f;
constexpr float SD_STERN_FOAM_RATIO = -1.08f;
constexpr float SD_ZOOM_MIN_RATIO = 0.15f;
constexpr float SD_ZOOM_MAX_RATIO = 1.8f;
constexpr float SD_ZOOM_STEP_RATIO = 0.05f;
constexpr float SD_SURFACE_OFFSET_RATIO = 0.10f;

ESDDepthLayer NextShallower(ESDDepthLayer L)
{
    switch (L)
    {
    case ESDDepthLayer::Periscope: return ESDDepthLayer::Surface;
    case ESDDepthLayer::Shallow: return ESDDepthLayer::Periscope;
    case ESDDepthLayer::Medium: return ESDDepthLayer::Shallow;
    case ESDDepthLayer::Deep: return ESDDepthLayer::Medium;
    default: return ESDDepthLayer::Surface;
    }
}

ESDDepthLayer NextDeeper(ESDDepthLayer L)
{
    switch (L)
    {
    case ESDDepthLayer::Surface: return ESDDepthLayer::Periscope;
    case ESDDepthLayer::Periscope: return ESDDepthLayer::Shallow;
    case ESDDepthLayer::Shallow: return ESDDepthLayer::Medium;
    case ESDDepthLayer::Medium: return ESDDepthLayer::Deep;
    default: return ESDDepthLayer::Deep;
    }
}

FString DepthLayerName(ESDDepthLayer L)
{
    switch (L)
    {
    case ESDDepthLayer::Surface: return TEXT("Surface");
    case ESDDepthLayer::Periscope: return TEXT("Periscope");
    case ESDDepthLayer::Shallow: return TEXT("Shallow");
    case ESDDepthLayer::Medium: return TEXT("Medium");
    case ESDDepthLayer::Deep: return TEXT("Deep");
    default: return TEXT("?");
    }
}
}  // namespace

ASubmarinePawn::ASubmarinePawn()
{
    PrimaryActorTick.bCanEverTick = true;

    SceneRoot = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
    SetRootComponent(SceneRoot);

    MeshComp = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Hull"));
    MeshComp->SetupAttachment(SceneRoot);
    // Every submarine asset keeps the bow on +X with Z up at 1:1 scale, so the
    // hull needs no rotation; the mesh itself is resolved in BeginPlay.
    MeshComp->SetRelativeRotation(FRotator(0.0f, SD_PLAYER_HULL_YAW_DEG, 0.0f));
    MeshComp->SetRelativeScale3D(FVector(1.0f));
    MeshComp->SetRelativeLocation(FVector::ZeroVector);
    // Layout until the hull resolves: the documented fallback half extents.
    ApplyHullLayout(FVector(SD_FALLBACK_HALF_LENGTH_CM, 0.0f, SD_FALLBACK_HALF_HEIGHT_CM));

    SpringArm = CreateDefaultSubobject<USpringArmComponent>(TEXT("SpringArm"));
    SpringArm->SetupAttachment(SceneRoot);
    SpringArm->TargetArmLength = HullHalfLengthCm * SD_CAMERA_ARM_RATIO;
    SpringArm->bUsePawnControlRotation = true;    // mouse orbits the camera around the sub
    SpringArm->SetRelativeRotation(FRotator(-8.0f, 0.0f, 0.0f));
    SpringArm->SetRelativeLocation(FVector(0.0f, 0.0f, HullHalfLengthCm * SD_CAMERA_HEIGHT_RATIO));

    Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
    Camera->SetupAttachment(SpringArm);

    // Moving parts are separate components because the hull mesh holds none of
    // this geometry: the factory exports each with its pivot on the hinge axis.

    // Propeller, spinning on the shaft (bow faces +X).
    Propeller = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Propeller"));
    Propeller->SetupAttachment(SceneRoot);
    {
        Propeller->SetRelativeLocation(FVector(SD_PLAYER_PROP_SHAFT_CM, 0.0f, 0.0f));
        Propeller->SetRelativeScale3D(FVector(1.0f));
        Propeller->SetRelativeRotation(FRotator(0.0f, SD_PLAYER_HULL_YAW_DEG, 0.0f));
    }

    // Rudder: the vertical tail fins, turning about a vertical hinge.
    Rudder = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Rudder"));
    Rudder->SetupAttachment(SceneRoot);
    {
        Rudder->SetRelativeLocation(FVector(SD_PLAYER_RUDDER_HINGE_CM, 0.0f, 0.0f));
    }

    // Stern planes: the horizontal tail fins, about a transverse hinge.
    SternPlanes = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("SternPlanes"));
    SternPlanes->SetupAttachment(SceneRoot);
    {
        SternPlanes->SetRelativeLocation(FVector(SD_PLAYER_STERN_PLANE_HINGE_CM, 0.0f, 0.0f));
    }

    // Bow planes: the forward dive planes, about a transverse hinge.
    BowPlanes = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("BowPlanes"));
    BowPlanes->SetupAttachment(SceneRoot);
    {
        BowPlanes->SetRelativeLocation(FVector(SD_PLAYER_BOW_PLANE_HINGE_CM, 0.0f, 0.0f));
    }

    // Periscope: slides vertically, so it sits at its own centre rather than a
    // hinge. Starts stowed.
    Periscope = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Periscope"));
    Periscope->SetupAttachment(SceneRoot);
    {
        Periscope->SetRelativeLocation(FVector(
            SD_PLAYER_PERISCOPE_X_CM,
            SD_PLAYER_PERISCOPE_Y_CM,
            SD_PLAYER_PERISCOPE_Z_CM - SD_PERISCOPE_TRAVEL_CM
        ));
    }

    // Bow wave (bow faces +X) and stern wake (trailing directly behind the
    // propeller hub). Both run the /Game/NS_Foam Niagara system and are
    // activated/measured by speed in Tick.
    BowFoam = CreateDefaultSubobject<UNiagaraComponent>(TEXT("BowFoam"));
    BowFoam->SetupAttachment(SceneRoot);
    BowFoam->SetAutoActivate(false);

    SternFoam = CreateDefaultSubobject<UNiagaraComponent>(TEXT("SternFoam"));
    SternFoam->SetupAttachment(SceneRoot);
    SternFoam->SetAutoActivate(false);

    static ConstructorHelpers::FObjectFinder<UNiagaraSystem> FoamSysObj(
        TEXT("/Game/NS_Foam.NS_Foam")
    );
    if (FoamSysObj.Succeeded())
    {
        BowFoam->SetAsset(FoamSysObj.Object);
        SternFoam->SetAsset(FoamSysObj.Object);
    }

    AutoPossessPlayer = EAutoReceiveInput::Player0;
}

void ASubmarinePawn::BeginPlay()
{
    Super::BeginPlay();
    FSDBalance::LoadBalance(FPaths::ProjectConfigDir() + TEXT("balance.json"), Balance);
    SimState.Battery = Balance.BatteryCapacity;
    SimState.Hull = Balance.HullPlayerMax;
    SimState.DecoyCount = Balance.DecoyPerMission;
    SimState.DepthLayer = ESDDepthLayer::Surface;
    SimState.TargetDepthLayer = ESDDepthLayer::Surface;
    SimState.DepthM = LayerMidM(ESDDepthLayer::Surface, Balance);
    SimState.SpeedBand = ESDSpeedBand::Stopped;
    SimInputs.DepthLayerTarget = ESDDepthLayer::Surface;

    // SUB-001 / PROP-001 / DEF-001 / SNS-001: the save decides which boat is
    // sailed and what is fitted to it. Nothing chosen yet is an explicit state,
    // not an error, and the asset table's fallback covers it by name.
    SDTechTree::FSDTechTreeSaveData SaveData;
    const bool bHasSave = ReadSaveData(SaveData);
    ResolveAndApplyPlatformAssets(bHasSave ? SaveData.SelectedPlatformId : FString());
    ResolveEquipmentCapabilities(
        bHasSave ? SaveData.Loadouts : TArray<SDTechTree::FSDLoadoutAssignment>());

    // SUB-002: the platform's declared launch interface seeds the authoritative
    // state. Zero means the data states no tube count, so nothing is invented.
    if (!EquippedPlatformId.IsEmpty())
    {
        if (const UGameInstance* GameInstance = GetGameInstance())
        {
            if (const USilentDepthTechTreeSubsystem* TechTree =
                GameInstance->GetSubsystem<USilentDepthTechTreeSubsystem>())
            {
                if (TechTree->IsLoaded())
                {
                    const SDTechTree::FSDEquipmentService& Equipment =
                        TechTree->GetEquipmentService();
                    SimState.TorpedoCount = Equipment.GetPayloadCapacity(
                        EquippedPlatformId, TEXT("TORPEDO"));
                    if (const FSDLaunchInterface* Launch =
                        Equipment.FindLaunchInterface(EquippedPlatformId))
                    {
                        UE_LOG(LogSilentDepthPawn, Log,
                            TEXT("platform '%s': %d torpedo tube(s), %d VLS cell(s), %d payload module(s)"),
                            *EquippedPlatformId, Launch->TorpedoTubes,
                            Launch->VlsCells, Launch->PayloadModules);
                    }
                }
            }
        }
    }

    // DEF-001: fitted countermeasures add to the mission's decoy allowance.
    SimState.DecoyCount = Balance.DecoyPerMission + Capabilities.Defensive.DecoyCountBonus;

    // Game input mode: capture the mouse so it directly orbits the camera.
    if (APlayerController* PC = Cast<APlayerController>(GetController()))
    {
        PC->bShowMouseCursor = false;
        PC->SetInputMode(FInputModeGameOnly());
    }
}

void ASubmarinePawn::ApplyHullLayout(const FVector& HullExtent)
{
    HullHalfLengthCm = FMath::Max(HullExtent.X, 100.0f);
    SurfaceOffsetZCm = FMath::Max(HullExtent.Z, 100.0f) * SD_SURFACE_OFFSET_RATIO;
    ZoomMinCm = HullHalfLengthCm * SD_ZOOM_MIN_RATIO;
    ZoomMaxCm = HullHalfLengthCm * SD_ZOOM_MAX_RATIO;
    ZoomStepCm = HullHalfLengthCm * SD_ZOOM_STEP_RATIO;

    if (SpringArm != nullptr)
    {
        SpringArm->TargetArmLength = HullHalfLengthCm * SD_CAMERA_ARM_RATIO;
        SpringArm->SetRelativeLocation(FVector(0.0f, 0.0f, HullHalfLengthCm * SD_CAMERA_HEIGHT_RATIO));
    }
    if (BowFoam != nullptr)
    {
        BowFoam->SetRelativeLocation(FVector(HullHalfLengthCm * SD_BOW_FOAM_RATIO, 0.0f, 0.0f));
    }
    if (SternFoam != nullptr)
    {
        SternFoam->SetRelativeLocation(FVector(HullHalfLengthCm * SD_STERN_FOAM_RATIO, 0.0f, 0.0f));
    }
}

void ASubmarinePawn::ApplyPart(
    UStaticMeshComponent* Component,
    const FString& AssetPath,
    const FSDVec3* OffsetCm)
{
    if (Component == nullptr)
    {
        return;
    }
    if (OffsetCm != nullptr)
    {
        Component->SetRelativeLocation(FVector(OffsetCm->X, OffsetCm->Y, OffsetCm->Z));
    }
    if (AssetPath.IsEmpty())
    {
        // This hull was imported without that part. Hiding the component is the
        // honest option: borrowing another boat's part would be a fabrication.
        Component->SetStaticMesh(nullptr);
        Component->SetVisibility(false);
        Component->SetCollisionEnabled(ECollisionEnabled::NoCollision);
        return;
    }

    UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, *AssetPath);
    if (Mesh == nullptr)
    {
        UE_LOG(LogSilentDepthPawn, Error,
            TEXT("part asset '%s' could not be loaded; the component stays hidden"), *AssetPath);
        Component->SetStaticMesh(nullptr);
        Component->SetVisibility(false);
        Component->SetCollisionEnabled(ECollisionEnabled::NoCollision);
        return;
    }
    Component->SetStaticMesh(Mesh);
    Component->SetVisibility(true);
}

bool ASubmarinePawn::ReadSaveData(SDTechTree::FSDTechTreeSaveData& OutData) const
{
    const UGameInstance* GameInstance = GetGameInstance();
    if (GameInstance == nullptr)
    {
        return false;
    }
    USilentDepthSaveSubsystem* SaveSubsystem =
        GameInstance->GetSubsystem<USilentDepthSaveSubsystem>();
    if (SaveSubsystem == nullptr)
    {
        return false;
    }
    const FString SlotName = USilentDepthSaveSubsystem::DefaultSlotName();
    if (!SaveSubsystem->DoesSlotExist(SlotName))
    {
        return false;
    }
    FSDTechTreeLoadReport Report;
    if (SaveSubsystem->LoadFromSlot(SlotName, OutData, Report))
    {
        return true;
    }
    // A bad save does not license a guess: the caller keeps the defaults and
    // the asset table's documented fallback covers the hull.
    UE_LOG(LogSilentDepthPawn, Warning,
        TEXT("the save in slot '%s' could not be read (%d error(s)); nothing is assumed from it"),
        *SlotName, Report.Errors.Num());
    return false;
}

void ASubmarinePawn::ResolveEquipmentCapabilities(
    const TArray<SDTechTree::FSDLoadoutAssignment>& Loadouts)
{
    PropulsionEffects = FSDPropulsionEffects();
    Capabilities = FSDEffectiveCapabilities();
    if (EquippedPlatformId.IsEmpty())
    {
        return;
    }
    const UGameInstance* GameInstance = GetGameInstance();
    if (GameInstance == nullptr)
    {
        return;
    }
    const USilentDepthTechTreeSubsystem* TechTree =
        GameInstance->GetSubsystem<USilentDepthTechTreeSubsystem>();
    if (TechTree == nullptr || !TechTree->IsLoaded())
    {
        return;
    }

    FSDEquipmentEffectsTable Table;
    FSDTechTreeLoadReport Report;
    if (!SDPlatform::LoadEquipmentEffects(
        SDPlatform::DefaultEquipmentEffectsPath(), Table, Report))
    {
        // Fail closed to neutral: the balance values stand, and the reason is
        // in the log rather than silently absorbed.
        for (const FSDDataError& Error : Report.Errors)
        {
            UE_LOG(LogSilentDepthPawn, Error, TEXT("[%s] %s :: %s"),
                *Error.Code, *Error.Subject, *Error.Detail);
        }
        return;
    }

    Capabilities = SDPlatform::ComputeEffectiveCapabilities(
        TechTree->GetEquipmentService(), Loadouts, EquippedPlatformId, Table);
    PropulsionEffects = Capabilities.Propulsion;

    UE_LOG(LogSilentDepthPawn, Log,
        TEXT("equipment effects for '%s' from %d node(s): noise %+.2f, accel x%.2f, speed x%.2f, "
             "battery x%.2f, decoys +%d, esm %s, warning %s, passive %.1f km"),
        *EquippedPlatformId,
        Capabilities.SourceNodeIds.Num(),
        PropulsionEffects.NoiseOffset,
        PropulsionEffects.AccelScale,
        PropulsionEffects.SpeedScale,
        PropulsionEffects.BatteryDrainScale,
        Capabilities.Defensive.DecoyCountBonus,
        Capabilities.Defensive.bEsm ? TEXT("yes") : TEXT("no"),
        Capabilities.Defensive.bThreatWarning ? TEXT("yes") : TEXT("no"),
        Capabilities.Sensors.PassiveRangeKm);
}

void ASubmarinePawn::ResolveAndApplyPlatformAssets(const FString& RequestedPlatform)
{
    FSDPlatformAssetsTable Table;
    FSDTechTreeLoadReport TableReport;
    if (!SDPlatform::LoadPlatformAssets(SDPlatform::DefaultPlatformAssetsPath(), Table, TableReport))
    {
        for (const FSDDataError& Error : TableReport.Errors)
        {
            UE_LOG(LogSilentDepthPawn, Error, TEXT("[%s] %s :: %s"),
                *Error.Code, *Error.Subject, *Error.Detail);
        }
        // Fail closed: no hull is shown rather than a guessed one.
        EquippedPlatformId.Reset();
        bUsedFallbackAssets = false;
        ApplyPart(MeshComp, FString());
        ApplyPart(Propeller, FString());
        ApplyPart(Rudder, FString());
        ApplyPart(SternPlanes, FString());
        ApplyPart(BowPlanes, FString());
        ApplyPart(Periscope, FString());
        return;
    }

    const FSDResolvedPlatformAssets Resolved =
        SDPlatform::ResolvePlatformAssets(Table, RequestedPlatform);
    EquippedPlatformId = Resolved.Assets.PlatformId;
    bUsedFallbackAssets = Resolved.bUsedFallback;

    if (Resolved.bUsedFallback)
    {
        UE_LOG(LogSilentDepthPawn, Warning,
            TEXT("platform '%s' has no imported assets; using the documented fallback '%s'"),
            Resolved.RequestedPlatformId.IsEmpty() ? TEXT("<none chosen>") : *Resolved.RequestedPlatformId,
            *Resolved.Assets.PlatformId);
    }
    if (Resolved.Assets.Hull.IsEmpty())
    {
        UE_LOG(LogSilentDepthPawn, Error,
            TEXT("the platform table resolved no hull; nothing is shown"));
        ApplyPart(MeshComp, FString());
        return;
    }

    ApplyPart(MeshComp, Resolved.Assets.Hull);
    if (MeshComp->GetStaticMesh() != nullptr)
    {
        ApplyHullLayout(MeshComp->GetStaticMesh()->GetBounds().BoxExtent);
    }
    ApplyPart(Propeller, Resolved.Assets.Propulsor,
              Resolved.Assets.PartOffsetsCm.Find(TEXT("propulsor")));
    // The pivot comes from the platform table when the hull declares one; the
    // three hand-built boats predate that field and keep their constructor
    // offsets, which is why the pointer is optional rather than defaulted.
    ApplyPart(Rudder, Resolved.Assets.Rudder, Resolved.Assets.PartOffsetsCm.Find(TEXT("rudder")));
    ApplyPart(SternPlanes, Resolved.Assets.SternPlanes,
              Resolved.Assets.PartOffsetsCm.Find(TEXT("sternPlanes")));
    ApplyPart(BowPlanes, Resolved.Assets.BowPlanes,
              Resolved.Assets.PartOffsetsCm.Find(TEXT("bowPlanes")));
    ApplyPart(Periscope, Resolved.Assets.Periscope,
              Resolved.Assets.PartOffsetsCm.Find(TEXT("periscope")));
}

void ASubmarinePawn::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);

    // Translate UI-style inputs into the deterministic sim inputs.
    double ThrottleMax = Balance.SpeedBands[static_cast<int>(ESDSpeedBand::Full)].SpeedMaxKt;
    SimInputs.Throttle = FMath::Clamp(
        SimInputs.Throttle + static_cast<double>(ThrottleValue) * 6.0 * DeltaSeconds,
        0.0,
        ThrottleMax
    );
    SimInputs.Rudder = FMath::Clamp(static_cast<double>(RudderValue), -1.0, 1.0);
    if (DepthValue > 0.5f)
    {
        SimInputs.DepthLayerTarget = NextShallower(SimState.DepthLayer);
    }
    else if (DepthValue < -0.5f)
    {
        SimInputs.DepthLayerTarget = NextDeeper(SimState.DepthLayer);
    }
    // Mouse-wheel zoom. Scrolling forward pulls the camera in, so the axis is
    // subtracted rather than added.
    SpringArm->TargetArmLength = FMath::Clamp(
        SpringArm->TargetArmLength - ZoomValue * ZoomStepCm,
        ZoomMinCm,
        ZoomMaxCm
    );

    // Fixed-time deterministic simulation step (20 Hz).
    StepAccumulator += FMath::Min(DeltaSeconds, 0.25f);
    while (StepAccumulator >= SD_FIXED_DT)
    {
        // PROP-001: the fitted propulsor scales top speed, acceleration,
        // battery drain and radiated noise inside the authoritative step.
        SubmarineStep(
            SimState, SimInputs, Balance, PropulsionEffects, SD_FIXED_DT, ESDWeatherKind::Clear);
        StepAccumulator -= SD_FIXED_DT;
    }

    // Drive the presentation transform from the authoritative state (one-way flow).
    SetActorLocation(FVector(
        SimState.PosXKm * SD_CM_PER_KM,
        SimState.PosYKm * SD_CM_PER_KM,
        -SimState.DepthM * 100.0 + SurfaceOffsetZCm
    ));
    SetActorRotation(FRotator(0.0f, 90.0f - SimState.HeadingDeg, 0.0f));

    // Presentation fields.
    CurrentDepthM = SimState.DepthM;
    CurrentDepthLayer = DepthLayerName(SimState.DepthLayer);
    CurrentSpeedKt = SimState.SpeedKt;
    CurrentBattery = SimState.Battery;
    CurrentNoise = SimState.Noise;

    // Spin the propeller proportional to speed. The shaft runs along the hull's
    // local X, so the blade spin is roll.
    PropAngle = FMath::Fmod(PropAngle + SimState.SpeedKt * 120.0 * DeltaSeconds, 360.0);
    if (Propeller != nullptr)
    {
        const FQuat BaseYaw(FRotator(0.0f, SD_PLAYER_HULL_YAW_DEG, 0.0f));
        const FQuat SpinX(FVector(1.0f, 0.0f, 0.0f), FMath::DegreesToRadians(PropAngle));
        Propeller->SetRelativeRotation((BaseYaw * SpinX).Rotator());
    }

    // Control surfaces follow the authoritative commands: the rudder tracks the
    // helm, the dive planes track the commanded depth change and recentre once
    // the boat reaches the new layer.
    //
    // Signs follow UE's rotator convention (positive pitch lifts +X toward +Z,
    // positive yaw turns +X toward +Y). Each fin extends aft of its hinge, so
    // positive pitch drops its trailing edge:
    //   rudder  - trailing edge to port, which is the direction a positive
    //             helm input steers the simulation
    //   stern   - trailing edge down lifts the stern and drops the bow, i.e.
    //             diving
    //   bow     - the opposite, which is what actually pushes the bow down
    const float RudderCommand = FMath::Clamp(static_cast<float>(SimInputs.Rudder), -1.0f, 1.0f);
    RudderAngleDeg = RudderCommand * SD_RUDDER_MAX_DEG;
    const int32 DepthDelta = FMath::Clamp(
        static_cast<int32>(SimState.TargetDepthLayer) - static_cast<int32>(SimState.DepthLayer),
        -1,
        1
    );
    PlaneAngleDeg = static_cast<float>(DepthDelta) * SD_PLANE_MAX_DEG;

    if (Rudder != nullptr)
    {
        Rudder->SetRelativeRotation(FRotator(0.0f, SD_PLAYER_HULL_YAW_DEG + RudderAngleDeg, 0.0f));
    }
    if (SternPlanes != nullptr)
    {
        SternPlanes->SetRelativeRotation(FRotator(PlaneAngleDeg, SD_PLAYER_HULL_YAW_DEG, 0.0f));
    }
    if (BowPlanes != nullptr)
    {
        BowPlanes->SetRelativeRotation(FRotator(-PlaneAngleDeg, SD_PLAYER_HULL_YAW_DEG, 0.0f));
    }

    // Periscope rides up at periscope depth and stows otherwise, moving at a
    // constant rate so raising and lowering take the same time.
    const float PeriscopeTarget = (SimState.DepthLayer == ESDDepthLayer::Periscope) ? 1.0f : 0.0f;
    PeriscopeExtend = FMath::FInterpConstantTo(
        PeriscopeExtend,
        PeriscopeTarget,
        DeltaSeconds,
        1.0f / SD_PERISCOPE_TRAVEL_SECONDS
    );
    if (Periscope != nullptr)
    {
        Periscope->SetRelativeLocation(FVector(
            SD_PLAYER_PERISCOPE_X_CM,
            SD_PLAYER_PERISCOPE_Y_CM,
            SD_PLAYER_PERISCOPE_Z_CM - SD_PERISCOPE_TRAVEL_CM * (1.0f - PeriscopeExtend)
        ));
    }

    // Wake / bow foam is presentation-only and follows the propeller: it is on
    // whenever the screw is turning, and swells with speed. We only touch the
    // components on state changes to avoid re-triggering the loop every frame.
    const float FullSpeedKt = static_cast<float>(
        Balance.SpeedBands[static_cast<int>(ESDSpeedBand::Full)].SpeedMaxKt
    );
    const float SpeedRatio = FullSpeedKt > 0.0f
        ? FMath::Clamp(static_cast<float>(SimState.SpeedKt) / FullSpeedKt, 0.0f, 1.0f)
        : 0.0f;
    // Surface-only wake: full at/above periscope depth, fades out as the sub
    // dives, and is fully hidden once it is clearly down in the Shallow layer.
    const float WakeDepthFactor = 1.0f - FMath::Clamp(
        (static_cast<float>(SimState.DepthM) - SD_WAKE_SURFACE_FULL_M) /
            (SD_WAKE_SURFACE_HIDE_M - SD_WAKE_SURFACE_FULL_M),
        0.0f,
        1.0f
    );
    const bool bWakeOn = SimState.SpeedKt >= SD_WAKE_SPEED_THRESHOLD_KT &&
                         WakeDepthFactor > 0.0f;
    const float WakeScale = FMath::Lerp(SD_WAKE_MIN_SCALE, SD_WAKE_MAX_SCALE, SpeedRatio) *
                            WakeDepthFactor;
    const FVector WakeScaleV(WakeScale);

    if (BowFoam != nullptr)
    {
        if (BowFoam->IsActive() != bWakeOn)
        {
            BowFoam->SetActive(bWakeOn, true);
        }
        BowFoam->SetRelativeScale3D(WakeScaleV);
    }
    if (SternFoam != nullptr)
    {
        if (SternFoam->IsActive() != bWakeOn)
        {
            SternFoam->SetActive(bWakeOn, true);
        }
        SternFoam->SetRelativeScale3D(WakeScaleV);
    }

}

void ASubmarinePawn::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
    Super::SetupPlayerInputComponent(PlayerInputComponent);
    PlayerInputComponent->BindAxis(TEXT("MoveForward"), this, &ASubmarinePawn::ThrottleAxis);
    PlayerInputComponent->BindAxis(TEXT("Rudder"), this, &ASubmarinePawn::RudderAxis);
    PlayerInputComponent->BindAxis(TEXT("Turn"), this, &ASubmarinePawn::AddControllerYawInput);
    PlayerInputComponent->BindAxis(TEXT("LookUp"), this, &ASubmarinePawn::AddControllerPitchInput);
    PlayerInputComponent->BindAxis(TEXT("MoveDepth"), this, &ASubmarinePawn::DepthAxisInput);
    PlayerInputComponent->BindAxis(TEXT("Zoom"), this, &ASubmarinePawn::ZoomAxis);
}

void ASubmarinePawn::ThrottleAxis(float Val) { ThrottleValue = Val; }
void ASubmarinePawn::RudderAxis(float Val) { RudderValue = Val; }
void ASubmarinePawn::DepthAxisInput(float Val) { DepthValue = Val; }
void ASubmarinePawn::ZoomAxis(float Val) { ZoomValue = Val; }
