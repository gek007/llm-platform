import type { Slide as SlideData } from "../../../convex/lib/engineTypes";
import { SLIDE_LAYOUT_COMPONENTS } from "./slide-layouts";
import { SlideStage } from "./slide-stage";

/**
 * One slide, drawn from its data: the stage (fixed frame, auto-scaling) and the component of the
 * slide's layout. Used by the deck viewer and by the admin deck editor's preview.
 */
export function Slide({ slide }: { slide: SlideData }) {
  // A deck saved by a newer version may name a layout this build does not know: show its bullets.
  const Layout = SLIDE_LAYOUT_COMPONENTS[slide.layout] ?? SLIDE_LAYOUT_COMPONENTS.bullets;
  return (
    <SlideStage slideId={slide.id}>
      <Layout slide={slide} />
    </SlideStage>
  );
}
