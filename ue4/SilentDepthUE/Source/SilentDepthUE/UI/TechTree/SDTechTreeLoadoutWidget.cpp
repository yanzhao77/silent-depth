#include "UI/TechTree/SDTechTreeLoadoutWidget.h"

#include "Components/VerticalBox.h"
#include "Core/TechTree/TechTreeEquipmentService.h"

using namespace SDTechTree;

void USDTechTreeLoadoutWidget::SetPlatform(const FString& InPlatformId)
{
    PlatformId = InPlatformId;
    RebuildFromModel();
}

void USDTechTreeLoadoutWidget::SetPolicy(ESDEquipPolicy InPolicy)
{
    Policy = InPolicy;
    RebuildFromModel();
}

void USDTechTreeLoadoutWidget::SetAccount(const FSDResearchAccount& InAccount)
{
    Account = InAccount;
    RebuildFromModel();
}

void USDTechTreeLoadoutWidget::SetFittedSlots(const TMap<FString, FString>& InFitted)
{
    Fitted = InFitted;
    RebuildFromModel();
}

void USDTechTreeLoadoutWidget::BuildContent(UVerticalBox& Content)
{
    if (ViewModel == nullptr || !ViewModel->IsInitialized())
    {
        AddLine(Content, TEXT("科技树数据未加载，配装界面保持为空（失败关闭）。"));
        return;
    }
    if (PlatformId.IsEmpty())
    {
        AddLine(Content, TEXT("未选择平台。"));
        return;
    }

    const FSDEquipmentService& Equipment = ViewModel->GetEquipment();
    TArray<const FSDEquipmentSlot*> Slots;
    Equipment.CollectSlots(PlatformId, Slots);
    if (Slots.Num() == 0)
    {
        AddLine(Content, FString::Printf(TEXT("平台 %s 没有安装位定义。"), *PlatformId));
        return;
    }

    AddLine(Content, FString::Printf(
        TEXT("平台 %s · 策略 %s · 安装位 %d"),
        *PlatformId,
        Policy == ESDEquipPolicy::AllowGameplay ? TEXT("允许游戏化配发") : TEXT("仅公开资料"),
        Slots.Num()));

    for (const FSDEquipmentSlot* SlotDefinition : Slots)
    {
        BuildSlot(Content, *SlotDefinition);
    }
    BuildCapabilities(Content);
}

void USDTechTreeLoadoutWidget::BuildSlot(UVerticalBox& Content, const FSDEquipmentSlot& SlotDefinition)
{
    const FSDEquipmentService& Equipment = ViewModel->GetEquipment();
    const int32 Capacity = Equipment.GetSlotSocketCapacity(PlatformId, SlotDefinition.SlotName);
    const FString* FittedCandidate = Fitted.Find(SlotDefinition.SlotName);

    FString Header = FString::Printf(
        TEXT("槽位 %s（%s）"), *SlotDefinition.SlotName, SlotDefinition.bRequired ? TEXT("必需") : TEXT("可选"));
    Header += SlotDefinition.SocketName.IsEmpty()
        ? FString(TEXT(" · 艇内设备，无挂点占用"))
        : FString::Printf(TEXT(" · 挂点 %s · 容量 %d"), *SlotDefinition.SocketName, Capacity);
    Header += FittedCandidate != nullptr
        ? FString::Printf(TEXT(" · 已装 %s"), **FittedCandidate)
        : FString(TEXT(" · 未装"));
    AddRowButton(Content, Header, FString::Printf(TEXT("SLOT:%s"), *SlotDefinition.SlotName));

    // DEC-008: slots sharing a socket compete when the socket fits fewer slots
    // than it carries. When both are filled the save validator will refuse the
    // loadout, so the screen says so before the player commits.
    TArray<FString> Peers;
    Equipment.CollectSocketPeers(PlatformId, SlotDefinition.SlotName, Peers);
    if (Peers.Num() > 0 && Capacity > 0 && Capacity < Peers.Num() + 1)
    {
        AddLine(Content, FString::Printf(
            TEXT("      与 %s 互斥：同一挂点 %s 容量 %d，只能填一个。"),
            *FString::Join(Peers, TEXT("、")), *SlotDefinition.SocketName, Capacity));

        const bool bPeerFilled = FittedCandidate != nullptr && [&]
        {
            for (const FString& Peer : Peers)
            {
                if (Fitted.Contains(Peer))
                {
                    return true;
                }
            }
            return false;
        }();
        if (bPeerFilled)
        {
            AddLine(Content, TEXT("      当前配装超出挂点容量，存档校验会拒绝（SOCKET_CAPACITY_EXCEEDED）。"));
        }
    }

    TArray<FSDEquipmentRow> Rows;
    ViewModel->BuildEquipmentRows(PlatformId, SlotDefinition.SlotName, Account, Policy, Rows);
    if (Rows.Num() == 0)
    {
        AddLine(Content, TEXT("      没有可装配的候选：矩阵没有允许项，或对应资产尚未产出。"));
    }
    for (const FSDEquipmentRow& Row : Rows)
    {
        FString Line = FString::Printf(
            TEXT("      候选 %s · %s · 成本 %d%s"),
            *Row.CandidateId,
            *DescribeCompatibility(Row.Compatibility),
            Row.Cost,
            Row.bUnlocked ? TEXT(" · 已解锁") : TEXT(""));
        if (Row.bGameplayOnly)
        {
            Line += TEXT(" · 游戏化配发：非公开事实，界面不得当作实测资料");
        }
        AddRowButton(Content, Line, FString::Printf(TEXT("CAND:%s:%s"), *SlotDefinition.SlotName, *Row.CandidateId));
    }
}

void USDTechTreeLoadoutWidget::BuildCapabilities(UVerticalBox& Content)
{
    const FSDEquipmentService& Equipment = ViewModel->GetEquipment();

    TArray<const FSDFamilyCapability*> Capabilities;
    Equipment.CollectFamilyCapabilities(PlatformId, Capabilities);
    if (Capabilities.Num() > 0)
    {
        AddLine(Content, FString::Printf(
            TEXT("能力层（%d）：该平台有能力判定，但没有对应的装备资产，不可装配。"),
            Capabilities.Num()));
        for (const FSDFamilyCapability* Capability : Capabilities)
        {
            AddLine(Content, FString::Printf(
                TEXT("      %s · %s · %s · 层阶 %s"),
                *Capability->FamilyId,
                *Capability->FamilyLabel,
                *DescribeCompatibility(Capability->Compatibility),
                ToString(Capability->TierMin)));
        }
    }

    TArray<FString> Pending;
    Equipment.CollectPendingCandidates(PlatformId, Pending);
    for (const FString& CandidateId : Pending)
    {
        AddLine(Content, FString::Printf(
            TEXT("      声明存在但资产未产出：%s（可以显示，不可装配）"), *CandidateId));
    }
}
