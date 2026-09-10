#include "SubmarinePawn.h"

#include "Camera/CameraComponent.h"
#include "Components/InputComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "Misc/Paths.h"
#include "NiagaraComponent.h"
#include "NiagaraSystem.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
constexpr double SD_FIXED_DT = 0.05;
constexpr double SD_CM_PER_KM = 100000.0;
constexpr float SD_WAKE_SPEED_THRESHOLD_KT = 0.5f;  // propeller "on" and wake visible above this
constexpr float SD_WAKE_MIN_SCALE = 0.4f;            // size at near-zero speed
constexpr float SD_WAKE_MAX_SCALE = 1.3f;            // size at full speed
constexpr float SD_WAKE_SURFACE_FULL_M = 10.0f;      // wake fully visible at/above periscope depth
constexpr float SD_WAKE_SURFACE_HIDE_M = 20.0f;      // wake fully hidden below this (shallow and deeper)

// Starting submarine: Akula, Project 971. Imported from the asset library at
// 1:1 scale (110.2 m) with the bow along +X and Z up, which is also the pawn's
// forward, so the mesh needs no relative rotation. See docs/UE427_IMPORT_PLAN.md.
const TCHAR* SD_PLAYER_HULL_MESH =
    TEXT("/Game/SilentDepth/Art/Submarines/SSN/Russia/Akula/SM_RU_SSN_Akula.SM_RU_SSN_Akula");

// Yaw applied to the hull mesh so its bow lines up with the pawn's +X forward.
// The submarine assets are exported bow on +X, so this is zero; set it to 180
// if a hull ever arrives pointing the other way.
constexpr float SD_PLAYER_HULL_YAW_DEG = 0.0f;

// The Akula mesh carries its own propeller welded into the hull, so the separate
// spinning propeller component is left empty. Animating blades again would need
// them split into their own asset.
constexpr bool SD_HULL_INCLUDES_PROPELLER = true;

// Layout ratios applied to the hull's half length / half height.
constexpr float SD_FALLBACK_HALF_LENGTH_CM = 1800.0f;
constexpr float SD_FALLBACK_HALF_HEIGHT_CM = 1500.0f;
constexpr float SD_CAMERA_ARM_RATIO = 2.4f;
constexpr float SD_CAMERA_HEIGHT_RATIO = 0.35f;
constexpr float SD_BOW_FOAM_RATIO = 1.0f;
constexpr float SD_STERN_FOAM_RATIO = -1.08f;
constexpr float SD_ZOOM_MIN_RATIO = 0.15f;
constexpr float SD_ZOOM_MAX_RATIO = 1.8f;
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
    static ConstructorHelpers::FObjectFinder<UStaticMesh> MeshObj(SD_PLAYER_HULL_MESH);
    if (MeshObj.Succeeded())
    {
        MeshComp->SetStaticMesh(MeshObj.Object);
        // The submarine assets keep the bow on +X with Z up and are imported at
        // 1:1 scale, so the hull needs no scale change.
        MeshComp->SetRelativeRotation(FRotator(0.0f, SD_PLAYER_HULL_YAW_DEG, 0.0f));
        MeshComp->SetRelativeScale3D(FVector(1.0f));
        MeshComp->SetRelativeLocation(FVector::ZeroVector);

        const FVector Extent = MeshObj.Object->GetBounds().BoxExtent;
        HullHalfLengthCm = FMath::Max(Extent.X, 100.0f);
        SurfaceOffsetZCm = FMath::Max(Extent.Z, 100.0f) * SD_SURFACE_OFFSET_RATIO;
    }
    else
    {
        HullHalfLengthCm = SD_FALLBACK_HALF_LENGTH_CM;
        SurfaceOffsetZCm = SD_FALLBACK_HALF_HEIGHT_CM * SD_SURFACE_OFFSET_RATIO;
    }
    ZoomMinCm = HullHalfLengthCm * SD_ZOOM_MIN_RATIO;
    ZoomMaxCm = HullHalfLengthCm * SD_ZOOM_MAX_RATIO;

    SpringArm = CreateDefaultSubobject<USpringArmComponent>(TEXT("SpringArm"));
    SpringArm->SetupAttachment(SceneRoot);
    SpringArm->TargetArmLength = HullHalfLengthCm * SD_CAMERA_ARM_RATIO;
    SpringArm->bUsePawnControlRotation = true;    // mouse orbits the camera around the sub
    SpringArm->SetRelativeRotation(FRotator(-8.0f, 0.0f, 0.0f));
    SpringArm->SetRelativeLocation(FVector(0.0f, 0.0f, HullHalfLengthCm * SD_CAMERA_HEIGHT_RATIO));

    Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
    Camera->SetupAttachment(SpringArm);

    // Separate propeller so it can spin at the stern (bow faces +X). The Akula
    // hull already includes its own propeller, so nothing is attached here; see
    // SD_HULL_INCLUDES_PROPELLER.
    Propeller = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Propeller"));
    Propeller->SetupAttachment(SceneRoot);
    if (!SD_HULL_INCLUDES_PROPELLER)
    {
        static ConstructorHelpers::FObjectFinder<UStaticMesh> PropMeshObj(
            TEXT("/Game/Meshes/SM_Propeller.SM_Propeller")
        );
        if (PropMeshObj.Succeeded())
        {
            Propeller->SetStaticMesh(PropMeshObj.Object);
        }
    }
    // UE world units are centimetres; the stern tip sits at -half length.
    Propeller->SetRelativeLocation(FVector(-HullHalfLengthCm, 0.0f, 0.0f));
    Propeller->SetRelativeScale3D(FVector(2.6f, 2.6f, 2.6f));
    Propeller->SetRelativeRotation(FRotator(0.0f, -90.0f, 0.0f));

    // Bow wave (bow faces +X) and stern wake (trailing directly behind the
    // propeller hub). Both run the /Game/NS_Foam Niagara system and are
    // activated/measured by speed in Tick.
    BowFoam = CreateDefaultSubobject<UNiagaraComponent>(TEXT("BowFoam"));
    BowFoam->SetupAttachment(SceneRoot);
    BowFoam->SetRelativeLocation(FVector(HullHalfLengthCm * SD_BOW_FOAM_RATIO, 0.0f, 0.0f));
    BowFoam->SetAutoActivate(false);

    SternFoam = CreateDefaultSubobject<UNiagaraComponent>(TEXT("SternFoam"));
    SternFoam->SetupAttachment(SceneRoot);
    SternFoam->SetRelativeLocation(FVector(HullHalfLengthCm * SD_STERN_FOAM_RATIO, 0.0f, 0.0f));
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

    // Game input mode: capture the mouse so it directly orbits the camera.
    if (APlayerController* PC = Cast<APlayerController>(GetController()))
    {
        PC->bShowMouseCursor = false;
        PC->SetInputMode(FInputModeGameOnly());
    }
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
    // Mouse-wheel zoom.
    SpringArm->TargetArmLength = FMath::Clamp(
        SpringArm->TargetArmLength + ZoomValue * 200.0f,
        ZoomMinCm,
        ZoomMaxCm
    );

    // Fixed-time deterministic simulation step (20 Hz).
    StepAccumulator += FMath::Min(DeltaSeconds, 0.25f);
    while (StepAccumulator >= SD_FIXED_DT)
    {
        SubmarineStep(SimState, SimInputs, Balance, SD_FIXED_DT, ESDWeatherKind::Clear);
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

    // Spin the propeller proportional to speed. Skipped when the hull mesh has
    // its own welded propeller, which cannot rotate as a separate component.
    if (!SD_HULL_INCLUDES_PROPELLER)
    {
        PropAngle = FMath::Fmod(PropAngle + SimState.SpeedKt * 120.0 * DeltaSeconds, 360.0);
        const FQuat BaseYaw(FRotator(0.0f, -90.0f, 0.0f));
        const FQuat SpinY(FVector(0.0f, 1.0f, 0.0f), FMath::DegreesToRadians(PropAngle));
        Propeller->SetRelativeRotation((BaseYaw * SpinY).Rotator());
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
