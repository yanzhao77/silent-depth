#include "UI/TechTree/SDTechNodeDetailWidget.h"

#include "Components/VerticalBox.h"

using namespace SDTechTree;

void USDTechNodeDetailWidget::SetRow(const FSDNodeRow& InRow)
{
    Row = InRow;
    bHasRow = true;
    RebuildFromModel();
}

void USDTechNodeDetailWidget::ClearRow()
{
    Row = FSDNodeRow();
    bHasRow = false;
    RebuildFromModel();
}

void USDTechNodeDetailWidget::BuildContent(UVerticalBox& Content)
{
    if (!bHasRow)
    {
        AddLine(Content, TEXT("未选择节点。"));
        return;
    }

    AddLine(Content, FString::Printf(TEXT("%s（%s）"), *DisplayNameOf(Row), *Row.NodeId));
    AddLine(Content, FString::Printf(
        TEXT("分类 %s · 层阶 %s · 成本 %d · 状态 %s"),
        ToString(Row.Category),
        ToString(Row.Tier),
        Row.Cost,
        *DescribeState(Row.State)));

    if (!Row.Country.IsEmpty() || !Row.Era.IsEmpty() || !Row.RoleText.IsEmpty())
    {
        AddLine(Content, FString::Printf(
            TEXT("国家 %s · 年代 %s · 角色 %s"),
            Row.Country.IsEmpty() ? TEXT("资料未记录") : *Row.Country,
            Row.Era.IsEmpty() ? TEXT("资料未记录") : *Row.Era,
            Row.RoleText.IsEmpty() ? TEXT("资料未记录") : *Row.RoleText));
    }

    switch (Row.State)
    {
    case ESDNodeRowState::PrerequisiteLocked:
        AddLine(Content, FString::Printf(TEXT("需要先研究：%s"), *Row.BlockingNodeId));
        break;
    case ESDNodeRowState::Excluded:
        AddLine(Content, FString::Printf(TEXT("与已解锁的 %s 互斥，只能保留一个。"), *Row.BlockingNodeId));
        break;
    case ESDNodeRowState::TierLocked:
        AddLine(Content, TEXT("该层阶尚未开放：需要先在同类别的下层阶完成研究。"));
        break;
    case ESDNodeRowState::Unaffordable:
        AddLine(Content, FString::Printf(TEXT("研究点不足：需要 %d。"), Row.Cost));
        break;
    case ESDNodeRowState::Unlocked:
        AddLine(Content, TEXT("已解锁。"));
        break;
    case ESDNodeRowState::Available:
        AddLine(Content, TEXT("可研究。"));
        break;
    case ESDNodeRowState::UnknownNode:
    default:
        AddLine(Content, TEXT("模型里没有这个节点的状态。"));
        break;
    }

    const FString Badges = DescribeBadges(Row);
    AddLine(Content, Badges.IsEmpty() ? TEXT("标注：无。") : FString::Printf(TEXT("标注：%s"), *Badges));
    if (Row.bDatabaseOnly)
    {
        AddLine(Content, TEXT("仅数据库条目：不制作工程模型；装配与界面照常可用（DEC-001）。"));
    }
    if (Row.bEvidenceUnknown)
    {
        AddLine(Content, TEXT("公开资料不足：数值不推测，按 UNKNOWN 处理。"));
    }
    if (Row.bAssetNotVerified)
    {
        AddLine(Content, TEXT("资产未验证：表现层必须走程序化回退，不得因此改变玩法数值。"));
    }

    AddLine(Content, Row.PrerequisiteNodeIds.Num() == 0
        ? TEXT("前置：无")
        : FString::Printf(TEXT("前置：%s"), *FString::Join(Row.PrerequisiteNodeIds, TEXT("、"))));
    AddLine(Content, Row.DependentNodeIds.Num() == 0
        ? TEXT("后继：无")
        : FString::Printf(TEXT("后继：%s"), *FString::Join(Row.DependentNodeIds, TEXT("、"))));
    AddLine(Content, Row.SocketNames.Num() == 0
        ? TEXT("挂点：无（或尚未绑定）")
        : FString::Printf(TEXT("挂点：%s"), *FString::Join(Row.SocketNames, TEXT("、"))));
}
