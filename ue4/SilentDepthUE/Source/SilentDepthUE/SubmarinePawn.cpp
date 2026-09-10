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

// Separate propeller, exported by tools/ue4/export_sub_split.py with its origin
// on the shaft axis so it can spin about the hull's local X.
const TCHAR* SD_PLAYER_PROP_MESH =
    TEXT("/Game/SilentDepth/Art/Submarines/SSN/Russia/Akula/SM_RU_SSN_Akula_PROP.SM_RU_SSN_Akula_PROP");

// Movable control surfaces. The factory exports each with its pivot on the
// hinge axis, so a component only has to sit on that hinge.
const TCHAR* SD_PLAYER_RUDDER_MESH =
    TEXT("/Game/SilentDepth/Art/Submarines/SSN/Russia/Akula/SM_RU_SSN_Akula_RUDDER.SM_RU_SSN_Akula_RUDDER");
const TCHAR* SD_PLAYER_STERN_PLANE_MESH =
    TEXT("/Game/SilentDepth/Art/Submarines/SSN/Russia/Akula/SM_RU_SSN_Akula_STERNPLANES.SM_RU_SSN_Akula_STERNPLANES");
const TCHAR* SD_PLAYER_BOW_PLANE_MESH =
    TEXT("/Game/SilentDepth/Art/Submarines/SSN/Russia/Akula/SM_RU_SSN_Akula_BOWPLANES.SM_RU_SSN_Akula_BOWPLANES");

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
    ZoomStepCm = HullHalfLengthCm * SD_ZOOM_STEP_RATIO;

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
        static ConstructorHelpers::FObjectFinder<UStaticMesh> PropMeshObj(SD_PLAYER_PROP_MESH);
        if (PropMeshObj.Succeeded())
        {
            Propeller->SetStaticMesh(PropMeshObj.Object);
        }
        Propeller->SetRelativeLocation(FVector(SD_PLAYER_PROP_SHAFT_CM, 0.0f, 0.0f));
        Propeller->SetRelativeScale3D(FVector(1.0f));
        Propeller->SetRelativeRotation(FRotator(0.0f, SD_PLAYER_HULL_YAW_DEG, 0.0f));
    }

    // Rudder: the vertical tail fins, turning about a vertical hinge.
    Rudder = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Rudder"));
    Rudder->SetupAttachment(SceneRoot);
    {
        static ConstructorHelpers::FObjectFinder<UStaticMesh> RudderMeshObj(SD_PLAYER_RUDDER_MESH);
        if (RudderMeshObj.Succeeded())
        {
            Rudder->SetStaticMesh(RudderMeshObj.Object);
        }
        Rudder->SetRelativeLocation(FVector(SD_PLAYER_RUDDER_HINGE_CM, 0.0f, 0.0f));
    }

    // Stern planes: the horizontal tail fins, about a transverse hinge.
    SternPlanes = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("SternPlanes"));
    SternPlanes->SetupAttachment(SceneRoot);
    {
        static ConstructorHelpers::FObjectFinder<UStaticMesh> SternMeshObj(SD_PLAYER_STERN_PLANE_MESH);
        if (SternMeshObj.Succeeded())
        {
            SternPlanes->SetStaticMesh(SternMeshObj.Object);
        }
        SternPlanes->SetRelativeLocation(FVector(SD_PLAYER_STERN_PLANE_HINGE_CM, 0.0f, 0.0f));
    }

    // Bow planes: the forward dive planes, about a transverse hinge.
    BowPlanes = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("BowPlanes"));
    BowPlanes->SetupAttachment(SceneRoot);
    {
        static ConstructorHelpers::FObjectFinder<UStaticMesh> BowMeshObj(SD_PLAYER_BOW_PLANE_MESH);
        if (BowMeshObj.Succeeded())
        {
            BowPlanes->SetStaticMesh(BowMeshObj.Object);
        }
        BowPlanes->SetRelativeLocation(FVector(SD_PLAYER_BOW_PLANE_HINGE_CM, 0.0f, 0.0f));
    }

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
