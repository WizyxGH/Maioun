-- ---------------------------------------------------------------------------
-- L'abonnement d'un compte : ce qui ouvre la candidature automatisée.
--
-- CONSULTER EST LIBRE, AGIR DEMANDE UN COMPTE, CANDIDATER À VOTRE PLACE SE
-- PAIE. Les deux premières marches sont posées ; voici la troisième.
--
-- ON NE STOCKE PAS UN DROIT, ON STOCKE CE QUE STRIPE A DIT. Une colonne
-- « premium = 1 » serait un droit qu'il faudrait penser à retirer : le jour où
-- un paiement échoue, personne ne repasse la ligne à zéro, et l'accès reste
-- ouvert indéfiniment. On garde donc l'état de l'abonnement ET sa date de fin,
-- et le droit se DÉDUIT des deux. Un abonnement expiré cesse de donner accès
-- sans que quiconque ait à intervenir.
--
-- AUCUNE DONNÉE DE CARTE, JAMAIS. Le numéro, la date, le cryptogramme ne
-- touchent ni ce serveur ni cette base : le paiement se fait sur une page
-- hébergée par Stripe, et il ne nous revient qu'un identifiant de client et un
-- état d'abonnement. C'est la raison principale de passer par un prestataire.
-- ---------------------------------------------------------------------------

-- Identifiant du client chez Stripe (`cus_…`). Nul tant qu'il n'a jamais
-- ouvert de page de paiement. C'est lui qui relie un compte à son abonnement,
-- et il survit à un changement d'adresse e-mail.
ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;

-- État tel que Stripe le nomme : active, trialing, past_due, canceled,
-- incomplete… On le recopie SANS l'interpréter, pour que le journal dise la
-- vérité de la source plutôt que notre lecture d'hier.
ALTER TABLE users ADD COLUMN subscription_status TEXT;

-- Fin de la période PAYÉE, en ISO. C'est elle qui fait expirer le droit : un
-- abonnement résilié reste actif jusque-là, et c'est normal — la personne a
-- payé ce mois.
ALTER TABLE users ADD COLUMN subscription_until TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_customer
ON users(stripe_customer_id)
WHERE stripe_customer_id IS NOT NULL;
