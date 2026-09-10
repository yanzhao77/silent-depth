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

    // Authoritative state (deterministic core), driven by SubmarineStep.
    FSDSubmarineState SimState;
    FSDBalance Balance;

protected:
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

    UPROPERTY(VisibleAnywhere, Category = "SilentDepth")
    UNiagaraComponent* BowFoam;

    UPROPERTY(VisibleAnywhere, Category = "SilentDepth")
    UNiagaraComponent* SternFoam;

    double PropAngle = 0.0;
};
