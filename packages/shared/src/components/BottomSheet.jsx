// BottomSheet.jsx - Bottom sheet with three snap points (60px / 40vh / 90vh)

import { createSignal, createEffect, onCleanup } from 'solid-js';
import { SpringCard } from './SpringCard';
import { IconClose, IconChevronDown } from './GriddyIcons';

export function BottomSheet({ spring, onClose }) {
  const [isOpen, setIsOpen] = createSignal(true);
  const [snapPoint, setSnapPoint] = createSignal(0); // 0 = closed, 1 = half, 2 = full
  const [isDragging, setIsDragging] = createSignal(false);
  const [dragStart, setDragStart] = createSignal(0);
  const [sheetPosition, setSheetPosition] = createSignal(0);

  const snapPoints = [60, '40vh', '90vh'];

  const handleDragStart = (e) => {
    setIsDragging(true);
    setDragStart(e.clientY || e.touches?.[0]?.clientY);
  };

  const handleDragMove = (e) => {
    if (!isDragging()) return;

    const currentY = e.clientY || e.touches?.[0]?.clientY;
    const delta = dragStart() - currentY;
    const newPosition = Math.min(Math.max(sheetPosition() + delta, 0), 90);

    setSheetPosition(newPosition);
    setDragStart(currentY);
  };

  const handleDragEnd = () => {
    setIsDragging(false);

    const position = sheetPosition();
    if (position < 100) {
      setSnapPoint(0);
      setSheetPosition(0);
    } else if (position < 200) {
      setSnapPoint(1);
      setSheetPosition(40);
    } else {
      setSnapPoint(2);
      setSheetPosition(90);
    }
  };

  createEffect(() => {
    if (isOpen()) {
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
      document.addEventListener('touchmove', handleDragMove);
      document.addEventListener('touchend', handleDragEnd);
    } else {
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
      document.removeEventListener('touchmove', handleDragMove);
      document.removeEventListener('touchend', handleDragEnd);
    }

    onCleanup(() => {
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
      document.removeEventListener('touchmove', handleDragMove);
      document.removeEventListener('touchend', handleDragEnd);
    });
  });

  const handleClose = () => {
    setIsOpen(false);
    setTimeout(() => onClose(), 300);
  };

  const handleSnapPointChange = (index) => {
    setSnapPoint(index);
    setSheetPosition(index === 0 ? 0 : index === 1 ? 40 : 90);
  };

  return (
    <div
      class={`fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ease-out ${
        isOpen() ? 'translate-y-0' : 'translate-y-full'
      }`}
      style={{ height: `${sheetPosition()}vh` }}
    >
      <div class="h-full flex flex-col">
        {/* Drag handle */}
        <div
          class="h-12 flex items-center justify-center cursor-grab active:cursor-grabbing"
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
        >
          <div class="w-12 h-1.5 bg-black/50" />
        </div>

        {/* Sheet content */}
        <div class="flex-1 overflow-y-auto p-6">
          {spring && <SpringCard spring={spring} />}
        </div>

        {/* Close button */}
        <div class="p-4 flex justify-end">
          <button
            onClick={handleClose}
            class="p-2 text-ds-text hover:text-ds-button transition-colors"
          >
            <IconClose className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
