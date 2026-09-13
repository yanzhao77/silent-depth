#include "UI/TechTree/SDTechTreeOverviewWidget.h"

#include "Components/VerticalBox.h"

using namespace SDTechTree;

void USDTechTreeOverviewWidget::SetCategory(ESDTechCategory InCategory)
{
    Category = InCategory;
    RebuildFromModel();
}

void USDTechTreeOverviewWidget::SetAccount(const FSDResearchAccount& InAccount)
{
    Account = InAccount;
    RebuildFromModel();
}

void USDTechTreeOverviewWidget::BuildContent(UVerticalBox& Content)
{
    RenderedScreen = FSDTechTreeScreen();

    if (ViewModel == nullptr || !ViewModel->IsInitialized())
    {
        // Fail closed: no model, no rows, and the reason is on screen.
        AddLine(Content, TEXT("科技树数据未加载，界面保持为空（失败关闭）。"));
        return;
    }

    ViewModel->BuildScreen(Category, Account, RenderedScreen);

    AddLine(Content, FString::Printf(
        TEXT("研究点 %d · 当前分类 %s（%s）"),
        RenderedScreen.ResearchPoints,
        *DescribeCategory(RenderedScreen.SelectedCategory),
        ToString(RenderedScreen.SelectedCategory)));

    for (const FSDCategoryTab& Tab : RenderedScreen.Tabs)
    {
        AddRowButton(Content, FString::Printf(
            TEXT("分类 %s · 节点 %d · 已解锁 %d · 可研究 %d · 未开放 %d · 仅数据库 %d"),
            *DescribeCategory(Tab.Category),
            Tab.TotalNodes,
            Tab.UnlockedCount,
            Tab.AvailableCount,
            Tab.LockedCount,
            Tab.DatabaseOnlyCount),
            FString::Printf(TEXT("TAB:%s"), ToString(Tab.Category)));
    }

    // Tier sections stay contiguous: every tier prints its header and then the
    // rows the model put in it, in the model's (tier, id) order.
    for (const FSDTierRow& Tier : RenderedScreen.Tiers)
    {
        AddRowButton(Content, FString::Printf(
            TEXT("层阶 %s · %s · 节点 %d · 已解锁 %d"),
            ToString(Tier.Tier),
            *Tier.LabelZh,
            Tier.NodeCount,
            Tier.UnlockedCount),
            FString::Printf(TEXT("TIER:%s:%s"),
                ToString(RenderedScreen.SelectedCategory), ToString(Tier.Tier)));

        for (const FSDNodeRow& Row : RenderedScreen.Rows)
        {
            if (Row.Tier == Tier.Tier)
            {
                BuildNodeRow(Content, Row);
            }
        }
    }
}

void USDTechTreeOverviewWidget::BuildNodeRow(UVerticalBox& Content, const FSDNodeRow& Row)
{
    FString Label = FString::Printf(
        TEXT("    节点 %s · %s · 成本 %d"),
        *DisplayNameOf(Row),
        *DescribeState(Row.State),
        Row.Cost);

    if (Row.State == ESDNodeRowState::Available || Row.State == ESDNodeRowState::Unaffordable)
    {
        Label += Row.bAffordable ? TEXT(" · 可负担") : TEXT(" · 余额不足");
    }
    if (!Row.BlockingNodeId.IsEmpty())
    {
        Label += FString::Printf(TEXT(" · 阻塞于 %s"), *Row.BlockingNodeId);
    }

    const FString Badges = DescribeBadges(Row);
    if (!Badges.IsEmpty())
    {
        Label += TEXT(" ") + Badges;
    }

    AddRowButton(Content, Label, Row.NodeId);
}
