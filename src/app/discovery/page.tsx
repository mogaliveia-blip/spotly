import type { Metadata } from 'next';
import { DiscoveryClient } from './discovery-client';

export const metadata: Metadata = {
  title: 'Carte Découverte | Un Instant Ici',
  description: 'Découvrez les événements autour d’un lieu ou dans la zone de votre choix.',
};

export default function DiscoveryPage() {
  return <DiscoveryClient />;
}
