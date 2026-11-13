import type { Directive } from "vue";

/**
 * Sets an input's text when the value it is bound to changes, and otherwise leaves it
 * alone. A plain `:value` puts the saved value back every time the component redraws,
 * which wipes whatever someone is in the middle of typing: an earlier save finishing
 * is enough to trigger a redraw.
 */
export const vFieldValue: Directive<HTMLInputElement, string> = {
  mounted(el, binding) {
    el.value = binding.value;
  },
  updated(el, binding) {
    if (binding.value !== binding.oldValue) el.value = binding.value;
  },
};
