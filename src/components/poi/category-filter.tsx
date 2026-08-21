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
    <div className="w-full overflow-x-auto relative z-20 bg-background">
      <div className="flex gap-2 p-2 min-w-max">
        {allCategories.map((category) => {
          const Icon = category.icon;

          return (
            <Button
              key={category.id}
              variant={
                selectedCategoryId === category.id ? 'default' : 'outline'
              }
              size="sm"
              className="h-9 rounded-full px-4 whitespace-nowrap"
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
