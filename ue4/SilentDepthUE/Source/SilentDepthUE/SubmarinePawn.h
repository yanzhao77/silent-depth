#pragma once

#include "CoreMinimal.h"
#include "Core/Balance.h"
#include "Core/SubmarineCore.h"
#include "GameFramework/Pawn.h"
#include "SubmarinePawn.generated.h"

class UStaticMeshComponent;
class USpringArmComponent;
class UCameraComponent;
class USceneComponent;
class UNiagaraComponent;

UCLASS()
class SILENTDEPTHUE_API ASubmarinePawn : public APawn
{
    GENERATED_BODY()

public:
    ASubmarinePawn();

    virtual void BeginPlay() override;
    virtual void Tick(float DeltaSeconds) override;
    virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;

    // Read-only presentation fields fed from the deterministic simulation.
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "SilentDepth")
    float CurrentDepthM = 0.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "SilentDepth")
    FString CurrentDepthLayer = TEXT("Surface");

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "SilentDepth")
    float CurrentSpeedKt = 0.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "SilentDepth")
    float CurrentBattery = 0.0f;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "SilentDepth")
    float CurrentNoise = 0.0f;

    // SUB-001: which hull the pawn resolved, and whether it had to substitute
    // the documented fallback because the requested platform has no imported
    // assets. Read-only presentation facts; the simulation never reads them.
    UPROPERTY(BlueprintReadOnly, Category = "SilentDepth")
    FString EquippedPlatformId;

    UPROPERTY(BlueprintReadOnly, Category = "SilentDepth")
    bool bUsedFallbackAssets = false;

    // PROP-001 / DEF-001 / SNS-001: what the fitted equipment contributes. The
    // simulation reads PropulsionEffects; the rest is read-only presentation.
    FSDPropulsionEffects PropulsionEffects;
    FSDEffectiveCapabilities Capabilities;

    // Authoritative state (deterministic core), driven by SubmarineStep.
    FSDSubmarineState SimState;
    FSDBalance Balance;

protected:
    /** Reads the save slot once; empty result means nothing has been saved. */
    bool ReadSaveData(SDTechTree::FSDTechTreeSaveData& OutData) const;

    /** Applies the imported assets of a platform id. */
    void ResolveAndApplyPlatformAssets(const FString& RequestedPlatform);

    /** Turns the fitted equipment into typed effects (PROP/DEF/SNS-001). */
    void ResolveEquipmentCapabilities(const TArray<SDTechTree::FSDLoadoutAssignment>& Loadouts);

    /** Recomputes camera arm, wake anchors and zoom limits from hull bounds. */
    void ApplyHullLayout(const FVector& HullExtent);

    /**
     * Assigns one part asset, or hides the component when there is none. When
     * the platform table gives a pivot for this part the component is placed
     * there; otherwise its constructor offset stands.
     */
    void ApplyPart(UStaticMeshComponent* Component, const FString& AssetPath,
                   const FSDVec3* OffsetCm = nullptr);

    void ThrottleAxis(float Val);
    void RudderAxis(float Val);
    void DepthAxisInput(float Val);
    void ZoomAxis(float Val);

    float ThrottleValue = 0.0f;
    float RudderValue = 0.0f;
    float DepthValue = 0.0f;
    float ZoomValue = 0.0f;

    double StepAccumulator = 0.0;
    FSDPlayerInputs SimInputs;

    UPROPERTY(VisibleAnywhere, Category = "SilentDepth")
    USceneComponent* SceneRoot;

    UPROPERTY(VisibleAnywhere, Category = "SilentDepth")
    UStaticMeshComponent* MeshComp;

    UPROPERTY(VisibleAnywhere, Category = "SilentDepth")
    USpringArmComponent* SpringArm;

    UPROPERTY(VisibleAnywhere, Category = "SilentDepth")
    UCameraComponent* Camera;

    UPROPERTY(VisibleAnywhere, Category = "SilentDepth")
    UStaticMeshComponent* Propeller;

    // Movable control surfaces. Each asset is exported with its pivot on the
    // hinge axis, so the component only has to sit on that hinge and rotate.
    UPROPERTY(VisibleAnywhere, Category = "SilentDepth")
    UStaticMeshComponent* Rudder;

    UPROPERTY(VisibleAnywhere, Category = "SilentDepth")
    UStaticMeshComponent* SternPlanes;

    UPROPERTY(VisibleAnywhere, Category = "SilentDepth")
    UStaticMeshComponent* BowPlanes;

    // Tall thin mast: raised at periscope depth, stowed otherwise.
    UPROPERTY(VisibleAnywhere, Category = "SilentDepth")
    UStaticMeshComponent* Periscope;

    UPROPERTY(VisibleAnywhere, Category = "SilentDepth")
    UNiagaraComponent* BowFoam;

    UPROPERTY(VisibleAnywhere, Category = "SilentDepth")
    UNiagaraComponent* SternFoam;

    // Presentation-only layout derived from the equipped hull's bounds, so the
    // camera rig, wake emitters and propeller follow whichever submarine is
    // equipped instead of assuming one specific hull length.
    float HullHalfLengthCm = 1800.0f;
    float SurfaceOffsetZCm = 150.0f;
    float ZoomMinCm = 800.0f;
    float ZoomMaxCm = 6000.0f;
    float ZoomStepCm = 200.0f;

    double PropAngle = 0.0;
    float RudderAngleDeg = 0.0f;
    float PlaneAngleDeg = 0.0f;
    float PeriscopeExtend = 0.0f;
};
