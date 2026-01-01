// src/app/pois/new/page.tsx
import { POIForm } from '@/components/poi/poi-form';

export default function NewPOIPage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Create a New Point of Interest</h1>
      <POIForm />
    </div>
  );
}
