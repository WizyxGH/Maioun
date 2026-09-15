/**
 * La charte commune des e-mails : couleurs, police, gabarit.
 *
 * ÉCRITE POUR LES MESSAGERIES, PAS POUR UN NAVIGATEUR : tableaux, styles en
 * ligne, aucune feuille externe ni script — Gmail et Outlook retirent le reste.
 * Partagée par les alertes (collecte) et le code de confirmation (Worker), pour
 * qu'un changement de couleur ne se fasse qu'une fois. Aucune dépendance Node.
 */

export const EMAIL_COLORS = {
  primary: '#e00034',
  foreground: '#1a1a2e',
  muted: '#63637a',
  border: '#e6e6ee',
  background: '#f4f5f8',
} as const;

export const EMAIL_FONT = "system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Le message complet autour d'un contenu déjà mis en forme.
 *
 * `preheader` : la ligne que les messageries affichent après l'objet, dans la
 * liste et dans la notification du téléphone. Invisible dans le message ouvert.
 */
export function emailDocument(parts: {
  readonly title: string;
  readonly preheader: string;
  /** Lignes `<tr>` du tableau central, déjà échappées. */
  readonly rows: string;
}): string {
  const { primary, background } = EMAIL_COLORS;
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${escapeHtml(parts.title)}</title></head>
<body style="margin:0;padding:0;background:${background}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(parts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${background}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;font-family:${EMAIL_FONT}">
<tr><td style="padding:0 4px 16px 4px"><div style="font-size:15px;font-weight:700;color:${primary}">🏠 Maïoun</div></td></tr>
${parts.rows}
</table></td></tr></table>
</body></html>`;
}
