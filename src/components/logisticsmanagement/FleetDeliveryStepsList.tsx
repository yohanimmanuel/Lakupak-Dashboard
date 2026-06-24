'use client';

import React, { useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { useLogisticsTranslations } from '@/hooks/useLogisticsTranslations';
import type { AssignedOrder } from './FleetOrderSelection';

interface FleetDeliveryStepsListProps {
  items: AssignedOrder[];
  completedIds?: Set<string>;
  onReorder: (items: AssignedOrder[]) => void;
  onToggleComplete?: (orderId: string) => void;
  showCompletion?: boolean;
}

function reorderItems<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [removed] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, removed);
  return next;
}

export default function FleetDeliveryStepsList({
  items,
  completedIds,
  onReorder,
  onToggleComplete,
  showCompletion = false,
}: FleetDeliveryStepsListProps) {
  const { tDeliverySteps, tShared } = useLogisticsTranslations();
  const dragIndexRef = useRef<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (items.length === 0) return null;

  const handleDragStart = (index: number) => {
    dragIndexRef.current = index;
  };

  const handleDrop = (toIndex: number) => {
    const fromIndex = dragIndexRef.current;
    dragIndexRef.current = null;
    setHoverIndex(null);
    if (fromIndex == null || fromIndex === toIndex) return;
    onReorder(reorderItems(items, fromIndex, toIndex));
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? index - 1 : index + 1;
    if (toIndex < 0 || toIndex >= items.length) return;
    onReorder(reorderItems(items, index, toIndex));
  };

  const handleGripKeyDown = (index: number, e: React.KeyboardEvent<HTMLButtonElement>) => {
    const withModifier = e.altKey || e.metaKey;
    if (!withModifier) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleMove(index, 'up');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleMove(index, 'down');
    }
  };

  return (
    <ul className="space-y-2" role="list">
      {items.map((item, index) => {
        const isCompleted = completedIds?.has(item.orderId) ?? false;
        return (
          <li
            key={item.orderId}
            role="listitem"
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragEnter={() => setHoverIndex(index)}
            onDragLeave={() => setHoverIndex((prev) => (prev === index ? null : prev))}
            onDragEnd={() => {
              dragIndexRef.current = null;
              setHoverIndex(null);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(index)}
            className={`flex items-center gap-3 py-2.5 px-2 border rounded-lg transition-colors ${
              hoverIndex === index ? 'border-[#0a61d7] bg-blue-50/60' : 'border-gray-100 bg-white'
            }`}
          >
            <button
              type="button"
              className="text-gray-400 hover:text-[#0a61d7] cursor-grab active:cursor-grabbing shrink-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0a61d7] focus-visible:ring-offset-1"
              aria-label={tDeliverySteps('reorderHandle', { index: index + 1 })}
              onKeyDown={(e) => handleGripKeyDown(index, e)}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <GripVertical className="w-4 h-4" />
            </button>

            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                isCompleted ? 'bg-emerald-500 text-white' : 'bg-[#0a61d7] text-white'
              }`}
              aria-label={tDeliverySteps('step', { index: index + 1 })}
            >
              {isCompleted ? '✓' : index + 1}
            </span>

            {showCompletion && onToggleComplete && (
              <button
                type="button"
                onClick={() => onToggleComplete(item.orderId)}
                className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center shrink-0 ${
                  isCompleted
                    ? 'bg-green-500 border-green-500'
                    : 'bg-white border-gray-300 hover:border-green-400'
                }`}
              >
                {isCompleted && (
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            )}

            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-900 truncate">{item.orderId}</p>
              <p className="text-xs text-gray-600 truncate">{item.storeName || tShared('notApplicable')}</p>
            </div>

            {item.totalAmount != null && item.totalAmount > 0 && (
              <span className="text-xs font-semibold text-[#0a61d7] shrink-0">
                IDR {Number(item.totalAmount).toLocaleString()}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
