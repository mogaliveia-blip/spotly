'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth-user';
import { useParams, useRouter } from 'next/navigation';
import { 
  fetchEventMembers, 
  inviteMemberToEvent, 
  updateEventMemberRole, 
  removeEventMember 
} from '@/lib/data';
import type { EventMemberWithProfile, EventRole } from '@/lib/types';
import { AppLayout } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { UserPlus, Trash2, Loader2, ShieldCheck, Mail, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useEvent } from '@/providers/event-provider';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function EventMembersPage() {
  const { user, role: globalRole } = useAuth();
  const { eventId, event, loading: eventLoading } = useEvent();
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const [members, setMembers] = useState<EventMemberWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<EventRole>('editor');
  const [inviting, setInviting] = useState(false);

  const eventSlug = params.eventSlug as string;
  
  // Permission : Admin local ou Owner global
  const currentUserMembership = members.find(m => m.uid === user?.uid);
  const canManage = currentUserMembership?.role === 'admin' || globalRole === 'owner';

  useEffect(() => {
    if (eventLoading) return;
    
    async function loadMembers() {
      try {
        const data = await fetchEventMembers(eventId);
        setMembers(data);
      } catch (error) {
        toast({ title: 'Erreur', description: 'Impossible de charger les membres.', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    }
    loadMembers();
  }, [eventId, eventLoading, toast]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;

    setInviting(true);
    try {
      await inviteMemberToEvent(eventId, inviteEmail, inviteRole);
      const updatedMembers = await fetchEventMembers(eventId);
      setMembers(updatedMembers);
      setInviteEmail('');
      toast({ title: 'Invitation réussie', description: `L'utilisateur a été ajouté à l'équipe.` });
    } catch (error: any) {
      const message = error.message === 'USER_NOT_FOUND' 
        ? "Aucun utilisateur trouvé avec cet e-mail. Il doit d'abord créer un compte Spotly."
        : "Une erreur est survenue lors de l'invitation.";
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (uid: string, newRole: EventRole) => {
    try {
      await updateEventMemberRole(eventId, uid, newRole);
      setMembers(members.map(m => m.uid === uid ? { ...m, role: newRole } : m));
      toast({ title: 'Rôle mis à jour' });
    } catch (error) {
      toast({ title: 'Erreur', description: 'Impossible de modifier le rôle.', variant: 'destructive' });
    }
  };

  const handleRemove = async (uid: string) => {
    try {
      await removeEventMember(eventId, uid);
      setMembers(members.filter(m => m.uid !== uid));
      toast({ title: 'Membre retiré' });
    } catch (error) {
      toast({ title: 'Erreur', description: 'Impossible de retirer le membre.', variant: 'destructive' });
    }
  };

  if (loading || eventLoading) {
    return (
      <AppLayout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-[400px] w-full rounded-2xl" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="h-full overflow-y-auto p-6 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
             <h1 className="text-3xl font-bold tracking-tight">Gestion de l'Équipe</h1>
             <p className="text-muted-foreground">Membres autorisés à gérer l'événement : <span className="font-bold text-foreground">{event?.name}</span></p>
          </div>
        </div>

        {canManage && (
          <Card className="rounded-[2rem] border-muted/60 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" />
                Inviter un collaborateur
              </CardTitle>
              <CardDescription>
                L'utilisateur doit déjà posséder un compte sur la plateforme Spotly.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Adresse e-mail du collaborateur..." 
                    className="pl-10 rounded-xl h-11"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                  />
                </div>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as EventRole)}>
                  <SelectTrigger className="w-[140px] h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrateur</SelectItem>
                    <SelectItem value="editor">Éditeur</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="submit" disabled={inviting} className="rounded-xl h-11 px-6 font-bold shadow-sm">
                  {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Inviter"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="rounded-[2.5rem] border-muted/60 overflow-hidden shadow-sm">
          <CardHeader className="bg-muted/30">
            <CardTitle className="text-xl font-bold">Liste des membres</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-6">Collaborateur</TableHead>
                  <TableHead>Rôle événement</TableHead>
                  <TableHead className="hidden md:table-cell">Date d'ajout</TableHead>
                  <TableHead className="text-right pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.uid} className="group transition-colors">
                    <TableCell className="pl-6 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 border shadow-sm">
                          <AvatarImage src={member.photoURL || undefined} />
                          <AvatarFallback className="bg-primary/10 text-primary font-bold">
                            {member.displayName?.charAt(0).toUpperCase() || '?'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="font-bold text-sm">{member.displayName}</span>
                          <span className="text-xs text-muted-foreground">{member.email}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {canManage && member.uid !== user?.uid ? (
                        <Select 
                          value={member.role} 
                          onValueChange={(v) => handleRoleChange(member.uid, v as EventRole)}
                        >
                          <SelectTrigger className="w-[130px] h-8 text-xs font-bold rounded-lg border-none bg-muted/50">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Administrateur</SelectItem>
                            <SelectItem value="editor">Éditeur</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline" className="capitalize text-[10px] font-black tracking-widest uppercase">
                          {member.role === 'admin' && <ShieldCheck className="h-3 w-3 mr-1 text-primary" />}
                          {member.role}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                      {member.joinedAt.toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      {canManage && member.uid !== user?.uid && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive transition-colors">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-[2rem]">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Retirer ce membre ?</AlertDialogTitle>
                              <AlertDialogDescription>
                                L'utilisateur <strong>{member.displayName}</strong> n'aura plus accès aux outils de gestion de cet événement.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-xl">Annuler</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => handleRemove(member.uid)}
                                className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Retirer
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
