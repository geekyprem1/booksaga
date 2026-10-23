'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { getBrowserClient } from '@/lib/supabase/client';
import {
  changePasswordAction,
  createPenNameAction,
  deletePenNameAction,
  setAvatarAction,
  updateNameAction,
} from '@/lib/profile/actions';
import { initials } from '@/lib/utils';

export interface PenName {
  id: string;
  name: string;
}

export function ProfileForm({
  userId,
  name,
  email,
  avatarUrl,
  penNames,
}: {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  penNames: PenName[];
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(name);
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  const [newPenName, setNewPenName] = useState('');
  const [savingPen, setSavingPen] = useState(false);
  const [penMessage, setPenMessage] = useState<string | null>(null);

  async function saveName() {
    setSavingName(true);
    setNameMessage(null);
    const response = await updateNameAction({ name: displayName });
    setSavingName(false);
    setNameMessage(response.ok ? 'Saved.' : response.error.message);
    if (response.ok) router.refresh();
  }

  async function uploadAvatar(file: File) {
    setUploading(true);
    setAvatarMessage(null);

    const extension = file.name.split('.').pop()?.toLowerCase() ?? 'png';
    const path = `${userId}/avatar-${Date.now()}.${extension}`;
    const supabase = getBrowserClient();

    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      setUploading(false);
      setAvatarMessage(`Upload failed: ${error.message}`);
      return;
    }

    const saved = await setAvatarAction({ path });
    setUploading(false);
    if (!saved.ok) {
      setAvatarMessage(saved.error.message);
      return;
    }
    setAvatarMessage('Avatar updated.');
    router.refresh();
  }

  async function savePassword() {
    setPasswordMessage(null);
    if (newPassword !== confirmPassword) {
      setPasswordMessage('The new passwords do not match.');
      return;
    }
    setSavingPassword(true);
    const response = await changePasswordAction({ currentPassword, newPassword });
    setSavingPassword(false);
    if (!response.ok) {
      setPasswordMessage(response.error.message);
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordMessage('Password changed.');
  }

  async function addPenName() {
    setSavingPen(true);
    setPenMessage(null);
    const response = await createPenNameAction({ name: newPenName });
    setSavingPen(false);
    if (!response.ok) {
      setPenMessage(response.error.message);
      return;
    }
    setNewPenName('');
    router.refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your name appears on notifications and in the admin panel.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="size-14 rounded-full object-cover" />
            ) : (
              <span className="bg-brand-gradient flex size-14 items-center justify-center rounded-full text-lg font-bold text-white">
                {initials(displayName, email)}
              </span>
            )}
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">
              {uploading ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="size-4" aria-hidden="true" />
              )}
              Upload avatar
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadAvatar(file);
                }}
              />
            </label>
          </div>
          {avatarMessage ? (
            <p className="text-xs text-muted-foreground">{avatarMessage}</p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-name">Name</Label>
            <Input
              id="p-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-email">Email</Label>
            <Input id="p-email" value={email} readOnly disabled />
          </div>

          <div className="flex items-center gap-3">
            <Button type="button" size="sm" onClick={saveName} disabled={savingName}>
              {savingName ? <Loader2 className="animate-spin" aria-hidden="true" /> : null} Save name
            </Button>
            {nameMessage ? <p className="text-xs text-muted-foreground">{nameMessage}</p> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>At least 8 characters.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-current">Current password</Label>
            <Input
              id="p-current"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-new">New password</Label>
            <Input
              id="p-new"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-confirm">Confirm new password</Label>
            <Input
              id="p-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              size="sm"
              onClick={savePassword}
              disabled={savingPassword || !currentPassword || !newPassword}
            >
              {savingPassword ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Change password
            </Button>
            {passwordMessage ? (
              <p className="text-xs text-muted-foreground">{passwordMessage}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Pen names</CardTitle>
          <CardDescription>Saved names appear in the Create Series dropdown.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ul className="flex flex-wrap gap-2">
            {penNames.length === 0 ? (
              <li className="text-sm text-muted-foreground">No pen names yet.</li>
            ) : (
              penNames.map((pen) => (
                <li
                  key={pen.id}
                  className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm"
                >
                  {pen.name}
                  <button
                    type="button"
                    aria-label={`Delete ${pen.name}`}
                    className="text-muted-foreground hover:text-rose-300"
                    onClick={async () => {
                      const response = await deletePenNameAction({ id: pen.id });
                      if (response.ok) router.refresh();
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))
            )}
          </ul>

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-56 flex-1 flex-col gap-1.5">
              <Label htmlFor="p-pen">New pen name</Label>
              <Input
                id="p-pen"
                value={newPenName}
                onChange={(event) => setNewPenName(event.target.value)}
                placeholder="e.g. A. J. Merrow"
              />
            </div>
            <Button
              type="button"
              size="sm"
              onClick={addPenName}
              disabled={savingPen || newPenName.trim().length === 0}
            >
              {savingPen ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Plus aria-hidden="true" />
              )}
              Add
            </Button>
          </div>
          {penMessage ? <p className="text-xs text-rose-300">{penMessage}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
