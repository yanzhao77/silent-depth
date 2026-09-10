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
    static ConstructorHelpers::FObjectFinder<UStaticMesh> MeshObj(
        TEXT("/Game/Meshes/SM_HeroSubmarine.SM_HeroSubmarine")
    );
    if (MeshObj.Succeeded())
    {
        MeshComp->SetStaticMesh(MeshObj.Object);
        // Imported length runs along local +Y with the bow at +Y; yaw -90 aims bow at +X.
        MeshComp->SetRelativeRotation(FRotator(0.0f, -90.0f, 0.0f));
        MeshComp->SetRelativeScale3D(FVector(1.9f, 1.9f, 1.9f));
        MeshComp->SetRelativeLocation(FVector::ZeroVector);
    }

    SpringArm = CreateDefaultSubobject<USpringArmComponent>(TEXT("SpringArm"));
    SpringArm->SetupAttachment(SceneRoot);
    SpringArm->TargetArmLength = 3000.0f;
    SpringArm->bUsePawnControlRotation = true;    // mouse orbits the camera around the sub
    SpringArm->SetRelativeRotation(FRotator(-8.0f, 0.0f, 0.0f));
    SpringArm->SetRelativeLocation(FVector(0.0f, 0.0f, 250.0f));

    Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
    Camera->SetupAttachment(SpringArm);

    // Separate propeller so it can spin at the stern (bow faces +X).
    Propeller = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Propeller"));
    Propeller->SetupAttachment(SceneRoot);
    static ConstructorHelpers::FObjectFinder<UStaticMesh> PropMeshObj(
        TEXT("/Game/Meshes/SM_Propeller.SM_Propeller")
    );
    if (PropMeshObj.Succeeded())
    {
        Propeller->SetStaticMesh(PropMeshObj.Object);
    }
    // UE world units are centimetres. The hull imports at 1:1 (glTF metres -> cm),
    // so with the 1.9x hull scale the stern tip lands at x ≈ -1900 (cm) in SceneRoot
    // space. Put the propeller hub right there, and scale it up so the ≈1.9 m blade
    // span reads clearly against the ~37 m hull.
    Propeller->SetRelativeLocation(FVector(-1900.0f, 0.0f, 0.0f));
    Propeller->SetRelativeScale3D(FVector(2.6f, 2.6f, 2.6f));
    Propeller->SetRelativeRotation(FRotator(0.0f, -90.0f, 0.0f));

    // Bow wave (bow faces +X) and stern wake (trailing directly behind the
    // propeller hub). Both run the /Game/NS_Foam Niagara system and are
    // activated/measured by speed in Tick.
    BowFoam = CreateDefaultSubobject<UNiagaraComponent>(TEXT("BowFoam"));
    BowFoam->SetupAttachment(SceneRoot);
    BowFoam->SetRelativeLocation(FVector(1800.0f, 0.0f, 0.0f));
    BowFoam->SetAutoActivate(false);

    SternFoam = CreateDefaultSubobject<UNiagaraComponent>(TEXT("SternFoam"));
    SternFoam->SetupAttachment(SceneRoot);
    SternFoam->SetRelativeLocation(FVector(-2100.0f, 0.0f, 0.0f));
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
        800.0f,
        6000.0f
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
        -SimState.DepthM * 100.0 + 150.0
    ));
    SetActorRotation(FRotator(0.0f, 90.0f - SimState.HeadingDeg, 0.0f));

    // Presentation fields.
    CurrentDepthM = SimState.DepthM;
    CurrentDepthLayer = DepthLayerName(SimState.DepthLayer);
    CurrentSpeedKt = SimState.SpeedKt;
    CurrentBattery = SimState.Battery;
    CurrentNoise = SimState.Noise;

    // Spin the propeller proportional to speed.
    PropAngle = FMath::Fmod(PropAngle + SimState.SpeedKt * 120.0 * DeltaSeconds, 360.0);
    const FQuat BaseYaw(FRotator(0.0f, -90.0f, 0.0f));
    const FQuat SpinY(FVector(0.0f, 1.0f, 0.0f), FMath::DegreesToRadians(PropAngle));
    Propeller->SetRelativeRotation((BaseYaw * SpinY).Rotator());

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
