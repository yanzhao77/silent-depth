#include "UI/TechTree/SDTechTreeWidgetBase.h"

void USDTechTreeWidgetBase::SetViewModel(const SDTechTree::FSDTechTreeViewModel* InViewModel)
{
    ViewModel = InViewModel;
    RebuildFromModel();
}

void USDTechTreeWidgetBase::RebuildFromModel()
{
    RebuildContent();
}

FString USDTechTreeWidgetBase::DescribeState(SDTechTree::ESDNodeRowState State)
{
    switch (State)
    {
    case SDTechTree::ESDNodeRowState::Unlocked:           return TEXT("已解锁");
    case SDTechTree::ESDNodeRowState::Available:          return TEXT("可研究");
    case SDTechTree::ESDNodeRowState::Unaffordable:       return TEXT("研究点不足");
    case SDTechTree::ESDNodeRowState::PrerequisiteLocked: return TEXT("前置不足");
    case SDTechTree::ESDNodeRowState::Excluded:           return TEXT("互斥");
    case SDTechTree::ESDNodeRowState::TierLocked:         return TEXT("层阶未开放");
    case SDTechTree::ESDNodeRowState::UnknownNode:
    default:                                              return TEXT("未知节点");
    }
}

FString USDTechTreeWidgetBase::DescribeBadges(const SDTechTree::FSDNodeRow& Row)
{
    TArray<FString> Badges;
    if (Row.bDatabaseOnly)
    {
        Badges.Add(TEXT("仅数据库·不建模型"));
    }
    if (Row.bEvidenceUnknown)
    {
        Badges.Add(TEXT("资料未知"));
    }
    if (Row.bAssetNotVerified)
    {
        Badges.Add(TEXT("资产未验证"));
    }
    if (Badges.Num() == 0)
    {
        return FString();
    }
    return FString::Printf(TEXT("［%s］"), *FString::Join(Badges, TEXT("］［")));
}

FString USDTechTreeWidgetBase::DisplayNameOf(const SDTechTree::FSDNodeRow& Row)
{
    if (!Row.DisplayName.IsEmpty())
    {
        return Row.DisplayName;
    }
    if (!Row.DisplayNameZh.IsEmpty())
    {
        return Row.DisplayNameZh;
    }
    return Row.NodeId;
}

FString USDTechTreeWidgetBase::DescribeCategory(const ESDTechCategory Category)
{
    switch (Category)
    {
    case ESDTechCategory::Submarine:  return TEXT("潜艇");
    case ESDTechCategory::Weapon:     return TEXT("武器");
    case ESDTechCategory::Sensor:     return TEXT("传感器");
    case ESDTechCategory::Defensive:  return TEXT("防御");
    case ESDTechCategory::Propulsion: return TEXT("推进");
    default:                          return TEXT("未知分类");
    }
}

FString USDTechTreeWidgetBase::DescribeCompatibility(const ESDCompatibility Compatibility)
{
    switch (Compatibility)
    {
    case ESDCompatibility::Confirmed:    return TEXT("已确认（公开资料）");
    case ESDCompatibility::Probable:     return TEXT("较可能（公开资料）");
    case ESDCompatibility::Gameplay:     return TEXT("游戏化设定");
    case ESDCompatibility::Incompatible: return TEXT("不兼容");
    case ESDCompatibility::Unknown:
    default:                             return TEXT("资料不足（UNKNOWN）");
    }
}
