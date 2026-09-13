#include "UI/SDCodeWidgetBase.h"

#include "Blueprint/WidgetTree.h"
#include "Components/Button.h"
#include "Components/ScrollBox.h"
#include "Components/TextBlock.h"
#include "Components/VerticalBox.h"

UWidgetTree& USDCodeWidgetBase::EnsureTree()
{
    if (WidgetTree == nullptr)
    {
        // A native user widget has no blueprint tree; Initialize() creates the
        // transient one this class fills in.
        Initialize();
    }
    check(WidgetTree != nullptr);
    return *WidgetTree;
}

void USDCodeWidgetBase::RebuildContent()
{
    RenderedRowIds.Reset();
    RenderedLines.Reset();

    UWidgetTree& Tree = EnsureTree();
    if (ContentBox == nullptr)
    {
        RootScroll = Tree.ConstructWidget<UScrollBox>();
        ContentBox = Tree.ConstructWidget<UVerticalBox>();
        RootScroll->AddChild(ContentBox);
        Tree.RootWidget = RootScroll;
    }
    ContentBox->ClearChildren();
    BuildContent(*ContentBox);
}

UTextBlock* USDCodeWidgetBase::AddLine(UVerticalBox& Parent, const FString& Text)
{
    UTextBlock* Line = WidgetTree->ConstructWidget<UTextBlock>();
    Line->SetText(FText::FromString(Text));
    // Nothing sets a fixed width and every line wraps, so a narrow viewport
    // truncates no state or caveat.
    Line->SetAutoWrapText(true);
    Parent.AddChildToVerticalBox(Line);
    RenderedLines.Add(Text);
    return Line;
}

UButton* USDCodeWidgetBase::AddRowButton(
    UVerticalBox& Parent,
    const FString& Label,
    const FString& RowId)
{
    UButton* Row = WidgetTree->ConstructWidget<UButton>();
    UTextBlock* RowLabel = WidgetTree->ConstructWidget<UTextBlock>();
    RowLabel->SetText(FText::FromString(Label));
    RowLabel->SetAutoWrapText(true);
    Row->AddChild(RowLabel);
    Parent.AddChildToVerticalBox(Row);
    RenderedLines.Add(Label);
    RenderedRowIds.Add(RowId);
    return Row;
}

bool USDCodeWidgetBase::HasRenderedLineContaining(const FString& Token) const
{
    for (const FString& Line : RenderedLines)
    {
        if (Line.Contains(Token))
        {
            return true;
        }
    }
    return false;
}

TSharedRef<SWidget> USDCodeWidgetBase::RebuildWidget()
{
    RebuildContent();
    return Super::RebuildWidget();
}
