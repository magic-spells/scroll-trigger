import ScrollTrigger from "./scroll-trigger.js";
import { observeCross } from "./observe-cross.js";

/**
 * UMD entry point.
 *
 * The global stays the ScrollTrigger class itself - rollup's named-exports mode
 * would replace it with a namespace object and break every `new ScrollTrigger()`
 * on a script tag - so the standalone helper hangs off the class instead.
 */
ScrollTrigger.observeCross = observeCross;

export default ScrollTrigger;
