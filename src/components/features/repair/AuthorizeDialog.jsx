'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Same credentials prompt OrnaVerse shows before AuthorizeAndPost. */
export default function AuthorizeDialog({ open, onOpenChange, documentNo, isPending, onAuthorize }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    await onAuthorize({ username: username.trim(), password });
    setPassword('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Authorise {documentNo}</DialogTitle>
            <DialogDescription>Enter the OrnaVerse login that is allowed to authorise this receipt.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="repair-auth-user">Username</Label>
            <Input id="repair-auth-user" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} className="h-11" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="repair-auth-pass">Password</Label>
            <Input id="repair-auth-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="h-11" disabled={isPending || !username.trim() || !password}>
              {isPending ? 'Authorising…' : 'Authorise'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
