'use client';

import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { categoriesMap } from '@/lib/types';
import type { MainCategory } from '@/lib/types';
import { ListFilter } from 'lucide-react';

interface CategoryFilterProps {
  selectedCategory: MainCategory | 'all';
  onSelectCategory: (category: MainCategory | 'all') => void;
}

export function CategoryFilter({ selectedCategory, onSelectCategory }: CategoryFilterProps) {
  const allCategories = [{ id: 'all', label: 'Tous', icon: ListFilter }, ...Object.entries(categoriesMap).map(([id, { label, icon }]) => ({ id, label, icon }))];

  return (
    <div className="w-full">
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex w-max space-x-2 p-1">
          {allCategories.map((category) => {
            const Icon = category.icon;
            return (
              <Button
                key={category.id}
                variant={selectedCategory === category.id ? 'default' : 'outline'}
                size="sm"
                className="h-9 rounded-full px-4"
                onClick={() => onSelectCategory(category.id as MainCategory | 'all')}
              >
                <Icon className="mr-2 h-4 w-4" />
                {category.label}
              </Button>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" className="h-2" />
      </ScrollArea>
    </div>
  );
}
