// src/app/pois/page.tsx
import { fetchPois } from '@/lib/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Eye, PlusCircle } from 'lucide-react';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { AppLayout } from '@/components/layout/app-layout';

async function POIsTable() {
  const pois = await fetchPois();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead className="hidden md:table-cell">Description</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pois.map((poi) => (
          <TableRow key={poi.id}>
            <TableCell className="font-medium">{poi.title}</TableCell>
            <TableCell className="hidden md:table-cell truncate max-w-sm">{poi.description}</TableCell>
            <TableCell>
              <Button asChild variant="outline" size="sm">
                <Link href={`/pois/${poi.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}


export default function POIsPage() {
    return (
        <AppLayout>
            <div className="space-y-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Points of Interest</CardTitle>
                        <CardDescription>Browse and manage all available POIs.</CardDescription>
                    </div>
                    <Button asChild>
                        <Link href="/pois/new">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add POI
                        </Link>
                    </Button>
                    </CardHeader>
                    <CardContent>
                        <Suspense fallback={<Skeleton className="h-[300px] w-full" />}>
                            <POIsTable />
                        </Suspense>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}