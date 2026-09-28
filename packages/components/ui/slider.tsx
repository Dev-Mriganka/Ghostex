import { Slider as SliderPrimitive } from '@base-ui/react/slider';
import * as React from 'react';

import { cn } from '../utils';

type SliderValue = number[];

type SliderProps = Omit<SliderPrimitive.Root.Props, 'defaultValue' | 'onValueChange' | 'onValueCommitted' | 'value'> & {
  defaultValue?: SliderValue;
  onValueChange?: (value: SliderValue) => void;
  onValueCommit?: (value: SliderValue) => void;
  onValueCommitted?: (value: SliderValue) => void;
  value?: SliderValue;
};

function toSliderValues(value: number | readonly number[]): SliderValue {
  return typeof value === 'number' ? [value] : [...value];
}

/**
 * CDXC:DesignSystem 2026-09-28 WHY: Base UI (1.5 through 1.8) places an edge-aligned thumb only when it mounts or its value changes. Its own ResizeObserver never starts, because the thumb's layout effect runs before the Control's ref is attached, so a slider that first lays out in a zero-width lane (a page laid out before its window had a size, as the Settings window did on Windows) keeps its thumb and fill hidden for good. Remounting the thumbs when the control's size changes makes Base UI measure them again; it waits while the thumb is focused or dragged so a resize never drops focus or a drag.
 */
function useThumbRemountKey(controlRef: React.RefObject<HTMLDivElement | null>): number {
  const [generation, setGeneration] = React.useState(0);

  React.useLayoutEffect(() => {
    const control = controlRef.current;
    if (!control) {
      return undefined;
    }
    let measuredSize = `${control.offsetWidth}x${control.offsetHeight}`;
    const observer = new ResizeObserver(() => {
      const size = `${control.offsetWidth}x${control.offsetHeight}`;
      if (
        size === measuredSize ||
        control.hasAttribute('data-dragging') ||
        control.contains(control.ownerDocument.activeElement)
      ) {
        return;
      }
      measuredSize = size;
      setGeneration((current) => current + 1);
    });
    observer.observe(control);
    return () => observer.disconnect();
  }, [controlRef]);

  return generation;
}

function Slider({
  className,
  defaultValue,
  value,
  onValueChange,
  onValueCommit,
  onValueCommitted,
  min = 0,
  max = 100,
  ...props
}: SliderProps) {
  const _values = Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max];
  const controlRef = React.useRef<HTMLDivElement>(null);
  const thumbGeneration = useThumbRemountKey(controlRef);

  return (
    <SliderPrimitive.Root
      className={cn('data-horizontal:w-full data-vertical:h-full', className)}
      data-slot='slider'
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      onValueChange={onValueChange ? (nextValue) => onValueChange(toSliderValues(nextValue)) : undefined}
      onValueCommitted={
        onValueCommit || onValueCommitted
          ? (nextValue) => {
              const values = toSliderValues(nextValue);
              onValueCommit?.(values);
              onValueCommitted?.(values);
            }
          : undefined
      }
      thumbAlignment='edge'
      {...props}
    >
      <SliderPrimitive.Control
        ref={controlRef}
        className='relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col'
      >
        <SliderPrimitive.Track
          data-slot='slider-track'
          className='relative grow overflow-hidden rounded-none bg-input/90 select-none data-horizontal:h-1 data-horizontal:w-full data-vertical:h-full data-vertical:w-1'
        >
          <SliderPrimitive.Indicator
            data-slot='slider-range'
            className='bg-primary select-none data-horizontal:h-full data-vertical:w-full'
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot='slider-thumb'
            key={`${index}-${thumbGeneration}`}
            className='block size-4 shrink-0 rounded-none bg-white shadow-md ring-1 ring-black/10 transition-[color,box-shadow] duration-200 select-none not-dark:bg-clip-padding hover:ring-4 hover:ring-ring/30 focus-visible:ring-4 focus-visible:ring-ring/20 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50'
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
