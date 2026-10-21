'use client';

import { Button } from '@/components/ui/button';
import type { EventPoiCategory } from '@/lib/types';
import { resolveCategoryIcon } from '@/lib/event-poi-categories';
import { ListFilter } from 'lucide-react';

interface CategoryFilterProps {
  categories: EventPoiCategory[];
  selectedCategoryId: string | 'all';
  onSelectCategory: (categoryId: string | 'all') => void;
}

export function CategoryFilter({
  categories,
  selectedCategoryId,
  onSelectCategory,
}: CategoryFilterProps) {
  const allCategories = [
    { id: 'all', label: 'Tous', icon: ListFilter },
    ...categories.map((category) => ({
      id: category.id,
      label: category.label,
      icon: resolveCategoryIcon(category.icon),
    })),
  ];

  return (
    <div className="relative z-20 w-full overflow-x-auto bg-violet-50/95 [-webkit-overflow-scrolling:touch]">
      <div className="flex min-w-max gap-2 p-2">
        {allCategories.map((category) => {
          const Icon = category.icon;

          return (
            <Button
              key={category.id}
              variant="outline"
              size="sm"
              aria-pressed={selectedCategoryId === category.id}
              className={
                selectedCategoryId === category.id
                  ? 'h-11 whitespace-nowrap rounded-full border-violet-700 bg-violet-700 px-4 font-semibold text-white shadow-sm hover:bg-violet-800 hover:text-white focus-visible:ring-violet-700'
                  : 'h-11 whitespace-nowrap rounded-full border-violet-200 bg-white px-4 font-medium text-violet-900 shadow-sm hover:bg-violet-100 hover:text-violet-950 focus-visible:ring-violet-700'
              }
              onClick={() =>
                onSelectCategory(category.id)
              }
            >
              <Icon className="mr-2 h-4 w-4" />
              {category.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
