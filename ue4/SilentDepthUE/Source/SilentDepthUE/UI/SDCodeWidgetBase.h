#pragma once

#include "CoreMinimal.h"

#include "Blueprint/UserWidget.h"

#include "SDCodeWidgetBase.generated.h"

class UButton;
class UScrollBox;
class UTextBlock;
class UVerticalBox;
class UWidgetTree;

/**
 * Shared plumbing for the code-authored screens.
 *
 * The screens are built in C++ rather than in a `.umg` because the headless
 * editor can create a WidgetBlueprint asset but cannot populate its widget tree,
 * so a blueprint would need a human in the editor. A native user widget gets a
 * transient tree and can build itself, which keeps the screens runnable and
 * assertable without one.
 *
 * Subclasses only read their model and call AddLine / AddRowButton, which also
 * records what was rendered so a test can assert the screen without a viewport.
 */
UCLASS(Abstract)
class SILENTDEPTHUE_API USDCodeWidgetBase : public UUserWidget
{
    GENERATED_BODY()

public:
    /** Rebuilds every child widget. Idempotent and safe before a model exists. */
    void RebuildContent();

    /** Ids of the rows the last rebuild produced, in display order. */
    const TArray<FString>& GetRenderedRowIds() const { return RenderedRowIds; }

    /** Every line the last rebuild produced, in display order. */
    const TArray<FString>& GetRenderedLines() const { return RenderedLines; }

    /** True when any rendered line contains the token, for tests and callers. */
    bool HasRenderedLineContaining(const FString& Token) const;

protected:
    virtual TSharedRef<SWidget> RebuildWidget() override;

    /** Subclasses add their screen here. */
    virtual void BuildContent(UVerticalBox& Content) {}

    /** The transient tree a native user widget owns. */
    UWidgetTree& EnsureTree();

    /** A wrapped label; every line is also recorded for tests. */
    UTextBlock* AddLine(UVerticalBox& Parent, const FString& Text);

    /** A focusable row entry, so the screens stay keyboard-navigable. */
    UButton* AddRowButton(UVerticalBox& Parent, const FString& Label, const FString& RowId);

private:
    UPROPERTY(Transient)
    UScrollBox* RootScroll = nullptr;

    UPROPERTY(Transient)
    UVerticalBox* ContentBox = nullptr;

    TArray<FString> RenderedRowIds;
    TArray<FString> RenderedLines;
};
