/** Le code de confirmation se saisit en un geste, et part de lui-même. */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as Client from '../api/client.js';

const confirm = vi.fn<typeof Client.confirmAccountEmailCode>();
vi.mock('../api/client.js', async (original) => ({
  ...(await original<typeof Client>()),
  confirmAccountEmailCode: (code: string) => confirm(code),
}));

const { EmailCodeForm } = await import('./EmailCodeForm.js');

describe('saisie du code de confirmation', () => {
  it('garde les chiffres d’un code collé avec ses espaces, et l’envoie aussitôt', async () => {
    confirm.mockResolvedValue({ ok: true });
    const onVerified = vi.fn();
    render(<EmailCodeForm onVerified={onVerified} />);

    fireEvent.change(screen.getByLabelText('Code reçu par e-mail'), {
      target: { value: 'Code : 042 517' },
    });

    await waitFor(() => expect(onVerified).toHaveBeenCalled());
    expect(confirm).toHaveBeenCalledWith('042517');
  });

  it('ne limite pas la longueur du champ : un texte collé garde son code', () => {
    // Avec maxLength, le navigateur coupait « Votre code Maïoun : 042517 » avant
    // qu'on n'en extraie les chiffres.
    render(<EmailCodeForm onVerified={vi.fn()} />);
    expect(screen.getByLabelText('Code reçu par e-mail')).not.toHaveAttribute('maxlength');
  });

  it('n’envoie rien avant le sixième chiffre', () => {
    confirm.mockClear();
    render(<EmailCodeForm onVerified={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Code reçu par e-mail'), { target: { value: '04251' } });
    expect(confirm).not.toHaveBeenCalled();
  });

  it('dit pourquoi un code est refusé, et vide le champ pour réessayer', async () => {
    confirm.mockResolvedValue({ ok: false, error: 'Code incorrect ou expiré.' });
    render(<EmailCodeForm onVerified={vi.fn()} />);
    const field = screen.getByLabelText<HTMLInputElement>('Code reçu par e-mail');
    fireEvent.change(field, { target: { value: '111111' } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Code incorrect ou expiré.');
    expect(field.value).toBe('');
  });
});
